/**
 * gif.js - GIF Writer for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * Modules
 */

var fs = require('fs')
  , EventEmitter = require('events').EventEmitter
  , ExpandingBuffer = require('./buffer')
  , Optimizer = require('./optimize')
  , nextTick = global.setImmediate || process.nextTick;

/**
 * GIF
 */

function GIFWriter(frames, options) {
  var self = this;

  if (!(this instanceof GIFWriter)) {
    return new GIFWriter(frames, options);
  }

  EventEmitter.call(this);

  this.frames = frames;
  this.options = options || {};

  if (this.frames.length > 1) {
    this.options.numPlays = this.options.numPlays || 0;
    this.options.delay = this.options.delay || 100;
  }

  this.optimizer = new Optimizer(this.options);

  if (this.options.stream) {
    this.stream = this.options.stream;
    var event = this.stream.__proto__ === fs.WriteStream.prototype
      ? 'close'
      : 'finish';
    this.stream.on(event, function() {
      self.emit('done', event);
    });
  } else {
    this.offset = 0;
    this.output = new ExpandingBuffer(4096);
  }
}

GIFWriter.prototype.__proto__ = EventEmitter.prototype;

GIFWriter.prototype.writeByte = function(ch) {
  this.write8(ch);
};

GIFWriter.prototype.writeBytes = function(array, offset, length) {
  for (var l = length || array.length, i = offset || 0; i < l; i++) {
    this.write8(array[i]);
  }
};

GIFWriter.prototype.write = function() {
  var i = 0
    , frame;

  this.optimizer.reset();

  this.log('writing head');
  this.writeHead();

  if (this.options.numPlays != null) {
    this.log('writing netscape looping extension');
    this.writeNetscape();
  }

  this.log('writing GCE');
  this.writeGCE();

  while (this.frames.length) {
    this.log('writing frame %d - %d left', i, this.frames.length);
    frame = this.frames.shift();
    this.writeFrame(frame, i++);
  }

  this.log('writing eof');
  this.writeEOF();

  if (this.stream) return;
  return this.output.slice(0, this.offset);
};

GIFWriter.prototype.writeText = function(text) {
  if (this.stream) {
    return this.stream.write(text, 'ascii');
  }
  this.output.write(text, this.offset, 'ascii');
  this.offset += Buffer.byteLength(text);
};

GIFWriter.prototype.write8 = function(ch) {
  if (this.stream) {
    var b = new Buffer(1);
    b.writeUInt8(ch, 0);
    return this.stream.write(b);
  }
  this.output.writeUInt8(ch, this.offset);
  this.offset += 1;
};

GIFWriter.prototype.write16 = function(ch) {
  if (this.stream) {
    var b = new Buffer(2);
    b.writeUInt16LE(ch, 0);
    return this.stream.write(b);
  }
  this.output.writeUInt16LE(ch, this.offset);
  this.offset += 2;
};

GIFWriter.prototype.writeHead = function() {
  var options = this.options
    , flags
    , i
    , color
    , frame
    , gct;

  if (!options.lct) {
    this.log('building gct (may take a while)');

    gct = this.createPalette(this.frames);

    if (gct.overflow <= 256) {
      this.log('gct is only ' + gct.overflow + ' colors: using gct');
      gct.global = true;
    } else {
      this.log('gct has ' + gct.overflow + ' colors: falling back to lct');
      gct.global = false;
    }
  } else {
    gct = [];
  }

  this.writeText('GIF89a');

  frame = this.frames[0];
  if (!frame.data && this.options.convertFrame) {
    frame = this.options.convertFrame(frame);
  }

  this.width = frame.data[0].length;
  this.write16(this.width);
  this.height = frame.data.length;
  this.write16(this.height);
  this.gct = gct.global ? gct : this.createPalette([frame]);
  flags = (this.gct ? 0x80 : 0)
    | (this.gct ? this.gct.size : 0);
  this.write8(flags);
  this.write8(options.bgIndex || 0);
  this.write8(options.aspect || 0);

  if (this.gct) {
    for (i = 0; i < this.gct.length; i++) {
      color = this.gct[i];
      this.write8(color.r);
      this.write8(color.g);
      this.write8(color.b);
    }
  }
};

GIFWriter.prototype.writeNetscape = function() {
  var options = this.options;
  this.write8(0x21); // ext header
  this.write8(0xff); // label - APC
  this.write8(11); // size
  this.writeText('NETSCAPE2.0');
  this.write8(3); // subblock size
  this.write8(1); // subblock id
  this.write16(options.numPlays);
  this.write8(0x00); // block terminator
};

GIFWriter.prototype.writeGCE = function() {
  var options = this.options
    , flags;

  this.write8(0x21); // ext header
  this.write8(0xf9); // label - GCE
  this.write8(0x04); // size
  flags = ((options.disposeMethod & 0x07) << 2)
    | ~~options.useTransparent;
  this.write8(flags);
  this.write16(Math.round((options.delay | 0) / 10));
  this.write8(options.transparentColor | 0);
  this.write8(0x00); // terminator
};

GIFWriter.prototype.writeFrame = function(frame, i) {
  var self = this
    , flags
    , j
    , color
    , imgBuffer
    , numColors
    , codeSize;

  if (!frame.data && this.options.convertFrame) {
    frame = this.options.convertFrame(frame);
  }

  frame = this.optimizer.offset(frame);

  this.write8(0x2c);
  this.write16(frame.left || 0);
  this.write16(frame.top || 0);
  frame.width = frame.data[0].length;
  this.write16(frame.width);
  frame.height = frame.data.length;
  this.write16(frame.height);
  if (this.gct.global) {
    frame.lct = null;
  } else {
    frame.lct = i > 0 ? this.createPalette([frame]) : null;
  }
  flags = (frame.lct ? 0x80 : 0)
    | (frame.ilace ? 0x40 : 0)
    | (frame.lct ? frame.lct.size : 0);
  this.write8(flags);

  if (frame.lct) {
    for (j = 0; j < frame.lct.length; j++) {
      color = frame.lct[j];
      this.write8(color.r);
      this.write8(color.g);
      this.write8(color.b);
    }
  }

  imgBuffer = new Buffer(frame.data.reduce(function(out, line) {
    return out.concat(line.map(function(pixel) {
      return self.lookupPalette(frame.lct || self.gct, pixel);
    }));
  }, []));

  /**
   * From: https://github.com/deanm/omggif
   * omggif is a JavaScript implementation of a GIF 89a encoder and decoder.
   * https://github.com/deanm/omggif
   *
   * (c) Dean McNamee <dean@gmail.com>, 2013.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a
   * copy of this software and associated documentation files (the "Software"),
   * to deal in the Software without restriction, including without limitation
   * the rights to use, copy, modify, merge, publish, distribute, sublicense,
   * and/or sell copies of the Software, and to permit persons to whom the
   * Software is furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
   * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
   * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
   * DEALINGS IN THE SOFTWARE.
   */
  numColors = (frame.lct || this.gct).length;
  if (numColors < 2 || numColors > 256 || (numColors & (numColors - 1))) {
    throw new Error('Invalid code/color length, must be power of 2 and 2 .. 256: ' + numColors);
  }
  codeSize = 0;
  while (numColors >>= 1) ++codeSize;
  numColors = 1 << codeSize;
  codeSize = codeSize < 2 ? 2 : codeSize

  this.compress(frame, imgBuffer, codeSize);
};

GIFWriter.prototype.compress = function(frame, imgBuffer, codeSize) {
  var enc = new LZWEncoder(frame.width, frame.height, imgBuffer, codeSize);
  enc.encode(this);
};

GIFWriter.prototype.writeEOF = function() {
  var self = this;

  this.write8(0x3b);

  if (this.stream && this.stream !== process.stdout) {
    try {
      this.stream.end();
    } catch (e) {
      nextTick(function() {
        self.emit('done', 'eof');
      });
    }
  } else {
    nextTick(function() {
      self.emit('done', 'eof');
    });
  }
};

GIFWriter.prototype.createPalette = function(frames) {
  var lookup = {}
    , overflow = 0
    , i = 0
    , table;

  frames.forEach(function(frame, frameIndex) {
    if (!frame.data && this.options.convertFrame) {
      frame = this.options.convertFrame(frame);
    }
    if (frames.length > 1) {
      if (frameIndex % 30 === 0) {
        this.out('.');
      }
    }
    table = frame.data.reduce(function(table, line) {
      var colors = line.reduce(function(out, pixel) {
        [pixel, pixel.fg].forEach(function(pixel) {
          if (!pixel) return;

          var hash = (pixel.r << 16)
            | (pixel.g << 8)
            | (pixel.b << 0);

          if (lookup[hash] != null) {
            return;
          }

          if (i + 1 > 256) {
            overflow++;
            lookup[hash] = 1;
            return;
          }

          lookup[hash] = i;
          i++;
          overflow = i;

          out.push({
            r: pixel.r,
            g: pixel.g,
            b: pixel.b,
            a: 255
          });
        });
        return out;
      }, []);
      return table.concat(colors);
    }, table || []);
  }, this);

  if (frames.length > 1) {
    this.out('\n');
  }

  while (table.length < 2 || (table.length & (table.length - 1))) {
    table.push({ r: 0, g: 0, b: 0, a: 255 });
    if (lookup[0] == null) lookup[0] = table.length - 1;
  }

  table.size = 1;
  while (table.size < 8 && (1 << table.size) !== table.length) {
    table.size++;
  }
  table.size = (table.size - 1) & 0x07;

  table.lookup = lookup;

  table.overflow = overflow;

  return table;
};

GIFWriter.prototype.lookupPalette = function(table, pixel) {
  return table.lookup[(pixel.r << 16) | (pixel.g << 8) | (pixel.b << 0)];
};

GIFWriter.prototype.log = function() {
  if (!this.options.log) return;
  return console.error.apply(console, arguments);
};

GIFWriter.prototype.out = function(text) {
  if (!this.options.log) return;
  return process.stderr.write(text);
};

/**
 * LZWEncoder.js
 *
 * From:
 *   https://github.com/eugeneware/gifencoder/blob/master/lib/LZWEncoder.js
 *   https://github.com/eugeneware/gifencoder/blob/master/LICENSE
 *
 * Copyright (c) 2013, Eugene Ware
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of Eugene Ware nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY EUGENE WARE ''AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL EUGENE WARE BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Authors
 * Kevin Weiner (original Java version - kweiner@fmsware.com)
 * Thibault Imbert (AS3 version - bytearray.org)
 * Johan Nordberg (JS version - code@johan-nordberg.com)
 *
 * Acknowledgements
 * GIFCOMPR.C - GIF Image compression routines
 * Lempel-Ziv compression based on 'compress'. GIF modifications by
 * David Rowley (mgardi@watdcsu.waterloo.edu)
 * GIF Image compression - modified 'compress'
 * Based on: compress.c - File compression ala IEEE Computer, June 1984.
 * By Authors: Spencer W. Thomas (decvax!harpo!utah-cs!utah-gr!thomas)
 * Jim McKie (decvax!mcvax!jim)
 * Steve Davies (decvax!vax135!petsd!peora!srd)
 * Ken Turkowski (decvax!decwrl!turtlevax!ken)
 * James A. Woods (decvax!ihnp4!ames!jaw)
 * Joe Orost (decvax!vax135!petsd!joe)
 */

var EOF = -1;
var BITS = 12;
var HSIZE = 5003; // 80% occupancy
var masks = [0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F,
             0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF,
             0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF];

function LZWEncoder(width, height, pixels, colorDepth) {
  var initCodeSize = Math.max(2, colorDepth);

  var accum = new Uint8Array(256);
  var htab = new Int32Array(HSIZE);
  var codetab = new Int32Array(HSIZE);

  var cur_accum, cur_bits = 0;
  var a_count;
  var free_ent = 0; // first unused entry
  var maxcode;

  // block compression parameters -- after all codes are used up,
  // and compression rate changes, start over.
  var clear_flg = false;

  // Algorithm: use open addressing double hashing (no chaining) on the
  // prefix code / next character combination. We do a variant of Knuth's
  // algorithm D (vol. 3, sec. 6.4) along with G. Knott's relatively-prime
  // secondary probe. Here, the modular division first probe is gives way
  // to a faster exclusive-or manipulation. Also do block compression with
  // an adaptive reset, whereby the code table is cleared when the compression
  // ratio decreases, but after the table fills. The variable-length output
  // codes are re-sized at this point, and a special CLEAR code is generated
  // for the decompressor. Late addition: construct the table according to
  // file size for noticeable speed improvement on small files. Please direct
  // questions about this implementation to ames!jaw.
  var g_init_bits, ClearCode, EOFCode;

  // Add a character to the end of the current packet, and if it is 254
  // characters, flush the packet to disk.
  function char_out(c, outs) {
    accum[a_count++] = c;
    // Could use 255?
    if (a_count >= 254) flush_char(outs);
  }

  // Clear out the hash table
  // table clear for block compress
  function cl_block(outs) {
    cl_hash(HSIZE);
    free_ent = ClearCode + 2;
    clear_flg = true;
    output(ClearCode, outs);
  }

  // Reset code table
  function cl_hash(hsize) {
    for (var i = 0; i < hsize; ++i) htab[i] = -1;
  }

  function compress(init_bits, outs) {
    var fcode, c, i, ent, disp, hsize_reg, hshift;

    // Set up the globals: g_init_bits - initial number of bits
    g_init_bits = init_bits;

    // Set up the necessary values
    clear_flg = false;
    n_bits = g_init_bits;
    maxcode = MAXCODE(n_bits);

    ClearCode = 1 << (init_bits - 1);
    EOFCode = ClearCode + 1;
    free_ent = ClearCode + 2;

    a_count = 0; // clear packet

    ent = nextPixel();

    hshift = 0;
    for (fcode = HSIZE; fcode < 65536; fcode *= 2) ++hshift;
    hshift = 8 - hshift; // set hash code range bound
    hsize_reg = HSIZE;
    cl_hash(hsize_reg); // clear hash table

    output(ClearCode, outs);

    outer_loop: while ((c = nextPixel()) != EOF) {
      fcode = (c << BITS) + ent;
      i = (c << hshift) ^ ent; // xor hashing
      if (htab[i] === fcode) {
        ent = codetab[i];
        continue;
      } else if (htab[i] >= 0) { // non-empty slot
        disp = hsize_reg - i; // secondary hash (after G. Knott)
        if (i === 0) disp = 1;
        do {
          if ((i -= disp) < 0) i += hsize_reg;
          if (htab[i] === fcode) {
            ent = codetab[i];
            continue outer_loop;
          }
        } while (htab[i] >= 0);
      }
      output(ent, outs);
      ent = c;
      if (free_ent < 1 << BITS) {
        codetab[i] = free_ent++; // code -> hashtable
        htab[i] = fcode;
      } else {
        cl_block(outs);
      }
    }

    // Put out the final code.
    output(ent, outs);
    output(EOFCode, outs);
  }

  function encode(outs) {
    outs.writeByte(initCodeSize); // write "initial code size" byte
    remaining = width * height; // reset navigation variables
    curPixel = 0;
    compress(initCodeSize + 1, outs); // compress and write the pixel data
    outs.writeByte(0); // write block terminator
  }

  // Flush the packet to disk, and reset the accumulator
  function flush_char(outs) {
    if (a_count > 0) {
      outs.writeByte(a_count);
      outs.writeBytes(accum, 0, a_count);
      a_count = 0;
    }
  }

  function MAXCODE(n_bits) {
    return (1 << n_bits) - 1;
  }

  // Return the next pixel from the image
  function nextPixel() {
    if (remaining === 0) return EOF;
    --remaining;
    var pix = pixels[curPixel++];
    return pix & 0xff;
  }

  function output(code, outs) {
    cur_accum &= masks[cur_bits];

    if (cur_bits > 0) cur_accum |= (code << cur_bits);
    else cur_accum = code;

    cur_bits += n_bits;

    while (cur_bits >= 8) {
      char_out((cur_accum & 0xff), outs);
      cur_accum >>= 8;
      cur_bits -= 8;
    }

    // If the next entry is going to be too big for the code size,
    // then increase it, if possible.
    if (free_ent > maxcode || clear_flg) {
      if (clear_flg) {
        maxcode = MAXCODE(n_bits = g_init_bits);
        clear_flg = false;
      } else {
        ++n_bits;
        if (n_bits == BITS) maxcode = 1 << BITS;
        else maxcode = MAXCODE(n_bits);
      }
    }

    if (code == EOFCode) {
      // At EOF, write the rest of the buffer.
      while (cur_bits > 0) {
        char_out((cur_accum & 0xff), outs);
        cur_accum >>= 8;
        cur_bits -= 8;
      }
      flush_char(outs);
    }
  }

  this.encode = encode;
}

/**
 * Expose
 */

module.exports = GIFWriter;

/**
 * png.js - PNG Writer for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * Modules
 */

var fs = require('fs')
  , EventEmitter = require('events').EventEmitter
  , zlib = require('zlib')
  , ExpandingBuffer = require('./buffer')
  , Optimizer = require('./optimize')
  , nextTick = global.setImmediate || process.nextTick;

/**
 * PNG
 */

function PNGWriter(frames, options) {
  var self = this;

  if (!(this instanceof PNGWriter)) {
    return new PNGWriter(frames, options);
  }

  EventEmitter.call(this);

  this.frames = frames;
  this.options = options || {};

  this.optimizer = new Optimizer(this.options);

  this.cbuff = new ExpandingBuffer(256);
  this.seq = 0;
  this.bitDepth = 8;
  this.coffset = -1;

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

PNGWriter.prototype.__proto__ = EventEmitter.prototype;

PNGWriter.prototype.write = function() {
  var frameIndex = 0
    , frame;

  this.optimizer.reset();

  if (this.options.usePalette !== false) {
    this.log('building palette (may take a while)');
    try {
      this.palette = this.createPalette();
    } catch (e) {
      this.log(e.message);
    }
  }

  this.log('writing head');
  this.writeHead();

  this.log('writing palette');
  this.writePalette();

  this.log('writing trans palette');
  this.writeTrans();

  if (this.frames.length > 1) {
    this.log('writing actl');
    this.writeACTL();
    this.log('writing idat');
    frame = this.frames[(this.frames.length - 1) / 2 | 0];
    this.writeIDAT(frame);
  }

  if (this.frames.length > 1) {
    while (this.frames.length) {
      this.log('writing frame %d - %d left', frameIndex, this.frames.length);
      frame = this.frames.shift();
      this.writeFrame(frame, frameIndex++);
    }
  } else {
    this.log('writing idat');
    frame = this.frames.shift();
    this.writeIDAT(frame);
  }

  this.log('writing eof');
  this.writeEOF();

  if (this.stream) return;
  return this.output.slice(0, this.offset);
};

PNGWriter.prototype.writeText = function(text) {
  if (this.coffset !== -1) {
    this.cbuff.write(text, this.coffset, 'ascii');
    this.coffset += Buffer.byteLength(text);
  }

  if (this.stream) {
    return this.stream.write(text, 'ascii');
  }
  this.output.write(text, this.offset, 'ascii');
  this.offset += Buffer.byteLength(text);
};

PNGWriter.prototype.write8 = function(ch) {
  if (this.coffset !== -1) {
    this.cbuff.writeUInt8(ch, this.coffset);
    this.coffset += 1;
  }

  if (this.stream) {
    var b = new Buffer(1);
    b.writeUInt8(ch, 0);
    return this.stream.write(b);
  }
  this.output.writeUInt8(ch, this.offset);
  this.offset += 1;
};

PNGWriter.prototype.write16 = function(ch) {
  if (this.coffset !== -1) {
    this.cbuff.writeUInt16BE(ch, this.coffset);
    this.coffset += 2;
  }

  if (this.stream) {
    var b = new Buffer(2);
    b.writeUInt16BE(ch, 0);
    return this.stream.write(b);
  }
  this.output.writeUInt16BE(ch, this.offset);
  this.offset += 2;
};

PNGWriter.prototype.write32 = function(ch) {
  if (this.coffset !== -1) {
    this.cbuff.writeUInt32BE(ch, this.coffset);
    this.coffset += 4;
  }

  if (this.stream) {
    var b = new Buffer(4);
    b.writeUInt32BE(ch, 0);
    return this.stream.write(b);
  }
  this.output.writeUInt32BE(ch, this.offset);
  this.offset += 4;
};

PNGWriter.prototype.createPalette = function() {
  var self = this
    , lookup = {}
    , i = 0
    , table;

  this.frames.forEach(function(frame, frameIndex) {
    if (!frame.data && this.options.convertFrame) {
      frame = this.options.convertFrame(frame);
    }
    if (frameIndex % 30 === 0) {
      this.out('.');
    }
    table = frame.data.reduce(function(table, line) {
      var colors = line.reduce(function(out, pixel) {
        [pixel, pixel.fg].forEach(function(pixel) {
          if (!pixel) return;

          var hash = (pixel.r << 24)
            | (pixel.g << 16)
            | (pixel.b << 8)
            | (pixel.a << 0);

          if (lookup[hash] != null) {
            return;
          }

          if (i + 1 > 0xffffffff) {
            self.bitDepth = 8;
            throw new Error('palette building failed. switching to rgba.');
          } else if (i + 1 > 0xffff) {
            self.bitDepth = 32;
          } else if (i + 1 > 0xff) {
            self.bitDepth = 16;
          }

          lookup[hash] = i;
          i++;

          out.push({
            r: pixel.r,
            g: pixel.g,
            b: pixel.b,
            a: pixel.a
          });
        });
        return out;
      }, []);
      return table.concat(colors);
    }, table || []);
  }, this);

  this.out('\n');

  if (this.bitDepth === 16) {
    Object.keys(lookup).forEach(function(hash) {
      var i = lookup[hash];
      lookup[hash] = [(i >> 8) & 0xff, i & 0xff];
    });
  } else if (this.bitDepth === 32) {
    Object.keys(lookup).forEach(function(hash) {
      var i = lookup[hash];
      lookup[hash] = [(i >> 24) & 0xff, (i >> 16) & 0xff, (i >> 8) & 0xff, i & 0xff];
    });
  }

  table.lookup = lookup;

  return table;
};

PNGWriter.prototype.lookupPalette = function(pixel) {
  var hash = (pixel.r << 24)
    | (pixel.g << 16)
    | (pixel.b << 8)
    | (pixel.a << 0);
  return this.palette.lookup[hash];
};

PNGWriter.prototype.startCRC = function() {
  this.coffset = 0;
};

PNGWriter.prototype.endCRC = function() {
  var crc = this.crc(this.cbuff.buffer.slice(0, this.coffset));
  this.coffset = -1;
  if (this.stream) {
    var b = new Buffer(4);
    b.writeInt32BE(crc);
    return this.stream.write(b);
  }
  this.output.writeInt32BE(crc);
  this.offset += 4;
};

PNGWriter.prototype.writeHead = function() {
  var frame = this.frames[0];
  if (!frame.data && this.options.convertFrame) {
    frame = this.options.convertFrame(frame);
    // this.frames[0] = frame;
  }

  this.write32(0x89504e47);
  this.write32(0x0d0a1a0a);

  this.write32(4 + 4 + 1 + 1 + 1 + 1 + 1); // size
  this.startCRC();
  this.writeText('IHDR'); // type
  this.write32(frame.data[0].length); // width
  this.write32(frame.data.length); // height
  this.write8(this.bitDepth || 8); // bit depth
  if (this.palette) {
    this.write8(3); // color type
  } else {
    this.write8(6); // color type
  }
  this.write8(0); // compression
  this.write8(0); // filter
  this.write8(0); // interlace
  this.endCRC();
};

PNGWriter.prototype.writePalette = function() {
  var i
    , color;

  if (!this.palette) return;

  this.write32(this.palette.length * 3); // size
  this.startCRC();
  this.writeText('PLTE'); // type
  for (i = 0; i < this.palette.length; i++) {
    color = this.palette[i];
    this.write8(color.r);
    this.write8(color.g);
    this.write8(color.b);
  }
  this.endCRC();
};

PNGWriter.prototype.writeTrans = function() {
  var i
    , color;

  if (!this.palette) return;

  this.write32(this.palette.length * 1); // size
  this.startCRC();
  this.writeText('tRNS'); // type
  for (i = 0; i < this.palette.length; i++) {
    color = this.palette[i];
    this.write8(color.a);
  }
  this.endCRC();
};

PNGWriter.prototype.writeACTL = function() {
  this.write32(4 + 4); // size
  this.startCRC();
  this.writeText('acTL'); // type
  this.write32(this.frames.length); // num frames
  this.write32(this.options.numPlays || 0); // num plays
  this.endCRC();
};

PNGWriter.prototype.writeIDAT = function(frame) {
  var self = this
    , data
    , i;

  if (!frame.data && this.options.convertFrame) {
    frame = this.options.convertFrame(frame);
  }

  // if (!frame.optimized) {
  //   frame = this.optimizer.offset(frame);
  // }

  data = this.compress(new Buffer(frame.data.reduce(function(out, line) {
    return out.concat(0, line.reduce(function(out, pixel) {
      if (self.palette) {
        return out.concat(self.lookupPalette(pixel));
      } else {
        return out.concat([pixel.r, pixel.g, pixel.b, pixel.a]);
      }
    }, []));
  }, [])));

  this.write32(data.length); // size
  this.startCRC();
  this.writeText('IDAT'); // type
  for (i = 0; i < data.length; i++) {
    this.write8(data[i]);
  }
  this.endCRC();
};

PNGWriter.prototype.writeFrame = function(frame, frameIndex) {
  var self = this
    , data
    , j;

  if (!frame.data && this.options.convertFrame) {
    frame = this.options.convertFrame(frame);
  }

  frame = this.optimizer.offset(frame);

  this.write32(4 + 4 + 4 + 4 + 4 + 2 + 2 + 1 + 1); // size
  this.startCRC();
  this.writeText('fcTL'); // type
  this.write32(this.seq++); // seqNumber
  this.write32(frame.data[0].length); // width
  this.write32(frame.data.length); // height
  this.write32(frame.left || 0); // left
  this.write32(frame.top || 0); // top
  this.write16(this.options.delay || 100); // delay numerator
  this.write16(1000); // delay denominator
  this.write8(0); // dispose op
  this.write8(0); // blend op
  this.endCRC();

  // if (frameIndex === 0) {
  //   this.log('writing idat');
  //   this.writeIDAT(frame);
  //   return;
  // }

  data = this.compress(new Buffer(frame.data.reduce(function(out, line) {
    return out.concat(0, line.reduce(function(out, pixel) {
      if (self.palette) {
        return out.concat(self.lookupPalette(pixel));
      } else {
        return out.concat([pixel.r, pixel.g, pixel.b, pixel.a]);
      }
    }, []));
  }, [])));

  this.write32(4 + data.length);
  this.startCRC();
  this.writeText('fdAT');
  this.write32(this.seq++); // seqNumber
  for (j = 0; j < data.length; j++) {
    this.write8(data[j]);
  }
  this.endCRC();
};

PNGWriter.prototype.writeEOF = function(frame) {
  var self = this;

  this.write32(0); // size
  this.startCRC();
  this.writeText('IEND'); // type
  this.endCRC();

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

PNGWriter.prototype.log = function() {
  if (!this.options.log) return;
  return console.error.apply(console, arguments);
};

PNGWriter.prototype.out = function(text) {
  if (!this.options.log) return;
  return process.stderr.write(text);
};

/**
 * node-crc
 * https://github.com/alexgorbatchev/node-crc
 * https://github.com/alexgorbatchev/node-crc/blob/master/LICENSE
 *
 * The MIT License (MIT)
 *
 * Copyright 2014 Alex Gorbatchev
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

PNGWriter.prototype.crc = (function() {
  var crcTable = [
    0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
    0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
    0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
    0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
    0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
    0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
    0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
    0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
    0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
    0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
    0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
    0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
    0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
    0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
    0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
    0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
    0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
    0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
    0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
    0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
    0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
    0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
    0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
    0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
    0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
    0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
    0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
    0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
    0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
    0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
    0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
    0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
    0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
    0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
    0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
    0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
    0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
    0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
    0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
    0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
    0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
    0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
    0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d
  ];

  return function crc32(buf) {
    var crc = -1;
    for (var i = 0, len = buf.length; i < len; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ -1;
  };
})();

PNGWriter.prototype.compress = function(data) {
  return zlib.deflateSync(data);
};

/**
 * Expose
 */

module.exports = PNGWriter;

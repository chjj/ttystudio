/**
 * cell.js - SGR to GIF Writer for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * Modules
 */

var fs = require('fs')
  , EventEmitter = require('events').EventEmitter
  , blessed = require('blessed')
  , GIFWriter = require('./gif')
  , PNGWriter = require('./png');

/**
 * SGR
 */

function SGRWriter(frames, options) {
  var self = this;

  if (!(this instanceof SGRWriter)) {
    return new SGRWriter(frames, options);
  }

  EventEmitter.call(this);

  this.options = options || {};
  this.options.convertFrame = this.convertFrame.bind(this);

  if (this.options.png) {
    this.writer = new PNGWriter(frames, this.options);
  } else {
    this.writer = new GIFWriter(frames, this.options);
  }

  this.writer.on('done', function(event) {
    self.emit('done', event);
  });

  this.ratio = this.options.ratio || {
    width: 8,
    height: 15
  };

  this.options.font = this.options.font
    || __dirname + '/../fonts/ter-u14n.json';
  this.options.fontBold = this.options.fontBold
    || __dirname + '/../fonts/ter-u14b.json';

  this.font = this.loadFont(this.options.font);
  this.fontBold = this.loadFont(this.options.fontBold);
}

SGRWriter.prototype.__proto__ = EventEmitter.prototype;

SGRWriter.prototype.write = function() {
  return this.writer.write();
};

SGRWriter.prototype.convertFrame = function(frame) {
  if (!frame.data) {
    if (typeof frame === 'string' || typeof frame[0] === 'string') {
      frame = this.parseSGR(frame);
    }
    if (typeof frame[0][0][1] === 'string') {
      frame = this.parseCellmap(frame);
    }
  }
  return frame;
};

SGRWriter.prototype.parseSGR = function(ANSI) {
  var dattr = (0 << 18) | (0x1ff << 9) | (0x1ff < 0)
    , attr = dattr
    , cellmap
    , i
    , line
    , cline
    , j
    , ch
    , c;

  if (typeof ANSI === 'string') {
    ANSI = ANSI.trim().split('\n');
  }

  cellmap = [];
  for (i = 0; i < ANSI.length; i++) {
    line = ANSI[i];
    cline = [];
    for (j = 0; j < line.length; j++) {
      ch = line[j];
      while (ch === '\x1b') {
        if (c = /^\x1b\[[\d;]*m/.exec(line.substring(j))) {
          attr = blessed.screen.prototype.attrCode(c[0], attr, dattr);
          j += c[0].length;
          ch = line[j];
        } else {
          break;
        }
      }
      if (ch) {
        cline.push([attr, ch]);
      }
    }
    cellmap.push(cline);
  }

  return cellmap;
};

SGRWriter.prototype.parseCellmap = function(cellmap) {
  var bmp = []
    , chs = []
    , i
    , cline
    , bline
    , j
    , cell
    , attr
    , ch
    , b
    , f
    , bg
    , fg
    , tmp
    , x
    , y
    , cb
    , ci
    , cc;

  for (i = 0; i < cellmap.length; i++) {
    cline = cellmap[i];
    bline = [];

    for (j = 0; j < cline.length; j++) {
      cell = cline[j];
      attr = cell[0];
      ch = cell[1];

      b = attr & 0x1ff;
      f = (attr >> 9) & 0x1ff;
      bg = blessed.colors.vcolors[b];
      fg = blessed.colors.vcolors[f];

      if (b === 0x1ff) bg = [0, 0, 0];
      if (f === 0x1ff) fg = [255, 255, 255];

      if (ch !== ' ' && !this.font[ch]) {
        tmp = bg;
        bg = fg;
        fg = tmp;
      }

      if (ch !== ' ' && this.font[ch]) {
        chs.push({
          x: j * this.ratio.width,
          y: i * this.ratio.height,
          ch: ch,
          r: fg[0],
          g: fg[1],
          b: fg[2],
          a: 255,
          invisible: !!((attr >> 18) & 16),
          inverse: !!((attr >> 18) & 8),
          blink: !!((attr >> 18) & 4),
          underline: !!((attr >> 18) & 2),
          bold: !!((attr >> 18) & 1)
        });
      }

      for (x = 0; x < this.ratio.width; x++) {
        bline.push({
          r: bg[0],
          g: bg[1],
          b: bg[2],
          a: 255,
          ch: ch,
          fg: { r: fg[0], g: fg[1], b: fg[2], a: 255 }
        });
      }
    }

    for (y = 0; y < this.ratio.height; y++) {
      cb = [];
      for (ci = 0; ci < bline.length; ci++) {
        cc = bline[ci];
        cb.push({
          r: cc.r,
          g: cc.g,
          b: cc.b,
          a: cc.a,
          ch: cc.ch,
          fg: { r: cc.fg.r, g: cc.fg.g, b: cc.fg.b, a: cc.fg.a }
        });
      }
      bmp.push(cb);
    }
  }

  bmp = this.addChars(bmp, chs);

  if (this.options.border) {
    bmp = this.addBorder(bmp, this.options.border);
  }

  return {
    left: 0,
    top: 0,
    data: bmp
  };
};

SGRWriter.prototype.addBorder = function(bmp, options) {
  var options = options || this.options.border || {}
    , width = options.width
    , color = options.color || {}
    , tline
    , bline
    , w
    , x
    , y;

  width = width != null ? width : 1;
  color.r = color.r != null ? color.r : 255;
  color.g = color.g != null ? color.g : 255;
  color.b = color.b != null ? color.b : 255;
  color.a = color.a != null ? color.a : 255;

  // top and bottom
  for (w = 0; w < width; w++) {
    tline = [];
    bline = [];
    for (x = 0; x < bmp[0].length; x++) {
      tline.push({
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
        ch: ' ',
        fg: { r: color.r, g: color.g, b: color.b, a: color.a }
      });
      bline.push({
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
        ch: ' ',
        fg: { r: color.r, g: color.g, b: color.b, a: color.a }
      });
    }
    bmp.unshift(tline);
    bmp.push(bline);
  }

  // left/right
  for (w = 0; w < width; w++) {
    for (y = 0; y < bmp.length; y++) {
      bmp[y].unshift({
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
        ch: ' ',
        fg: { r: color.r, g: color.g, b: color.b, a: color.a }
      });
      bmp[y].push({
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
        ch: ' ',
        fg: { r: color.r, g: color.g, b: color.b, a: color.a }
      });
    }
  }

  return bmp;
};

SGRWriter.prototype.loadFont = function(filename) {
  var self = this
    , data
    , font;

  data = JSON.parse(fs.readFileSync(filename, 'utf8'));

  this.ratio.width = data.width;
  this.ratio.height = data.height;

  function convertLetter(ch, lines) {
    var line, i;

    while (lines.length > self.ratio.height) {
      lines.shift();
      lines.pop();
    }

    lines = lines.map(function(line) {
      var chs = line.split('');
      chs = chs.map(function(ch) {
        return ch === ' ' ? 0 : 1;
      });
      while (chs.length < self.ratio.width) {
        chs.push(0);
      }
      return chs;
    });

    while (lines.length < self.ratio.height) {
      line = [];
      for (i = 0; i < self.ratio.width; i++) {
        line.push(0);
      }
      lines.push(line);
    }

    return lines;
  }

  font = Object.keys(data.glyphs).reduce(function(out, ch) {
    var lines = data.glyphs[ch].map;
    out[ch] = convertLetter(ch, lines);
    return out;
  }, {});

  delete font[' '];

  return font;
};

SGRWriter.prototype.convertCharToPixels = function(x, y, cell, pixel) {
  var font = cell.bold ? this.fontBold : this.font
    , coord;

  if (!font[cell.ch]) return pixel;

  coord = font[cell.ch][y][x];

  if (coord === 0) return pixel;

  return { r: cell.r, g: cell.g, b: cell.b, a: 255, ch: cell.ch, fg: pixel.fg };
};

SGRWriter.prototype.addChars = function(bmp, chs) {
  var i
    , cell
    , x
    , y
    , cx
    , cy;

  for (i = 0; i < chs.length; i++) {
    cell = chs[i];
    x = cell.x;
    y = cell.y;

    for (cx = 0; cx < this.ratio.width; cx++) {
      for (cy = 0; cy < this.ratio.height; cy++) {
        bmp[y + cy][x + cx] = this.convertCharToPixels(cx, cy, cell, bmp[y + cy][x + cx]);
      }
    }
  }

  return bmp;
};

SGRWriter.prototype.log = function() {
  if (!this.options.log) return;
  return console.error.apply(console, arguments);
};

/**
 * Expose
 */

exports = SGRWriter;
exports.SGRWriter = SGRWriter;
exports.GIFWriter = GIFWriter;
exports.PNGWriter = GIFWriter;
module.exports = exports;

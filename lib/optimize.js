/**
 * optimize.js - frame optimizer for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * Optimizer
 */

function Optimizer(options) {
  this.options = options || {};
}

Optimizer.prototype.reset = function(frame) {
  delete this.damage;
};

Optimizer.prototype.offset = function(frame) {
  var bmp = frame.data || frame
    , left = null
    , top = null
    , right = null
    , bottom = null
    , x
    , y
    , cell
    , hash;

  if (!this.damage) {
    this.damage = [];
    for (y = 0; y < bmp.length; y++) {
      bline = [];
      for (x = 0; x < bmp[y].length; x++) {
        bline.push(null);
      }
      this.damage.push(bline);
    }
  }

  for (y = 0; y < bmp.length; y++) {
    cline = bmp[y];
    for (x = 0; x < cline.length; x++) {
      cell = cline[x];
      hash = (cell.r << 24) | (cell.g << 16) | (cell.b << 8) | (cell.a << 0);
      if (this.damage[y][x] !== hash) {
        if (left === null) left = x;
        else if (x < left) left = x;
        if (top === null) top = y;
      }
    }
  }

  for (y = bmp.length - 1; y >= 0; y--) {
    cline = bmp[y];
    for (x = cline.length - 1; x >= 0; x--) {
      cell = cline[x];
      hash = (cell.r << 24) | (cell.g << 16) | (cell.b << 8) | (cell.a << 0);
      if (this.damage[y][x] !== hash) {
        if (right === null) right = x + 1;
        else if (x + 1 > right) right = x + 1;
        if (bottom === null) bottom = y + 1;
      }
      this.damage[y][x] = hash;
    }
  }

  if (left === null) left = 0;
  if (right === null) right = 1;

  if (top === null) top = 0;
  if (bottom === null) bottom = 1;

  if (left > right) {
    throw new Error('optimizer failed: left > right');
  }

  if (top > bottom) {
    throw new Error('optimizer failed: top > bottom');
  }

  bmp = bmp.slice(top, bottom);
  for (y = 0; y < bmp.length; y++) {
    bmp[y] = bmp[y].slice(left, right);
  }

  this.log('frame dimensions: %dx%d', bmp[0].length, bmp.length);

  return {
    left: left,
    top: top,
    data: bmp,
    optimized: true
  };
};

Optimizer.prototype.log = function() {
  if (!this.options.log) return;
  return console.error.apply(console, arguments);
};

/**
 * Expose
 */

module.exports = Optimizer;

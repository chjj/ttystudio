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
  // XXX Broken, see chjj/ttystudio#10
  return frame;

  var bmp = frame.data || frame
    , left = -1
    , top = -1
    , right = -1
    , bottom = -1
    , x
    , y
    , cell
    , hash;

  if (!this.damage) {
    this.damage = [];
    for (y = 0; y < bmp.length; y++) {
      bline = [];
      cline = bmp[y];
      for (x = 0; x < bmp[y].length; x++) {
        cell = cline[x];
        hash = (cell.r << 16) | (cell.g << 8) | (cell.b << 0);
        bline.push(-1);
      }
      this.damage.push(bline);
    }
  }

  for (y = 0; y < bmp.length; y++) {
    cline = bmp[y];
    for (x = 0; x < cline.length; x++) {
      cell = cline[x];
      hash = (cell.r << 16) | (cell.g << 8) | (cell.b << 0);
      if (this.damage[y][x] !== hash) {
        if (left === -1) left = x;
        else if (x < left) left = x;
        if (top === -1) top = y;
      }
    }
  }

  for (y = bmp.length - 1; y >= 0; y--) {
    cline = bmp[y];
    for (x = cline.length - 1; x >= 0; x--) {
      cell = cline[x];
      hash = (cell.r << 16) | (cell.g << 8) | (cell.b << 0);
      if (this.damage[y][x] !== hash) {
        if (right === -1) right = x + 1;
        else if (x + 1 > right) right = x + 1;
        if (bottom === -1) bottom = y + 1;
      }
      this.damage[y][x] = hash;
    }
  }

  if (left === -1) left = 0;
  if (right === -1) right = 1;

  if (top === -1) top = 0;
  if (bottom === -1) bottom = 1;

  if (left > right) {
    // right = left + 1;
    throw new Error('left > right');
  }
  if (top > bottom) {
    // bottom = top + 1;
    throw new Error('top > bottom');
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

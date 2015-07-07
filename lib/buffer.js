/**
 * buffer.js - expanding buffer for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * ExpandingBuffer
 */

function ExpandingBuffer() {
  var self = this;
  if (!(self instanceof ExpandingBuffer)) {
    self = Object.create(ExpandingBuffer.prototype);
  }
  if (Buffer.isBuffer(arguments[0])) {
    self.buffer = arguments[0];
  } else {
    self.buffer = Buffer.apply(null, arguments);
  }
  return self;
}

Object.keys(Buffer.prototype).forEach(function(method) {
  ExpandingBuffer.prototype[method] = function() {
    try {
      return this.buffer[method].apply(this.buffer, arguments);
    } catch (e) {
      if (~e.message.indexOf('out of range')) {
        var buf = new Buffer(this.buffer.length * 2);
        this.buffer.copy(buf);
        this.buffer = buf;
        return this[method].apply(this, arguments);
      }
      throw e;
    }
  };
});

/**
 * Expose
 */

module.exports = ExpandingBuffer;

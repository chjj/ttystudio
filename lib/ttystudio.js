/**
 * ttystudio.js - a terminal-to-gif recorder minus the headaches
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * ttystudio
 */

exports = require('./writer');
exports.buffer = require('./buffer');
exports.compile = require('./compile');
exports.gif = require('./gif');
exports.optimize = require('./optimize');
exports.options = require('./options');
exports.play = require('./play');
exports.png = require('./png');
exports.record = require('./record');
exports.writer = require('./writer');

/**
 * Expose
 */

module.exports = exports;

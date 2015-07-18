/**
 * compile.js - terminal compiler for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

var fs = require('fs')
  , SGRWriter = require('./writer')
  , options = require('./options');

/**
 * Compile
 */

function compile(options, callback) {
  var input = options.files[0]
    , output = options.o || options.output || options.files[1]
    , stream
    , frames
    , writer;

  if (output) {
    if (output === '-') {
      stream = process.stdout;
      output = '[stdout]';
    } else {
      stream = fs.createWriteStream(output);
    }
  }

  options.stream = stream;
  options.delay = options.delay || 100;
  options.png = options.png || /\.png$/i.test(output);

  if (Array.isArray(input)) {
    frames = input;
  } else if (typeof input === 'string') {
    if (~input.indexOf('.json')) {
      log('parsing json');
      frames = JSON.parse(fs.readFileSync(input, 'utf8'));
    } else {
      log('reading file');
      frames = [fs.readFileSync(input, 'utf8')];
    }
  } else {
    return callback(new Error('No input file specified.'));
  }

  if (options.range) {
    frames = frames.slice(options.range[0], options.range[1]);
  }

  log('initializing writer');
  writer = new SGRWriter(frames, options);

  writer.on('done', function(event) {
    log('stream: ' + event);
    log('wrote image to %s', output);
    return callback();
  });

  log('writing image');
  writer.write();

  return writer;
}

/**
 * Helpers
 */

function log() {
  if (!options.log) return;
  return console.error.apply(console, arguments);
}

/**
 * Expose
 */

module.exports = compile;

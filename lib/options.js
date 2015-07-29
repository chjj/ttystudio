/**
 * options.js - option parsing for ttystudio
 * Copyright (c) 2015, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/ttystudio
 */

/**
 * Parse Arguments
 */

function parseArg() {
  var argv = process.argv.slice(2)
    , options = { files: [] }
    , arg;

  function getarg() {
    var arg = argv.shift();

    if (arg.indexOf('--') === 0) {
      // e.g. --opt
      arg = arg.split('=');
      if (arg.length > 1) {
        // e.g. --opt=val
        var val = arg.slice(1).join('=');
        val = val.replace(/^~\//, process.env.HOME + '/');
        argv.unshift(val);
      }
      arg = arg[0];
    } else if (arg[0] === '-') {
      if (arg.length > 2) {
        // e.g. -abc
        argv = arg.substring(1).split('').map(function(ch) {
          return '-' + ch;
        }).concat(argv);
        arg = argv.shift();
      } else {
        // e.g. -a
      }
    } else {
      // e.g. foo
    }

    return arg;
  }

  while (argv.length) {
    arg = getarg();
    switch (arg) {
      case 'record':
      case '--record':
        options.record = true;
        break;
      case 'screenshot':
      case '--screenshot':
        options.record = true;
        options.screenshot = true;
        break;
      case 'compile':
      case '--compile':
        options.compile = true;
        break;
      case 'play':
      case '--play':
        options.play = true;
        break;
      case '-o':
      case '--output':
        options.output = argv.shift();
        break;
      case '--png':
        options.png = true;
        break;
      case '-l':
      case '-v':
      case '--log':
      case '--verbose':
        options.verbose = true;
        break;
      case '-q':
      case '--quiet':
        options.log = false;
        break;
      case '-f':
      case '--font':
        options.font = argv.shift();
        break;
      case '-b':
      case '--font-bold':
        options.fontBold = argv.shift();
        break;
      case '-d':
      case '--delay':
        options.delay = +argv.shift();
        break;
      case '-i':
      case '--interval':
        options.interval = +argv.shift();
        options.delay = +options.interval;
        break;
      case '-k':
      case '--key':
        options.key = argv.shift();
        break;
      case '--screenshot-key':
        options.record = true;
        options.screenshot = true;
        options.screenshotKey = argv.shift();
        break;
      case '-n':
      case '--num-plays':
        options.numPlays = +argv.shift() || 0;
        break;
      case '-r':
      case '--range':
        options.range = argv.shift().split(/[^\d]/).map(function(n) {
          n = +n;
          if (!isFinite(n)) return undefined;
          return n;
        });
        break;
      case '-x':
      case '--ratio':
        options.ratio = argv.shift().split(/[^\d]/);
        options.ratio = {
          width: +options.ratio[0],
          height: +options.ratio[1]
        };
        break;
      case '-t':
      case '--term':
        options.term = argv.shift();
        break;
      case '--palette':
        options.usePalette = true;
        break;
      case '--no-palette':
      case '--rgba':
      case '--lct':
        options.usePalette = false;
        options.lct = true;
        break;
      case '--border':
        var b = argv.shift().split(/[^\d]/).map(function(n) {
          n = +n;
          if (!isFinite(n)) return;
          return n;
        }).filter(function(n) {
          return n != null;
        });
        options.border = {
          width: b[0] != null ? +b[0] : 1,
          color: {
            r: b[1] != null ? +b[1] : 255,
            g: b[2] != null ? +b[2] : 255,
            b: b[3] != null ? +b[3] : 255,
            a: b[4] != null ? +b[4] : 255
          }
        };
        break;
      case '--version':
        console.log('v' + require(__dirname + '/../package.json').version);
        process.exit(0);
        break;
      case '-?':
      case '-h':
      case '--help':
        help();
        break;
      default:
        options.files.push(arg);
        break;
    }
  }

  // Log by default
  if (options.log !== false) {
    options.log = true;
  }

  if (!options.files.length) {
    return help();
  }

  return options;
}

/**
 * Help
 */

function help() {
  var cp = require('child_process')
    , spawn = cp.spawnSync || cp.spawn;

  spawn('man',
    [__dirname + '/../man/ttystudio.1'],
    { stdio: 'inherit' });

  if (cp.spawnSync) {
    process.exit(0);
  } else {
    process.once('uncaughtException', function() {});
    throw 'stop';
  }
}

/**
 * Expose
 */

module.exports = parseArg();

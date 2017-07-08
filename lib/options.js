const {ArgumentParser, Action} = require('argparse')
const {version} = require('../package.json');
const util = require('util');
const child_process = require('child_process');

function findTerm(options) {
    let defaultValue = 'xterm'; 

    try {
        let stdout = child_process.execSync('tput -Txterm-256color longname', {
            encoding: 'utf8'
        });

        if (~stdout.indexOf('256 colors')) {
            defaultValue = 'xterm-256color';
        }
    } catch (e) {
        // pass
    }

    Action.call(this, Object.assign({}, options, {
        nargs: 1,
        defaultValue
    }));
};
util.inherits(findTerm, Action);

findTerm.prototype.call = function (parser, namespace, values) {
    namespace.set(this.dest, values[0]);
};


function parseBorder(options) {
    Action.call(this, Object.assign({}, options, {
        nargs: 1,
    }));
}
util.inherits(parseBorder, Action);

parseBorder.prototype.call = function (parser, namespace, values) {
    const [
        width,
        r=255,
        g=255,
        b=255,
        a=255
    ] = values[0].split(',').map((i) => {
        const n = parseInt(i);

        if (isNaN(n)) {
            throw new Error('${i} is not a number.');
        }

        return n;
    });

    namespace.set(this.dest, {
        width,
        color: {r, g, b, a}
    });
};

const parser = new ArgumentParser({
    version,
    addHelp: true,
    description: 'Record terminal activity to video'
});


const subparsers = parser.addSubparsers({
    title: 'commands',
    dest: 'cmd_name',
});

const record_cli = subparsers.addParser('record', {
    addHelp: true
});
record_cli.addArgument(
    [ '-p', '--padding' ],
    {
        help: '(Screencast mode only) Number of frames to insert each capture',
        type: 'int',
        defaultValue: 1,
    }
);
record_cli.addArgument(
    [ '--toggle-key' ],
    {
        help: 'Key used to start and stop recording. Defaults to C-t.',
        defaultValue: 'C-t',
    
});
record_cli.addArgument(
    [ '--capture-key' ],
    {
        help: 'Key used to capture frames. Defaults to C-b.',
        defaultValue: 'C-b',
    }
);
record_cli.addArgument(
    'json_file',
    {
        help: 'JSON output file',
        defaultValue: `frames.${Date.now()}.json`,
    }
);
record_cli.addArgument(
    ['-t', '--term'],
    {
        help: 'Terminal name for terminfo',
        action: findTerm,
    }
);


const encode_cli = subparsers.addParser('encode', {
    addHelp: true
});
encode_cli.addArgument(
    [ '-d', '--delay' ],
    {
        help: 'Time between frames, in milliseconds',
        type: 'int',
        defaultValue: 100,
    }
);

encode_cli.addArgument(
    [ '-f', '--font' ],
    {
        help: 'BDF font file to use when rendering video',
        defaultValue: __dirname + '/../fonts/ter-u14n.json'
    }
);
encode_cli.addArgument(
    [ '-b', '--font-bold' ],
    {
        help: 'BDF bold font file to use when rendering video',
        defaultValue: __dirname + '/../fonts/ter-u14b.json'
    }
);
encode_cli.addArgument(
    [ '-s', '--sequence' ],
    {
        help: 'Output individual frames',
        action: 'storeTrue',
        defaultValue: false
    }
);
encode_cli.addArgument(
    [ '--border' ],
    {
        help: 'Add border in [width,r,g,b,a] format',
        action: parseBorder,
    }
);
encode_cli.addArgument(
    'frame_source',
    {
        help: 'JSON frames file',
    }
);

encode_cli.addArgument(
    'output_file',
    {
        help: 'Video output file',
    }
);

const play_cli = subparsers.addParser('play', {
    addHelp: true
});
play_cli.addArgument(
    [ '-d', '--delay' ],
    {
        help: 'Time between frames, in milliseconds',
        type: 'int',
        defaultValue: 100,
    }
);
play_cli.addArgument(
    'json_file',
    {
        help: 'JSON frames file',
    }
);


module.exports = parser.parseArgs();

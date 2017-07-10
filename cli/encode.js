#!/usr/bin/env node

const {readFileSync, createWriteStream} = require('fs');
const {SGRWriter} = require('../lib/writer');

module.exports = function encode({
    border,
    delay,
    font,
    font_bold,
    frame_source,
    sequence,
    output_file,
}) {
    const frames = (Array.isArray(frame_source)) 
                    ? frame_source
                    : JSON.parse(readFileSync(frame_source, 'utf8'));

    if (sequence) {
        let {length: pending} = frames;

        frames.forEach((frame, i) => {
            return encode({
                border,
                font,
                font_bold,
                delay,
                frame_source: [frame],
                output_file: `${i}-${output_file}`,
                sequence: false,
            }, function(err) {
                if (!--pending) {
                    return process.stdin.end();
                }
            });
        });
    } else {
        const writer = new SGRWriter(frames, {
            font,
            fontBold: font_bold,
            delay,
            border,
            stream: (output_file === '-')
                        ? process.stdout
                        : createWriteStream(output_file),
        });

        return new Promise((resolve) => {
            writer.on('done', function(event) {
                resolve(0);
            });

            writer.write();
        });
    }
}

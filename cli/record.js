#!/usr/bin/env node

const fs = require('fs')
const blessed = require('blessed');
const child_process = require('child_process');
const {MD5} = require('jshashes');


module.exports = function record({
    term,
    padding,
    capture_key,
    toggle_key,
    json_file
}) {
    const reel = [];

    const screen = blessed.screen({
        smartCSR: true,
    });

    const tty = blessed.terminal({
        term,
        left: 0,
        top: 0,
        parent: screen,
        cursorBlink: false,
        screenKeys: false,
        width: screen.width,
        height: screen.height,
    });

    const hasher = new MD5();

    let current_digest = '';
    let previous_digest;
    let live_capture = false;

    function getFrame() {
        return screen.lines.reduce((frame, line, y) => {
            const cx = (y === tty.term.y
                            && tty.term.cursorState
                            && (
                                tty.term.ydisp === tty.term.ybase
                                || tty.term.selectMode
                            )
                            && !tty.term.cursorHidden)
                                ? tty.term.x
                                : -1;

            frame.push(line.map(([attr, ch], x) => {
                const relevant = (x === cx) ? (0x1ff << 9) | 15 : attr;

                current_digest = hasher.hex(current_digest + relevant + ch);

                return [relevant, ch];
            }));

            return frame;
        }, []);
    }

    function captureIfChanged() {
        const frame = getFrame();

        if (live_capture && current_digest !== previous_digest) {
            reel.push(frame);
            previous_digest = current_digest;
        }
    }

    function debounce(func, wait, immediate) {
        let timeout;
        return function() {
            const context = this, args = arguments;
            const later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };

            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };

    return new Promise((resolve, reject) => {
        try {
            function done() {
                if (done.called)
                    return;

                done.called = true;

                screen.destroy();

                fs.writeFileSync(json_file, JSON.stringify(reel));
                console.log(`Wrote ${reel.length} frames to ${json_file}`);
                resolve(0);
            }


            screen.key(capture_key, () => {
                if (live_capture) {
                    reel.push(...Array(padding).fill(getFrame()));
                } else {
                    reel.push(getFrame());
                }
            });

            screen.on('render', debounce(captureIfChanged, 100));

            screen.key(toggle_key, () => {
                live_capture = !live_capture;
            });

            screen.key('C-c', done);
            process.on('exit', done);
        } catch (e) {
            reject(e);
        }
    });
};

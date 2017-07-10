const fs = require('fs')
const blessed = require('blessed');

module.exports = function play({
    json_file,
    delay,
}) {
    const frames = require(json_file);

    const screen = blessed.screen({
        smartCSR: true
    });

    screen.on('C-c', () => process.exit(0));

    setInterval(function() {
        if (!frames.length) {
            clearInterval(timer);
            screen.destroy();
        } else {
            screen.lines = frames.shift();
            screen.lines = screen.lines.forEach(line => line.dirty = true);
            screen.render();
        }
    }, delay);
}

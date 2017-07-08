A standalone terminal recorder forked from
[chjj/ttystudio](https://www.github.com/chjj/ttystudio). See there
for font setup information.

## Differences from forked project

My changes are opinionated and therefore not for everybody. Try this out
and use the original project if you like that experience better.

A key difference in the two approaches is that `ttystudio` records 
in **real-time** and `toughtty` records **changes**. `toughtty` also
normalizes typing speeds. This means that if you pause to think
about what to type while recording, `toughtty` won't capture frames
until you actually type. Once the frames are written to a GIF, you
will always look to be typing at the same speed with minimal frames.

## Usage

    $ sudo npm install -g toughtty
    $ toughtty record frames.json

    # C-t to toggle recording
    # C-b to insert a pause
    # C-c to end the session

    # GIF with 100ms delay between frames
    $ toughtty encode --delay 100 frames.json session.gif

## Managing recording

`toughtty` does not start recording immediately so you can set `PS1`
or do other terminal setup. When you are ready, hit the recording
toggle key (default: `C-t`) to start recording. Hit it again to stop
recording. You may start and stop recording freely, but the recording
session does not end until you hit `C-c`.

Since `toughtty` does not record in real time, it does not know when you
wish to pause, or for how long. When you hit the pause hotkey
(default: `C-b`), `toughtty` will add padding frames.

You can control the number of padding frames.

    $ toughtty record --padding 20 frames.json

    ... > <C-t> echo "Hello, World!"
    ... > "Hello, World!"
    ... > <C-b>
    ... > <C-c>

    $ toughtty encode --delay 100 frames.json session.gif

In this session, the user starts capturing changes with `C-t`,
echoes `Hello, World!` and then hits `C-b` to add a pause of
20 frames due to `--padding`.

When you later write a GIF using `toughtty encode --delay 100`,
this results in a GIF with 100ms between frames. Therefore those
20 frames result in a 2 second pause (20 frames * 100ms = 2000ms = 2s).

`--padding` defaults to `1`, but you should know in advance the delay
between frames in your intended GIF and set `--padding` such that it's
easy to control the length of pauses when you run different commands
during your recording session.

## Result comparison

Here are two GIFs showing the same session. The first is by `ttystudio`,
the second is by `toughtty`.

![ttystudio](https://github.com/zyrolasting/toughtty/blob/refactor-present/img/ttystudio.gif?raw=true)
![toughtty](https://github.com/zyrolasting/toughtty/blob/refactor-present/img/toughtty.gif?raw=true)


| `ttystudio` | `toughtty` |
| ----------- | ---------- |
| 84 frames   | 38 frames  |
| 3805 bytes  | 2980 bytes | 

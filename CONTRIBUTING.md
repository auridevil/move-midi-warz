# Contributing to MIDI Warz

MIDI Warz is a playground for the Ableton Move in the browser. The most valuable contributions are **not code**:
they are the things you make *with* it and would like others to have. Please share.

## Share what you made
- **Finger‑drumming exercises** — add an entry to `src/drums/exercises.js` (16 or 32 steps, lanes with hand `R`/`L`
  and dynamics `f`/`w`/`g`). Say which scale it belongs to and what it trains. A two‑line note in English, like the
  existing ones, is enough. Put your name in the PR if you want credit in the exercise picker.
- **Orbits kits and voices** — a kit is six lines in `src/poly/kits.js`; a new voice is a `make`/`hit` pair in
  `src/poly/voices.js` that reacts to decay / snap / color / tune. Patterns you love: paste the JSON from the
  browser's `localStorage['midi-warz.poly.v2']` into an issue and we'll turn it into a preset.
- **Entropy Engine states** — the readout's parameters plus which cells you pinned. Issues welcome.
- **Game mappings** — a `move-keymap` preset for another browser game (`packages/move-keymap/src/presets.js`), or a
  Lights Out variant.
- **New pad‑native games** — pick one from `GAMES.md` or propose yours; a game is one HTML page plus one module in
  `src/games/`. Keep it English, keep it small, light the pads.
- **Move protocol findings** (a new SysEx, a display command, a button we missed) go to the driver repo:
  https://github.com/auridevil/movewire, with the raw bytes and your firmware version.

## Ground rules for code
- Vanilla ES modules, **no build step**. Pages must run from a static server as they are; `npm start` is enough.
- English in every user‑facing string.
- The Move driver lives in `movewire` and is loaded through the import map in each page. Don't copy driver code here.
- Logic that can be tested without a browser gets a `node --test` file in `test/` (see `test/poly.test.js`,
  `test/field.test.js`). `npm run check && npm test` must pass.
- Before you open a PR, load the pages you touched and look at the console. `tools/smoke.mjs` does it headlessly
  if you have Chrome.
- Design: dark, supervuoto‑style tokens in `styles.css`; hand colours are cyan (right) and purple (left) and the Move
  LEDs follow the screen through the palette lookup. Don't introduce a second colour system.

## Opening a PR
One topic per PR. Say what you tested on a real Move (firmware from the status pill) or that you used the keyboard
fallback. Screenshots or a short clip of the pads are great.

## Licences
Code is MIT. Vendored: Tone.js (MIT), js‑dos (GPL‑2.0), DOOM shareware 1.9 (id Software, redistributable as a
complete package). Don't add assets you can't redistribute. Not affiliated with Ableton.

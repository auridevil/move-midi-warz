# MIDI Warz — the Ableton Move in the browser

**Live:** https://auridevil.github.io/move-midi-warz/ · Chrome or Edge, USB‑C, allow MIDI + SysEx when asked.

MIDI Warz plugs an **Ableton Move** into web pages through Ableton's own control‑surface protocol
([movewire](https://github.com/auridevil/movewire)): pads, knobs, wheel and buttons come in as events, and the
pads' LEDs are the interface. No firmware modification, no warranty worries; the Move returns to standalone when you
disconnect or close the tab. In control mode the Move itself is silent, so every page makes its own sound in the browser.

| Page | What it is |
|---|---|
| **Orbits** `poly.html` | Polyrhythm drum machine: four lanes, each its own length (1–16) and speed against the master tempo, all driven by one phase‑locked master clock (24 PPQ). Euclidean fills, rotation, swing, probability, accents, **per‑step locks** (hold a step + knobs), **trig conditions & ratchets**, **16 pattern slots and chains**, **live record** from the pads, **evolve** mode, **undo/redo**, **seeded dice**, **solo & choke groups**, **samples on lanes** (file, mic, Unassembler slices), **share link / WAV / MIDI export**, **MIDI out** (notes per lane, clock) and **clock in** with phase lock. 39 voices, 18 kits, per‑lane sound sculpting on Shift + knobs, a stress meter. Rings on screen turn at their own speeds. |
| **Finger drumming** `drums.html` | 34 exercises in four scales (first steps → hitting → splitting the hands → the weak hand). Pads light as cues, hits are graded for timing and dynamics, a per‑lane timeline shows where you really landed, quality score per bar / last 16 / session, best stats and an overall progress table. Preview and guide playback, four synth kits sculpted from the knobs. |
| **Entropy Engine** `chaos.html` | A Tone.js synth that mostly decides for itself: pads inject energy into a stochastic field, energy spreads, decays and fires notes by chance; knobs bend the odds; an arp cycles through whatever is charged; a stress meter throttles it before the audio glitches. |
| **Lights Out** `lights.html` | The pads are the lights. Levels, par, hint, undo, and an arpeggio that is the board. |
| **Doom** `doom.html` | Shareware Doom in DOSBox (js‑dos), played from the pads: movement cluster, strafe, fire, weapons, wheel turns. Remap by pressing a pad then a key. |
| **Melodic drills** `melodic.html` | Note hunt, intervals, chords, rhythm on a scale‑mapped pad grid. |

A **master tempo** is shared by every page (knob 8 where it applies, tap tempo on Record).

## Run it locally
```sh
git clone https://github.com/auridevil/move-midi-warz && cd move-midi-warz
npm install            # fetches movewire
npm start              # http://localhost:5173 (no‑cache dev server with live reload)
npm test               # node --test: drum engine, field, orbits model, keymap
```
No build step: plain HTML + ES modules + import maps. Keyboard fallbacks exist on every page for when the Move is not around.

## Move setup
Connect over USB‑C, quit Live if it is running (it grabs the ports), click **Connect Move** on any page, allow MIDI and
SysEx. The page performs Live's handshake and switches the Move to control mode; LEDs light up for that page.
**Disconnect** (or closing the tab) hands the Move back.

## Project layout
```
index.html                  launcher
drums.html / src/drums/     finger drumming: exercises data, kit, drill engine (grader), page
poly.html  / src/poly/      Orbits: lanes model, voices, kits, page
punchliner.html / src/punch/ Punchliner: line generator, endings + chaos, preview sounds, .mid and Move Set (.ablbundle) writers
unassembler.html / src/unasm/ Unassembler: beat detection, glitch engine (stutters, slices, take-overs), demo loop, WAV recorder
chaos.html / src/chaos/     Entropy Engine: stochastic field, Tone voices, page
lights.html / src/games/    Lights Out (+ generative arp)
doom.html  / src/doom/      Doom via js-dos; games/doom/ holds the runtime and the shareware bundle
melodic.html / src/*.js     melodic drills, shared MIDI wrapper, audio helpers, master tempo, dev reload, analytics
packages/move-keymap/       Move → keyboard/mouse mapper for browser games (presets, learn mode, tests)
vendor/tone/                Tone.js (MIT)
test/                       node --test suites
tools/smoke.mjs             headless console check of every page
GAMES.md                    ideas list for pad-native games
```
The Move driver is a separate package: **[movewire](https://github.com/auridevil/movewire)** (MIT, zero deps, tests, protocol reference).

## Punchliner → Move
**⤓ Move Set** downloads `<set name>.ablbundle` (track 1 empty for drums, lead, pad, bass as clips on tracks 2–4). Open
[move.local](http://move.local) → Sets and drag it onto the list; the file name becomes the Set name. Move Manager
has no API a web page can call (pairing cookie, no CORS), so it is a download + drag.
Format facts from [MidiToMove](https://github.com/OnjLouis/MidiToMove) (MIT); `src/punch/move-drift.json`, the
Analog Drift track chain, comes from a Move-saved Set in [extending-move](https://github.com/charlesvestal/extending-move) (MIT).

## Analytics

Page counts via [GoatCounter](https://www.goatcounter.com/) — cookie-free, no personal data, no
consent banner. One line, `src/analytics.js`, loaded by every page; it does nothing on localhost.
Dashboard: https://supervuoto.goatcounter.com/

## Contributing
Exercises, kits, voices, mappings, games, protocol findings: see [CONTRIBUTING.md](CONTRIBUTING.md). Sharing what you
made is the point.

## Licences
Code MIT (see LICENSE). Vendored: Tone.js MIT, js‑dos GPL‑2.0, DOOM 1.9 shareware (id Software; complete package,
redistributable). Not affiliated with Ableton.

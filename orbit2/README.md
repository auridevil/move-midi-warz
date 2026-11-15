# orbit2: Orbits lab

**2026-11-14: everything here up to ORBIT2-18 was promoted to the shipped Orbits** (`poly.html`, `src/poly/`, the shared
modules, `styles.css`, the tests), with the shipped storage keys. The lab keeps going for the next round.

A full, self-contained copy of Orbits (`../poly.html` + `../src/poly/`) to try improvements without touching the
shipped Orbits. Open it at `orbit2/index.html` (locally `npm start` → http://localhost:5173/orbit2/index.html, live
https://auridevil.github.io/move-midi-warz/orbit2/index.html).

## Rules

- **Edit only inside `orbit2/`.** The main Orbits (`poly.html`, `src/poly/`, `src/*.js`, `styles.css`, `test/`) stays
  as it is. When an improvement is proven here, porting it back is a separate, explicit step.
- Same folder layout as the repo root, so imports are unchanged: `orbit2/src/poly/app.js` imports `../ui.js` →
  `orbit2/src/ui.js` (a copy). Shared, read-only assets come from the root: `../vendor/tone/Tone.js`,
  `../node_modules/movewire/`, `../favicon.svg`, `../icons/`, `../manifest.webmanifest`, `../src/analytics.js`,
  `../src/pwa.js`, `../src/dev-reload.js`.
- Saved data is separate: every localStorage key is `midi-warz.orbit2.*` (pattern, settings, slots, library, engine,
  tempo). Samples (IndexedDB `midi-warz-samples`) and Unassembler slices are shared on purpose.
- Tests: `orbit2/test/*.test.js` (run by `npm test` from the root). `npm run check` syntax-checks `orbit2/src/**`.
  `node tools/smoke.mjs` loads `orbit2/index.html` with the other pages.
- After editing `orbit2/src/poly/dsp-core.js`, regenerate the worklet: `node orbit2/tools/build-worklet.mjs`.
- Browsers are always muted: `orbit2/tools/cdp.mjs` or `tools/headless-chrome.sh <port>`, never Chrome by hand.
- The look (RD-2, dark room): tokens at the top of `styles.css` (`--v` void, `--l` light = the 0.475 luminance cap,
  `--d` labels, `--b` edges, `--track` knob tracks, `--rec` record red, `--ink` a lane's colour on a control; sizes
  `--t-s / --t-m / --t-l` = 11 / 13 / 15, the only ones under 40 px: a text moved onto them keeps its old box with a
  px line-height and tracking). No fills on controls ("on" = 2 px `--l`), lane hues the only hues, red only for record,
  Major Mono only in the wordmark, the action words a 40 px hit area. `test/dark-room.test.js` holds the token maths;
  the face audit's TYPE gate measures the type on the page.
- The layout (RD-3): a grid on wide windows (left column, stage, right column over the console row; wide is always
  `not all and (max-width: 1100px)`, the exact complement of the narrow test), the rings from the stage cell alone
  (`scene.js ringBox`), and every drawer in the one sheet (six tabs; `app.js setSheet / reveal`, the pure half in
  `src/poly/sheet.js`; a test opens a control's tab with `__poly.reveal(el)`).
- Redesign gates: `orbit2/tools/face-audit.mjs` (A1 contrast and light, A5 control count, A6 scroll and nothing cut by
  a column, A7 rings, IDS every RD-1 control id drawn once its tab is open, A9
  audio; TYPE the three sizes, HIT the action words' 40 px, HUE lane hues and greys only, red only while recording;
  `--assert` fails on a threshold, `--tests A1,TYPE,HIT,HUE` limits it to a phase's own gates, `--diff
  orbit2/docs/redesign/baseline/rd01-controls.json` checks no drawn control moved > 2 px at first load, and none came
  or went there or with everything shown; `--root` audits another checkout; baselines in `docs/redesign/baselines.md`),
  `?setlog` on the page (the
  action log, key L saves it). Player-agent runs (A2 / A3 / A10 by agents): `orbit2/tools/session.mjs` (a seeded
  performer plays a set as Move MIDI or mouse-only, with slips, and tags the setlog's accidents), `glance.mjs` (300 ms
  darkened screenshots + answer key + `score`), `moveview.mjs` (the Move's LEDs drawn as the device). The RD-1
  baseline sets and glance trials are in `docs/redesign/setlog/` (summary in `docs/redesign/baselines.md`).
- Browser checks: `orbit2/tools/cdp.mjs` (headless Chrome helper: open, eval, click/tap/key, screenshot, capture
  downloads, `parseWav`, `unzipStored`).

## Docs

- `docs/BACKLOG.md`: every improvement from the producer + UX panel, with ids.
- `docs/REVIEW-PANEL.md`: the reviewers and the "everyone happy" validation loop each playbook phase runs.
- `docs/reviews/`: one file per phase with every round's verdicts.
- Playbooks (Maestro Auto Run): `.maestro/playbooks/2026-11-06-Orbit2-Lab/ORBIT2-*.md`.

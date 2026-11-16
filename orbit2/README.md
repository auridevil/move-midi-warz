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
- Find and one Escape (RD-4): the sheet is closed on load; ⌘K or `/` opens it with one search field over every labelled
  control (the index is read off the page each time: accessible name, tab · drawer · group, the synonyms table and the
  actions in `src/poly/find.js`; Enter runs an action or shows and focuses the control; recents in
  `midi-warz.orbit2.find`). One Esc order, `escStep` in `find.js`: popup → step locks → sheet → focus mode → give the
  keys back; a click on empty canvas is one Esc and never edits (`__poly.escapeOnce / escState / findIndex / openFind`).
  Browser check: `node orbit2/tools/find-check.mjs --size 1512x860` (COVER every control Chrome's accessibility tree
  names is in the index, the synonyms top 1 in both views, every action findable; KEYS "stems" in 4 keys and the keys
  back to the page after an action; STALE the field reached by a click reads the page as it is; ESC / CLICK the order,
  a held Esc one press; OWN key ownership; `--root` checks another checkout; exit 1 on a failure).
- The console (RD-5): `#topbar` is the Move's face along the bottom (transport · the selected lane's header, 8 knobs and
  16 cells · the action words on hairlines), the lane list with M lamps and the peek in the left column. The knob row
  shows the sheet's own gauges moved in by `gauge.js bindRow` (rhythm arcs, sound pies, a step's locks), chosen by
  `pages.js resolvePage` (Nils's state table: a held or touched Move control owns the row, +400 ms after a touch; the
  MOVE ⇢ chip grey when the Move edits something not drawn); `__poly.page` says what it resolves to now. The cells
  are the Move's 16 step buttons (a 32-step lane shows the 16 of its page). The console log (\` or Sheet → setup) shows
  the old readout as text over the stage. Browser check: `node orbit2/tools/console-check.mjs` (Nils's rows through
  `__poly.move.receive`, A8 peek latency with `?setlog`, the scripted A2 run, the log's A5 / A7, Vera's mis-click run).
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

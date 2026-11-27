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
- After editing `orbit2/docs/GUIDE.md`, regenerate the "?" → guide tab: `node orbit2/tools/build-guide.mjs` (a test checks `index.html` is in sync).
- `node orbit2/tools/guide-check.mjs` walks every use case of the guide in the muted headless browser (needs no server of yours; it starts its own on 5400/9400).
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
- The step page (RD-6): the one lock editor. A Move step held LOOK_MS (or a knob turned) or a cell's / planet's
  long-press, right-click or Alt+click shows it: the knobs as rings (solid = locked, dashed = the lane value; knob 8 the
  condition, + the Move's Shift the repeats), the 16 cells as the step's loop dots (`pages.js stepLoops`, as the Move's
  LEDs), clear · more… · done in the header ("more…" = the rest in Sheet → lane, the old lock panel). With it latched a
  click on a planet or a cell switches the step (`cellAction` / `planetAction`); Loop held on the Move shows the slots
  on the cells. The radial menu is gone. Nils's whole table is `test/steppage.test.js`. The ring answers the hand
  (`scene.js setHand`, `HAND_LOOK`): while a knob is touched or dragged (+ `HAND_MS`) the selected ring shows what it
  did (shift slides the planets with a trail, hits re-spread, swing moves the off-beats, chance arcs, push leads / lags,
  new ticks pulse) and a held step gets a halo; the touched knob gets a lane-colour plate. Read-only: `locate` never moves.
  Browser check: `node orbit2/tools/step-check.mjs` (MOVE hold-step + knobs / jog / push, TAP the 450 ms rule with a
  flash observer, MOUSE the latch, LOOP the slots, HAND incl. the halo, the scripted A2 for the step page, FRAME p95
  with hands on knobs vs RD-1 + 1 ms); the face audit has a "step page" state (A1 / A6 / A7 with it open).
- The pills (RD-7): what is on, in `#pills` (one `role="status"` region at the top of the right column, under the Move
  pill and "?"), in a fixed order: rec armed (· touch / latch), chain or a slot / mute waiting for the bar, solo, evolve,
  dice, clock follow, welcome back, quest, jam. Each is a joined bar: its first button shows the mode's control in the
  sheet (or does the pill's job: welcome = play, quest = its hint with "show me" and skip, jam = stop the take /
  download · discard), × turns the mode off. At most 4 drawn, then "+N more ▾" drops the rest down over the sheet. Pure
  half in `src/poly/pills.js` (`pillText`, `pillLayout`); `app.js renderPills` keeps every pill's node in place and
  writes only what changed, so the words never move with the clock (each pill announced once). The region is not atomic
  (`aria-atomic="false"`: a new pill is read alone), "+N more" counts silently (`aria-live="off"`), and it stays in the
  page when empty (never `display: none`: a live region must exist before its first pill). A button that goes out of
  sight with the focus on it hands the focus on (`pills.js focusAfter`, `app.js keepFocus`: its pill, "+N more", the
  next pill, "?"; never onto welcome's play or a recording take's stop), never to the page; a click on a pill's words
  leaves Space to play / stop. The take's pill changes its words with its state (next bar → recording → closing on the
  bar → take ready): each is read once, on purpose (a state, not a counter). Quest "show me": the
  gesture drawn once on the rings as a ghost hand (`scene.js ghost`, `ghostAt`, read-only; any key or press hides it),
  or the control for a quest played in the sheet. `__poly.showPills([keys])` forces a layout for tests. Browser check:
  `node orbit2/tools/pills-check.mjs` (ANNOUNCE a MutationObserver on the region while playing with five modes and a jam
  take on: 0 changes per bar; SHEET 6 pills at 1280×720 and 1512×860, the sheet ≥ 340 px under them, rings fixed (A7);
  KEEP the jam take, a pending mute, clock follow, the quest, welcome back, Esc; A11Y the accessibility tree: polite,
  not atomic, there when empty; FOCUS Esc on "+N more", a ×, show me, a discarded take, a click then Space, show me on a
  phone scrolled to the pills). The face audit's "pills" state turns
  six on (PILLS gate). Find's empty list offers nothing destructive (`FIND_DEFAULTS`; Vera's mis-click run).
- Light on the canvas (RD-8): the score speaks without opening anything, all of it read-only (`scene.js locate` never
  changed; nothing on the canvas is a target). The **sun** reads the beats until everything meets (40 px weight 300, the
  cycle's length when stopped; smaller and then said short, 240k, to stay inside the kick ring: `sunFace`) over a soft dark plate, "press play" on a visit that has never played (`HINT_MS`, the play
  ring pulses slowly meanwhile), and flares while fill is held from anywhere. The **generative arc** over the top names
  what is on (EVOLVE · DICE · COUPLING NEXT · GRAVITY, words only) with a crawl that moves continuously toward the next
  mutation (`genProgress`, from the last bar line `barAt`; once per beat with reduced motion). The **slot moons** under
  the rings: saved = a moon, playing = bright with its number, queued = a dashed ring. **One arc label** on the selected
  lane (`laneLabel`: "CONGA 32 × 4", 13 px caps weight 500, the name in the lane's colour, mid-gap outside the ring,
  inside for the outer lane; its extras while they fit and the ring is not a full strip). The **straight caption** at the
  bottom right of the stage carries every number (`captionLines`: the cycle, "evolve in N bars", the seed, the playing
  slot when the moons carry no number, the take's beat; `captionFit`: a line goes only when it would touch the rings or a
  moon or its number, never at 1512×860; the moons spread ±30°). **Yuki's ladder** (`lightLevel`, `lightPlan`): when space runs
  out things go in order (unselected labels, extras, slot numbers, arc detail, words off the curve), the lowest rung gone
  taking every rung above it; `LIGHT_ROOM` 40 px outside the outer ring is what words need there (1280×720 has 12: the
  crawl and the moons hug the ring, the words are in the caption). Every word is a cached sprite (`arcSprite`,
  `textSprite`, at most 32, made again once the fonts load): no `fillText` per frame. `__poly.scene.light` says what the
  last frame measured and drew. The evolve pill reads "evolve" (the countdown is the arc). Browser check: `node
  orbit2/tools/light-check.mjs --assert` (LIGHT a first visit's "press play" then the beats, the label, the arc, the
  moons, the caption, the pill; LADDER 6 lanes / 32 steps at 1512×860, 1280×720 and 390×844 against the ladder, no
  caption line within 4 px of a moon or its number, with and without a jam take; FRAME A9's frame p95 and the stress
  meter on that page; REDUCED the crawl steps per beat, the pulse off; CLICK nothing on the canvas is a target, with 4
  and 6 lanes: no edit, a selection only inside a ring's tap band, which with 4 lanes reaches over the moons and the
  arc's words; SUN, run last, a cycle of millions of beats keeps the sun inside the kick ring; `--shots`, `--json`). `cdp.mjs open({ reducedMotion: true })` loads a page with
  `prefers-reduced-motion: reduce`, `open({ ready: '!!window.__poly' })` waits for the modules on a busy machine. The
  night run of the label ladder: `node orbit2/tools/night-ladder.mjs` (five darkened 70 cm pictures and their key from
  `scene.light`; `score` checks persona readers' readings token by token against the 13 px word / 15 px number floors).
- The set (RD-9): **F** hides controls, never state: the lane list, the console (`visibility: hidden`, so the rings stay
  put), the Move pill, "?" and the sheet go; every pill, the peek and all the canvas light stay, mutes still show as rings
  at 35 %, and the console's red record line opts back in while recording (narrow windows pin the pills over the canvas,
  clear of "exit focus"). **Night** (Sheet → setup, `face.night` in the settings, `__poly.setNight`) re-points `--l` /
  `--d` only: the controls dimmer, text still ≥ 4.5:1, the edges at their 3:1 floor untouched. **"?"** opens on the
  keys; its second tab draws the Move with the meanings of the page under the hands (`src/poly/moveface.js
  drawMoveHelp`, redrawn while open, only when it changed) over the Move table: the knobs wear the words the console's
  own gauges wear for that page (`pageGauges`), Capture / Delete what a tap does in live
  mode. Hold Loop: the cells are the numbered slots, the header says "slots · held on Move" and the chip "MOVE ⇢ SLOTS"
  (white; the knobs keep their meaning). A press that would mute a lane less
  than 0.2 s after a press unmuted it is a bounce and is dropped (`perform.js MuteBounce`, every mute path goes through
  `toggleMute`): a quick mute → unmute still works. The transport's tempo moves as a step (`bpm.value`), never a ramp:
  Tone's bpm ramps (`rampTo` → `cancelAndHoldAtTime`) can send its clock's next tick before 0 (a TypeError in
  `Clock._loop`) or hold it in place (a hung page). Browser checks: the face audit's NIGHT and FMODE gates,
  `console-check.mjs` HELP (the drawing's words = the console's, both views) / FMODE (incl. the record line) / CLOCK /
  BOUNCE, `step-check.mjs` LOOP (header, chip, numbers). The final sets (A3) and the full glance run
  (A2): `docs/reviews/RD-09.md`, records `docs/redesign/setlog/final-*.json`, `glance-rd09-*.json`; `session.mjs` notes
  the action page errors came with.
- Phone, access and clean-up (RD-10): one interface everywhere. On a phone (≤ 760 px) the page never scrolls at
  390×844 (A6; only the sheet scrolls inside): the square full-width rings, a row of 44 px lane-colour dots (the name
  stays the aria-label, a muted dot hollow; the M lamps leave the face), the console in three rows (play + bar·beat
  with the cells' header beside them — the page tabs, or a step page's "step N · clear · more… · done" — then the 2×4
  knobs and the 2×8 cells), the pills' one line beside "?", the docked sheet. The controls the phone's console leaves
  out move into the sheet, the same nodes (`app.js placePhone`, `PHONE_HOSTS`; back in place on wider windows): fill,
  fill next, the filter, throw and the action words top Sheet → perform, the voice Sheet → lane, the Move's connect
  Sheet → setup — so each stays reachable by touch (T1) and find shows them where they are ("all ⌘K" stays hidden: the
  dock is the way in). The peek sits over the canvas, top left, on narrow windows. The canvas is one tab stop after
  the console (`role="application"`, `aria-roledescription="orbit"`, named per bar): ↑↓ pick a lane, ←→ walk its steps
  (the cells turn to that page while it has the focus, and follow again after; `pages.js canvasKey / canvasStep` keep
  the wanted step through a shorter lane), Enter is the planet-tap cycle (off → on → accent; after a click put the focus
  there, the first Enter says the step instead), spoken through `#announce` in the cells' words ("lane 3 conga, step 7
  of 32, on, accent, plays 85 %"), drawn as a white ring round the focused tick (only for the keyboard,
  `:focus-visible`); locks stay on the cells' step page (Alt+Enter on a cell). Tab order: play is the page's first
  stop, then the console in Move order. The simple / everything switch (I7) is gone — one view, the full knob words,
  every drawer; the plain words (hits, shift, speed, chance) live on as find synonyms, an old save's `view` key is
  ignored, and hidden quests come back from Sheet → setup → settings ("show the quests again"). Find lists only what
  it can show or run (`findHidden` reads `display: none` round a control too). Zero orphan ids in `index.html`
  (`test/access.test.js`: a real reference — the id quoted whole, `#id`, or the page's own `for` / `aria-*` — not a
  substring of a class or a comment). Browser check: `node orbit2/tools/access-check.mjs` (A4, the canvas, PIN, QUESTS)
  and `--size 390x844m` for the phone (PHONE: no page scroll, every console control reachable by touch).
- Evolve in sync with the cycle (RD-13): Sheet → groove → evolve, every **bars · cycle** (`evo.sync`, saved; old
  settings load as bars). Cycle mutates on the tick the whole pattern lines up again, the sun's 0 and the bloom, never on
  a tick where a pattern starts (Play, a slot coming in, a new meter's first bar). The clock and every countdown ask one
  pure function (`src/poly/evolve-sync.js nextEvolveTick`); `HeardCycle` keeps the countdown on the cycle the ear is in
  while the clock runs ahead, read through `app.js alignNow()`. The drift page's knob 1 reaches cycle at its lowest
  detent. Browser check: `node orbit2/tools/sync-check.mjs --assert` (UI, CLOCK, SWITCH, DICE, DRIFT, ORIGIN, RESYNC).
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

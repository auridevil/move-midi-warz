---
type: review
phase: ORBIT2-03
title: ORBIT2-03 touch and accessibility (T1–T7), review panel
date: 2026-11-10
round: 3
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  greta: HAPPY
  rio: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-02]]'
---

# ORBIT2-03 · Touch and accessibility: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), greta, rio. Process: [[REVIEW-PANEL]].
Brief: phase goal (everything can be done with a finger, a keyboard and a screen reader; nothing needs Shift, Alt, Cmd
or right-click), T1–T7 verbatim from [[BACKLOG]] plus the phase spec, `git diff --stat 50aba0e..8e574da` (7 files,
+226/−74, commits 32117cf / a0395b1 / d4ac357 / 8e574da), `git status --short` (clean), how to drive
`orbit2/index.html` with `orbit2/tools/cdp.mjs` (own ports, one browser per viewport, time limits).

## Pre-checks

`npm run check` clean, `npm test` 105 + 9 green on 8e574da before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; greta, rio on sonnet), own ports
5401 / 5402 / 5403 / 5409 / 5410 (+ 940x), the verifier also ran the smoke on 9222. Each MUST-FIX was reproduced by the
implementer on 8e574da (5400/9400) before fixing.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | T2: steps tall enough but not wide enough: 21.6 × 32 px on desktop (16 in a row on the 440 px panel; the phase start was 21.6 × 18), 39.6 × 44 on a 390 px phone (8 in a row can't be 44 px wide there). A target size counts both sides; T7 says "tall", T2 doesn't. |
| architect | NOT HAPPY | T6: the toggle is `disabled` while it connects, so Chrome drops the keyboard focus to `<body>` (Tab to it, Enter: focus on BODY during "Connecting…" and after, with denied MIDI and with a 300 ms fake handshake; at 50aba0e it stayed on the button). T6 semantics: the label flips *and* `aria-pressed` flips, so a screen reader says "Disconnect Move, toggle button, pressed" (APG: a toggle's label doesn't change). |
| sound | NOT HAPPY | Regression from T2: holding Space on a step the mouse just clicked starts play *and* toggles the step (accent → off). The keydown handler returned on `e.repeat` before it prevented Space (`app.js:1004`), so the repeats armed the focused step button and the browser pressed it on release. At 50aba0e steps were divs, focus stayed on the page. |
| greta | HAPPY | none (T1–T7 driven on desktop and phone; her "Space on a script-focused step plays" is B8 by design: only a Tab focus hands Space to a control) |
| rio | HAPPY | none (phone: tap cycle, long touch → locks, slot menu save, 44 px heights, playhead) |

SHOULD items recorded (never block): the playhead lit the step it stopped on for 25–90 ms after a restart (verifier,
sound); gauges without a unit in `aria-valuetext` (bars per slot, every, repeat, accent above, sound / lock knobs,
pan "50") (verifier); after a *touch* long-press on a slot the focus ends on the slot, not on "save here", and the menu
can open below the fold (verifier, architect, greta); the Move status shows until the module runs, a flash on iOS
(verifier); selects and the dice seed 31–33 px tall on touch (verifier); right-click on randomize now rolls wild
(sound: the helper treats contextmenu as a long press); three `(pointer: coarse)` blocks and `row-gap` set twice
(architect); `#stepsui` gets its role in JS, `#slots` in the HTML (architect); no modifier-free keyboard route to the
locks / slot menu on a Mac (verifier, architect: no menu key, Shift+F10 does nothing in Chrome on macOS); twelve
disabled "outside the loop" steps in the accessibility tree at length 4 (architect: noise; rio: Tab skips them);
readout still Major Mono 11 px (verifier); "add to chain" on the playing slot makes "chain 3 → 3" (verifier,
pre-existing); Move pads / step buttons / keys still toggle on-off with Shift for accent (sound); the first hit of a WAV
export ~5 dB low, master comp starts cold (sound, pre-existing, phase 10); slot buttons 39 px wide on a phone (rio,
architect); the target floor's specificity (1,1,2) beats component rules (architect); `short()` derives the slider
name from " · " in the label (architect). Tooling notes: CDP reports `valuetext: ""` for every slider (a Chrome / CDP
artefact, the DOM carries it); smooth page scrolling makes taps right after `scrollIntoView` miss (greta), so harness
scripts should scroll with `behavior: 'instant'`. Kept as they are: `aria-pressed` = the step sounds, the accent is in
its name (greta); the lane buttons' names ("lane 1 kick") contain their visible text "1 kick" (rio's label-in-name
worry holds).

### Changes after round 1

- **T2 step targets both ways**: 8 steps in a row (two rows for 16), 4 in a row on a touch screen ≤ 440 px wide (8 × 44
  px + gaps needs a 373 px strip, a 390 phone has 338). Measured: desktop 1440 47.1 × 32 px, narrow desktop 1000
  113.1 × 32, phone 390 touch 82.3 × 44, tablet 820 touch 91.5 × 44. The phone rule `gap: 3px` was also overriding the
  16 px row gap a step's condition label needs (rows are new on phones in this phase) → `column-gap` only; labels end
  1 px above the next row.
- **T6 toggle**: `aria-disabled` + a `connecting` guard instead of `disabled`, so the focus stays on the button
  through Connecting… → Disconnect Move → Connect Move and a second press while connecting does nothing; no
  `aria-pressed` (the words say what it does next, the `role=status` pill says how it went); the Move status starts
  `hidden` in the HTML and is shown only where Web MIDI exists (no flash on iOS); the disabled look covers
  `[aria-disabled=true]`.
- **Held Space**: the page prevents Space's repeats too when it owns Space (`if (e.repeat) { if (e.key === ' ' &&
  !controlOwnsKey(e)) e.preventDefault(); return; }`): play/stop only. A Tab-focused step still takes Space (one press
  per hold, native).
- Quick SHOULDs: `Lane.reset()` forgets `shown`, so a restart lights nothing until a step sounds (not saved);
  `say` on every unit-less gauge (sound knobs and step locks "%", pan "centre" / "30% left", "4 bars", "velocity 100",
  "every 2 loops", "3 mutations", "channel 10"); `longPress` prevents the late `mousedown` a touch sends after a fired
  long press (a mouse's mousedown comes before the hold and passes), and the slot menu scrolls into view
  (`block: 'nearest'`) before it takes the focus; selects and inputs 44 px tall on touch; one `(pointer: coarse)`
  block for the targets (the slot-menu and slot rules folded into the 32 / 44 px floor); `#stepsui` group role in the
  HTML; randomize's title names right-click (kept: contextmenu = long press everywhere).
- Tests: 105 → 107 orbit2 tests (long press: a touch's late mousedown is prevented, a mouse's and a tap's are not;
  `resetAll` forgets the shown step and doesn't save it). `npm run check` clean, `npm test` 107 + 9,
  `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped).
  Browser (5400/9400, one browser per viewport): 32/32: desktop: 8 a row ≥ 32 × 32 and 16 px rows; held Space (1 +
  4 auto-repeats) on a clicked accent step plays and keeps the accent; a Space tap stops; Tab-focused step + held
  Space cycles once, no play; restart lights no stale step, then the playhead runs; valuetexts with units; Tab → Enter
  on the toggle with a 400 ms fake Move: focus kept, aria-disabled during, "Disconnect Move" with fw 2.1.7, one MIDI
  request for two presses, AX plain button without a pressed state, 18+ named sliders with values, 16 step buttons
  with a pressed state; Enter → "Connect Move", focus kept; right-click → slot menu with focus on "save here", Escape →
  back on the slot; no Web MIDI → status hidden. Phone 390 × 844 touch: 4 a row ≥ 44 × 44; taps cycle off → on →
  accent → off; long touch → locks, step unchanged; long touch on a slot → menu on screen, focus on "save here"; save,
  erase; selects / toggle / slots ≥ 44 px; no sideways scroll. Tablet 820 touch: 8 a row ≥ 44. Narrow 1000: 8 a row
  ≥ 32. 0 page errors everywhere; screenshots looked at (desktop two rows of 8; phone 4 × 4 with "1:2" / "×3" labels
  clear of the next row).

## Round 2: 2 of 3 HAPPY

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound), fresh sub-agents in one message, all on the
default model, own ports 5401 / 5402 / 5403 (+ 940x), the verifier also ran the smoke on 9222. Brief as in round 1
(goal, T1–T7 + phase spec, must-fix rule), `git diff --stat 50aba0e..de785ff` (9 files, +396/−89), each one's own
round-1 MUST-FIX and "Changes after round 1". The MUST-FIX was reproduced by the implementer on de785ff (5400/9400,
phone 390 × 844 touch, slot scrolled to the bottom edge, held 700 ms): the page scrolled 1687 → 1823 under the finger
and the lift's click ran the menu: slot 1 overwritten (click@save), slot 4 chained, slot 6 erased, slot 8 closed it.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none. Round-1 T2 fixed: smallest step 47.1 × 32 desktop, 82.3 × 44 phone 390, 74.8 × 44 phone 360, 94.5 × 44 landscape 844, 85 × 44 tablet 768, no sideways scroll. No regressions (held Space, restart, playhead with a rotation at 40–240 bpm, long press / modifier clicks / slot menu, toggle, 39 sliders, 118 touch targets ≥ 44, text ≥ 11 px, contrast ≥ 7.77:1, saved data); check, 107 + 9, smoke 10/10 on 5401. |
| architect | NOT HAPPY | T1 regression from round 1 + data loss: a slot long press runs a menu action by itself on lift. `openSlotMenu` (`app.js:433`) scrolls the menu into view from the long-press timer while the finger is down; the page scrolls smoothly, so it moves under the finger, and `longPress` swallowed the gesture's click only on its own element (`ui.js:47`). The click hit the slot-menu button that slid there: empty slot 1 saved, filled slot 6 **erased** (not undoable), slot 3 added to the chain, filled slot 1 overwritten. At 8e574da (no scroll) and for a slot mid-screen nothing ran. Round-1 T6 fixed (focus kept through a silent 4.7 s handshake and a denied request, one MIDI request for three presses, plain button, status hidden without Web MIDI). |
| sound | HAPPY | none. Round-1 held Space fixed (2 clicks = accent, Space + 4 repeats + up plays, the step keeps its accent and the focus). No regressions (drawer header + held Space, Tab-focused step cycles once, Alt+1–4, `shown` not saved, restart). Playhead 150.2 ms median per step, 0 skips, 0 long tasks on the phone; A/B render of the same pattern 50aba0e vs HEAD: same length, onset, RMS −26.74 dBFS, hat stem bit-identical. |

SHOULD items recorded (never block): after shortening a lane with the locks open on a step now outside the loop, the
step kept `.sel` and `aria-expanded="true"` (verifier: `renderSteps` ran before `renderLocks` closed the panel);
`#dice-seed` 31 px tall on desktop (verifier); the two tune knobs spoke a bare number (verifier, sound); on desktop the
row-2 playhead bar sat on the bottom 3 px of a row-1 condition label (verifier); `Lane.reset()` cleared `shown`, a
field the constructor never declared (architect); a Move that never answers shows "Connecting…" ~4.7 s and then
"ready" with no firmware (architect, pre-existing, the movewire driver); the playhead is drawn at the step's audio
time, so it leads what you hear by the output latency (sound: noticeable on Bluetooth, can't be measured headless; the
orbit visuals and Move LEDs already did the same); the accent barely sounds on hat (+0.3 dB peak) and wood (+1.5 dB),
so the second tap sounds like the first there (sound, pre-existing, hat stem identical at 50aba0e). Tooling note: a
mouse click never leaves the focus on a gauge (both trees), so the new Home/End/Page keys move a knob only after a Tab.

### Changes after round 2

- **The end of a long press is the long press's, wherever it lands** (`orbit2/src/ui.js`): one guard per page
  (`gestureGuard`, capture listeners on the window) is armed when a long press fires while the pointer is held; it
  swallows that gesture's click (keyboard clicks, detail 0, pass) and the late mousedown a touch sends after the lift
  (focus stays on "save here"), and the next pointerdown or key press anywhere disarms it (a browser may send no click
  after a long touch). The element's own click / mousedown swallow is gone (the guard covers it); a right-click or
  the menu key holds nothing down, so it arms nothing. The slot menu still scrolls into view during the hold.
- Quick SHOULDs: `renderSteps` closes the locks of a step a shorter loop left out, so no step stays expanded; the tune
  knobs (lane and lock) say "centre", "N% up" or "N% down"; inputs and selects ≥ 32 px on desktop too (the seed was
  31); step rows 20 px apart (the condition label 15 px + the next row's playhead bar 4 px, now 1 px clear); `shown`
  declared in the `Lane` constructor (runtime, not saved). The rest → BACKLOG "Later".
- Tests: 107 → 108 orbit2 tests (long press with the page as root: the lift's mousedown and click on the menu that
  slid under the finger are swallowed; the next tap counts, also when no click came; a key press disarms; a keyboard
  click passes; a right-click arms nothing; a short press is a tap); it fails on de785ff's helper. `npm run check`
  clean, `npm test` 108 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome
  9222, both stopped). Browser (5400/9400, one browser per viewport): 20/20: phone 390 × 844 touch: the architect's
  repro on slots 1, 4, 6, 8 (page scrolls 1699 → 1835 under the finger): menu open, focus on "save here", every slot
  kept, no chain; then a tap on "erase" erases; long touch on a step opens the locks and leaves it off, the next tap
  cycles it once; long press on randomize = one wild roll; steps 82 × 44, no sideways scroll. Desktop 1440: shortening
  the lane with the keyboard closes the locks, 0 expanded / selected steps; tune "centre" → "10% up", lock tune "10%
  up"; inputs / selects 32–34 px; row-2 playhead bar 1 px below the row-1 "1:2" label; one playhead while playing;
  mouse hold on a step opens the locks, the next click cycles it; right-click on a slot → "save here", Escape → the
  slot; Enter on a focused step cycles it. 0 page errors; screenshots looked at.

## Round 3: 1 of 1 HAPPY, the whole panel HAPPY

Only the reviewer NOT HAPPY after round 2 (architect), a fresh sub-agent on the default model, own ports 5402 / 9402.
Brief as in round 1 (goal, T1–T7 + phase spec, must-fix rule), `git diff --stat 50aba0e..9b30a00` (9 files,
+494/−91), the architect's round-1 and round-2 MUST-FIX and "Changes after round 2". Pre-checks on 9b30a00:
`npm run check` clean, `npm test` 108 + 9.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| architect | HAPPY | none. Round-2 MUST-FIX fixed: own repro re-run on a phone 390 × 844 touch, slots 1, 4, 6, 8, 9, 13, 16 at the bottom edge, filled and empty, held 700 ms (some again for 1300 ms): the page scrolls 1797 → 1930 / 1845 → 1930 under the finger, the lift's mousedown and click on save / chain / erase / × are cancelled by the guard, bank and machine JSON unchanged, menu open for the right slot, focus on "save here"; the next tap is the user's ("erase" erased 6, "save here" saved 8, "add to chain" made 8 → 4, a plain tap on slot 1 loads it); with no click after the hold the next tap's pointerdown resets the guard. No regression from the round-2 changes (mouse hold on a step, right-click on a slot arms nothing, Enter on "save here", phone long touch on a step, a shorter loop closes the locks, tune spoken, 32 px floor, `shown` not saved); check, 108 + 9, 0 page errors. |

SHOULD items recorded (never block): a long touch on an *empty* slot whose menu slides the disabled "add to chain" or
"erase" under the finger drops the keyboard focus to `<body>` (Chrome sends a disabled button no mousedown, so the
guard can't cancel it, yet the focus still moves; nothing runs or is lost, but Escape no longer reaches the menu);
`renderSteps` and `renderLocks` both close a step a shorter loop left out (duplication); `cdp.mjs`: `p.key('Enter')`
sends no `text`, so Enter never presses a button (a review's Enter check can pass without doing anything), and
`send()` / the page socket have no timeout (a scratch run hung without output).

### Changes after round 3

All four SHOULDs were quick, so they are done (nothing new for "Later"):

- **Slot menu**: "add to chain" and "erase" of an empty slot are `aria-disabled` (the Move toggle's pattern), not
  `disabled`, and the menu ignores a press on them. A finger lifting on one now sends its mousedown and click like on
  any button, so the gesture guard cancels them and the focus stays on "save here". They stay in the Tab order, the
  accessibility tree calls them disabled, and they look as before (`button[aria-disabled=true]`).
- `renderLocks` no longer repeats the clamp: its three callers (`sync`, `editLocks`, `stepEdited`) run `renderSteps`
  first, which closes a step a shorter loop left out.
- `orbit2/tools/cdp.mjs`: `key('Enter')` sends `text: '\r'`, so it presses a focused button; every CDP call fails
  after 30 s instead of hanging (`eval` 120 s, or `eval(expr, { timeout })`), the page socket after 10 s; a raced call
  that times out later doesn't crash the script.
- Tests: no new unit test (the menu is DOM in `app.js`, the harness needs Chrome). `npm run check` clean, `npm test`
  108 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both
  stopped). Browser (5400/9400, one browser per viewport): 51/51. Before the fix (9b30a00, phone 390 × 844 touch):
  empty slots 11–14 at the bottom edge, held 700 ms, the finger ends on the disabled "add to chain" / "erase" and the
  focus on BODY. After: the finger ends on the aria-disabled buttons and the focus stays on "save here" for all eight
  empty slots 9–16, nothing saved; a tap on the aria-disabled "erase" / "add to chain" does nothing and keeps the menu;
  "save here" saves and focuses the slot; the round-2 repro on filled slots 9–16 runs nothing (bank unchanged); a long
  touch on a step opens its locks, the next tap cycles it once. Desktop 1440: `p.key('Enter')` cycles a focused step;
  right-click on an empty slot → "save here", Tab reaches the aria-disabled "add to chain" (AX: button, disabled,
  focusable), Enter on it and on "erase" does nothing, Escape → the slot, Enter on "save here" saves, a filled slot
  erases by keyboard; length 16 → 11 with the keyboard closes the locks on step 12 (0 expanded / selected), locks
  reopen on step 4; an eval that never settles fails after its 1.5 s timeout and the next eval answers. 0 page errors;
  screenshots looked at (the empty slot's menu shows "add to chain" / "erase" dimmed).

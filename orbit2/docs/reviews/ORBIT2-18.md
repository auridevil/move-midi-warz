---
type: review
phase: ORBIT2-18
title: ORBIT2-18 parameter automation (A1–A7), review panel
date: 2026-11-13
round: 1
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  kai: HAPPY
  dex: NOT HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[automation]]'
  - '[[ORBIT2-17]]'
---

# ORBIT2-18 · Parameter automation: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), kai, dex. Process: [[REVIEW-PANEL]]. Spec:
[[automation]] (`orbit2/docs/design/automation.md`, with an "As built" section).

Phase start: `d60e3a2` (ORBIT2-17 closed). Commits: `ec53b73` (design note), `d10eb94` (model + playback), `c05c418`
(recording), `ba2c1d7` (exports, links, slots), `af7aa1f` (tests and browser check).

## For the brief: where the new things are

| item | model / logic | on screen / input |
| --- | --- | --- |
| A1 step automation | plain step locks: `Lane.recordStepValue(si, k, v)` (= `setLock`); keys decay, snap, color (sound knobs), tune, chance (`prob`, lane knobs), and every lock-panel key while recording | written by the clock (`app.js` `autoRecordTick`, before `liveQuiet`) on the steps a tick decides (own + early), only steps with a hit |
| A2 smooth automation | `lanes.js`: `AUTO_KEYS` tone drive pan send level, `lane.auto = { loops, len, <key>: 64-level string }` (8 points per step, ≤ 1024 per curve), `autoFrom` / `autoHalf` / `autoChar`, Lane `autoAt`, `autoTop`, `recordCurve`, `widenAuto`, `spanAuto(±1)`, `clearAuto(k?, kind?)`, `automates`; `loopsPerCycle` counts `auto.loops`. `export.js`: `autoRamps(m, from, to, origin)` → `{ li, k, t (tick), v }` on the 35-tick block grid; `expandHits` puts `auto` (every curve value at the hit's time) on each hit | `app.js` `rampAuto` per block line in `onTick` (jump / ramp / flat-run re-anchor), `applySound` leaves curve params to the clock (live kit, playing), drive = wet over a shaper at the curve's top (`driveWet`), every hit sets its curve params at its time |
| A3 recording | `knobGest` (`gestStart` / `gestMove` / `gestEnd`), `handTurn` / `handHold` / `handLetGo`; `rec.knobs` off / touch / latch (settings); `save()` deferred while a gesture records, one own undo step at its end; latch = until one span / lane loop after the start; hand = `liveTick({ hand })` over locks and curves + ramp skip + param glide | Record drawer: ● arm record + "knobs off · touch · latch"; any sound gauge, the lane tune / chance gauges, the lock-panel gauges (recording only) |
| A4 see + clear | `autoParams`, `renderAuto`, `drawStrip` (offscreen-cached), `autoFrame` (once per frame), `autoEdit` | "A" on automated gauges (`gauge.js` `setMark`), the strip under the steps (`#auto-strip`: picker, ½, ×2, clear, clear lane automation), gauges follow what plays |
| A5 everywhere | renders: `renderPattern` schedules `autoRamps` from the line before tick 0 through the tail; jam ring-out replays logged ramps (`jam.ramps`, `replayRamps`); chains `collectChainRamps`; links `encodeShareFit` (`LINK_MAX` 4000: half resolution, then no curves, with a note) | share toast / export status name a reduced link |
| A6 Move | `encoderTouch` 0–7 fixes the parameter at touch time (Shift = sound); turns without a touch end 400 ms after the last | touch + Record = knobs mode; touch + Delete = clear that knob's automation; Move panel rows |
| A7 MIDI | `midiio.js` `AUTO_CC` (tone 74, decay 75, snap 73, color 71, tune 16, drive 17, level 7, pan 10, send 91), `ccFrom`, `PolyMidi.cc`; `export.js` `autoCCs`, `collectChainAuto`, `hitsToMidi({ ccs })`; `smf.js` `part.ccs`, `readMidi` → `ccs` | MIDI drawer: a CC gauge per key (0 = left out); merge (one Drum-Rack track) = notes only, the status says so |

Page handles: `__poly.knobGest`, `setKnobs`, `renderAuto`, `autoEdit`, `heardStep`, `move` (`move.receive([...])` for
Move bytes), plus `m`, `sync`, `setRec`, `undo`, `redo`, `renderPattern`, `exportWav`, `exportStems`, `exportMidi`,
`exportAll`, `toggleJam`, `stopJam`, `downloadJam`, `shareUrl`, `saveSlot`, `recallSlot`, `stress`, `setEngine`, `hist`.
Tests: `orbit2/test/automation.test.js` (25).

## Pre-checks

`npm run check` clean, `npm test` 254 + 9 green, `node tools/smoke.mjs` all pages ok on `af7aa1f` before the panel.

## Round 1: 1 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; kai, dex on sonnet), own ports 5401 /
5402 / 5403 / 5404 / 5406 (+ 940x; the phase start `git archive d60e3a2` on +100), the verifier also ran the smoke
(server 5451 + Chrome 9222). Brief: the phase goal, A1–A7 verbatim from [[BACKLOG]], the spec ([[automation]]), the
"where the new things are" table above, `git diff --stat d60e3a2..HEAD` (12 files, +1151/−102), `git status --short`
(only this file), the must-fix rule, how to drive `orbit2/index.html` with `orbit2/tools/cdp.mjs` (Move bytes, gauge
gestures, rebuilding voices after `setVoice`) and how to run the phase start. `stalled: 0`: nothing was open before
round 1.

| reviewer | verdict | MUST-FIX |
| --- | --- | --- |
| verifier | NOT HAPPY | 1 NEW (regression): at 390×844 the page scrolls sideways (`scrollWidth` 393 vs 390 at the phase start) with the MIDI drawer open: the new A7 label (`index.html:210`, "automation in the MIDI export: CC per parameter (0 = left out)") is a `.ctl-lbl`, `white-space: nowrap` (`styles.css:538`) |
| architect | NOT HAPPY | 1 NEW (regression): the Move's ◀ ▶ LEDs are never lit: the comment `// A3: blinks while a gesture records` sits mid-line in `paintLeds` (`app.js:1910`), commenting out `setButtonColor('left' / 'right', …)` (stubbed `setButtonColor`: d60e3a2 lights `left right`, HEAD doesn't). 2 NEW (A3 / regression): un-armed, a gauge turn while playing writes the gauge's shown value (`autoFrame` shows the played lock / curve value) as the lane value: decay 0.30 with 0.90 locks, one Shift+ArrowUp → lane decay 0.91 (phase start: 0.31); the Move's relative turn gives 0.93, so the two inputs disagree |
| sound | NOT HAPPY | 1 NEW (A3): letting go of a touched knob clicks: `gestEnd` nulls the ramp state and starts a 30 ms glide, then the next block line's `setValueAtTime` cuts it with a jump: a level curve 0.3→0.6, hand at 0.617, release → 53 ms later a step (second-difference spike 0.235 vs 0.029 in the untouched bar, −4.4 dB across ±20 ms); grows with the hand–curve distance |
| kai | HAPPY | — |
| dex | NOT HAPPY | 1 NEW (A5 / A7): a chain's MIDI never re-anchors a slot's automation at the slot boundary: slot 0 (tone curve + decay locks) then slot 1 (none): slot 1's 16 kick notes carry no CC, so a DAW plays them with slot 0's last values (CC75 114, CC74 112) instead of the lane values |

SHOULDs (never block): a recording gesture cut by a queued slot switch makes the switch's undo step lose its `load`
flag (`gestEnd`'s deferred `sync` commits the new slot first) (verifier); `lane.auto`'s key order follows the recording
order but `autoFrom` rebuilds it in `AUTO_KEYS` order, so after an undo the next mute makes a no-op undo step
(verifier); INFO 'pitch pads' lost a space ("Live record:the 8 pads") (verifier, architect); `collectChainRamps` is used
by tests only (verifier, architect); `logHit` trims with a `splice` on every push once full: with 6 × 5 moving curves
logged for a ring-out, up to 0.35 ms per block (architect); the gesture state machine lives in `app.js`, tested by
source regexes only (architect); the last block of a pass is written past a latch end / before a span doubles (≤ 1
block wraps onto the gesture's first points) (architect); pad, audition and live-record hits ignore curves (the filter
jumps to the knob until the next block line) (architect); `autoParams` and `Lane.automates` define "automated"
differently, lock units → 0..1 twice (`unitOf`, `cc7`) (architect); step CCs also for modulator / dice / scale-snap
values, which Decision 6 limits to keys with locks (an old scale-snapped pattern gains CC16) (architect); clearing a
curve while playing pops (+18.8 dB at once, `holdParam`) (sound); a tone lock on a lane with a moving tone curve lasts
until the next block line (as the spec says, but the lock panel doesn't) (sound); 64 levels = 6.7 % cutoff steps on
slow rides (sound); in touch mode a resting finger writes the played value (kai); a slot switch mid-gesture and fills
untested (kai); `recordCurve(…, s1 = length)` lands the end value on point 0 (a full loop wraps: the last span wins)
(dex); slices export as one note (dex, from before the phase); stems are not byte-deterministic between two renders
(dex, from before the phase).

### Changes after round 1

- **MUST-FIX verifier 1, phone sideways scroll.** The MIDI drawer's A7 label is `.ctl-lbl.wrap` (`white-space: normal`):
  at 390×844 with every drawer open `scrollWidth` is 390 again.
- **MUST-FIX architect 1, ◀ ▶ LEDs.** `paintLeds` sets `left` / `right` again, the record comment after the calls; a
  test pins that no comment comes before them on that line (stubbed `setButtonColor`: `left`, `right`, `record` lit).
- **MUST-FIX architect 2, un-armed gauge turns.** `gauge.js` `onChange(value, before)`; a gesture keeps where the hand
  (`v0`) and the lane value (`lane0`) started; `handTurn` returns what the knob's own edit writes: nothing while it
  records, else the lane value moved by the turn (`lane0 + v − v0`), as the Move's relative knobs do; `sync` leaves the
  gauge a hand holds to the hand (`handGauge`). Measured (decay 0.30 under 0.90 locks, playing): Shift+ArrowUp → 0.31, a
  15 px drag → 0.41, the locks untouched.
- **MUST-FIX sound 1, the click on release.** `autoHandoff`: from the param's value now (`getValueAtTime`) to the curve
  in 30 ms (exponential on the filter), the hits already scheduled with the hand's value cancelled on that param, and
  the clock's ramp state starts at that point, so the next block line ramps on instead of jumping. Measured on the live
  level param after a hand at 0.6 lets go of a 0.3 curve: 0.376 → 0.109 in 30 ms, largest step 0.011 per ms, then flat
  at the curve (0.108). Clearing a curve while playing (`autoEdit`) glides the same way instead of `holdParam`'s jump
  (`applySound(li, kit, soft)`).
- **MUST-FIX dex 1, chain MIDI.** `collectChainAuto` sets every (lane, key) the chain automates anywhere at the start of
  each slot that doesn't automate it, with that slot's lane value (CC entries carry their key `k`). Test: slots A (tone
  curve + decay locks) → B (none) → A: B starts with CC74 32 and CC75 64 and nothing else, A's curve starts again.
- SHOULDs done: step CCs only for keys a lane has locks of (Decision 6; a scale-snapped lane without locks sends none,
  tested); `lane.auto` saved in `AUTO_KEYS` order (`autoJSON`: a reload saves the same bytes, no no-op undo step); a
  gesture ended from the clock (a slot, evolve's way home) leaves the redraw to the caller, so the slot's undo step keeps
  its load flag (measured: `hist.cur.load` true); the span doubles before the points past it are written and nothing is
  written past a latch's end; a live pad hit lands on the lane's curves; `logHit` trims in one-second batches; 'pitch
  pads' text; the Move panel says touch mode writes while a knob is held still. The "As built" section of [[automation]]
  follows.
- Not done (SHOULD): the gesture machine stays in `app.js` (tested through the browser and source pins);
  `collectChainRamps` kept as the chain sampler the tests read; `autoParams` keeps listing locks on silent steps (they can
  still be cleared there); tone lock vs a moving curve as the spec says; 64 levels; resting-finger writes are touch
  mode by design (now in the panel text).
- `npm run check` clean; `npm test` 257 + 9 green (+3: chain CC anchors, locks-only step CCs + key order, the LED line);
  `node tools/smoke.mjs http://localhost:5400` all pages ok (serve.py 5400 + headless-chrome.sh 9222, both stopped).

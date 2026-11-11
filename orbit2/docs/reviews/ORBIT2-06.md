---
type: review
phase: ORBIT2-06
title: ORBIT2-06 clock resolution and meter (R1–R4), review panel
date: 2026-11-11
round: 2
stalled: 0
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  ines: HAPPY
  kai: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-05]]'
  - '[[clock-resolution]]'
---

# ORBIT2-06 · Clock resolution and meter: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), ines, kai. Process: [[REVIEW-PANEL]].

Phase start: `9f436da` (ORBIT2-05 closed at `c6bd5e9`; `9f436da` only made the test browsers silent). Implementation
commits: `1f0a5ad` (design note [[clock-resolution]]), `1a5a7f2` (R1, R2), `ee0036d` (R3, R4), `a91e5e1` (tests and
browser check).

## For the brief: where the new things are

| item | model / audio | on screen | Move |
| --- | --- | --- | --- |
| R1 840 PPQ | `PPQ = 840`, `MIDI_DIV = 35`, `Lane.stepTicks()` (`lanes.js`); the master clock in `app.js` (`onBlock` → `onTick`): the Tone.Loop still fires 24 times per beat, each call is a block of 35 ticks, `liveQuiet()` (`export.js`) skips ticks where nothing can happen; `collectHits` renders a copy of the machine at `PPQ`; MIDI clock out `PolyMidi.clockAt` (one per block), clock in (phase lock) compared in MIDI ticks (`app.js` `pmidi.handlers.tick`) | stress meter with `?debug` | — |
| R2 ratios | `RATIOS` / `RATIO_LABEL` = `¼ ⅓ ½ ⅔ ¾ 1 5/4 4/3 3/2 7/4 2 3 4 5 6`, `OLD_RATIOS` (the pre-R2 table), `ratioIndexOf`; a lane saves `ratio` (the value) next to `ratioIndex`, `Lane.from` maps a save without `ratio` through `OLD_RATIOS`; evolve moves on `EVOLVE_RATIOS`; `Machine.cycleTicks` in integer ticks | lane drawer "speed ×" gauge (15 positions); a line in the help dialog | the speed knob, as before |
| R3 meter | `METERS`, `meterParts`, `barTicks`, `Machine.meter` / `setMeter` / `barTicks()`, saved with the pattern (missing = 4/4); `app.js` bar anchor `bars = { at, len }` + `trackMeter()` (a new meter starts on the next bar line of the old one); `SlotBank.due/nextSwitch(…, bars)` + `onBar` (`slots.js`); chains (`collectChain`, `chainSixteenths`, `export.js`); evolve every N bars; jam start / stop / cap by the take's bar (`jam.bar`); exports `renderTicks()` / `acidOf()`; `withAcid({ num, den })` (`jam.js`); MIDI FF 58 (`punch/smf.js` `writeMidi({ meter })`, `hitsToMidi({ meter, sixteenths })`) | Patterns drawer: "meter" control; the readout shows the meter when it is not 4/4; nerd stats "meter" | — |
| R4 loop counter, PRE / NEI | `Lane.loopAt(step)` (runtime `loopN` / `lastStep`, reset on Play and `reset()`; a fresh lane counts from the absolute step), `peek()` restores it; `CONDS` + `pre`, `nei`; `condPasses(cond, loop, fill, prev)`; `lastCond` set by every active step with a real condition (muted too) | step lock panel (long-press, right-click or Alt+click a step): two more chips, "if last passed" / "if last failed" | — |

## Pre-checks

`npm run check` clean, `npm test` 138 + 9 green on `a91e5e1` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; ines, kai on sonnet), own ports
5401 / 5402 / 5403 / 5407 / 5404 (+ 940x, phase-start copies `git archive 9f436da` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, R1–R4 verbatim from [[BACKLOG]], the phase spec (the three build tasks), the
"where the new things are" table above, `git diff --stat 9f436da..a91e5e1` (10 files, +535/−182), `git status --short`
(only this file), the must-fix rule with the later phases' ids, how to drive `orbit2/index.html` with
`orbit2/tools/cdp.mjs` (`__poly`, MIDI out / clock in without a device, Move through `move.emit`, the model in Node)
and how to run the phase start. `stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) R3: next-bar switching and chains between meters start the incoming pattern off its bar line. `Lane.at` counts steps from tick 0 (`lanes.js:198`); a slot load only moves the bar anchor (`app.js:206` → `trackMeter`), `collectChain` the same (`export.js:95`). Chain [7/8 (×2, 7 steps, kick on 1), 4/4 (×1, 4 steps, kick on 1)], 1 bar each, 240 bpm, MIDI captured live: kicks at beats 0, 4, 10.5, 12 (expected 0, 3.5, 7.5, 11, the bar lines); `collectChain` the same. (2) R3: evolve every N bars skips the bar line where a new meter starts: `trackMeter` sets `bars.at = t`, then `t > bars.at` is false (`app.js:208`). Every 1 bar, 4/4 → 3/4 at tick 7490 (anchor 10080): evolves at 3360, 6720, 12600… (expected 10080 too). (3) R4: undo mid-play resets the loop counter to the absolute count (`Machine.assign` makes fresh lanes): ×1, 4 steps, 1:2 on step 1, length 3 at beat 10.3, undo at beat 18.5: loop 5 twice across a wrap, the 1:2 step rests two loops running. |
| architect | NOT HAPPY | (1) R3, the same root cause as the verifier's (1): after a meter change (the control during play, a next-bar slot, a chain) a pattern doesn't start on its own bar lines. `collectChain([7/8, 4/4, 7/8, 4/4], { bars: 2 })`, each lane one bar of its meter with a kick on step 1: bar lines 0 · 1.75 · 3.5 · 5.5 · 7.5 · 9.25 · 11 · 13 s, kicks 0 · 1.75 · 4 · 6 · 8.75 · 10.5 · 12 · 14 s. Live (5402): 4/4 → 7/8 at tick 3780, anchor 6720, kicks 2100 ticks (5 eighths) after every 7/8 bar line until Stop / Play. (2) R4: undo, redo and evolve's way home (`applyState` `app.js:571`, `evolveNow` `app.js:580`, both `m.assign()`) build fresh lanes: the count jumps and the PRE / NEI memory goes. L4 lane, 1:2 on step 1, length 5 at step 22: in place s25 plays, s30 rests, s35 plays; after `m.assign(m.toJSON())` step 40 plays right after 35. |
| sound | NOT HAPPY | (1) R3, the same root cause: `collectChain([A 7/8, B 4/4, A, B], { bars: 1 })` (A ×2, 7 steps, kick on 1; B ×1, 4 steps, kick 1, snare 2 and 4): measured from each bar line, B's first pass kick +0.5, snares +1.5 / +3.5 beats; A's second pass kick +3 (last eighth); B's second pass snare on the downbeat. Live 4/4 → 7/8 → 4/4: `bars = { at: 6300, len: 3360 }`, every later bar line half a beat before step 1 until Play. |
| ines | HAPPY | none (60 random old patterns: identical hits; length change mid-play keeps 1:2; PRE / NEI table; clock out 24 per quarter at 160 bpm; 7/8 → 3/4 anchor on the old bar line; 7/8 WAV 4 bars = 5.250 s) |
| kai | HAPPY | none (old data identical; ×5/4 L5 hit every 2000 ms; a next-bar switch 7/8 → 4/4 lands on a 7/8 bar line; 5/4 during play moves the anchor to the next 4/4 bar line; 1:2 across 4 → 5 alternates; PRE / NEI table; an unknown meter → 4/4) |

The implementer reproduced each MUST-FIX on `a91e5e1` before fixing (Node, the model + the app's `trackMeter` rule):
chain [7/8 ×2 L7, 4/4 ×1 L4] → kicks at beats 0, 4, 10.5, 12; a 1-step ×1 lane in the chain [4/4, 7/8, 4/4] has its
third slot's downbeat at 4 s, not on the bar line at 3.75 s; evolve with the anchor rule skips the tick the anchor
lands on; `m.assign(m.toJSON())` after a length change replays loop 8 (step 40 after step 35).

SHOULD items recorded (never block): PRE / NEI read whether the last condition *passed* (probability and mutes don't
count, as on Elektron boxes where only a condition counts) but the step text says "played" / "did not" (verifier);
the key `nei` says "previous failed", which is Elektron's /PRE (NEI is the neighbour track there): saved keys are hard
to rename later, `not pre` matches `not fill` / `not first` (architect, ines); PRE / NEI look past other PRE / NEI steps
(kai: Elektron's PRE reads them too — it doesn't: PRE skips earlier PRE / !PRE trigs there as well, so this stays); a
speed change mid-play still jumps the loop counter (×1 → ×2: loop 2 → 5; evolve "everything" changes speed on its own)
(verifier, sound, ines, kai), and after a long → short length change a slower speed can take the count below 0, where
`a:b` and "after 1st" never pass (ines); the chain MIDI file has only the first slot's time signature (verifier,
architect, sound, kai); `trackMeter` parses the meter string on every one of 840 ticks per beat (architect); the bar
anchor, the jam stop rounding and `acidOf` are logic in `app.js` without tests (architect); evolve's speed moves differ
for lanes outside ⅔…×3 (from ¼ up now ¾, was ⅔; from ×4 down now ×2, was ×3), so a locked-dice evolve of such an old
pattern changes (architect); with early-pushed or nudged lanes `liveQuiet` runs the full lane update on 749–840 ticks
per beat (307–327 µs per beat vs 46–55 before; stress level 0, headroom 76 ms) — ticks whose early step is already
decided could be skipped too (verifier); `collectHits` walks every fine tick (a 64-bar busy render 3.6 → 27 ms)
(architect); the ACID tag for /8 meters counts beats in eighths with a quarter-note tempo (a 1-bar 7/8 file at 120 bpm
is 1.75 s, 7 beats at 120 would be 3.5 s): check in Live and Reaper (verifier, architect, sound); the MIDI file's 96
PPQ rounds the new tuplets (×5/4 note-ons 0 / 77 / 154 / 230 / 307, exact 76.8·k, ≤ 2.1 ms at 120 bpm) (sound,
phase 10); the phone's floating play covers half of the 12/8 chip (verifier; the Later item "Floating play over
content"); the clock-in phase-lock trim seemed to outlive Follow lock (sound, unchecked against the phase start).

GOOD: old data plays exactly as before (verifier: 300 random phase-start patterns, 68,059 hits, and 60 old links
identical, cycles exactly ×35; architect, ines, kai: 60 patterns each; sound: an old link's 2-bar render, same frames
and ACID, lag 0–1 sample); the clock is exact and cheap (MIDI clock out 24 per quarter at 120, 160 and 240 bpm; WAV
onsets of ×5/4, ×7/4, ×4/3 and ×6 on the sample grid; `liveQuiet` vs `liveTick` 0 violations in 53,760 ticks;
headroom and script time as at the phase start); meter exports and jam takes are sample-exact (7/8 bar 77175 frames,
FF 58 7/3/12/8, jam 7/8 185220 frames).

### Changes after round 1

- **A pattern in a new meter starts on its own bar line** (verifier 1, architect 1, sound 1): the lanes count their
  steps from the bar anchor, `Machine.origin` (runtime; `setOrigin`). The app moves it with the anchor (`trackMeter` →
  `trackBars`, now pure in `slots.js`), so the meter control during play, a next-bar slot and a chain step in another
  meter all start the pattern on step 1 at the new bar line. With one bar length since Play the origin stays 0, so old
  data and every ORBIT2-05 test are unchanged; a switch within the same bar length goes on counting (polymeter lanes
  run through it, as before). `collectChain` moves the origin by the same rule (`collectHits({ origin })`), so the render
  is what plays live. `liveTick` / `liveQuiet` / live record count from the origin while `ahead`, `skip` and `cut` stay
  on the master tick; the cut also stops at a pending anchor (`bars.next.at`), so no early decision spans a move. The
  "full cycle" switch, the bloom and the "aligns in" text count from the origin too. The repros: chain [7/8, 4/4, 7/8,
  4/4] kicks at beats 0 / 3.5 / 7.5 / 11 (were 0 / 4 / 10.5 / 12); the sound engineer's snares at +1 / +3 of each 4/4
  bar; page (5400/9400, 240 bpm, ×2 7-step kick, 7/8 clicked mid-bar): kicks at 6720 (the anchor), 9660, 12600, 15540,
  18480 on the MIDI-clock grid (before the change 0, 2940, 5880).
- **Evolve counts every bar line** (verifier 2): `barN` counts the bar lines since Play as they come, in whatever
  meter, and evolve runs on every N-th (its dice stream is `1000 + barN`, as before in 4/4). Page: evolve calls at
  3360, 6720 (the anchor), 9660, 12600, 15540, 18480 (the anchor was skipped).
- **Undo, redo and evolve's way home keep the loop count** (verifier 3, architect 2): `Machine.assign(json, { keep })`
  carries `loopN`, `lastTick` and `lastCond` lane by lane; `applyState` and `evolveNow`'s home branch pass it. A slot
  load or a link still starts fresh (the absolute count, as the chain render). The architect's repro: step 40 is loop 9
  after loop 8 (was 8 twice). Page: an undo during play keeps `[loopN, lastTick]` on the new lane.
- **Quick SHOULDs done.** The R4 counter keeps the tick it last stepped on (`lastTick`, not `lastStep`): a speed change
  counts only the wraps it crosses (×1 → ×2 at beat 10: loop 2 → 3, was 2 → 5) and the count never goes back, so it
  can't fall below 0 (ines' long → short length then slower speed: was −4) (verifier, sound, ines, kai). PRE / not PRE:
  the saved key `nei` is now `not pre` (architect, ines: Elektron's NEI is the neighbour track; "previous failed" is its
  /PRE), and the texts say "passed / failed its condition" and that probability and mutes don't count (verifier). A
  chain's MIDI file has a time signature wherever a slot changes it (`chainMeters`, `writeMidi({ meters })`; page: 7/8
  at 0, 4/4 at 1344) (verifier, architect, sound, kai). `barTicks` is a table lookup (no string parsing on 840 ticks
  per beat) (architect). The bar anchor rule is pure and tested (`trackBars`) (architect). Evolve's speed moves are the
  pre-R2 ones for the old speeds (¼ → ⅔ either way, ×4 → ×3 either way; 5/4, 4/3, 7/4 step to a classic neighbour)
  (architect). `liveQuiet` also skips ticks whose early step is decided already: on a pushed, nudged, humanized 4-lane
  machine the lanes run on 72 of 6720 ticks (the rule before: 1262), with the same hits (verifier). The meter tooltip
  says a change restarts the pattern on step 1.
- Not changed: PRE looking past other PRE steps (kai) is what Elektron boxes do too (PRE skips earlier PRE / !PRE
  trigs there). Later → [[BACKLOG]]: ACID beats in /8 meters (check in Live and Reaper), the MIDI file's 96 PPQ,
  renders walking every fine tick, jam / ACID maths in `app.js` without tests, the clock-in trim after lock, the
  floating play over the 12/8 chip (added to "Floating play over content"), a new meter's early step 1 (added to "The
  next slot's early first step").
- Tests (144 orbit2: 6 new, 3 updated; all 6 new and the 3 updated fail on `a91e5e1`). New: chains on the bar lines +
  live clock = render over 7/8 → 4/4 → 6/8 → 4/4 with nudges, a push and humanize (`trackBars` + `setOrigin` + slots +
  `liveTick` vs `collectChain`); `trackBars` (wait, cancel, change again, at once on a bar line, every bar line counts);
  R4 through `assign` keep / fresh, a speed change, never below 0, an origin move = one wrap; chain MIDI meters; evolve
  speed moves; the clock's skip plays the same hits. Updated: the R3 chain times (third slot on its bar line at 3.75
  s), `peek` restores `lastTick` (the old check compared two undefined), `not pre`. `npm run check` clean, `npm test`
  144 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped).
  Browser (5400/9400, one browser per viewport, `/tmp/orbit2-impl/`, deleted): 11/11, the page checks above plus the
  "if last failed" chip storing `not pre`, 390×844 tap on 12/8 (44 × 44, readout "12/8", no overflow), 0 page errors;
  screenshots looked at. `app.js` 1222 → 1221 lines.

## Round 2 (re-check): 3 of 3 HAPPY, the whole panel HAPPY

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound), fresh sub-agents in one message on the default
model, own ports 5401 / 5402 / 5403 (+ 940x; the phase start `9f436da` on +100 and the code before the round-1 fixes
`a91e5e1` on +200), the verifier also ran the smoke on 9222. Brief as in round 1 (goal, R1–R4, the phase spec, the
"where" table plus what round 1 added, the must-fix rule with the later ids and the BACKLOG "Later" items), `git diff
--stat 9f436da..a4a7e17` (12 files, +868/−202), each one's own round-1 MUST-FIX and "Changes after round 1", with the
instruction to confirm their items first with the same repro, then check nearby, anything new only in scope and
marked NEW. Pre-checks on `a4a7e17`: `npm run check` clean, `npm test` 144 + 9. `stalled: 0`: every round-1 MUST-FIX
is closed.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none. (1) FIXED: chain [7/8, 4/4] live at 240 bpm, kicks at beats 0, 3.5, 7.5, 11, 15, 18.5, 22.5, `m.origin` 0 / 2940 / 6300 / 9240 / 12600 / 15540 / 18900 (`a91e5e1`: 0, 4, 10.5, 12…); `collectChain` the same; live MIDI vs the render 12 / 12 notes; a next-bar switch 4/4 → 7/8 queued at 5000 plays its kicks at 6720, 9660, 12600, 15540 (`a91e5e1`: 8820…). (2) FIXED: evolve at 3360, 6720, 10080, 12600, 15120, 17640 (`a91e5e1` skipped 10080). (3) FIXED: undo at beat 18.5 and a redo at 22.5, the 1:2 step alternates `18:L5- 20:L6+ 24:L7- 27:L8+` (`a91e5e1`: `18:L5- 20:L5-`). Nearby: the meter clicked mid-bar with a lane pushed −20 ms (its step 1 20 ms before the new bar line, the outgoing steps after it never play); undo across a meter change keeps the count through both origin moves; 150 phase-start patterns identical (order-insensitive); chain MIDI 7/8 · 4/4 · 7/8 at 0 / 336 / 720; check, 144 + 9, smoke 10/10, 0 page errors. |
| architect | HAPPY | none. (1) FIXED: `collectChain([7/8, 4/4, 7/8, 4/4], { bars: 2 })` kicks on the bar lines 0 · 1.75 · 3.5 · 5.5 · 7.5 · 9.25 · 11 · 13 s; live (5402) meter control 7/8 at tick 3920: kicks 0, 2940, 5880, 6720, 9660…, `bars = { at: 6720, len: 2940 }`, origin 6720, after Play again 0; a next-bar slot and a chain over 5 bars: live = render 31 / 31; 40 / 40 random old patterns with the meter clicked mid-bar = old render + new render from the anchor. (2) FIXED: L4 lane, 1:2 + `pre`, length 5 at step 22, `assign(…, { keep: true })` at 36: `35:8x 37:8x 40:9. 42:9. 45:10x` (as with no assign); live with evolve home every 2nd bar and an undo: the count goes up by exactly 1 per wrap, the PRE step follows its 1:2 in every loop. Nearby: 150 phase-start patterns identical (9,160 hits); the per-tick work 222 µs per beat (359 at `a91e5e1`). |
| sound | HAPPY | none. (1) FIXED: the chain render, kicks +0 from every bar line, the 4/4 snares +1 / +3, at 44.1 kHz frames 0 / 77175 / 165375 / 242550 (the bar lines); live chain at 240 bpm every note within ±10 ticks of its bar-line tick (was ≥ 420 off); 4/4 → 7/8 → 4/4 by the control: origin 6300, a jam armed for the return starts at 6300 and is exactly 2 bars (96000 frames at 48 kHz) with the kick on frame 8. Nearby: a swung ×2 lane after a 7/8 bar plays a straight downbeat (was 62.5 ms late); 60 random 4/4 chains = the phase start (3902 hits, ≤ 7e-15 s); 120 single renders in all 6 meters = `a91e5e1`; headroom 74 ms, stress ~0. |

SHOULD items recorded (never block): `collectHits` sorts by time only, so hits at the same instant can come out in
another order than at the phase start (21 of 150 old patterns looked different order-sensitively; same hits) — ties by
lane would make digests stable (verifier); a step saved with the in-phase key `nei` loads as an unknown condition and
never plays — `nei` never left this machine (main is ahead of origin, not pushed) (verifier, information); NEW:
evolve's way home into another meter on a bar line starts its bars a bar late, since nothing re-tracks the meter after
`evolveNow` (architect; confirmed from the rule, not in the page); NEW: `collectChain` repeats the anchor rule
instead of using `trackBars` (architect); NEW, taste: `++barN` inside the evolve condition makes the count depend on
the order of the `&&` terms (architect).

GOOD: one runtime value (`Machine.origin`) moved only by the pure, tested `trackBars`, the same rule live and in the
render (verifier, architect); old data untouched, the origin stays 0 with one bar length since Play (verifier,
architect, sound); the R4 counter only goes up and survives undo, redo and origin moves; a chain's MIDI time signatures
sit exactly on the kicks; the audio path is cheaper than before the round (architect, sound).

### Changes after round 2

- **Evolve's way home starts its meter on the bar line** (architect's NEW SHOULD): `onTick` calls `trackMeter(t)`
  after `evolveNow`, as after a slot load. Reproduced on `a4a7e17` first (page 5400/9400: evoSnap in 4/4, 7/8 set while
  evolving, home after 2: the restored 4/4 waited in `next` and started at 12600, a 7/8 bar after the home at 9660);
  now its bars start at 9660.
- **A jam that starts with a switch into another meter counts that meter** (found by the implementer while doing the
  above; R3, jam start): `jamTick` ran before the slot load on the same bar line, so a take armed for a switch into 7/8
  took the outgoing bar and meter. Reproduced on `a4a7e17` (page: `jam.bar` 3360, `jam.meter` 4/4 while 7/8 played; the
  take 48000 frames = 1.143 bars of 7/8, labelled "1 bar" with an ACID 4/4); `jamTick` now runs after the slot and
  evolve steps: `jam.bar` 2940, 7/8, the take 42000 frames = exactly 1 bar of 7/8, "1 bar of 7/8".
- Quick SHOULDs: `collectChain` takes its origin from `trackBars` (one rule for live and the render); the bar count
  is its own statement (`barN` counts every bar line whether evolve is on or not). Later → [[BACKLOG]]: tie order in
  `collectHits`.
- Checks: `npm run check` clean, `npm test` 144 + 9 (the chain render and live = render tests hold the trackBars path),
  `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped). Browser
  (5400/9400, `/tmp/orbit2-impl/`, deleted): the two repros above, 3 checks that failed on `a4a7e17` and pass now (0
  page errors), and the round-1 page
  checks again: 7/8 clicked mid-bar, kicks at 6720 (the anchor), 9660, 12600, 15540, 18480; evolve at 3360, 6720,
  9660, 12600, 15540, 18480; 390×844 tap on 5/4; 0 page errors.

## Result: HAPPY

All five reviewers HAPPY after round 2 (ines and kai in round 1; verifier, architect and sound on the re-check).
Nothing deferred. Next: the close task marks R1–R4 done.

---
type: design
title: Clock resolution and meter (ORBIT2-06, R1–R4)
created: 2026-11-11
tags: [orbit2, clock, meter, design]
related:
  - '[[BACKLOG]]'
  - '[[REVIEW-PANEL]]'
  - '[[ORBIT2-06]]'
---

# Clock resolution and meter

Backlog R1 (finer master clock), R2 (more ratios), R3 (time signature), R4 (stable loop counter + PRE / NEI).

## Current model

- **Master clock** (`lanes.js`): `PPQ = 24`, `BAR_TICKS = PPQ * 4` (always 4/4). One `Tone.Loop` per master tick
  (`app.js buildLoops`, interval `Transport.PPQ / PPQ` = `8i`), so the loop fires 24 times per beat.
- **Lanes**: `Lane.stepTicks() = round(PPQ / ratio)`. `Lane.at(tick)` returns null unless `tick % stepTicks === 0`;
  step = `tick / stepTicks`, index = `step % length`, `loop = floor(step / length)` (derived, never accumulated).
  Positions stay phase-locked through any edit.
- **Ratios**: `RATIOS = [¼, ⅓, ½, ⅔, ¾, 1, 3/2, 2, 3, 4]`, saved as `ratioIndex` (an index into that table, in
  local saves, slots, library, undo and share links). 24 PPQ cannot hold ×5/4 (19.2 ticks), ×5 (4.8), ×7/4 (13.7).
- **Cycle**: `Machine.cycleSteps` = lcm of `round(length / ratio × 12)` × `loopsPerCycle`, / 12 (beats);
  `cycleTicks = cycleSteps × PPQ`. The ×12 trick breaks for ×5/4 or ×7/4.
- **MIDI clock out**: `pmidi.clock()` on every master tick (24 per quarter by construction).
- **MIDI clock in** (phase lock): `extTick` counts incoming 0xF8 (24 PPQ); SPP sets `extTick = sixteenths × 6`.
  `phaseCorrection(ourTick − extTick)` thresholds are in 24-PPQ ticks (≥ 3 snaps).
- **Bar math, 4/4 only**: `SlotBank.due/nextSwitch` (`tick % BAR_TICKS`), chains (`collectChain`, `chainBars`),
  evolve-every (`t % (BAR_TICKS × every)`), jam start/stop (`t % BAR_TICKS`, `bars × 4` beats, `t % PPQ` redraw),
  export lengths (`renderTicks`, `wholeBarCycle(cyc, BAR_TICKS)`), ACID `beats = bars × 4` and meter 4/4 hard-coded
  in `withAcid`, MIDI file `len = bars × 16` sixteenths, scene `alignText(..., bar, beat)`.
- **Renders**: `collectHits` loops every tick from..to with `tickSec = 60 / tempo / 24` (hard-coded 24) on the
  live machine.
- **Conditions**: `condPasses(cond, loop)` with `loop = floor(step / length)`: changing a lane's length mid-play
  re-derives the loop count from the absolute step, so `1:2` can jump to the other phase.

## The change

### R1 · internal PPQ 840

- `PPQ = 840` (= 24 × 35 = 2³·3·5·7). Every ratio's step is a whole number of ticks:
  ¼ 3360, ⅓ 2520, ½ 1680, ⅔ 1260, ¾ 1120, 1 840, 5/4 672, 4/3 630, 3/2 560, 7/4 480, 2 420, 3 280, 4 210, 5 168,
  6 140. `MIDI_DIV = PPQ / 24 = 35`.
- Every old tick position × 35 = the new one, so **the same pattern gives the same hits** (steps, dice keys and loop
  numbers are counted in steps, not ticks).
- **Scheduling stays cheap**: the `Tone.Loop` keeps its 24-per-beat rate (`8i`). Each callback is one *block* of
  `MIDI_DIV` = 35 fine ticks starting on the 24-PPQ grid. It sends one MIDI clock (exactly 24 per quarter), then
  walks the 35 ticks: bookkeeping that is a modulo test (slot `due`, evolve, jam, cycle bloom) per tick, and the full
  `liveTick` only on ticks where something can happen (`liveQuiet` in `export.js`: no lane steps there and no lane has
  an early step to decide). Each tick's audio time is `time + (t − block start) × tickSec`. The cycle length is
  computed once per block (again after a slot load). `Machine.tick` tests `tick % stepTicks` before it builds a context
  object, so a quiet tick allocates nothing.
- `cycleSteps / cycleTicks` are computed in integer ticks: lcm over lanes of `length × stepTicks × loopsPerCycle`.
- `collectHits` uses `PPQ` (not 24) and renders from a clone of the machine (runtime counters of the live machine
  are not touched by an export, see R4).

### MIDI clock out / in

- Out: one 0xF8 per block = every `MIDI_DIV` fine ticks.
- In: `extTick` stays in MIDI ticks (24 PPQ, SPP × 6). The phase lock compares in MIDI ticks:
  `drift = (clockRef.tick + Δt / tickSec) / MIDI_DIV − ext`; a snap moves the fine clock by `jump × MIDI_DIV`, so the
  block start stays on the 24-PPQ grid.

### R2 · more ratios

Sorted for the speed knob: `¼ ⅓ ½ ⅔ ¾ 1 5/4 4/3 3/2 7/4 2 3 4 5 6`. Inserting changes indices, so:

- `Lane.toJSON` also writes `ratio` (the value). `Lane.from` uses `ratio` when present, else maps the old
  `ratioIndex` through `OLD_RATIOS` (the 10-entry table). Unknown → ×1.
- `Machine` constructor and evolve use values, not indices: evolve steps through the classic set
  `⅔ ¾ 1 3/2 2 3` (the same range it used, so evolve does not land on ×7/4 by surprise).
- `grooves.js` / musical randomize already use `RATIOS.indexOf(value)`.

### R3 · time signature

- `METERS = ['4/4', '3/4', '5/4', '6/8', '7/8', '12/8']`, `m.meter` stored with the pattern (`Machine.toJSON`;
  missing → 4/4). `barTicks(meter) = PPQ × 4 × num / den` (7/8 = 2940 = 3.5 beats), `Machine.barTicks()`.
- **Bar lines** are counted from an anchor: the app keeps `bars = { at, len }`; a bar line is `(t − at) % len = 0`.
  When the meter changes (setting, slot, undo, link) the anchor moves to the next bar line of the old meter, so a bar is
  never cut short (`trackBars` in `slots.js`, pure). `SlotBank.due(tick, cycleTicks, bars)` and `nextSwitch(...)` take
  it (default `{ at: 0, len: BAR }`).
- **Bar 1 of the pattern** (review round 1): the lanes count their steps from the anchor, `Machine.origin` (runtime,
  `setOrigin`), so a pattern in a new meter starts on its own downbeat: the meter control during play, a next-bar slot
  or a chain step in another meter. With one bar length since Play the origin is 0 and everything is as before (old
  data, the ORBIT2-05 tests); a switch within the same bar length goes on counting (polymeter lanes run through it, as
  they always did). `collectChain` moves the origin with the same `trackBars` (a slot whose bar is another length
  starts at its `from`), so live play and the render agree. Inside a master tick the order is: the anchor, a slot
  load (and the anchor again), evolve (its way home can bring back another meter: the anchor again), then the jam, so a
  take that starts on that bar line counts in the meter that plays from there. A step from the new bar line on belongs to the new origin: the outgoing
  lanes don't decide it early (the `cut` also stops at a pending anchor), so a first step nudged earlier than the
  scheduler's look-ahead sounds late, as at a slot switch. The "full cycle" switch and the bloom count from the origin
  too. A "now" switch to another meter plays the new pattern at once on the old origin and restarts it on step 1 at the
  next old bar line, where its bars begin.
- **Users**: next-bar slot switching, chains (`chainBars` of the slot's own meter; `collectChain` sums each slot's
  span), evolve-every (every N-th bar line since Play, counted as they come in whatever meter: `barN`), jam (starts on a bar line, stops rounded to the bar,
  `jam.beats` in quarter notes, bars = elapsed / bar), export lengths (`renderTicks`, `wholeBarCycle(cyc, bar)`),
  scene align text (`bar`).
- **ACID**: `withAcid(wav, { bpm, beats, num, den })` writes the meter fields; `beats` counts the meter's beat unit
  (a 7/8 bar = 7, a 6/8 bar = 6, 4/4 = 4 per bar, so 4/4 files are unchanged); the tempo stays quarter-note bpm.
- **MIDI file**: `writeMidi({ meter: [num, den] })` adds the FF 58 time-signature meta event; clip length =
  `bars × 16 × num / den` sixteenths. A chain gets one FF 58 wherever a slot changes the meter (`chainMeters`,
  `writeMidi({ meters })`).
- UI: a "meter" segmented control in the pattern tools (Edit drawer), a line in the readout when not 4/4.

### R4 · stable loop counter + PRE / NEI

- Runtime per lane (not saved): `loopN` and `lastTick` (null at reset = fresh). `at(step)` advances
  `loopN += floor(step / L) − floor(floor(lastTick / st) / L)` with the current length L and step ticks st, i.e. +1
  for each index 0 the lane passes after the tick it last stepped on. With a constant length and speed this equals
  `floor(step / L)` (same hits as before); a length or a speed change keeps the count, and it never goes back (it was
  `lastStep` until review round 1: a speed change jumped, ×1 → ×2 loop 2 → 5, and a slower speed after a shorter length
  could go below 0). A fresh lane (slot load, a link, `Machine.from`) starts from the absolute count, as the chain
  render does; undo / redo and evolve's way home carry the count (`assign(json, { keep: true })`). A move of the
  origin (a new meter) shifts `lastTick`, so the restart on step 1 counts as one wrap. `peek()` computes without
  committing.
- `pre` / `not pre` conditions (appended to `CONDS`, so saved conds keep their meaning): `pre` plays when the previous
  conditional step on this lane passed its condition, `not pre` when it failed it. The backlog's NEI is stored as
  `not pre` (review round 1): on Elektron boxes "previous failed" is /PRE and NEI reads the neighbour track, a name a
  later phase may want. As there, PRE reads the condition only (not the probability roll or a mute) and looks past
  other PRE steps. Runtime `lastCond` (false at reset); updated by every active step with a condition other than
  always / pre / not pre. UI: two more chips, "if last passed" / "if last failed".

## Notes from the build (for the review)

- **×5/4 against ×1** meets every 4 beats (= 5 quintuplet steps); "aligns after 5" is 5 steps, not 5 beats (no
  lengths make ×5/4 and ×1 line up in exactly 5 beats). The tests pin 4 beats / 5 steps.
- **Lane positions stayed on the absolute clock** in the build, the bar anchor only moved bar lines, so in a chain
  that mixed meters a 4/4 slot's kick landed half a beat after its bar line. Review round 1 made it a MUST-FIX (three
  reviewers): the lanes now count from the anchor (`Machine.origin`, above). The early decisions of ORBIT2-05 stay keyed
  on the master tick; the origin only moves on a cut, so no decision spans a move.
- **Loop counter on a fresh lane** (slot load, a link) is the absolute count, like the chain render, so live play and
  the render keep agreeing; an in-place length or speed change, undo / redo and evolve's way home keep their count.
- Headless e2e: the page's very first touch never lands as a click (any control, pre-existing), and several pages
  in one headless browser drop touch taps; the e2e uses a warm-up tap and its own browser for the mobile page.

## Call sites (grep `PPQ`, `BAR_TICKS`, `stepTicks`, `cycleTicks`, `% PPQ`)

| File | Change |
| --- | --- |
| `lanes.js` | PPQ 840, `MIDI_DIV`, ratios + `OLD_RATIOS`, `METERS`/`barTicks` (a table), `cycleSteps` in ticks, `Machine.tick` fast path, `origin` / `setOrigin`, loop counter, PRE / not PRE, `meter` in JSON, `assign({ keep })`, evolve by value (`evolveRatio`) |
| `app.js` | block loop in `onTick`, clock in/out scaling, bar anchor + origin for slots/evolve (`barN`)/jam, `cut` at a pending anchor, `renderTicks`, ACID meter, jam beats, meter UI, readout, scene `bar` and align tick, live record from the origin |
| `export.js` | `liveQuiet` (skips decided early steps too), `liveTick` from the origin, `collectHits` PPQ + clone + `origin`, `collectChain` per-slot span and origin, `chainMeters`, `hitsToMidi` meter length + `meters` |
| `jam.js` | `withAcid` num/den |
| `slots.js` | `due/nextSwitch` take the bar anchor (cycle from it too), `trackBars` |
| `midiio.js` | comments: extTick stays 24 PPQ (the app scales) |
| `punch/smf.js` (orbit2 copy) | time-signature meta events (`meter`, `meters`), `readMidi` reports them |
| `grooves.js` | unchanged (indexOf by value) |

## Migration

- Local saves, slots, library, undo: `ratioIndex` without `ratio` = old table. With `ratio` = new table by value.
- Share links (`v: 1`): same rule, through `Lane.from`; no version bump (an old link has no `ratio` field).
- `meter` missing = 4/4. Conditions: old strings unchanged.

## Test plan

- ×5/4 against ×1 align after exactly 5 beats, integer step ticks for every ratio.
- MIDI clock out = 24 per quarter (block = 35 ticks).
- `barTicks('7/8')` = 3.5 beats; a 1-bar 7/8 render is 3.5 quarters long; ACID meter 7/8 and beats 7.
- Length change mid-play keeps `1:2` on the same loops; PRE/NEI truth table.
- Old saved data and an old share link load with the same ratios and give the same hits as the 24-PPQ maths (×35).
- Existing tests rewritten against `PPQ` instead of literal 24 / 96.
- Browser: 1440×900 and 390×844, new ratios on the speed gauge, meter control, no page errors, stress meter before /
  after with 4 busy lanes.

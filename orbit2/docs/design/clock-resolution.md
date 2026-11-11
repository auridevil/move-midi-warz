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
  never cut short. `SlotBank.due(tick, cycleTicks, bars)` and `nextSwitch(...)` take it (default `{ at: 0, len: BAR }`).
- **Users**: next-bar slot switching, chains (`chainBars` of the slot's own meter; `collectChain` sums each slot's
  span), evolve-every (every N bars of the current meter), jam (starts on a bar line, stops rounded to the bar,
  `jam.beats` in quarter notes, bars = elapsed / bar), export lengths (`renderTicks`, `wholeBarCycle(cyc, bar)`),
  scene align text (`bar`).
- **ACID**: `withAcid(wav, { bpm, beats, num, den })` writes the meter fields; `beats` counts the meter's beat unit
  (a 7/8 bar = 7, a 6/8 bar = 6, 4/4 = 4 per bar, so 4/4 files are unchanged); the tempo stays quarter-note bpm.
- **MIDI file**: `writeMidi({ meter: [num, den] })` adds the FF 58 time-signature meta event; clip length =
  `bars × 16 × num / den` sixteenths.
- UI: a "meter" segmented control in the pattern tools (Edit drawer), a line in the readout when not 4/4.

### R4 · stable loop counter + PRE / NEI

- Runtime per lane (not saved): `loopN` (−1 at reset) and `lastStep` (−1). `at(step)` advances
  `loopN += floor(step / L) − floor(lastStep / L)` with the current length L, i.e. +1 each time the lane passes its
  index 0. With a constant length this equals `floor(step / L)` (same hits as before); a length change keeps the count.
  A fresh lane (slot load, `Machine.from`) starts from the absolute count, as the chain render does. `peek()` computes
  without committing.
- `pre` / `nei` conditions (appended to `CONDS`, so saved conds keep their meaning): `pre` plays when the previous
  conditional step on this lane passed, `nei` when it failed. Runtime `lastCond` (false at reset); updated by every
  active step with a condition other than always / pre / nei. UI: two more chips, "if last passed" / "if last failed".

## Call sites (grep `PPQ`, `BAR_TICKS`, `stepTicks`, `cycleTicks`, `% PPQ`)

| File | Change |
| --- | --- |
| `lanes.js` | PPQ 840, `MIDI_DIV`, ratios + `OLD_RATIOS`, `METERS`/`barTicks`, `cycleSteps` in ticks, `Machine.tick` fast path, loop counter, PRE/NEI, `meter` in JSON, evolve by value |
| `app.js` | block loop in `onTick`, clock in/out scaling, bar anchor for slots/evolve/jam, `renderTicks`, ACID meter, jam beats, meter UI, readout, scene `bar` |
| `export.js` | `liveQuiet`, `collectHits` PPQ + clone, `collectChain` per-slot span, `hitsToMidi` meter length |
| `jam.js` | `withAcid` num/den |
| `slots.js` | `due/nextSwitch` take the bar anchor |
| `midiio.js` | comments: extTick stays 24 PPQ (the app scales) |
| `punch/smf.js` (orbit2 copy) | time-signature meta event |
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

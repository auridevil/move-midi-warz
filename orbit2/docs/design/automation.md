---
type: design
title: Parameter automation (ORBIT2-18, A1–A7)
created: 2026-11-13
tags: [orbit2, automation, design]
related:
  - '[[BACKLOG]]'
  - '[[REVIEW-PANEL]]'
  - '[[ORBIT2-18]]'
  - '[[clock-resolution]]'
---

# Parameter automation

Backlog A1 (step automation), A2 (smooth automation), A3 (recording modes), A4 (see and clear it), A5 (everywhere it
plays), A6 (Move gestures), A7 (MIDI export). The goal: record a knob move (a decay sweep, a filter ride, a tune drop)
into the pattern so it plays back every loop, in exports and on the Move. This note is the spec the build tasks follow.

## The current model (what automation has to fit into)

- **Lane sound** (`lanes.js SOUND_KEYS`): `decay tone drive snap color send pan level`, all 0..1, one value per lane.
  Shift + knob 1–8 on the Move, the sound gauges on screen. `applySound` pushes them into the lane's chain
  (`app.js addChain`: voice → choke → drive → tone filter → pan → level / send → delay → lane bus → master).
  `holdParam` writes chain params with `cancelScheduledValues(0)` + `setValueAtTime(v, 0)` (a fix for silent chains).
- **Per hit vs per chain.** `hitSound` reads `decay snap color tune` (and `vel`) per hit from `lock ?? lane`, and sets
  the **tone filter at every hit's own time** (`c.tone.frequency.setValueAtTime`, darkened by `p.dark` on soft hits).
  `drive` (a WaveShaper curve + a wet AudioParam), `pan`, `level` and `send` live on the chain only: no hit touches
  them, and they act on what is already ringing (tails, echoes).
- **Step locks** (`LOCK_KEYS = tune prob vel decay tone snap color nudge`, plus `artic slice start end rev`): per
  *stored* step, `lane.locks[i]`, read through the rotation (`lockAt`), travel with their hit (V1), saved, linked,
  slotted. `Lane.at` puts the lock on the event; `expandHits` turns it into hits (nudge, vel, V5 `timbreLock`,
  `tuneLock`). Live play (`liveTick`), every render (`collectHits` runs `liveTick`) and the MIDI export (from the same
  hit list) agree by construction.
- **Clock** (`onBlock`): one Tone loop call per 24-PPQ tick = a **block of 35 master ticks** (`MIDI_DIV`, PPQ 840);
  `onTick` per master tick, `liveQuiet` skips the empty ones. A lane's position is derived from `tick − m.origin`
  (never accumulated): step = tick / stepTicks, index = step % length. Speed, length, meter (origin moves to the new
  bar line), slots (P4 restart moves the origin) all follow from that.
- **V5 modulator** (`lane.mod = { target, loops, depth }`): precedent for "a value over N lane loops": phase =
  `step % (length × loops)`, counted in `loopsPerCycle`, applied per hit through `timbreLock`.
- **Renders**: `renderPattern` builds a fresh kit in an offline context and calls `hitSound` for each hit of
  `collectHits`; stems route each lane bus to its own pair. The jam recorder taps the live lane buses; its ring-out
  (`renderRing`) replays the live kit's logged hits (`logHit`) past the take's end.
- **Undo** (`history.js`): full JSON snapshots, knob turns within 0.7 s fold; `ownNext` = a gesture is one step (I1).
- **Move** (`movewire/docs/PROTOCOL.md`): encoders 1–8 = relative CC 71–78; **encoder touch 1–9 = notes 0–8**
  (movewire emits `encoderTouch { index, on }`), wheel touch = note 9. Plain knobs: length, hits, shift, speed, swing,
  chance, tune, tempo; Shift + knobs: the 8 sound keys; held step + knob 1–7: locks, knob 8: condition; wheel: the P6
  performance filter (held step: nudge).
- **Share links**: `{ v: 1, tempo, m }` deflated + base64url in `#p=`; `Lane.from` ignores fields it does not know.

## Decision 1 · two kinds, fixed per parameter

| kind | parameters | recorded from | stored as | why |
|---|---|---|---|---|
| **step** (A1) | decay, snap, color, tune, chance (prob) | sound gauges decay / snap / color (Shift + knob 1, 4, 5), lane gauges tune / chance (knob 7, 6) | **step locks** (`lane.locks`), nothing new | They are read once per hit (`hitSound`, `Lane.at`): a value between two hits is never heard, so a lock per hit holds everything there is. Elektron-style: the move becomes p-locks you can see and edit in the lock panel. |
| **step**, lock panel | tune, chance, vel, decay, tone, snap, color, nudge | the lock-panel gauges while recording (they write onto the steps that play instead of the one step they show) | step locks | The only on-screen controls for velocity and nudge (no lane knob has them); a lock-panel gauge always means "locks". |
| **smooth** (A2) | tone, drive, pan, send, level | sound gauges tone / drive / send / pan / level (Shift + knob 2, 3, 6, 7, 8) | a per-lane **curve** (`lane.auto`) | They sit on the lane chain and shape what is already ringing (a filter ride over a long tail, a pan sweep on the echoes): per hit they would jump at every step (zipper on tails). Played as AudioParam ramps. |

- **The kind is the parameter's, not a mode you pick.** One less choice (Greta), and no "decay as a curve" that would
  only be sampled per hit anyway. The arm control picks touch / latch, not the kind.
- **tone is in both rows on purpose**: the sound gauge rides the lane filter (curve), the lock panel's tone gauge is a
  per-hit lock, as today. A tone lock on a hit still wins for that hit (Decision 3).
- **Not recorded** (stay manual): slice, stroke (`artic`), start / end / rev (choosers, a choice per step, not a move);
  length, hits, shift, speed, swing, push / pull, vel humanize (they change the rhythm or the grid, not the sound; a
  recorded speed change would re-time the very curve it is on); tempo.
- **drive** is a WaveShaper curve plus a wet AudioParam, and a shaper curve cannot be scheduled at a future time (an
  offline render schedules everything before it starts). On a lane with a drive curve the shaper's amount is fixed at
  the curve's top (`dmax` = max of its points and the lane's drive, set when the curve or the knob changes, never on the
  clock) and the curve moves **wet only**: `wet = clamp(d / dmax) × (0.3 + 0.7 · dmax)`. At `d = dmax` that is exactly
  the knob's sound, at 0 it is dry, and it is continuous in between (the knob's own map jumps from 0 to 0.31 wet at
  0.02, which would click on a ramp). The middle values are a blend of the top drive, not the knob's own sound at that
  value: stated in the gauge's title.
- **The P6 master performance filter is not automated in this phase.** P6 made the performance FX deliberately
  unsaved: a page, a slot, a link always open with the filter off (stage safety: a slot coming in never arrives with a
  closed master filter), and exports print it only with "print FX". A recorded master filter would be saved with the
  pattern and undo both rules; it also has no lane, so it would need a second time base (bars) next to the lanes' one.
  A filter ride on the beat is the lane tone curves (one lane, or several). Goes to BACKLOG Later "Master filter
  automation" with this reason; A2 is annotated to match.

## Decision 2 · time base: the lane (lane-relative, in lane loops)

**Automation loops with its lane**, like everything else on it. Step automation is step locks, so it is per stored
step by nature (one lane loop). A curve spans **`loops` lane loops** (1, 2, 4, 8, 16; the V5 modulator's rule), so a
4-bar ride on a 1-bar kick lane is kept whole (4 loops) instead of folded into one bar.

- **Position** of a curve at master tick t: `s = (t − origin) / stepTicks` (absolute step, fractional), `loop =
  floor(s / length) % loops`, step in loop = `s % length`. Absolute, never accumulated (as `Lane.at` / `modAt`), so
  live and every render read the same position at the same tick, and a restart, a slot or a link starts at the curve's
  start with the lane's step 1.
- **Resolution**: `AUTO_RES = 8` points per step (a 16th at ×4 = 1/128 note, a quarter at ×1 = a 32nd, 105 ticks).
  Points are at fixed step fractions, so the curve stretches with the steps.
- **Speed change**: the lane's time stretches, the curve with it (as the hits do). Mid-play the derived position
  jumps (as `Lane.at`'s step does); the param ramps to the new value over one block (≥ 10 ms at 240 bpm: no click).
- **Length change**: the curve is stored by step (row width `len` = the lane's length when the span was made); a
  shorter lane leaves the steps past its end unheard (kept, like hits past the length); a longer lane plays no curve on
  the new steps (they play the lane's value) until something is recorded there (the rows are re-laid to the new width).
  `loops` is unchanged. Step locks: unchanged rules (stored steps).
- **Rotation**: curves are on the lane's **time** (visible positions), not rotated with the hits (a rotation moves
  hits under a ride, as the V5 modulator already does). Step locks rotate with their hits (V1), unchanged.
- **Time-signature change**: the origin moves to the new bar line (R3), the lanes start on step 1 there, the curves
  start their span there too. **Slot switch / chain**: each slot state carries its own curves; with "restart on change"
  the curve starts at the slot's origin, without it it goes on from the absolute count (as its hits do).
- **Evolve** never touches automation (`auto` is not in `EVOLVE_FIELDS`); its moves change length / speed / rotation,
  which act on curves as above. Locks already travel with their hits (V1) and gravity compares them (`diffSteps`), so
  step automation goes home with its hits. **Randomize** (musical and wild) clears steps and their locks as it always
  did (a new groove: step automation goes with them) and keeps the curves (sound stays, like voices and knobs).
  **Delete / clear lane** clears steps + locks, keeps curves; "clear automation" is its own control (Decision 5).
- **Cycle**: a lane with a curve counts `loops` in `loopsPerCycle` (lcm, as `mod.loops`), so "cycle" exports, the
  slot "cycle" switch and the bloom hold whole curves.
- Rejected: **N bars** (a second clock beside the lanes', breaks "everything on a lane loops with it" on a polyrhythm
  machine, and a 5-step lane's ride would drift against its own hits every bar); **the pattern cycle** (can be dozens
  of bars: a ride would almost never repeat).

## Decision 3 · precedence

From strongest to weakest, per lane and parameter:

1. **The hand, while touching** (pointer down on a gauge, a Move encoder touched, or within 400 ms of the last move
   without a touch). Live only: the param glides to the hand (`glide`, 30 ms) and the block scheduler skips that curve;
   for step parameters every hit the scheduler sends while touching plays the hand's value (`ctx.hand` in `liveTick` →
   `expandHits` puts it over the lock), whether or not it is recording. On release the curve takes over again with a
   glide to its current value (touch); a lane value moved by an un-armed hand stays moved (it is the knob).
2. **A step lock on the hit** (hand-set or recorded: they are the same thing) for per-hit reads. A tone lock sets the
   filter at its hit (as today) and the curve's next ramp takes it back within one block.
3. **The curve**, where it has points.
4. **The lane value** (the knob), everywhere else: where the curve has no point (`.`), on steps without a lock.

While **recording**, the knob writes automation and **does not move the lane value** (Elektron: live-recorded locks
leave the track's base value alone), so steps the gesture never passed keep sounding as before. The gauge shows the
hand while touching, then the played value. A held step on the Move (or the lock panel's own step, not recording)
stays a plain lock edit of those steps: never a gesture.

## Decision 4 · data and compatibility

Step automation adds **no data**: it is `lane.locks`.

Curves, on the lane, saved only when set (`genJSON`, like `mod` / `tdice`), so an un-automated lane's JSON is
byte-identical to today's:

```js
lane.auto = { loops: 2, len: 16, tone: '....AAAB…', level: '…' }   // absent = no curves
```

- `loops` 1..16 (a power of two), `len` the row width in steps (1..32), one string per parameter of length
  `loops × len × AUTO_RES`, **one char per point**: base64url `A–Z a–z 0–9 - _` = 64 levels over the parameter's
  0..1, `.` = no point there. One format for saves, slots, library, undo and links; deflate eats the runs.
- **Cap**: `loops × len × AUTO_RES ≤ 1024` points per curve (a 32-step lane: 4 loops; 16 steps: 8; ≤ 8 steps: 16).
  Worst case 6 lanes × 5 curves × 1024 = 30 k chars of JSON: fine for localStorage (one pattern, 16 slots), and for
  undo (100 snapshots ≈ 3 MB worst case, typical a few hundred kB).
- `Lane.from` reads `auto` through `autoFrom` (known keys only, strings cut / padded to the size, unknown chars → `.`,
  loops / len clamped, a curve of only `.` dropped, `auto` with no curve → null): a hand-edited link can't break play.
  Old saves and links have no `auto`: unchanged, identical hits (a test: every groove + fixtures → `toJSON` and
  `collectHits` byte-equal before and after).
- **Share links** (still `v: 1`; an old page ignores `auto` and plays the link without curves, locks included):
  encoded full; if the URL is over `LINK_MAX = 4000` chars, again with every curve at half resolution (every second
  point, `auto.res: 4`; `autoFrom` interpolates back to 8); still over: without curves, and the share status says
  "the automation curves were left out: the link would be too long" (step locks are the pattern: always kept).
- **Undo**: a gesture is **one undo step**: its writes go into the model as they come, the history is not touched
  until release, then one `save()` with `ownNext` (I1's rule). Clear automation = one step. A gesture ends early (and
  keeps what it wrote) on a slot switch, an undo / redo, a link or setup load, Stop, disarm, or its lane leaving the
  pattern: the gesture is tied to its `Lane` object (I1's `gone`), so it never writes into the state that replaced it.

## Decision 5 · recording UX

- **Arm**: the existing **● arm record** (Record on the Move) plus a segmented **knobs: off · touch · latch** beside it
  in the transport (saved in settings `rec.knobs`, default **off**, so live record of hits behaves as before). Armed +
  playing + knobs on = a gesture on a recordable parameter of the **selected lane** records. Not playing, or knobs
  off: the knobs act as today.
- **touch**: writes while touching, stops at release. **latch**: after release the last value goes on being written
  until the playhead is back where the gesture started (one span for a curve, one lane loop for locks), or Stop /
  disarm / another gesture on that parameter.
- **Gesture start / end**: gauge `pointerdown` / `pointerup` (`gauge.js` gets `onStart` / `onEnd`); a Move encoder's
  touch note on / off (`encoderTouch`, the parameter is fixed at touch time: Shift held → sound key, else the plain
  knob's); keyboard, wheel, or a controller without touch: a move starts one, it ends **400 ms** after the last move.
- **What is written.**
  - *Step*: each hit step of the lane that the scheduler sends while the gesture is on (its tick in the gesture) gets
    the hand's value as a lock on its stored step, **written at schedule time, before the step's hits are made**, so
    the hit heard is the value kept. Only steps with a hit (`hitAt`), whatever the roll, condition or mute (they are
    the grid). A step played before the hand reached the knob (the ~100 ms the scheduler runs ahead) keeps its value.
  - *Smooth*: every point from the previous write to the **heard** position (`heardTick`, so playback lines up with
    what you heard) gets the hand's value (linear between successive hand values), overwriting what the gesture passes
    over. A first gesture on an empty curve makes `loops = 1`, `len = length`; while it is still on when the playhead
    comes back to its start, the span doubles (copying the curve so far, up to the cap). On an existing curve a
    gesture wraps and overwrites (no growth). The strip has ½ / ×2 for the span (×2 repeats it, ½ keeps the first half).
- **Clear**: on the curve strip, **clear** = this parameter on this lane (the curve, or every lock of that key);
  **clear lane automation** = every curve and every lock of a recordable key (`LOCK_KEYS`), leaving slice / stroke /
  start / end / rev, conditions and ratchets. Hold step + Delete still clears that step's locks. Move: touch a knob and
  press Delete while touching = clear that parameter (Delete without a touch keeps its meaning). Each is one undo step.
- **Feedback**: an **A** on every gauge the selected lane automates (curve, or locks of that key on a played step); the
  record LED blinks while a gesture writes; a **curve strip** under the step strip: the last touched automated
  parameter (a small picker beside it), its span with loop dividers, the playhead, and for step parameters the lock
  values as bars per step; during playback the automated gauges of the selected lane follow the played value
  (draw-scheduled, at most once per frame, selected lane only). Move panel: the gestures above in its table.

## Decision 6 · playback paths

- **Step automation**: locks → `Lane.at` → `expandHits`: live, `collectHits` renders, stems, chains and the MIDI export
  already agree. Only new piece: `ctx.hand` (live only).
- **Smooth automation**: one pure sampler in `export.js`, `autoRamps(m, from, to, tickSec)` → per lane and parameter the
  curve value at each **block line** (every 35 master ticks from the origin) in `[from, to)`, as `{ li, k, dt, v }`.
  The block grid is the playback resolution: one ramp per automated lane-parameter per block, whatever the lane speed
  (finer points are smoothed by it; at 240 bpm a block is 10.4 ms). Values: `autoAt(lane, k, s)` (pure, `lanes.js`):
  linear between the two neighbouring points, a `.` neighbour counting as the lane value, null when both are `.`.
  - **Live**: `onBlock` calls it for the block it schedules and `rampAuto(chain, k, time, v)`: `exponentialRamp` on
    the tone frequency (= linear in the knob's 200·60^tone map), linear ramps on pan, level (`level² × 1.2`), send, the
    drive wet. A run of unchanged values schedules nothing; leaving it re-anchors with `setValueAtTime` at the last
    block line first (or the ramp would start at the run's beginning). Play, a slot, an undo, a load, a new curve:
    the next block starts with `setValueAtTime` (a jump, as the render's time 0). `applySound` and `holdParam` skip the
    automated keys of a lane (their `cancelScheduledValues(0)` would wipe the ramps); the knob's value reaches them
    through the sampler where the curve has no point.
  - **The tone filter per hit**: a hit without a tone lock sets the filter to the curve's value at its time (the hit
    carries it from `expandHits`, `h.auto`), so the hit's `setValueAtTime` lands on the ramp instead of jumping back to
    the lane value; a soft hit's `p.dark` and a tone lock act as today until the next block line. V5 modulator and
    timbre dice offset the curve's value (`timbreLock` reads it instead of `lane.sound[k]`).
  - **Offline** (`renderPattern`, stems, the I3 4-bar render, export all): the same `autoRamps(m, 0, ticks)` scheduled
    on the offline kit's chains before the render (time + lead); **chains**: per slot segment with its origin
    (`collectChain`'s loop, a sibling `collectChainRamps`). So a render's ramps are the live ones, tick for tick.
  - **Jam takes** record the live buses: automation is in them by construction. The **ring-out** replays the live
    kit's logged ramps with its logged hits (`logHit` gets `{ li, k, time, v }` entries, same `RING_KEEP` window).
- **MIDI export (A7)**: per-note where MIDI has it: **velocity** (vel locks, as today). Every other automated value is
  a **CC on the lane's track and channel**: step parameters as one CC just before each note of that lane (the lock, or
  the lane value on a note without one), only for keys the lane has locks of; curves as CC sampled on the block grid,
  written when the 7-bit value changes. prob and nudge are already in which notes exist and when. Default CCs
  (editable in the MIDI drawer, 0 = off, saved in the MIDI settings): **tone 74, decay 75, snap 73, color 71, tune 16,
  drive 17, level 7, pan 10, send 91**. Merge mode (one Drum Rack track, one channel) can't hold per-lane CCs: notes
  only, and the export says so. `writeMidi` (`orbit2/src/punch/smf.js`) gets `part.ccs = [{ s, cc, v }]`; `readMidi`
  reads them back (tests). A pattern without automation writes the same bytes as today. Live MIDI CC out → Later.
- **Slots / chains / library / share**: automation is lane JSON, so it rides along; `SlotBank.save` copies JSON (no
  aliasing; a test). Links: Decision 4.

## Performance budget

- **Clock callback**: per block, per lane with curves, per curve: one `autoAt` (index maths) and at most one AudioParam
  call. Worst case 6 lanes × 5 curves = 30 calls per block; at 240 bpm 96 blocks/s ≈ 2 900 calls/s. Target: the
  sampler + ramps add **≤ 0.05 ms per block** on the median (measured with `performance.now()` around it in a test
  build) and the **stress meter stays where it is** (level 0, headroom unchanged) with 6 lanes × 5 curves playing at
  240 bpm, desktop and 6× CPU throttle. Nothing per tick, nothing per sample, no allocation per block beyond the
  small result array.
- Step automation costs nothing new while playing; the write at schedule time is one `setLock` per stepped hit.
- Drawing: the strip and the moving gauges redraw at most once per frame, the selected lane only; frame cost compared
  before / after with the existing e2e frame probe.

## Test plan

Unit (`orbit2/test/automation.test.js`):

- `autoAt`: points, interpolation, `.` neighbours = lane value, both `.` = null; span loops (loop 2 of 4 reads row 2);
  position from origin; length shorter / longer than `len`; speed change stretches; rotation does not move it.
- Write helpers: `recordStepValue(lane, si, k, v)` (= `setLock`, clamps), `recordCurvePoint(lane, k, s, v)` (row
  re-lay on a longer lane, first gesture sets loops / len), span doubling, the 1024 cap, `clearAuto(lane, k?)` (curves
  and locks of that key / all recordable keys; slice, stroke, conditions stay).
- Serialization: `toJSON` → `Lane.from` round trip; `autoFrom` on bad input (wrong lengths, bad chars, loops 3, 99);
  **old JSON unchanged**: every groove and a set of saved-pattern fixtures (incl. earlier orbit2 phases' data) give
  byte-identical `toJSON` and identical `collectHits`.
- Playback: `collectHits` with recorded decay locks = per-hit decay; `autoRamps` live (block by block through
  `onBlock`'s grid) = offline (one call) for the same ticks; chains per segment; `ctx.hand` overrides in `liveTick` only.
- Precedence: tone lock over curve for its hit; hand over both; un-armed knob moves the lane value, armed doesn't.
- Exports: MIDI CC content read back with `readMidi` (step CC before its note, curve CC on change, merge = none,
  un-automated = identical bytes); share round trip with curves, the half-resolution fallback and the drop note at
  `LINK_MAX`; slot copy is independent (editing the live lane doesn't change the slot).
- `loopsPerCycle` counts `auto.loops`.

Browser (`orbit2/tools/cdp.mjs`, port 5400 / 9400, muted), a 4-bar pattern:

- Record a **decay sweep** through a gauge pointer gesture and a **tone ride** through synthetic Move bytes
  (`__poly.move.receive`: encoder touch note on, CC turns, note off); one undo removes each.
- Export WAV and stems: per-hit decay length follows the sweep at the right steps; the tone stem's spectral centroid
  over time follows the ride at the right bars; a jam take of live play matches the render (centroid curve and onset
  times); no clicks at block lines or region edges (sample-to-sample difference vs the un-automated render).
- Stress meter while 6 automated lanes play; screenshots 1440×900 and 390×844 (the strip, the A marks).
- `npm run check`, `npm test`, `node tools/smoke.mjs http://localhost:5400`.

## As built (where the code differs from the text above)

- `autoRamps(m, from, to, origin = m.origin)` returns `{ li, k, t, v }` with `t` the **master tick** (not `dt`): live
  play, renders (`lead + t · tickSec`, from the block line before tick 0 through the tail) and the MIDI export each turn
  ticks into their own times. Block lines are the absolute multiples of 35 ticks (the live blocks), which are the lines
  from the origin whenever the origin is a bar line. `collectChainRamps` / `collectChainAuto` share `chainSegments` with
  `collectChain`.
- The curve writer is `Lane.recordCurve(k, s0, v0, s1, v1)` (a span, linear between two hand values), with
  `widenAuto`, `spanAuto(±1)` (the strip's ×2 / ½) and `clearAuto(k?, kind?)`; `clearAuto` keeps the ghost tier (a
  0.35 vel lock is a tier, not automation).
- Every hit carries **all** of its lane's curve values at its own time (`h.auto`), and `hitSound` sets the non-tone
  ones too: a chain that is silent between hits may not have run its ramps (the reason `holdParam` exists), so each hit
  starts on the curve and the next block ramp goes on from there. Measured: a live jam take matches the render (per-hit
  decay within 0.33 dB, the hat's spectral centroid per beat within 6 %, onsets within 0.06 ms).
- `applySound` leaves a curve's param alone only on the live kit while playing; stopped, offline kits and the kit
  export start from the knob. A Stop puts the knobs back on automated chains.
- The knob gesture is `knobGest` in `app.js` (the I1 canvas owns `gest`). A gesture that records defers `save()` and
  commits one own undo step synchronously on its end (before a slot, an undo or a load replaces the pattern). Move:
  touching a knob + Record cycles knobs off → touch → latch; touching + Delete clears that knob's automation.
- MIDI CC: `autoCCs` sends a step key for a lane whose hits carry it (a lock, a modulator, timbre dice or scale snap),
  the curve where the note sounds else the lane value on the other notes; CC numbers are 0..119 (`ccFrom`).
- Budget: `autoRamps` costs ~2 µs per block for 6 lanes × 5 curves (Node); the stress meter stays at level 0 with
  headroom 74–75 ms at 240 bpm (unchanged) and 64–68 ms against 70–71 ms without curves under a 6× CPU throttle. The
  strip is drawn once per change into an offscreen canvas; a frame copies it and sets only the gauges whose value moved.

## Later (not this phase)

- Master filter automation (Decision 1). Live MIDI CC out of automation. Recording slice / stroke as a move. A
  "dynamics" lane knob so velocity can be ridden without the lock panel. Drawing curves by hand on the strip.

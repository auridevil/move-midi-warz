---
type: review
phase: ORBIT2-12
title: ORBIT2-12 steerable generative (V1–V5), review panel
date: 2026-11-12
round: 1
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  ines: HAPPY
  tomi: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-11]]'
---

# ORBIT2-12 · Steerable generative: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), ines, tomi. Process: [[REVIEW-PANEL]].

Phase start: `5656860` (ORBIT2-11 closed). Implementation commits: `09d3eba` (V1, V2), `cb1f242` (V3, V4, V5),
`fac4c1d` (tests and browser check).

## For the brief: where the new things are

| item | model / audio | on screen / Move |
| --- | --- | --- |
| V1 steerable evolve | `lanes.js` `Machine.evolve({ scope, amount, weights, gravity, home, maxBars, repeat }, rng)`: `EVOLVE_KINDS` rotate / hits / length / ratio / prob / tune, `EVOLVE_WEIGHTS` (default 1 1 1 1 0 0 = the old uniform pick, so an old seeded evolve picks the same kinds), `pickWeighted`, `weightsFrom` (saved weights back in range), `SCOPE_KINDS`; gravity: a nudged lane rolls `rng() < gravity` (only when gravity > 0) and then takes one step toward its home lane (`Lane.awayFrom(h, kind)`, `homeStep(h, kind, rng)`, `diffSteps(h)`, `ratioToward`); max cycle: a move that makes `cycleTicks({ repeat })` longer than `maxBars` bars (or than the cycle before the move, if that was longer) is put back (`Lane.restore`, `EVOLVE_FIELDS`) and reported `held`; euclid: `Lane.isEuclid()` (pure fill) → `refill(k)` (the accents / locks / conditions of a dropped hit move to the nearest new hit, `moveStepData`), hand-edited euclid lane → `evolveHits` adds a hit where E(k+1) has one / takes one E(k−1) lacks (`plainStep`), never the last hit; `mutate(kind, dir, rng)`. `app.js` `evo { …, gravity (%), maxBars (0 = off, 32 default), weights }` in `midi-warz.orbit2.settings.v1` (older settings: gravity 0, max 32, default weights); `evolveNow` passes them with `home: evoSnap` (the home snapshot) | Evolve drawer: gauges "gravity", "max cycle" (`#evo-more`), sub-drawer "how often each change" (`#evo-weights`, six weight gauges ×0…×4), scope "everything" = whatever has a weight; status line names moves (`↺` = a move home, "(too long)" = held by the guard) |
| V2 coupling | `lanes.js` `Machine.couple { mode: off / next / matrix, amount, matrix 6×6 }` (part of the pattern: `toJSON` writes it only when used, `Machine.from` → `coupleFrom`, older saves uncoupled; slots / undo / links carry it); runtime `m.boost[li]` (not saved): `Machine.tick` passes `boost` to `Lane.at` (`r < prob + boost`), then `coupleAfter(evs)` (each lane that stepped uses up its lift, then each hit lifts the lanes it is coupled to: lane order never matters); `coupleAmount(a, b)`, `boostOf(li)`; `export.js liveTick`: an early (nudged / pushed) step takes the lift waiting at its decision time | Evolve drawer: "coupling" off / next lane / matrix (`#couple-mode`), "lift" gauge (next lane), tap-to-cycle matrix (`#couple-matrix`, row = the lane that hits, column = the lane it lifts, 0 → 25 → 50 → 75 → 100 %) |
| V3 euclid masks | `lanes.js` `Lane.euclidMode` replace / and / xor (`EUCLID_MODES`, saved only when not replace), `mask()` (cached), `played(si)` (the hand hit through the mask), `maskedOut(si)`, `hitAt` reads `played`; `setEuclid(k)` in and / xor moves only the mask (the hand hits stay); `loopsPerCycle` counts played steps; `euclid()` doc comment: the floor form, E(5,8) = x.x.xx.x, Bjorklund's cinquillo x.xx.xx. = rotation 6 | lane drawer section "generative": "euclid" replace / AND / XOR (`#gen-euclid`) with the tooltip text; a set step the mask silences: outlined (`.st.mk`), aria "off (silenced by the euclid mask)" |
| V4 ratchet curves | `lanes.js` `MAX_RATCHET` 8, `RATCHET_CURVES` even / up / down, `ratchetTimes(n, curve)`, trig `curve` / `ramp` (−1…1 of tune over the repeats; stored only when set); `export.js expandHits` spaces the repeats by the curve and ramps tune via `tuneLock` (one path for live, WAV, stems, MIDI) | lock panel: repeats 1, ×2 … ×8; "spacing" even / speed up / slow down + "pitch ramp" gauge ±12 st (`#trig-shape`, shown when repeats > 1); the audition follows the curve and ramp |
| V5 timbre modulation | `lanes.js` `Lane.mod { target tone / color / decay, loops 0..16 (0 = the whole cycle), depth }` (`modFrom`, `modAt(step, tick, cycle)`, `modValue` = sine ± depth / 2), `Lane.tdice { tone, color, decay }` ranges (`tdiceFrom`), `Lane.scale` off / major / minor / penta / just (`SCALES`, `snapTune`); `loopsPerCycle` counts the modulator's period and the timbre dice as rolls; `export.js timbreLock` (modulator offset + dice, salts 10–12, on the hit's lock or the lane sound, 0..1) and `tuneLock` (ramp + scale snap on pitched voices: `voices.js TUNE_SEMIS`); `Machine.tick` / `liveTick` / `collectHits` pass the cycle (ticks) for a modulator on the whole cycle | lane drawer "generative": "modulate" off / tone / color / decay + "period" (loops, 0 = cycle) and "depth" gauges (`#gen-mod`), "timbre dice" three range gauges (`#gen-tdice`), "scale" off / major / minor / pentatonic / just (`#gen-scale`) with a note on unpitched voices |

Page handles: `__poly.m` (the Machine: `m.lanes[i]`, `m.couple`, `m.boost`, `m.evolve(…)`, `m.cycleTicks()`), `evo`,
`setEvolve`, `sync`, `dice` (`dice.locked`, `dice.seed`, `dice.repeat`), `renderPattern`, `exportWav`, `exportStems`,
`exportMidi`, `shareLink`, `undo`, `redo`, `hist`, `bank`, `saveSlot`, `recallSlot`, `stress`, `clock()`, `applyTempo`,
`editLocks`, `hitSound`, `kit`, `setEngine`. Tests: `orbit2/test/generative.test.js` (10, incl. live = render with
every new feature on).

## Pre-checks

`npm run check` clean, `npm test` 191 + 9 green on `fac4c1d` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; ines, tomi on sonnet), own ports
5401 / 5402 / 5403 / 5407 / 5408 (+ 940x; the phase start `git archive 5656860` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, V1–V5 verbatim from [[BACKLOG]], the phase spec (the three build tasks), the
"where the new things are" table above, `git diff --stat 5656860..fac4c1d` (8 files, +512/−59), `git status --short`
(only this file), the must-fix rule with the later phases' ids (V6, I, A) and the "Later" items, how to drive
`orbit2/index.html` with `orbit2/tools/cdp.mjs`, and how to run the phase start. `stalled: 0`: nothing was open before
round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) NEW, V2: with coupling on, a lane whose step is decided early (pushed, or a negative nudge lock) plays live what the render doesn't have. The early decision (`export.js:96`) takes the lift waiting then; at the step's tick `Machine.tick` decides it again with the full lift, uses it up and lifts other lanes from that second roll (`lanes.js:577` → `coupleAfter`); then `liveTick` (`export.js:91`) swaps in the early decision. `collectHits` only makes the on-tick one. Locked dice 5, lane 1 ×3 E(6,6), lane 2 ×4 E(16,16) at 30 % pushed −30 ms, matrix 1 → 2 at 70 %, 200 bpm, 16 bars: lane 2 192 hits live, 208 rendered (uncoupled 128 / 128); lane 2 at 0 % with nudge −½ locks, lifted 100 %: 0 live, 31 rendered. (2) NEW, V1: gravity can't bring a pattern home when home's cycle is longer than the max cycle (default 32 bars): the guard (`lanes.js:612`) holds the steps home too. Lengths 7/9/11/13 with E(3/4/5/6) (home 2252 bars), 60 evolves with max 32, then gravity 1 with max 32: not home after 3000 evolves (6000–9000 moves held "(too long)", lengths stuck at e.g. 6/9/10/12); max off: home in 17–25. Page (240 bpm, dice 42, evolve every bar, amount 100): ~30 bars at gravity 100 left 6/9/11/12. (3) NEW, regression: evolve deletes accents, locks and conditions (`plainStep`, `lanes.js:460`, `:477`, `:480`); at `5656860` they stayed on their step and came back with the hit. E(4,8) with tune locks + accents on 1/3/5/7 and 1:2 on 5, E4 → E3 → E4: phase start all back, now 1/5/7 and no condition; a hand hit with accent, tone lock and ×3 toggled off / on by evolve comes back plain; 64 default evolves (scope hits, 40 %): step-data entries 11/9/7/15 → 7/7/3/11 (phase start unchanged). |
| architect | NOT HAPPY | (1) = verifier 1. Free dice: lane 1 at 50 %, lane 2 at 0 % lifted 100 % ("next lane"), 64 bars at 120 bpm: lane 1 on time, 0 of 255 lane-2 steps disagree with lane 1's audible hit; lane 1 pushed −30 ms 135 of 255, nudge −0.4 locks 119 of 255 (lane 2 follows a second, unheard roll). Locked dice, lane 2 nudged −0.4 lifted by one lane-1 hit a loop: live ≠ render in 110 of 315 lane-1 setups (×¾, length 1: render 12, live 8): a lift after the early decision is lost, not "the step after" as `export.js:95` says. (2) = verifier 2 (lengths 5/7/9/11 E 2/3/4/5, home 866 bars: max 0 home after 14 evolves, max 32 not after 3000, 8976 held; once the cycle is shorter than home's it never grows back). |
| sound | NOT HAPPY | (1) NEW, V4: ×8 curves pile up. `ratchetTimes` (`lanes.js:149`) is quadratic: the tightest gap is 1/64 of a step (1.95 ms on 16ths at 120 bpm), slow-down's first two repeats 1.95 ms apart, speed-up's last 1/64 step before the next step, so repeats merge into one thick, louder hit. First 30 ms peak vs one hit (stems, 16ths at 120 bpm), slow-down / speed-up into a hit on the next step / even ×8: dsp kick +9.36 / +9.84 / +4.92 dB, dsp blip +4.73 / +3.82 / +2.49, synth snare +3.49 / +8.38 / +0.77. Mix (dsp blip, kick, snare; hits on steps 1/5/9/10/13, ratchets on 5/9/13): ×4 even −1.61 dBFS (as at the phase start), ×8 even +0.02 (1 sample ≥ 0.999), ×8 slow-down / speed-up / even +1.86 (245; the 16-bit WAV has 241 samples pinned at full scale). Kick lane alone: ×8 curves −4.44 vs ×8 even −6.24 dBFS. Expected: repeats at least ~1/(2n) of a step apart, a speed-up not ending within that gap of the next step, a ×8 curve no louder than ×8 even. |
| ines | HAPPY | none (gravity 1: 40 seeded runs of 60 wild evolves all exactly home, accents, locks and trigs included; the guard at 4 bars over 500 evolves; locked dice reproduce 30 evolve bars exactly; AND / XOR and the E(5,8) note right; ratchet curves and the modulator's sine correct; coupling live = render 6 / 6; one 64-bar page run) |
| tomi | HAPPY | none (AND / XOR on a hand tresillo exact; ratchet curves and the tune ramp right; evolve with gravity keeps a pure euclid lane pure; scale snap lands on sensible degrees) |

SHOULD items recorded (never block): `refill` searches no further than the loop's ends and counts a kept hit without data
as taken, against its comment (verifier); `loopsPerCycle`'s chance-lock check reads `hits`, not `played` (verifier,
architect); test gaps: no coupled early lane in the live = render test, gravity tested only without the guard (verifier,
architect); two render loops (`collectHits` its own `m.tick` loop, live `liveTick`) (architect); `TUNE_SEMIS` hand-kept
apart from both engines' voices, `export.js` importing `voices.js` for it (architect); `isEuclid` recomputes the fill,
`auditionLock` repeats the ratchet maths, `app.js` 1671 → 1736 (architect); the master is not a brickwall: ×8 even
already touches 0 dBFS (sound, pre-existing); the modulator flattens at the knob ends (tone 0.9, depth 100 %: at 1 for
13 of 32 steps) (sound); color bends marimba / conga / bongo off a snapped scale (sound); the pitch-ramp gauge says
±12 semitones where ±24 voices move 24 (sound); "slowing down (a bouncing ball)": a bouncing ball speeds up (sound);
coupling shows nothing on a lane at 100 % (ines); "(too long)" repeats in the status line (ines); evolve's tune move is a
whole tone on ±24 voices (ines); hints for AND / XOR on a hand clave (tomi); speed-up's last repeat ~98 % into the step,
close to the next downbeat (tomi).

GOOD: save-format discipline: a phase-start pattern loads and saves back byte-identical, old links, slots and settings
load (gravity 0, max 32, default weights), a locked-dice render of an old pattern is identical to the phase start, old
seeded evolves pick the same kinds (verifier, architect); the guard held over 500 adversarial evolves and the clock stays
light (64 bars at 160 bpm: 28 ms at the phase start, 31 now, 34 with every new feature on; headroom 72–75 ms, stress 0)
(verifier, architect); ratchet onsets within ±0.44 sample of `ratchetTimes`, the ×8 stem = the sum of 8 shifted hits,
scale snap exact in the audio on both engines (just 3.156 / 7.020 / 10.883 semitones), the modulator an exact sine
(sound); gravity converges and holds still, weights and masks clean (ines).

### Changes after round 1

- **Coupling follows the hits that play; renders run live play's own path** (verifier 1, architect 1): `liveTick` does
  V2's bookkeeping (`Machine.tick(…, { couple: false })`, then `coupleAfter(hit, used)` with what it plays: a step
  decided early plays that decision; a pad's recorded hit counts). A step decided early takes the lift waiting when it is
  decided (`Machine.takeBoost`), this tick's hits included (the early decisions now come after the tick's coupling); a
  lift after that waits for the lane's next step instead of being used up at its tick. `collectHits` runs `liveTick`
  (quiet ticks skipped as the clock skips them, `cut` at its end), so a render decides every step where live play does
  (architect's SHOULD). Node, the verifier's repro: 192 live / 208 rendered → 239 / 239; free dice, lane 1 pushed −30 ms:
  130 of 254 lane-2 steps off lane 1's heard hits → 0. Render cost unchanged (64 busy bars: 33.6 ms, `fac4c1d` 33.2).
- **Gravity's way home is never held** (verifier 2, architect 2): the max cycle guard puts back random moves only; a
  step home goes even when it passes a longer cycle for a while (7/7/7/7 → 8/8/8/8 goes through 8/7/7/7, so no ceiling
  short of none always gets home). Node: lengths 7/9/11/13, max 32: home after 14 evolves (was: not after 3000). The max
  cycle tooltip says so.
- **Evolve never deletes step data** (verifier 3; architect's SHOULD): `plainStep` is gone. A hit evolve takes away
  leaves its accent, locks and condition on the step (as a hand toggle does, and evolve did at the phase start) and they
  come back with the hit; `refill` hands a dropped hit's data to the nearest new hit round the loop that has none of its
  own, else it waits on its step (the verifier's SHOULD: wraparound, "none of its own" as the comment says); gravity also
  restores data waiting on a step without its hit (`diffSteps`). Node: E4 → E3 → E4 all back (locks / accents on
  1/3/5/7, 1:2 on 5); a hand hit toggled off / on keeps accent, lock and ×3; 64 default evolves keep 5/4/11/4 entries
  (`fac4c1d`: → 3/2/3/3).
- **Evolve's home is a copy** (found by the implementer, checking gravity in the page): `evoSnap = m.toJSON()` shared
  the lanes' step arrays (BACKLOG Later "Smaller saves": "phase 12 owns hand edits against home"), so every evolve edit
  moved home along and, in the page, gravity only ever brought lengths and speeds back (lengths home, hits not, after
  60 s at gravity 100). `Machine.snapshot()` (a structured clone) at the four places that set home. Page (240 bpm, dice
  42, lengths 7/9/11/13, max 32): wandered to 6/9/11/11, then the whole pattern (hits, locks, lengths) home 13 bars after
  gravity went to 100 %.
- **Ratchet curves keep their repeats apart and the even ratchet's level** (sound 1): `ratchetTimes`: slow-down's n gaps
  grow evenly from ½ to 1½ of the even gap (the last runs to the next step); speed-up's n − 1 gaps between the repeats
  shrink evenly from 1½ to ½ and its last repeat sits where the even one does, a whole even gap before the next step
  (1/(2n) before it, it still piled onto that step's hit); ×2 speed-up has one gap, so it is even. New `ratchetGains`: a
  repeat closer than the even gap to a neighbour plays softer by as much (n × the shorter gap, down to ½), so a curve
  carries the even ratchet's energy; in `expandHits` (live, WAV, stems, MIDI) and the lock panel's audition. Page (dsp,
  16ths at 120 bpm, the sound repro): kick stem step peak over one hit, even / slow-down / speed-up +7.63 / +7.21 / +6.92
  dB, the next step's hit after them +7.60 / +6.05 / +5.71; blip +2.16 / +2.28 / +2.33, next hit +1.46 / +0.21 / −0.49.
  3-lane mix: ×8 even +0.02 dBFS (1 sample ≥ 0.999), slow-down / speed-up / even +0.13 (3; was +1.86, 245), all
  speed-up −1.08, all slow-down −0.20; kick lane alone even −6.24, speed-up −6.64, slow-down −6.47 (was −4.44); the synth
  pattern with every hit ×8: even −10.24, speed-up −11.37, slow-down −11.43 (synth noise varies per render). The curve
  tooltip: speed-up "like a bouncing ball coming to rest", closer repeats play softer (sound's SHOULD).
- **Quick SHOULDs done:** `loopsPerCycle` counts a chance lock on a step the mask plays (`played(i)`; verifier,
  architect); `isEuclid` uses the cached `mask()` (architect); the pitch-ramp gauge reads in the lane voice's semitones
  (+24 on a tom, +12 on a conga; sound); the scale tooltip says color bends marimba, conga and bongo off the scale
  (checked in both engines: ×12, ×5, ×7 semitones; sound); the test gaps (verifier, architect).
- **Not changed** → [[BACKLOG]] Later: "A brickwall at the master", "The modulator at the knob ends", "Scale snap and
  color-bent voices", "One semitone table" (with evolve's whole-tone tune move on ±24 voices), "app.js after phase 12"
  (with `auditionLock`'s ratchet maths), "Generative hints on screen" (coupling at 100 %, "(too long)", AND / XOR).
  tomi's speed-up "close to the next downbeat" is gone with the new spacing.
- Tests (196 + 9; 5 new, 2 updated, each new one fails on `fac4c1d`): "V4 ratchet curves" (new times; for ×1…×8 every
  gap ≥ 1/(2n), speed-up ending a whole even gap before the next step, the gains), "V1 max cycle guard" (random moves
  keep the limit, a step home is never held), "r1 V2" (both coupling repros live = render, free dice: lane 2 follows lane
  1's heard hits, pushed or not), "r1 V1" gravity home under max 32 with a longer home, "r1 V1" step data never deleted
  (the three repros, wraparound, none free), "r1 V1" home is a copy (and the app sets it with `m.snapshot()` at all four
  places), "r1" a chance lock on a mask-played step. `npm run check` clean, `npm test` 196 + 9,
  `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py 5400 + headless Chrome 9222, both stopped). Browser
  (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks above, coupling with a pushed lane while playing (stress
  0, headroom 70 ms), the lock panel at ×8 (spacing shown), 0 page errors on desktop (1440×900) and phone (390×844), no
  sideways scroll; screenshots looked at. `app.js` 1736 → 1738 lines.

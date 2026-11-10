---
type: review
phase: ORBIT2-05
title: ORBIT2-05 groove and dynamics (G1–G6), review panel
date: 2026-11-10
round: 2
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  tomi: HAPPY
  dex: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-04]]'
---

# ORBIT2-05 · Groove and dynamics: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), tomi, dex. Process: [[REVIEW-PANEL]].

Phase start: `c5c49a1` (ORBIT2-04 closed). Implementation commits: `d05e15c` (G1, G2, G6), `dfa29ba` (G3–G5),
`fae6674` (UI for G1–G6), `9d4cd84` (tests and browser check).

## For the brief: where the new things are

| item | model / audio | on screen | Move |
| --- | --- | --- | --- |
| G1 nudge | `nudge` in `LOCK_KEYS`, `LOCK_RANGE.nudge` = −0.5…+0.5 of a step (`lanes.js`); applied in `expandHits` (`export.js`) | step lock panel (long-press, right-click or Alt+click a step): "nudge" gauge −50…+50 %; the scene draws a nudged planet off its tick (a faint mark stays on the tick) | hold step + jog wheel: 5 % of a step per click (Move panel row) |
| G2 push / pull | `Lane.offsetMs` −30…+30 ms, `Lane.setOffset` | lane drawer: "push / pull" gauge | — |
| G3 velocity humanize | `Lane.velHuman` 0…1 (±0.2 velocity at 1), dice salt 3, in `expandHits` | lane drawer: "vel humanize" gauge | — |
| G4 tiers | `GHOST_VEL` = 0.35, `tierOfVel`, `Lane.tierAt` / `setTier` / `cycleStep` / `recordHit` (`lanes.js`) | step tap: off → on → accent → ghost → off; a ghost step is half filled (aria "on, ghost"); in the scene a smaller, dimmer planet | live record: pad velocity → ghost or normal; accent still by the "accent above" knob |
| G5 velocity → timbre | `velShape` + `VEL_TIMBRE` (`voices.js`), used by `hitSound` (`app.js`) for both engines; dsp layers get `dark` (octaves), handled in `dsp-core.js` `trigger()`; worklet regenerated | — | — |
| G6 swing templates | `SWING_TEMPLATES` / `SWING_KEYS`, `Lane.swingTpl`, `swingAt()`, `swingPeriod()` (`lanes.js`) | lane drawer: "swing template" segmented control beside the swing gauge (swing is now the last gauge of the grid) | — |

Live play: a step that can sound before its own tick (a negative nudge, or a lane pushed early) is decided one step
ahead in `onTick` (`app.js`, `early[]`), and its early part is played from the step before. Offline renders start early
enough to hold hits before tick 0 (`renderPattern`, `lead`). Save format: the three new lane fields (`swingTpl`,
`offsetMs`, `velHuman`) are optional; a save without them loads as MPC swing, 0 ms, 0 % velocity humanize.

## Pre-checks

`npm run check` clean, `npm test` 117 + 9 green on 9d4cd84 before the panel started.

## Round 1: 1 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; tomi, dex on sonnet), own ports
5401 / 5402 / 5403 / 5408 / 5406 (+ 940x, phase-start copies on +100), the verifier also ran the smoke on 9222. Brief:
the phase goal, G1–G6 verbatim from [[BACKLOG]], the phase spec (the four implementation tasks), the "where the new
things are" table above, `git diff --stat c5c49a1..9d4cd84` (10 files, +250/−59), `git status --short` (only this
file), the must-fix rule with the later phases' ids, how to drive `orbit2/index.html` with `orbit2/tools/cdp.mjs`
(`__poly`, Move simulation through `move.emit`, `readMidi`, the model in Node) and how to run the phase-start version.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | G1/G2: the MIDI export puts an early hit on step 1 on the downbeat. `hitsToMidi` (`export.js:41`) clamps `Math.max(0, h.time)`; the loop WAV wraps the same hit to the end. Lane 2 ×1, 16 steps, 120 bpm, step 1 nudged −25 %, step 5 −50 %: WAV onsets 1.750 / 7.876 s (right), MIDI note-ons at ticks 0 / 336 (expected 1512 for the wrapped one). A lane pushed −20 ms has every MIDI note early except the first. |
| architect | NOT HAPPY | (1) G1/G2 live play: after a slot switch, a pushed lane plays the old slot's decision on the new slot's first step. `bank.due()` → `loadSlot()` (`app.js:189`) runs before `m.tick()`, and `app.js:197` reuses the step decided a step earlier because it compares only `pre.step === ev.step`. Slot 3 (kick off, push −20 ms) → slot 4 (kick on every beat) at the bar line: kicks at +4522, 5020… ms; the new slot's downbeat kick (+4022) is dropped. Chains and any swap within a step of a pushed or early-nudged lane do the same. (2) G4: a full tap cycle leaves the ghost's 0.35 vel lock on the step it turned off (`setTier(i, 'off')`, `lanes.js:97`): "step 1, off, locked"; a Move step tap or a euclid refill brings it back as a ghost. |
| sound | NOT HAPPY | (1) The MIDI clamp (Node: step 0 nudged −50 % → ticks 0 / 336 / 720 / 1104 at 96 PPQ; the first belongs at 1488 = 7.75 s, where the loop WAV puts it in both engines; push −20 ms the same). (2) G5 changes loudness, in opposite directions in the two engines. dsp: the rim at velocity 0.35 is −2.5 dB under a normal hit (phase start −6.0), because lowering its band-pass (`bp: 1800, bq: 2` over a ~1 kHz square, `dsp-voices.js:46`) moves it onto the fundamental; the open hat gains 1.4–1.8 dB. synth: hat-type voices nearly vanish: open hat at 0.35 −17.9 dB (phase start −1.9), tambourine −20.6 (−5.8), because `dark` pulls the lane low-pass (4.3 kHz at tone 0.75) down by up to 2.5 octaves, below their whole band. The same tier ends up 13–14 dB apart between the engines. |
| tomi | HAPPY | none (nudge, push/pull, templates and triplet ⅓ measured in `collectHits`; a WAV with a +½-step nudge at 100 bpm onsets at 0.3757 s, expected 0.375; old saves; tiers; 1440×900 and 390×844 without errors) |
| dex | NOT HAPPY | G4: a ghost with the accent flag plays quieter than a normal hit. Tap to ghost, then Shift+click ("accent only"): `tierAt` = accent and the aria label says accent, but the 0.35 vel lock stays and `hitVel` (`export.js:8`) adds +0.3 → 0.65 (normal 0.7; an accent should play 1). |

The implementer reproduced every MUST-FIX on 9d4cd84 before fixing: MIDI (Node: step 0 nudged −50 % → hit at
−0.25 s → MIDI tick 0); slot switch (5400/9400, the architect's setup: bar-line hat at 4002 ms, kicks from 4482 ms, the
one at ~3982 missing); tiers (a full cycle leaves `{vel: 0.35}` on the off step, a toggle brings back a ghost; ghost +
`toggleAccent` → tier accent at 0.65); G5 (every voice alone on a raw kit, send 0, at 0.7 / 0.35 / 0.2 in both
engines, phase start vs HEAD: synth hat −15.6, open hat −16.1, tambourine −15.2, ride −11.5, crash −10.7 dB beyond
phase start's drop at 0.35; dsp rim +3.6, hat +3.0, open hat +1.5, brush +0.9, clap +0.7, cowbell +0.5 dB louder).

SHOULD items recorded (never block): Stop and mute reach a pushed or early-nudged lane up to a whole step late, since
`early[]` posts the next step a step ahead (×¼ lane at 40 bpm pushed −10 ms: a hit 5.74 s after Stop; ×1 at 120 bpm
−20 ms: 0.53 s) (verifier); a nudge turned back to 0 stays stored as a lock, "on, locked" (verifier); a tap from
normal to accent deletes a hand-set vel lock (0.9 or 0.6 → gone; phase start kept it) (verifier, architect, sound,
tomi, dex); every ghost also reads "locked" (cyan underline, aria, moon, cyan Move LED) (verifier, architect); the
templates ignore the beat group: on ×3 lanes triplet / amapiano / aksak move beat downbeats (MPC keeps them), 3-3-2
delays beat 2 of a 16-step ×4 lane, aksak's period 7 stretches the cycle, and the swing tooltip's "at ×3 the middle
step of each three swings" is now only MPC's rule (verifier, architect, sound); the live lookahead belongs in a pure
helper next to `expandHits` with unit tests (slot swap, mute, ratchet split) and a peek that leaves `pos` alone
(architect); velocity humanize only goes down on accents (clamped at 1, mean 0.94–0.97), and a fixed ±0.2 spreads a
ghost over ~11 dB but a normal hit over ~5 dB: proportional would sound more natural (architect, sound); `Lane.from`
doesn't clamp loaded locks (`{nudge: −2}` loads as −2, beyond the one-step lookahead) (architect); dsp band-pass
layers never get the added low-pass, so dsp hats darken much less than synth ones (sound); 22 of 39 voices use the
2-octave default (tabla, cowbell, ride, marimba…) (sound); live record snaps pad velocity to two levels, as G4 asks
(tomi); the amapiano / 3-3-2 numbers are one reading of the item (tomi); templates do nothing at swing 0 % (dex);
live-record `quantize` ignores a step's nudge and the lane's push (dex). Not defects: `firstOnset` in a loop render
catches the wrapped ring-out (tomi, dex: harness).

GOOD: old data plays exactly as before (40/40 random phase-start machines and 5/5 phase-start links give identical
`collectHits`, a real phase-start localStorage gives 106/106 identical hits) (architect, verifier, sound); timing lives
in one place and is exact: WAV onsets to the sample for nudge ±, push ±30 ms, triplet ⅓ and a −½-step downbeat
wrapped to 7.75 s; live play with scheduled times hooked matches to 0.01 ms, ratchets split across two ticks, no
doubles or drops (sound, verifier, architect, tomi); G5 is data (`velShape` + `VEL_TIMBRE`) shared by both engines,
and kicks follow the plain velocity curve (sound, architect).

### Changes after round 1

- **MIDI wraps like the loop WAV** (verifier, sound): `hitsToMidi` takes `loop`, the export's "render as loop" chip
  (its tooltip now says MIDI follows it). On: a note nudged or pushed before the downbeat or past the end wraps
  around the clip, a note that rounds onto the end lands on the downbeat, and no note rings past the end (its gate is
  trimmed), so the clip stays N bars. Off (one-shot): an early note starts on the downbeat, as in the one-shot WAV.
  The round-1 repro (step 1 nudged −½, 4 bars at 120 bpm) has its note at tick 1488 instead of 0, also through the
  page's Export.
- **Live play decides an early step at the last tick, for that lane object only** (architect 1; the verifier's and
  architect's SHOULDs): the look-ahead left `onTick` for pure `earlyStep()` / `liveTick()` in `export.js`, next to
  `expandHits`, with `Lane.peek()` (`at()` without moving the playhead). A step nudged or pushed before its tick is
  decided at the last tick that can still schedule it, not a whole step ahead, and reused at its tick only by the same
  lane object: a slot, a link, undo or evolve's way home (`m.assign()` makes new lanes) decides afresh, and a lane muted
  or silenced since drops the rest of the step. The architect's repro (5400/9400): the new slot's downbeat kick sounds
  at the bar line − 20 ms (3979 ms, bar line 3999). Stop: a ×¼ lane at 40 bpm pushed −10 ms has nothing scheduled
  after Stop (the latest note 881 ms before it; round 1: 5.74 s after). Mute: no note of a pushed, nudged lane later
  than 150 ms after the mute. `app.js` 1201 → 1195 lines.
- **Tiers leave no trace** (architect 2, dex; SHOULDs from all five): a soft vel lock is the ghost tier itself
  (`Lane.dropGhost`), so leaving the ghost tier takes it away. Ghost → off is a clean step (a Move toggle or a euclid
  refill brings back a plain hit); Shift+accent on a ghost is a real accent (1, was 0.65). Normal → accent keeps a loud
  hand-set vel lock, as before the phase; a recorded hit sets the velocity outright. A lone ghost lock no longer
  shows as "locked" (step underline, aria, the scene's moon, the Move LED: `Lane.shownLock`); the lock panel still
  lists it.
- **G5: darker, not quieter, never louder** (sound 2). dsp: a band-pass layer keeps its band (lowering it onto the
  rim's 880 Hz square is what made soft rims louder) and gets a gentle one-pole low-pass instead, from an octave above
  its centre down by `dark` octaves, which can only take energy away (`dsp-core.js` `trigger()` / `render()`, worklet
  regenerated); low-pass and unfiltered layers as before. synth: a voice whose whole band sits above the lane
  low-pass loses ~12 dB per octave it closes, so hats, open hat, tambourine, ride, crash, clave, click and samples move
  a fraction of an octave, and clap, snap2, glitch and vinyl less than the 2-octave default. Measured again (every voice
  alone, raw kit, 4 hits per level, the same seeded noise in both versions, phase start vs now, 39 voices × 2 engines):
  at 0.35 no voice is louder than phase start's plain velocity drop by more than 0.3 dB (was +3.6 dsp rim, +3.0 dsp
  hat); the largest extra drop is 3.8 dB (synth brush; was 16.1, synth open hat); every voice except the kicks and the
  tonal ones is darker. Ghost level synth / dsp: hat −5.6 / −6.6 dB (was −18.3 / −3.0), open hat −4.8 / −7.0,
  tambourine −8.7 / −6.4, rim −6.0 / −7.9, clap −6.4 / −7.4, snare −8.3 / −7.2. Brightness at the ghost tier
  synth / dsp: rim 0.74 / 0.83, clap 0.58 / 0.82, snare 0.47 / 0.66, hats 0.93–0.95 / 0.96–1.00 (only a little darker,
  see Later).
- Quick SHOULDs done: a nudge back to 0 is no lock (in `setLock`, so the jog wheel and the gauge both); `Lane.from`
  clamps loaded locks into `LOCK_RANGE` (a link's `{nudge: −2}` loads as −0.5); velocity humanize is ±20 % of the
  hit's own velocity (a ghost spreads 0.28–0.42 instead of 0.15–0.55); the swing tooltip says the ×3 rule is MPC's and
  that a template shapes the swing amount (at 0 % every template is straight); the velocity humanize tooltip says
  "of the hit's own velocity".
- Later → [[BACKLOG]]: templates and the beat group, a real tilt for ghost hats, gentler amounts for tonal voices,
  templates at swing 0 %, live record vs nudge and push, a "keep velocity" record option, the accents' humanize clamp.
- Tests (121 orbit2: 4 new, 3 updated). New: MIDI wrap (the repro's ticks, one-shot clamp, both clip edges, no note
  past the clip); live play = the render (a busy machine through `liveTick` holds exactly `collectHits`' hits, early
  parts go out at the last tick), `earlyStep` timing, the architect's slot swap (the new slot's downbeat kick at
  1.98 s), a mute after an early ratchet part (4 → 2 repeats); tiers (clean off, Shift accent = 1, a loud lock kept,
  a recorded hit, `shownLock`, nudge 0, `Lane.from` clamps); a guard on the bright voices' amounts. Updated: B5
  expects the wrap; G3 checks the proportional spread on ghosts too; the G5 dsp test checks 7 voices darker and never
  louder, and that the band stays. `npm run check` clean, `npm test` 121 + 9, `node tools/smoke.mjs
  http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped). Browser (5400/9400, one browser
  per viewport, `/tmp/orbit2-impl/`, deleted): 11/11. 1440×900, trusted clicks: tap cycle → ghost "step 2, on, ghost"
  without the underline, off "step 2, off" with no lock; Shift+click on a ghost → accent at 1; Move hold step + jog −2
  → nudge −0.1, +2 → no lock, step not toggled; Export MIDI → 16 notes, the wrapped one at 1488; stop and mute
  latency as above; 3 s of live play in dsp and in synth with early ratchets, ghosts, a triplet template and velocity
  humanize. 390×844 touch: tap cycle on / accent / ghost / off, no horizontal overflow. 0 page errors; screenshots
  looked at.

## Round 2: 1 of 4 HAPPY

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound, dex), fresh sub-agents in one message
(verifier, architect, sound on the default model; dex on sonnet), own ports 5401 / 5402 / 5403 / 5406 (+ 940x,
phase-start copies on +100), the verifier also ran the smoke on 9222. Brief as in round 1 (goal, G1–G6 + phase spec,
the "where" table, the must-fix rule with the later ids), `git diff --stat c5c49a1..8865bae` (12 files, +598/−74), each
one's own round-1 MUST-FIX and "Changes after round 1". Pre-checks on 8865bae: `npm run check` clean, `npm test` 121 + 9.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | Round-1 MIDI fixed (Node and the page's Export: 336 / 1512 looped, 0 / 336 one-shot; push −20 ms wraps to 1532, note off at 1536). New, from the round-1 rewrite: a pushed lane or an early-nudged step plays twice when its lanes are replaced inside the step's early window (a chain step, a slot recalled while playing, undo, redo, a link). The old lane already played the early part (`export.js:56`); the new lane (`m.assign()` in `loadSlot`, `app.js:189`, before `:196`) fails the reuse check (`:49`) and plays the whole step again (`:50`). Page: kick on every beat pushed −20 ms, two identical slots chained 1 bar each: 17 notes in 6.7 s instead of 15 (9d4cd84: 15), the bar-line kick twice at 2, 4 and 6 s (−3.0…+1.2 ms apart, both engines, two MIDI note-ons); snare nudged −25 %, `recallSlot` while playing: a flam, 70.7 / 46.6 ms. Node: the same JSON assigned at tick 96 → 1.98 s twice; an undo-like assign at tick 40 with step 3 nudged −½ → 0.75 s twice. |
| architect | NOT HAPPY | Round-1 MUST-FIX 2 fixed (a tap cycle leaves no lock, a Move toggle or a euclid refill brings back a plain hit, a ghost isn't "locked"). MUST-FIX 1 half fixed: the new slot's downbeat plays now, but an outgoing slot whose downbeat sounds early still plays its early part too: at the last tick before the bar line `liveTick` lets the old lane decide the next bar's step 1 (`export.js:52-56`) although the switch is already queued, and at the bar line the new lanes decide it again. Page (120 bpm, slot 1 kick on every beat pushed −20 ms ↔ slot 2 the same kick at 0 ms, `recallSlot` while playing, hits logged through `pmidi.note`): two kicks on the switch downbeat, −17.0 and 0.0 ms. Model, live vs `collectChain`: A push −20 → B push 0: 1.98 + 2.00 vs 2.00; B the same pushed kick: 1.98 twice vs once; B without a downbeat: 1.98 vs none; A step 1 nudged −½ → B plain: 1.75 + 2.00 vs 2.00. Expected: what the chain render plays. |
| sound | NOT HAPPY | Round-1 MIDI and G5 fixed (MIDI = the loop WAV in both engines; nothing louder than the plain velocity drop by more than 0.3 dB, 39 synth + 37 dsp voices; the two engines' ghost tiers within ~3 dB). (1) G1/G2 in the loop WAV: a downbeat nudged early comes out 13 dB quiet. `renderPattern` (`app.js:717`) puts the earliest hit 10 ms into the render, where the master compressor / limiter is still settling, and the loop wraps it to the end. Rim on steps 1 + 3, step 1 nudged −½, 4 bars at 120 bpm: the copies at 1.75 / 3.75 / 5.75 s peak at −17.5 / −18.2 / −17.9 dBFS, the wrapped one at 7.75 s at −31.2 (synth; dsp −13.8 vs −27.1); the raw stems are level; a lane pushed −20 ms loses 7.6 / 8 dB. (2) G1 + G5 live: a late-nudged roll leaves the synth lane low-pass closed for the plain hits after it. `hitSound` (`app.js:156`) puts the filter back only after a call that set `toneLocked`, which follows the scheduling order, not the sounding order: a ×4 fade ratchet nudged +35 % has its last repeat scheduled before step 2 but sounding after it, so steps 3 and 4 play at 843 Hz instead of the lane's 1549 Hz in every bar (a ghost roll: 954 Hz). The WAV (sorted hits) is right. |
| dex | HAPPY | none (re-ran the round-1 repro in Node: ghost + Shift → velocity 1, accent, no lock left; on → ghost → off leaves no lock) |

The implementer reproduced every MUST-FIX on 8865bae before fixing. Model (`liveTick` with an assign at the bar line
vs `collectChain`): A push −20 → B push 0: 1.98 + 2.00 vs 2.00; B the same: 1.98 twice; B without a downbeat: 1.98 vs
none; A nudged −½ → B plain: 1.75 + 2.00 vs 2.00; an undo-like assign of the same lanes at tick 40 with step 3 nudged
−½: 0.75 twice. WAV (5400/9400, rim on steps 1 + 3, 4 bars at 120 bpm, loop), the step-1 hit rendered first (wrapped
to the end when early) vs the same step a bar later: nudge −½ −13.4 dB (synth) / −13.3 (dsp), push −20 ms −8.1 / −7.8,
a plain downbeat −5.4 / −5.4 (the phase-03 "cold master"); one hit x s into a fresh render through the master: −12.6 dB
at 0.01 s, −5.4 at 0.05, −2.2 at 0.1, within 0.3 dB from 0.2 s on. Live filter (synth, the sound repro with a snare,
lane at 4312 Hz): plain steps 3 and 4 at 1658 Hz in every bar.

SHOULD items recorded (never block): the jog wheel nudges 5 % per message whatever its delta (`Math.sign`,
`app.js:988`) (verifier); a one-shot MIDI note past the clip end makes that track longer than N bars (verifier;
pre-existing, the old clamp did the same); the slot-swap test only covers an outgoing slot with the kick off: test
pushed and nudged outgoing downbeats against `collectChain` (architect); the G5 extra drop goes past the code comment's
"≈ 3 dB at most" in a few places (synth gong −4.4, brush −3.8, clap −3.6 at tone 0.75; ride −4.5, hat −4.0 at tone 0.5;
dsp shaker −4.9 at tone 1, `VEL_TIMBRE.shaker` still `tone: 2.5`) (sound); dsp has a level step just below velocity
0.7: the one-pole starts an octave above the band at any `dark`, so 0.69 is 1.3–2.1 dB under 0.70 (tambourine, shaker,
snap, crash) and velocity humanize splits normal hits into two levels (sound); dsp `click` / `glitch` shaped hits peak
1.3–2.3 dB over unshaped ones, RMS lower (sound, cosmetic). Dex says his HAPPY rests on the round-1 repro alone.

GOOD: live play = the render on 200 random busy machines (14,152 hits, 40–240 bpm, every ratio, nudges to −½, push −30
ms, humanize 100 %, ratchets, ghosts, every template, locked dice; the earliest hit 13.7 ms before the tick that
schedules it) (verifier) and 232 / 232 on an extreme machine (sound); the look-ahead left `app.js` for pure, tested
`earlyStep()` / `liveTick()` + `Lane.peek()` (architect); old data plays as before (a phase-start save and link → the
same 71 hits; a phase-start JSON with swing, humanize, ratchets and locks → 86 / 86; MPC = the old swing at all 10
speeds, triplet at 50 % = ⅓) (architect, sound); bad link values clamp (an unknown template → MPC, 999 ms → 30,
velocity humanize 7 → 1) (verifier).

### Changes after round 2

- **A queued slot owns its steps, and a step is started once** (verifier, architect). `SlotBank.nextSwitch(tick,
  cycleTicks)` (pure, `slots.js`) names the next tick where `due()` loads a slot (a queued slot in now / bar / cycle
  mode, or the chain moving on). The master tick passes it to `liveTick` as `cut`, and `earlyStep` leaves every step
  from there on to the incoming slot: the outgoing lanes no longer decide, or sound, its first step. For replacements
  nothing announces (undo, redo, a link, evolve's way home, a "now" recall inside a step's early window), a step whose
  early part has sounded stays decided (`played`): the new lane doesn't start it again, plays the rest of that decision
  (unless it is muted) and takes over from the next step. A lane replaced before anything sounded still decides afresh
  (the round-1 fix). Model, live vs `collectChain` (two slots chained 1 bar each): A pushed −20 → B on the grid 2.00
  (was 1.98 + 2.00); the same pushed kick 1.98 once (was twice); B without a downbeat: nothing (was A's 1.98); A
  nudged −½ → B plain 2.00 (was 1.75 + 2.00); an undo-like assign at tick 40 with step 3 nudged −½: 0.75 once (was
  twice). Page (5400/9400, every hit logged through `pmidi.note`): two identical pushed slots chained 1 bar each: 14
  kicks in 6.7 s, gaps 496–507 ms (8865bae: 17, gaps from 2 ms); recall 0 → 1 → 0 → 1 while playing: 15 kicks, gaps
  479–520 ms (8865bae: from 16 ms); undo / redo every 41 ms for 5 s (121 lane swaps) on a lane pushed −20 ms with step
  3 nudged −½: 12 kicks, gaps 250 / 500 / 750 ms (8865bae: 28 kicks, gaps from 0 ms); "now" recalls every 37 ms (92
  swaps): 12 kicks (8865bae: 31). Known limit (→ Later): an incoming slot's first step nudged earlier than the
  scheduler's look-ahead (~0.1 s) sounds late at the switch, since that slot's lanes and voices exist only from the bar
  line; a push of up to 30 ms fits.
- **Renders pre-roll the master** (sound 1): `renderLead(hits)` (`jam.js`) starts every render `PRE_ROLL` = 0.5 s
  before its earliest hit, so the master compressor + limiter have settled (a hit 10 ms into a render came out 12.6 dB
  low, at 50 ms 5.4 dB, settled from 0.2 s). Loop WAV, rim on steps 1 + 3, 4 bars at 120 bpm, the step-1 hit rendered
  first vs the same step a bar later, synth / dsp: nudge −½ −0.2 / +0.9 dB (was −13.4 / −13.3), push −20 ms +0.9 /
  +0.6 (was −8.1 / −7.8), a plain downbeat −0.3 / +0.6 (was −5.4 / −5.4: the phase-03 "cold master" is gone too,
  marked in BACKLOG). Copies a bar apart differ by up to ~1 dB anyway.
- **Every hit sets the lane filter at its own time** (sound 2): no more `toneLocked` flag following the scheduling
  order; each hit sets the lane low-pass (its tone lock, its G5 darkness or the lane's tone) at its time, and the
  automation sorts by time. The sound repro (×4 fade ratchet nudged +35 %, synth, lane at 4312 Hz): plain steps 2–4 of
  two bars all at 4312 Hz (was 1658 Hz on steps 3 and 4). A tone knob still takes over at once (Tone's `value` setter
  cancels what is scheduled).
- Quick SHOULDs done. The jog wheel nudges 5 % per click of its delta (a message of −3 = −15 %) (verifier). dsp: an
  added filter (a band-pass layer's one-pole, a low-pass put on an open layer) fades in over the first quarter octave
  of `dark`, so a hit just under 0.7 sounds like a normal one: every dsp voice at 0.69 lands −0.52…+0.04 dB from the
  plain velocity drop (was down to −2.14, tambourine); the ghost tier is unchanged for every voice but the two below
  (measured, 39 voices) (sound). The fade-in showed the dsp clap up to 1.3 dB *louder* just under 0.7: G5's softer
  snap dropped a burst at the default snap 0.5, and one burst fewer leaves a louder tail. A softer clap now keeps its
  number of claps (`VEL_TIMBRE.clap.snap` 0; darker and shorter as before): never above the plain drop, −3.1 dB past
  it at the ghost tier (was −1.7, with the louder tail). The shaker joins the hats (`tone` 0.5: dsp ghost −2.4 dB past
  the plain drop, was −7.1), and the G5 comment gives the measured range (≈ 3 dB, 4–5 for snap, gong, ride and hats on
  a dark lane) (sound). The slot-swap test covers pushed and nudged outgoing downbeats against `collectChain`
  (architect). Later → [[BACKLOG]]: the next slot's early first step, one-shot MIDI past the clip end, dsp click /
  glitch peaks.
- Tests (125 orbit2: 4 new). `nextSwitch` names exactly the tick `due()` loads (a chain every 2 bars, bar, cycle,
  now); live = the chain render across a switch for the five A → B cases, a recall while playing plays only the new
  downbeat, undo / link assigns inside an early window never double a hit; `renderLead` puts the earliest hit
  `PRE_ROLL` in; every dsp voice at 0.69 within −0.6…+0.3 dB of the plain drop, a softer clap never louder, the
  fade-in weights, the shaker's amount. `npm run check` clean, `npm test` 125 + 9, `node tools/smoke.mjs
  http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped). Browser (5400/9400,
  `/tmp/orbit2-impl/`, deleted): the four live checks above pass here and fail on 8865bae as reported; WAV levels and
  the live filter as above in both engines; Move hold step 3 + wheel −3, +1 → nudge −10 %, step not toggled, lock
  panel "locked: nudge"; phone 390 × 844 touch: tap cycle, no sideways scroll; 0 page errors; screenshots looked at.
  `app.js` 1195 → 1196 lines.

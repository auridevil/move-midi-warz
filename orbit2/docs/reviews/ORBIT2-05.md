---
type: review
phase: ORBIT2-05
title: ORBIT2-05 groove and dynamics (G1–G6), review panel
date: 2026-11-10
round: 1
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  tomi: HAPPY
  dex: NOT HAPPY
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

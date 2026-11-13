---
type: review
phase: ORBIT2-13
title: ORBIT2-13 seeing the structure (V6), review panel
date: 2026-11-13
round: 1
stalled: 0
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  ines: HAPPY
  greta: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-12]]'
---

# ORBIT2-13 · Seeing the structure: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), ines, greta. Process: [[REVIEW-PANEL]].

Phase start: `943a665` (ORBIT2-12 closed). Implementation commits: `c9feac8` (V6 scene layers), `c497c5e` (tests and
browser check).

## For the brief: where the new things are

| item | model / audio | on screen |
| --- | --- | --- |
| V6 ghost flash | `lanes.js` `Lane.at` returns `skip`: `'cond'` (a programmed step, `hitAt(i)`, whose condition said no), else `'dice'` (the roll said no with locked dice: `ctx.dice`) or `'prob'` (a free roll said no), `null` for a hit, an empty or mask-silenced step, a muted lane and a lane silenced by a solo elsewhere; the hit maths is unchanged. `export.js liveTick`: a step decided early (negative nudge, push) keeps the early decision's `skip` at its tick; a step a pad just played reports none. `app.js onTick` passes `skip` and `loop` to `scene.onStep` | `scene.js` `ghosts` ("lane:index" → time, reason): a ring round the planet for `GHOST_MS` (450 ms), fading; solid = prob, dashed = condition, dotted = locked dice; it grows outward unless `prefers-reduced-motion`; cleared on stop and on `scene.reset()` |
| V6 planet opacity | the chance a step plays: its prob lock if it has one, else the lane's prob (what `Lane.at` rolls against) | `planetAlpha(p)` = 0.2 + 0.8 p on the planet and its glow; a hit that just played still flashes full |
| V6 condition arcs | the event's `loop` (the loop count `condPasses` reads) | `condParts(cond)`: an a:b step gets b arcs round its planet, loop 1 at 12 o'clock, clockwise; the arc it plays on solid in the lane colour, the others faint; while playing, the loop the lane is on now (`loop % b` of its latest step) is lit white. Other conditions (fill, first, pre) keep the dashed halo |
| V6 cycle arc | `m.cycleTicks(cycleOpts())` (each lane's length × speed × `loopsPerCycle`: a:b conditions, odd-length swing, the locked dice repeat, the V5 modulator) through the scene's `align()` | while playing, a thin arc at the outer ring + min(16 px, 0.08 R) fills clockwise from 12 o'clock with `cyclePos(heardTick − origin, cycle)` over a faint full track, a dot at its head; it starts again when the whole machine lines up (the bloom, and the "aligns in …" countdown in the core) |

Page handles: `__poly.m` (the Machine: `m.lanes[i]` with `prob`, `setLock(i, 'prob', p)`, `setTrig(i, { cond })`,
`muted`, `solo`; `m.cycleTicks()`), `__poly.scene` (`onStep`, `stats()` = `{ frameMs, quality }`), `dice` (`locked`,
`seed`, `repeat`), `sync`, `applyTempo`, `stress`, `clock()`, `setLaneCount`, `undo`, `redo`, `shareLink`, `exportWav`.
Tests: `orbit2/test/visuals.test.js` (3).

## Pre-checks

`npm run check` clean, `npm test` 199 + 9 green on `c497c5e` before the panel started.

## Round 1: 5 of 5 HAPPY, the whole panel HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; ines, greta on sonnet), own ports
5401 / 5402 / 5403 / 5407 / 5409 (+ 940x; the phase start `git archive 943a665` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, V6 verbatim from [[BACKLOG]], the phase spec (the build task), the "where the new
things are" table above, `git diff --stat 943a665..c497c5e` (5 files, +116/−13), `git status --short` (only this file),
the must-fix rule with the later phases' ids (I, A) and the "Later" items, how to drive `orbit2/index.html` with
`orbit2/tools/cdp.mjs`, and how to run the phase start. `stalled: 0`: everyone is HAPPY.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none. Check clean, 199 + 9, smoke 10/10. 120 random machines (lengths, rotation, prob and nudge locks, every condition, mutes, solo, fill, free / locked dice) through `liveTick` (2,304 ticks each) and `collectHits` at `943a665` and now: identical once `skip` is dropped (0 differences); 1410 prob / 1122 cond / 1360 dice reasons, none on a step that played, `dice` only with locked dice. Page (the app's own `onStep` calls): prob 50 % → prob, locked → dice; 1:3 plays loops 0 and 3, cond on the others; steps decided early (nudge −0.3, push −20 ms) keep their reason, one of hit or reason per step; a muted lane and solo-silenced lanes none. Rings gone after Stop (247 bright pixels in the ring zone while playing, 5 after), the scene idles. Worst case (6 × 32 steps, every step 1:4 with a 50 % prob lock, 174 bpm), phase start → now: frame callback 0.28 → 0.35 ms, main thread 7.7 → 8.9 %, 16.67 ms, quality 1. The phase start's saved data and its `#p=` link load to an identical `m.toJSON()`. Phone: the cycle arc (r 160) fits the 390 × 390 stage. No page errors (reduced motion, tempo 1 / 999, 6 ↔ 4 lanes with undo / redo while playing, empty pattern, stop / start mid-bar). |
| architect | HAPPY | none. Check clean, 199 + 9. `liveTick` at the phase start and now in Node, gated by `liveQuiet` like `onTick`: 24 seeded 6-lane patterns × free / locked dice × 48 bars (lengths 3–32, rotation, speeds, a:b / fill / first / pre, prob locks, −0.3 nudges, ratchets, coupling off / next / matrix, mutes, solos, humanize): byte-identical without `skip` in 48 of 48; 87,904 step events, 17,576 with a reason (cond 6102, prob 5808, dice 5666), never with hits or an early part, every silent programmed step on an audible lane has one. A phase-start Machine JSON round-trips byte-identical. rAF callback JS time on a worst case (6 × 32, all a:b, prob 0.5, odd steps locked 0.3), start → now: mean 0.294 → 0.337 ms (p95 0.6 → 0.6), 4× CPU throttle 1.07 → 1.31 (p95 2.2 → 2.7); quality 1, 16.67 ms; idle after Stop unchanged; no page errors (desktop, phone, reduced motion). |
| sound | HAPPY | none. Hit path against `943a665`: the export hit list identical (95 / 95; locked dice; prob, prob lock, 2:3, pre, ratchet, negative nudge, a ghost velocity), the MIDI file byte-identical, the live note stream identical (53 / 53); mix peak −7.4 dBFS, RMS −28, loop seam 0. A ring always means silence (by step and by a ±0.4-step window): 0 rings with a sound, 0 drawn hits that were silent, 0 sounds never drawn (one Stop edge, pre-existing: SHOULD 4); free dice prob 26 / cond 11, locked dice 27 / 12; mute and solo 0 rings. Heavy scene (6 × 32, prob 0.5, 3:4): main thread 0.47 → 0.53 ms a frame (4× slower CPU 1.75 → 2.02), 60 fps, quality 1; audio headroom ≥ 68–70 ms in both, 0 late notes; idle after Stop ~0. |
| ines | HAPPY | none. fill → cond on every pass, first → a hit on loop 0 then cond, a 25 % lock → prob; on a 5-step lane 2:3 hits loops 1 and 4 and 1:3 loops 0 and 3, the lit arc is `loop % b` as `condPasses` counts; `cycleTicks()` 4200 for lanes 4 / 5 / 3 / 2 with a 3-loop condition, the arc moving just outside the outer ring, the countdown from the same `align()`. No page errors, 16.7 ms, quality 1, rings cleared on Stop. |
| greta | HAPPY | none. Desktop 1440 × 900, phone 390 × 844 (also with the jam ring) and reduced motion (rings static, only fading): no page errors, 16.7 ms, quality 1; the cycle arc clear of the rings, the jam ring, the record ring and the legend. |

SHOULD items recorded (never block): the comment at `scene.js:209` (and the spec) say "lane prob × prob lock" while the
code takes the lock, else the lane's prob: the code is right, it is what `Lane.at` rolls (verifier); the cycle arc sits
min(16 px, 0.08 R) outside the outer ring, so an outer planet's a:b arcs (size + 6: 16 px, 21 on an accent) and a
growing ring (to 23 px) cross its track (verifier); no test for the drawing side (rings cleared on Stop and `reset()`)
(verifier); `skip` means two things in `liveTick` (the option: moments a pad just played; the new event field: why a
step stayed silent): rename the field (architect); "ghost" means two things in one loop body (G4 ghost notes, the V6
rings): rename the V6 code names (architect); the scene restates model rules: `condParts` is a third a:b parse (after
`condPasses` and `loopsPerCycle`), `plays = k === ab.a - 1` restates `condPasses` (perform.js `condLoops` reuses it), the
planet's chance restates `Lane.at`'s threshold: a `Lane.chanceAt(i)` keeps them together when phase 18 automates prob
(architect); untested: the pad-played branch (`export.js:94`), the arc choice and the ring lifecycle inline in `frame`
(a pure `condArcs(cond, loop)`) (architect); the new layers never shed under adaptive quality (architect); on the 390 px
stage the a:b arcs (size + 6, not scaled to the ring gap) overlap the neighbouring planets, the white current-loop arcs
most (architect); the "li:i" key is built twice per planet (architect); flashes and rings are drawn at the step's grid
tick, not when it sounds: a step nudged −0.3 at 120 bpm draws 34.8–38.3 ms after its sound (on-grid steps −11.8…+5 ms,
median 4.3), a skipped nudged or swung step's ring likewise (pre-existing for the flashes, `app.js:345`) (sound); two
clocks: the cycle arc follows `heardTick()` (minus `outputLatency`), the bloom, flashes and rings the scheduled audio
time, so on a high-latency output the arc would wrap after the bloom (from the code, headless latency is 0; pre-existing
for the flashes and the bloom) (sound); exports are not bit-repeatable even with locked dice (the voices' own noise,
−34.7 dB RMS; pre-existing, [[BACKLOG]] Later "Seeded noise in offline renders") (sound); an early part sent just before
Stop sounds but its step never draws (1 of 58; pre-existing) (sound); planet opacity shows the programmed chance, not a
coupled lane's lift (sound, ines); the three ring kinds differ only by their dash (solid, dashed, dotted), subtle at
1.5 px for 450 ms, dashed vs dotted hard to tell apart on a phone, no non-visual cue: a hue or a small legend (ines,
greta); slot restarts not tried for the arcs (they read the same `loop` as `condPasses`) (ines); on a long cycle the
outer arc reads as static: a position label or tick marks where lanes realign (ines); fill / first / pre keep the plain
dashed halo: a mark saying "only on loop 1" / "only on a fill" (ines); the cycle arc's track (`rgba(236,233,247,.07)`)
measures ~1.1:1 on the background, so "how much is left" can't be read: .15–.18 (greta); on a phone the 1.5 px, 45 % arc
is easy to miss and its head dot carries it (greta); on a phone the countdown pill, the arc head and the faint outer
rings crowd the lower right, no overlap (greta); 2 px a:b arcs on 8–10 px planets with b ≥ 4 and a ratchet compete with
the ratchet dots and the accent flare, the lit loop is subtle: a thicker lit arc (greta); the 0.2 opacity floor makes a
low-chance planet look nearly like an empty step on a phone (greta).

GOOD: one decision path: the reason is decided once in `Lane.at`, carried through `liveTick`'s early decisions and only
drawn by the scene, and the hit path is byte-identical to the phase start (live, render, MIDI) (verifier, architect,
sound); a mute or a solo elsewhere is your choice, not a miss, so the rings show only chance and conditions (architect,
ines); the cycle arc shares `align()` with the countdown and the bloom, reduced motion keeps the rings still, and the
scene still idles after Stop (verifier, architect, ines, greta).

### Changes after round 1

- **Quick SHOULDs done** (nothing a reviewer measured changes: the hits, the reasons and the drawing are the same):
  - one name each (architect): the event's reason is `miss` (`Lane.at`, `liveTick`, `onTick` → `scene.onStep`), so
    `skip` is only `liveTick`'s option again (moments a pad just played); the scene's V6 rings are `misses` / `MISS_MS`
    (the user-facing name stays "ghost flash"), so "ghost" is only the G4 ghost note.
  - one rule each (architect): `condParts` moved to `lanes.js` next to `CONDS`, the one parse of a:b (`loopsPerCycle` and
    the scene use it); the scene's arcs come from a pure `condArcs(cond, loop)` whose `plays` is `condPasses` itself;
    `Lane.chanceAt(i)` (the prob lock, else the lane's prob) is what `Lane.at` rolls against and how solid the planet is,
    so the two can't drift apart when phase 18 automates prob; the comment at the planet says so (verifier).
  - the "lane:index" key built once per planet (architect); the cycle arc's track at alpha .16 (was .07, ~1.1:1), so what
    is left of the cycle reads (greta).
  - the help (button "?") names the marks in plain words: a planet as solid as its chance, the flashing ring and its
    three kinds, the a:b arcs (solid = the loop it plays on, white = the loop you are in), the outer arc (ines, greta).
- **Not changed** → [[BACKLOG]] Later: "Scene timing against the sound" (sound: draw at the step's own time, one latency
  for everything drawn), "An early part at Stop" (sound), "V6 marks on a phone" (architect, greta, verifier: the arcs'
  size on a tight stage, the cycle arc's weight and its crossings, the 0.2 floor, telling dashed from dotted), "The V6
  layers under adaptive quality" (architect), "Long cycles and the other conditions on screen" (ines), "A scene test"
  (verifier, architect); the coupling lift added to "Generative hints on screen" (sound, ines). Exports that differ
  between renders are "Seeded noise in offline renders" (already there). ines' slot-restart question: the arcs read the
  event's `loop`, the count `condPasses` judges, so a restart moves both.
- Tests (201 + 9; `orbit2/test/visuals.test.js` 3 → 5): the reason tests read `miss`; "V6 r1 liveTick: a step a pad
  just played is neither doubled nor ringed as missed" (the pad branch, architect); "V6 r1 one rule for the chance and
  the a:b loops" (`chanceAt` through a rotation is what `Lane.at` rolls; for every a:b in `CONDS` and loops 0–11 one lit
  arc, the lane's loop, solid exactly when `condPasses` says it plays, nothing lit when stopped; `loopsPerCycle` with
  1:3 and 2:4 is 12). `npm run check` clean, `npm test` 201 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10
  (serve.py 5400 + headless Chrome 9222, both stopped). Page (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): kick
  50 %, rim 1:3 + 2:4, hat locks 25 % / 0 %, locked dice, 150 bpm: the scene gets `miss` (the phone run: 39 hits, 22
  dice and 11 condition misses; no event carries `skip`), 16.67 ms, quality 1, 0 page errors on desktop (1440 × 900), phone
  (390 × 844) and with reduced motion; screenshots looked at (the track now visible, arcs and rings as before, the help
  paragraph on desktop and scrolling on the phone). **Phase 13 review: `result: HAPPY`.**

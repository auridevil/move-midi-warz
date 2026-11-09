---
type: review
phase: ORBIT2-01
title: ORBIT2-01 bug batch (B1–B12), review panel
date: 2026-11-06
round: 3
result: IN PROGRESS
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  kai: NOT HAPPY
  ines: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
---

# ORBIT2-01 · Bug batch: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), kai, dex, ines, tomi, greta. Process: [[REVIEW-PANEL]].
Brief: phase goal (fix B1–B12 without changing what works), B1–B12 verbatim from [[BACKLOG]], `git diff --stat
f1b4387..HEAD` (9 files, +232/−59, commits f3608ab..9da4eff), how to drive `orbit2/index.html` with
`orbit2/tools/cdp.mjs`, special attention: B1 parity in live play and exports, B5 identical hits, B9 simulated clock,
B8 keyboard, B10 stress while switching slots / evolving, no regressions (whole-bar exports with ACID, exact jam).

## Round 1: 0 of 8 HAPPY

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | B9 pause → tempo dives; B8 mouse-focused button owns Space, knob drag kills letters; B11 undoing a load mixes mute/solo |
| architect | NOT HAPPY | B9 pause → tempo dives; B8 (same) |
| sound | NOT HAPPY | B9 slow on real tempo changes (120→126: 58 ms behind, shipped 20; ramp 120→140: 141 ms, shipped 38) |
| kai | NOT HAPPY | B8 (same); B9 pause / mode switch → fake tempos; B4 × B1 cycle ignores the 2-loop period of swung odd lanes |
| dex | NOT HAPPY | B9 pause; B7 snap > 0.5 still skips the slice start on 11 kit lanes; B8 (same) |
| ines | NOT HAPPY | B4 × B1 cycle not a true period (10 of 315 random machines); B9 pause |
| tomi | NOT HAPPY | B1 ×3, ×3/2, ×¾ lanes now swing beats (regression); B8 (same); B9 pause |
| greta | NOT HAPPY | B8 (same); B4 cycle readout stale after condition / prob lock / dice repeat edits |

Shared SHOULD items (pre-existing in the shipped Orbits): sample lanes silent in every WAV / stems export (all 8);
phase lock snaps on every incoming tick and swings away (6); tempo knob shows 128 while following 127.5 (7).

### Changes after round 1

- **B9** `makeBpmFollower` rewritten (`midiio.js`): least-squares fit over the ticks since the last jump (up to 16
  beats), jitter measured from second differences, a change must beat 4 standard errors of the fit; every tick is
  checked against the fit and 3 misses on one side = a jump (keep only the ticks since); a silence > 4 ticks (≥ 250 ms)
  starts afresh, keeping the bpm; a significant bend = a ramp, read at the newest tick in 0.75 bpm steps; first
  reading after 12 ticks. `PolyMidi`: 0xFA/0xFB/0xFC reset the follower in every mode (start/stop handlers still only
  in the transport modes), `setFollow()` resets it on a mode change. Simulated against the shipped follower (same
  clocks, 5 seeds):

  | clock | shipped Orbits | round 1 | now |
  |---|---|---|---|
  | steady 127.5, ±1–3 ms | 730–960 changes | 1–3 | 2–4, all in the first ~10 beats |
  | step 120→126 | 9–15 ch, 12 ms off | 19 ch, 50 ms | 5–8 ch, 7 ms |
  | step 120→90 | 25 ch, −105 ms | 73 ch, −427 ms | 4–7 ch, −47 ms |
  | step 174→87 | 91 ch, −281 ms | 90 ch, −1153 ms | 4–7 ch, −144 ms |
  | ramp 120→140 / 16 beats | 112–149 ch, 34 ms | 64 ch, 142 ms | 29–35 ch, 17 ms |
  | pause 0.1–30 s, same tempo | bogus 24–100 bpm | 10–82 ch, down to 20 bpm | 0 changes |
  | first reading | 25 ticks | 49 ticks | 12 ticks |

- **B8** `controlOwnsKey` (`app.js`): a control owns keys only when the keyboard put the focus there (Tab / arrows,
  tracked on `focusin`); focus left by a click, a tap or a knob drag (gauges don't take focus) counts for nothing, so
  Space plays and letters toggle steps; a Tab-focused knob owns only its arrows; Alt/Cmd/Ctrl shortcuts pass (Alt+1–4
  read from `e.code`: Option+1 types ¡ on a Mac); voice / kit selects let go of focus after a mouse pick.
- **B11** `History` (`history.js`): steps keyed without mute / solo / selected lane; a commit with the same key refreshes
  the current step instead of adding one; loads (setup, slot, link, init) are their own steps; undo keeps the live
  mutes except across a load, which restores the old pattern with its own mutes (`{ json, keepPerf }`).
- **B1** `Lane.swungAt()`: every second step on the master clock; at ×3, ×3/2, ×¾ (3 steps per beat or bar) the count
  restarts on each step that falls on the beat, so beats never swing (tomi's rule). `INFO.swing` reworded. Dead
  `Lane.advance()` (old `i % 2` swing, tests only) removed.
- **B4** `loopsPerCycle()` × the swing period (lcm(length, 2 or 3) / length) when swing is on; empty lanes add no
  multiplier (their length still counts). Readout refreshed after lock / condition / repeat / dice-repeat edits
  (`stepEdited()`, Move hold-step paths too).
- **B7** `Lane.loadSample()`: decay 1, snap 0.5, color 0.5 (whole, from the first sample, no swoop); the drum it replaced
  (voice + decay/snap/color) is kept in the sample record: `setVoice()` swaps settings between drum and sample, share
  links fall back to that drum (not 'perc').
- **Shared SHOULDs done**: sample lanes no longer disposed during an offline render (`isOffline`): audible in WAV and
  stems; phase lock moves `clockRef` with a snap (snaps no longer compound); tempo knob `exact` + shared tempo kept at
  0.01 bpm; delay time glides on retime; `Lane.from` copies arrays (editing a loaded slot no longer edits the slot);
  `Lane.recordHit()` (a soft overdub drops an old accent; computer keys: Shift = accent, no vel lock);
  `Machine.from(null).kit` = Common; library rows show migrated voices; announcer quiet on load, says "kit Trap" for a
  kit, silent for clock-driven changes, the touched value first.
- Tests: 90 → 96 (+9 −3 rewritten): ternary swing, brute-force cycle period (≥ 60 random machines), recordHit,
  loadSample / share fallback, History load / perf semantics, unaliased slots; B9 test covers jitter, steps, ramp,
  pauses, Stop/Start and mode switch. `npm run check` OK, `npm test` 96 + 9, `tools/smoke.mjs` 10/10. Browser e2e
  (5400/9400, desktop + phone): 27/27 checks (B8 mouse + keyboard paths, B9 pause in the app, phase lock 4 snaps then
  trims, B11 setup / reload undo, B7 sample audible in stems + WAV, whole bars + ACID, B4 readout, ×3 swing onsets).

## Round 2 (2026-11-09, recovered from the interrupted session): 4 of 8 HAPPY

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none (B9 pauses, B8 mouse/touch paths, B11 checked; check, 103 + 9 tests, smoke 10/10) |
| architect | HAPPY | none |
| sound | HAPPY | none (B9 step 120→126: 3–15 ms, ramp 120→140: 12–25 ms, steady 127.5: 0 changes) |
| tomi | HAPPY | none (B1 at ×3, ×3/2, ×¾: beats never swing; stems within 0.2 ms) |
| kai | NOT HAPPY | B8: a knob drag leaves a Tab-focused button owning Space (Space cleared the lane) |
| greta | NOT HAPPY | B8: same path (`gauge.js:22` preventDefault, `keyFocused` kept) |
| ines | NOT HAPPY | B9: `settle` 0.05 bpm leaves the first reading's error forever → drift in tempo modes |
| dex | NOT HAPPY | B9: same (`midiio.js:35/97`, 0.015–0.04 bpm off after 64 beats) |

### Changes after round 2

- B8: any pointer press or knob drag takes key ownership back from a Tab-focused control.
- B9: `settle` 0.05 → 0.005 bpm.

## Round 3 (2026-11-09, recovered): 3 of 4 HAPPY

| reviewer | verdict | MUST-FIX |
|---|---|---|
| dex | HAPPY | none |
| ines | HAPPY | none (10-min steady clocks end ≤ 0.01 bpm off) |
| greta | HAPPY | none (knob drag path fixed, keyboard focus still owns its keys) |
| kai | NOT HAPPY | B8: turning a knob with the mouse wheel / trackpad (no pointerdown) still leaves a Tab-focused button owning Space |

### Changes after round 3

- B8: a wheel turn on a knob also takes key ownership back (`app.js` wheel listener next to the pointerdown one);
  swing tooltip tightened; small style fix. The interrupted session's own browser check passed (mouse-wheel notches and
  trackpad deltas: Space plays, `z` toggles the step, lane kept). Committed with check OK and 103 + 9 tests.

## Panel from here on

The playbooks were restructured on 2026-11-09 (see [[REVIEW-PANEL]]): this phase's panel is now verifier, architect,
sound, kai, ines. Pending: kai's confirmation of the wheel fix (the close task's confirmation round).


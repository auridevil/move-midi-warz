---
type: review
phase: ORBIT2-02
title: ORBIT2-02 first visit and musical randomize (F1–F5), review panel
date: 2026-11-06
round: 2
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  maya: HAPPY
  rio: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-01]]'
---

# ORBIT2-02 · First visit and musical randomize: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), maya, rio, tomi, greta. Process: [[REVIEW-PANEL]].
Brief: phase goal (a first visit hears a good groove within seconds, a returning user finds their beat, randomize makes
grooves), F1–F5 verbatim from [[BACKLOG]] plus the phase spec, `git diff --stat 9da4eff..4c94e1c` (7 files, +280/−9,
commits 1a8dd23 / 90d7aad / 4c94e1c), `git status --short` (the working tree also holds ORBIT2-01's uncommitted
round-1 review fixes, reviewed separately), how to drive `orbit2/index.html` with `orbit2/tools/cdp.mjs` (hard time
limits, own ports), special attention: the first 10 seconds rendered to WAV, style of the grooves, first visit on a
phone, grooves as data.

## Pre-checks

`npm test` was red before the panel started, in ORBIT2-01's uncommitted follower (not phase 02 code): the B9 test
wanted every tempo change of a steady 127.5 bpm clock within 16 beats, but 6 of 36 jitter seeds re-announced
127.51 → 127.5 later (0.01 bpm, a retime nobody hears), and the ramp case was checked only 8 beats after the ramp ended.
Fixed in `midiio.js` (`settle` 0.01 → 0.05 bpm, the value the original B9 follower had) and the ramp test observes 40
beats instead of 32 (all 12 seeds settle by then). Noted for the ORBIT2-01 pass: after a ramp ends the follower
overshoots by 1.3–2.2 bpm for about a beat (the quadratic fit's extrapolation). Then check OK, 99 + 9 tests, smoke
10/10.

## Round 1: 0 of 7 HAPPY

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | "pattern from seed" still runs the wild roll, so the toast's "dice N" can't re-make the groove; undoing a groove load keeps the groove's tempo |
| architect | NOT HAPPY | techno plays eighth hats (spec: 16ths); grooves bury the parts their descriptions name (hats / rides 22–31 LU, backbeat 18 LU under the kick) |
| sound | NOT HAPPY | the demo's "3" is 24 LU under the kick; style-defining voices buried in most grooves (tone .75 = 4.3 kHz low-pass on metal voices high-passed at 4 kHz, plus groove levels of .4–.6); techno eighth hats |
| maya | NOT HAPPY | groove-load undo keeps the tempo; voices buried (also on a 200 Hz phone model); boom bap swings on two grids (kick "and" of 3 straight, shaker's 105 ms late); "pattern from seed" regression; techno eighths |
| rio | NOT HAPPY | groove-load undo keeps the tempo; techno eighths |
| tomi | NOT HAPPY | boom bap flams (×4 swing .2 vs ×2 swing .3; the boom bap and tresillo families too: 250 / 145 of 400 rolls); techno eighths; the mix buries the parts each description names |
| greta | NOT HAPPY | closing the welcome bar moves the HUD up, so a double-click on × clears lane 1, on "keep jamming" starts a jam recording, on "start fresh" starts play |

Shared SHOULD items: the countdown said "2 bars" for the demo's 5-beat cycle, then "4 beats" (5 reviewers), ran
54–96 ms ahead of the sound (scheduled tick), and sat on every ring's step 1 at 12 o'clock; groove descriptions only in
tooltips (never on touch); "keep jamming" did the same as ×; phone targets of 20–24 px; 5–7 LU loudness jumps between
grooves; first-visit undo led to a hidden default pattern; a `#p=` link left in the address bar won over newer work on
reload; three quick rolls folded into one undo step; the toast's live region was un-hidden in the same task as its text.

### Changes after round 1

- **Undo of a load brings its tempo back** (`history.js`): a load that sets a tempo (groove, setup, link) commits
  `{ tempo, was }`; undo across it returns the tempo you had before (and remembers the current one for redo), redo
  returns the load's own; loads without a tempo (init, slots) and edits leave the tempo alone. `restart()` drops
  everything before the current step. All loads go through one `loadMachine(json, { bpm, exact, selected })` in
  `app.js` (init, groove, link, setup: was five copies).
- **Pattern from seed** = the musical roll from that seed (Shift+click: the wild one), through the same `rollPattern()`
  randomize uses (`Dice.take(seed).stream(0)`); every roll is its own undo step.
- **Techno**: sixteenth hats `xgXg…` (ghosts between, the "and"s accented). The step language gained `g` = ghost (vel
  lock .4).
- **Boom bap on one swing grid**: kick, snare, shaker and crackle all on eighths swung .2 (60 %); kick on 1, the "and"
  of 2 and the "and" of 3, a ghost snare on the last "and", the crackle a dust layer (prob .5 on eighths). **Families**:
  one grid per roll (swing only on ×4 lanes, all by the same amount: four on the floor's perc and hats share it, boom
  bap's hats moved to sixteenths with swung pickups at 57.5–62.5 %); tresillo and clave straight; a half-time snare
  never lands on a kick on 3 (`beatKickSnare`); boom bap never has a lone kick. Test: no flams in any groove and in
  400 rolls of every family (the detector finds the old boom bap's flam at beat 2.5).
- **Mix of every groove**, measured on rendered stems (BS.1770, synth engine) and solved per lane: bright lanes open
  their tone (.9–.95), kicks come down (.57–.71) instead of the rest going past level 1, a little drive where a voice
  needed body (boom bap snare / shaker, house clap / open hat, trap 808, techno rumble), gentle pans on hats and
  percussion. The techno rumble is the sub an octave up with drive, its delay send down to .1 (the send bypasses the
  level). The demo's 3 plays every triplet (`Xxx`).

  | groove | mix LUFS (was) | backbeat | hats / bell / perc vs kick (LU) |
  |---|---|---|---|
  | boom bap | −26.1 (−25.9) | snare −5.8 | shaker −13.0, crackle −25.9 |
  | trap | −24.2 (−21.6) | snare −6.7 | hats −12.9, snap −12.1 |
  | house | −24.5 (−23.0) | clap −8.4 | open hat −11.2, ride −14.1 |
  | techno | −24.2 (−18.9) | rim −9.0 | hats −12.7, rumble −10.4 |
  | DnB | −25.2 (−24.7) | snare −5.0 | ride −11.1, tambourine −15.1 |
  | afro | −24.4 (−20.5) | clave −8.7 | bell −7.9, congas −6.0 |
  | 3 vs 4 vs 5 | −24.6 (−22.6) | rim (the 5) −7.0 | hat (the 3) −8.0, wood −13.9 |

  Spread between grooves 1.9 LU (was 7.1), peaks −5 to −9 dBFS. The dsp engine plays the same settings with its own
  voice levels (open hat +16 dB, ride +13, shaker +14, crackle +21 against synth): there the bright lanes sit up to
  5 LU over the kick. That is the engine's calibration, not the grooves': listed under Later.
- **Welcome bar**: closing it swallows clicks for 450 ms (capture listener), so the second click of a double-click
  can't land on what moved under the pointer; focus that was in the bar goes to play; "keep jamming" also plays; the bar
  closes on play and on any load; region with a label instead of a status role; one line on desktop (the words wrap),
  stacked with 36 px buttons on a phone. "start fresh" says "fresh start · undo brings your beat back".
- **Toast**: a groove names itself with its one-liner and tempo (5 s), so descriptions reach touch and screen readers;
  the first visit names the demo; links say they loaded. The toast stays in the page (opacity, not `hidden`), so only
  its text changes; it fits a phone (max-width, wraps).
- **Countdown**: beats for the last two bars ("5 beats … 1 beat" for the demo), from the tick being heard (the clock
  ref minus the scheduler lead and output latency), in the middle of the core inside the kick ring (two lines when the
  ring is small), words always at .95, the last beat lights the pill's rim (steady with reduced motion).
- **Boot**: pure `bootMode({ saved, hash })` (grooves.js, tested); a first visit's history starts at the demo (or the
  link); a link is used once (it leaves the address bar), and "copy link" no longer leaves `#p=` behind unless the
  clipboard is blocked.
- Small: one doc comment on randomize, `#btn-random` no callout / selection on touch, phone chips left-aligned.
- Tests: 43 → 47 orbit2 tests (+ rewritten F5): no flams (grooves + 400 rolls × 6 families), half-time snare, lone
  kick, techno 16ths, bright lanes open, History tempo / restart, bootMode. `npm run check` OK, `npm test` 103 + 9.
  Browser (5400/9400, desktop + 390×844 touch): 32/32 (first visit demo + pulse + toast + empty undo, one click plays,
  groove undo → 97 bpm / redo → 174, three rolls = three undo steps, pattern from seed re-makes the toast's groove,
  double × and double "keep jamming" fire nothing underneath, keep jamming plays with focus on play, link loads once
  and leaves the address bar, no page errors), screenshots looked at.

## Round 2: 5 of 5 HAPPY

Re-review of round 1's fixes with the whole panel (every reviewer was NOT HAPPY in round 1).

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none. Undo of a groove load restores tempo (100 → 130 → 100 → 130); two `dice-make` rolls after init give the same "five over four · dice 1596" pattern. `npm run check` clean, `npm test` 103 + 9, 300 seeds × 6 families: kick on 1, cycle ≤ 16 bars (max 5), 7 grooves round-trip. |
| architect | HAPPY | none. Techno hats are sixteenths (`xgXgxgXgxgXgxgXg`), asserted in `test/poly.test.js`. Save format: 30 pre-F1 saves from `9da4eff` load with the same lanes and hits; malformed inputs don't throw. Its browser smoke was blocked by empty `node_modules/movewire` in its own run, but `node_modules/movewire` and `vendor/tone` are populated in the repo (checked by the author); not a phase defect. |
| sound | HAPPY | none. Mix LUFS −24.2 to −26.1 (spread 1.9 LU) matches the round 1 table; peaks −3.6 to −9.4 dBFS, zero clipped samples, DC ≤ 0.07 %; backbeat −5 to −8.7 LU and hats/bells/perc −8 to −15 LU under the kick. Demo kick starts at frame 8; triplets within ±35 frames. |
| maya | HAPPY | none. First visit plays the demo after one tap on the pulsing play; undo restores tempo (100 → 140 → 100); thirty randomize rolls only named families; welcome bar on return; chips wrap at 390 px with no horizontal scroll. |
| rio | HAPPY | none. Techno toast names its sixteenth hats; welcome bar stacks 36 px buttons on phone; "start fresh" and link loads undo cleanly; `#p=` loads once and clears the hash. |

SHOULD items recorded (never block): the demo toast covers the pad area on a 390 px phone (rio, maya); the
`#p=` failure toast reads "Failed to fetch" (maya); the core label "KICK 90 4 ×1" overlaps the ring on return (rio);
the "aligns in N bars" label was not seen in screenshots (verifier, maya), needs a visual check; mix table is
measured on the WAV path, which sits about 1.1 LU under the raw stem path (sound); onset counts are not
envelope-based (sound).

### Changes after round 2

- No code changes: round 2 had no in-scope MUST-FIX. The round is recorded here and in the frontmatter (`round: 2`,
  `result: HAPPY`).
- Checks run by the implementer: `npm run check` clean; `npm test` root 9/9 pass, orbit2 103 + 9 (per verifier);
  `node tools/smoke.mjs http://localhost:5400` 10/10 ok (`orbit2/index.html` ok), with `serve.py 5400` and
  headless Chrome on `--remote-debugging-port=9222`, both stopped afterwards.

## Panel from here on

The playbooks were restructured on 2026-11-09 (see [[REVIEW-PANEL]]): this phase's panel is now verifier, architect,
sound, maya, rio. Round 1's fixes are committed (cd3a958); round 2 re-reviews them.


---
type: review
phase: ORBIT2-07
title: ORBIT2-07 longer patterns and more lanes (L1, L2, L5), review panel
date: 2026-11-11
round: 1
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  tomi: HAPPY
  kai: NOT HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-06]]'
---

# ORBIT2-07 · Longer patterns and more lanes: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), tomi, kai. Process: [[REVIEW-PANEL]].

Phase start: `dd9af9c` (ORBIT2-06 closed). Implementation commits: `4ca71dc` (L1, L5), `2626557` (L2), `97a5e25` (tests
and browser check).

## For the brief: where the new things are

| item | model / audio | on screen | Move |
| --- | --- | --- | --- |
| L1 32 steps | `MAX_STEPS = 32` (`lanes.js`): every per-step array (hits, accents, locks, trigs) holds 32, `Lane.from` loads a 16-entry save with steps 17–32 empty; length 1–32, euclid and rotation over the length; evolve's length moves stay within 2–16 (`Math.max(16, l.length)`); wild randomize 2–12 | step strip `#stepsui`: 32 buttons, class `short` for a lane ≤ 16 (8 per row, 17–32 hidden), a longer lane two rows of 16 (touch: rows of 8) (`styles.css`); length / euclid / rotation gauges up to 32 | step buttons show 16 of the selected lane's steps at a time (see L5) |
| L5 pages | — | — | `app.js` `pg`, `padFirst`, `stepFirst`, `padPages`, `pinPage`: each pad row follows its own lane's playhead page (8 steps; page 1 while stopped), the step buttons the selected lane's (16); Back + ◀ ▶ or Back + a step button pins one page for every row, Back alone follows again; while Back is held the step buttons show the pages; Back LED lit when there are pages, cyan when pinned; the computer keys (z–, a–k, q–i, 1–8) mirror the pads' page |
| L2 6 lanes | `Machine(n)` / `Machine.from` keep 4 or 6 (`laneCountOf`, `LANE_COUNTS`, `MAX_LANES`), `setLaneCount` (lanes 5–6 empty with the current kit's voices, else Common's; chokes into dropped lanes cleared), `LANE_NAMES` / `LANE_DEFAULTS` for 6; `kits.js`: 6 voices per kit, `kitKey` matches a 4-lane pattern on the first four; `randomizeMusical` adds lanes 5–6 after the family's rolls; `addChain` (`app.js`) grows the audio chains; stems 2 × N channels; jam worklet `numberOfInputs` 6 (`jam.lanes`); MIDI `DEFAULT_NOTES` 46 / 49 for lanes 5–6 (`midiio.js`), MIDI export one track per lane | lane tabs 1–6 (hidden past the count), "lanes 4 · 6" control in the Patterns drawer, legend, rings `ringGeo(W, H, stage, lanes)` from 0.25 to 0.85 R (`scene.js`), record / jam arcs at `g.outer`; Alt+1–6; MIDI drawer note / channel for all 6 lanes | Track 1–4 = lanes 4…1 (as before); Shift + Track 4 / 3 = lane 5 / 6 (the track LEDs show lanes 5–6 while Shift is held); the pads show lanes 1–4, or 3–6 while lane 5 or 6 is selected (`padBase`) |

After round 1 the L5 pages and the L2 pad window live in `orbit2/src/poly/pages.js` (`MovePages`: `padFirst`,
`stepFirst`, `current`, `pin`, `window`, `press` / `release`; `padPages`, `trackLane`), used by the Move section of
`app.js`. A fake Move in the page needs its transport stubbed first, or every LED write throws "no MIDI output selected":
`__poly.move.transport = { send() {} }; __poly.move.inControl = true` (verifier, round 1).

## Pre-checks

`npm run check` clean, `npm test` 147 + 9 green on `97a5e25` before the panel started.

## Round 1: 1 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; tomi, kai on sonnet), own ports
5401 / 5402 / 5403 / 5408 / 5404 (+ 940x; the phase start `git archive dd9af9c` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, L1 / L2 / L5 verbatim from [[BACKLOG]], the phase spec (the three build tasks),
the "where the new things are" table above, `git diff --stat dd9af9c..97a5e25` (10 files, +234/−110), `git status
--short` (only this file), the must-fix rule with the later phases' ids and the BACKLOG "Later" items, how to drive
`orbit2/index.html` with `orbit2/tools/cdp.mjs` (`__poly`, a fake Move through `move.emit` and `move.ledState`, a fake
MIDI out, the model in Node) and how to run the phase start. `stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) L5: a step button held across a page turn is never released. Press and release each work out the step from the page shown at that moment (`app.js:1030`; `held` keyed by step, `:1033`), so once the step page has followed the playhead to 17–32 the release looks up another step. Lane 1 32 steps ×4 at 240 bpm, playing: button 3 pressed at step 13, released at 18: no toggle; knob 1 then writes a tune lock on step 3 instead of changing the length (32 stays), Delete clears step 3's locks instead of the lane, until button 3 is tapped again on page 1. A regression: at `dd9af9c` press and release used the button index. (2) L2: the pad window (lanes 3–6) jumps under the fingers: `padBase()` follows `m.selected` and a pad press selects its lane (`app.js:983`, `:1024`, `liveHit`, keys `:1123`). 6 lanes, lane 6 selected, stopped: two taps on pad row 0 col 1 turn lane 3 step 2 on, then lane 1 step 2 on (pad 0 LED 30 → 24); record armed + playing, lane 5 selected, pad rows 0 then 2: hits per lane [0,0,2,0,0,0], expected [0,0,1,0,1,0]. |
| architect | NOT HAPPY | (1) L2: after a lane-count change the selection can point past the last lane: `loadSlot` (`app.js:453`) and evolve's way home (`:592`) put the old selection back unclamped (`loadMachine` and `applyState` clamp). A 4-lane slot recalled with lane 6 selected throws `TypeError … reading 'length'` and every later `sync()` throws; a chain 6-lane → 4-lane slot at 240 bpm with lane 6 selected: 2 page errors; evolve home into 4 lanes: a page error, then `paintLeds` throws in `stepFirst`. (2) The held step across a page turn (the verifier's 1): press at step 4 while stopped, release at step 18: no toggle, knob 1 locks step 4, Delete keeps the hits. |
| sound | NOT HAPPY | (1) L2: 6 → 4 lanes while playing throws in a Draw callback queued before the drop for lane 5 or 6 (`scene.js:110` `burst` ← `onStep` ← `app.js:224`): busy lanes 5–6 at 126 bpm, `setLaneCount(4)` after 2 s: an error on 2 of 3 drops, then the playhead, the orbit flashes, the Move LEDs and the page follow stop while the clock runs, and Tone.Draw's queue grows by ~34 a second. |
| tomi | HAPPY | none (a 32-step son clave on ×4: rotation, euclid 9 over 32 and swing on steps 17–32 right through `collectHits`; 4 ↔ 6 lanes and the Afro kit keep the pattern; two rows of 16 readable, a phone's rows of 8 playable) |
| kai | NOT HAPPY | (1) The held step across a page turn (the verifier's 1): 200 bpm, 6 lanes, lane 1 32 steps: button 3 pressed on page 1, released 400 ms later at step 19: no toggle, `held` keeps step 3, the knobs then edit its locks and condition instead of length, euclid…, until that button is pressed and released again on page 1. |

The implementer reproduced each MUST-FIX on `97a5e25` before fixing (page 5500/9500 on a `git archive 97a5e25` copy,
the fake Move): the held step (no toggle, length 32, `{ tune: −0.02 }` on step 4); the window (lane 3 then lane 1, pad 0
LED 30 → 24; record: lane 3 two hits, lane 5 none); a 4-lane slot recalled with lane 6 selected (`TypeError`, selected
5, no lane); a 6 → 4 chain (selected 5, page errors); the drop while playing (lane 1's playhead stuck on one step for
1.5 s, the Draw queue 191 → 393).

SHOULD items recorded (never block): a release when the lane got shorter under a held step left `held` stale too
(verifier; pre-existing, the fix covers it); Shift + Track 1–4 does nothing on a 4-lane pattern, and Shift + Track 1 / 2
nothing on six, where at `dd9af9c` Shift was ignored (verifier, architect); a pinned page darkens and locks the rows of
shorter lanes (verifier, kai); six lane tabs on a phone are three rows of two (verifier); the page logic is closure state
in `app.js` without tests, the model should own the selection rule, `laneNames` and `rebuildVoices` are written 3 and 7
times, `padPages()` runs once per step button while Back is held, `energy` is a literal six (architect); saves got
bigger (`Lane.toJSON` writes 32 entries per array: an old pattern's link 642 → 667 characters), and `Machine.from` fills
a link cut short with default sounds where `setLaneCount` uses the kit's (architect); the jam worklet records six inputs
for a four-lane take (architect); lanes 5–6 sit low in some kits (Brushes hat / crash 12 dB under the ride, Lo-fi open
hat, Latin shaker, Common's open hat 5.7 dB under its own closed hat, Breakbeat, Minimal) and the Mallets gong is as loud
as the lead marimba (sound), the Afro kit's lane-5 cowbell is low for a bell line (tomi); 6 busy lanes: headroom 72–74
ms against 76.5 with four, worth a check on a phone (sound); 4-lane renders differ from the phase start only in unseeded
noise (sound; the Later item "Bit-identical exports"); musical randomize gives lanes 5–6 the same part in every family,
where Afro / Amapiano / Latin want a shaker or a bell line (tomi); hidden hits past a shortened length come back
(tomi; pre-existing); no "bar 2" mark on the second strip row (tomi); in follow mode the pads repaint under the fingers
at a page turn, with lanes 3–6 on the pads Track 1–4 still mean lanes 4–1, Back + ◀ ▶ steps by 8 while the step buttons
show 16, and no LED says which page or window is showing (kai).

GOOD: old data loads and plays exactly as before (verifier: 12 phase-start machines and links, identical hits and kit;
architect: 207 phase-start saves, all grooves and 200 seeded rolls with evolve, locks, conditions, chokes, 7/8, identical
JSON, kit and hits over 16 bars, 48,327 hits); six lanes end to end (stems 6 + mix all 352800 frames and the raw mix the
exact sum of the stems; jam takes 6 + mix of equal length, also 4 → 6 mid-take; MIDI channel 10 notes 46 / 49; slots,
library, undo, links; stress 0 with 74 ms headroom on six busy lanes); the 32-step model and strip (rotation, euclid,
swing over 32; steps 17–32 on the sample grid; two rows of 16, back to 8 + 8 at 16).

### Changes after round 1

- **A held step button keeps its step** (verifier 1, architect 2, kai 1): the Move's page logic is a pure module,
  `pages.js` (`MovePages`). `held` is keyed by the button and keeps the step it went down on, and a release always ends
  its own press (after a page turn, with Back held, on a lane made shorter). While a step button is held the step
  buttons stay on the page it went down on, so the held step keeps its number and its light; the pads go on following.
  Page (the verifier's repro): button 3 pressed at step ≤ 8, released at 17–28: step 4 toggled on, then knob 1 takes the
  length 32 → 31 and writes no lock; during the hold the step buttons show page 1.
- **The pad window stays while you play it** (verifier 2): `MovePages.window()` moves it only when the selected lane
  leaves it: lanes 1–4, or 3–6 once lane 5 or 6 is selected, until lane 1 or 2 is (a pad, a key, the record path select
  a lane inside it). Page: lane 6 selected, two taps on pad row 0 col 1: lane 3 step 2 on, then off, pad 0 stays lane
  3's (30); record armed, lane 5 selected, rows 0 then 2: one hit on lane 3, one on lane 5.
- **The selection stays within the lanes** (architect 1): `Machine.assign(o, { selected })` keeps the given lane
  selected inside the new count (the model owns the rule); `loadSlot`, `loadMachine`, `applyState` and evolve's way home
  pass it. Page: a 4-lane slot recalled with lane 6 selected → 4 lanes, lane 4, no error; a 6 → 4 chain at 240 bpm with
  lane 6 selected: lane 4, 0 page errors.
- **A lane that went is not drawn** (sound 1): a step's Draw callback (`onTick`) skips a lane index past the count, and
  `scene.onStep` / `burst` ignore a lane that is gone. Page: busy lanes 5–6 at 126 bpm, three drops 6 → 4 while playing:
  0 page errors, lane 1's playhead on 13 different steps in the 1.5 s after each drop, the Draw queue at 2–4.
- **Quick SHOULDs done.** Shift + Track selects as before L2 where it has nothing else to do: on a 4-lane pattern, and
  Track 1 / 2 on six (`trackLane`) (verifier, architect). A pinned page shows a shorter lane's last page instead of a
  dark row (verifier, kai). The page and window rules are pure and tested (architect). `rebuildVoices()` and
  `laneNames(n)` replace 7 and 3 copies, `padPages` runs once per paint, `energy` is sized by `MAX_LANES` (architect).
  `Machine.from` fills a link cut short with the lanes of its kit, through the same `kitLane` as `setLaneCount`
  (architect). Six lane tabs on a phone are two rows of three (verifier). Lanes 5–6 levels (sound, tomi): Common and
  Breakbeat open hat +3.6 / +3.9 dB, Brushes hat and crash tone 0.6 → 0.75 and +1.5 / +1.8 dB, Lo-fi open hat tone 0.75
  and +4.2 dB, Latin shaker +6 dB, Afro cowbell +4.2 dB, Minimal hat +3.9 dB, Mallets gong −4.4 dB with its delay send
  0.5 → 0.35. Stems RMS with every lane on the same two hits a bar: Common open hat −61.1 → −57.6 dB beside the closed
  hat's −55.3; Brushes hat / crash −72.2 / −69.1 → −61.0 / −58.1 beside the ride's −58.1; Mallets gong −37.8 → −41.2
  beside the lead marimba's −36.3. The Move help says where the window goes and that a held step keeps its page.
- Not changed, → [[BACKLOG]] Later: smaller saves (and the live arrays `toJSON` shares with an evolve snapshot), the
  pad window and the track buttons, page LEDs, lanes 5–6 in the musical families, a "bar 2" mark, hidden hits past a
  shortened length, six lanes on a phone, the jam's six inputs, the Latin shaker.
- Tests (149 + 9: 2 new, both fail on `97a5e25`): `pages.js` (a hold across a page turn, a release with Back held,
  follow / pin / a shorter lane, the window through a selection sequence, track buttons with and without Shift on 4 and
  6 lanes); `Machine.assign` keeps the selection inside the lanes, `Machine.from` fills a link cut to five lanes with its
  kit's lane 6. `npm run check` clean, `npm test` 149 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 ok
  (serve.py 5400 + headless Chrome 9222, both stopped). Browser (5400/9400 against `97a5e25` on 5500/9500,
  `/tmp/orbit2-impl/`, deleted): the repros above fail on `97a5e25` and pass now, Shift + Track 2 on four lanes selects
  lane 3 (was nothing), a pinned page 4 lights the 8-step lane's row (was dark), 6-lane stems 6 + mix all 352800
  frames, 0 page errors; screenshots looked at (desktop: six rings, a 32-step lane in two rows of 16; phone: the six
  lane tabs in two rows of three). `app.js` 1262 → 1257 lines, `pages.js` 53.

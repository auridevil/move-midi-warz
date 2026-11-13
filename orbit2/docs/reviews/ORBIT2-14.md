---
type: review
phase: ORBIT2-14
title: ORBIT2-14 playing on the canvas (I1), review panel
date: 2026-11-13
round: 2
stalled: 0
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  rio: HAPPY
  maya: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-13]]'
---

# ORBIT2-14 · Playing on the canvas: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), rio, maya. Process: [[REVIEW-PANEL]].

Phase start: `67bb11d` (ORBIT2-13 closed). Implementation commits: `39dc36e` (I1 canvas gestures), `981f791` (tests and
browser check).

## For the brief: where the new things are

| item | model / logic | on screen / input |
| --- | --- | --- |
| I1 tap a tick, tap a planet | `lanes.js` `Lane.tapStep(i)` (stored step i): off → on → accent → off; a ghost goes off; the step's locks and condition stay | `app.js` pointer controller on `#cv` (pointerdown / move / up / cancel, mouse, pen and touch alike; it replaces the old click-to-select): `scene.locate(x, y)` → `{ lane, step, off }` (the ring under the point, its nearest visible step, px from that tick); `off ≤ TAP_PX` (22) = a tap on that tick: `canvasTap` → `tapStep`, then `popStep` (`scene.flash` + `hitSound` at `T.immediate()` with the step's accent, tune / velocity lock and slice, once audio is awake) or, when it went off, a small flash; farther along the ring = select the lane only |
| I1 drag along a ring | `scene.js` pure `ringAngle(dx, dy)` (0 at 12 o'clock, clockwise), `stepAtAngle`, `laneAtRadius(g, d)` (each ring owns half a gap either side), `angleDelta`, `turnRotation(rot0, turn, len)` (whole steps, clockwise = rotation + 1), `dragKind` | past 8 px (`LONG_SLOP`) a drag is a turn (along the ring) or a pull (across it), decided once by `dragKind`; a turn sums `angleDelta` and sets the rotation through the rotation knob's setter; while dragging it paints live (`dragPaint`: knobs, steps strip, Move LEDs, canvas) and records nothing until release |
| I1 pull / pinch = length | `pullLength(len0, dr, stepPx)` (a step every `max(8, gap·R/3)` px of radial distance from the start), `pinchLength(len0, scale)`; both 1..32 | a second finger turns the gesture into a pinch on the first finger's ring (a turn so far is put back); `dragLength` sets the length from the lane as it was when the gesture started (hits and euclid count restored first; back at the start length = exactly as it was) through the length knob's setter (`setLength`, euclid refill) |
| I1 long-press menu | (none) | 450 ms (`LONG_MS`) still on a planet (a step with a hit), or a right-click on one: `#ring-menu` (`role=menu`, five `menuitem` pills on an ellipse round the planet, kept inside the window): tune, chance, velocity, nudge, condition with the step's current values (cyan = locked); a pill opens the steps strip's lock panel on that step with that control focused; Esc or a pointer down outside closes it |
| I1 one undo step a gesture | `history.js` `History.commit(…, { own })`: a gesture is its own step, never folded into the edit before or after it | `ownNext` → `save()`: a tap = one step, a whole turn / pull / pinch = one step (recorded on release), a touch that only selects = none |
| help | | `index.html` help table, row "rings" |

Page handles: `__poly.m` (the Machine: `m.lanes[i]` with `length`, `rotation`, `hits`, `accents`, `euclidK`, `hitAt(i)`,
`tierAt(si)`, `stepIndex(i)`, `tapStep`; `m.selected`), `__poly.scene` (`locate(x, y)`, `stepXY(li, i)`, `geo()`,
`stats()`), `undo`, `redo`, `hist`, `sync`, `editLocks`, `setFocusMode`, `applyTempo`, `setLaneCount`, `shareLink`,
`exportWav`, `exportStems`, `exportMidi`, `stress`, `wake`. CSS: `#cv { touch-action: none }`, `.ring-menu`. Tests:
`orbit2/test/gestures.test.js` (6).

## Pre-checks

`npm run check` clean, `npm test` 207 + 9 green on `981f791` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; rio, maya on sonnet), own ports
5401 / 5402 / 5403 / 5410 / 5405 (+ 940x; the phase start `git archive 67bb11d` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, I1 verbatim from [[BACKLOG]], the phase spec (the build task), the "where the new
things are" table above, `git diff --stat 67bb11d..981f791` (7 files, +223/−11), `git status --short` (only this file),
the must-fix rule with the later phases' ids (I2–I7, A) and the "Later" items, how to drive `orbit2/index.html` with
`orbit2/tools/cdp.mjs` (taps, drags, long-press, pinch, right-click as raw CDP input), and how to run the phase start.
`stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) NEW, I1: a nudged planet can't be tapped, long-pressed or right-clicked where it is drawn. G1 draws a hit with a nudge lock at (i + nudge) / len round the ring (`scene.js:239`), `locate()` measured `off` to the grid tick only, and the tap, the long-press timer and the right-click all need `off ≤ 22`. 1440 × 900, lane 4 at 16 steps, one hit on step 5 nudged +0.25: drawn 27 px off its tick (ring r 277), a click on the planet left it `normal`, a right-click opened nothing; phone 390 × 844: 8 steps at +0.25 → 29 px, 16 steps at +0.4 → 23 px, a tap and a 650 ms long-press on the planet do nothing (its faint tick works); the demo's 2-step outer ring nudged +0.15: 130 px. The menu offers "nudge" itself. (2) NEW, I1: on a phone a long-press near a side puts a pill under the finger and the release clicks it: the menu's centre is kept at x 170–220 on a 390 px screen. Lane 4 at 8 steps, planets at 12, 3 and 9 o'clock, 650 ms (and 1500 ms): at 3 o'clock (341, 512) "chance" covers x 266–364 / y 471–515, events `pointerdown:cv pointerup:cv click:chance 100%`, the menu closes, the lock panel opens, the page jumps to scrollY 934; at 9 o'clock "condition", scrollY 1056; at 12 o'clock (no clamping) the menu stays. (3) NEW, regression: on a phone a swipe that starts anywhere on the stage no longer scrolls the page. `#cv { touch-action: none }` (`styles.css:215`) covers the whole canvas, which up to 1100 px sits in the page (390 × 390 at y 317–707 of a 3478 px page). The same 250 px swipe up from the stage's corner, the core, a ring: 235 px at `67bb11d`, 0 now; below the stage 235 both. About 46 % of the stage (corners, core, outside the outer ring) has no gesture. Check clean, 207 + 9, smoke 10/10. |
| architect | NOT HAPPY | (1) NEW = verifier 3: from the stage's corner (14, 693), where `locate()` finds no lane, scrollY 0 → 235 at `67bb11d`, 0 → 0 now (from the core too). A fix checked in the page (`touch-action: auto` plus a non-passive `touchstart` that cancels only on a ring or when a second finger joins): the corner swipe scrolled 351 px, a vertical turn at 3 o'clock on ring 3 still turned 2 steps with scrollY 0 and one undo step. |
| sound | NOT HAPPY | (1) NEW, I1: a canvas tap while the pattern plays can silence its own pop and the lane's next hit, already queued. `popStep` (`app.js:1658`) called `hitSound(…, T.immediate())` on the lane's own mono Tone voice while the scheduler had queued its next hit ~60–80 ms ahead; an earlier trigger on the same voice wipes the queued envelope, and the pop is lost too. 120 bpm, one lane alone (8 hits in 16 steps, send 0), 16 mouse taps of 90 ms, the master recorded live (AudioWorklet) and the voice's triggers logged: kick, 2 of 16 taps landed while the next hit was queued (43 and 48 ms before it was due): pop peak 0.000, the queued hit 0.010–0.011 against ~0.25 (≥ 27 dB down); hat, 5 of 16 (10–42 ms), 4 lost both (0.000–0.018 against 0.071 normal, 0.125 accent). Controls: none of 116 sequenced hits without a tap in that window lost, 25 of 25 taps outside it heard. Roughly half the taps on a 16th-note lane, 25–30 % on an 8th-note lane. Every other audition sounds only when stopped (`!playing`). |
| rio | HAPPY | none (phone and desktop: a tick tapped three times goes off → on → accent → off, one undo entry each; a one-step drag turns the ring live, one entry on release; pull 4 → 8 and pinch 8 → 28 on the phone, pull 28 → 30 on the desktop, one entry each; a 650 ms hold shows the five pills with their values inside the 390 px window and they stay after release; no page errors) |
| maya | HAPPY | none (390 × 844 with touch: tap add, accent, off, one undo step each; drag along ring 1 by 3 steps, undo exact; pinch 4 → 16; long-press and right-click open the menu, values in plain words; no page errors) |

SHOULD items recorded (never block): one pull can't shorten the inner ring by much (r 81.6 px, a step every 21.75 px:
16 → 13 at −65 px; further, past the centre, the length grows again) (verifier); after a touch long-press the release
click lands on `#cv` and takes the focus off the menu (verifier); the pull / pinch restore is a hidden coupling (only
`hits` and `euclidK` come back, enough only because the length knob's setter rewrites nothing else): restore the step
data in the model, with a test, and move the pointer state machine into a `poly/gestures.js` with injected callbacks
(`app.js` 1738 → 1824) (architect); two ring hit tests (`scene.pick` for the audio-file drop, `laneAtRadius`) (architect);
the tap's sound ignores the step's repeats (22 AudioParam calls for a ×3 step, as for a plain one) while `auditionLock`
plays them: one audition for both (architect); in XOR mode a planet the mask lights goes on → off on the first tap, so
its accent can't be reached from the canvas (`tapStep` reads the stored tier; the strip's `cycleStep` alike, before this
phase) (architect); no select-only spot on a phone's inner rings (each ring owns 17.2 px either side, less than
`TAP_PX` 22; half the gap between ticks on rings 1 and 2: 16.7 and 20.2 px) while the help says "touch a ring to select
its lane" (architect); Esc on the menu leaves the focus on BODY (`cv.focus?.()` does nothing), and `role=menu` has no
arrow keys (architect); mute and solo don't hold for taps (a muted lane, playing: 4 of 4 taps at full level; the pads
alike) (sound); the tap sounds on release, 97–118 ms after the touch with a 90 ms hold (sound); on a short voice (hat,
decay 0.15) accent taps measured 0.061–0.129 against a steady 0.125 sequenced (`T.immediate()` events landing a few ms
late on a ~6 ms decay) (sound); the Move pads' `liveHit` uses the same `T.immediate()` (older code, not measured)
(sound); after a pill on the phone the focus landed on a gauge with the lock panel below the fold (not verified) (rio);
the open menu hides the ring's planets: a fade-in or a dimmed backdrop (rio); a tap between ticks selects without a cue
(rio); a pill scrolls the page ~1350 px down to the lock panel in ~1.5 s, the rings gone with no way back in sight: a lock
panel over the canvas, or a "back to rings" (maya); the pills (12 px text, 32 px tall) are small and overlap the centre
rings on a 390 px screen: bigger pills or a bottom sheet (maya); a tap on a ghost turns it off with only a flash (maya);
nothing but the help says the rings can be dragged or pinched (maya).

GOOD: one undo step a gesture, exact both ways (three taps, three steps; a 90° turn, a slow turn with moves 800 ms
apart, a pinch after a turn: one step each; select-only and a pull out and back: none) (verifier, architect, rio,
maya); a pull back to the start length leaves the lane byte-identical (accent, tune lock, condition on a euclid lane),
and a phase-start save loads byte-identical (verifier, architect, sound); drags cost the audio nothing (a 1.25-turn and a
pull while playing: headroom ≥ 68.5 ms against 69.9 without, 16.7 ms frames, no page errors), and the first tap after
load is heard (sound); the menu reuses the lock panel and the visible step numbers (rotation 5: tune → visible step 6)
(architect).

### Changes after round 1

- **A planet is played where it is drawn** (verifier 1): one rule in `scene.js`, `planetNudge(lane, i)` (a hit's nudge
  lock, in steps; 0 for an empty step), used where the planet is drawn, by `locate()` (`stepAtAngle(dx, dy, len, nudge)`
  finds the nearest mark: a planet where it is drawn, an empty step at its tick, so the faint tick of a nudged planet
  still reaches it), by `stepXY` (the menu opens round the planet) and by the burst (a tap's pop and a played hit's wave
  leave from the planet). Page, the verifier's repro: `locate` on the planet = lane 4, step 5, 0 px; a click accents it,
  a right-click opens the menu.
- **No pill under the finger, no click on release** (verifier 2): when the menu's centre has to leave the planet (kept
  inside the window), the pills turn so the planet sits in the middle of the gap between two of them; and the `touchend`
  of a long press that opened the menu is cancelled, so no click (and no focus move) follows it (verifier's SHOULD: the
  focus stays on the first pill). Page, 390 × 844, 650 ms long-presses at 3, 9 and 12 o'clock on an 8-step outer ring:
  the menu stays open, no pill box holds the finger, the focus on a menu item, scrollY 0 (screenshot: the planet between
  "condition" and "tune").
- **Off the rings the stage scrolls again** (verifier 3, architect 1): `#cv { touch-action: manipulation }` (no
  double-tap zoom) and a non-passive `touchstart` on the canvas that cancels only a touch that lands on a ring
  (`scene.locate`) or joins a gesture under way (a pinch's second finger). Page, 390 × 844: a 250 px swipe up from the
  stage's corner scrolls 360 px, from the core 540 (with the fling); a vertical turn at 3 o'clock on the outer ring
  turns it, scrollY 0; tap, long-press and pinch as before. (A touch that stops a fling never reaches the page: Chrome's
  own rule, as anywhere on a scrolling page.)
- **A tap is heard when stopped, on its turn while playing** (sound 1): a tap no longer plays a hit of its own on a
  playing lane. `auditionStep(lane, i)`, now also the lock panel's audition (`auditionLock` calls it), plays the step only
  while stopped, as every audition does, at `T.now()` like them (sound's SHOULD on `T.immediate()`'s uneven level), with
  its repeats, their spacing, the pitch ramp and the fade (architect's SHOULD). The help row says it. Page: stopped, a
  tap on a ×3 step = 3 hits; playing at 60 bpm, a tap 8 steps ahead of the head adds the hit and sounds nothing in the
  next 400 ms. So a muted lane makes no sound while playing either (sound's SHOULD); stopped, a tap auditions it, as the
  lock panel does.
- **Found by the implementer:** (a) a gesture belongs to the lane it started on: a slot switch, a chain step, undo or a
  load (`Machine.assign` makes new lanes) during a pull let `dragLength` write the old lane's hits into the new one and
  record that on release; now the gesture ends, with nothing done, when its lane goes (page: undo mid-pull, the new lane
  stays at 8 steps and no step is recorded; at `981f791` the pull went on into it). (b) Focus mode hides the lane panel,
  so a pill opened a lock panel nobody could see; picking a lock now leaves focus mode first (page: focus mode,
  right-click, "chance": focus mode off, the lock panel shown, probability focused).
- **Quick SHOULDs done:** a pull is measured along the line it started on (`outward`, which `dragKind` uses too), so it
  keeps shortening past the centre: the inner ring goes 16 → 1 in one mouse pull (verifier); a pull or a pinch rebuilds
  the whole lane from a copy of it at the start (`Lane.restore`), not only its hits and euclid count (architect);
  `scene.pick` (the audio-file drop) is `locate().lane`, one ring test (architect); Esc gives the focus back to what had it
  before the menu, and the arrow keys (Home / End) go round the pills (architect).
- **Not changed** → [[BACKLOG]] Later: "A gestures module" (architect), "One tap rule through the euclid mask"
  (architect), "Rings and the lock menu on a phone" (architect, rio, maya), "The tap's sound and the pads" (sound),
  "Telling a beginner the rings play" (maya).
- Tests (210 + 9; `orbit2/test/gestures.test.js` 6 → 9): "I1 r1 a nudged planet is played where it is drawn" (the
  verifier's repro, round 12 o'clock both ways, through a rotation, the 2-step ring, a nudge lock on an empty step, and
  with no nudges the plain nearest tick for every length), "I1 r1 a pull is measured along the line it started on"
  (through the centre, sideways, the inner ring 16 → 1), "I1 r1 a pull is rebuilt from the whole lane as it started" (out
  to six lengths and back: byte-identical, whatever happened in between). `npm run check` clean, `npm test` 210 + 9,
  `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py 5400 + headless Chrome 9222, both stopped). Page
  (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks above, 20 of 20, 0 page errors on desktop (1440 × 900)
  and phone (390 × 844); screenshots looked at. `app.js` 1824 → 1845 lines.

## Round 2 (re-check): verifier, architect and sound HAPPY, the whole panel HAPPY

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound, all on the default model), fresh sub-agents in
one message, own ports 5401 / 5402 / 5403 (+ 940x; the phase start `67bb11d` on +100, the code before the round-1 fixes
`981f791` on +200), the verifier also ran the smoke on 9222. Brief as in round 1 (goal, I1, the spec, the "where" table,
the must-fix rule with the later ids and the Later items, the page), `git diff --stat 981f791..299b0d9` (the round-1
fixes alone, 7 files, +291/−52) and the whole phase (`67bb11d..299b0d9`, 9 files, +471/−20), each one's own round-1
MUST-FIX and "Changes after round 1", with the instruction to confirm their items first with the same repro, then check
nearby, anything new only in scope and marked NEW. `stalled: 0`: every round-1 MUST-FIX is closed and everyone is HAPPY.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | (1) FIXED: 1440 × 900, lane 4 at 16 steps, step 5 nudged +0.25 (27 px off its tick): `locate` on the planet = lane 4, step 5, off 0; a click accents it (one undo: on), a right-click opens the menu (5 pills, focus on "tune 0"), Esc closes it; at ±0.5 (54 px off) a click accents the planet and the empty tick next to it still adds its own hit; the demo's 2-step ring at +0.15 (130 px): off 0, a click accents it, a right-click opens the menu; phone 390 × 844, 8 steps at +0.25 (29 px) and 16 at +0.4 (23 px): a tap accents, a 650 ms long-press opens the menu, focus on a pill, scrollY 0. (2) FIXED: phone, 8-step outer ring, planets at 3, 9 and 12 o'clock, 650 and 1500 ms: events `pointerdown:cv touchstart:cv pointerup:cv touchend:cv`, no click, no contextmenu; the menu stays, focus on "tune 0", the lock panel closed, scrollY 0; no pill box holds the finger (at 3 o'clock, finger (341, 512): tune x 271–331, condition x 240–361 / y 454–498, the rest farther); a pill tapped afterwards still works ("chance": the lock panel, probability focused). (3) FIXED: the same 250 px swipe scrolls 235 px from the stage's corner, the core and below the stage, as at `67bb11d`; on the outer ring at 3 o'clock scrollY 0 and the ring turns (0 → 7); a tap on an empty tick adds a hit; a pinch 8 → 19 at scrollY 0, one undo back to 8; a ring tap whose `touchstart` is cancelled still counts as a user action (`navigator.userActivation.hasBeenActive` false → true, as at `981f791`). Nearby: check clean, 210 + 9, smoke 10/10, no page errors; focus mode → "chance" leaves it, the lock panel shows, probability focused; arrows, Home, End go round the pills; the inner ring pulled from 12 o'clock past the centre 16 → 7 (one undo: 16); a pull in and back on a lane with an accent, tune and nudge locks and a 1:2 ×3 condition leaves it identical, a pull in plus one undo restores it exactly. |
| architect | HAPPY | (1) FIXED: 390 × 844, 250 px swipes up, scrollY read after 2.5 s, `67bb11d` / `981f791` / HEAD: stage corner (14, 693) 235 / 0 / 235, the core 235 / 0 / 235, below the stage 235 / 235 / 235; the corner still scrolls after a run of taps, pinches and long-presses. The rings keep the touch: a turn (ring 4 at 16 steps, finger up 120 px at 3 o'clock) 0 → 14 (2 steps), scrollY 0, one undo step; a tap on an empty tick adds the hit, one step, scrollY 0; a pinch 60 → 120 px takes 2 → 4 steps, `visualViewport.scale` 1, scrollY 0, one step; a 750 ms long-press opens the menu with the focus on a pill and it stays after release, scrollY 0, no undo step (at `981f791` the release clicked "chance 100%" and scrolled 1085 px); a tap on the core closes it. Nearby: the inner ring pulled through the centre 16 → 3 in one step (undo: 16); an out-and-back pull (8 → 13 → 8) on a lane with an accent, tune and nudge locks and a 1:2 ×3 condition: JSON byte-identical, no undo step; undo during a pull: the length stays 8, no step recorded, redo kept (2 past / 1 future); the menu keys; the save format unchanged (`save()` writes `JSON.stringify(m)` to the same key, `own` defaults to false); check clean, 210 + 9, no page errors. |
| sound | HAPPY | (1) FIXED: the same repro (120 bpm, one lane alone, 8 hits in 16 steps, send 0, 16 mouse taps of 90 ms, the master recorded live with an AudioWorklet, every `hitSound` logged with its issue time and origin). Kick at HEAD: 10 of 16 taps landed while the next hit was queued (21–71 ms before it was due): the taps made 0 hits of their own, the queued hits peaked 0.179–0.190 (normal, median 0.184) and 0.259–0.260 (accents), all 96 sequenced hits at full level. Hat: 8 of 16 in the window (14–95 ms): 0 tap hits, the queued hits at their normal level (0.089–0.142), all 71 at full level. The same script still catches it at `981f791`: kick 11 of 16 in the window, every tap played its own hit, queued hits down to 0.025 (−17 dB), 0.057, 0.079, 0.11; hat down to 0.027 / 0.029 (−12 dB). All 16 hits added while playing sounded at full level the next time the head reached them (kick 0.31–1.93 s after the tap, cycle 2.0 s; hat 0.08–2.42 s, cycle 2.67 s). Nearby: the stopped audition at `T.now()` is steady and matches the sequenced hit (kick normal 0.178–0.187, 0.4 dB spread, accent 0.257–0.260; hat 0.117 ×4, accent 0.148 ×4; at `981f791` 1.7 / 1.1 dB and 1.0 / 2.1 dB); a tap to off plays nothing (4 of 4); a ×3 step with ramp 0.5 and fade: 3 hits at 0 / 60 / 120 ms, velocity 0.70 / 0.50 / 0.36, tune 0 / +0.25 / +0.5, the accent on the first only; the lock panel's audition as at the phase start (peak 0.264 vs 0.266); a pull (16 → 21 → 12 → 16) and a quarter turn while playing: no hit doubled, off the grid or lost, the scheduler ≥ 38.7 ms ahead (43.3 at `981f791`), no long tasks, stress 0, back at 16 exactly the starting hits; phone (touch): stopped, each tap plays its step once; playing, a tap and a quick double tap add then accent the hit, no sound of their own, scrollY 0; no page errors. |

SHOULD items recorded (never block): NEW, near the top of a phone screen a pill could still cover the planet: with the
page scrolled so the 12 o'clock outer planet sits at y 20–50 the menu's centre is held at y 86 and "condition always"
(121 px) or "condition not first" covers the finger, the release presses nothing (verifier; architect: the gap either
side of a planet straight above or below the centre, 2·RX·sin 36° ≈ 118 px, is narrower than the widest pill); NEW, a tap
that misses a pill by a few px can still press it (Chrome's touch adjustment): a tap on the stage's centre 8 px below the
"nudge" pill pressed it, opened the lock panel and scrolled 1428 px (verifier; ordinary browser behaviour, likelier with
the menu over the core on a phone); the round-1 note "the faint tick of a nudged planet still reaches it" is wrong for a
nudge that puts the planet more than `TAP_PX` from its tick (+0.25: 27.2 px, a click there only selects the lane); the
planets themselves are right (verifier); NEW, a tap on a ring no longer takes the focus out of a text field: the
cancelled `touchstart` also stops the mouse events that move the focus, so a phone keyboard would stay open (at
`981f791` the same tap moved the focus to the body) (architect); `app.js` 1845 lines (+21 this round, +125 over the
phase), "A gestures module" is in Later (architect); `auditionStep` read `T.now()` for each repeat, so the time spent
starting the first hit pushed the later ones back by whole blocks (0 / 65.3 / 125.3 ms instead of 0 / 60 / 120 in 1 of 3
ratchet auditions; the phase start's lock panel the same) (sound); a tap on a tick just before the head reaches it (that
lap's step already scheduled) waits a whole cycle (kick step 7 after 1.93 s, hat step 15 after 2.42 s): it could play at
its grid time that lap when no later hit of the lane is queued (sound; taste).

GOOD: one rule each: `planetNudge` decides where a planet is for drawing, `locate`, `stepXY` and the burst (even at ±0.5
the planet is played where you see it and the empty tick next to it keeps its own taps), `outward` serves `dragKind` and
the pull, `auditionStep` the lock panel and the tap, `pick` is `locate().lane`, `Lane.restore` is reused (verifier,
architect); the touch split (`touch-action: manipulation` plus a `touchstart` that cancels only on a ring, asking the
same `scene.locate`) gives back exactly the phase start's scrolling off the rings while the rings keep the touch, and a
long-press release can no longer press a pill (verifier, architect); a tap on a playing lane can no longer cut a queued
hit and every added hit sounds on its next turn at full level; stopped, a tap sounds like the step will (within 0.3 dB),
with its repeats, pitch ramp and fade; turning and pulling while playing is clean (sound).

### Changes after round 2

- **Quick SHOULDs done** (nothing a reviewer confirmed changes):
  - of the five gaps between its pills, the menu now picks the one with the most room round the planet, from the
    pills' own sizes at the places they would take (`offsetWidth` / `offsetHeight`: buttons glide between positions, so
    their boxes on screen can't be read mid-move) (verifier, architect). Page, 390 × 844, the 12 o'clock outer planet with
    "condition not first" at y 50 / 40 / 30 / 20: 11 px clear each time, between "velocity" and "nudge" (was −5: under
    "condition"); 3 and 9 o'clock 14 px, 12 o'clock unclamped 28 px; on the desktop round the planet with tune at 12
    o'clock as before; screenshots looked at.
  - a touch on a ring takes the focus off a field: the `touchstart` that cancels it blurs the focused element, as a
    click on the canvas does (architect). Page: the library name field focused, a ring tap adds the hit and the focus
    goes to the body.
  - `auditionStep` reads `T.now()` once, so the repeats keep their spacing (sound). Page: an even ×3 tap at 0 / 60 /
    120 ms four times of four.
  - the round-1 note on the faint tick, corrected: a nudged planet's tick is still nearest to it (no other step takes
    it), but a tap there plays it only within `TAP_PX` (22 px) of the planet; farther, the tap selects the lane
    (verifier). The unit test's wording says so.
- **Not changed** → [[BACKLOG]] Later: Chrome's touch adjustment pressing a pill a few px away is added to "Rings and the
  lock menu on a phone" (verifier); a tap just before the head waiting a cycle is added to "The tap's sound and the pads"
  (sound).
- Tests (210 + 9). `npm run check` clean, `npm test` 210 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10
  (serve.py 5400 + headless Chrome 9222, both stopped). Page (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the
  checks above plus the round-1 ones again (the nudged planet, the side and 12 o'clock menus, the corner swipe, a pinch),
  16 of 16, 0 page errors on desktop and phone. `app.js` 1845 → 1856 lines. **Phase 14 review: `result: HAPPY`.**

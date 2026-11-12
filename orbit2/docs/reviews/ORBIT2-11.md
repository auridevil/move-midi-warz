---
type: review
phase: ORBIT2-11
title: ORBIT2-11 live performance (P1–P7), review panel
date: 2026-11-12
round: 1
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  kai: HAPPY
  greta: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-10]]'
---

# ORBIT2-11 · Live performance: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), kai, greta. Process: [[REVIEW-PANEL]].

Phase start: `be25191` (ORBIT2-10 closed). Implementation commits: `4ec69a7` (P1, P2, P3), `9c03862` (P4, P5, P7),
`4f939e6` (P6), `e3da941` (tests and browser check).

## For the brief: where the new things are

| item | model / audio | on screen / Move |
| --- | --- | --- |
| P1 live mode | `app.js` `perf { live, muteBar }` in `midi-warz.orbit2.settings.v1` (older settings: live on, muteBar off). Move pad handler: Mute held → that lane's mute; `rec.armed \|\| perf.live` → `liveHit` (the step's sound with the pad's velocity, a step written only with Record armed); live off = pads toggle steps as before. Capture / Delete in live mode → `guarded()` on `perform.js` `Guard` + `HOLD_MS` (600): with Shift a 200 ms red flash, then it acts; alone it blinks while held and acts at 600 ms; a shorter tap only toasts a hint. Evolve on / off moved to **−** (live mode needs Shift + Capture for randomize; edit mode keeps Shift + Capture = evolve) | chip "live mode" next to Connect Move (`#live-mode`); Move panel rows "Live mode", "Pads row", "Delete", "Capture", "−" |
| P2 mutes | `toggleMute(li)`: at once, or with `perf.muteBar` while playing queued in `perform.js` `MuteQueue` and flipped by `barPerf()` on the next bar line (from `onTick`, Play's downbeat included); stop flushes (`flushPerf`); mutes never make undo steps (`perfKey`). Move: Mute tap (on release) = the selected lane, Shift + Mute = solo, hold Mute + a track button or any pad of a row = that lane, selection unchanged; the track LEDs show the mutes while Mute is held (cyan = changes on the next bar) | lane drawer: `#btn-mute` "mute" + chip "on next bar" (`#mute-bar`); a lane tab shows `⇥` while its mute waits; status line "N mutes at the bar" |
| P3 fill latch | `perform.js` `FillLatch`: arm → armed → the next bar line → on for one bar → off; arm again while armed = cancel. `armLatch()`, `setFill()` (a held fill on top), `barPerf()` | transport strip `#btn-latch` "fill next bar"; Move Shift + Layout (Layout LED cyan while armed, white while filling) |
| P4 slot restart | `lanes.js` `Lane.at(tick, rng, { origin })` (counts steps and loops from the origin, nothing before it), `Machine.tick` passes `m.origin`; `slots.js` `SlotBank.restart` (default on, saved; older banks → on), `start`, `due(…, origin)` / `nextSwitch(…, origin)` ('full cycle' switches line up from a restarted origin); `app.js onTick`: a slot loaded by the clock with restart on → `m.setOrigin(t)`; `export.js` `collectChain(…, { restart })` (the chain MIDI export) | slots drawer: chip "restart on change" (`#slot-restart`) |
| P5 MIDI out offset | `midiio.js` `PolyMidi.offsetMs` (null = auto), `autoMs` (from `outputLatency`: `setAutoLatency()` on wake and on Play), `latencyMs` (rounded, clamped to ±`LATENCY_MAX` = 50) added to note on / off, clock (F8) and start (FA); `offsetMs` saved with the MIDI settings (older settings: auto) | MIDI drawer: gauge "out offset" + chip "auto offset" |
| P6 master FX | `app.js` `makeMaster(gain, fx)`: native biquads low-pass → high-pass before the compressor (centre = LP at Nyquist + HP at 0 Hz), `perform.js` `fxFreqs` / `stepFilter`, `setFilter` glides (`setTargetAtTime`, 30 ms); the throw: a send from the master input into its own dotted-eighth `FeedbackDelay` that feeds the filter, `setThrow` (held: send 0.7, feedback 0.55; released: send 0, feedback 0.3), retimed with the tempo; `pfx` = live state, not saved; `exp.printFx` → `renderPattern` puts the mix (WAV, export all's mix) through the filter as set; stems, kit, jam never | transport strip: "filter" knob (`#fx-gauge`, double-click = off) + `#btn-throw` "throw (hold)" (pointer, Space / Enter); Move: wheel = filter (it stops at "off" on the way across), wheel push with no step held = off, Shift + wheel = humanize, hold + = throw (LED white); export drawer chip "print FX" (`#exp-print-fx`) |
| P7 condition LEDs | `perform.js` `condLoops(cond, n)`; `app.js paintLeds()`, the `held.size` branch: while a step is held the 16 step buttons are loops 1–16 (lane colour = plays, off = rests, cyan = depends on fill / the step before, white = the loop playing now) | Move panel row "Hold a step" |

Page handles: `__poly.perf`, `pfx`, `setFilter`, `setThrow`, `latch`, `muteQ`, `toggleMute`, `armLatch`, `fill`,
`renderPattern`, `move` (feed it `__poly.move.receive([...])`), `bank`, `pmidi`, `clock()`, `hist`. Tests:
`orbit2/test/perform.test.js` (11). To read the Move's LEDs in a headless page (no MIDI port): `__poly.move.transport =
{ send() {} }; __poly.move.inControl = true; __poly.sync()`, then `__poly.move.ledState` (without the stub, painting
throws "no MIDI output selected").

## Pre-checks

`npm run check` clean, `npm test` 176 + 9 green on `e3da941` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; kai, greta on sonnet), own ports
5401 / 5402 / 5403 / 5404 / 5409 (+ 940x; the phase start `git archive be25191` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, P1–P7 verbatim from [[BACKLOG]], the phase spec (the four build tasks), the
"where the new things are" table above, `git diff --stat be25191..e3da941` (9 files, +418/−63), `git status --short`
(only this file), the must-fix rule with the later phases' ids (V, I, A) and the "Later" items, how to drive
`orbit2/index.html` with `orbit2/tools/cdp.mjs` and the Move's MIDI bytes (`__poly.move.receive`, `move.ledState`), and
how to run the phase start. The first launch lost four of the five to an outage (the API's DNS failed: no answers);
kai's answer from it stands, and the other four were launched again, fresh, with the same brief, in one message.
`stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) P7: holding a step to read its loops changes the pattern when you let go. The release toggles any held step no knob touched (`app.js:1395`), and the loop view made "hold, look, let go" the way to read a condition. Stopped, lane 1, step 1 on with `1:2`: `[0x90,16,127]` → the step buttons read `[51,0,51,0,…]` (right), 1 s later `[0x80,16,0]` → `hits[0]` true → false. Expected: a hold that showed the loops doesn't toggle. (2) P6: Space after clicking the on-screen throw both starts / stops playback and fires a throw: the throw's keydown (`app.js:1151`) doesn't check `controlOwnsKey`, and the page's handler treats a mouse-focused button as not owning Space. Click `#btn-throw` (throw `[true,false]`, focus stays), Space → throw `[true,false,true,false]` and ▶ play → ■ stop, the throw up through Play's downbeat (the first hit into the 0.55 feedback). Expected: Space = play / stop only, as on every mouse-focused button. (3) P2 / P7: the cyan cue is lane 2's own colour (palette 46 = `CYAN_LED` = `LANE_LED[1]`, `app.js:1339`): Mute held + track 3 queues lane 2, its LED stays 46 (a second press would cancel it unseen); P7 on lane 2: a `1:2` step `[46,0,46,0,…]`, a `fill` step 16 × 46, "plays" and "depends" alike. (4) P7: the white "now" marker is `loopN % 16` (`app.js:1372`) over `condLoops` of loops 1–16 (`perform.js:11`): `1:3` held while playing: loop 17 white ("plays", it rests), loop 19 grey (it plays), loop 20 white; `first` white on loops 17 and 33. |
| architect | NOT HAPPY | (1) P2: "mute on next bar" queues a flip, not the mute asked for, so a slot coming in on that bar line turns it around: `MuteQueue.toggle/bar` (`perform.js:46-48`) store "flip lane li", and `barPerf` (`app.js:791`) flips after `bank.due` → `loadSlot` replaced the lanes on that tick. 240 bpm, "next bar", "on next bar" on: save slot 6 with lane 1 playing, mute lane 1 at once, press mute (reads "unmute ⇥ bar", queued at tick 8260), recall slot 6 for the same line (10080) → lane 1 muted after the bar (both the ask and the slot said playing). Same root for a chain step or evolve going home. (2) = verifier 1 (`1:3`, 850 ms hold: `hits[0]` false). (3a) = verifier 4 (a Node check against `condPasses`, loops 1–48: `1:3` wrong on 22 loops, `2:3` / `3:3` on 21, `first` / `not first` on loops 17 and 33). (3b) = verifier 3 (46 for track 3 with Mute held and for Layout with the latch armed). |
| sound | NOT HAPPY | (1) P5: the auto offset is always 0 ms: `app.js:276` reads `rawContext.outputLatency`, but Tone's `rawContext` is the standardized-audio-context wrapper, which has none (`'outputLatency' in rawContext` false; 0 hits for `outputLatency` in `vendor/tone/Tone.js`); the native context behind it (`rawContext._nativeAudioContext.outputLatency`) has it. So auto = 0 everywhere and MIDI leads the speakers by the output latency plus the master look-ahead. Manual offsets work: note-on vs the hit −4.1 ms (jitter) at auto, +20.3 at +20, −19.0 at −20; clock and start follow. |
| kai | HAPPY | none (live pads write nothing, Record writes at the playhead; Capture / Delete tapped alone do nothing, held 800 ms act, with Shift at once; Mute + track / pad mutes lanes 1 / 2 with the selection kept, Mute held doesn't also mute the selected lane, a tap does; the queued mute flips on the line, the latch armed → on → off on bar lines; Loop + step puts the slot's origin on the bar line (3360); the wheel stops at off, its push = off, + throws; the clock moves +40 ms with a +40 offset; P7 `1:2`, `2:2`, `1:3`…`2:4` light the right loops) |
| greta | HAPPY | none (a light pass, 5 tool calls: the new controls appear and are named, the Move panel documents every new gesture in matching words, the filter knob is a focusable slider that arrows turn, "fill next bar" takes Enter and sets `aria-pressed`, the status line names the fill and the filter; no keyboard mute / latch or Move input run) |

SHOULD items recorded (never block): MIDI stop (FC) went out at once while up to ~120 ms of clocks and notes already
scheduled (the look-ahead plus the offset) followed it (verifier); Shift + Capture pressed twice within its 200 ms flash
randomized twice (verifier, read); on a phone the transport strip wraps to more rows (verifier, greta); `SlotBank.start`
written, never read (architect); the origin handled two ways (`Machine.tick` → `Lane.at` absolute + origin, `liveTick`
relative) (architect); the mute flip written three times, the timing test re-implementing it and the clock order
(architect); app.js 1530 → 1656 lines, the P6 block could be a module, `FX_Q` / `THROW` declared after `makeMaster`
(architect); "perf" naming two things (architect); the lock cue in the normal step view is cyan = lane 2 (architect,
pre-existing); the auto offset should add the master look-ahead (576 frames = 12.0 ms at 48 kHz, measured) (sound); throw
echoes drift 128 frames a repeat (450.00 / 902.67 / 1355.33 … ms at 100 bpm; the lane delays too, pre-existing) (sound);
the printed filter is worked out at the export's Nyquist, not the page's (live 48 kHz, export 44.1: x = −0.5 heard
2191 Hz, printed 2100 Hz) (sound); the first throw on a cold page is silent (the kit is built after the press with the
send at 0) (sound, read); Q 0.9 is a +1.9 dB knee, sweeps polite, no makeup gain closed (sound; taste); exports not
sample-repeatable even with dice locked (sound; pre-existing, Later "Seeded noise"); the wheel at 4 % a click is slow
for a sweep (kai); check the red blink on the real Move (kai); `__poly.muteQ` serialised as `{lanes:{}}` (kai); one run
showed all step LEDs off after two knob-8 clicks, not reproduced (kai); the throw "can't be held from the keyboard" and
the filter knob's value "not exposed" (greta: neither holds; the throw's keydown calls the page's own `setThrow`, not
`__poly.setThrow`, and the knob's `aria-valuetext` is `filterSay`, e.g. "low-pass 1.2 kHz"); the live-mode chip reads
quietly, a legend of the button colours (greta).

GOOD: the timing rules land on the tick (the latch armed at tick 1995: on at 3360, off at 6720; armed while stopped: on
at 0; a queued mute at 4795 flips at 6720; restart puts `first` on the switch tick at once (7315), next bar (10080),
full cycle (8400) and a chain; old saved data and links load unchanged (verifier, architect, kai); `perform.js` is a
pure, tested boundary (10 mutations across lanes / slots / midiio / export / perform each fail a test) and nothing heavy
on the clock (architect); the filter's centre is bit-transparent (max diff 0 over 303 k samples, also 2.5 s after full
sweeps), no zipper on fast wheel spins or knob drags (worst second difference −62 dBFS), the throw fades in ~5 ms / out
~20 ms with bounded echoes, print FX does what it says (off = the phase start within 0.02 dB; on: > 4 kHz −14.9 →
−39.8 dB; stems unfiltered), a restarted slot's first kick +1 frame after the bar line (sound).

### Changes after round 1

- **A held step is a look, not a tap** (verifier 1, architect 2): a step button held `LOOK_MS` (= `LONG_MS`, 450 ms,
  the on-screen long-press) is a look: its release toggles nothing (`MovePages.press(btn, step, first, at)`,
  `release(btn, at)`; `looked(at)`), and the step buttons switch to its loops only then, or at once when a knob, the
  wheel or Delete edits it; a tap (shorter) toggles as before, without the buttons flashing the loop view. Page
  (5400/9400, lane 1, step 1 `1:2`): a 120 ms tap → off, again → on; held: at 250 ms the steps view, at 650 ms
  `[51,0,51,0,…]`, released → still on.
- **The "now" marker follows the loop** (verifier 4, architect 3a): the buttons show the 16 loops holding the loop playing
  (`loopWindow(now)`: loops 1–16 stopped and through loop 16, then 17–32 …; `condLoops(cond, n, from)`), the marker on
  its own loop. Page: `1:3` on loop 17 `[123,0,51,0,0,51]` (now: rests; loop 19 plays), on loop 19 white on button 3,
  `first` on loop 17 dark grey; `1:3` on loop 3 as before.
- **Cues in a colour no lane has** (verifier 3, architect 3b): with Mute held a waiting lane's track button and P7's
  "depends on fill / the step before" are blue (`CUE_LED` = `COLOR.BLUE`); the six lanes' LEDs are pale lilac, cyan,
  yellow, lavender, green, orange. Page, lane 2: a `fill` step 15 × 125 + the white "now", Mute + track 3 → 125 (lane 1
  51). Layout keeps cyan while the latch waits (not a lane colour there). Move panel and tooltips say blue.
- **A clicked throw leaves Space to play / stop** (verifier 2): the throw's keys act only when the keyboard owns the
  button (`controlOwnsKey`, as every control). Page: click `#btn-throw` (throw on / off), Space → play toggles, no
  throw; Tab onto it, Space → throw on / off, play untouched.
- **A waiting mute lands as asked** (architect 1): `MuteQueue` keeps the mute each lane was asked for
  (`toggle(li, muted)`, `target(li)`) and `apply(lanes)` sets it on the bar line (after a slot due there has loaded)
  or at once on stop; the labels read the target ("unmute ⇥ bar"). Page, the architect's repro at 240 bpm: before the
  line lane 1 muted, `{0: false}`, slot 6 pending, "unmute ⇥ bar"; after it: lane 1 playing, slot 6 current, "mute".
- **Auto offset = output latency + master look-ahead** (sound 1 + SHOULD): `autoLatencyMs(raw, masterSec)` in
  midiio.js reads the native context behind Tone's wrapper (a context with its own `outputLatency` first) and adds the
  compressor + limiter look-ahead measured by `masterLatency` (once per rate, shared with the exports). Page (48 kHz):
  the wrapper has no `outputLatency`, the native one 16 ms, auto 28 ms (16 + 12), the gauge "+28 ms".
- **Quick SHOULDs done:** MIDI stop leaves when the transport stops (`T.now()`, a look-ahead after the press) + the
  offset, never before a clock already scheduled (page, +30 ms: last clock 9017.4, stop 9026.3; it went at 8982.4 when
  timed by the last clock alone, before 2 clocks) (verifier); a second Shift + Capture / Delete during the 200 ms flash
  is ignored (page: one randomize, not two) (verifier); a throw held while a cold page wakes starts thrown (page, the
  mouse held on a fresh phone page: send 0.7, feedback 0.55; released 0 / 0.3) (sound); a print works the filter out at
  the page's rate, clamped to the export's Nyquist, and its note names the printed setting (sound); `SlotBank.start`
  gone (architect); `FX_Q` / `THROW` above `makeMaster` (architect); `MuteQueue.apply` is the one place mutes land
  (barPerf, the stop flush, the timing test) and `toJSON` shows the queue (architect, kai).
- **Not changed:** the remaining SHOULDs → [[BACKLOG]] Later ("Delay echoes drift one render quantum a repeat",
  "Performance filter voice", "`heardTick` reads the wrapper's `outputLatency`" (found while fixing P5, pre-existing),
  "The lock cue on lane 2", "app.js structure after phase 11", "Live-mode cues on screen"). kai's unreproduced LED run:
  not seen in the page.
- Tests (181 + 9; 5 new, 4 updated): "ORBIT2-11 r1 P2" (a queued unmute / mute lands as asked when a slot on the line
  has the lane the other way), "r1 P7" tap vs look (`press` / `release` / `looked` at times; `LOOK_MS` = `LONG_MS`),
  "r1 P7" the window (64 loops × 8 conditions: the marker's plays / rests = `condPasses`), "r1 P5" (`autoLatencyMs` on a
  wrapper, a native context, none; stop at the transport's time + offset, never before a scheduled clock), "r1 wiring"
  (the cue colour unlike every lane LED, both cues on it, the throw's keydown on `controlOwnsKey`, the auto offset, the
  look calls, the target queue, a thrown build, the print's rate, the clock order slot → mutes → lanes); the mute queue,
  timing and slot tests follow the new API. `npm run check` clean, `npm test` 181 + 9,
  `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py 5400 + headless Chrome 9222, both stopped). Browser
  (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks above, 0 page errors on desktop (1440×900) and phone
  (390×844); screenshots looked at. `app.js` 1656 → 1670 lines.

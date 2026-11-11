---
type: review
phase: ORBIT2-09
title: ORBIT2-09 samples and breaks (S1, S2, S3), review panel
date: 2026-11-11
round: 2
stalled: 0
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  dex: HAPPY
  maya: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-08]]'
  - '[[slices-handoff]]'
---

# ORBIT2-09 · Samples and breaks: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), dex, maya. Process: [[REVIEW-PANEL]].

Phase start: `d81c0b4` (ORBIT2-08 closed). Implementation commits: `bc6479f` (S1, S3), `2b91438` (S2), `0c683a8` (tests
and browser check).

## For the brief: where the new things are

| item | model / audio | on screen | Move |
| --- | --- | --- | --- |
| S1 slice sets | `lanes.js`: `MAX_SLICES` 16; `Lane.loadSlices({ name, slices })` (the lane's `sample.slices` = up to 16 IndexedDB ids, `sample.id` = the first, so code that knows one sample still finds audio; voice `'sample'`), `sliceCount()`, `sliceAt(i, lock)` (the step's `slice` lock, kept inside the set, else stored step i mod N; null without a set), `sampleId(slice)`; `slice` is a whole-number step lock (`STEP_LOCKS`, `LOCK_RANGE.slice` 0–15, `INT_LOCKS`, `lockVal`); `Lane.at()` events carry `slice`; `export.js` `expandHits` / `collectHits` pass it on, so live play (`onTick` → `hitSound(…, h.slice)`), WAV / stems (`renderPattern`) and the audition play the same slice; `Lane.from` → `sampleFrom` (ids kept as strings, at most 16, `id` = the first; start / end clamped, rev a bool). `app.js`: `ensureSample` loads every slice's buffer, `playSample(c, lane, p, time, lock, slice)` | the sample row names the set ("· 16 slices, a slice per step"); lock panel (long-press / right-click / Alt+click a step) on a sample lane: slice picker `#lock-slices` (`renderSliceLock`: a "step" tile = no lock, a waveform tile per slice through `sliceTile` / `drawWave`, also used by the Unassembler tiles; lit = locked, dashed = the step's own slice) | hold step(s) + knob 7 on a slice set = which slice (4 clicks a slice; on other lanes knob 7 stays the color lock); the help table (`index.html`) says so |
| S3 start / end / reverse | `Lane.trimAt(lock)` → `{ start, end, rev }` (0..1 of the sample or slice; locks over the lane's own `sample.start / end / rev`), `Lane.setTrim(k, v)` (defaults not stored); step locks `start`, `end` (0..1) and `rev` (0 / 1: 0 = forwards even on a reversed lane). `app.js` `playSample` plays from min(start, end) to max(start, end) (at least 5 ms), backwards from a reversed copy made once per id (`revBuf`, cached as `<id>~rev` in `sampleBufs`); tune / decay / snap / color work inside that part | lane: `#sample-trim` under the sample name (start / end gauges + a "backwards" chip, only on a sample lane; `renderTrim`); lock panel: start / end gauges (`#lock-trim`) and direction lane / forwards / backwards (`#lock-rev`) | (lock panel only) |
| S2 hand-off | `samples.js`: `readSlices(rec)` reads both payloads into `{ name, sampleRate, slices, mode }`: v1 `{ name, sampleRate, slices }` (what `src/unasm/` sends today, 8 slices; 1–16 accepted) and the new v2 `{ v: 2, name, sampleRate, channels, cuts, mode }` (the region once plus its cut points, up to 16 slices); `chopEqual(rec, n)`; `MAX_HANDOFF` 16; the format and the one-file sender port are in `orbit2/docs/design/slices-handoff.md`. `app.js`: `renderSlices` reads IndexedDB key `unasm-slices` (`SLICES_KEY`) through `readSlices`; `assignSlices(li, name, sampleRate, slices)` stores each slice under its own id (`orbits-<time>-<lane>-s<k>`) and puts the set on the lane (round 1: `Lane.loadBreak`, see "Changes after round 1"); `breakFromFile(li, file, n)` decodes a file (up to 16 s, no silence trim) and cuts it into 8 / 16 equal slices (`chopEqual`) | lane drawer, sound section, sample row: the Unassembler tiles `#slice-select` + **all to this lane** (`#btn-slices-all`); **break file…** (`#btn-break-file`, hidden input `#break-file`) + the 8 / 16 choice (`#break-n`) | (none) |

`src/unasm/` (the Unassembler page) is outside orbit2 and was not edited: orbit2 reads today's v1 payload and the new v2
format, so porting the sender later is one file.

Tests: `orbit2/test/poly.test.js` "S1 / S3 slice sets: a slice per step, slice / start / end / rev locks, kept through
save/load" and "S2 hand-off: v1 (8 slices) and v2 (a region + cuts, up to 16) read as one shape; a break cuts into equal
slices".

## Pre-checks

`npm run check` clean, `npm test` 155 + 9 green on `0c683a8` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; dex, maya on sonnet), own ports
5401 / 5402 / 5403 / 5406 / 5405 (+ 940x; the phase start `git archive d81c0b4` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, S1–S3 verbatim from [[BACKLOG]], the phase spec (the three build tasks), the
"where the new things are" table above, `git diff --stat d81c0b4..0c683a8` (8 files, +318/−40), `git status --short`
(only this file), the must-fix rule with the later phases' ids (E, P, V, I), how to drive `orbit2/index.html` with
`orbit2/tools/cdp.mjs` (`__poly`, `assignSlices`, `breakFromFile`, a fake Move through `move.emit`, the hand-off through
IndexedDB, the model in Node) and how to run the phase start. `stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none (check clean, 155 + 9, smoke 10/10, 0 page errors on desktop, phone, reload, old data, old and new links; phase-start saves, a slot, a library setup and a link load at HEAD with a bit-identical WAV; live play = WAV = stems for slice, rev and start locks, also at 40 / 120 / 240 bpm, 6 lanes × 32 steps, after a reload, a slot recall, a setup load and undo / redo; v1 and v2 hand-offs, Move knob 7 clamps) |
| architect | NOT HAPPY | (1) A pad hit while recording on a slice set always plays slice 1, while the step it records plays another: `liveHit` (`app.js:599`) calls `hitSound` without a slice, which falls back to `sliceAt(0)` (`app.js:180`). Page: a 16-slice break from `breakFromFile`, lane cleared, record armed and playing, three `liveHit(0, 3, 100)` 400 ms apart: every tap started `…-s0`; the taps landed on steps 6, 8 and 11, which play `…-s6`, `-s8`, `-s11` on the next loop. Expected: a tap plays the slice of the step it writes, as the Move pad toggle (`app.js:1118`) and the lock audition (`:520`) already do; the computer keys in record go through `liveHit` too. |
| sound | NOT HAPPY | (1) A hole at every join of a slice set: decay is 1 on a sample lane, so each slice ends with the one-shot's 10 ms click guard (`app.js:149–151`) and the next starts with a 1 ms attack. A 2.0 s break at 120 bpm, 16 slices on a 16th lane, raw stem, 63 joins: a steady 1 kHz tone dips −25.6 dB (worst −26.7) at every join, under −6 dB for 5.5 ms (reversed −24.5 dB); a realistic break against the same audio played as one sample: SNR 19.4 dB, error −5.6 dB re signal in the 12 ms round each join, the ride, room and kick tails gated at 8 Hz. Expected: slices played in order at the break's tempo join without a hole (any dip under −6 dB ≤ 1–2 ms). (2) The auto-slice keeps the lane's speed (`app.js:778`: an empty lane gets N steps, all on, at its own step rate): 8 slices on the default ×4 lane 1 play every 125 ms, each 250 ms long, twice a bar, two slices sounding at once all the time (least-squares fit needs both: residual −0.7 to −18 dB with one, −10 to −29 dB with both); 16 slices on a ×1 lane play one a beat (125 ms of slice, 375 ms of silence). Expected: on an empty lane N slices span the break (16 slices of a bar → ×4, 8 → ×2). |
| dex | NOT HAPPY | (1) A slice set can play silent after a slot recall: slot 2 saved with an 8-slice set on lane 2, then a 4-slice set on lane 2, reload, `recallSlot(2)`: `sliceCount()` 8 but `sampleBufs` holds only the 4 buffers of the autosaved set, so `playSample` returns silently for the others. Cause: `buildVoice` (`app.js:85`) returns early when the chain is already `'sample'`, so `ensureSample` (`:92`) only runs on a voice change. Seen once; a second run never got `__poly`. |
| maya | HAPPY | none (a 16-slice break from `breakFromFile`, the Move gesture (hold step 5 + knob 7 × 4 → `{ slice: 6 }`), the lock panel on the phone: 17 tiles, no sideways overflow, a WAV export with clear onsets, 0 page errors) |

SHOULD items recorded (never block): a break on a lane with a pattern keeps it, so the default lane (length 4, one
hit) plays only slice 1 or slices 1–4 (dex, maya, verifier); Move knob 7 moves the first slice after 2 clicks up or 3
down, then every 4 (`Math.round(h.sl / 4)` from slice × 4, verifier); at 1440 × 900 the slice picker opens below the
right panel's edge (verifier); slice audio is never deleted from IndexedDB (17 → 49 records after two re-cuts, ~6 MB a
16 s break; single samples already were never deleted) (verifier, architect); share links drop the slice set and leave
inert slice / trim locks (verifier, architect; by design); `hitSound` takes 7 positional parameters and a missing slice
silently means slice 1 (architect); the start / end / reverse maths in `playSample` has no unit test, and "at least 5 ms"
is 0.5 % of the part (0.6 ms on a 125 ms slice) (architect); the lock-a-step closure written three times and the trim
gauges built twice (architect); the empty-lane layout and the 16 s cap live in `app.js`, and 16 is defined twice
(`MAX_SLICES`, `MAX_HANDOFF`) (architect); porting the sender needs the shipped Orbits reader too, or both formats
(architect); the reversed copy is made inside the scheduler on the first backwards hit (0.2–1.8 ms) (architect); a
tempo-from-the-break option (a 120 bpm break at the page's 100 bpm leaves 25 ms gaps) (sound); the reversed slice's
crack lost under the 10 ms guard (sound); the lane's tone (~4.3 kHz low-pass) and delay send dull a break (sound); a
slice comes out ~12 dB under its source (pre-existing gain staging) (sound); no mono mode on a slice lane, so a slice
rings under the next (sound); knob 7 is slice-only on a slice set (dex; documented); a break lane's sample record keeps
the lane's old drum (dex); the 16 s cap is silent (dex); the slice picker has no visible caption, its tiles are 32 × 44 on
a phone, "break file…" sits deep in the drawer on a phone, no cue where Unassembler slices come from (maya).

GOOD: one slice path for everything: the slice rides on the event through `expandHits` / `collectHits`, so live play,
WAV, stems and the audition agree (64 / 64 slices in order, onsets inside the 1 ms attack, stems and WAV within a sample,
locks exact: tile 16 → slice 16 at r 0.986, rev r 0.9999, tune ±1 oct, start / end) (verifier, architect, sound, dex);
old data is safe (phase-start saves, slots, setups and links load with a bit-identical WAV; `sample.id` = the first slice
keeps single-sample code working) (verifier, architect); the hand-off reader is solid (v1 8 tiles; v2 with unsorted,
duplicated, out-of-range cuts → 16 equal slices) and the tile drawing is shared, not copied (verifier, architect, dex);
CPU fine (6 lanes of 16-slice sets, ×3 ratchets at 174 bpm: stress 0 %, headroom 70–76 ms) (sound).

The implementer reproduced each MUST-FIX on `0c683a8` before fixing (page 5400/9400, silent): three taps while
recording on a 16-slice lane played `s0`, `s0`, `s0` while their steps 4, 6, 9 play back `s4`, `s6`, `s9`; 8 slices of a
2 s bar on an empty ×4 lane stayed ×4 (125 ms steps, 250 ms slices); a steady 1 kHz tone cut into 16 on a ×4 lane at
120 bpm dipped −25.1 dB at its 62 joins, 5.5 ms under −6 dB (raw stem); slot 2 saved with an 8-slice set, a 4-slice set
on the same lane, reload, `recallSlot(2)`: 8 slices, 0 buffers loaded, 0 of 8 hits sounded.

### Changes after round 1

- **A tap plays the slice of its step** (architect 1): `liveHit` works out the step first: recording while playing, the
  step the hit lands on (the step it writes); otherwise the step under the pad (on the pad's page, as a tap with record
  off). It plays that step's slice (`sliceAt(idx, locks[idx])`) and its start / end / direction; the MIDI note and the
  recorded step are unchanged. Page, the round's repro: the three taps play `s4`, `s6`, `s9`, the slices of the steps they
  land on. Armed but stopped, pad N plays the slice of step N on its page (slice N of a laid-out break).
- **Slices join without a hole** (sound 1): a slice of a set plays from a copy with the first 70 ms of the slice after it
  in the set appended (`padBuf` in `app.js`; backwards: reversed, with the reversed end of the slice before it), made once
  per pair in `ensureSample`. `samples.js sampleWindow` (the window maths of `playSample`, now pure and tested) keeps the
  slice at full level to its cut, then fades it out over that audio in the attack time, the time the next slice fades
  in: in order the two are the same audio and sum back to the break, out of order they cross-fade. With nothing after it
  a slice ends on a 2 ms guard (was 10 ms); a whole single sample keeps its 10 ms (the same maths as before the phase). A
  first try that started a second source on the next slice's start left one-sample seams where Chrome resamples (48 kHz
  slices in a 44.1 kHz render: the ending source can't interpolate past its buffer's end, the new one lost its first
  frame when it started on a whole frame): +15 dB clicks on a reversed set, −17 dB errors on noise. One source through
  the cut has none. Page (raw stems, 120 bpm, 16 slices of a 2 s bar on a ×4 lane): the 1 kHz tone dips 0.0 dB at its
  62 joins, 0 ms under −6 dB (was −25.1 dB, 5.5 ms); against the same audio played whole, the 15 joins inside the bar are
  bit-identical (difference −240 dB), forwards and backwards (a reversed set in reverse order), for the tone and for
  97 Hz + 1.3 kHz + noise; a shuffled set (slice locks) and a reversed one: no clicks (2nd difference at the joins +0.2 /
  +0.1 dB over its 99th percentile elsewhere).
- **A break lies across its lane at its own speed** (sound 2): the layout moved into the model. `Lane.loadBreak({ name,
  slices, sec, bpm })` ("all to this lane" and "break file…") lays the break out (`layBreak`: a step per slice, all on,
  from step 1, played straight: no rotation, swing, push, humanize, tune or chance; the tone open, no delay send) at the
  speed `breakSpeed(n, sec, bpm)` picks: the break taken as ½, 1, 2 or 4 bars of 4/4, whichever is nearest its length at
  this tempo and gives each slice a whole step (16 slices of a bar ×4, 8 ×2, 16 of two bars ×2). A lane already playing a
  slice set with steps on keeps its chops (a new break in the same pattern); any other lane, drum pattern or not, is laid
  out (dex, maya, verifier SHOULD: the default lane played only slice 1, or slices 1–4). Page: 8 slices on an empty ×4
  lane → ×2, 8 steps of 250 ms = the slices (was ×4: 125 ms steps); a fresh page's lane 1 (kick, length 4, one hit) → 16
  steps at ×4, its filter at 12 kHz.
- **A recalled set loads its audio** (dex 1): `buildVoice` calls `ensureSample` before its early return, so a chain that
  already plays a sample loads a recalled, undone or loaded set too (the same hole for single samples predates the
  phase). Page, the repro above: 8 / 8 buffers loaded, the 8 hits sound.
- **Quick SHOULDs done.** Move knob 7: one slice every 4 clicks either way, no lock before the 4th (verifier); the lock
  panel scrolls into view when it opens (verifier: at 1440 × 900 the picker now sits at y 384–416, a real click locks
  it); a caption over the slice picker, "slice: the part of the break this step plays" (maya); on touch screens 6 tiles a
  row, 50 × 44 px on a phone (maya); start = end plays 5 ms (was 0.5 % of the part), and the trim maths is pure and tested
  (architect); one `lockHere(k, v)` for the stroke, slice, start / end and direction locks and one `trimGauge` for both
  rows of start / end gauges (architect); the reversed and padded copies are made in `ensureSample`, never in the
  scheduler (architect); a laid-out break opens the tone and drops the delay send (sound); a file over 16 s says only its
  first 16 s were cut (dex). The design doc ([[slices-handoff]]) describes the layout and the joins.
- Not changed: knob 7 is the slice on a slice set (by design, in the help table); a break lane's sample record keeps the
  drum it replaced (picking a drum voice again, and a share link, bring it back); the empty hand-off hint already says
  where Unassembler slices come from. → [[BACKLOG]] Later: deleting unreferenced sample audio, slice sets in share links,
  `hitSound`'s positional parameters, tempo from the break, mono slice lanes, sample gain staging, the sender port with
  the shipped reader, breaks on a phone, one limit for slices.
- Tests (156 + 9; 1 new): "ORBIT2-09 r1": `sampleWindow` (a padded slice holds to its cut and fades over the next one's
  attack; the padding holds the longest fade at snap 0 and tune +1; 2 ms without it; the reversed mirror; an end point
  fading over what follows; start = end plays 5 ms; every single-sample setting identical to the pre-phase formula, 180
  cases), `breakSpeed` (a bar, half a bar, two bars, a 170 bpm bar at 100 bpm, 12 and 11 slices, no tempo), `loadBreak` /
  `layBreak` (a drum lane with a pattern laid out; the reviewer's 8-slice case through `collectHits`: once a bar, in
  order, 250 ms apart; a slice lane with steps keeps its chops and locks; an empty one is laid out again), `usesRev`, and
  two checks of `app.js`'s text where it has no unit seam: `liveHit` plays its step's slice, `buildVoice` loads before
  returning early. `npm run check` clean, `npm test` 156 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py
  5400 + headless Chrome 9222, both stopped). Browser (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the four repros,
  the default lane, a 2 s break-like bar (kicks, snares, a ghost, 16th hats, a ride, room) as 16 slices against the same
  audio as one sample (SNR 36.8 dB over 4 bars; the rest is the one-sample lane's own end guard at each bar line), 0 page
  errors on desktop and phone; screenshots looked at. `app.js` 1368 → 1398 lines.

## Round 2 (re-check): 3 of 3 HAPPY, the whole panel HAPPY

Only the reviewers NOT HAPPY after round 1 (architect, sound on the default model; dex on sonnet), fresh sub-agents in
one message, own ports 5402 / 5403 / 5406 (+ 940x; the phase start `d81c0b4` on +100, the code before the round-1 fixes
`0c683a8` on +200). Brief as in round 1 (goal, S1–S3, the phase spec, the "where" table, the must-fix rule with the
later ids and the Later items), `git diff --stat d81c0b4..9956de4` (11 files, +665/−54; `ee07751` in between is docs for
phase 18 only) and the round-1 fixes alone (`0c683a8..9956de4`, 10 files, +378/−45), each one's own round-1 MUST-FIX and
"Changes after round 1", with the instruction to confirm their items first with the same repro, then check nearby,
anything new only in scope and marked NEW. Pre-checks on `9956de4`: `npm run check` clean, `npm test` 156 + 9, smoke
10/10. `stalled: 0`: every round-1 MUST-FIX is closed.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| architect | HAPPY | none. (1) FIXED: same repro on HEAD (5402) and `0c683a8` (5602): three `liveHit(0, 3, 100)` while recording on a laid-out 16-slice break land on steps 4, 8, 11 and start the padded copies of `s4`, `s8`, `s11`, the buffers the next loop plays at the same offsets (`0c683a8`: `s0` every time, also for every pad while stopped). Nearby: armed and stopped, pad columns 0–7 play `s0`…`s7`; with slice locks (step i → 15 − i) taps through `liveHit`, a Move pad and the key `v` play the locked slices, as the loop does; rev locks set through the lock panel make the reversed copies at once (`lockHere` → `ensureSample`, 32 → 48 buffers) and taps play them; start 0.5 locks play from half the slice; a drum lane still records; undo after a laid-out break brings back the rim lane (voice, length 5, ×4, hits, tone, send), redo the break; a fresh tab loads the saved set from IndexedDB; knob 7 (3 clicks no lock, the 4th slice 4, every 4 either way, stops at 0, +40 = 10 slices, release doesn't toggle); check clean, 156 + 9. |
| sound | HAPPY | none. (1) FIXED, the same repro on `0c683a8` and HEAD: the 1 kHz tone at 44.1 kHz, 16 slices on a ×4 lane, 63 joins: `0c683a8` −26.1 dB mean, −26.9 worst, 5.5 ms under −6 dB (backwards −25.0 / −26.4, 5.4 ms); HEAD −0.14 / −0.22 dB, 0 ms (backwards −0.22 / −1.6, 0 ms); 48 kHz slices in order, backwards and shuffled: worst −0.01 dB, 0 ms, no clicks (2nd difference 0.0–0.1 dB over mid-slice); a synthetic 48 kHz break (kick, snare, hats, open hat, ride, room) against the same audio played whole: the 60 joins inside the bars identical (−294 dB), SNR 108.5 dB (1-LSB differences; round 1: 19.4 dB), reversed in reverse order = the whole break reversed (0 differing samples). (2) FIXED: a fresh page's lane 1 (kick, 4 steps ×4) given a 2 s break at 8 → a sample lane of 8 steps at ×2, all on, tone 1, send 0, its stem identical to the audio played once a bar (0 differing samples); a ×1 rim lane given 16 → 16 at ×4; `breakSpeed` ×4 / ×2 / ×2 / ×3 for 16 of 2 s, 8, 16 of 4 s, 12; a lane already chopping keeps its hits, lock and speed. Nearby: whole samples render identical to `d81c0b4` (0 differing samples, also at decay 0.5, snap 0.2, color 0.7, tune +0.25); tune +7 semitones exact (1498.31 Hz); an end-trim lock fades over 1 ms after the cut, no click; start = end ~6 ms; stress 0 %, headroom 68–74 ms with 4 lanes of 16-slice sets (one backwards, one with ratchets); 0 page errors. |
| dex | HAPPY | none. (1) FIXED: the same repro on HEAD (slot 2 with 8 slices, a 4-slice set on lane 2, reload, `recallSlot(2)`): `sliceCount()` 8, all 8 `liveHit` hits start a source with a loaded buffer (round 1: none); a 16-slice break from `breakFromFile`: every one of 127 starts while playing had a buffer, undo / redo and a WAV export without page errors. (A light re-check: 6 tool calls; the onset order of the export not re-measured.) |

SHOULD items recorded (never block): NEW (sound): the global humanize brings the holes back on a laid-out break (a
48 kHz tone in order at humanize 30 %: joins down to silence, up to 8.5 ms under −6 dB; `layBreak` zeroes the lane's
own timing and velocity humanize but `m.humanize` still moves each slice); NEW (sound): a new break on a lane already
chopping a set resets the lane's decay / snap / color to the sample defaults (`loadBreak` → `loadSlices` → `loadSample`
applies `SAMPLE_SOUND` before keeping the pattern); NEW (sound): a v2 hand-off cut at onsets (uneven slices) gets one
equal step a slice (9 slices of a 2 s bar → 9 steps at ×2, gaps after the short slices, overlaps after the long one);
nothing sends one today (the sender sends v1, a break file is cut equal); (architect) `liveHit` builds the pad hit's
sample lock and slice by hand, a third copy of "which locks shape a sample hit", which is why the round-1 test checks
`app.js`'s text; a `Lane` method would make it a unit test; (architect) `padBuf` is pure sample maths kept in `app.js`
without a test; (architect) memory: a 16-slice set keeps 32 buffers (48 with something backwards), ~18 MB in the page
for a 16 s stereo 48 kHz break; one break buffer plus cut offsets would need no padded copies; (sound, already Later)
gain staging (−6 dBFS in → −17.8 dBFS raw stem) and tempo from the break (at 90 bpm a 42 ms gap after each slice);
(dex) a second tab in one Chrome can take ~20 s to get `__poly` (harness).

GOOD: one source plays straight through each cut, so a break cut into 16 and played in order is the break, forwards and
backwards (sound); the window maths (`sampleWindow`) and the layout (`breakSpeed`, `loadBreak` / `layBreak`) are pure,
tested and on the model's side of the boundary, whole samples render identical to the phase start (architect, sound);
the padded and reversed copies are made once in `ensureSample`, never per hit, and one pad rule ("a pad plays what its
step will play") covers record, armed-and-stopped, the Move pads and the computer keys (architect).

### Changes after round 2 (quick SHOULDs; the panel was already HAPPY)

- **A new break keeps a chopping lane's knobs** (sound, NEW): `loadBreak` puts the lane's decay / snap / color back when
  it keeps the chops (a laid-out break still starts from the sample defaults). Page: a lane chopping a 16-slice set at
  decay 0.4, snap 0.7, with a slice lock, given an 8-slice break: decay 0.4, snap 0.7, hits and lock kept.
- **What a pad plays is in the model** (architect): `Lane.padHit(i, lock)` → `{ lock, slice }` (the step's slice, and on
  a sample lane its start / end / direction under the pad's own lock); `liveHit` calls it, so the round-1 test now only
  checks the wiring and the rule has a unit test. Page: the round-1 repro's three taps play `s4`, `s8`, `s11`, the slices
  of the steps they land on.
- **The padded slice audio is pure** (architect): `samples.js padChannels(a, b, p, rev)` builds a slice's channels with
  what follows it (forwards: the next slice's start; backwards: reversed, then the reversed end of the slice before);
  `padBuf` only wraps it in an AudioBuffer (a mono neighbour now pads both channels instead of giving up). Page: against
  the same audio played whole the joins inside the bar are still bit-identical (−240 dB), forwards and backwards, for 97
  Hz + 1.3 kHz + noise.
- → [[BACKLOG]] Later: humanize on a laid-out break, uneven slices on their own 16ths, one buffer a slice set (the
  harness note is not a defect).
- Tests (157 + 9; 1 new): "ORBIT2-09 r2" (`padHit` on unlocked, locked, pitch-pad and drum steps; `padChannels` forwards,
  backwards, clamped, mono neighbour; a new break keeps a chopping lane's knobs, a laid-out one starts from the
  defaults); "ORBIT2-09 r1" checks the `liveHit` wiring through `padHit`. `npm run check` clean, `npm test` 157 + 9,
  `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py 5400 + headless Chrome 9222, both stopped). Browser
  (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks above, 0 page errors.

## Result: HAPPY

All five reviewers HAPPY after round 2 (verifier and maya in round 1; architect, sound and dex on the round-2
re-check). Nothing deferred. Next: the close task marks S1–S3 done.

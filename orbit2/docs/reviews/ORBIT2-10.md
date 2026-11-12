---
type: review
phase: ORBIT2-10
title: ORBIT2-10 export for producers (E1–E6), review panel
date: 2026-11-12
round: 2
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  dex: HAPPY
  kai: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-09]]'
---

# ORBIT2-10 · Export for producers: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), dex, kai. Process: [[REVIEW-PANEL]].

Phase start: `1005992` (ORBIT2-09 closed). Implementation commits: `aba01c0` (E1, E6), `f15f2d2` (E2, E3, E5),
`2073ba4` (E4), `fa0409f` (tests and browser check).

## For the brief: where the new things are

| item | model / audio | on screen |
| --- | --- | --- |
| E1 bit depth + rate | `orbit2/src/unasm/wav.js`: `encodeWav(channels, sampleRate, { bits })` (16 / 24 PCM; 32 = IEEE float, format 3, an 18-byte `fmt ` + a `fact` chunk), `WAV_BITS`, `insertChunk(wav, id, body)` (a chunk just before `data`, any header). `app.js`: settings `exp { bits, rate, ring, dry, midiOne }` in `midi-warz.orbit2.settings.v1` (`readExp`: older settings load with the defaults 16 / 44.1 / off); every offline render (`renderPattern`, `exportKit`) runs at `exp.rate`, `masterLatency(sr)` is cached per rate; `mixWav`, `fmtNote` | export drawer, row "format": `#exp-bits` (16 / 24 / 32f) and `#exp-rate` (44.1 / 48); the status line names the format |
| E6 smpl + ring-out | `wav.js` `withSmpl(wav, { frames, sampleRate })` (one forward loop, frames 0 … frames − 1); `jam.js` `tagWav(wav, sr, { acid, smpl })`, `wavFrames`; loop renders get ACID + smpl, one-shots ACID only (`renderTags`), jam takes ACID + smpl. Ring-out: `jam-worklet.js` records `ring` seconds past `end` (`tailSec()`, sent with `start` when "jam ring-out" is on) and posts `frames` = the take; `jam.js` `splitChunks(lanes, frames)` → head (the take) and tail (the ring-out); `stemsZip(…, { smpl, ring })` adds `…-<n>-<lane>-ringout.wav` and `…-mix-raw-ringout.wav`, untagged. Jam takes stay 16-bit at the page's rate (the recorder is 16-bit) | export drawer: `#exp-ring` chip "jam ring-out"; jam panel: "recording the ring-out…", "+ ring-out files" |
| E2 dry stems + return | `app.js` `renderPattern({ stems, dry, hits })`: dry disconnects each lane chain's `delay` from its lane bus and connects it to one shared gain, rendered as one more channel pair (the delay return). `jam.js` `stemFiles(stems, names, sr, folder, { bits, acid, smpl, ret })` → `<base>-<n>-<lane>.wav`, `<base>-delay-return.wav`, `<base>-mix-raw.wav` (= `sumStems` of all of them); 16 / 24-bit share one gain keeping the loudest stem and the mix under 0.98, 32f as rendered; `exportStems` uses it | export drawer: `#exp-dry` chip "dry stems" |
| E3 Drum-Rack MIDI | `export.js` `hitsToMidi(…, { merge })`: one track "drum rack" on lane 1's channel, every lane (and stroke) on its note from the MIDI settings (`strokeNotes`); `app.js` `midiOf(hits, { states, bars })`, used by `exportMidi` and `exportAll` | export drawer: `#exp-midi-one` "MIDI tracks: per lane / one track" |
| E5 export all | `app.js` `exportAll()`: `exportHits(ticks)` once (`collectHits` with `exportDice()`, the B5 roll), `renderPattern({ hits })` for the mix and `renderPattern({ stems: true, dry: exp.dry, hits })`, `stemFiles`, `midiOf(hits, …)` → one zip `<base>.zip`: `<base>/<base>-mix.wav`, the stems, `<base>/<base>.mid`; base `orbits-all-<bpm>bpm-<N>bars-<stamp>`; the pattern only (a chain stays MIDI-only) | export drawer: "⤓ export all (.zip)" `#exp-all` |
| E4 kit export | `app.js` `exportKit()`: per lane × (accent, normal) one `T.Offline` render (`KIT_PRE` 50 ms + 2 s) on `makeKit({ raw: true })` with every `send` at 0; `jam.js` `trimOneShot(channels, sr, { pre, maxSec })` (from the first sample over −80 dBFS after `pre` to the last over −90 dBFS, at most 2 s, a 10 ms fade when capped); files `orbits-kit-<stamp>/orbits-kit-<lane>-<voice>-accent.wav` / `-normal.wav` (a sample lane: the sample's name), export bits / rate, no ACID, no smpl | export drawer: "⤓ kit (.zip)" `#exp-kit` |

No Move mapping changed in this phase. Page handles: `__poly.exportWav / exportStems / exportMidi / exportAll /
exportKit`, `__poly.exp` (the settings object), `__poly.jam`, `toggleJam`, `stopJam`, `downloadJam`. Tests:
`orbit2/test/poly.test.js` "ORBIT2-10 E1 …", "E6 smpl …", "E6 a jam take with a ring-out …", "E3 …", "E2 …", "E4 …".

## Pre-checks

`npm run check` clean, `npm test` 163 + 9 green on `fa0409f` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; dex, kai on sonnet), own ports
5401 / 5402 / 5403 / 5406 / 5404 (+ 940x; the phase start `git archive 1005992` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, E1–E6 verbatim from [[BACKLOG]], the phase spec (the four build tasks), the
"where the new things are" table above, `git diff --stat 1005992..fa0409f` (8 files, +307/−67), `git status --short`
(only this file), the must-fix rule with the later phases' ids (P, V, I, A) and the "Later" items, how to drive
`orbit2/index.html` with `orbit2/tools/cdp.mjs` (`__poly`, the export controls, `captureDownloads`, `unzipStored`,
`parseWav`, `readMidi`) and how to run the phase start. `stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) E6: the ring-out files hold the next bars of the pattern, not a ring-out. Boombap at 240 bpm, "jam ring-out" on, the take stopped at beat 5.5 with the jam button (the transport plays on): the take is right (96000 frames at 48 kHz, ACID 8 beats, smpl 0–95999), each `-ringout` file is 153000 frames (3.19 s) and does not decay (mix-raw peak per 250 ms: −4.7 −7.4 −7.7 −11.4 −5.0 … as loud as the take; a new −5 dB kick every bar). Cause: `jam-worklet.js:21` records the lane buses `ring` s past `end`, `app.js:1070` asks for `tailSec()`, nothing keeps new hits out after `stopTick`. Expected (the chip title, `app.js:1009`): a tail that decays to silence, no new hits. (2) Regression: with ring-out off, a stop ~9 ms after the bar line (grace window) gives "+ ring-out files" and 5 untagged `-ringout.wav` of 444 frames: `app.js:1038` keeps the `splitChunks` tail whatever `exp.ring` is, `stemsZip` writes it; at `1005992` `trimChunks` dropped those frames. |
| architect | NOT HAPPY | (1) = verifier 1 (boombap, 86 bpm, 48 kHz: the ring-out is 298047 frames, 6.21 s; kick −1.0 dB re the take's peak at 0, 2.75 and 5.5 s, shaker ~0 dB all through). (2) = verifier 2 (ring off, stop at bar 1.001: a 159-frame tail, 10 files). (3) E4: a one-shot cut at 2 s ends in a hard cut, the 10 ms fade never runs on real sounds: the kit renders `KIT_PRE + 2` s (`app.js:986`), `trimOneShot` fades only when `len >= cap` (`jam.js:149`), and every hit starts 7–72 samples after `KIT_PRE`, so `len = n − p < cap`. Lane 4 = a 4 s decaying sine, 48 kHz / 24-bit: `orbits-kit-4-longsine-accent.wav` 95997 frames, its last 10 samples at −32.0 dBFS (file peak −5.0). Expected: a fade, as the doc comment and the test's "faded out, no click" say. |
| sound | NOT HAPPY | (1) = verifier 1 (240 bpm, 1.3 s take: `1-soft-kick-ringout` has full-level kick attacks at 0 / 400 / 1000 / 1400 / 2000 / 2400 / 3000 ms, −7.45 dBFS in its first 20 ms = the take's kick peak, its first 0.9 s correlates 0.999 with the take's first bar; `mix-raw-ringout` reaches 0 dBFS. Control: the same take ended by stopping the transport gives ring-outs at −51 to −70 dBFS, no attacks). (2) E4: kit one-shots hard-clip at 16 / 24-bit: the raw render (no master) goes through `encodeWav`'s ±1 clamp with no gain (the stems have one); default boombap, lane 4 vinyl accent: +0.84 dBFS float at 48 kHz (4 samples over 1.0), +1.28 at 44.1; the 24-bit file has 4 samples at full scale. Expected: PCM one-shots under 0 dBFS, e.g. one kit-wide gain (keeps the accent / normal ratio and the lane balance). |
| dex | HAPPY | none (export all at 48 / 24 with dry stems: every WAV 535814 frames, ACID + smpl 0…535813, one base; one-track MIDI: one "drum rack" track on channel 10, 68 notes on 36 / 38 / 42 / 39, ghost velocities 127 / 89 / 51 kept; kit 4 lanes × accent + normal, untagged; 0 page errors. A light review: 4 tool calls, no unit tests, the dry sum not rebuilt.) |
| kai | HAPPY | none (a 2-bar jam take at 86 bpm with a lane muted mid-take and ring-out on: 5 take files + 5 untagged `-ringout`; a kit export while playing and while a take was closing: no glitch, stress 0; settings survive a reload, settings without `exp` load the defaults; a new take right after a finished one arms and records) |

SHOULD items recorded (never block): one-shot renders get ACID flags 4 (stretch), not 1 (pre-existing `acidOf` default)
(verifier); a 1-bar take after a grace-window stop was 48164 frames, not 48000 (stopJam's end, unchanged by the phase)
(verifier); with ring-out on the take stays "finishing" for `tailSec()` (11.6 s at 40 bpm, 7.6 s at 86 bpm): no new take
can arm (verifier, architect, kai); `floatStemsToInt16` and `trimChunks` only used by tests, two stem writers with one
naming scheme, `wavFrames` walks chunks in jam.js next to wav.js's `insertChunk` (architect); the E2 test only adds a JS
fixture, the E4 test greps app.js and covers the cap only with the onset at `pre`, E6 has no ring-off case (architect);
memory: export all keeps both renders, the summed mix, the scaled copies, every WAV and the zip (~2.5–3 GB for a 64-bar
6-lane 32f render at 60 bpm, estimated) (architect); kit file names carry no base (architect; as specified); 16 / 24-bit
stems now share one gain with their raw mix, so dense material comes out quieter than before (−7 dB in a 4-hit fixture,
0 dB on boombap), while app.js said "the defaults are the old exports" (architect); export all silently ignores "MIDI
of: the chain" (architect); `encodeWav` truncates 16-bit toward zero (`setInt16`), the phase-start stems rounded: 1 LSB
on 21–48 % of samples, mix-raw minus the stems' sum 3 LSB; TPDF dither suggested (sound); stem levels move with format
and rate (the peak policy scales 24-bit stems −2.19 dB under 32f on hot lanes; boombap's export-all stems −1.27 dB at
48 kHz, 0 at 44.1) (sound); the limiter overshoots (−0.93 dBFS at 48 kHz vs −2 dB set; pre-existing) (sound); kit
one-shots carry the lane's pan (sound; taste); jam takes stay 16-bit at the page rate, the jam raw mix clamps (sound,
kai; documented); kit onsets measured 6–114 samples in at `parseWav`'s 1 % FS threshold, mix vs mix-raw first onset 35
vs 16 samples, kit names `softkick` vs the stems' `soft-kick` (dex); `downloadJam()` hung once in an eval, a ring-out
chip click once left `exp.ring` false (kai; neither reproduced).

GOOD: dry stems + the delay return add up to the wet raw mix in the real graph (max 1.2e-7 between two 32f renders of
one roll; per lane wet − dry − return 4.9e-8; also on dsp and 6 lanes) (verifier, architect, sound); formats and tags
are right (24-bit block align 6; 32f format 3, 18-byte `fmt `, `fact` = frames, peaks over 0 dBFS kept; ACID and smpl
60 B, one forward loop 0…n−1; the master latency is compensated per rate: lag 0 at 44.1 and 48 kHz) (verifier, sound,
dex); old data keeps working (phase-start settings load with the defaults, malformed ones too; default MIDI
byte-identical, default audio within 1 LSB of the phase start) (verifier, architect, kai).

### Changes after round 1

- **A ring-out is the take's own tails** (verifier 1, architect 1, sound 1): recorded live, what follows a take's end is
  the pattern playing on, so the ring-out is now rendered offline from the hits the take played. While a take that
  wants one runs (the chip at arming), `hitSound` logs every live-kit hit (`jam.js logHit`, 48 s kept); when the take is
  done, `renderRing` picks the hits that start before its end and can still sound past it (`ringPlan`: the delay tail
  `tailSec()`, plus a sample lane's longest buffer at half speed), renders them on a raw kit with the lanes as they played
  their last hits (`makeKit({ raw, lanes })`: a kit can carry its own lanes, `lanesOf`), on the take's own sample grid
  (the end on a whole frame, each hit keeps its sub-sample place), and keeps what lies past the end (`ringOut`: 16-bit
  like the take, cut after the last sample over −90 dBFS). A hit on the end itself is the music going on. The first
  2 ms are bent onto the line the take ends on (`joinRing`): Chrome's live and offline renders land on the same samples
  (lag 0 over a whole bar) but differ ~−30 dB in phase, which left a 2–62 LSB step. "take ready" comes on the bar line;
  the ring-out renders in about a second ("rendering the ring-out…", then "+ ring-out files"); the download waits for
  it; a discard or a new take drops a late render (`jam.take`). Page, the reviewers' repro (boombap, 240 bpm, stopped at
  beat 5.5 with the jam button, the pattern playing on): every ring-out decays, peak per 250 ms kick −32 −48 −64 −75 −90,
  mix −31 −45 −56 −73 −84 dB (was a new −5 dB kick every bar). Against the real thing (a kick lane, snap 0, send 0.6,
  hits in bar 1 of 2): a 2-bar take recorded live (bar 2 = bar 1's tails, played for real) vs a 1-bar take's ring-out:
  the 50 ms envelopes agree within 0.1–0.2 dB over the first second; the ring-out is the plan's render to 0 LSB; the
  join continues the take's last samples (200, 194, 189 → 184, 177, 171). Also gone: the "finishing" wait of `tailSec()`
  (the SHOULD above): the recorder no longer records past the end.
- **Ring-out off means no ring-out files again** (verifier 2, architect 2): the recorder is back to the phase start's
  (`jam-worklet.js` = `1005992`), the take is cut with `trimChunks` as before, and a ring-out exists only for a take that
  asked for one (`jam.log` at arming). Page, the real grace path (stop 43 ticks after the first bar line at 240 bpm, by
  stopJam's own audible tick): ring off → 1 bar, 48000 frames, 5 files, no "+ ring-out files"; ring on → the 5 rendered
  ring-outs.
- **The live lanes play their settings** (found while measuring the above; pre-existing, at `1005992` too): `applySound`
  set level, send, pan and drive with Tone's `.value =`, an event at now + look-ahead, and Chrome loses that event on a
  lane chain that is still silent when it comes due (the kit built at the first wake before its first hit; a knob turned
  on a lane that isn't sounding): the lane played its constructor values (send 0.15, level 0.8). Offline renders (every
  export) start at time 0, so they always had the settings. Page, the kick lane above, the same 2 bars live vs exported:
  at `1005992` the live take's echoes are 10.1–10.4 dB under the export's (twice, the same numbers: 20·log 0.48/0.15),
  the dry +0.35 dB (0.8 vs 0.768); now live = export within 0.3 dB. Without this the ring-out (rendered with the
  settings) would not continue its take. Fix: `holdParam` (one event at time 0, set at once; a knob turned while playing
  still moves at once). The tone filter keeps `.value` (every hit sets it at its own time; holding it would cancel the
  per-hit tone events already scheduled).
- **One render path** (no reviewer; needed by the ring-out, which renders while the pattern plays on): `T.Offline` keeps
  the offline context global across its callback's awaits (the dsp module, the worklet flush), and a live hit scheduled
  in that window makes its nodes there and is lost. Every offline render (`masterLatency`, `renderPattern`, `exportKit`,
  `renderRing`) now goes through `offline(build, sec, channels, sr)`: the dsp module loads first, `build` runs
  synchronously with the context swapped, the flush waits with the live one back. `routeStems(k, dry)` is the stems
  routing renderPattern had inline, shared with the ring-out. With dice locked, default WAV / stems match the phase start
  to 1 LSB (the rounding below); an export all on the dsp engine while playing: 8 files, 1.8 s, stress 0, 0 errors.
- **Kit one-shots fade at any cut** (architect 3): the kit renders 0.1 s past `KIT_PRE + 2`, so a voice that speaks late
  still has its whole 2 s, and `trimOneShot` fades whenever the sound is still going where it is cut (`len >= min(cap,
  n − p)`: the cap or the render's end). Page, the 4 s sine on lane 4 at 48 / 24: 96000 frames, the last 10 samples at
  −69.3 dB (file peak −7.9; was a hard cut at −32 dBFS).
- **The kit keeps headroom** (sound 2): one gain for the whole kit (`headroomGain`, shared with `stemFiles`): the loudest
  PCM sample lands at 0.98, the lanes and each accent / normal pair keep their balance, 32-bit float stays as rendered;
  the status line names the gain. Page, a lane hit at +2.66 dBFS raw: the 24-bit kit peaks at −0.18 dBFS ("all scaled
  −2.8 dB to avoid clipping"), the 32f kit +2.66; accent over normal 3.097 dB in both.
- **Quick SHOULDs done:** 16-bit WAVs are rounded, not truncated (sound); the kit files take the stems' lane names
  (`orbits-kit-1-soft-kick-accent.wav`, dex); `floatStemsToInt16` and `splitChunks` gone, `trimChunks` live again, one
  `setFile` name for both stem writers, `wavFrames` in wav.js (architect); the settings comment says what changed for
  old settings (architect); export all says "this pattern only: a chain exports as MIDI" when "MIDI of: the chain" is
  picked (architect); the ring-out lockout is gone with the live ring recording (verifier, architect, kai).
- **Not changed:** one-shot renders keep ACID "stretch" (every Orbits file is whole bars at a known tempo; `withAcid`
  says so); stems keep one gain with their raw mix (so they add up to it; the status line names the gain); the grace
  stop's 48164 frames did not come back (48000 exact at 240 bpm / 48 kHz, boombap, by stopJam's audible tick); kit
  onsets are the first sample over −80 dBFS (parseWav's onset is 1 % FS), the mastered mix's onset shape is the
  master's; the kai items not reproduced (a reload keeps the chip and `exp`). → [[BACKLOG]] Later: TPDF dither and a
  fixed stem headroom, a float jam recorder, centred kit one-shots, a base name on kit files, memory of long export-all
  renders, a Tone-free test of the stems routing, voices that set filters with `.value` inside `hit()`.
- Tests (164 + 9; 1 new, 3 rewritten): "ORBIT2-10 r1" (`ringPlan`: silent-by-the-end hits out, a hit on the end out,
  the lead / frames maths, the frame grid and sub-sample place; `ringOut`: rounding and clamping like the recorder, the
  common −90 dBFS cut, silence = one frame; `joinRing`: no step, the offset gone after n frames; `logHit` bounded;
  `trimOneShot` with a late onset cut by the render's end: faded; `headroomGain` over a kit; wiring: the recorder records
  nothing past the end, `trimChunks` on done, a ring-out only for a take that asked, no `T.Offline(` left, the kit gain,
  the kit's render margin, `holdParam` on drive wet / pan / level / send); the E6 zip test on `ringOut`; the E1 test reads
  `wavFrames` from wav.js; the jam / stems test checks `headroomGain`; the E4 name check follows the stems' names.
  `npm run check` clean, `npm test` 164 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py 5400 +
  headless Chrome 9222, both stopped). Browser (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks above, the
  export all at 48 / 24 dry + one track (7 WAVs of 535814 frames, ACID + smpl, one MIDI track on channel 10), dry + return
  = wet raw mix at 32f (6e-8), settings through a reload and from before the phase, 0 page errors on desktop and phone,
  no sideways overflow; screenshots looked at. `app.js` 1461 → 1517 lines.

## Round 2 (re-check): 0 of 3 HAPPY, one item left (narrowed)

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound, all on the default model), fresh sub-agents in
one message, own ports 5401 / 5402 / 5403 (+ 940x; the phase start `1005992` on +100, the code before the round-1 fixes
`fa0409f` on +200). Brief as in round 1 (goal, E1–E6, the spec, the "where" table, the must-fix rule with the later ids
and the Later items), `git diff --stat 1005992..HEAD` (9 files, +644/−90) and the round-1 fixes alone (`fa0409f..45b1319`,
7 files, +421/−107), each one's own round-1 MUST-FIX and "Changes after round 1", with the instruction to confirm their
items first with the same repro, then check nearby, anything new only in scope and marked NEW. Pre-checks on `45b1319`:
`npm run check` clean, `npm test` 164 + 9, smoke 10/10. `stalled: 0`: four round-1 MUST-FIX are closed (verifier 2,
architect 2 and 3, sound 2).

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) STILL OPEN, narrowed: the ring-out no longer holds the bars that follow (every ring-out decays, 1.39 s; was 3.19 s with a kick a bar), but often starts with the next bar's downbeat at full level. Boombap, 240 bpm, ring-out on, stopJam at beat 5.5, 8 takes at the groove's humanize (0.08): 6 of 8 kick ring-outs open at −8.4 / −8.5 dBFS (a whole new kick; first 10 ms +21.3 dB over the take's last 10 ms, shaker +26.5, crackle +35.2), exactly the takes where the next downbeat was logged 0.07–0.92 ms before the end; the 2 where it landed after the end open at −34.1 dBFS; humanize 0: 6 of 6 clean. Cause: `ringPlan` (`jam.js:125`) keeps every hit with `time · sr < endFrame − 0.5`, and the log has only the humanized time (`app.js:200`). Expected: only the tails of the take's own hits (the chip, the fix note). (2) FIXED: ring off, stop 30 ticks after the bar-1 line: 5 files, 24000 frames, no "+ ring-out files" (`fa0409f`: 10 files with five 428-frame ring-outs; `1005992`: 5). |
| architect | NOT HAPPY | (1) STILL OPEN, narrowed, the same cause: the bars after the end are gone (ring-outs 138318 frames, 2.9 s, was 298047; kick −27 → −82 dB re the take's kick peak, no attacks after 20 ms, seams 0–2 LSB where no end hit gets in), but 7 of 11 boombap takes (mid-bar and grace stops, synth and dsp) opened with a full new hit (kick first 20 ms 0.0 / 0.0 / +0.1 dB re its take peak; mix-raw +0.8 dB), its hit logged 5–23 frames before the end while the take holds only its first samples; humanize 0: 4 of 4 start at −43 to −65 dB. Fix direction: decide by the step's tick (`< jam.stopTick`), with a test of an end hit a few frames early. (2) FIXED: ring off, grace stop 11 ms after the line: 5 files, 133953 frames (1 bar at 86 bpm / 48 kHz); a ring-off case is in the tests (breaking `jam.log = exp.ring ? [] : null` fails the suite). (3) FIXED: the 4 s sine kit at 48 / 24: 96000 frames, −31.3 dBFS 20–30 ms before the end, the last 10 samples at −84.2 dBFS; putting back `len >= cap` fails the new test. NEW: none. |
| sound | NOT HAPPY | (1) STILL OPEN, the same cause: free dice, 4 takes: take 1's kick ring-out −8.4 dBFS in its first 20 ms (the take's kick peak −7.8; that kick logged 4.0 frames before `endFrame`), takes 2 and 4 clean kicks but mix-raw ring-outs at −15.5 / −17.4 dBFS (another lane's new hit); dice locked (seed 7): every take ending on a kick bar line −8.3 to −8.5 dBFS (2- and 3-bar takes, a grace stop, synth and dsp, 24 / 44.1 / 48 kHz), the kick on that line logged 23.83 frames (0.5 ms) early, then −28 −41 −51 −71 −84 dB per 250 ms; a take ended by stopping the transport: −47.1 dBFS, no attack. Expected: hits on or after the stop tick stay out whatever their nudge. (2) FIXED: a sample lane at +1.58 dBFS raw (107 float samples over 1.0): 24 / 48 and 16 / 44.1 kits peak at −0.18 dBFS, 0 full-scale samples, "all scaled −1.8 dB to avoid clipping"; every deterministic file exactly −1.76 dB under its 32f file; accent over normal 3.09–3.10 dB in every format; 32f keeps +1.58 dBFS; the kick at 32f bit-identical to `fa0409f`. |

SHOULD items recorded (never block): a take ended by stopJam can run past its bar line (48023 / 48058 frames for 2 bars
at 24 kHz, both posted ends agree: the clock's bar-line time; `1005992` too) (verifier); a downbeat humanized early leaves
its first ~1 ms at the very end of the take (its last 10 ms at −33.4 dBFS against ~−43), and one before the take's start
begins mid-attack on sample 0 (−41.6 dBFS step) (verifier, sound; pre-existing, same root); jam takes and ring-outs come
out at the page's own rate (24 kHz in a headless page) (verifier, sound; documented); the app wiring is checked by
grepping app.js: a ring-out placed off the take's grid, rendered on `m.lanes`, or a kit gain never scaling would pass
(architect); `downloadJam` waits on a render with no timeout (architect); the "last sample over −90 dBFS" scan written
twice and the 16-bit round-and-clamp three times (architect); a jam module would shrink app.js (architect; taste);
`holdParam` is an audible change to live play and deserves a changelog line (architect); `joinRing` bends a random
offset into a noise tail's first 2 ms (a dsp snare at 24 kHz: +4.9 dB over the live continuation for 5 ms; at 48 kHz
the seam's high band matches live) (sound); one hot lane lowers the whole kit (sound; as designed).

GOOD: every other way to end a take is clean (the jam button, Play / stop, the 256-beat cap: 1536000 frames, ACID 256;
a discard or a new take during a ring-out render drops it, a download during it waits) and a ring-out without the
downbeat continues its take (within ±2 dB over 10 ms, joins 2–4 LSB; a 4 s sample lane rings out in full) (verifier,
architect, sound); `holdParam`: live takes match 32f stems of the same roll within 0.3 dB a lane with the same L / R
(`1005992`: +3.4 / +0.1 / −1.8 / −3.2 dB), a knob turned while playing lands where expected (−27.8 dB for −28.0)
(verifier, sound); one render path, unchanged sound (with dice locked mix and stems within 1 LSB of `1005992`, the 32f
kick stem bit-identical to `fa0409f`, the dsp engine's export all and kit during a take lose no live hits: per-bar RMS
identical) (verifier, architect, sound).

### Changes after round 2

- **A ring-out goes by the take's steps** (verifier 1, architect 1, sound 1): every live hit is logged with the master
  tick of the step it plays (the scheduler hands it over: `play(li, lane, h, t)`, and an early part of a later step
  carries that step's tick, `liveTick` tags it `tick: at`) and the Play it belongs to (`run`: ticks count from 0 again on
  each Play); a pad or an audition gets the tick at its time (`tickAt`, which `heardTick` now uses too). `ringPlan` keeps
  the take's own steps, `tick < jam.stopTick` in the take's Play, whatever humanize, nudge or push did to their time: the
  next bar's downbeat played a hair before the end stays out, a last step of the take pushed past the end stays in (it
  sounds only in the ring-out); a hit of another Play (Play stopped and started again while the take closes) goes by its
  time. `ringPlan` also returns the lane each index played the take's last hit with (`lanes`, was app.js code). Page, the
  reviewers' repro (boombap, 240 bpm, humanize 0.08, stopped at beat ~5.5 with the pattern playing on), 8 takes: 6 with
  free dice, 2 with the dice locked at seed 7 (every one leaked before): the kick ring-out's first 20 ms at −24.5 to −38.9
  dBFS against a take peak of −7.6 to −8.5 (was −8.4: a whole kick), its first 10 ms within −1.6…+2.7 dB of the take's
  last 10 ms (a new hit was +21 to +35 dB), shaker and mix-raw the same way. Also: the grace path (ring off 5 files, ring
  on the 5 rendered ring-outs), the seam on a kick tail (take −55 −52 −49 → ring −46 −38 −29), and Play stopped and
  started again 60 ms later during a take: its ring-out decays (−16 → −90 dB per 250 ms), no attacks.
- **Quick SHOULDs done:** `downloadJam` gives a hung render 15 s, then zips the take without it (architect); one
  `lastAbove` scan (ringOut, trimOneShot) and one `toInt16` (ringOut, joinRing; the recorder worklet keeps its own copy:
  it can't import, and stays byte-identical to `1005992`) (architect); the lane choice is pure and tested (`ringPlan`'s
  `lanes`) and the kit-gain wiring check now pins `exp.bits` (architect); `holdParam` gets a BACKLOG line as a port-back
  item (architect).
- **Not changed:** the take's own edges (a hit humanized across the take's start or end leaves its first ms there: the
  recorder records what sounded), the stopJam end past the bar line and the jam rate are pre-existing; `joinRing` keeps
  the linear join (a step at a smooth tail's seam clicks; on noise the bend is masked, inaudible in sound's own words); the
  kit gain stays one for the kit (as designed). → [[BACKLOG]] Later.
- Tests (165 + 9; 1 new): "ORBIT2-10 r2" (`ringPlan` by steps: the end step played 5 ms early out, a take step pushed
  20 ms past the end in and placed 2 frames past it, another Play by time, the lane choice, the sample lane's reach, only
  the next bar → no ring-out; a real `liveTick` run: a lane pushed 20 ms early hands its early part its step's tick;
  wiring: the scheduler's step ticks, tick + run in the log, the end by `jam.stopTick` + `jam.run`, the kit gain on
  `exp.bits`). `npm run check` clean, `npm test` 165 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py
  5400 + headless Chrome 9222, both stopped). Browser (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks
  above, 0 page errors. `app.js` 1517 → 1522 lines.

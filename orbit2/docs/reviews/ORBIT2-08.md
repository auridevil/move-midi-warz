---
type: review
phase: ORBIT2-08
title: ORBIT2-08 new voices and articulations (L3, L4), review panel
date: 2026-11-11
round: 2
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: HAPPY
  sound: HAPPY
  tomi: HAPPY
  dex: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-07]]'
---

# ORBIT2-08 · New voices and articulations: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), tomi, dex. Process: [[REVIEW-PANEL]].

Phase start: `abb88c0` (ORBIT2-07 closed). Implementation commits: `b480940` (L4), `ef0e665` (L3), `f1066d9` (tests and
browser check).

## For the brief: where the new things are

| item | model / audio | on screen | Move |
| --- | --- | --- | --- |
| L4 voices | `voices.js` (Tone engine) and `dsp-voices.js` (dsp engine, layer lists for `dsp-core.js`; no core change, the worklet regenerated unchanged): `djembe` (bass / tone / slap from `color` in thirds, or an `artic` lock 0 / 1 / 2), `logdrum` (a sub with a woody knock; `color` = how far it glides down, `snap` = the punch onto the note), `agogo` (two bells a fifth apart: low below `color` 0.5, high above, or `artic` 0 / 1), `shekere` (rolled bead bursts; `artic` 1 = slap: a palm on the gourd, then the beads); `VEL_TIMBRE` entries for G5's soft-hit shaping | the voice select lists them; the `color` tooltip (`INFO.color`, `app.js`) | ◀ ▶ = voice |
| L4 kits | `kits.js`: `afro` "Afro" = kick, log drum, shekere, agogo, djembe, open hat; the earlier "Afro" set is now `hands` "Hand drums" (same sounds, so `kitKey` still names an old pattern's kit); `jungle` "Jungle" = kick909 (tight), snare (decay 0.6, ringing), hat (decay 0.1, for ×4 rolls), ride, open hat, crash. Kits set sounds, not speeds | the kit select | Shift + ◀ ▶ = kit |
| L3 strokes | `voices.js` `ARTICS` (conga, bongo: open · mute · slap; djembe: bass · tone · slap; hat: closed · open; agogo: low · high; shekere: shake · slap), `ARTIC_MAX`, `articAt(voice, lock)` (null when the voice has no such stroke). `lanes.js`: `artic` is a whole-number step lock (`STEP_LOCKS`, `LOCK_RANGE.artic`, clamped in `setLock` / `lockFrom`; not in `LOCK_KEYS`, so no knob or gauge), `Lane.cycleArtic(i)` (lane sound → first → … → last → lane sound). `app.js` `hitSound` passes `artic` to `velShape` → both engines read `p.artic` (unlocked = the lane's own sound). `export.js`: `collectHits` gives each hit its `artic`, `articNote(note, artic)` = the lane's note + the index, used by `hitsToMidi` and by live MIDI out (`midiio.js` `PolyMidi.note(li, vel, at, artic)`) | lock panel (long-press / right-click / Alt+click a step): "stroke" chooser `#lock-artic` ("lane sound" + the voice's strokes; hidden for voices without, `#artic-wrap`); the panel title names the stroke ("locked: slap"); the MIDI drawer explains the neighbouring notes (`#midi-artic-note`); `INFO['step locks']` | hold step(s) + push the jog wheel (`wheelPush`, CC 3) = the next stroke on each held step (the release then doesn't toggle), the lock panel opens on that step; the help table (`index.html`) has the row |

Tests: `orbit2/test/poly.test.js` "dsp engine: every voice renders…" now renders every stroke of every voice in
`ARTICS` (three knob settings each) and checks the new voices allocate nothing while rendering (no slot gains a field, a
`PerformanceObserver` 'gc' probe counts 0 collections over 20 s); new tests "ORBIT2-08 L4" and "ORBIT2-08 L3".

## Pre-checks

`npm run check` clean, `npm test` 151 + 9 green on `f1066d9` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; tomi, dex on sonnet), own ports
5401 / 5402 / 5403 / 5408 / 5406 (+ 940x; the phase start `git archive abb88c0` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, L3 / L4 verbatim from [[BACKLOG]], the phase spec (the three build tasks), the
"where the new things are" table above, `git diff --stat abb88c0..f1066d9` (9 files, +192/−28), `git status --short`
(only this file), the must-fix rule with the later phases' ids and the BACKLOG "Later" items on voices, levels and
exports, how to drive `orbit2/index.html` with `orbit2/tools/cdp.mjs` (`__poly`, the kit and voice selects, a fake Move
through `move.emit`, a fake MIDI out, the model and the dsp engine in Node) and how to run the phase start. `stalled:
0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) NEW: an unlocked djembe or agogo step sends another stroke's note. The stroke an unlocked step plays comes from `color` (`dsp-voices.js:71`, `:91`, the same in `voices.js`), but the MIDI export and live out send the lane's note + 0 for every unlocked step (`export.js:94` → `articNote`; live `app.js:222`). Node: a djembe lane on note 46, color 0.5, steps [no lock, bass, tone, slap] play 220 / 87 / 220 / 330 Hz and send 46 / 46 / 47 / 48; at color 0.9 an unlocked slap sends 46; an agogo at color 0.7 plays high (960 Hz) unlocked and sends 39, a high lock sends 40. The Afro kit's djembe (color 0.5) sends every unlocked tone on the bass note, against the MIDI drawer's "+1 for the second stroke". (2) NEW: stroke notes land on other lanes' notes with the default note map (36, 38, 42, 39, 46, 49, all channel 10, `midiio.js:9`): Hand drums, lane 1 conga with mute and slap locks, live out for 3.5 s → 36 / 37 / 38, the slap on lane 2's note (the shaker), the `.mid` the same; Latin: conga slap = 38 = lane 2 (bongo), bongo mute = 39 = lane 4 (cowbell). In a drum rack a conga slap plays the shaker or bongo pad. |
| architect | NOT HAPPY | (1) The verifier's 1, measured on the Afro kit as shipped: djembe on 46 at color 0.5, no lock plays tone and sends 46 (expected 47); a `color` lock 0.9 plays slap and sends 46 (48); agogo at color 0.7, no lock plays high and sends 39 (40). Browser: live note-ons `{46: 3, 47: 1}` in both engines, the exported djembe track only 46 and 47. Cause: the MIDI side reads only the lock (`articAt` in `export.js:95`, `app.js:222`, `midiio.js:134`) while the voices pick the unlocked stroke from `color` themselves (`voices.js:78`, `:92`, `dsp-voices.js:71`, `:91`). |
| sound | NOT HAPPY | (1) NEW: the synth (Tone) shekere is far too quiet (`voices.js:94`; the phase's level test checks the dsp engine only). One hit at vel 0.7 on a neutral lane: synth shake peak −28.8 dBFS / −45.0 LUFS against the dsp twin's −9.9 / −27.8 (slap −23.0 / −42.1 vs −6.3 / −27.1); Afro kit stems (6 lanes, 120 bpm, 4 bars): synth shekere −50.8 LUFS against the kick's −33.3 (dsp −33.4 vs −31.0). Expected: within the phase's own ±6 dB of the dsp twin, a few LU under the kick. (2) NEW: in the synth engine every slap is the softest, dullest stroke of its drum (peak / loudness, share of energy above 2 kHz in the first 150 ms): conga open −10.4 / −23.8, slap −11.8 / −30.1, 1 % (dsp slap −6.1 vs open −7.6, 7 %); bongo −12.5 / −29.8 vs −13.2 / −34.1, 2 % (dsp 15 %); djembe bass −9.6 / −23.4, tone −10.8 / −26.1, slap −11.0 / −31.5, 4 %. Cause: the crack is the old snap NoiseSynth at −18 dB under a −4 dB body played at vel × 0.8 (`voices.js:64–67`), the djembe slap body at vel × 0.6 (`:79`). Expected: a slap at least as loud as the open tone at its peak, with an audible crack like the dsp twin's. |
| tomi | HAPPY | none (dsp strokes measured: djembe bass / tone / slap 0.27 / 0.15 / 0.07 s, conga mute and slap distinct, agogo low / high a fifth apart, the open hat twice as long as the closed; the stroke chooser on an agogo lane: "high" → `{ artic: 1 }`, title "locked: high"; check, tests, worklet unchanged after a rebuild) |
| dex | HAPPY | none (the Jungle kit in both engines with 16th hats, two stroke locks and a ×4 ratchet: stems 4 + mix, DC ≤ 5e-4, no page errors; the MIDI file and live out put the hat's open stroke on 43 and closed on 42, as the drawer says) |

The implementer reproduced each MUST-FIX on `f1066d9` before fixing. MIDI in Node (`collectHits` → `hitsToMidi` →
`readMidi`, the default note map): the Afro djembe [no lock, bass, tone, color lock 0.9] plays 220 / 87 / 220 / 330 Hz
and sends 46 / 46 / 47 / 46; the agogo at color 0.7 [no lock, low, high, no lock] plays 960 / 640 / 960 / 960 Hz and
sends 39 / 39 / 40 / 39; the Hand drums conga [open, mute, slap] sends 36 / 37 / 38 (38 = lane 2), the Latin bongo on
lane 2 38 / 39 / 40 (39 = lane 4). Sound in the page (5400/9400, silent; one hit at vel 0.7 through a neutral lane chain,
peak dBFS / momentary max LUFS / share of energy above 2 kHz in the first 150 ms, synth vs dsp): conga slap −11.9 /
−30.3 / 0.4 % under its open −10.2 / −24.2 (dsp slap −6.1 / −26.8 / 6.5 %); bongo slap −13.6 / −33.4 / 0.9 % under
−12.4 / −28.3 (dsp −6.2 / −28.8 / 12.1 %); djembe slap −12.2 / −31.3 / 3.4 % under its bass −9.6 / −23.0; shekere shake
−27.6 / −44.1 against the dsp's −7.7 / −25.5; Afro stems (every lane four quarters a bar, 120 bpm, ungated K-weighted
mean): synth shekere −50.8 against the kick's −27.2 (dsp −33.4 vs −25.0).

SHOULD items recorded (never block): a stroke lock keeps its index when the lane changes voice or kit, so a conga mute
becomes a hat's open stroke, an agogo high or a shekere slap (Afro → Jungle turns lane 3's shekere slaps into open
hats), and on a voice without it the step stays "locked: stroke" while it plays the lane sound, removable only with
"clear" (architect, verifier); `midiio.js` imported `export.js` for a one-line `articNote`, pulling in lanes, slots, kits
and smf (architect); the conga / bongo strokes are written in both engines (architect; the two-engine pattern); the dsp
engine's polyphonic lanes let an open hat or an open conga ring under the next closed / mute stroke (tail −67.7 dB /
−90.5 dB at the default decay), where Tone's mono voices cut it (architect); the hat's open stroke on 43 is GM's high
floor tom and doesn't choke the closed hat in Live without a choke group (architect, dex; phase 10); the synth agogo
~8 dB under its dsp twin, the synth Afro open hat 22 LU under the kick (dsp 10), the synth Jungle snare 11 LU under the
kick909 (dsp 1) and its ride / open hat / crash 20–24 LU under, Jungle the quietest kit at the master (sound, verifier;
the ORBIT2-02 "dsp engine voice levels" gap); the djembe slap dull in both engines and the dsp's quietest stroke by
loudness (sound); a second synth shekere 90 ms into the first peaks 3.6 dB over it (sound); the log drum glides only
−2.6 semitones at the Afro kit's color 0.4 and sits on E2 at tune 0 (sound, tomi); "closed" is the lane's own hat, so a
long-decay hat lane is not closed (tomi); the Afro kit's djembe and open hat are lanes 5–6, so a 4-lane pattern has
neither (tomi); the stroke notes collide with other lanes (tomi, dex: as the verifier's MUST-FIX 2).

GOOD: old data is safe (verifier: phase-start saves and links with the old "Afro" set open with the same voices, named
"Hand drums"; strokes survive reload, links, undo / redo, slots; architect: 54 phase-start saves identical in JSON,
seeded hits and MIDI bytes across all 18 kits; sound: every older voice gives the same dsp layers and soft-hit shaping);
the Move gesture (one and two held steps, voices without strokes ignore the push, the release doesn't toggle, one undo
restores both) and the stroke chooser (`ui.js` segmented, rebuilt only for a new voice); the new dsp voices render clean
(108 knob / velocity settings: finite, no end clicks, DC ≤ 1e-3), the log drum agrees across the engines, the dsp Afro
kit is balanced (every lane within 3.2 LU of the kick but the open hat; master −26.6 LUFS, peak −7.2 dBFS), stress 0 %
with 70–75 ms headroom for Afro at 118 bpm and Jungle at 170.

### Changes after round 1

- **The note sent is the stroke heard** (verifier 1, architect 1): one rule, `strokeOf(voice, lock, color)` in
  `voices.js`: an `artic` lock, else the stroke the hit's color picks (djembe by thirds, agogo high from ½), else the
  voice's first; null for voices without strokes. `Lane.strokeAt(lock)` applies it with the hit's own color (a color
  lock, else the lane's); `hitSound` passes it to both engines, `collectHits` puts it on every hit (an unlocked conga
  hit now says 0, open), live out sends it. Both engines' djembe and agogo call `strokeOf` instead of their own copies of
  the thresholds. Node: the Afro djembe [no lock, bass, tone, color lock 0.9] now sends 50 / 46 / 50 / 51, the agogo at
  0.7 47 / 39 / 47 / 47 (high, low, high, high); page: live out while playing 50, 46, 50, 51.
- **A stroke never plays another lane's drum** (verifier 2): `strokeNotes(lanes)` in `midiio.js`: a lane's first
  stroke on its own note, the others on the next notes up that no lane's note and no earlier stroke takes on the same
  channel, over the whole note map whatever the voices (so live out, the export and every slot agree; another channel
  doesn't block). Defaults: lane 1 36 / 37 / 40, lane 2 38 / 41 / 43, lane 3 42 / 44 / 45, lane 4 39 / 47 / 48, lane 5
  46 / 50 / 51, lane 6 49 / 52 / 53, 18 different notes. `hitsToMidi` takes the whole map (`map`, the export passes all
  six lanes), `PolyMidi.note` looks the note up; `articNote` is gone, so `midiio.js` no longer imports `export.js`
  (architect's SHOULD). The MIDI drawer explains the rule and lists the stroke notes the lanes can play now
  (`#midi-artic-map`, refreshed on every `sync()` and note / channel change): Afro "lane 3 shekere: shake 42 · slap 44;
  lane 4 agogo: low 39 · high 47; lane 5 djembe: bass 46 · tone 50 · slap 51", Hand drums "lane 1 conga: open 36 · mute
  37 · slap 40".
- **Synth slaps crack** (sound 2): conga, bongo and djembe slaps fire their own crack (`crackLayer`: white noise at
  −5 dB through a high-pass at 1.2 / 1.5 / 1.5 kHz) with the body at velocity × 1 (djembe × 0.9); open, mute, bass and
  tone are unchanged. Same chain and hit as above: conga slap −6.3 / −27.5 / 8.5 % (open −10.1 / −24.2), bongo −8.6 /
  −30.2 / 11.6 % (open −12.4), djembe −6.8 / −27.2 / 8.3 % (bass −9.4): every slap peaks 2.6–3.8 dB over its open stroke,
  with the dsp twins' crack (6.5 / 12.1 / 7.1 %).
- **The synth shekere at its twin's level** (sound 1): white noise through a band-pass at Q 0.7, −4 dB (pink lost ~16 dB
  in the 5–8 kHz band), the palm's thump −18 → −8 dB: shake −9.6 / −25.8 against the dsp's −7.7 / −25.5, slap −10.4 /
  −26.9 against −6.3 / −26.2; Afro synth stems: shekere −34.3 against the kick's −27.2 (was −50.8; dsp −33.4 / −25.0).
- **Quick SHOULDs done.** Synth agogo +5 dB (−14.2 / −26.7 against the dsp's −13.0 / −24.1; Afro synth stem −33.3,
  6 LU under the kick, was 11) (sound, verifier). dsp djembe slap brighter: its crack band-passed at 4 kHz over a 1.5 kHz
  high-pass, gain 0.6 → 1.1: −4.9 / −24.7 / 7.1 % (was −5.9 / −25.0 / 3.6 %) (sound). The log drum glides down to an
  octave at color 1 (was 35 %), both engines: −3.9 semitones at the Afro kit's 0.4 (sound, tomi). A stroke lock the voice
  lacks is named in the lock panel title: "locked: stroke (not on kick)" (verifier).
- Not changed, → [[BACKLOG]] Later: a stroke lock's meaning across voices, one stroke table for both engines, strokes
  cutting each other on dsp lanes, GM notes for strokes (phase 10), the synth open hat / snare / ride / crash in the new
  kits (the per-voice trim), the synth shekere retrigger, the log drum's default pitch, a closed hat on a long lane, the
  djembe in a 4-lane Afro pattern.
- Tests (152 + 9; 1 new, fails on `f1066d9`): "ORBIT2-08 r1": `strokeOf` (thresholds, a lock wins, a stroke the voice
  lacks, voices without), the dsp djembe / agogo called without a stroke play `strokeOf`'s, the verifier's and
  architect's repros through `collectHits` → `hitsToMidi`, every default stroke note different and none on another
  lane's, another channel doesn't block, 127 caps, live out = the file, and a fake-Tone guard on the synth slaps (a crack
  through a high-pass ≥ 12 dB over the open stroke's noise, the body ≥ 0.85 × velocity) and the white-noise shekere.
  "ORBIT2-08 L3" now expects the stroke each hit plays (an unlocked conga = 0). `npm run check` clean, `npm test` 152 + 9,
  `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped). Browser
  (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the measurements above, live MIDI, the drawer's stroke notes, the
  title of a stroke on a kick, the stroke chooser by a real click (agogo "high" → `{ artic: 1 }`), Move hold + push × 2 on
  the djembe → tone with the step kept on, phone 390 × 844 without sideways scroll, 0 page errors; screenshots looked at.
  `app.js` 1270 → 1275 lines.

## Round 2 (re-check): 2 of 3 HAPPY

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound, all on the default model), fresh sub-agents in
one message, own ports 5401 / 5402 / 5403 (+ 940x; the phase start `abb88c0` on +100, the code before the round-1 fixes
`f1066d9` on +200), the verifier also ran the smoke on 9222. Brief as in round 1 (goal, L3 / L4, the phase spec, the
"where" table, the must-fix rule with the later ids and the Later items, round 1's included), `git diff --stat
abb88c0..ba46a18` (11 files, +455/−35) and the round-1 fixes alone (`f1066d9..ba46a18`, 10 files, +299/−43), each one's
own round-1 MUST-FIX and "Changes after round 1", with the instruction to confirm their items first with the same repro,
then check nearby, anything new only in scope and marked NEW. Pre-checks on `ba46a18`: `npm run check` clean, `npm test`
152 + 9. `stalled: 0`: every round-1 MUST-FIX is closed.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | Round-1 items FIXED: (1) Node, lane 5 djembe on 46 at color 0.5, steps [no lock, bass, tone, slap] play 220 / 87 / 220 / 330 Hz and send 50 / 46 / 50 / 51 in the file and live (`f1066d9`: 46 / 46 / 47 / 48); color 0.9 unlocked sends 51; agogo at 0.7 unlocked 47, low 39, high 47; page the same, heard = sent. (2) Hand drums conga [no lock, mute, slap, open] live 36 / 37 / 40 / 36, Latin conga slap 40, bongo 38 / 41 / 43 / 38; 18 different default stroke notes, none on another lane's, also for maps 36–41, two lanes on 36, 60–65; the drawer's list matches. (1) NEW: a pad hit while recording still sends another stroke's note: `liveHit` (`app.js:540`, Move pads `:1029` and the computer keys `:1136` when record is armed) calls `pmidi.note` without a stroke, while its `hitSound` plays `lane.strokeAt(lock)`. Page: Afro, lane 5 djembe at color 0.5, `setRec(true); liveHit(4, 0, 90)`: stopped sends 46 (bass) while it plays 220 Hz (tone, 50); armed and playing the pad sends 46, then its recorded step plays back as 50, 50; agogo at 0.7: the pad sends 39 while it rings 960 Hz, its step plays back on 47. `f1066d9` gives the same 46 / 39. |
| architect | HAPPY | none. (1) FIXED: Afro djembe [no lock, artic 0, artic 1, color lock 0.9] heard tone / bass / tone / slap in both engines (dsp layers, and the Tone triggers through a fake Tone), file and live 50 / 46 / 50 / 51; more cases (artic 2 → 51, color 0.1 → 46, color 0.9 + artic 0 → 46); agogo [no lock, 0, 1, color 0.2, artic 2] high / low / high / low / high → 47 / 39 / 47 / 39 / 47; page: 20 / 20 synth and 18 / 18 dsp heard → sent pairs right, the export's djembe `{46: 4, 50: 8, 51: 4}`; on `f1066d9` the same harness shows the old bug. Nearby: 18 kits' phase-start patterns (6 lanes, color and velocity locks) give identical MIDI bytes at `abb88c0` and HEAD; every older voice's dsp layers identical; check, 152 + 9. |
| sound | HAPPY | none. (1) FIXED: synth shake −14.1 / −30.6 against the dsp's −11.8 / −30.0 (`f1066d9` −30.4 / −47.4), slap −12.5 / −30.1 against −7.5 / −27.5, inside ±6 dB at vel 1 and 0.35 too; Afro stems (own 6-lane pattern, 120 bpm, 4 bars) synth shekere 4.0 LU under the kick (`f1066d9` 20.8), dsp 5.5. (2) FIXED: synth slaps conga −6.9 / −28.1 / 2.9 %, bongo −10.4 / −30.8 / 5.2 %, djembe −8.0 / −27.7 / 3.4 % (at the default lane tone, ~4.3 kHz low-pass) over their open / bass strokes in all 12 extra knob / velocity cases (by 0.3–3.8 dB), the slap as much brighter than the open stroke as on dsp (centroid ratio 2.1 / 1.9 / 4.3 × vs 2.2 / 1.9 / 4.9 ×). Nearby: open, mute, bass and tone unchanged across HEAD, `f1066d9`, `abb88c0` (≤ 0.2 dB, 0.0 LU); synth agogo 6.0 LU under the kick in the Afro stems (dsp 5.1); the log drum glides 82.4 → 65.9 Hz at color 0.4, an octave at 1, both engines; no clicks, DC ≤ −34.8 dB re peak, 0 page errors. |

The implementer reproduced the verifier's NEW item on `ba46a18` before fixing (page 5400/9400, silent): Afro, lane 5
djembe at color 0.5, `__poly.pmidi.out` captured, `setRec(true); liveHit(4, 0, 90)` → note 46 while `strokeAt(null)` is
1 (tone, note 50).

SHOULD items recorded (never block): at the top of the note range the strokes pile on 127, another lane's note there
(lanes 120–127, or 125 and 127) (verifier, architect); `PolyMidi.note` rebuilds `strokeNotes` (a Set and seven arrays)
for every live note, ~0.9 µs, and `lane.strokeAt` runs twice per hit (verifier, architect); the `ARTICS` comment in
`voices.js` still said "the lane's note + the index" (architect); the pure stroke rules (`ARTICS`, `articAt`,
`strokeOf`) live in the Tone voice module, so `dsp-voices.js` imports it, and `export.js` imports the MIDI I/O module for
`strokeNotes`: a small pure `strokes.js` would keep the boundaries clean (architect); NEW (sound): the synth bongo and
djembe slap cracks are thinner than the twins' at the default lane tone (5.2 / 3.4 % against 10.5 / 5.3 %: the
high-passed white noise sits partly above the lane's 4.3 kHz low-pass; a band-pass around 2.5–3.5 kHz would survive it),
the synth shekere slap peaks 5.0 dB under its twin (1.6 dB over the shake, the dsp's 4.3), the dsp djembe slap is now
the hottest single hit (−4.5 dBFS at vel 0.7 against the bass's −7.1 and the kick's −6.9), the synth agogo has its twin's
level but not its clang (HF 0.1 % against 44 %).

GOOD: one stroke rule on the pure model (`strokeOf` + `Lane.strokeAt`) asked by both engines, live MIDI and the export,
its thresholds in one table (verifier, architect); the stroke-note map worked out over all six lanes, so live out, the
export and chain slots agree, and the drawer shows the notes that go out (verifier, architect); the shekere fixed in its
bead band, not by a blanket gain (shake 0.6 LU from its twin, centroid 4.27 vs 4.41 kHz), and the crack its own layer,
firing only on slaps (sound).

### Changes after round 2

- **A pad hit sends the stroke it plays** (verifier, NEW in round 2): `midiHit(li, lane, vel, at, lock)` in `app.js` is
  the one path to `pmidi.note`, adding `lane.strokeAt(lock)`; the clock's `play` and `liveHit` (Move pads and computer
  keys while recording, and every pad tap) both use it, `liveHit` with its own lock (null, or `{ tune }` from the pitch
  pads). Page (5400/9400, silent; Afro, djembe lane 5 at color 0.5, agogo lane 4 at 0.7): `liveHit` stopped sends 50 and
  47 (was 46 and 39), armed and playing the pad sends 50 and its recorded step plays back on 50.
- **Quick SHOULDs done.** At the top of the note range the strokes take the next free notes down instead of piling on
  127 (`strokeNotes`): lanes 125 and 127 → [125, 126, 124] and [127, 123, 122], lanes 120–127 → 18 different notes
  (verifier, architect). The `ARTICS` comment points to `strokeNotes` (architect). The synth shekere's palm thump +3 dB
  (−8 → −5): slap −8.4 / −26.0 against its twin's −6.3 / −26.2 (was ~4–5 dB under), 1.9 dB over the shake (sound). The
  dsp djembe slap trimmed ~1 dB (body 0.9 → 0.8, crack 1.1 → 1.0): −5.9 / −25.6 / 7.4 %, 1 dB over the kick's peak; the
  2 dB the sound engineer suggested put its 50 ms loudness 6.5 dB under the conga, outside the phase's own level window
  (the "ORBIT2-08 L4" test caught it) (sound).
- Not changed: `strokeNotes` rebuilt for every live note (~0.9 µs) and `strokeAt` run twice per hit (harmless, measured
  by the architect); → [[BACKLOG]] Later: a pure `strokes.js`, the synth slap crack at the default lane tone, the synth
  agogo's clang.
- Tests (153 + 9; 1 new, fails on `ba46a18`): "ORBIT2-08 r2": `app.js` has exactly one `pmidi.note` call, it adds
  `strokeAt(lock)`, `liveHit` sends through it with its lock; a pad's `{ tune }` lock plays (and sends) the color's
  stroke, 50 on the Afro djembe. "ORBIT2-08 r1" now also covers the top of the range (126 → 127, 125; 125 and 127; six
  lanes 120–127 all different). `npm run check` clean, `npm test` 153 + 9, `node tools/smoke.mjs http://localhost:5400`
  10/10 ok (serve.py 5400 + headless Chrome 9222, both stopped). Browser (5400/9400, silent, `/tmp/orbit2-impl/`,
  deleted): the `liveHit` repro above (46 / 39 on `ba46a18`), the stroke measurements of round 1 again (slaps, shekere,
  agogo unchanged but for the two trims; Afro and Jungle stems in both engines unchanged, raw mix peaks −4.0 / −1.7 /
  −6.6 / −5.5 dBFS), 0 page errors.

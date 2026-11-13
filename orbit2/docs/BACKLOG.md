---
type: backlog
title: Orbit2 backlog (producer + UX panel, 2026-11-06)
tags: [orbit2, backlog]
---

# Orbit2 backlog

From the 2026-11-06 panel review of Orbits (Kai, Maya, Dex, Ines, Tomi, Greta, Rio; see [[REVIEW-PANEL]]). File and
line references point at `orbit2/` (identical to `src/poly/` at the time of the copy). Each id is owned by one
playbook phase (`.maestro/playbooks/2026-11-06-Orbit2-Lab/ORBIT2-NN.md`).

## B · Bugs (phase 01)

- **B1 swing on odd lengths.** `Lane.at()` swings by the visible step index `i % 2` (`lanes.js` ~75), so lanes of
  length 3/5/7 swing downbeats on alternate loops. Swing must follow the absolute step parity (`step % 2`), in live
  play, WAV and MIDI (all go through `expandHits`). Also the swing tooltip (`INFO.swing` in `app.js`) says "50%+ =
  triplet-ish": exact triplet swing is 33 %, 50 % is a dotted-16th feel. (Ines, Tomi) ✅ ORBIT2-01
- **B2 lane 4 voice 'perc' does not exist.** `LANE_NAMES` defaults lane 4 to `perc`, `VOICES.perc` is missing, so
  `buildVoice` falls back to the kick and the voice select shows blank. Default lanes must use real voices (the Common
  kit's). Migrate saved data that has `voice: 'perc'`. (Rio) ✅ ORBIT2-01
- **B3 kit readout vs select.** After init the readout says `kit custom` while the select shows "Common", and picking
  Common again fires no change. Show the real state (a "custom" entry, or blank) and let re-picking re-apply. (Maya, Greta) ✅ ORBIT2-01
- **B4 'cycle' ignores trig conditions and dice repeat.** `cycleSteps()` (`lanes.js` ~108) uses only lengths ×
  ratios; a step with condition `1:3` makes the true period 3× longer, and locked dice with repeat N multiply too.
  Affects the "full cycle" slot switch, the cycle export, the readout and the alignment bloom. (Ines) ✅ ORBIT2-01
- **B5 exports disagree.** WAV, stems and MIDI of the same pattern each roll `Math.random` (probability, humanize),
  so they contain different hits. One export action must use one hit list; when dice are free, roll once and reuse it
  across WAV/stems/MIDI made from the same "take" (e.g. an "export all" or a per-render seed shown in the status). (Dex) ✅ ORBIT2-01
- **B6 live record drops velocity.** `liveHit` plays at pad velocity but writes only hits/accents; ghost notes come
  back at 0.7. Write a `vel` lock for non-accent hits. (Dex) ✅ ORBIT2-01
- **B7 loaded samples are cut short.** `assignSample` keeps the lane's previous decay, so a slice plays ~25–35 %.
  On load set decay so the whole sample plays, and make the top of the decay knob mean "whole sample". (Dex) ✅ ORBIT2-01
- **B8 hotkeys fire while a control is focused.** Space starts play instead of toggling a focused `<summary>`/button;
  letter keys toggle steps while a button has focus. Ignore global hotkeys when focus is on an interactive element
  other than the canvas/body. (Greta) ✅ ORBIT2-01
- **B9 MIDI clock-in tempo flaps.** `midiio.js` rounds the incoming bpm, `applyTempo` rounds again → at 127.5 bpm
  with ±1 ms jitter: 767 tempo changes in 64 beats, each `retime()` ramps tempo and jumps the delay; `retime()` also
  fights the phase-lock trim. Keep a float, smooth with hysteresis, retime only on real changes, don't fight the lock.
  (Kai) ✅ ORBIT2-01
- **B10 audio-callback work.** `loadSlot` and `evolveNow` run `sync()` (DOM rebuild, JSON, localStorage, undo commit)
  inside the Tone.Loop callback. Defer UI/persistence work to `T.getDraw().schedule` / a microtask. (Kai) ✅ ORBIT2-01
- **B11 mutes pollute undo.** Muting is recorded in history, so Undo after a mute undoes the mute instead of the last
  edit. Keep mute/solo out of `hist`. (Kai) ✅ ORBIT2-01
- **B12 readout is aria-live and too chatty.** 5 arrow presses on a knob = 5 re-reads of ~400 chars. Remove aria-live
  from the readout; announce only the changed value. (Greta) ✅ ORBIT2-01

## F · First visit & musical randomize (phase 02)

- **F1 starter grooves.** One-tap presets that load pattern + kit + tempo + swing: lo-fi boom bap, trap, house,
  techno, DnB, afro (3-2 clave / bell), and a "3 vs 4 vs 5" polyrhythm demo that blooms within 2 bars. (Maya, Rio) ✅ ORBIT2-02
- **F2 first visit plays something good.** `initPattern()` runs on every visit (one lonely kick). First visit: load a
  curated demo, pulse play. (Maya, Rio) ✅ ORBIT2-02
- **F3 continue last beat.** Returning visit: keep the last pattern, with a small "welcome back · keep jamming / start
  fresh" choice instead of the invisible "one undo away". (Maya, Rio) ✅ ORBIT2-02
- **F4 musical randomize.** Groove families (tresillo, 3-2 clave, 4 vs 3, 5 over 4, four-on-the-floor, boom bap):
  kick anchored on 1, snare on 2 & 4 where the family wants it, lengths 4/8/16 (or the family's), cycle capped at 16
  bars; keep the current "wild" randomize as a second option. Toast the family name. (Maya, Rio) ✅ ORBIT2-02
- **F5 alignment countdown.** Show "aligns in N bars" near the core so the bloom becomes an anticipated payoff. (Rio) ✅ ORBIT2-02

## T · Touch & accessibility (phase 03)

- **T1 everything reachable by touch.** Long-press replaces Shift/Alt/Cmd/right-click: steps (tap cycles off → on →
  accent, long-press opens locks/condition), slots (long-press menu: save / add to chain / erase). (Maya, Greta, Rio) ✅ ORBIT2-03
- **T2 step cells are buttons.** Real `<button aria-pressed>`, keyboard reachable, ≥32 px desktop, ≥44 px touch. (Greta, Rio) ✅ ORBIT2-03
- **T3 gauges are sliders.** `gauge.js`: `role="slider"`, `aria-valuenow/min/max/valuetext`, short `aria-label`,
  visible 2 px focus ring like buttons. (Greta) ✅ ORBIT2-03
- **T4 lane tabs semantics.** `role="tab"` + `aria-selected` + arrow keys, or plain buttons with `aria-pressed`. (Greta) ✅ ORBIT2-03
- **T5 playhead on the step strip.** Highlight the sounding step of the selected lane while playing. (Greta) ✅ ORBIT2-03
- **T6 Move UI only when it can work.** Hide Connect/Disconnect where `navigator.requestMIDIAccess` is missing (iOS);
  one toggle button instead of Connect + disabled Disconnect. (Greta, Rio) ✅ ORBIT2-03
- **T7 opaque popovers + sizes.** Move-controls popover gets a solid background; labels ≥11 px in the body font,
  drawer headers/buttons ≥32 px (44 px touch). (Greta) ✅ ORBIT2-03

## C · Calmer screen (phase 04)

- **C1 transport strip.** Play, tempo (with tap), undo/redo, fill, jam in one strip at the top; play in the thumb zone
  on phones. (Greta, Rio) ✅ ORBIT2-04
- **C2 one-line readout.** Tempo, play state, slot, rec, evolve. Per-lane rows + sound row move to a collapsible "nerd
  stats" panel (they duplicate the knobs). Readout must not overlap rings. (Greta, Rio) ✅ ORBIT2-04
- **C3 less help text.** Headers are nouns ("Lane 1 · kick"); Move shortcuts only in the Move panel; mouse tricks in
  tooltips or one help overlay. Remove the "what each parameter does" table (tooltips cover it). (Greta) ✅ ORBIT2-04
- **C4 hide diagnostics.** Stress meter behind a debug flag (`?debug`), engine switch (synth/dsp) into a settings
  drawer, "reset phase" + "tap tempo" off the top level. (Greta) ✅ ORBIT2-04
- **C5 focus mode.** Key F hides all HUD; drawers default closed except the lane drawer; ring labels in a fixed
  legend instead of on the rings. (Greta, Rio) ✅ ORBIT2-04

## G · Groove & dynamics (phase 05)

- **G1 per-step nudge lock** (−50…+50 % of a step) in `LOCK_KEYS`, applied in `expandHits`; hold step + knob. (Tomi, Ines) ✅ ORBIT2-05
- **G2 lane push/pull offset** in ms (−30…+30), per lane. (Tomi) ✅ ORBIT2-05
- **G3 velocity humanize** amount (global or per lane), seeded by dice when locked. (Tomi, Dex) ✅ ORBIT2-05
- **G4 ghost / normal / accent tiers**: step tap cycles through three velocities on a lane; Move pad velocity maps to
  tier when recording. (Tomi, Dex) ✅ ORBIT2-05
- **G5 velocity shapes timbre**: lower velocity = darker/shorter (tone, snap, decay) per voice, in both engines. (Dex, Ines) ✅ ORBIT2-05
- **G6 swing templates**: straight, MPC 16th, triplet (33 %), 3-3-2, Amapiano shaker (e/a different), aksak. (Ines, Tomi) ✅ ORBIT2-05

## R · Clock resolution & meter (phase 06)

- **R1 finer master clock** (e.g. 840 PPQ internal; MIDI clock out every 35th tick, clock in scaled) so 5- and
  7-tuplets are exact. Keep tick-derived positions. (Ines) ✅ ORBIT2-06
- **R2 more ratios**: ×6 (16th triplets), ×4/3 (hemiola), ×5/4, ×5, ×7/4, ×3/2 kept. (Tomi, Ines) ✅ ORBIT2-06
- **R3 time signature**: bar length setting (4/4, 3/4, 6/8, 7/8, 5/4, 12/8) used by bar-quantized switching, chains,
  evolve-every, jam, exports, ACID beats. (Tomi) ✅ ORBIT2-06
- **R4 stable loop counter**: conditions count loops per lane as they happen (length changes don't jump the phase), or
  offer global-bar conditions; add PRE / NEI (previous condition passed / failed). (Ines) ✅ ORBIT2-06

## L · Longer patterns, more parts, new voices (phases 07, 08)

- **L1 32 steps per lane** (pages on screen and on the Move pads/step buttons). (Tomi, Kai) ✅ ORBIT2-07
- **L2 more lanes**: 6 (or 8) lanes, Move mapping and scene adapted. (Tomi) ✅ ORBIT2-07
- **L3 per-step alt voice** / articulation lock (open/mute/slap for conga etc.). (Tomi) ✅ ORBIT2-08
- **L4 new voices** (both engines where possible): shekere, agogo / gankogui bell, djembe, log drum (sub with pitch
  glide), plus a "Jungle" kit and an "Afro" kit. (Tomi, Dex) ✅ ORBIT2-08
- **L5 pads cover all 16 steps**: page toggle or fold, playhead visible on pads for steps 9–16. (Kai) ✅ ORBIT2-07

## S · Samples & breaks (phase 09)

- **S1 slice per step**: a lane can hold a slice set; `slice` step lock; tap = slice N; Move: hold step + knob. (Dex) ✅ ORBIT2-09
- **S2 Unassembler sends 16 slices** (not hard-coded 8) and can send all to ONE lane as a slice set. (Dex) ✅ ORBIT2-09
- **S3 sample start/end/reverse** per lane (and per step via locks). (Dex) ✅ ORBIT2-09

## E · Export for producers (phase 10)

- **E1 24-bit and 32-bit float WAV**, sample rate 44.1/48 kHz choice. (Dex, Sofia) ✅ ORBIT2-10
- **E2 dry stems + FX return**: stems without the delay plus a 5th "delay return" stem; option to bake or not. (Dex) ✅ ORBIT2-10
- **E3 Drum-Rack MIDI**: one merged track option (notes per lane on 36/38/42/39…), plus the per-lane tracks. (Dex) ✅ ORBIT2-10
- **E4 kit export**: one-shot WAV of each lane's sound (with its settings) to load into Simpler/Drum Rack. (Dex) ✅ ORBIT2-10
- **E5 export all**: WAV + stems + MIDI from ONE hit list in one zip (see B5). (Dex) ✅ ORBIT2-10
- **E6 smpl chunk** (loop points) next to `acid`; optional ring-out file for jam takes. (producer review) ✅ ORBIT2-10

## P · Live performance (phase 11)

- **P1 safe Move live mode**: pads play sounds only (with velocity) unless Record; Capture (randomize all) and Delete
  (clear lane) need Shift or a hold; destructive actions confirmable. (Kai) ✅ ORBIT2-11
- **P2 one-gesture mutes**: hold Mute + track button / pad row mutes that lane without changing selection; "mute on
  next bar" option. (Kai) ✅ ORBIT2-11
- **P3 fill latch**: Shift + Layout = fill for the next bar. (Kai) ✅ ORBIT2-11
- **P4 slot change restarts lanes** at step 1 (option, default on): per-slot start tick subtracted in `Lane.at()`;
  `first` conditions fire again. (Kai) ✅ ORBIT2-11
- **P5 MIDI out latency offset** (± ms for notes and clock), using `outputLatency` as the default. (Kai) ✅ ORBIT2-11
- **P6 master performance FX**: HP/LP filter on the wheel (Shift+wheel = humanize), momentary delay throw. (Kai) ✅ ORBIT2-11
- **P7 conditions visible without the screen**: step buttons light per condition while holding a step. (Kai) ✅ ORBIT2-11

## V · Generative & visual structure (phases 12, 13)

- **V1 steerable evolve**: per-kind weights, "gravity" toward home instead of the hard reset, max cycle bars, keep
  hand edits (euclid lanes don't overwrite), move locks/conditions with their hits. (Ines) ✅ ORBIT2-12
- **V2 cross-lane coupling**: a hit on lane A raises probability on lane B (energy like `chaos/field.js`). (Ines) ✅ ORBIT2-12
- **V3 euclid as a mask**: AND / XOR / replace with the hand pattern. Document `euclid(5,8)` vs Bjorklund. (Ines) ✅ ORBIT2-12
- **V4 ratchet curves**: speed-up / slow-down spacing, pitch ramp, up to ×8. (Ines) ✅ ORBIT2-12
- **V5 timbre modulation**: per-lane slow modulator (tone/color over N loops or the cycle); seeded timbre dice with a
  range; scale-snapped tune option for pitched voices. (Ines) ✅ ORBIT2-12
- **V6 show what didn't play**: ghost flash on steps skipped by probability/condition/dice; planet opacity by
  probability (incl. prob locks); condition halo as `b` arcs with the active one lit; outer arc for position in the
  full cycle. (Ines) ✅ ORBIT2-13

## I · Interactive canvas, sharing, learning (phases 14, 15, 16)

- **I1 the orbit is the instrument**: tap a step tick to add a planet (pop + sound), tap a planet: on → accent → off,
  drag along a ring to rotate, pull a ring in/out to change length, long-press a planet = radial lock menu. (Rio) ✅ ORBIT2-14
- **I2 share up front**: share button in the transport; opening a link shows a full-screen "▶ tap to hear this orbit"
  card, then Remix; status is visible (not in a closed drawer). (Rio, Maya) ✅ ORBIT2-15
- **I3 one-tap share of audio**: render 4 bars and open the OS share sheet (`navigator.share` with a file) where
  available, download otherwise. (Maya) ✅ ORBIT2-15
- **I4 library as a gallery**: thumbnails of each setup's ring polygons. (Rio) ✅ ORBIT2-15
- **I5 Seed of the Day**: a daily dice seed → same starting constellation for everyone; 16 bars to make it yours; an
  "orbit postcard" (WebM of canvas + audio via `captureStream`) with a remix link that keeps lineage. (Rio) ✅ ORBIT2-15
- **I6 quests & progressive disclosure**: "make 3 against 4", "rotate the snare onto 2 & 4", "let it evolve 8 bars";
  badges; advanced drawers unlock as you go (never hidden from power users: a "show everything" switch). (Rio, Maya) ✅ ORBIT2-16
- **I7 simple mode / plain words**: "hits" not "euclid hits", "shift" not "rotation"; advanced controls tucked behind
  "advanced". (Maya) ✅ ORBIT2-16

## A · Parameter automation (phase 18)

Added 2026-11-06 by the conductor: "record an automation on a parameter, e.g. a change in decay, that gets rooted in the
pattern". Design first: `orbit2/docs/design/automation.md`.

- **A1 step automation**: turning a knob while recording writes its value as step locks on every step of the selected
  lane that plays during the gesture (decay, snap, color, tune, vel, prob, nudge, slice, stroke…), Elektron-style.
- **A2 smooth automation**: a per-lane curve for parameters that sound continuous (tone filter, drive, pan, send, level,
  master filter), recorded in real time and replayed as audio-param ramps.
- **A3 recording modes**: arm, touch / latch, the hand overrides playback while touching, one undo step per gesture.
- **A4 see and clear it**: "A" mark on automated gauges, a curve strip with the playhead, gauges moving on playback;
  clear one parameter / the lane.
- **A5 everywhere it plays**: live, WAV / stems / jam renders identical to live, slots and chains, share links.
- **A6 Move gestures**: encoder touch (notes 0–8) starts and ends a gesture; documented in the Move panel.
- **A7 MIDI export**: step automation as per-note values / CC, smooth automation as CC curves (CC per parameter,
  editable).

## Deferred

(In-scope MUST-FIX items the whole panel agreed to move to a follow-up playbook, see [[REVIEW-PANEL]] "Motion to
defer". Each links its `ORBIT2-NN-FOLLOWUP` playbook.)

## Later

(Reviewers' non-blocking SHOULD items that were not done land here, with the phase that raised them.)

- **dsp engine voice levels** (ORBIT2-02, sound): at the same settings the dsp engine plays several voices far louder
  than synth (open hat +16 dB, ride +13, shaker +14, crackle +21, clap +8, wood +7.5), so the starter grooves,
  balanced on the default synth engine, have bright lanes up to 5 LU over the kick on dsp. Calibrate a per-voice trim
  in `dsp-voices.js` against the synth engine (render each voice at the default sound, BS.1770), so A/B compares
  sound, not level.
- **Loudness target** (ORBIT2-02, maya): balanced grooves play at −24…−26 LUFS with peaks of −5 to −9 dBFS; a master
  make-up / loudness target could use that headroom (all patterns, not only grooves).
- **Musical randomize with locked dice + humanize** (ORBIT2-02, verifier): the 16-bar cap checks `cycleTicks()` without
  the dice repeat, so repeat 4 can make five over four 20 bars long.
- **Groove data** (ORBIT2-02, architect, verifier): `GROOVES[i].swing` (the spec's swing template) duplicates the lanes'
  own swing and nothing reads it; `kit` is read by tests only. `MUSICAL_FAMILIES` is music data inside the model file
  (could live next to the grooves). Wild randomize is not on the Move.
- **Which groove is loaded** (ORBIT2-02, maya, greta): no chip shows it, and the kit select says "custom" for every
  groove (they patch their kits).
- **Who gets the demo** (ORBIT2-02, maya): someone who opened the page once without pressing play comes back to
  "welcome back"; visitors from before this phase never hear the demo.
- **Countdown** (ORBIT2-02, rio, greta): on a phone the two-line pill is as wide as the kick ring; the countdown lives
  only on the canvas (not in the readout or the accessibility tree).
- **First-visit screen** (ORBIT2-02, sound, greta): "Connect Move" has the same bright fill as the pulsing play right
  above it; play is the 36th tab stop; the toast is bottom-centre, far from randomize on desktop; "3 vs 4 vs 5" sits
  alone on the second chip line on desktop.
- **Groove taste** (ORBIT2-02, tomi, rio): an afro variant with a 12/8 clave against the bell (the binary clave's "and"
  of 2 falls between bell strokes); more dynamics (open / slap / ghost congas, `fade` on rolls); the demo's 4 and 5
  rings play one hit each.
- **Synth kicks with a click layer** (ORBIT2-02, sound; outside phase 02): `kick` / `kick909` renders end in a hard
  waveform cut at the end of the click layer (+9–24 ms after the hit), one tick per loop in a DAW; pink-noise voices
  (clap, shaker) carry sub energy a 150 Hz high-pass would remove.
- **B9 follower after a ramp** (found during ORBIT2-02's pre-check, for ORBIT2-01's pass): when a tempo ramp ends the
  follower overshoots by 1.3–2.2 bpm for about a beat (the quadratic fit extrapolated).
- **First Tab stop** (ORBIT2-01, kai): from a cold page the first Tab lands on the "MIDI Warz" home link in the header,
  one wasted press before the first control when playing without looking (see also "play is the 36th tab stop").
- **Keyboard route to step locks and the slot menu on a Mac** (ORBIT2-03, verifier, architect): Mac keyboards have no
  menu key and Chrome on macOS ignores Shift+F10, so a keyboard-only user needs Alt+Enter (locks) or Shift+Enter (save)
  there (VoiceOver's VO+Shift+M sends contextmenu, which works). Ideas: a visible "⋯" next to the strip and the slot
  grid, or Enter held.
- **Steps outside the loop** (ORBIT2-03, architect, rio): at length 4 the strip holds twelve disabled "outside the
  loop" buttons: noise for a screen reader listing buttons (architect), yet Tab never reaches them (rio). Pick one:
  hide them from the tree and say "4 of 16 steps" on the strip, or keep them reachable.
- **Readout font** (ORBIT2-03, verifier): the readout is the last small text in Major Mono (11 px decorative status);
  phase 04's calmer screen decides its fate.
- **Chain of one** (ORBIT2-03, verifier; pre-existing): "add to chain" on the playing slot with no chain makes
  "chain 3 → 3".
- **One step rule everywhere** (ORBIT2-03, sound): the screen's tap cycles off → on → accent, while the Move's pads and
  step buttons and the computer keys still toggle, with Shift for accent.
- **Cold master on export** (ORBIT2-03, sound; pre-existing, phase 10): the first hit of a WAV export is ~5 dB low
  (mix −19.7 dBFS vs −14.6 for the next identical kicks, raw stems flat): the master compressor starts cold and
  `LEAD_IN` (0.05 s) is shorter than its release. Pre-roll the master and cut it. ✅ ORBIT2-05 round 2 (a nudged
  downbeat rendered 10 ms in came out 13 dB low): renders start `PRE_ROLL` (0.5 s) before the earliest hit.
- **Slot buttons on a phone** (ORBIT2-03, rio, architect): 39 × 44 px (T7 asks 44 px tall); 44 wide needs 4 slots in
  a row.
- **Visuals lead the sound by the output latency** (ORBIT2-03 round 2, sound): the step playhead, the orbit visuals
  and the Move LEDs are drawn at a step's audio time (`T.getDraw().schedule(…, time)` in `onTick`), which is
  `outputLatency` before you hear it (`heardTick()` already subtracts it); on Bluetooth (150–250 ms) the lit step
  visibly leads the sound, and swung / humanized hits light at the unswung time. One place to change for all of them
  (`time + outputLatency`); headless Chrome reports no `outputLatency`, so check it on real outputs.
- **Accent on hat and wood** (ORBIT2-03 round 2, sound; pre-existing, phase 08): accent − on is +3 dB for kick and
  snare but +0.3 dB peak for the hat (the ranges overlap) and +1.5 dB for wood, so there the screen's second tap
  (accent) sounds like the first.
- **A Move that never answers** (ORBIT2-03 round 2, architect; pre-existing, movewire): "Connecting…" lasts ~4.7 s
  (3 × 1.5 s identity waits), then the page says "Move: ready" and "Disconnect Move" with no firmware, because
  movewire counts no reply as control mode (`inControl = mode === null`, `movewire/src/device.js:39`).
- **Target floor specificity** (ORBIT2-03, architect): `body:has(#hud-left) button:not(.st)` is (1,1,2) and beats
  component rules (it took `.lane-tab` from 36 to 32 px on desktop); a `:where()` floor lets components win but then
  each needs its own touch size. Also: a slider's name is the label before " · " (`short()` in `gauge.js`); an
  explicit `name` option would be plainer.
- **One Escape handler** (ORBIT2-04, architect): Esc is handled in three places (blur in the key-ownership block,
  Move popup + focus mode in the layout block, the help's native `<dialog>`); one handler in a stated order (dialog →
  popup → focus mode → give the keys back) would be plainer. The focus-mode `display: none !important` adds to the
  `body:has(#hud-left) #…` specificity fight.
- **A CSS grid stage** (ORBIT2-04, architect): a grid with one observed `#stage` cell would replace most of
  `layoutHud()`'s measuring (columns, legend, stage).
- **Phone header height** (ORBIT2-04, architect): 250 px at 390 × 844 (strip on two rows, Move status, a two-line
  status line), the orbit at y 250–640; tight on a 360 × 640 phone.
- **F is also a pad** (ORBIT2-04, sound, architect): with record not armed plain F is focus mode, so the keyboard can no
  longer place a plain hit on lane 2 step 4 (Shift+F accents it; a click, its step button or the Move pad still can). A
  focus key outside the pad rows (e.g. backtick) would keep both; the backlog asked for F.
- **Jam label width** (ORBIT2-04, sound): between ~1101 and 1180 px the longer jam labels ("● jam: next bar…") wrap the
  header (87 → 135 px), so the rings shrink while a take is armed; a fixed width on the jam button or shorter labels.
  At 1280 and 1440 it never wraps.
- **Bit-identical exports** (ORBIT2-04, sound; pre-existing): with dice locked and `Math.random` seeded, two renders of
  the same code differ by 1 LSB in up to 37 of 705,600 samples (~−110 dB); seeded noise everywhere would make A/B
  checks exact.
- **Jam raw-mix headroom** (ORBIT2-04, sound; pre-existing, phase 10): the jam download's raw mix (four lane buses
  summed) peaked at −0.19 dBFS on the demo groove with dsp; a −1 dBFS ceiling or a limiter on that sum.
- **Floating play over content** (ORBIT2-04, greta): at the top of a 390 phone the 76 px play sits over the welcome
  bar's "×" and the "wild" button until you scroll; move the welcome bar, or a ~64 px button. Also (ORBIT2-06, verifier)
  over the right half of the "12/8" meter chip when the Patterns drawer sits near the bottom edge.
- **F on screen** (ORBIT2-04, greta): nothing visible names the F key; "focus mode (F)" on the Settings button would.
- **Status line emphasis** (ORBIT2-04, kai, greta): 11 px Major Mono with wide tracking and the chromatic shadow; the
  live states (queued slot, FILL, rec ●, jam) don't stand out from stage distance: an accent colour or a pill for them,
  or a larger line.
- **Nerd stats below the fold** (ORBIT2-04, greta): at 1280 × 720 the open drawer shows a sliver above "Move" (it
  scrolls).
- **Tempo nudge** (ORBIT2-04, kai): the strip's tempo knob is 92 × 30 px and its arrows step 10 bpm after a Tab (a
  click doesn't focus a knob, by design); a ±1 bpm nudge key or a bigger target for live tempo moves.
- **Undo next to fill** (ORBIT2-04, kai): a stray click on undo mid-set; a gap between undo / redo and fill.
- **Mute in focus mode** (ORBIT2-04, kai; phase 11): focus mode hides the lane drawer, so mutes and solo are Move or
  keyboard only there; a mute key, or legend dots you can tap, would make focus mode playable.
- **Move panel over the rings** (ORBIT2-04, verifier; pre-existing): the open Move popup (`.keys-pop[open]`, up to 560
  px) reaches 171 px into the outer ring at 1440 × 900; it closes on Esc or a click outside. Keep it at the column
  width on wide windows, or move the stage while it's open.
- **Toast over the stage** (ORBIT2-04, verifier; pre-existing): at 1280 × 720 the first-visit toast (x 360–920, y
  640–690) covers the lane drawer's voice select and the outer ring's glow until it fades.
- **Play in focus mode on a touch tablet** (ORBIT2-04, architect): focus mode keeps play only up to 760 px, where it
  floats; a touch tablet at 761–1100 px loses play / stop there and has no Space bar. Float play in focus mode on
  `(pointer: coarse)` too.
- **Split the layout + focus-mode block out of `app.js`** (ORBIT2-04, architect): `app.js` grew by about 60 lines this
  phase (1107 → 1169); `layoutHud()`, the Escape handler and `setFocusMode()` are the natural next module.
- **Swing templates and the beat** (ORBIT2-05, verifier, architect, sound): templates count on the absolute step, so
  on ×3 / ×3/2 lanes triplet, amapiano and aksak move beat downbeats (MPC keeps its beat rule), 3-3-2 delays beat 2 of
  a 16-step ×4 lane, and aksak's period 7 stretches the cycle. Decide per template whether it restarts on the beat or
  the bar (phase 06 owns meters), or label the ones meant for ×4 lanes.
- **Ghost hats are only a little darker** (ORBIT2-05, sound): a hat's whole band sits above the lane low-pass (4.3 kHz
  at tone 0.75), so closing it is a level drop, not a tone change; round 1 cut hats / cymbals / tambourine to a
  fraction of an octave (−3 dB at the ghost tier instead of −16). A real tilt (a high shelf per lane, or the metal
  voices' own resonance) would darken them without the loss. dsp hats darken less than synth ones.
- **Gentler amounts for tonal voices** (ORBIT2-05, sound): 15 voices still use the 2-octave default (tabla, cowbell,
  marimba, bell, kalimba…); at the ghost tier they land between −3.8 dB (synth brush) and +0.3 dB of the plain velocity
  drop, but the tonal ones may want less darkening.
- **Templates at swing 0 %** (ORBIT2-05, dex): a template shapes the swing amount, so picking amapiano or 3-3-2 at 0 %
  sounds straight (the tooltip now says so). Picking a template could offer a starting amount.
- **Live record ignores nudge and push** (ORBIT2-05, dex): `quantize` places a hit by swing only; over a step nudged
  far or a lane pushed 30 ms, a hit near the midpoint can land on the neighbour.
- **Two velocity levels when recording** (ORBIT2-05, tomi; by G4's design): pad velocity snaps to ghost or normal
  (accent above the knob). A "keep velocity" record option would keep a played dynamic curve.
- **Velocity humanize on accents only goes down** (ORBIT2-05, architect, sound): an accent is at 1, so its wobble is
  clamped (mean ~0.95 at 100 %); ghosts and normal hits stay centred.
- **The next slot's early first step** (ORBIT2-05 round 2): at a slot switch or a chain step the outgoing lanes leave
  the steps from the switch on to the incoming slot, whose lanes (and voices) exist only from the bar line. A first
  step nudged earlier than the scheduler's look-ahead (~0.1 s; a push of up to 30 ms fits) sounds as soon as it can,
  late, instead of before the bar line. Deciding it from the queued slot would need that slot's voices early. The other
  way round (round 3, architect): a switch queued after the outgoing lane already sounded an early downbeat (inside its
  early window, up to ½ step + 30 ms + 15 ms before the bar line) keeps that downbeat, and the incoming slot starts
  from its next step, since a moment is started once (both slots with the same nudged step would flam). Starting the
  incoming step anyway when the outgoing early part sounded well before it would keep its downbeat. The same holds for
  the first bar line of a new meter (ORBIT2-06 round 1): the lanes restart on step 1 there, and a step 1 nudged earlier
  than the look-ahead sounds late.
- **One-shot MIDI past the clip end** (ORBIT2-05 round 2, verifier; the old clamp did the same): a note nudged or pushed
  past the end makes that track a little longer than N bars, and not a whole bar.
- **dsp click / glitch peaks** (ORBIT2-05 round 2, sound): a soft click or glitch peaks 1.3–2.3 dB over an unshaped
  one (the low-pass added to an open layer rings a little), while its RMS is lower. glitch keeps a 0.5 dB step just
  under normal velocity from its own burst / crush rounding.
- **One source for the slot-switch rules** (ORBIT2-05 round 3, architect): `SlotBank.due()` and `nextSwitch()` write
  the switch rules twice (a test keeps them in step); derive one from the other before a new mode (P4) has to change
  both. `nextSwitch`'s "now" branch is never reached from the master tick (`due()` takes a "now" slot first).
- **A warm loop WAV** (ORBIT2-05 round 3, sound): the pre-roll is silence, so the master starts relaxed while a real
  loop arrives already compressing: the first copy is still up to ~1 dB off the later ones. A pre-roll that renders the
  pattern's own last bar would match the loop.
- **The dsp ghost clap** (ORBIT2-05 round 3, sound): at 0.35 G5 takes 3.8 dB RMS (5.2 peak) past the plain velocity
  drop, the synth clap ~0.2, so the two engines' ghost claps sit ~3.8 dB apart (inside the documented 4–5 dB).
- **An early first downbeat after Play** (ORBIT2-05 round 3, sound): a downbeat nudged −½ sounds only as early as the
  scheduler's look-ahead (~60 ms) on the first bar after Play, exact from the second. Play it on the grid, or start
  the transport later by the earliest lead. The reset button does the same (round 5, verifier): the first downbeat
  after a reset, nudged −½, sounds 102.9 ms later than its time, ~146 ms after the old bar's early downbeat.
- **One filter per lane** (ORBIT2-05 round 3, sound): a late, darker ratchet repeat also darkens the tail of the plain
  step it overlaps (live and in the WAV alike).
- **Smoke on any debug port** (ORBIT2-05 round 3, sound; a root tool, outside `orbit2/`): `tools/smoke.mjs` connects to
  Chrome on 9222 only, so a reviewer on their own ports can't run it.
- **ACID beats in /8 meters** (ORBIT2-06 round 1, verifier, architect, sound): the tag counts beats in the meter's unit
  (a 7/8 bar = 7) with a quarter-note tempo, so a 1-bar 7/8 file at 120 bpm is 1.75 s while 7 beats at 120 would be
  3.5 s. A DAW that reads the tempo field is fine; one that derives the tempo from beats ÷ length reads 240 bpm. Check in
  Live and Reaper, then keep it, or write the pair in one unit (`withAcid`, `acidOf`).
- **MIDI file resolution** (ORBIT2-06 round 1, sound; phase 10): the SMF writer's 96 PPQ rounds the new tuplets (×5/4
  note-ons at 0 / 77 / 154 / 230 / 307 ticks, exact 76.8·k: up to 2.1 ms at 120 bpm); 840 or 1680 PPQ would carry R1's
  exact timing into the DAW.
- **Renders walk every fine tick** (ORBIT2-06 round 1, architect): `collectHits` steps through all 840 ticks per beat,
  a busy 64-bar render 3.6 → 27 ms; it could jump from one lane step to the next.
- **Pure jam and ACID maths** (ORBIT2-06 round 1, architect): the jam stop rounding and cap and `acidOf` are logic in
  `app.js` without unit tests (the bar anchor moved to `slots.js` `trackBars`, tested).
- **The clock-in trim after lock** (ORBIT2-06 round 1, sound; not checked against the phase start, the trim is
  ORBIT2-01's): after a phase-lock test, `setFollow('off')` left the tempo trimmed (clock out 119.751 bpm).
- **Tie order of rendered hits** (ORBIT2-06 round 2, verifier): `collectHits` sorts by time only, so two hits at the same
  instant (a ratchet repeat and another lane's hit) can come out in another order than at 24 PPQ; the same hits, but a
  digest that compares lists in order changes. Ties by lane would make it stable.
- **Smaller saves** (ORBIT2-07 round 1, architect): `Lane.toJSON` writes 32 entries per step array, so an old pattern's
  share link grows 642 → 667 characters and slots and undo steps grow alike; writing steps 17–32 only when one is used
  would keep old saves byte for byte. Mind that `toJSON` hands out the live arrays: `evoSnap = m.toJSON()` shares `hits`
  with the lanes, so evolve's hit toggles (and hand edits) also change the home snapshot until the first way home
  (pre-existing; phase 12 owns hand edits against home), and a copying `toJSON` changes that too.
- **The pad window and the track buttons** (ORBIT2-07 round 1, kai): with lanes 3–6 on the pads, Track 1–4 still mean
  lanes 4–1, so the rows and the track buttons no longer line up, and no LED says which window is showing.
- **Page LEDs** (ORBIT2-07 round 1, kai): Back + ◀ ▶ steps the pad page by 8 while the step buttons show 16 (pad pages 1
  and 2 give the same step page); the Back LED says "pinned", not which page; in follow mode the pads repaint under the
  fingers at a page turn (a tap hits what is lit; the step buttons keep their page while one is held).
- **Lanes 5–6 in the musical families** (ORBIT2-07 round 1, tomi): randomize gives lanes 5–6 the same part in every
  family (an offbeat open sound, a cymbal every two bars); Afro, Amapiano and Latin want a shaker, bell or conga line
  there (phase 12, or with phase 08's voices).
- **A "bar 2" mark** (ORBIT2-07 round 1, tomi): nothing marks the second row of 16 on the strip as the second bar.
- **Hidden hits past a shortened length** (ORBIT2-07 round 1, tomi; pre-existing): 32 → 24 steps keeps the hits on
  25–32 out of sight, and they come back when the length grows.
- **Six lanes on a phone** (ORBIT2-07 round 1, sound): headless headroom 72–74 ms with six busy lanes (76.5 with four);
  check the stress meter on a real phone.
- **The jam's six inputs** (ORBIT2-07 round 1, architect): the recorder always copies six stereo inputs, two of them
  silent on a four-lane take (cheap).
- **The Latin shaker** (ORBIT2-07 round 1, sound): even at level 0.85 the lane-5 shaker is the Latin kit's quietest lane
  (stems RMS about −59 dB against −32…−45): the voice itself is quiet (phase 08 voices).
- **A held step and the selected lane** (ORBIT2-07 round 2, architect; so at the phase start too): a Move step button
  held while another lane gets selected (a pad, a track button) edits the newly selected lane's step on the knobs and
  on release, while the step buttons keep the old lane's page; keeping the lane in the held entry (`pages.js`) would
  pin the hold to the lane it went down on.
- **A stroke lock across voices** (ORBIT2-08 round 1, architect, verifier): an `artic` lock is an index, so when the lane
  changes voice or kit a conga mute becomes a hat's open stroke, an agogo high or a shekere slap (Afro → Jungle turns
  lane 3's shekere slaps into open hats); on a voice without that stroke it plays the lane sound, the lock panel says
  "stroke (not on kick)" and only "clear" (all the step's locks) removes it. Storing the stroke's name, or honouring it
  only on a voice with the same stroke, would keep its meaning.
- **One stroke table** (ORBIT2-08 round 1, architect): the conga / bongo strokes (pitch step, decay, velocity) are
  written in both engines, like every voice; a shared per-voice table would hold them once.
- **Strokes that cut each other on the dsp engine** (ORBIT2-08 round 1, architect): dsp lanes are polyphonic, so a closed
  hat after an open one (or a mute after an open conga) leaves the earlier stroke ringing (tail −67.7 / −90.5 dB at the
  default decay), where Tone's mono voices cut it. A lane choking its own previous stroke would match a real drum.
- **GM notes for strokes** (ORBIT2-08 round 1, architect, dex; phase 10, E3): strokes go on the next free notes (a hat
  on lane 3 opens on 44, GM's pedal hat), and an open hat doesn't choke the closed one in Live without a choke group; a
  Drum-Rack map could put strokes on GM notes (open hat 46, mute / open hi conga 62 / 63) and say so.
- **Synth levels in the new kits** (ORBIT2-08 round 1, sound, verifier; the ORBIT2-02 "dsp engine voice levels" gap): in
  the synth engine the Afro open hat sits ~22 LU under the kick (dsp ~10), the Jungle snare ~11 LU under the kick909
  (dsp ~1) and its ride / open hat / crash 20–24 LU under; Jungle is the quietest kit at the master. A kit level can't
  fix one engine without the other; the per-voice trim can.
- **Synth shekere retrigger** (ORBIT2-08 round 1, sound): a second synth shekere 90 ms into the first peaked 3.6 dB over
  it (Tone's mono NoiseSynth restarts mid-burst; measured before round 1 made it white noise), the dsp's two hits alike.
- **Log drum pitch** (ORBIT2-08 round 1, sound): it sits on E2 (82.4 Hz) at tune 0; an Amapiano log drum often sits
  lower (round 1 made the glide deeper: an octave at color 1).
- **A closed hat on a long lane** (ORBIT2-08 round 1, tomi): "closed" is the lane's own hat, so a hat lane with a long
  decay isn't closed; a closed stroke that caps the decay would change every unlocked hat.
- **The djembe in a 4-lane Afro pattern** (ORBIT2-08 round 1, tomi): the Afro kit's djembe and open hat are lanes 5–6, so
  a 4-lane pattern has kick, log drum, shekere and agogo only.
- **A pure strokes module** (ORBIT2-08 round 2, architect): `ARTICS`, `articAt`, `strokeOf` live in `voices.js` (the Tone
  voice module), so `dsp-voices.js` imports it, and `export.js` imports `midiio.js` for `strokeNotes`; a small pure
  `strokes.js` with the four would keep the boundaries clean. `strokeNotes` is also rebuilt for every live note (~0.9 µs)
  and `strokeAt` runs twice per hit (harmless).
- **The synth slap crack at the default lane tone** (ORBIT2-08 round 2, sound): the high-passed white-noise crack sits
  partly above the lane's 4.3 kHz low-pass at the default tone, so the synth bongo / djembe slaps carry 5.2 / 3.4 % of
  their energy above 2 kHz against the dsp twins' 10.5 / 5.3 %; a band-passed crack around 2.5–3.5 kHz would survive it.
- **A live-out test that plays** (ORBIT2-08 round 3, verifier): "ORBIT2-08 r2" checks `app.js`'s text (one `pmidi.note`
  call, `liveHit` through `midiHit`), so a harmless refactor breaks it and it never runs `liveHit`; a browser-level test
  driving `liveHit` with a fake MIDI out (or `liveHit`'s note logic moved somewhere pure) would be sturdier.
- **The synth agogo's clang** (ORBIT2-08 round 2, sound): it has its dsp twin's level but almost no metal (0.1 % above
  2 kHz, centroid 643 / 965 Hz, against 44 % and 1.7 / 2.3 kHz); an inharmonic partial or a higher modulation index.
- **Sample audio is never deleted** (ORBIT2-09 round 1, verifier, architect): every break file, "all to this lane" or
  re-cut writes N new IndexedDB records (17 → 49 after two re-cuts of one break, ~6 MB a 16 s stereo break), and
  nothing removes `orbits-*` ids no pattern, undo step, slot or library setup refers to any more (single samples never
  were either); a sweep of unreferenced ids, or ids by content.
- **Slice sets in share links** (ORBIT2-09 round 1, verifier, architect; phase 15): links carry no samples, so a slice
  lane opens as the drum it replaced, its slice / start / end / direction locks inert; the link could say so on open,
  or carry a small set. ORBIT2-15 round 1 (dex): the I2 card says only "N bpm · N rings"; it could also say a lane
  played a sample (the sender's page knows it when it encodes), and that the beat has ghost notes, chance or 32 steps.
- **`hitSound`'s positional parameters** (ORBIT2-09 round 1, architect): seven, and a missing slice means slice 1 (how
  `liveHit` slipped through); an options object, or the hit itself.
- **Tempo from the break** (ORBIT2-09 round 1, sound): a break at another tempo than the page's leaves a gap after each
  slice (a 120 bpm break at 100 bpm: 25 ms) or overlaps them; an option on load: tempo = 60 × beats / length, the break
  taken as 1, 2 or 4 bars.
- **Mono slice lanes** (ORBIT2-09 round 1, sound): a slice rings on under the next when steps come faster than the
  slices (a faster tempo, ratchets); a mode where each hit cuts the lane's last one with a 1–2 ms fade, like Simpler or
  an MPC in mono.
- **Sample gain staging** (ORBIT2-09 round 1, sound; from before the phase): a slice comes out ~12 dB under its source
  in the raw stem (velocity 0.7, the −3 dB pan law, lane level 0.66² × 1.2); a −1 dBFS break bounces at −15.4 dBFS peak
  after the master.
- **The sender port needs the shipped reader** (ORBIT2-09 round 1, architect; the port-back): the v2 payload shares the
  `unasm-slices` key, and the shipped Orbits reads only v1; port `src/unasm/app.js` together with the shipped reader, or
  send both formats.
- **Breaks on a phone** (ORBIT2-09 round 1, maya; phases 14, 16): "break file…", the 8 / 16 choice and the slice picker
  sit deep in the lane drawer, and nothing near the ring says a break can go there.
- **One limit for slices** (ORBIT2-09 round 1, architect): 16 is `MAX_SLICES` in `lanes.js` and `MAX_HANDOFF` in
  `samples.js` (and the 16 s break cap sits in `app.js`); one constant means one module importing the other for a
  number.
- **Humanize on a laid-out break** (ORBIT2-09 round 2, sound): `layBreak` zeroes the lane's own push and velocity
  humanize, but the global humanize still moves every slice, which brings the holes back between slices (a tone in
  order at 30 %: joins down to silence, up to 8.5 ms under −6 dB); exempt slice lanes from timing humanize, or say so.
- **Uneven slices laid out on their own 16ths** (ORBIT2-09 round 2, sound): a v2 hand-off cut at onsets gets one equal
  step a slice (9 slices of a 2 s bar → 9 steps at ×2: gaps after short slices, overlaps after long ones); each slice
  could go on the 16th where it starts. Nothing sends one yet (the sender sends v1, a break file is cut equal).
- **One buffer a slice set** (ORBIT2-09 round 2, architect): a 16-slice set keeps 32 buffers in the page (its slices and
  their padded copies), 48 when something plays backwards (~18 MB for a 16 s stereo 48 kHz break); one break buffer plus
  cut offsets would need no padded copies (one source plays through any cut) and one reversed copy.
- **Dither and one stem headroom** (ORBIT2-10 round 1, sound): 16-bit files are rounded now, not dithered (TPDF would
  decorrelate the error); stems take one peak gain with their raw mix, so the same pattern's stems move with format and
  rate (24-bit −2.19 dB under 32f on hot lanes; boombap's export-all stems −1.27 dB at 48 kHz, 0 at 44.1, noise peaks):
  a fixed headroom (e.g. always −6 dB at 16 / 24-bit) would keep stems of different exports level-matched.
- **Float jam recorder** (ORBIT2-10 round 1, sound, kai; round 2, verifier, sound): jam takes stay 16-bit at the page's
  rate whatever the export format says (the recorder posts Int16; a headless page ran at 24 kHz), and the jam raw mix
  (and its ring-out) is summed with a clamp; a Float32 recorder could write the take in the chosen bits (see also "Jam
  raw-mix headroom").
- **Port back: live chain params at time 0** (ORBIT2-10 round 1; pre-existing in the shipped Orbits): `applySound` set
  level / send / pan / drive with Tone's `.value =`, which Chrome loses on a chain that is silent when it comes due, so a
  lane played its constructor values (send 0.15, level 0.8) until a knob moved while it sounded; orbit2's `holdParam`
  fixes it. An audible change to live play (a send-0.6 lane: ~10 dB more echo than before, now = the export).
- **Jam take edges** (ORBIT2-10 round 2, verifier, sound; round 3, verifier, sound, architect; pre-existing): a take
  ended by stopJam can end up to ~2 ms past its bar line (48023 / 48058 frames for 2 bars at 24 kHz: the clock's bar-line
  time itself), and a hit played early across a take's start or end leaves part of it there: the next downbeat's first
  ~1 ms at humanize 0.08 (−33 dBFS on boombap), up to 92 ms with a −30 ms push and nudge −½ (the take ends with that hit
  at full level; the ring-out leaves it out as the next bar's and `joinRing` bends the cut away within 2 ms); a downbeat
  before the start begins mid-attack on sample 0. A short fade at the take's edges, or gating each lane's early
  next-bar hit out of the recording, would clean them. Also (round 4): a `start` that reaches the recorder late loses
  the take's first frames (it starts at the current block while `frames` reports the whole take: 95916 frames for 2 bars
  once, with two Chromes running; verifier), and `jam.endTime` is the last end posted, so a big tempo drop while closing
  could post the stop tick's end after the recorder already stopped on stopJam's (a race of a few ms; the recorder's own
  end, start + frames, would decide then; architect, read, not measured). Round 5 (architect): stopJam's estimate of the
  end uses `tickSec()` (from `tempo`) while a MIDI clock's phase lock runs the transport at `tempo × trim` (59.4 ms early
  with a 0.96 trim and ~1.4 s to the line; the clock's end on the stop tick corrects it, but an error over the ~0.1 s
  look-ahead, e.g. a stop 2.5 s or more before the line at a 4 % trim, would let the recorder stop short of the bar line;
  read, not measured): the transport's own bpm in the estimate.
- **A gentler ring-out join on noise** (ORBIT2-10 round 2, sound): `joinRing` bends the ring-out's first 2 ms onto the
  line the take ends on, right for a smooth tail; on a noise tail that line is random (a dsp snare at 24 kHz: +4.9 dB
  for 5 ms over the live continuation; inaudible). A shorter bend or a value-only join on noisy lanes. Also (round 4):
  the crackle's ring-out can open with a dust click far over the take's last 10 ms (−78.3 → −27.0 dBFS: the offline
  dust is not the live dust; verifier), and on the synth engine a take hit due a few ms before the end puts the 2 ms
  bend inside a kick attack (a slope turn at −21.7 dBFS; dsp is smooth; sound).
- **Seeded noise in offline renders** (ORBIT2-10 round 4, sound; pre-existing): the synth noise voices start at random
  points (`Math.random`, 284 calls a render), so two exports of one locked roll differ in the noise (snare up to 9786
  LSB; 9810 at `1005992`), and in export all the mastered mix and the stems carry different noise; seeding the noise
  from the dice seed during offline renders would repeat a locked roll byte for byte. ORBIT2-15 round 1 (sound): two
  renders of the house groove with locked dice differ by a −8.8 dB residual (max 0.39), −9.1 dB at the phase start.
- **A jam module** (ORBIT2-10 round 2, architect): the jam take logic plus `renderRing` is ~110 lines of app.js and
  `jam` grows through `Object.assign`; its own module would shrink app.js and give the wiring unit seams. The same for
  the scheduler (round 4, architect): `onTick` lives in app.js, so its wiring (when each hit's step is due, the early
  parts handed to `pendingSteps`) is checked by regexes on the source; the r4 test replays its sequence over `liveTick`,
  a module would let the real one run in Node.
- **Kit options** (ORBIT2-10 round 1, sound, architect; round 2, sound): one-shots carry the lane's pan (a Drum Rack pad
  usually wants them centred: a "centred" option), kit files are named `orbits-kit-<lane>-<voice>` without the export's
  base, so two kits clash in one DAW folder (the zip's folder has the time), and one hot lane lowers the whole kit (a
  per-lane headroom option).
- **Export-all memory** (ORBIT2-10 round 1, architect; estimated): both renders, the summed mix, the scaled copies, every
  WAV and the zip are alive at once (~2.5–3 GB for a 64-bar cycle of 6 lanes at 60 bpm, 48 kHz, 32f); encoding and
  dropping one stem at a time would cut the peak.
- **Stems routing without a browser** (ORBIT2-10 round 1, architect): the dry + return routing (`routeStems`) is checked
  in the page (dry + return = wet raw mix to 6e-8), not by a unit test; a Tone stub would let one run in Node.
- **Voices that set filters with `.value` in `hit()`** (ORBIT2-10 round 1, implementer; pre-existing): six voices in
  `voices.js` set a filter frequency with `.value =` per hit instead of at the hit's time: offline every hit of a render
  gets the last one's value (all land at time 0), live it lands at now + look-ahead (and, like the chain params before
  `holdParam`, can be lost on a silent chain); `setValueAtTime(v, t)` would put each where its hit is (`voices.js` lines
  45, 50, 52, 59, 117: filter frequencies; 119: an auto-filter's rate).
- **Delay echoes drift one render quantum a repeat** (ORBIT2-11 round 1, sound; the lane delays pre-existing): Chrome
  adds 128 frames inside a feedback cycle, so Tone's `FeedbackDelay` repeats at D, 2D + 2.67 ms, 3D + 5.33 ms … at
  48 kHz (the throw at 100 bpm: the 6th repeat 13 ms late, flamming against the grid; levels exact). A first tap of D
  plus a loop delay of D − 128 / sr would keep every repeat on the grid, for the throw and the lane delays.
- **Performance filter voice** (ORBIT2-11 round 1, sound, kai; taste): Q 0.9 is a +1.9 dB knee (−3 dB at 268 Hz for a
  200 Hz low-pass, 4.6 kHz for a 6 kHz high-pass); 3–6 dB of resonance (or Shift + knob) would make sweeps speak; a
  fully closed low-pass drops the mix ~9 dB (no makeup gain). On the wheel 4 % a click is slow on stage (12–25 clicks
  to a clear sweep): accelerate on fast turns.
- **`heardTick` reads the wrapper's `outputLatency`** (ORBIT2-11 round 1, implementer; pre-existing, also the shipped
  Orbits `src/poly/app.js:375`): Tone's context is a standardized-audio-context wrapper with no `outputLatency`, so the
  live-record "heard" position ignores the output latency (16 ms in a headless page, more on Bluetooth); `autoLatencyMs`
  in midiio.js reads the native context and could serve it too (a change to live record's rounding: test on the Move).
- **The lock cue on lane 2** (ORBIT2-11 round 1, architect; pre-existing): the step buttons show a locked step in cyan,
  which is lane 2's own colour, so lane 2's locks don't show; P2 / P7 use blue (`CUE_LED`), the lock cue could too.
- **app.js structure after phase 11** (ORBIT2-11 round 1, architect): the P6 block (`makeMaster`'s fx, `pfx`, `glide`,
  `setFilter`, `setThrow`, `filterSay`) is self-contained and could be its own module; "perf" names two things (`perf`
  the live-mode settings next to `perfAt`, `perfKey`, `pfx`, `barPerf`); the origin is handled two ways (`Machine.tick`
  hands `Lane.at` the absolute tick plus `origin`, `liveTick` a relative tick), so a caller passing a relative tick and
  an origin would subtract twice.
- **Evolve's way home resets the mutes** (ORBIT2-11 round 2, architect; pre-existing, the same at `be25191`): going home
  is `m.assign(evoSnap, { keep: true })`, which brings back the snapshot's `muted`, so a mute pressed at once in the bar
  before a home line is undone on it (a mute waiting for that line now lands after it). Mutes are performance state
  everywhere else (`perfKey`, undo's `keepPerf`); keeping them on the way home too would match.
- **A quick restart's MIDI clock count** (ORBIT2-11 round 3, architect; pre-existing): Play right after a stop resets
  `tick = 0` in `togglePlay` while the old transport still delivers its look-ahead up to its stop, so the new run's
  first block (step 1 and its clocks) plays in the old run's tail, then nothing until the transport restarts (240 bpm: a
  63.7 ms gap between two F8s 10.4 ms apart); a clocked device ends 0 to 5 clocks off per restart (`be25191`: +4 … 0,
  now 0 … −5 with the start after the stop). Dropping the callbacks before the restarted transport's start in
  `onBlock` (or resetting there) would remove the tail's notes and clocks.
- **Live-mode cues on screen** (ORBIT2-11 round 1, greta; taste): the "live mode" chip is a quiet toggle next to a big
  Connect button ("live: on" in words would say more for a safety setting); a one-line legend of the button states
  (cyan, white, magenta) in the help; on a phone the transport strip takes three rows before the status line
  (verifier, greta). Check on the real Move that the guarded buttons' red blink reads from the stage (kai).
- **A brickwall at the master** (ORBIT2-12 round 1, sound; pre-existing): `makeMaster` is a compressor (−18 dB, 3:1)
  into Tone's `Limiter(-2)`, which lets fast transients through: a busy dsp mix with ×8 ratchets on three lanes in
  unison reaches 0 dBFS (even spacing too) and a 16-bit export clamps the overs. A look-ahead / true-peak limiter, or a
  soft clip before the encoder.
- **The modulator at the knob ends** (ORBIT2-12 round 1, sound): the V5 sine (± depth / 2) around tone 0.9 at depth
  100 % sits clamped at 1 for 13 of 32 steps; fold it back, or limit the depth to the room left so the wave keeps its
  shape.
- **Scale snap and color-bent voices** (ORBIT2-12 round 1, sound): on marimba, conga and bongo the color knob moves the
  pitch (×12, ×5, ×7 semitones in both engines), so a color modulator or color dice takes a snapped lane off the scale
  (the scale tooltip says so); snapping after color would keep them on it.
- **One semitone table** (ORBIT2-12 round 1, architect, ines): `TUNE_SEMIS` (voices.js) is kept by hand next to each
  voice's `hit()` in both engines; the span could live on the voice definitions (or a test could check it against
  both), and the pure `export.js` imports `voices.js` only for it. Evolve's tune move is 1/12 of the range, a whole tone
  on the ±24 voices.
- **app.js after phase 12** (ORBIT2-12 round 1, architect): 1671 → 1738 lines; `buildGenUI`, `renderGen` and
  `renderCouple` could be a small UI module, and `auditionLock` still lays out the ratchet itself (with `ratchetTimes`,
  `ratchetGains`, `tuneLock`) instead of asking `expandHits`.
- **Generative hints on screen** (ORBIT2-12 round 1, ines, tomi): coupling shows nothing on a lane at 100 % until its
  chance is lowered (the tooltip says so; a hint next to the control would); "(too long)" repeats in the status line
  while a pattern sits at the max cycle; AND / XOR on a hand clave can surprise (XOR of a tresillo with E(5,8) is dense,
  AND can leave only the downbeat): a line under the mask control. ORBIT2-13 round 1 (sound, ines): a planet is as solid
  as its programmed chance (`Lane.chanceAt`), not a coupled lane's lift, so a lifted lane plays more often than it looks.
- **Gravity's excursions past the max cycle** (ORBIT2-12 round 2, verifier, architect): steps home are never held
  (round 1: a guard on them could keep a pattern away for good), so at partial gravity a step home can push the cycle far
  past the max and the random moves then keep to that longer cycle (the tooltip says so). Home 4 bars, max 32, amount
  100 %: over 32 bars in 13.3 % of evolves at gravity 20 % (longest 630 bars), 3.4 % at 50 %, 0.1 % at 80 % (verifier);
  home 12 bars: 382 / 120 / 25 of 3000 evolves at 25 / 50 / 75 % (architect). Ideas: hold random moves against
  max(limit, home's cycle) while a step home has the pattern over the limit (verifier); pick the step home that keeps the
  cycle within max(limit, the cycle before, home's cycle), else the shortest (architect's trial: 81 / 68 / 9, worst still
  420 bars; the round-1 repro's way home peaks at home's own 866 bars instead of 3080).
- **Ratchet curve feel at low counts** (ORBIT2-12 round 2, sound; taste): the softening that keeps a curve at the even
  level (`ratchetGains`) also applies where nothing stacks: a ×2 slow-down's second hit 31 ms later (16ths at 120 bpm)
  plays at half and ×3 speed-up is full, half, half, so at low counts a curve changes the accents too (it could start only
  below a gap in ms). Speed-up ends a whole even gap before the next step (its gaps shrink 1½ → ½ of even, then 1), so the
  roll pauses before the downbeat; a ¾ gap with the last repeat at half might keep the run-in without stacking.
- **Scene timing against the sound** (ORBIT2-13 round 1, sound; pre-existing for the flashes and the bloom): `onTick`
  draws a step at its grid time (`T.getDraw().schedule(…, time)`), so a nudged or swung step's flash, and now its missed
  ring, lands its nudge late (−0.3 at 120 bpm: 34.8–38.3 ms after the sound; on-grid steps −11.8…+5 ms); drawing at
  `time + lead` would fix both. The bloom, flashes and rings fire at the scheduled audio time while the cycle arc and the
  countdown follow `heardTick()` (minus `outputLatency`), so on a high-latency output they would disagree (today
  `heardTick` reads 0 there, see "`heardTick` reads the wrapper's `outputLatency`"): one latency for all that is drawn.
- **An early part at Stop** (ORBIT2-13 round 1, sound; pre-existing): the early part of a step nudged before its tick,
  sent just before Stop, sounds, but its step never draws (1 of 58 notes in a run).
- **V6 marks on a phone** (ORBIT2-13 round 1, architect, greta, verifier; phase 14 owns the canvas): the a:b arcs sit at
  a fixed size + 6 px, not scaled to the ring gap, so on the 390 px stage the white current-loop arcs overlap the
  neighbouring planets, and with b ≥ 4 and a ratchet the 2 px arcs compete with the ratchet dots and the accent flare, the
  lit loop subtle (greta: a thicker lit arc; that needs the room first); the 1.5 px, 45 % cycle arc is easy to miss and
  its head dot carries it; the outer lane's a:b arcs (16–21 px) and growing miss rings (to 23 px) cross the cycle track
  16 px out (14 on a phone; the record ring sits at 26) (verifier); a 0.2-opacity planet looks nearly like an empty step
  on a phone (greta); dashed and dotted miss rings are hard to tell apart at 1.5 px for 450 ms (greta; ines: a hue; the
  help names the three since round 1).
- **The V6 layers under adaptive quality** (ORBIT2-13 round 1, architect): the faint a:b arcs and the miss rings draw at
  any `quality`; cheap today (6 lanes × 32 a:b steps: +0.04 ms a frame), a guard for weak phones would shed the faint
  arcs below 0.7.
- **Long cycles and the other conditions on screen** (ORBIT2-13 round 1, ines): on a cycle of many bars the outer arc
  reads as static (a position label, or tick marks where lanes realign); fill / first / pre keep the plain dashed halo (a
  mark saying "only on loop 1" / "only on a fill").
- **A scene test** (ORBIT2-13 round 1, verifier, architect): the drawing side of V6 (a ring set on a miss, gone after
  `MISS_MS`, cleared on Stop and `reset()`) is checked in the browser only; `createScene` needs a canvas, so a unit test
  needs a small 2D-context stub.
- **A gestures module** (ORBIT2-14 round 1, architect): the I1 pointer state machine (tap or select, the slop, the long
  press, a turn put back for a pinch, record on release, the gesture's own lane) lives in `app.js` with no unit test, only
  its geometry in `scene.js` has one; a `poly/gestures.js` with injected callbacks (select, tap, set rotation / length,
  open the menu, commit) would let it run in Node. `app.js` 1738 → 1845 lines in phase 14.
- **One tap rule through the euclid mask** (ORBIT2-14 round 1, architect; the strip's `cycleStep` the same since phase
  12): in AND / XOR mode a tap cycles the stored hand step, not what plays, so with XOR and E(3,8) a planet the mask lights
  goes off, off, on, and its accent can't be reached from the canvas. One rule in the model for both, on the played tier.
- **Rings and the lock menu on a phone** (ORBIT2-14 round 1, architect, rio, maya): at 390 × 844 each ring owns 17.2 px
  either side, less than `TAP_PX` (22), so any touch on the two inner rings taps a tick (no select-only spot; the lane
  tabs select) while the help says "touch a ring to select its lane"; the menu's pills (12 px text, 32 px tall) are small
  and overlap the neighbouring planets; a pill scrolls the page ~1350 px down to the lock panel and the rings are gone
  (a lock sheet over the stage, or a way back); a select-only touch shows little; a fade-in or a dimmed backdrop for the
  menu (taste). Round 2 (verifier): with the menu over the core, a tap a few px off a pill can still press it (Chrome's
  touch adjustment snaps a tap onto the nearest button: 8 px below "nudge" it opened the lock panel and scrolled 1428 px).
- **The tap's sound and the pads** (ORBIT2-14 round 1, sound): stopped, a tap sounds on release plus the look-ahead
  (~100 ms after the touch with a 90 ms hold); an empty tick has no long press, so it could sound on pointerdown. The
  Move pads' `liveHit` plays at `T.immediate()` on the lane's own mono voice while the pattern plays: the case that cut
  the lane's queued note for canvas taps (not measured for the pads; from before phase 14). Round 2 (sound; taste):
  playing, a tap on a tick just before the head reaches it (that lap's step already scheduled) waits a whole cycle
  (kick step 7 after 1.93 s, hat step 15 after 2.42 s); it could play at its grid time that lap when no later hit of the
  lane is queued.
- **Telling a beginner the rings play** (ORBIT2-14 round 1, maya; I6 in phase 16): a tap on a ghost turns it off with only
  a flash; nothing but the help says the rings can be dragged, pulled or pinched: a first-run line on the canvas.
- **Lineage and dice through undo** (ORBIT2-15 round 1, verifier, architect): lineage lives beside the beat (settings,
  library, link), so undo doesn't bring it back: a remix then undo keeps the link's name as your lineage; today's seed
  then undo leaves the dice locked to the day's seed at repeat 1, and the dice you had (free, repeat 4) are gone (a
  library setup's dice the same since before the phase). Carry `from` (and a load's dice) in the history step. Round 2
  (verifier, architect): the setup on screen (`libCurrent`) the same: a slot recall or an undo that brings back another
  beat keeps the setup's name in what you share (`recallSlot(1)` after loading "night bus": the house beat shares as
  "night bus"), and an undo back to a setup doesn't bring its name back (it fails safe: unnamed); carry the setup id in
  the history step next to `from`.
- **"Back to my beat" after two links** (ORBIT2-15 round 1, verifier): two links pasted while the card is open, "back to
  my beat" undoes one step and lands on the first link; it could go back to the beat from before the card.
- **Sharing after a long wait** (ORBIT2-15 round 1, architect, sound): `navigator.share` runs after the 4-bar render
  (1.5–2.2 s on a desktop, more on a phone) or after the postcard's real-time 4 bars (8 s at 120 bpm), past the tap's
  user activation (~5 s in Chrome), so the share sheet falls back to a download; where the clipboard also needs a gesture
  (Safari) the remix link is lost and the toast doesn't say so. When the file is ready: a "send" button in the toast (a
  fresh tap), and say when the link wasn't copied. One rule for the sheet too: links use it on touch only, files
  wherever `canShare` allows.
- **Lighter thumbnails** (ORBIT2-15 round 1, architect, verifier): a 96 px PNG data URL is 9–11 K characters, about twice
  its setup's JSON (WebP at 0.9 only gets to 7.0–7.6 K); in memory keyed by id + `t`, or the ring shapes themselves
  (a few hundred bytes) drawn on render. (Round 1 made them one write per render, and a full store drops them before it
  fails a save.) Round 2 (architect): that write is all or nothing, so once a save has needed the room, most thumbnails
  would fit again but none are cached, and every render redraws them all and fails a write of the whole library (43
  setups: 7 failed writes across save, load, randomize and a groove; randomize after a setup 28 ms): cache what fits.
- **A share module** (ORBIT2-15 round 1, architect): the share UI (link, file share, postcard, the gift card, the menu)
  is ~120 lines of `app.js` (1856 → 1999 lines in phase 15); `poly/share.js` holds its pure part. Round 2 (architect):
  "what this beat is" (the setup on screen and the lineage) is decided in 7 places (init, a groove, a roll, the day's
  seed, a link, a setup's load and save) and only the browser checks pin the rule, so the next load path (a MIDI import, a
  Move set) can miss it; one origin argument on `loadMachine`, or a small tested piece of state in that module.
- **The postcard's edges** (ORBIT2-15 round 2, sound): a postcard that started the beat stops it ~0.25 s after bar 4
  ends (the recorder's stop, its `onstop`, then the 0.1 s look-ahead), so bar 5's downbeat is heard live (the file is
  right); a transport stop scheduled on that bar line would end the playback with the postcard. A beat stopped
  mid-postcard still gives a file 4 bars long (music to 4.1 s, then silence): end it early, or say so. Round 2
  (implementer): the end is reckoned from the tempo and meter at the start, so a tempo move, a slot in another meter or
  the transport's 0.1 s tempo glide (Play right after a tempo change: the first bar 8 ms long) moves the real end of bar
  4 off the gate; the scheduler could hand over the 4th bar line after the start too, as it does the first.
- **16 bars to make it yours** (ORBIT2-15 round 1, verifier, architect): the I5 backlog text says "16 bars to make it
  yours"; the phase spec left it out and nothing counts them (the toast says "make it yours, then share it"). A design
  call: a 16-bar countdown, then a nudge to share?
- **Seed of the Day sound** (ORBIT2-15 round 1, sound): the day's beat uses the Common kit's raw defaults, so the hat sits
  ~22 dB under the kick (stem peaks: kick −7.1, snare −15.6…−17.0, wood −15.2…−16.2, hat −29 dBFS) where the grooves
  keep the backbeat 1.5–4 dB under it; every day is the same four voices, 7 of 14 days rolled "tresillo over four", and
  the tempo is drawn apart from the family (boom bap at 117 bpm). A groove-style mix, or a curated kit and tempo range per
  family.
- **A listening version of the 4 bars** (ORBIT2-15 round 1, sound, dex): the 4-bar share follows the export drawer's loop
  setting: on, the file opens with the wrapped ring-out under the downbeat and ends on a cut (right for a DAW loop, odd
  played once from a share sheet); off, it is "4bars+2tail-oneshot", 11.6 s. A one-shot with ~1 bar of ring-out and a
  short fade for sharing; a 2–5 ms edge fade either way.
- **Faster "tap to hear"** (ORBIT2-15 round 1, sound): the first sound comes 162 ms (synth) / 205 ms (dsp) after the tap,
  as for Play: the 100 ms look-ahead, the +0.05 s start and the master's ~12 ms look-ahead.
- **The gift and the gallery on a phone** (ORBIT2-15 round 1, rio, dex): an unnamed beat arrives as "an orbit" (a default
  name, or ask for one when sharing); on a desktop the library is a closed drawer, on a phone it sits far down with the
  toast and play over its rows, and the seed chip needs a scroll (the header or the welcome bar?); "…" reads cryptic in
  a crowded transport; after a remix on a first visit, a "make your own" line; the app shows for a moment before the card
  on a slow load (the link decodes after Tone.js loads).
- **The backbeat you hear** (ORBIT2-16 round 1, sound): the backbeat quest reads the grid, not the sound: swing on a ×1
  snare moves its 2 and 4 an eighth late (onsets at beats 1.5 / 3.5 at swing 50 %) and the quest still ticks; push / pull
  the same. Read the heard step (`step + swingAt(step)`, plus the offset) and say "swing 0" in the hint when it is what
  stands in the way.
- **Export the whole cycle** (ORBIT2-16 round 1, sound; from before the phase): the export quest sends a beginner to ⤓ WAV,
  whose 4 bars cut the demo's 5-bar cycle (the rim's gap is 4 sixteenths instead of 5 at the loop point: a hiccup every 4
  bars when looped in a DAW). Offer the full cycle when it is short, or say "4 bars of a 5-bar cycle" on the status line.
- **"hits" on a hand-set lane** (ORBIT2-16 round 1, verifier): the plain word reads as a count, but the knob is the euclid
  fill: a lane whose steps you set by hand (the demo kick `X...`) shows "0 hits" while it plays one. Show the lane's
  real hit count there, or name the knob "spread" in simple.
- **Learning on a phone** (ORBIT2-16 round 1, verifier, architect, maya, greta): at 390×844 the fixed ▶ covers the quest
  card's right end (skip / × under it until you scroll), the card starts near the fold and the lane knobs the quests
  name sit ~1300 px down, the simple · everything switch ~2400 px down. The card and the switch higher up (or a "show
  me" that scrolls to the lit drawer) on small screens.
- **Step locks from the Move in simple** (ORBIT2-16 round 1, architect): simple tucks the lock panel away, but the Move's
  hold step + knobs still sets locks and `lockStep`, so switching to "everything" opens a lock panel nobody asked for.
- **Quest badges** (ORBIT2-16 round 1, architect): I6 names badges; the saved progress tells a finished quest from a
  skipped one (`skipped`, round 1), nothing shows them yet (a row of five marks on the card, or in the help).
- **The quest card's controls** (ORBIT2-16 round 1, greta): skip 44×32 and × 29×32 px on a desktop (44 px on touch), the
  bare × beside "skip" (a word, "hide"?), the switch's two radios are two tab stops (the shared `segmented`, no arrow-key
  roving).
- **Plain words in sentences** (ORBIT2-16 round 2, verifier, sound): tooltips still say "rotation" (`#btn-wild`) and
  "probability" (`#exp-roll`) in simple (titles from before the phase); in "everything" the backbeat hint reads `set
  "speed ×" to 1` (the gauge's label, "×" and all, inside a sentence).
- **The second quest on the demo** (ORBIT2-16 round 2, sound): on the first-visit beat "rotate the snare" is really
  "build a backbeat, then rotate": three knobs before the shift, undoing quest 1's 3-step rim (the triplet hats keep a
  cross-rhythm, so it still sounds right). A demo with a real snare, or the quests in another order: a note for the
  phase 17 pass.
- **One `hitAt`** (ORBIT2-16 round 2, architect; taste): `quests.js` `playsAt(l, i, rot)` copies `Lane.hitAt` with a
  rotation argument; an optional rotation on `Lane.hitAt` / `stepIndex` would keep one copy.

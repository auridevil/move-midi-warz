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
  triplet-ish": exact triplet swing is 33 %, 50 % is a dotted-16th feel. (Ines, Tomi)
- **B2 lane 4 voice 'perc' does not exist.** `LANE_NAMES` defaults lane 4 to `perc`, `VOICES.perc` is missing, so
  `buildVoice` falls back to the kick and the voice select shows blank. Default lanes must use real voices (the Common
  kit's). Migrate saved data that has `voice: 'perc'`. (Rio)
- **B3 kit readout vs select.** After init the readout says `kit custom` while the select shows "Common", and picking
  Common again fires no change. Show the real state (a "custom" entry, or blank) and let re-picking re-apply. (Maya, Greta)
- **B4 'cycle' ignores trig conditions and dice repeat.** `cycleSteps()` (`lanes.js` ~108) uses only lengths ×
  ratios; a step with condition `1:3` makes the true period 3× longer, and locked dice with repeat N multiply too.
  Affects the "full cycle" slot switch, the cycle export, the readout and the alignment bloom. (Ines)
- **B5 exports disagree.** WAV, stems and MIDI of the same pattern each roll `Math.random` (probability, humanize),
  so they contain different hits. One export action must use one hit list; when dice are free, roll once and reuse it
  across WAV/stems/MIDI made from the same "take" (e.g. an "export all" or a per-render seed shown in the status). (Dex)
- **B6 live record drops velocity.** `liveHit` plays at pad velocity but writes only hits/accents; ghost notes come
  back at 0.7. Write a `vel` lock for non-accent hits. (Dex)
- **B7 loaded samples are cut short.** `assignSample` keeps the lane's previous decay, so a slice plays ~25–35 %.
  On load set decay so the whole sample plays, and make the top of the decay knob mean "whole sample". (Dex)
- **B8 hotkeys fire while a control is focused.** Space starts play instead of toggling a focused `<summary>`/button;
  letter keys toggle steps while a button has focus. Ignore global hotkeys when focus is on an interactive element
  other than the canvas/body. (Greta)
- **B9 MIDI clock-in tempo flaps.** `midiio.js` rounds the incoming bpm, `applyTempo` rounds again → at 127.5 bpm
  with ±1 ms jitter: 767 tempo changes in 64 beats, each `retime()` ramps tempo and jumps the delay; `retime()` also
  fights the phase-lock trim. Keep a float, smooth with hysteresis, retime only on real changes, don't fight the lock.
  (Kai)
- **B10 audio-callback work.** `loadSlot` and `evolveNow` run `sync()` (DOM rebuild, JSON, localStorage, undo commit)
  inside the Tone.Loop callback. Defer UI/persistence work to `T.getDraw().schedule` / a microtask. (Kai)
- **B11 mutes pollute undo.** Muting is recorded in history, so Undo after a mute undoes the mute instead of the last
  edit. Keep mute/solo out of `hist`. (Kai)
- **B12 readout is aria-live and too chatty.** 5 arrow presses on a knob = 5 re-reads of ~400 chars. Remove aria-live
  from the readout; announce only the changed value. (Greta)

## F · First visit & musical randomize (phase 02)

- **F1 starter grooves.** One-tap presets that load pattern + kit + tempo + swing: lo-fi boom bap, trap, house,
  techno, DnB, afro (3-2 clave / bell), and a "3 vs 4 vs 5" polyrhythm demo that blooms within 2 bars. (Maya, Rio)
- **F2 first visit plays something good.** `initPattern()` runs on every visit (one lonely kick). First visit: load a
  curated demo, pulse play. (Maya, Rio)
- **F3 continue last beat.** Returning visit: keep the last pattern, with a small "welcome back · keep jamming / start
  fresh" choice instead of the invisible "one undo away". (Maya, Rio)
- **F4 musical randomize.** Groove families (tresillo, 3-2 clave, 4 vs 3, 5 over 4, four-on-the-floor, boom bap):
  kick anchored on 1, snare on 2 & 4 where the family wants it, lengths 4/8/16 (or the family's), cycle capped at 16
  bars; keep the current "wild" randomize as a second option. Toast the family name. (Maya, Rio)
- **F5 alignment countdown.** Show "aligns in N bars" near the core so the bloom becomes an anticipated payoff. (Rio)

## T · Touch & accessibility (phase 03)

- **T1 everything reachable by touch.** Long-press replaces Shift/Alt/Cmd/right-click: steps (tap cycles off → on →
  accent, long-press opens locks/condition), slots (long-press menu: save / add to chain / erase). (Maya, Greta, Rio)
- **T2 step cells are buttons.** Real `<button aria-pressed>`, keyboard reachable, ≥32 px desktop, ≥44 px touch. (Greta, Rio)
- **T3 gauges are sliders.** `gauge.js`: `role="slider"`, `aria-valuenow/min/max/valuetext`, short `aria-label`,
  visible 2 px focus ring like buttons. (Greta)
- **T4 lane tabs semantics.** `role="tab"` + `aria-selected` + arrow keys, or plain buttons with `aria-pressed`. (Greta)
- **T5 playhead on the step strip.** Highlight the sounding step of the selected lane while playing. (Greta)
- **T6 Move UI only when it can work.** Hide Connect/Disconnect where `navigator.requestMIDIAccess` is missing (iOS);
  one toggle button instead of Connect + disabled Disconnect. (Greta, Rio)
- **T7 opaque popovers + sizes.** Move-controls popover gets a solid background; labels ≥11 px in the body font,
  drawer headers/buttons ≥32 px (44 px touch). (Greta)

## C · Calmer screen (phase 04)

- **C1 transport strip.** Play, tempo (with tap), undo/redo, fill, jam in one strip at the top; play in the thumb zone
  on phones. (Greta, Rio)
- **C2 one-line readout.** Tempo, play state, slot, rec, evolve. Per-lane rows + sound row move to a collapsible "nerd
  stats" panel (they duplicate the knobs). Readout must not overlap rings. (Greta, Rio)
- **C3 less help text.** Headers are nouns ("Lane 1 · kick"); Move shortcuts only in the Move panel; mouse tricks in
  tooltips or one help overlay. Remove the "what each parameter does" table (tooltips cover it). (Greta)
- **C4 hide diagnostics.** Stress meter behind a debug flag (`?debug`), engine switch (synth/dsp) into a settings
  drawer, "reset phase" + "tap tempo" off the top level. (Greta)
- **C5 focus mode.** Key F hides all HUD; drawers default closed except the lane drawer; ring labels in a fixed
  legend instead of on the rings. (Greta, Rio)

## G · Groove & dynamics (phase 05)

- **G1 per-step nudge lock** (−50…+50 % of a step) in `LOCK_KEYS`, applied in `expandHits`; hold step + knob. (Tomi, Ines)
- **G2 lane push/pull offset** in ms (−30…+30), per lane. (Tomi)
- **G3 velocity humanize** amount (global or per lane), seeded by dice when locked. (Tomi, Dex)
- **G4 ghost / normal / accent tiers**: step tap cycles through three velocities on a lane; Move pad velocity maps to
  tier when recording. (Tomi, Dex)
- **G5 velocity shapes timbre**: lower velocity = darker/shorter (tone, snap, decay) per voice, in both engines. (Dex, Ines)
- **G6 swing templates**: straight, MPC 16th, triplet (33 %), 3-3-2, Amapiano shaker (e/a different), aksak. (Ines, Tomi)

## R · Clock resolution & meter (phase 06)

- **R1 finer master clock** (e.g. 840 PPQ internal; MIDI clock out every 35th tick, clock in scaled) so 5- and
  7-tuplets are exact. Keep tick-derived positions. (Ines)
- **R2 more ratios**: ×6 (16th triplets), ×4/3 (hemiola), ×5/4, ×5, ×7/4, ×3/2 kept. (Tomi, Ines)
- **R3 time signature**: bar length setting (4/4, 3/4, 6/8, 7/8, 5/4, 12/8) used by bar-quantized switching, chains,
  evolve-every, jam, exports, ACID beats. (Tomi)
- **R4 stable loop counter**: conditions count loops per lane as they happen (length changes don't jump the phase), or
  offer global-bar conditions; add PRE / NEI (previous condition passed / failed). (Ines)

## L · Longer patterns, more parts, new voices (phases 07, 08)

- **L1 32 steps per lane** (pages on screen and on the Move pads/step buttons). (Tomi, Kai)
- **L2 more lanes**: 6 (or 8) lanes, Move mapping and scene adapted. (Tomi)
- **L3 per-step alt voice** / articulation lock (open/mute/slap for conga etc.). (Tomi)
- **L4 new voices** (both engines where possible): shekere, agogo / gankogui bell, djembe, log drum (sub with pitch
  glide), plus a "Jungle" kit and an "Afro" kit. (Tomi, Dex)
- **L5 pads cover all 16 steps**: page toggle or fold, playhead visible on pads for steps 9–16. (Kai)

## S · Samples & breaks (phase 09)

- **S1 slice per step**: a lane can hold a slice set; `slice` step lock; tap = slice N; Move: hold step + knob. (Dex)
- **S2 Unassembler sends 16 slices** (not hard-coded 8) and can send all to ONE lane as a slice set. (Dex)
- **S3 sample start/end/reverse** per lane (and per step via locks). (Dex)

## E · Export for producers (phase 10)

- **E1 24-bit and 32-bit float WAV**, sample rate 44.1/48 kHz choice. (Dex, Sofia)
- **E2 dry stems + FX return**: stems without the delay plus a 5th "delay return" stem; option to bake or not. (Dex)
- **E3 Drum-Rack MIDI**: one merged track option (notes per lane on 36/38/42/39…), plus the per-lane tracks. (Dex)
- **E4 kit export**: one-shot WAV of each lane's sound (with its settings) to load into Simpler/Drum Rack. (Dex)
- **E5 export all**: WAV + stems + MIDI from ONE hit list in one zip (see B5). (Dex)
- **E6 smpl chunk** (loop points) next to `acid`; optional ring-out file for jam takes. (producer review)

## P · Live performance (phase 11)

- **P1 safe Move live mode**: pads play sounds only (with velocity) unless Record; Capture (randomize all) and Delete
  (clear lane) need Shift or a hold; destructive actions confirmable. (Kai)
- **P2 one-gesture mutes**: hold Mute + track button / pad row mutes that lane without changing selection; "mute on
  next bar" option. (Kai)
- **P3 fill latch**: Shift + Layout = fill for the next bar. (Kai)
- **P4 slot change restarts lanes** at step 1 (option, default on): per-slot start tick subtracted in `Lane.at()`;
  `first` conditions fire again. (Kai)
- **P5 MIDI out latency offset** (± ms for notes and clock), using `outputLatency` as the default. (Kai)
- **P6 master performance FX**: HP/LP filter on the wheel (Shift+wheel = humanize), momentary delay throw. (Kai)
- **P7 conditions visible without the screen**: step buttons light per condition while holding a step. (Kai)

## V · Generative & visual structure (phases 12, 13)

- **V1 steerable evolve**: per-kind weights, "gravity" toward home instead of the hard reset, max cycle bars, keep
  hand edits (euclid lanes don't overwrite), move locks/conditions with their hits. (Ines)
- **V2 cross-lane coupling**: a hit on lane A raises probability on lane B (energy like `chaos/field.js`). (Ines)
- **V3 euclid as a mask**: AND / XOR / replace with the hand pattern. Document `euclid(5,8)` vs Bjorklund. (Ines)
- **V4 ratchet curves**: speed-up / slow-down spacing, pitch ramp, up to ×8. (Ines)
- **V5 timbre modulation**: per-lane slow modulator (tone/color over N loops or the cycle); seeded timbre dice with a
  range; scale-snapped tune option for pitched voices. (Ines)
- **V6 show what didn't play**: ghost flash on steps skipped by probability/condition/dice; planet opacity by
  probability (incl. prob locks); condition halo as `b` arcs with the active one lit; outer arc for position in the
  full cycle. (Ines)

## I · Interactive canvas, sharing, learning (phases 14, 15, 16)

- **I1 the orbit is the instrument**: tap a step tick to add a planet (pop + sound), tap a planet: on → accent → off,
  drag along a ring to rotate, pull a ring in/out to change length, long-press a planet = radial lock menu. (Rio)
- **I2 share up front**: share button in the transport; opening a link shows a full-screen "▶ tap to hear this orbit"
  card, then Remix; status is visible (not in a closed drawer). (Rio, Maya)
- **I3 one-tap share of audio**: render 4 bars and open the OS share sheet (`navigator.share` with a file) where
  available, download otherwise. (Maya)
- **I4 library as a gallery**: thumbnails of each setup's ring polygons. (Rio)
- **I5 Seed of the Day**: a daily dice seed → same starting constellation for everyone; 16 bars to make it yours; an
  "orbit postcard" (WebM of canvas + audio via `captureStream`) with a remix link that keeps lineage. (Rio)
- **I6 quests & progressive disclosure**: "make 3 against 4", "rotate the snare onto 2 & 4", "let it evolve 8 bars";
  badges; advanced drawers unlock as you go (never hidden from power users: a "show everything" switch). (Rio, Maya)
- **I7 simple mode / plain words**: "hits" not "euclid hits", "shift" not "rotation"; advanced controls tucked behind
  "advanced". (Maya)

## Later

(Reviewers' non-blocking SHOULD items that were not done land here, with the phase that raised them.)

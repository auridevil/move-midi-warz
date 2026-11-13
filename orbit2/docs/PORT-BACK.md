---
type: plan
title: Orbit2 port-back plan (what goes back to the shipped Orbits, and how)
created: 2026-11-13
tags: [orbit2, port-back, plan]
related:
  - '[[BACKLOG]]'
  - '[[ORBIT2-17]]'
  - '[[REVIEW-PANEL]]'
---

# Orbit2 port-back plan

This is a plan only. Nothing here has been ported. Inputs: the ten port-back lists and the per-id tally in
[[ORBIT2-17]] ("Port-back lists"), the done ids in [[BACKLOG]] (B1–B12, F1–F5, T1–T7, C1–C5, G1–G6, R1–R4, L1–L5,
S1–S3, E1–E6, P1–P7, V1–V6, I1–I7; 73 ids), and the Later entries the panel tied to the port ("Links and saves old
pages can read", "Port-back notes", "Per-hit cost on a phone", "Smaller saves", "The sender port needs the shipped
reader", "Port back: live chain params at time 0", "Two tabs").

## The short version

- **Port now: 28 ids.** B1–B12, F3, F4, T1–T7, C3, C4, E1, E3, E5, E6, I7. The panel agreed on these (tally "now"):
  model bugs with tests, accessibility, exports that only add, and two first-visit fixes.
- **Port later: 45 ids** (I5's Seed of the Day among them), in packages that each need a decision first (link and save versioning, the `app.js` split,
  phone CPU, the Move pages, a hardware pass). Each package is listed under "Later" with its gate.
- **Never: one item**, I5's "orbit postcard" (WebM through `captureStream`). I5's Seed of the Day stays in "later".
- **One format rule comes before everything else:** new links and saves must stay readable by the shipped page a
  service worker may still have cached (commit 0 below).
- **Keys:** the port writes the shipped keys `midi-warz.poly.*` and the shared `midi-warz.tempo`, never
  `midi-warz.orbit2.*`. Shipped users' saved data needs no migration step: orbit2's readers already open every
  shipped save, slot, library entry and link (verified in [[ORBIT2-17]] round 1, 119/119 hits and 1,500 random
  patterns). The few one-way changes on read are listed under "Saved data".

## How to port: shipped `src/poly/` is still the lab's starting point

The shipped `src/poly/`, `src/*.js` and `styles.css` have not changed since the lab copy `f1b4387`. So each orbit2
build commit is a patch against the shipped files, with the `orbit2/` prefix removed:

```bash
# one build commit, then the review-round fixes that touched the same ids
git show f3608ab -- orbit2/src orbit2/test | sed 's#\([ab]\)/orbit2/#\1/#g' | git apply --3way
```

This works for the phase 01–03 commits (they come before `app.js` grew from 869 to 2063 lines). Checked 2026-11-13 in
a scratch copy of HEAD (`src`, `test`, `poly.html`, `styles.css`, the repo's objects as alternates), applying with
`--3way` in this order: `f3608ab 13cf578 5a8d36c 6b67ed2 1a8dd23 90d7aad 4c94e1c cd3a958 4d08169 32117cf a0395b1
d4ac357`. Every source hunk applied cleanly; conflicts only in `test/poly.test.js` (the root test file is not the
lab's copy: move the cases by hand) and one in `poly.html` from `d4ac357` (map `orbit2/index.html` → `poly.html`;
the two pages already differed in 10 lines at the copy, the asset paths). After that,
the commits rely on each other (R1's 840 PPQ clock sits under almost every later id), so the later packages port
whole files, not patches. Patch order, fixes included:

| ids | build commit | review fixes on the same ids |
| --- | --- | --- |
| B1, B4 | `f3608ab` | `cd3a958`, `4d08169` (phase 01 rounds 1–3) |
| B2, B3, B7 | `13cf578` | `cd3a958`, `4d08169` |
| B5, B6 | `5a8d36c` | `cd3a958`, `4d08169` |
| B8–B12 | `6b67ed2` | `cd3a958`, `4d08169` |
| F3 (+ F2's demo), F4, F5 | `90d7aad`, `4c94e1c` | `cd3a958`, ORBIT2-02 rounds |
| T1, T2 | `32117cf` | `de785ff`, `9b30a00`, `57affda` (phase 03 rounds) |
| T3, T4, T5 | `a0395b1` | same |
| T6, T7 | `d4ac357` | same |
| C1, C2 / C3–C5 | `bf44477` / `811c008` | `53a0033`, `cf6ef12` |

`cd3a958` mixes phase 01 and 02 fixes: take only the hunks for the ids being ported. A later phase can have touched
the same lines again (find them with `git log -L` on the function in `orbit2/`); read the latest orbit2 version of a
function before deciding the patch is done.

## Per id: consensus, files, notes

Consensus = the tally in [[ORBIT2-17]] (votes now / later / never out of ten; a tie counts as later). Paths are
written from the repo root: `orbit2/src/poly/x.js` → `src/poly/x.js`. "merge" means take the id's hunks, not the whole
file. Tests: the matching cases in `orbit2/test/*.test.js` go to `test/poly.test.js` (or a new `test/<name>.test.js`
of the same name), with their imports changed from `../src/...` paths under `orbit2/` to the root ones.

### Now (28)

| id | votes | files to merge (orbit2 → root) | tests | notes |
| --- | --- | --- | --- | --- |
| B1 swing on odd lengths | 7/0/0 | `src/poly/lanes.js` (`Lane.at`, `swungAt`), `src/poly/app.js` (`INFO.swing`), `src/poly/scene.js` | `poly.test.js` "B1" | **Audible:** swung lanes at ×¾, ×3/2, ×3 and odd lengths sound different (300/300 random patterns at those speeds). Release note |
| B2 'perc' voice | 5/0/0 | `src/poly/lanes.js` (`LANE_NAMES` → Common kit voices, `Machine.from` repair), `src/poly/app.js` | "B2" | Saved data: `voice: 'perc'` reads as `'wood'`. One way (see "Saved data") |
| B3 kit readout vs select | 3/0/0 | `src/poly/app.js` (kit select "custom" entry, re-pick applies), `src/poly/lanes.js` | "B3" | — |
| B4 cycle counts conditions + dice | 5/0/0 | `src/poly/lanes.js` (`cycleSteps`), `src/poly/app.js` (readout, bloom, full-cycle switch) | "B4" | The full-cycle slot switch and the cycle export get longer for patterns with `1:N` conditions |
| B5 one roll per export | 7/0/0 | `src/poly/app.js` (take/roll), `src/poly/dice.js` (+2 lines), `src/poly/export.js` | "B5" | Port together with E5 if possible (same take object) |
| B6 live record keeps velocity | 7/0/0 | `src/poly/app.js` (`liveHit` writes a `vel` lock) | "B6" | Port as a plain `vel` lock, without G4's tiers (architect) |
| B7 samples play whole | 7/0/0 | `src/poly/app.js` (`assignSample` decay, offline `onended` guard), `src/poly/lanes.js` | "B7" | Also fixes the shipped exports rendering sample lanes as silence (`src/poly/app.js:122` vs `orbit2/src/poly/app.js:201–203`; sound) |
| B8 hotkeys vs focused controls | 5/0/0 | `src/poly/app.js` (key handler guard) | — (browser check) | — |
| B9 clock-in tempo | 6/0/0 | `src/poly/midiio.js` (float bpm, hysteresis), `src/poly/app.js` (`applyTempo`), `src/tempo.js` (`clampTempo` keeps 0.01 bpm) | "B9" | Take the phase-01 version, not R1's scaled one. `src/tempo.js` is shared by 7 pages: smoke all. Hardware pass with a real clock source |
| B10 no UI work in the clock callback | 6/0/0 | `src/poly/app.js` (`loadSlot` / `evolveNow` defer `sync()` to `T.getDraw()`) | — | Phase-01 version (before R1) |
| B11 mutes out of undo | 5/0/0 | `src/poly/history.js`, `src/poly/app.js` | "B11" | — |
| B12 quiet readout | 3/0/0 | `poly.html` (readout without `aria-live`, a polite sr-only region), `src/poly/app.js`, `styles.css` (`.sr-only`) | — | — |
| F3 continue last beat | 3/0/0 | `src/poly/app.js` (`firstVisit`, welcome bar), `poly.html` (`#welcome-bar`), `styles.css` (welcome bar block) | "F3" | The shipped page throws the saved beat away on every visit (`initPattern()`). Highest user value. A fresh shipped user then needs a first-visit beat: either F2's demo (needs `src/poly/grooves.js`) or the old `initPattern()` |
| F4 musical randomize | 4/0/0 | new `src/poly/grooves.js` (families only), `src/poly/lanes.js` (`randomizeMusical`), `src/poly/app.js` (toast, wild on long-press), `poly.html`, `styles.css` (toast) | "F4" | Pure model code. Bring `grooves.js` whole; F1's starter chips can wait |
| T1 long-press for every modifier | 4/0/0 | `src/ui.js` (`longPress`, `LONG_MS`), `src/poly/app.js` (steps, slots menu), `styles.css` (callout off) | `gestures.test.js` (long-press cases) | `src/ui.js` is only imported by Orbits. Greta: after the floating-play overlap is settled if C1 comes too |
| T2 step cells are buttons | 5/0/0 | `src/poly/app.js` (step `<button aria-pressed>`), `styles.css` (T2 / T7 target sizes block) | "T2" | — |
| T3 gauges are sliders | 4/0/0 | `src/gauge.js` (`role="slider"`, `aria-value*`, focus ring) | — | **Shared:** `src/gauge.js` is used by Punchliner and Unassembler too: smoke every page |
| T4 lane tab semantics | 2/1/0 | `src/poly/app.js`, `poly.html` | — | Greta prefers a real tablist later; the `aria-pressed` buttons are fine now |
| T5 playhead on the step strip | 2/0/0 | `src/poly/app.js`, `styles.css` (playhead block) | — | — |
| T6 Move UI only when it can work | 1/0/0 | `src/poly/app.js` (one toggle, hidden without Web MIDI), `poly.html` | — | Check on iOS |
| T7 opaque popovers + sizes | 3/0/0 | `styles.css` (Move-controls popup, 11 px labels, 32 / 44 px), `poly.html` | — | 72 targets under 32 px on the shipped page vs 5 in orbit2 |
| C3 less help text | 3/2/0 | `poly.html` (nouns, the "?" overlay), `src/poly/app.js`, `styles.css` (C3 block) | — | Drop the parameter table only once the tooltips are in |
| C4 hide diagnostics | 4/1/0 | `src/poly/app.js` (`?debug` stress meter, settings drawer for the engine), `poly.html`, `styles.css` (C4 block) | — | — |
| E1 24-bit / 32-bit float WAV | 5/1/0 | `src/unasm/wav.js` (`WAV_BITS`, `encodeWav({ bits })`), `src/poly/app.js` (format + rate select) | "E1" | **Shared:** `src/unasm/wav.js` is used by Unassembler: smoke it. Same frame count as shipped |
| E3 Drum-Rack MIDI | 3/2/0 | `src/punch/smf.js` (`meters`, merged track), `src/poly/export.js` (Drum-Rack map), `src/poly/app.js` | "E3" | **Shared:** `src/punch/smf.js` is Punchliner's writer: smoke it. Dex: slice lanes still export on one note (Later "Slices in the MIDI export") |
| E5 export all | 3/2/0 | `src/poly/app.js` (one take → WAV + stems + MIDI in one zip, `PRE_ROLL`), `src/poly/export.js` | "E5" | With B5. Watch memory (Later "Export-all memory") |
| E6 `smpl` loop chunk | 5/1/0 | `src/unasm/wav.js` (`insertChunk`, `withSmpl`, `wavFrames`), `src/poly/app.js`, `src/poly/jam.js` (ring-out file) | "E6" | Additive. The jam ring-out needs E6's half of `jam.js` only |
| I7 simple mode, plain words | 3/2/1 | `src/poly/quests.js` (view state only), `poly.html`, `src/poly/app.js` (labels, "advanced" drawers), `styles.css` (I7 block) | `quests.test.js` (labels, view) | Dex votes never (the shipped Orbits is the plain tool). Port the plain-word labels now; decide the simple/everything switch with I6 |

### Later (45), by package

Each package is one port job with its own gate. Order inside a package is the order to port.

| package | ids (votes now/later/never) | gate before porting | files (orbit2 → root, whole file unless noted) |
| --- | --- | --- | --- |
| **Clock + meter** | R1 0/7/0, R2 0/6/0, R3 0/8/0, R4 1/4/0 | Commit 0 (link and save versioning) done; the scheduler moved out of `app.js` in orbit2 first ("app.js structure after phase 11"); a hardware pass for MIDI clock in / out at 840 PPQ (96 PPQ MIDI rounding, ACID for /8 meters: sound) | `src/poly/lanes.js`, `src/poly/midiio.js`, `src/poly/slots.js`, `src/poly/export.js`, `src/poly/jam.js`, `src/poly/jam-worklet.js`, `src/punch/smf.js` (meters), `src/poly/app.js` (clock) |
| **Groove** | G1 1/6/0, G2 0/6/0, G3 0/5/0, G4 3/4/0, G5 1/6/0, G6 2/6/0 | Clock + meter; G5 measured on a phone first ("Per-hit cost on a phone"); one tap rule for G4 vs T1 | `src/poly/lanes.js`, `src/poly/export.js`, `src/poly/voices.js`, `src/poly/dsp-voices.js`, `src/poly/dsp-core.js` → then `node tools/build-worklet.mjs` (regenerates `src/poly/dsp-worklet.js`), `src/poly/scene.js`, `styles.css` (G4 / G6 blocks) |
| **Longer patterns** | L1 0/7/0, L2 0/7/0, L5 0/2/0 | "Smaller saves" (write steps 17–32 only when used), Move pad pages tested on the device | `src/poly/lanes.js` (`MAX_STEPS` 32, 6 lanes), new `src/poly/pages.js`, `src/poly/midiio.js`, `src/poly/scene.js`, `src/poly/kits.js`, `src/poly/jam-worklet.js`, `styles.css` (L1 block) |
| **Voices** | L3 0/3/0, L4 0/4/0, F1 3/3/0, F2 3/3/0, F5 1/1/0 | Per-voice synth / dsp level trims ("dsp engine voice levels", "Loudness target"), a true-peak limiter or soft clip ("A brickwall at the master"); F5 after B4 | `src/poly/voices.js`, `src/poly/dsp-voices.js`, `src/poly/kits.js`, `src/poly/grooves.js` (F1 chips), `src/poly/app.js` (F2 demo, F5 countdown) |
| **Samples + breaks** | S1 0/6/0, S2 0/6/0, S3 1/5/0 | Longer patterns (a 16-slice set); one buffer per slice set; the shipped Unassembler sends v1 and orbit2 reads v2: port `src/unasm/app.js`'s sender with the reader ("The sender port needs the shipped reader") | `src/samples.js` (`sampleWindow`, `padChannels`, `readSlices`, `chopEqual`, `MAX_HANDOFF`; shared with Unassembler), `src/poly/lanes.js`, `src/poly/app.js` |
| **More exports** | E2 2/3/0, E4 1/4/0 | B5 + E5 ported; a ghost tier in E4 ("Ghosts in the kit export"); one stem headroom ("Dither and one stem headroom") | `src/poly/jam.js`, `src/poly/app.js` |
| **Live** | P1 2/3/0, P2 2/4/0, P3 2/4/0, P5 2/3/0, P7 1/4/0, P4 0/5/0, P6 0/6/0 | One pass on the real Move first (kai: before P1–P7, B9, R1); P1 only with a visible live / edit cue ("Live-mode cues on screen"); P7 after L1's `pages.js`; P4 after the `Lane.at()` start-tick decision; P6 after "A jam module" and an audio-graph check | new `src/poly/perform.js`, `src/poly/midiio.js` (P5), `src/poly/slots.js` + `src/poly/lanes.js` (P4), `src/poly/app.js`, `styles.css` (P blocks) |
| **Generative** | V1 1/3/0, V2 0/4/0, V3 1/3/0, V4 0/5/0, V5 0/4/0, V6 0/3/0 | Clock + meter (R4); V4's ×8 and V5 measured on a phone; `evo.maxBars` in a changelog | `src/poly/lanes.js`, `src/poly/export.js`, `src/poly/voices.js`, `src/poly/scene.js` (V6), `src/poly/app.js`, `styles.css` (V2 / V3 blocks) |
| **Layout** | C1 1/4/0, C2 1/3/0, C5 0/4/1 | The layout rebuild: one Escape handler, a grid stage, the floating ▶ no longer over content ("Floating play over content"), a focus key that isn't a pad key ("F is also a pad"); "Split the layout + focus-mode block out of `app.js`" | `poly.html`, `styles.css` (C1, C2, C5 blocks, the phone block), `src/poly/app.js`, `src/poly/scene.js` (C5 legend) |
| **Canvas + sharing** | I1 0/3/0, I2 2/3/0, I3 2/4/0, I4 0/5/1, I5 seed 1/3/0 | Commit 0; "A gestures module" and "A share module" extracted in orbit2; I1 after T1 / T2 (touch conflicts) | new `src/poly/share.js`, `src/poly/library.js` (I4 thumbnails), `src/poly/history.js` + `src/poly/scene.js` (I1), `src/poly/app.js`, `poly.html`, `styles.css` (I blocks) |
| **Learning** | I6 1/4/2 | I7 ported, the phone layout (quest card under the floating ▶), a decision on whether the shipped Orbits wants quests at all (kai, dex: never) | `src/poly/quests.js` (quests), `src/poly/app.js`, `poly.html`, `styles.css` (I6 block) |

### Never

- **I5's postcard** (architect, kai, dex, ines, rio): 4 bars recorded in real time lose the tap's share permission
  before the sheet opens, and I3's file already shares the sound. Leave the postcard in the lab.

## Commit 0: links and saves the shipped page can still read

Do this first, in orbit2 and in the port, before any id that writes new fields. Problem ([[ORBIT2-17]] SHOULD, verifier
and architect): `Lane.toJSON` (`orbit2/src/poly/lanes.js:548`) writes `ratioIndex` into R2's 15-entry `RATIOS` under
the same link `v: 1` and the same save keys. The shipped `Lane.from` (`src/poly/lanes.js:98`) reads that index into its
10-entry table: 33 of 40 orbit2 links play at the wrong speed there, and ×2 (index 10) is `undefined`: a silent lane and
a `padEnd` error. `sw.js` is network first, so an old cached page meets new data only offline or on a failed fetch, but
it does happen.

Recommended fix (one change, both links and saves, no new key):

1. `Lane.toJSON` writes `ratio` (as now) and `ratioIndex` **as the index in `OLD_RATIOS`** when the ratio is one of the
   ten old ones; for a new ratio (×5/4, ×4/3, ×7/4, ×5, ×6) it leaves `ratioIndex` out. The shipped constructor then
   falls back to ×1 (`ratioIndex = 5`): a wrong speed on that one lane, no crash.
2. `ratioFrom` already prefers `ratio`, so orbit2's own reading does not change. Add a test: every `RATIOS` entry
   through `toJSON` → the shipped `Lane.from` (import `src/poly/lanes.js` in the test) gives a defined ratio, the old
   ten the same one.
3. Keep link `v: 1`. The shipped decoder refuses anything else (`src/poly/export.js:52`: `o?.v !== 1` → "not an
   Orbits link"), so `v: 2` would turn away every new link on an old page, even the ones it would play right. `v: 2`
   is the fallback for data an old page can't play at all.

If 32-step lanes or 6 lanes reach a shipped page (after the "Longer patterns" port), the same question comes back: the
shipped `Lane.from` takes `hits` as given and `Machine.from` takes every lane. Re-check then; if a shipped page breaks
on them, write link `v: 2` (a clean refusal on old pages) and a new save key (`v3`, reading `v2` as a fallback).

## Storage keys: renames to undo

Every key orbit2 renamed goes back to its shipped name in the port. The port must never read or write
`midi-warz.orbit2.*` (the lab stays live at `orbit2/index.html` with its own data).

| orbit2 key | port writes | where it is set in orbit2 | shipped key exists? |
| --- | --- | --- | --- |
| `midi-warz.orbit2.v2` (pattern autosave) | `midi-warz.poly.v2` | `orbit2/src/poly/app.js:33` (`SAVE`) | yes |
| `midi-warz.orbit2.settings.v1` | `midi-warz.poly.settings.v1` | `orbit2/src/poly/app.js:54` (`SETTINGS`) | yes |
| `midi-warz.orbit2.engine` | `midi-warz.poly.engine` | `orbit2/src/poly/app.js:145` (`ENGINE_KEY`) | yes |
| `midi-warz.orbit2.slots.v1` | `midi-warz.poly.slots.v1` | `orbit2/src/poly/slots.js:24` (default `key`) | yes |
| `midi-warz.orbit2.library.v1` | `midi-warz.poly.library.v1` | `orbit2/src/poly/library.js:3` (`LIB_KEY`) | yes |
| `midi-warz.orbit2.saved.v1` (pre-library save, read once) | `midi-warz.poly.saved.v1` | `orbit2/src/poly/library.js:4` (`OLD_SAVE`) | yes |
| `midi-warz.orbit2.tempo` | **`midi-warz.tempo`** (shared by every page) | `orbit2/src/tempo.js:2` (`KEY`) | yes |
| `midi-warz.orbit2.quests` | `midi-warz.poly.quests` (new key, only with I6 / I7) | `orbit2/src/poly/quests.js:15` (`QUESTS_KEY`) | no |
| `midi-warz.samples.slices`, IndexedDB `midi-warz-samples`, `unasm-slices` | unchanged (always shared) | `orbit2/src/samples.js:49` | yes |

Do the rename as the last edit of each copied file (a whole-file copy brings the orbit2 key with it), and guard it with
a test: `grep -r "midi-warz.orbit2" src/ test/ poly.html` must find nothing (add it to `tools/smoke.mjs` or a unit
test that reads the files).

## Saved data: what existing users' data needs

No migration step runs; the ported readers repair on load, as orbit2 does now. What changes for a shipped user:

- **Pattern, slots, library, settings, links:** read as they are. `Machine.from`, `Lane.from` (`ratioFrom`,
  `lockFrom`, `sampleFrom`) fill new fields with values that play exactly as before (architect: same hit lists on 1,500
  random patterns; ines: same event streams; sound: same audio).
- **One-way repairs** (the next save writes the repaired form; an old cached page still opens it):
  - `voice: 'perc'` → `'wood'` (B2). Before, it played a kick by accident. Release note.
  - Old settings gain `evo.maxBars = 32` (V1, `orbit2/src/poly/app.js:84`): an evolve that wandered past 32-bar cycles
    is now held. Only with the Generative package. Changelog.
  - Steps 17–32, lanes 5–6, ratio values, meters: written only once the Longer patterns / Clock packages land, and only
    when used (after "Smaller saves").
- **Tempo:** stays in `midi-warz.tempo`. B9's `clampTempo` keeps two decimals instead of whole bpm; other pages read it
  with their own rounding (check Drums, Punchliner, Lights, Chaos, Unassembler, the launcher in the smoke).
- **First visit vs return** (F3): "first visit" = no `midi-warz.poly.v2`. Every shipped user who ever opened Orbits has
  that key, so they see "welcome back" with their last beat, never the demo.
- **Lab users** (the conductor): orbit2 data stays under its own keys; nothing imports it. To carry a lab beat over,
  share it as a link from orbit2 and open the link in the shipped page (works once Commit 0 is in, for any ids ported).
- **Tick-stamped data** (ines): anything stored in ticks moves from 24 to 840 PPQ with R1. The shipped `Lane`
  derives positions from the tick and saves steps, not ticks; check every saved field the Clock package adds (slot
  start ticks for P4, bar anchors for R3) is stored in steps / bars or converted on read.

## Risks

- **Shared root files.** `src/gauge.js` (T3; Punchliner, Unassembler), `src/ui.js` (T1; Orbits only today),
  `src/tempo.js` (B9; 7 pages), `src/unasm/wav.js` (E1, E6; Unassembler), `src/punch/smf.js` (E3, R3; Punchliner),
  `src/samples.js` (S1–S3; Unassembler). Each commit that touches one runs `node tools/smoke.mjs` on every page.
- **`styles.css` is shared by every page.** orbit2's copy adds +216 / −35 lines, mostly in Orbits blocks (comments
  name the id: "T2 / T7 target sizes", "C1: the transport strip", "G4 ghost tier", …). Merge per block, never copy the
  file: the shared blocks (launcher, drums, Punchliner, Unassembler) must stay as they are.
- **`app.js` is the bottleneck** (869 → 2063 lines). The "now" ids are small hunks and port as patches; the later
  packages need the clock, gestures, share, jam, layout and generative UI split into modules in orbit2 first (architect).
- **Audible changes in live play:** B1 (swing at ×¾, ×3/2, ×3 and odd lengths), `holdParam` (a send-0.6 lane gets
  ~10 dB more live echo, now equal to the export; "Port back: live chain params at time 0"), B7 (samples play whole).
  One release note.
- **CPU on phones:** scheduler callback 0.223 → 0.308 ms mean on the same pattern, 12.6 ms max on a heavy one. G5, V4's
  ×8 and V5 only after a phone measurement.
- **Hardware:** B9, R1 (MIDI clock in / out), P1–P7 (the Move) need one pass on the real device; the panel drove none
  of it end to end.
- **Two tabs** autosave over each other (shipped did the same); not a port blocker, a Later item.
- **Links grow ~11 %** (878 vs 787 chars on 40 shipped patterns) once L1 lands; "Smaller saves" first.
- **Names:** `shareLink` / `shareUrl` (ines) — pick one when `share.js` comes over.
- **Service worker:** `sw.js` caches `poly.html` and `styles.css` in `midi-warz-v1`. Bump `CACHE` in the first port
  commit that changes the page, so installed users don't mix an old page with new modules.

## Suggested order of small commits

Each commit: the id's code + its tests, `npm run check`, `npm test`, `node tools/smoke.mjs http://localhost:<port>`
(every page), no `midi-warz.orbit2` string anywhere outside `orbit2/`. One id (or one tight pair) per commit.

1. **Commit 0** (in orbit2 first, then the port): `Lane.toJSON` writes old-table `ratioIndex` (see above) + test.
2. `B11` mutes out of undo — `history.js`, `app.js`. Smallest, model only.
3. `B4` cycle with conditions and dice — `lanes.js`, `app.js`.
4. `B2` + `B3` default voices, 'perc' repair, kit readout — `lanes.js`, `app.js`. Release note.
5. `B1` swing on absolute parity + tooltip — `lanes.js`, `scene.js`, `app.js`. Release note.
6. `B5` + `E5` one take for every export, export all — `dice.js`, `export.js`, `app.js`.
7. `B7` samples play whole + offline `onended` guard — `app.js`, `lanes.js`.
8. `B6` live record writes a `vel` lock (no tiers) — `app.js`.
9. `B8` + `B12` keys vs focus, quiet readout — `app.js`, `poly.html`, `styles.css`.
10. `B10` UI work out of the clock callback — `app.js`.
11. `B9` clock-in tempo + `src/tempo.js` 0.01 bpm — `midiio.js`, `app.js`, `tempo.js`. Smoke all pages; hardware check.
12. `E1` + `E6` 24 / 32-bit WAV, `smpl` — `src/unasm/wav.js`, `app.js`, `jam.js`. Smoke Unassembler.
13. `E3` Drum-Rack MIDI — `src/punch/smf.js`, `export.js`, `app.js`. Smoke Punchliner.
14. `T3` gauges as sliders — `src/gauge.js`. Smoke Punchliner and Unassembler.
15. `T1` + `T2` long-press, step buttons — `src/ui.js`, `app.js`, `styles.css`.
16. `T4` + `T5` + `T6` + `T7` tabs, playhead, Move toggle, sizes — `app.js`, `poly.html`, `styles.css`. iOS check.
17. `C4` + `C3` diagnostics behind `?debug`, less text — `app.js`, `poly.html`, `styles.css`.
18. `F4` musical randomize — new `src/poly/grooves.js`, `lanes.js`, `app.js`, `poly.html`, `styles.css`.
19. `F3` continue last beat (+ a first-visit beat: F2's demo or `initPattern()`) — `app.js`, `poly.html`,
    `styles.css`. Bump `CACHE` in `sw.js` here at the latest.
20. `I7` plain words (labels only) — `app.js`, `poly.html`.
21. Release note for the batch (B1, B2, B7, `holdParam` if it came along).

Then the later packages, one at a time, each opened with its gate: Clock + meter → Groove → Longer patterns → Samples
+ breaks → More exports → Voices → Live (after the hardware pass) → Generative → Layout → Canvas + sharing → Learning.

## What stays in orbit2

- `orbit2/tools/cdp.mjs` and `orbit2/tools/build-worklet.mjs`: the root has its own `tools/build-worklet.mjs` and
  `tools/headless-chrome.sh`; port `cdp.mjs` to `tools/` only if a root test needs it.
- `orbit2/docs/`: the lab's history; the port links to it from commit messages, it doesn't move.
- The lab page itself keeps running at `orbit2/index.html` with its own keys until the conductor retires it.

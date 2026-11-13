---
type: review
phase: ORBIT2-17
title: ORBIT2-17 final full-panel review and port-back plan, review panel
date: 2026-11-13
round: 1
stalled: 0
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
  kai: HAPPY
  maya: HAPPY
  dex: HAPPY
  ines: HAPPY
  tomi: HAPPY
  greta: HAPPY (NOT HAPPY with no in-scope MUST-FIX, see Round 1)
  rio: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-16]]'
---

# ORBIT2-17 · Final full-panel review: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), kai, maya, dex, ines, tomi, greta, rio. Process:
[[REVIEW-PANEL]].

This phase builds nothing. Its scope is orbit2 as a whole against the shipped Orbits (`poly.html` + `src/poly/`,
unchanged since the lab copy `f1b4387`), and it feeds the port-back plan (`orbit2/docs/PORT-BACK.md`, a later task).
Phase start: `f038ff1` (ORBIT2-16 closed). The lab since the copy: `git diff --stat f1b4387..f038ff1 -- orbit2/` = 59
files, +11104/−850 (`orbit2/src/poly/app.js` 869 → 2063 lines, `lanes.js` 144 → 768).

## For the brief: what the panel compares

| phase | title | rounds | result | panel |
| --- | --- | --- | --- | --- |
| [[ORBIT2-01]] | bug batch (B1–B12) | 4 | HAPPY | verifier architect sound kai ines |
| [[ORBIT2-02]] | first visit and musical randomize (F1–F5) | 2 | HAPPY | verifier architect sound maya rio |
| [[ORBIT2-03]] | touch and accessibility (T1–T7) | 3 | HAPPY | verifier architect sound greta rio |
| [[ORBIT2-04]] | calmer screen (C1–C5) | 2 | HAPPY | verifier architect sound greta kai |
| [[ORBIT2-05]] | groove and dynamics (G1–G6) | 5 | HAPPY | verifier architect sound tomi dex |
| [[ORBIT2-06]] | clock resolution and meter (R1–R4) | 2 | HAPPY | verifier architect sound ines kai |
| [[ORBIT2-07]] | longer patterns and more lanes (L1, L2, L5) | 2 | HAPPY | verifier architect sound tomi kai |
| [[ORBIT2-08]] | new voices and articulations (L3, L4) | 3 | HAPPY | verifier architect sound tomi dex |
| [[ORBIT2-09]] | samples and breaks (S1–S3) | 2 | HAPPY | verifier architect sound dex maya |
| [[ORBIT2-10]] | export for producers (E1–E6) | 5 | HAPPY | verifier architect sound dex kai |
| [[ORBIT2-11]] | live performance (P1–P7) | 3 | HAPPY | verifier architect sound kai greta |
| [[ORBIT2-12]] | steerable generative (V1–V5) | 2 | HAPPY | verifier architect sound ines tomi |
| [[ORBIT2-13]] | seeing the structure (V6) | 1 | HAPPY | verifier architect sound ines greta |
| [[ORBIT2-14]] | playing on the canvas (I1) | 2 | HAPPY | verifier architect sound rio maya |
| [[ORBIT2-15]] | sharing (I2–I5) | 2 | HAPPY | verifier architect sound rio dex |
| [[ORBIT2-16]] | learning and simple mode (I6, I7) | 2 | HAPPY | verifier architect sound maya greta |

Done backlog ids (73, full text in [[BACKLOG]] lines 13–172): B1–B12, F1–F5, T1–T7, C1–C5, G1–G6, R1–R4, L1–L5,
S1–S3, E1–E6, P1–P7, V1–V6, I1–I7. Not built: A1–A7 (phase 18). Nothing deferred. "Later" holds every known
non-blocking item from phases 01–16.

How the panel compares: one `launch()` of `orbit2/tools/cdp.mjs` per reviewer, both pages opened from the same server
and Chrome profile (`b.open('poly.html')`, `b.open('orbit2/index.html')`; same origin, separate keys: shipped
`midi-warz.poly.*` + the shared `midi-warz.tempo`, orbit2 `midi-warz.orbit2.*`). Page handles: `window.__poly` on
both (orbit2's is a superset). A fresh profile is a first visit on both pages (shipped: `initPattern()`, one kick;
orbit2: the `poly345` demo in the simple view).

## Pre-checks

`npm run check` clean, `npm test` 229 + 9 green on `f038ff1` before the panel started.

## Round 1: 9 of 10 HAPPY, greta's one item a SHOULD → the whole panel HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; kai, maya, dex, ines, tomi, greta,
rio on sonnet), own ports 5401–5410 (+ 940x); the verifier also ran the smoke (server 5451 + Chrome 9222). Brief: the
phase goal, the 73 done ids (titles; the full text in [[BACKLOG]] lines 13–172), the 16 phase reviews with their rounds
and results, `git diff --stat f1b4387..HEAD -- orbit2/` (59 files, +11104/−850), `git status --short` (only this
file), the must-fix rule for this phase (1 a done id that doesn't do what its text says, 2 a regression against
`poly.html`, 3 a broken test / check / smoke, a page error or data loss, including a save or `#p=` link in the shipped
format that orbit2 can't open; Later items and A1–A7 are SHOULDs), how to drive `poly.html` and `orbit2/index.html`
from one `launch()` (Move bytes, LEDs, a shipped link, shipped saves under the orbit2 keys), and the port-back list
format. `stalled: 0`: nothing was open before round 1, and everyone is HAPPY.

| reviewer | verdict | MUST-FIX |
| --- | --- | --- |
| verifier | HAPPY | — check clean, 229 + 9 green, smoke 10/10. A shipped beat (locks, `1:2` / `2:3` / `first`, ratchet ×3 with fade, a choke, ¼ to ×4, the 'perc' lane 4) plays hit for hit in orbit2 (119/119, times within 1 µs) from a shipped save, slot, library setup and `#p=` link; 'perc' → 'wood' (B2). Saves, slots, setups, settings and links written by four earlier orbit2 phases (`c6bd5e9`, `1005992`, `943a665`, `fc54a63`, each run from `git archive`) play 180/180 on HEAD. 6 × 32 in 7/8 with every lock kind round-trips link, tab and reload (link 1286 chars). 40 / 240 bpm clamp on both; 240 bpm, 6 × 32, ×6, ratchet 8 everywhere: stress 0 %. Empty pattern plays and exports; a 4.5e12-tick cycle stays a safe integer, its MIDI export cut at 64 bars as shipped; undo across mutes, groove loads, links and lane counts; 390 / 320 / 768 px no overflow; a 4-bar WAV the same 436454 frames as shipped (+ `smpl`) |
| architect | HAPPY | — 173 + 56 + 9 green, check clean. 1,500 random shipped patterns give the same hit lists in both models (plain, conditions with ratchets and fades, chance + humanize on locked dice, mute / solo, swing at the non-triplet speeds); a shipped link and every shipped key (pattern, slots + chain, library incl. the old `saved.v1`, settings) load with the same pattern, the 4-lane MIDI map filled to 6 lanes; evolve with locked dice picks the same kinds on old patterns (0/200 differ). Scheduler callback cost measured (see SHOULD) |
| sound | HAPPY | — the same beat (built in `poly.html`, moved by link and by save) in both apps on both engines: dsp mix RMS −23.84 / −23.63 dBFS, envelopes within 0.1 dB, kick stem cancels to −38.6 dB, onsets ±2 samples; synth within the apps' own render-to-render spread; the save path renders bit for bit like the link path (−109.7 dB). Loop seams −57…−84 dB (no click). Jam takes (dsp, 48 kHz): onsets the same to a sample, lane levels to 0.01 dB, headroom min 70.7 / 70.3 ms. A shipped sample lane: export = live = shipped live. orbit2 also fixes three shipped flaws: the cold first downbeat (+4.4 dB in the first 5 ms), the stems' raw mix clipping, and sample lanes exporting as silence |
| kai | HAPPY | — mutes queue to the bar and apply, the fill latch arms → on at the bar, mutes stay out of undo, Play / Stop / reset clear the queue and latch; a slot recall lands at the bar, `chainSlots` sets the chain; shipped `.v2` + `.slots.v1` and a shipped link load; 173 unit tests green. MIDI clock in / out not driven end to end (no port in the budget) |
| maya | HAPPY | — 390×844: no page errors, no horizontal overflow; randomize in "everything" clean; a shipped link opens with 4 lanes |
| dex | HAPPY | — shipped link and save load (16 → 32 steps padded, 'perc' → 'wood'); a synthesised 2.8 s, 16-burst WAV through `breakFromFile` → a 16-slice lane; export all: mix, 4 stems, raw mix and MIDI, every WAV 423360 frames (aligned to the sample); 24-bit PCM and 32-bit float; kit 8 one-shots, onsets 0–15 samples; stems 5 files; slice lane WAV with `acid` + `smpl`; per-lane and Drum-Rack MIDI |
| ines | HAPPY | — 173 tests green. Shipped vs orbit2 `Machine.tick` event streams compared in beats over 32 beats (PPQ 24 vs 840): a polymeter with rotation, accent and ×1 / 3/2 / 2 / ⅓, a rotated 7-step lane, 8- and 7-step lanes at swing 0.5: identical. Old ratio indexes migrate by value (7 → 10 = ×2, 9 → 12 = ×3); a 6-lane link with a 32-step lane, nudge, swing and offset round-trips `toJSON` identical; every export works on desktop, phone and `?debug` |
| tomi | HAPPY | — a 12-step shipped kick moves by link with its hits; shipped saves load; `exportWav` with `acid` + `smpl`, first onset frame 3. (Swing through a link: not checked by tomi; the verifier's and architect's hit-list matches and sound's swung hats cover it) |
| greta | NOT HAPPY → counts as HAPPY | 1 (raised as NEW, rule 1, T1 / C1): at 390×844 a returning visit's welcome bar "×" (`#wb-close`, 327,800, 40×44) lies under the fixed ▶ (`#btn-play`, 298,752, 76×76): `elementFromPoint` at its centre is the play button, a tap starts playback. **Judged a SHOULD:** it is the Later item "Floating play over content" (ORBIT2-04, greta: "the 76 px play sits over the welcome bar's '×' … until you scroll"), which the brief names as non-blocking, and no done id's text is broken (F3's two choices, "keep jamming" and "start fresh", work; T1's text is long-press for every modifier gesture; C1 asks for play in the thumb zone). Reproduced by the implementer (5400/9400, cdp): at first paint the hit point at the × is `btn-play` and a tap starts the transport; after a 120 px scroll (the page is 3319 px tall) it is `wb-close`. Also checked: 349 named controls, 2–3 px focus rings, step buttons with `aria-pressed`, 67 sliders, two live regions; 229 green, check clean |
| rio | HAPPY | — 390×844 with trusted taps: a shipped link and shipped `.v2` / `.slots.v1` / `.library.v1` load (pattern and "slot 2" back); edit → reload shows "welcome back"; `loadDaySeed` loads "tresillo over four · dice 9467 · 101 bpm"; `shareAudio` renders 4 bars in 1.4 s, downloads 1.69 MB, copies the remix link; 5 targets under 32 px against 72 on the shipped page |

SHOULDs (never block; known Later items named, new ones in [[BACKLOG]] Later as "ORBIT2-17 round 1"):

- **Links and saves old pages can read** (verifier, architect; NEW): `Lane.toJSON` (`lanes.js:548`) writes
  `ratioIndex` into R2's 15-entry table under the same link `v: 1` and save keys; the shipped `Lane.from` reads it into
  its old 10-entry table. 33 of 40 orbit2 links (66 of 160 lanes) play at the wrong speed in the shipped code; ×2 is
  index 10, `undefined` there: a silent lane and the status "link: Cannot read properties of undefined (reading
  'padEnd')". The comment at `export.js:193` claimed an old page opens a new link. orbit2's own reader never reads that
  index (`ratioFrom` prefers `ratio`). With `sw.js` a cached pre-port page can meet new data: write the old-table index
  where the ratio exists in `OLD_RATIOS`, or bump the link `v` and the save key.
- Port-back notes: B1 changes how swung lanes at ×¾, ×3/2 and ×3 sound (300/300 random shipped patterns differ there,
  `Lane.swungAt` counts per beat; even lengths at the other speeds 0/300) and odd lengths (the fix itself): a release
  note (architect). Old evolve settings gain `evo.maxBars = 32` (`app.js:58`), so an evolve that wandered past 32-bar
  cycles is now held (verifier). `holdParam` gives a send-0.6 lane ~10 dB more live echo (sound; Later "Port back: live
  chain params at time 0"). F is focus mode, not lane 2 step 4 (verifier; Later "F is also a pad"). The port edits root
  files other pages use (`src/gauge.js` T3, `src/ui.js`, `src/unasm/wav.js` E1 / E6, `src/punch/smf.js` E3,
  `src/samples.js` S2) and orbit2's tempo key is its own (`midi-warz.orbit2.tempo`; keep the shared `midi-warz.tempo`):
  smoke every page (architect). The shipped `Lane.evolve` clamps ratios to old indexes 3–8, and anything tick-stamped
  moves from 24 to 840 PPQ (ines). A hardware pass (the Move, MIDI clock in / out) before P1–P7, B9, R1 (kai). Links
  ~11 % longer (878 vs 787 chars on 40 shipped patterns; Later "Smaller saves" before L1) (architect). `shareLink` /
  `shareUrl` names (ines). Move pads play by default (P1 `perf.live`): a visible live / edit cue on the port (kai; Later
  "Live-mode cues on screen").
- **Per-hit cost** (architect; NEW): scheduler callback at 117 bpm, shipped 0.223 ms mean / p99 3.2 / max 4.2 against
  orbit2 0.308 / 4.8 / 6.8 on the same pattern; a heavy 6 × 32 pattern (×8 curved ratchets, coupling, a cycle
  modulator, timbre dice, evolve every bar) 0.67 / 11.5 / 12.6 ms; no outlier at evolve bar lines (B10 holds). The
  extra is in `hitSound` and the voices (G5, V5, strokes): measure on a phone before porting G5, V5, V4's ×8.
- `app.js` (869 → 2063 lines) is the port's bottleneck: extract the clock, gestures, share UI, P6, jam, layout / focus
  and generative UI in orbit2 first (architect; Later "Split the layout + focus-mode block", "app.js structure after
  phase 11", "app.js after phase 12", "A gestures module", "A share module", "A jam module").
- **Slices in the MIDI export** (dex; NEW): a slice-set lane exports every step on the lane's one note (42, the `hat`
  default under a break), so an 8-slice break in a Drum Rack plays one pad. Ghosts missing from the kit export: E4
  renders accent and normal, no ghost tier (dex; NEW). A break's tempo vs the file's (dex; Later "Tempo from the break").
- **Two tabs** (rio, tomi; NEW): two tabs autosave over each other (a friend's link opened in a new tab overwrites
  `midi-warz.orbit2.v2`); slots saved in another tab aren't seen until a reload.
- Phone: the fixed ▶ over the quest card and the welcome bar's × (verifier, maya, rio, greta; Later "Learning on a
  phone", "Floating play over content"); a top-heavy first screen, ~315 px of strip, Move connect and status before the
  orbit (maya, rio, greta; Later "Phone header height", "First-visit screen"); the stage caption ("five over four")
  over the lane legend, the demo's text box over the lane captions (maya; NEW); 5 targets under 32 px, phone gauges
  25–28 × 44 (rio, greta; NEW); "Connect Move" the loudest control without a Move, check T6 on iOS (maya, rio).
- Words and keys: the status line in simple still reads "REC o", "EVOLVE OFF", "KIT CUSTOM" (maya; NEW); ~40 Tab stops
  before the first lane, a skip link (greta; Later "First Tab stop"); the Move drawer's name read "Move esc ×" (greta,
  same on the shipped page: done below).
- Sound (all known Later): dsp boombap touches 0 dBFS (1 sample, 3 over −1 dBFS) through the same comp + `Limiter(-2)`
  as shipped ("A brickwall at the master"); dsp 2–4 dB louder than synth ("dsp engine voice levels", "Loudness
  target"); the jam raw mix −0.56 dBFS ("Jam raw-mix headroom"); the synth wood's random level ("Accent on hat and
  wood", "Seeded noise in offline renders").
- Live: "mute on next bar" is opt-in (kai, taste; NEW).

GOOD (the panel's own words, condensed): saved data and links stay compatible across the shipped page and every orbit2
phase (`ratioFrom` / `OLD_RATIOS`, `lockFrom`, `sampleFrom`, `Machine.from`'s repairs, new fields written only when
set) (verifier, architect, ines, kai, dex, rio, tomi, maya); the model is a strict superset of the shipped one: the
same hit lists, timing and sound for shipped beats (architect, ines, sound); the export pipeline (one roll per action,
sample-aligned mix and stems, 24 / 32-bit, `acid` + `smpl`, clean kit one-shots) (sound, dex, verifier); the undo model
(verifier); the live layer (kai); the calm first screen and the accessibility tree (greta, rio); share + audio in one
tap (rio).

### Port-back lists (they feed `orbit2/docs/PORT-BACK.md`)

Each reviewer's own ranking, in their order, with their reasons condensed.

- **verifier.** NOW: F3 (the shipped page throws the saved beat away on every visit), B11, B5 + E5, B2 (shipped 'perc'
  plays a kick; migration verified), B8, B7, B6, B4, E1 + E6 (additive, same frame count), T2 / T3 / T4, F4 (pure),
  B9 + B10 (check on hardware), B1 (tell users), C4. LATER: R1, R2, L1, L2 first (decide link / save versioning, port
  `ratioFrom` / `OLD_RATIOS` with them); G1–G6, R3, R4 after R1; E2–E4 after B5 / E5; S1–S3 after L1; I2–I5 after the
  link-format decision; P1–P7 after the L2 / L5 Move mapping, on hardware; V1–V6 after R4 (`maxBars` in a changelog);
  F1, F2, F5, L3, L4, L5 after the voices are level-matched across engines; I1 after T1 / T2; I6, I7 after the phone
  fix; C1, C2, C3, C5 (C5 once the F clash is settled). NEVER: none.
- **architect.** NOW: B2, B4, B5, B11 (model bugs with tests, no format change); F3; B6 (as a plain vel lock, without
  G4) and B7; B8, B12, B3, T1–T7 (T3 goes into the shared `gauge.js`: smoke every page); B9, B10 (the phase-01
  versions, before R1's scaling); B1 (release note); F4; F1, F2, F5 (F5 after B4); E1, E3, E6 (shared files: smoke);
  C4, C3; P5, P3, P1, P2, P7 (one pass on the real Move first); V1 (default weights keep the old evolve, 195/200 end
  identical). LATER: R1–R4 as one clock package (scheduler out of `app.js`, versioning first), then G1, G2, P4, V2;
  L1, L2, L5 ("Smaller saves" first, Move pad window); G3–G6 (one tap rule, swing templates vs ×3 lanes, phone CPU for
  G5); E5, E2, E4 (stems one at a time, a routing test outside the browser); L4, L3 (per-voice trims, store a stroke's
  name); V3–V6; P6 (a module first); C1, C2, C5, I7, I6 (the layout rebuild first: one Escape handler, a grid stage, a
  focus key that isn't a pad key; a demo with a real snare, visible badges); S1–S3 (sweep unused sample audio, one buffer
  per slice set, port the Unassembler sender with the reader); I1–I4 and I5's Seed of the Day (gestures and share UI as
  modules first). NEVER: I5's postcard (4 bars recorded in real time lose the tap's permission before the sheet; I3's
  file already shares the sound).
- **sound.** NOW: B7 with the offline `onended` guard (`orbit2/src/poly/app.js:201–203` vs `src/poly/app.js:122`: the
  shipped exports render sample lanes as silence), B5 + E5 with `PRE_ROLL`, E1, E2 with its stem headroom, E6, E4, B1,
  G5 (normal and accent untouched), B10. LATER: L4 and its kits (per-voice synth / dsp trim first), F1 / F2 (a
  true-peak limiter or soft clip and the trim first), V4 (the brickwall), P6 (delay drift, filter voicing), S1–S3 (one
  buffer per slice set, the sweep, the shipped v2 reader), R1–R3 (96 PPQ MIDI rounding, ACID for /8 meters), I3 (a
  listening version), G6 (beat or bar). NEVER: none.
- **kai.** NOW: P2, P3 (self-contained in `perform.js`), B11, B8, P1 (only with a visible live / edit cue), B9, P5,
  B6, B10. LATER: P6 (audio-graph check), P7 (after P1 and `pages.js`), P4 (the `Lane.at()` start-tick decision), R1,
  R3 (after the clock-out divider and the save format), L1, L2 (migration, Move pad pages). NEVER: I5, I6, I4 (taste:
  onboarding that would clutter the shipped tool).
- **maya.** NOW: B1–B12 (B2, B3, B4, B5, B6, B7, B8, B11 first), F1, F2, T1, T2, T3, I7, I6, F4, I2, I3. LATER: C1–C5
  (the phone layout first), I4, I5 (a shared library format), L1, L2, G1–G6 (the save format), S1–S3, E1–E6 (the
  shared sample store), P1–P7 (hardware), V1–V6 (the dice and evolve UI). NEVER: none.
- **dex.** NOW: E1, E5, B7, B5, E2, E3 (after the slice notes), S3, E6, G4, B6. LATER: S1, S2 (MIDI slice mapping,
  tempo prompt, the shared `samples.js` format), E4 (a ghost tier first), G1, G2, G3, G5, G6 (a UI home in the shipped
  layout), L1, L2, R1–R4 (whether the shipped Orbits wants them). NEVER: I5 (no daily-content home), I6, I7 (orbit2's
  identity; the shipped Orbits stays the plain tool).
- **ines.** NOW: B1, B4, B2, B9, B6, B5, B7, R4, G1, G4, G6, V3, E1, E3. LATER: R1, R2 (`lanes.js` and `export.js`
  together with `ratioFrom`), R3 (needs R1), V1, V2, V4, V5 (the largest port), L1, L2 (after R1 and the format),
  S1–S3 (the shared sample format), P1–P7 (after the `app.js` split and the dsp trims). NEVER: C5, I5 (product taste).
- **tomi.** NOW: E6, B1, G4, G6. LATER: R3 (the meter model), G1, G2 (the groove model), G5 (voices and dsp), L3, L4
  (the kit changes). NEVER: none.
- **greta.** NOW: T2, T3, B8, B12, T7 + T1 (after the floating-play overlap), I7, C2, C3, T5, C4, B1–B7, B9–B11.
  LATER: I6 (the view switch first), F2, F1, C1, C5 (the phone layout), T4 (tablist or group), I2, I3, I4, G1–G6,
  R1–R4. NEVER: none.
- **rio.** NOW: F2, F3, I2, I3 (the growth loop; the link format is compatible), T1, T2, T7 (72 small targets on the
  shipped page), I7, C1, C3, C4, F1, F4, I5 (Seed of the Day). LATER: I6 (needs I7), I4, I1 (touch conflicts), P2, P3
  (after the strip), L1, L2. NEVER: the postcard WebM as a first port (heavy real-time recording).

Tally per id (a mechanical count of the lists above: who put it where; "leans" = the bucket with the most votes, a tie
leans later). For I5, architect and rio split it: Seed of the Day later / now, the postcard never.

| id | now | later | never | leans |
| --- | --- | --- | --- | --- |
| B1 | 7 ver arc snd may ine tom gre | 0 | 0 | now |
| B2 | 5 ver arc may ine gre | 0 | 0 | now |
| B3 | 3 arc may gre | 0 | 0 | now |
| B4 | 5 ver arc may ine gre | 0 | 0 | now |
| B5 | 7 ver arc snd may dex ine gre | 0 | 0 | now |
| B6 | 7 ver arc kai may dex ine gre | 0 | 0 | now |
| B7 | 7 ver arc snd may dex ine gre | 0 | 0 | now |
| B8 | 5 ver arc kai may gre | 0 | 0 | now |
| B9 | 6 ver arc kai may ine gre | 0 | 0 | now |
| B10 | 6 ver arc snd kai may gre | 0 | 0 | now |
| B11 | 5 ver arc kai may gre | 0 | 0 | now |
| B12 | 3 arc may gre | 0 | 0 | now |
| F1 | 3 arc may rio | 3 ver snd gre | 0 | later (tie) |
| F2 | 3 arc may rio | 3 ver snd gre | 0 | later (tie) |
| F3 | 3 ver arc rio | 0 | 0 | now |
| F4 | 4 ver arc may rio | 0 | 0 | now |
| F5 | 1 arc | 1 ver | 0 | later (tie) |
| T1 | 4 arc may gre rio | 0 | 0 | now |
| T2 | 5 ver arc may gre rio | 0 | 0 | now |
| T3 | 4 ver arc may gre | 0 | 0 | now |
| T4 | 2 ver arc | 1 gre | 0 | now |
| T5 | 2 arc gre | 0 | 0 | now |
| T6 | 1 arc | 0 | 0 | now |
| T7 | 3 arc gre rio | 0 | 0 | now |
| C1 | 1 rio | 4 ver arc may gre | 0 | later |
| C2 | 1 gre | 3 ver arc may | 0 | later |
| C3 | 3 arc gre rio | 2 ver may | 0 | now |
| C4 | 4 ver arc gre rio | 1 may | 0 | now |
| C5 | 0 | 4 ver arc may gre | 1 ine | later |
| G1 | 1 ine | 6 ver arc may dex tom gre | 0 | later |
| G2 | 0 | 6 ver arc may dex tom gre | 0 | later |
| G3 | 0 | 5 ver arc may dex gre | 0 | later |
| G4 | 3 dex ine tom | 4 ver arc may gre | 0 | later |
| G5 | 1 snd | 6 ver arc may dex tom gre | 0 | later |
| G6 | 2 ine tom | 6 ver arc snd may dex gre | 0 | later |
| R1 | 0 | 7 ver arc snd kai dex ine gre | 0 | later |
| R2 | 0 | 6 ver arc snd dex ine gre | 0 | later |
| R3 | 0 | 8 ver arc snd kai dex ine tom gre | 0 | later |
| R4 | 1 ine | 4 ver arc dex gre | 0 | later |
| L1 | 0 | 7 ver arc kai may dex ine rio | 0 | later |
| L2 | 0 | 7 ver arc kai may dex ine rio | 0 | later |
| L3 | 0 | 3 ver arc tom | 0 | later |
| L4 | 0 | 4 ver arc snd tom | 0 | later |
| L5 | 0 | 2 ver arc | 0 | later |
| S1 | 0 | 6 ver arc snd may dex ine | 0 | later |
| S2 | 0 | 6 ver arc snd may dex ine | 0 | later |
| S3 | 1 dex | 5 ver arc snd may ine | 0 | later |
| E1 | 5 ver arc snd dex ine | 1 may | 0 | now |
| E2 | 2 snd dex | 3 ver arc may | 0 | later |
| E3 | 3 arc dex ine | 2 ver may | 0 | now |
| E4 | 1 snd | 4 ver arc may dex | 0 | later |
| E5 | 3 ver snd dex | 2 arc may | 0 | now |
| E6 | 5 ver arc snd dex tom | 1 may | 0 | now |
| P1 | 2 arc kai | 3 ver may ine | 0 | later |
| P2 | 2 arc kai | 4 ver may ine rio | 0 | later |
| P3 | 2 arc kai | 4 ver may ine rio | 0 | later |
| P4 | 0 | 5 ver arc kai may ine | 0 | later |
| P5 | 2 arc kai | 3 ver may ine | 0 | later |
| P6 | 0 | 6 ver arc snd kai may ine | 0 | later |
| P7 | 1 arc | 4 ver kai may ine | 0 | later |
| V1 | 1 arc | 3 ver may ine | 0 | later |
| V2 | 0 | 4 ver arc may ine | 0 | later |
| V3 | 1 ine | 3 ver arc may | 0 | later |
| V4 | 0 | 5 ver arc snd may ine | 0 | later |
| V5 | 0 | 4 ver arc may ine | 0 | later |
| V6 | 0 | 3 ver arc may | 0 | later |
| I1 | 0 | 3 ver arc rio | 0 | later |
| I2 | 2 may rio | 3 ver arc gre | 0 | later |
| I3 | 2 may rio | 4 ver arc snd gre | 0 | later |
| I4 | 0 | 5 ver arc may gre rio | 1 kai | later |
| I5 | 1 rio (seed) | 3 ver arc (seed) may | 5 arc (postcard) kai dex ine rio (postcard) | never (the postcard; the seed later) |
| I6 | 1 may | 4 ver arc gre rio | 2 kai dex | later |
| I7 | 3 may gre rio | 2 ver arc | 1 dex | now |

### Changes after round 1 (quick SHOULDs, after HAPPY)

- `orbit2/src/poly/export.js`: the share-link comment no longer claims an old page plays a new link; it says an old
  page decodes it, and points at "Links and saves old pages can read" (the `ratioIndex` table) in [[BACKLOG]] Later.
- `orbit2/index.html`: the Move drawer's "esc ×" hint is `aria-hidden`, so the summary reads "Move" (the shipped page
  has the same hint).
- [[BACKLOG]] Later: new entries for the round's SHOULDs not already there ("Links and saves old pages can read",
  "Port-back notes", "Per-hit cost on a phone", "Slices in the MIDI export", "Ghosts in the kit export", "Two tabs",
  "The stage captions on a phone", "Small targets left", "Plain words on the status line", "Mute on the next bar by
  default"); "Floating play over content" and "Learning on a phone" note the re-raise.
- Not done: the welcome bar / quest card under the floating ▶ (a phone layout change; several reviewers tie C1, C5, I6
  and I7's port to a layout rebuild), writing old-table `ratioIndex` (a save-format change; the port-back plan decides
  versioning).

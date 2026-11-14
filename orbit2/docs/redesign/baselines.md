---
type: report
title: "RD-1 baselines: today's Orbits, measured before the redesign"
created: 2026-11-14
tags: [orbit2, redesign, baseline, acceptance]
related:
  - '[[DECISION]]'
  - '[[BRIEF]]'
---

# RD-1 baselines

Today's `orbit2/index.html` (commit `0808f45`, before any redesign change), measured by `orbit2/tools/face-audit.mjs`
in a muted headless Chrome, each size a first visit (fresh profile: simple view, quest 1, the demo groove). Every later
phase is judged against these numbers and against the thresholds in `DECISION.md` (A1, A5, A6, A7, A9).

```sh
node orbit2/tools/face-audit.mjs --audio --play 10 --json /tmp/fa.json --shots /tmp/fa/   # ~2 min, ports 5400/9400
node orbit2/tools/face-audit.mjs --assert          # exit 1 while a threshold fails (today: 28 failures, expected)
node orbit2/tools/face-audit.mjs --sizes 1512x860 --port 5411 --debug-port 9411   # a reviewer, on its own ports
```

The agent-run baseline sets (A3) and glance trials (A2) are added below by the "Baseline sets" task.

## Summary (first load, 4 lanes, nothing open)

| | 1512×860 | 1512×982 | 1280×720 | 390×844 (phone) |
|---|---|---|---|---|
| **A5** controls visible (in view) | **79** | 81 | 57 | 16 (page scrolls) |
| controls drawn / in the DOM | 102 / 338 | 102 / 338 | 102 / 338 | 102 / 338 |
| the brief's count (layout boxes in the window / in the page) | 161 / 190 | 172 / 190 | 133 / 190 | 16 / 190 |
| controls visible with 6 lanes | 73 | 81 | 58 | 16 |
| **A1** text runs, min contrast | 86, **5.57:1** | 91, 5.5:1 | 78, 5.83:1 | 28, 6.8:1 |
| A1 text runs under 4.5:1 | 0 | 0 | 0 | 0 |
| **A1** control edges under 3:1 / measured (min) | **72 / 79** (1:1) | 74 / 81 (1:1) | 53 / 57 (1.01:1) | 13 / 16 (1.02:1) |
| **A1** brightest control pixel (luminance) | **1.0** (step 1, accent: white fill) | 1.0 | 0.828 (tempo knob value) | 0.828 |
| A1 controls with a pixel over 0.475 | 48 | 50 | 44 | 16 |
| A1 brightest canvas pixel, stopped / playing | 1.0 / 1.0 | 1.0 / 1.0 | 1.0 / 1.0 | 1.0 / 1.0 |
| **A6** page `scrollHeight` / `innerHeight` | 860 / 860 | 982 / 982 | 720 / 720 | 3225 / 844 |
| A6 scrolling inside (not a sheet) | right column 1221/697 | right column 1221/819 | left column 514/495, right column 1221/557 | (phone layout scrolls the page) |
| **A7** rings centre, outer radius (⌀) | (726, 507.5), r 301.1 (⌀ 602) | (726, 568.5), r 309.6 (⌀ 619) | (610, 437.5), r 205.8 (⌀ 412) | (195, 512.2), r 145.9 |
| A7 rings in focus mode | (756, 481.6), r 307 | (756, 549.9), r 350.6 | (640, 403.2), r 257 | (195, 422), r 145.9 |
| A7 rings, every drawer open / playing | unchanged | unchanged | unchanged | unchanged |
| frame callback p95 / interval p95 (playing 10 s) | 0.5 / 16.7 ms | 0.5 / 16.7 ms | 0.5 / 16.7 ms | 0.5 / 16.7 ms |

**Where today fails the decision** (`--assert`, 28 failures, all expected before RD-2…RD-10):
- **A1:** the text passes everywhere (min 5.5:1), but the controls are glass: 72 of 79 edges at 1512×860 are under
  3:1 (30 under 1.5:1: segment buttons, steps outside the loop, knob tracks at 16 % white; 30 between 1.5 and 2: the
  pill buttons' borders), and 48 controls carry a pixel over 0.475 (white text at 0.828 on undo / redo / fill /
  tempo…, the white accent step and the cyan play fill at 1.0). The canvas is not brighter than the controls (both
  reach 1.0).
- **A5:** 79 visible controls at 1512×860 (ceiling 50), 73 with 6 lanes (worst-case ceiling 62).
- **A6:** the page itself never scrolls on the desktop sizes, but the right column always does (1221 px of content in
  697 px at 1512×860), and with every drawer open the left column and the Move-controls popup do too.
- **A7:** the rings stay put when drawers open or play starts, but **focus mode moves and grows them** (30 px right,
  26 px up, +6 px radius at 1512×860; +41 px radius at 1512×982).

**The brief's "160 visible / 189 in the page"** counted layout boxes: Chrome keeps boxes for a closed `<details>`'
content (`content-visibility: hidden`), so 88 controls inside the closed drawers were counted as visible. The audit
reports that count too (`brief`: 161 in the window / 190 in the page today, one more control than on the day of the
brief) and judges A5 by what is drawn and in view: **79**.

## A9 audio baseline

Groove `house` (124 bpm) with dice locked at seed 4127, `exportWav` with a fresh profile's export settings (16-bit,
44.1 kHz, 4 bars, loop), rendered twice per engine in one page. Raw numbers and the per-window levels:
`baseline/rd01-a9.json`.

| engine | SHA-256 (first render) | two renders | fingerprint (20 ms RMS, 0.1 dB) |
|---|---|---|---|
| **dsp** (worklet) | `aa3db6e1a64566743208a1545d71173bc88c328eea77dca484c0a5c6f98bd10a` | differ in 30–54 samples by **1 LSB** (from ~0.24–0.63 s) | **`acf20b4e977cb76c`**, the same on every render and every launch (3 launches, 6 renders) |
| synth (Tone, the default) | `38f18855…` (changes every render) | differ almost everywhere, up to ~11 600 LSB, from 0 s: the noise voices are random | changes every render |

- **Neither engine renders bit-identically twice today**, so A9's "bit-identical to the RD-1 baseline" cannot be met
  as written even by an unchanged page. What a later phase can check: the **dsp fingerprint `acf20b4e977cb76c` stays
  the same** (a 1-LSB wobble keeps it; a level, timing or sound change moves it; unit-tested), and the synth render is
  judged by ear and level (Sofia) against `windowsDb` in `rd01-a9.json`. Seeding `Math.random` in the harness did
  not make the synth render repeat, so the randomness is not only Tone's noise buffers. This is a finding for Noor
  and Sofia (A9's wording), not a defect of this phase: the audio files are out of scope for the redesign.
- **Clock while playing** (synth, `?debug`, 10 s at 1512×860): **Tone.Loop lateness p95 −46.2 ms** (callbacks run
  46 ms before their audio time; the worst block −36.8 ms: never late), **stress p95 0** (max 0), frame callback p95
  0.6 ms, frame interval p95 16.7 ms. Five earlier runs the same day: lateness p95 between −47.8 and −48.6 ms, stress 0.

## How the audit measures (so later numbers compare)

- **Controls:** `button, a[href], input, select, textarea, summary, [role=slider|button|tab|switch|checkbox],
  [tabindex≥0]`. *Drawn* = `checkVisibility()` (visibility, opacity, closed drawers). *Visible* = drawn and in view:
  its box clipped by the window and by every scrolling or clipping ancestor (the right column's hidden part does not
  count). The list with names and boxes is in the JSON (`controls.list`).
- **Text (A1):** every element's own text runs (tight range boxes) plus form fields. The background is a screenshot
  with all text made transparent; the text colour × its opacity chain is composited on each background pixel of the
  run's box, and the run's contrast is the 10th percentile pixel. Text drawn on the canvas is not measured yet (RD-8
  adds canvas type; extend the audit then).
- **Edges (A1):** the median luminance of a 3 px band outside the control against its own 3 px inner band (75th
  percentile); a knob is its arc's box (85th percentile); a drawer header is its drawer's box. A segment button in a
  segmented group has no edge of its own (the group has one), so it reads ~1:1: that is how today's segments look,
  and the redesign's hairline words will be measured the same way.
- **Light (A1):** the brightest pixel of each visible control (text included) on a full screenshot, stopped and
  after 10 s of playing; the brightest canvas pixel is read from the canvas itself (max over the playing samples).
- **Scroll (A6):** `documentElement.scrollHeight` vs `innerHeight`, and every drawn element with `overflow-y:
  auto|scroll` whose content is taller than it, outside `#sheet, [data-sheet]` (RD-3's sheet may scroll), in the
  states default, every drawer open, focus mode, playing, and 6 lanes.
- **Rings (A7):** `__poly.scene.geo()` in page coordinates (canvas box + centre, outer ring radius), in the same
  states; A7 fails on a 1 px difference (rounded).
- **Frames:** every `requestAnimationFrame` callback timed while playing (the page's own work per frame) and the
  interval between frames, p95. Headless Chrome runs rAF at 60 Hz, so the interval reads 16.7 ms unless a frame drops.
- **Thresholds (`--assert`):** A1 at 1512×860, 1280×720, 390×844 (text ≥ 4.5, edges ≥ 3, control luminance ≤ 0.475,
  canvas brighter than every control); A5 at 1512×860 (≤ 50, ≤ 62 with 6 lanes); A6 at 1512×860, 1512×982, 1280×720;
  A7 at the three desktop sizes. Page errors exit 2.

Screenshots: `baseline/01…04` (the brief, 1512×860), `baseline/rd01-first-load-1280x720.png`,
`baseline/rd01-first-load-390x844.png`.

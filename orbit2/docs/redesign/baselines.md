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

The agent-run baseline sets (A3) and glance trials (A2) are at the end: [A3 baseline sets](#a3-baseline-sets-player-agents),
[A2 glance trials](#a2-baseline-glance-trials).

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
| frame callback p95 / gap p95 (playing 10 s; per callback, A9's per-frame time is in §A9) | 0.5 / 16.7 ms | 0.5 / 16.7 ms | 0.5 / 16.7 ms | 0.5 / 16.7 ms |

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
44.1 kHz, 4 bars, loop). Each render is **render #1 of a fresh page** whose `Math.random` is seeded (mulberry32, 12345)
before the page's first script and seeded again, with the frames held (and handed back after), just before
`exportWav`; two fresh pages per engine, six launches (`node orbit2/tools/face-audit.mjs --sizes none --audio --play
10`: two on 2026-11-14, four on 2026-11-15 after review rounds 2 and 3). Raw numbers and the per-window levels:
`baseline/rd01-a9.json`.

| engine | fingerprint (per 20 ms: RMS of L, R and mid, 0.1 dB) | the same on | null test: two fresh pages | SHA-256 |
|---|---|---|---|---|
| synth (Tone, the default) | **`fee43cee9cc5fe56`** | 12 of 12 renders (6 launches) | differ in 16–36 samples by **1 LSB** | moves with the 1-LSB wobble (12 different) |
| **dsp** (worklet) | **`96c2672430aa9851`** | 12 of 12 renders | identical, or up to 61 samples by **1 LSB** | moves between launches (1-LSB wobble) |

- **What a later phase checks (A9):** the same command gives the **same two fingerprints** and the null test holds
  (≤ 1 LSB between two fresh pages); a level, timing, pan or sound change moves the fingerprint (unit-tested: +1 dB,
  an L/R swap, one channel's polarity). Bit-identical renders are out of reach for an unchanged page (both engines
  wobble by 1 LSB in a few dozen samples, around −90 dBFS), so A9's "bit-identical" is read as this; the wording is
  Noor's to change (BACKLOG Later).
- **Why render #1 of a fresh page** (Sofia, round 1): the synth's noise voices fill Tone's noise buffers from
  `Math.random` on the first render; a second render in the same page plays that cache, so it never matched the first
  one. The task-3 baseline rendered twice in one page and concluded the synth could not repeat: wrong, and replaced.
  Its numbers (stereo-sum fingerprint dsp `acf20b4e977cb76c`, unseeded synth `38f18855…`) stay in `rd01-a9.json`
  under `previous`.
- **Clock while playing** (synth, `?debug`, 1512×860, 10 s, after the render, **the canvas drawing**: three
  pictures of it, 400 ms apart, all differ; the audit exits 2 when they do not): **Tone.Loop lateness p95 between −43
  and −49 ms** over every run (2026-11-14 and -15, HEAD and the phase start; −47.8, −44.5, −48.0 and −48.4 ms in the
  four launches of rounds 2 and 3, −43.7 in Sofia's round-3 run): callbacks run 43–49 ms before their audio time and
  are never late (max < 0). Judge a later phase by **"never late (max < 0) and p95 at or below −40 ms"**: the band's
  late edge (−43) is within a millisecond of an unchanged page's own runs, so it is not a threshold. **Stress p95 0**; the audio
  **headroom** (`stress.headMs`) p5 **about 65 ms or more** (67.9–71.4 ms; a floor: more headroom is not a deviation),
  the stress meter only moves under 30 ms. **Frame time p95 0.8 ms** (`frameMs.frame95`: each frame's rAF callbacks
  summed, about 600 frames in 10 s; frame interval p95 16.7–16.8 ms): this is A9's "frame time p95" (≤ +1 ms in a
  later phase). Per callback the p95 is 0.6–0.8 ms (`cost95`, about 1,600 callbacks in 10 s: a frame runs the scene,
  the automation loop and Tone.Draw, most near 0 ms, so a callback p95 moves when a phase adds or drops a cheap loop and
  sees heavy work in a few frames only in part; Sofia, round 3); the first two launches and round 1 have only the
  callback figure. The probe needs the synth engine (it counts Tone.Loop callbacks; on dsp it sees almost none).
- **Replaced (round 2, Sofia):** round 1's clock ran after a render whose `requestAnimationFrame` stub dropped the
  scene's next frame, and the scene's loop asks for each frame from inside the last one, so the canvas never drew
  again: its frame callback p95 of 0.1 ms (about 590 callbacks in 6 s) described a page that does not draw. The render
  now holds the frames and hands them back after (`holdFrames`, unit-tested). The old runs stay in `rd01-a9.json`
  under `previous.frozenClock`; their lateness and stress agree with the drawing page.

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
- **RD-2 changes to the measuring** (the RD-1 numbers above were taken before them):
  - a text colour that computes to `color(srgb r g b)` (what `color-mix()` gives) is read in 0–1, not as 0–255
    (before: lane-ink text read as black, contrast ~1:1);
  - a segment button's edge is its joined bar's edge (like a drawer header's), as this section already said it should be;
  - no edge is judged for a disabled control or a text link without a border (WCAG 1.4.11 exempts both; the link's
    text is judged by the text test);
  - a side cut off by the window or a scrolling column is left out of the edge bands (a control peeking in at the
    bottom, a drawer half scrolled away: the cut is not the control's edge);
  - `--tests A1` (only these gates count for `--assert`), `--diff baseline/rd01-controls.json` (RD-2's "no layout
    change": every visible control's centre vs the RD-1 first load, more than 2 px = moved, fails `--assert`).
  - (RD-2 review round 1) the diff compares **every drawn control in page px**, in view or not (`controls.drawn`; the
    first viewport alone hid the phone's 86 controls under the legend that rose 20 px), and a control that is gone or
    new fails `--assert` like one that moved; **TYPE** (computed family / size / weight of every drawn text, at first
    load and with everything shown: Major Mono only in the wordmark, 11 / 13 / 15 px under 40 px, weights 400 / 500,
    300 only from 40 px); **HIT** (the action words in view: `elementFromPoint` 19.5 px above and below the centre, at
    both ends and the middle, lands on the button: a 40 px hit area); `--root <dir>` audits another checkout with this
    tool. RD-2's gates: `--tests A1,TYPE,HIT,HUE --assert --diff orbit2/docs/redesign/baseline/rd01-controls.json`.
  - (RD-2 review round 2) **HUE**: every drawn colour (text, borders, background and background image, box-shadow,
    text-shadow, outline, an SVG mark's stroke / fill, a `::before` / `::after`'s text, background, border and shadow;
    the last four since round 3) at first load and with everything shown is a grey (chroma ≤ 40), a mix of one lane
    colour over the void (any amount, each channel within 8 / 255), or record red on a recorder that records (armed
    record or mic, jam on, the jam panel); the canvas is left out. TYPE and HUE's "everything shown" also opens step
    1's lock panel and the help dialog. The diff also takes **every drawn control with everything shown** (`all`: the
    "everything" view, every drawer open, page px with a scrolling column's own scroll added back): a control gone or
    new there fails `--assert` (round 2: a knob whose line lost its `appendChild` vanished from the Record drawer and
    every first-load gate passed), its moves are listed only (the gate is the first load); a control with an id is
    keyed by it (a seed field's name is its random value).
- **RD-3 changes to the measuring:**
  - **A6 / A7 states**: besides first load, every drawer open, focus mode and playing: each sheet tab open with every
    drawer in it open, the sheet closed, and every pill shown at once (welcome, quest, jam panel). 12 states a size.
  - "Everything shown", TYPE and HUE show **every sheet pane at once** (not a real state: so a control in another tab is
    counted and coloured too); the layout diff against the RD-1 baseline no longer applies (the phase moves everything).
  - **IDS**: every control id in `baseline/rd01-controls.json` (62) is in the page and drawn after `__poly.reveal(el)`
    opened its tab and drawers (`--ids <report | none>`); one gone or undrawn fails `--assert`.
  - a bar fixed along the bottom edge (the window's width, under half its height: the phone's docked sheet tabs) hides
    what scrolls under it: `seen()` ends a box at its top, so text behind the dock is not judged against the dock.
  - RD-3's gates: `--tests A1,A6,A7,IDS,TYPE,HIT,HUE --assert`.
- **RD-2 holds** (the layout kept by hand until a later phase rebuilds the part; remove them with it): `.tstrip {
  margin-right: 2px }` (≥ 1101 px; RD-5's console); px line-heights where a text came onto 11 / 13 / 15 (15.2 px on
  `.pill`, `.seg button`, `.lane-tab`, `.slot-menu button`; 14.6 on `.seg-ui button`, `.chips button, .tchip`; 17.8 on
  play; 13.2 on `.gauge .g-val`; 17.5 on `.quest-hint`; 18.75 on `.welcome`; 18 on `.hint`, `.drawer summary`,
  `.gtable`, `.row-ctl`, `.evo-lanes`, `.evo-sub > summary`, `.auto-pick`, `.jam-row`); tracking that keeps the old
  measure (`--tr-12` + .05 em, `--tr-115` + .025 em, − .02 em on `.welcome` / `.quest-hint`, − .04 em on the strip's
  tempo value, .36 em on the in-flow legend ≤ 1100 px: RD-10's phone row of dots); `.tstrip-fx .g-val { min-width:
  40.8px }`.
- **No-layout baseline:** `baseline/rd01-controls.json` = every control at the four sizes, from 07c2ba4 (RD-1 closed):
  `list` the part in view at first load (viewport px), `drawn` every drawn control's whole box at first load (page px),
  `all` every drawn control with everything shown (229 per size). Measured again in RD-2 rounds 1 and 2 by this tool on
  a `git archive 07c2ba4` (`--root`); `list` and `drawn` came out identical each time. The phase start's own TYPE: 54–55 kinds off the rules (7 sizes, 700 on play, jam, help and bold).

Screenshots: `baseline/01…04` (the brief, 1512×860), `baseline/rd01-first-load-1280x720.png`,
`baseline/rd01-first-load-390x844.png`.

## A3 baseline sets (player agents)

Six 40-minute sets on today's page, by two player agents (fresh sub-agents in the `noor` and `kai` personas, model
sonnet) that chose the musical intentions, seeds and grooves; played by `orbit2/tools/session.mjs` in real time
(`?setlog`, 1512×860, slips at 0.08, the Move simulated as connected). One JSON per set in
`setlog/baseline-<player>-<n>.json`: the page's setlog, the script (with each slip), the action windows and the tags.
The players' own runs were a first take that found defects in the tool (see "First take"); the sets below are their
exact commands, re-run on the fixed tool, and tagged again after review round 1 (`session.mjs --retag`: the same
page logs, today's tagger; the plan is made again from each set's seed and intents and came out action for action).

| set | input | groove | seed | intents (weights) | actions · slips | entries | **destructive** | harmless audible | silent | lanes emptied (accident · meant) | presses not made |
|---|---|---|---|---|---|---|---|---|---|---|---|
| noor-1 | Move | poly345 | 11 | knobs 5, evolve 4, listen 6, build 1, slots 1, mute 1 | 119 · 9 | 102 | **0** | 7 | 0 | 0 · 1 | 2 |
| noor-2 | Move | dnb | 22 | build 3, knobs 3, evolve 2, slots 3, mute 2, drop 1, tempo 1, listen 3 | 174 · 8 | 169 | **1** | 7 | 0 | 1 · 1 | 3 |
| noor-3 | mouse | afro | 33 | knobs 4, evolve 2, build 2, mute 1, tempo 1, listen 5 | 143 · 8 | 147 | **0** | 4 | 0 | 0 · 0 | 0 |
| kai-1 | Move | techno | 11 | build 2, knobs 2, evolve 0.5, slots 3, mute 5, drop 2, fill 4, tempo 0.5, listen 1 | 520 · 44 | 393 | **0** | 36 | 0 | 0 · 2 | 23 |
| kai-2 | Move | dnb | 22 | build 3, knobs 4, evolve 2, slots 2, mute 3, drop 1, fill 3, tempo 1, listen 2 | 523 · 29 | 436 | **1** | 23 | 0 | 2 · 4 | 17 |
| kai-3 | mouse | house | 33 | build 2, knobs 2, evolve 0.5, mute 5, drop 1, fill 4, tempo 0.5, listen 1 | 569 · 39 | 411 | **0** | 18 | 0 | 0 · 1 | 10 |

By cause, destructive / harmless (the slip of the action, or of an earlier action of the same intention; no accident
of these sets is a "side effect" of an action that had no slip):

| set | stray-knob | double | wrong-row | offset |
|---|---|---|---|---|
| noor-1 | 0 / 6 | 0 / 1 | | |
| noor-2 | 0 / 6 | 1 / 1 | | |
| noor-3 | 0 / 3 | | | 0 / 1 |
| kai-1 | 0 / 27 | 0 / 7 | 0 / 2 | |
| kai-2 | 0 / 18 | 1 / 3 | 0 / 2 | |
| kai-3 | 0 / 13 | 0 / 2 | | 0 / 3 |

**Today's page fails A3** (0 destructive and ≤ 1 harmless audible per set): 2 of 6 sets have a destructive accident,
all 6 have more than one harmless one.
- **The 2 destructive accidents:** a double press on the drop's "bring the kick back" left the kick muted (noor-2 at
  651.8 s, kai-2 at 2269.1 s).
- Harmless accidents are mostly **stray-knob** slips (3–27 per set): a knob brushed on the way changes a value on any
  page that has knobs. With slips injected at 0.08, "≤ 1 harmless" is out of reach by construction; RD-9 can compare
  by cause (BACKLOG Later, for Noor). Then **double** (a step or a Mute pressed twice), **wrong-row** (a neighbouring
  lane muted, the kick did not drop: Kai, "a missed drop, not a kick loss") and **offset** (a missed lane tab, then
  Mute on the lane still selected).
- **Lanes emptied by the "euclid hits" knob** (beside A3's classes, which do not name it): on a lane drawn by hand
  (euclid hits 0), one click down calls `Lane.setEuclid(0)`, which in replace mode re-fills the lane from E(0): every
  hit is gone. 12 times in the six sets: 9 by turns of that knob the hand meant (its own effect, so not an accident),
  3 by a stray touch (harmless, by A3's words). Noor, first take: "I would hear a lane vanish and regret it, because I
  only meant to thin the pattern." The model's behaviour (`lanes.js`), which DECISION §3 keeps out of the redesign:
  the RD-9 sets will meet it again (BACKLOG Later, for Noor).
- **Presses not made** (55): the script is open-loop, a player is not: a Mute press whose lane already is as the
  hand wants (heard) is not made. 35 follow a slot recall (a slot brings its own mutes), 20 an earlier press that
  missed the Mute button or landed on another lane (the hand believed the lane had changed).

**What is tagged how** (`tagAccidents` in `session-core.mjs`): an entry inside an action's window is intended when the
action expected it: a Mute also names the value it ends on (`lane1.mute=false`); a knob turn or drag may log twice
when it rests (both are the turn); what a knob does to the steps is the turn (the length knob clamps euclid hits, the
hits knob re-fills the lane); nothing a double press's second press did is intended. Anything else is an accident, in
A3's words: **destructive** = stop, load (a groove, a setup, a link, a slot recall, a chain), init, randomize, clear,
a kick muted; **silent** = select, export, slot save, record, and a change that came back to where it began;
**harmless** = everything else that sounds. A lane emptied is marked on its tag (`emptied`) and counted apart.

**First take** (the players' own runs, same commands, before the fixes): noor 0 / 1 / 0 destructive (9 / 8 / 20
harmless), kai 0 / 1 / 0 (40 / 28 / 37). Reading their accidents, the players found what the tool got wrong, fixed
before the six sets above (+1 unit test): the mouse dragged the gauge after the one it meant for swing and chance
(`nth-child` in the Move's knob order; 16 and 19 false accidents in the mouse sets); a Mute's expectation had no
direction, so a drop whose "bring it back" muted the kick counted as intended (twice in kai-1); a Mute after a missed
lane tab was blamed on the Mute; a drag that rested was counted twice; two of six launches died before the page's
modules ran (six Chromes at once). A first re-run was cut at minute 26 by the Mac sleeping (`caffeinate -is` now).
Review round 1 then corrected the tagger once more (`session.mjs --retag`, no new runs): a double click on a mouse
step cell was half missed (the second click changes another field of the step), the hits knob's own re-fill was
counted as a destructive accident, and "lane emptied" had been made a destructive class A3 does not name (13
destructive before the re-tag, 2 after).

**Known limits.** A lane with a single hit emptied logs as one step (`lane4.hits.2 true → false`, noor-1 at 1984 s,
a turn the hand meant), so it is not marked `emptied`: the setlog does not say the lane went quiet (BACKLOG Later).
The simulated Move does not run the page's connect flow: the pill reads "Move: not connected" (in the glance shots
too). These are simulations: no USB, no LEDs, no human (DECISION, "Run by agents").

Reproduce a set (each JSON's `session` block holds persona, seed, groove, intents, slips; keep an idle Mac awake):

```sh
caffeinate -is node orbit2/tools/session.mjs --persona kai --minutes 40 --slips 0.08 --seed 22 --groove dnb \
  --intents build:3,knobs:4,evolve:2,slots:2,mute:3,drop:1,fill:3,tempo:1,listen:2 --out /tmp/kai-2.json
```

## A2 baseline: glance trials

20 trials per player on today's page (`orbit2/tools/glance.mjs`, 1512×860, playing, exposure 0.55, gamma 1.5, scale
0.71), each image judged by a fresh sub-agent (model sonnet) that saw only the brief and that one image. Every
trial and answer: `setlog/glance-noor.json`, `setlog/glance-kai.json`. One shot: `baseline/rd01-glance-step-held.png`
(step 1 of lane 3 held; judged "rhythm, lane 3").

| player (groove, seed) | right (pass ≥ 18) | page right | lane right | rhythm | sound | step | slots |
|---|---|---|---|---|---|---|---|
| noor (poly345, 1) | **3 / 20** | 3 | 20 | 2 / 2 | 1 / 4 | 0 / 5 | 0 / 9 |
| kai (techno, 2) | **8 / 20** | 8 | 20 | 4 / 4 | 4 / 7 | 0 / 4 | 0 / 5 |

The lane always reads (the lane drawer's title, the lit lane tab). The page does not: a held step or a held Loop
changes nothing in view but the step cell (the lock panel and the slots are not in view at 1512×860), so the judges
said "rhythm"; Shift's sound page was read 5 times of 11 (the drawer's "shift held: knobs sculpt the sound"). One judge
changed its answer mid-reply (kai trial 10; the last answer counts).

```sh
node orbit2/tools/glance.mjs --trials 20 --seed 1 --groove poly345 --out /tmp/glance-noor/   # kai: --seed 2 --groove techno
node orbit2/tools/glance.mjs score /tmp/glance-noor/key.json answers.json
```

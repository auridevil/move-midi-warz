---
type: decision
status: final
date: 2026-11-14
title: "Orbits redesign: final decision (product owner)"
owner: Noor
tags: [orbit2, redesign]
---

# Orbit console: final decision

Round 1 was a draft built from the four proposals. This is the final version, written after reading
`proposals/*/answers.md` and every round 2 mock: Greta's `mock-r2-*`, Rio's `answer-*`, Nils's `answer-*` and Yuki's
`mock-r2-*`. Everything below is decided. The playbooks implement it, and a reviewer can hold a phase to it.

## 1. Principles (unchanged from round 1, now with numbers)

1. **The rings are the instrument.** Nothing covers them. Nothing moves or resizes them while the window size stays the
   same: not the sheet, not a page, not a pill.
2. **The Move is the hands and the screen is its display.** A held or touched Move control owns the knob row and the
   cells while it is held. The screen follows it. Only one phase changes the Move mapping (RD-11), behind a flag.
3. **Nothing destructive within a careless gesture.** Empty space does nothing except close what is open. The sun is a
   display, not a button. Stop, load, init, randomize and clear never share a target with a hold or a drag.
4. **State is always visible and settings never are.** That holds in focus mode (F) too.
5. **There is one deep place, and you can search it.**
6. **It is built for a dark room.**
   - No control pixel is above relative luminance 0.475.
   - Text is at least 4.5:1 and component edges at least 3:1.
   - Lane colours are the only hues, and red means recording.
7. **I steer the generative layer while I play.** Its time is on the canvas, and its knobs are under my hands (RD-11).
8. **Every phase ships a playable instrument.** Saved data, share links, exports, the Move table and accessibility
   survive every phase.

## 2. The final concept

**One sentence:** a full-height stage where the rings never move, a left column for the lanes and the peek, a right
column for state pills and the one sheet, and a console along the bottom that is the Move's face. Everything on the
canvas is read-only light.

### Disagreements, resolved

| question | decision | why |
|---|---|---|
| **Hover peek (0.6 s)** | **Dropped.** The peek appears on Move encoder touch, knob drag, or keyboard focus on a knob (for magnifier users). It stays 400 ms after release. Hover shows the knob's own label only. | Greta, Nils and Yuki all agree, and so do I: a resting pointer must not flash 64 px numbers. |
| **Outlined boxes vs hairlines** | **Yuki wins for the action words, Greta for the state lamps.** Fill, fill next, throw, undo, randomize, jam, share and all ⌘K are type on a 1 px `--b` hairline (3.1:1 edge, 40 px hit area). Play is a 64 px outlined ring. The M lamps and page tabs keep a 2 px outline when on, because state needs a shape. Knobs are 270° arcs in the lane colour. | One visual language from the sun to the bottom edge, and nothing on the face looks like a dashboard. |
| **Numeral weight** | **300 only at 40 px and up** (the peek at 64 px, the sun numeral). **500 for knob values** (22 px) and the bar·beat counter. 400 everywhere else. | Thin strokes bloom in the dark (Greta, Nils, Yuki). |
| **Breathing chrome** | **Not built.** The RD-2 luminance cap does its job. If the RD-9 sets show that I miss it, Rio's spec goes to the backlog unchanged: decorative text only, at a fixed `#8a86a0` (5.5:1), off by default, never state, back with a cut. | Rio offered to drop it himself, and fewer features is the brief. |
| **F mode and pills** | **F hides controls, never state.** It keeps every pill, the peek and all canvas light. It hides the lane list, the console, the Move pill and "?". Mutes stay visible as rings at 35 %. | Yuki is right that principle 4 has no exceptions. |
| **The countdown** | **It moves continuously.** The arc crawls toward the next mutation. With reduced motion it steps once per beat. Once the arc ships (RD-8), the evolve pill reads "evolve ×" and does not repeat the countdown. | The crawl is the ambient player's clock (Yuki), and each fact is shown once (Greta). |
| **Rio's "ring answers the hand"** | **It lands in RD-6, with the peek, merged with Yuki's "touched knob drawn on the selected ring".** It is read-only and shows only while touched or dragged, plus 400 ms: shift slides the planets with short trails, hits re-spread, swing moves the off-beat ticks, chance dims the planets, push makes the ring lead or lag, a length change pulses the new ticks once, and a held step gets a halo. **No echo bubble:** the touched knob gets a lane-colour plate, and the number lives in the peek. | It is the one idea two designers fought for independently. The peek gives the number and the ring shows what the change did. |
| **Bar·beat counter** | **Yes, in RD-5.** "03.2" at 18 px, weight 500, beside play. | It is the cheapest "still playing" signal (Nils). |
| **"MOVE ⇢ …" chip** | **Ships with the console in RD-5, not later.** It is grey when the Move's knobs edit something other than what is drawn, and white when the Move owns the row. | Otherwise the first knob touch edits a parameter the screen isn't showing (Nils). |
| **When the step page appears** | The cell outline appears within one frame. The page flips at 450 ms (`LOOK_MS`) or on the first knob turn, never sooner for time alone. With the mouse, the step page is latched, and clicking a planet or long-pressing another cell switches the step. | A tap must not flash a page (Nils). The mouse must not get stuck on one step (Greta). |
| **Drift** | **One page, only while − is held.** No sub-pages, no hold Loop + knobs, no Shift step page 2. The Move's step LEDs carry the state, and a touched knob turns them into a 16-LED meter. Behind `?drift` until the screen-off gate passes. | Without the LEDs it is a screen feature, not a Move feature (Nils). |
| **The 16 cells** | **They stay for good.** The canvas gets one roving tab stop on top of them (RD-10). | "The ring is the picture of the strip" (Yuki). |
| **Arc labels** | **One arc label, on the selected lane only:** 13 px caps, weight 500, 78 % white, at the bottom of the ring within ±35° of horizontal. Numbers are never set on a curve; anything you read mid-gesture is straight type at 15 px or more. When space runs out, things go in Yuki's order (unselected labels, then extras, then slot numbers, then arc detail, then the cycle caption moves into straight type). | Yuki's ladder (`mock-r2-arc-label-ladder`). |
| **Filter on the face** | A small knob in the transport group with a centre detent. Double-click sets it to off. | So it isn't left at 0.2 in the middle of a set (Greta). |
| **First visit** | The sun is not clickable. On a visit that has never played, the sun reads "press play" for a few seconds and the play ring gets a slow outline pulse. A **fill flare** in the sun shows when fill is held from anywhere. | Rio's delight comes back without adding a target. |
| **Quest "show me"** | Yes, in RD-7. It draws the gesture once on the canvas as a ghost hand. It is read-only and can be dismissed. | Rio. |
| **Console-log overlay** (conductor, 2026-11-14) | **Kept, switchable.** Today's text readout (status line + the per-lane and sound rows of "nerd stats") lives on as a read-only overlay of monospace text over the stage, toggled with the backquote key `` ` `` or Sheet → setup, off by default, remembered. It is text, not controls (not counted in A5), never `aria-live`, below the 0.475 luminance cap, and it never moves the rings (A7). Ships in RD-5 (where the readout leaves the face). | The conductor likes it as a performer's console log. |
| **Wordmark** | Not on the face. Major Mono only for the wordmark, which sits at the top of the sheet's setup tab, next to the home link. | Greta. |

### The screen at 1512×860

```
x 0      24            300                         756                          1084                1512
  ┌──────────────────────┬────────────────────────────────────────────────────┬──────────────────────┐ y 0
  │ ● soft kick  4·×1 [M]│                                                    │   (● Move · live) (?) │
  │ ● clave     16·×2 [M]│       ‿ evolve · 3 bars · dice 4127 · coupling ‿   │ (● rec armed · latch ×)│
  │ ● cowbell   12·×3 [M]│          (read-only generative arc, crawling)      │ (chain 1→3 · next bar ×)│
  │▌● conga     16·×4 [M]│               rings 630 px across                  │ (solo · shaker ×)      │
  │                      │               centre (756, 358), fixed             │ ┌──────────────────┐ │
  │ knob 6 · chance ·    │                    ( 6 )                            │ │ ⌕ find any control│ │
  │ conga                │                   beats                             │ │ lane pattern groove│ │
  │ 85%   (peek, 64 px,  │      CONGA 16 × 4 (one arc label, bottom)          │ │ perform export setup│ │
  │ plays 85 of 100      │       ○ ● ◉ ○ ○ slot moons        cycle · bar 7/16 │ │  (sheet overlay,  │ │
  │ loops  touch/drag    │                                  everything meets  │ │  428 px, under the│ │
  │ /focus only)         │                                  in 6 beats        │ │  last pill)       │ │
716├──────────────────────┴────────────────────────────────────────────────────┴─┴──────────────────┴─┤
  │ ( ▷ ) 03.2   fill hold   │ ● 4 · conga  voice ▾  steps 1–16 of 16  MOVE⇢RHYTHM  rhythm sound⇧ step│ undo   randomize │
  │              fill next   │ ◜16  ◜0  ◜2  ◜×4  ◜12%  ◜85%A  ◜−2  ◜112◆   (8 knobs, 270° lane arcs)   │ ● jam  share     │
  │ ◠ off filter throw hold  │ [▮][ ][▯][▮][ ][ ][▣][▯][▮][ ][▮][▯][ ][▮][▮][ ]  (16 cells)          │ all ⌘K           │
860└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Always visible: 48 controls with 4 lanes and no modes on.**
- lane rows ×4 and M ×4;
- the Move pill and "?";
- play, fill, fill next, throw, filter;
- voice and the 3 page tabs;
- 8 knobs and 16 cells;
- undo, randomize, jam, share, all.

Pills come on top of that: up to 4 are shown, each a button with a ×, and any more fold into "+N more ▾".

**Read-only light on the canvas:**
- the sun numeral, plus "press play" on a first visit and the fill flare;
- the cycle caption (straight type);
- the generative arc;
- the slot moons;
- the one arc label;
- the ring answering the hand.

**Pages of the knob row:**

| page | knob shape | cells | how you get there |
|---|---|---|---|
| rhythm | thin arcs | rectangles | the default |
| sound | filled pies on a lane-tinted band | rectangles | Move Shift, ⇧ held, or the sound tab |
| step N | rings, solid where locked and dashed where the step follows the lane | 16 loop dots | hold a Move step, or long-press / right-click / Alt+click a cell or planet |
| slots | (knobs unchanged) | the 16 slots | hold Loop on the Move |
| drift | arcs | as Nils's LED table | hold − on the Move (RD-11) |

One lane colour runs through every mark that belongs to the lane: the console's top rule, the knobs, the cells, the
dot and the bar in the lane list.

**State that never repaints:** the comets, the ■/▷ glyph, the bar·beat counter, the lane list's M lamps, the rings at
35 % when muted, the pills, and a 2 px red line along the console's top edge while record is armed and playing.

**The sheet** is a 428 px overlay in the right column, from under the last pill down to the console. Tall tabs scroll
inside the sheet; the page never scrolls. It opens from all ⌘K, ⌘K, `/`, a pill, the "A" on a knob, or "more…" on the
step page. It closes in the one Esc order (dialog → step page → sheet → focus mode → give the keys back), or with a
click on empty canvas.

### How it degrades

- **1512×982 (full screen):** the stage grows taller and the rings grow with it, centred and fixed for that window
  size. The console and the columns keep their sizes.
- **1280×720:**
  - the console is 128 px tall, with 44 px cells, 34 px knobs and a 52 px play ring;
  - the left column is 256 px wide, with six 40 px lane rows;
  - the rings are **568 px across, centred between the columns at x 578** (fixed, 64 px off the window centre);
  - at most 4 pills, then "+N more";
  - the sheet is never shorter than 340 px, and search becomes its main route;
  - every target is at least 32 px.
- **Phone (≤ 760 px):**
  - the lanes become a row of colour dots;
  - the rings are square and full width;
  - the console becomes play + bar·beat, 2×4 knobs and 2×8 cells;
  - pills become one line;
  - the sheet becomes a full-height bottom sheet;
  - the ORBIT2-03/14 touch rules and 44 px targets are unchanged.

### The Move mapping

**Unchanged in RD-1 to RD-10.** The Move table in `orbit2/index.html` stays the source of truth. What changes is that
the screen answers the hands:
- an encoder touch shows the peek, flips the row to the Move's page and lights the plate;
- Shift shows the sound page;
- a held step shows the step page and its loops;
- Loop shows the slots on the cells;
- the "MOVE ⇢" chip names what the knobs edit.

Nils's state table (T0–T4 and its edge cases, `nils/answers.md` §Q2) is the specification.

**RD-11 (behind `?drift` until the gate passes) adds the only change to the mapping:**
- hold − + knobs 1–8 = every · amount · gravity · home after · max cycle · coupling lift · humanize · dice repeat;
- while − is held, step LEDs 1–6 show the lanes that evolve and tapping one toggles it; LEDs 9–16 drain toward the
  next mutation; a touched drift encoder turns all 16 step LEDs into its meter;
- a tap on − still toggles evolve. If today's toggle fires on press, it moves to "release with no knob turned", and
  that is documented in the Move table.

Loop + knobs and a second Shift page are **not** added.

### Acceptance tests I judge with

| # | test | pass |
|---|---|---|
| A1 | **Dark-room contrast**: a face audit (`orbit2/tools/face-audit.mjs`, RD-1) measures the page at 1512×860, 1280×720 and 390×844 | every text ≥ 4.5:1 composited on its real background; component edges ≥ 3:1; no control pixel above luminance 0.475; the brightest canvas pixel above every control |
| A2 | **300 ms glance test**: look away, hold or turn something on the Move, look up for a 300 ms shutter, name the page and the lane | ≥ 18 of 20 trials per player (the conductor and me, plus the scripted Kai persona as the regression run). Fail → add S1–S8 / L1–L8 index numbers |
| A3 | **Setlog accident budget**: `?setlog`, three 40-minute sets per player, lights off, one set mouse-only, logs tagged against video | **0 destructive** accidents per set (stop, load, init, randomize, clear, an unwanted kick mute); **≤ 1 harmless audible** accident per set. Baseline before RD-5, final in RD-9. Vera's 10-minute mis-click run gates every phase from RD-5 on |
| A4 | **VoiceOver walk** (cold) | play on the first Tab; lane 2's steps in under 10 keys; "stems" by search in under 5 keys; every pill announced exactly once, never per bar; with the canvas focus: add a hit on lane 3 step 2, accent it, then set its condition from the step page |
| A5 | **Control count ceiling** on the main screen at 1512×860 (face audit) | **≤ 50** with 4 lanes and no modes on; **≤ 62** in the worst case (6 lanes, 4 pills, "+N more") |
| A6 | **No page scroll** | `scrollHeight ≤ innerHeight` at 1512×860, 1512×982 and 1280×720 in every state; only the sheet scrolls inside |
| A7 | **Rings fixed** | ring centre and radius identical to the pixel with the sheet closed or open, any number of pills, every page, F on or off |
| A8 | **Peek latency** | Move encoder touch → peek painted in < 30 ms (setlog performance marks, p95) |
| A9 | **Audio untouched** (Sofia) | `exportWav` of a fixed seed is bit-identical to the RD-1 baseline; Tone.Loop lateness and stress-meter p95 no worse than the baseline; frame time p95 regresses by no more than 1 ms |
| A10 | **Screen-off drift** (RD-11 only) | screen off: set every = 8, amount ≈ half, lanes 1, 2 and 4 evolving; 5 of 5 tries correct |

**Run by agents, not the conductor (decided 2026-11-14).** A2, A3, A10 and the night run of the label ladder are
performed by player agents (the `noor` and `kai` personas) through the session tools built in RD-1: Move MIDI injected
through `cdp.mjs`, `?setlog` sets driven by a seeded performer script with injected slips, a glance proxy (a
screenshot taken 300 ms after the action, darkened and scaled to 70 cm viewing, shown alone to a fresh agent that must
name the page and the lane), and a screen-off proxy for A10 (only the Move's LED state, drawn as the device, shown to a
fresh agent). These are simulations: nothing here touches the real Move's USB link or its LEDs, so a real-device
pass stays an optional extra for the conductor, never a gate.

## 3. Phase plan

General rules for every phase:
- Each phase ships alone in the `orbit2/` lab. The model and the audio files (`lanes.js`, `export.js`, voices, DSP) are
  not touched.
- `npm run check`, `npm test` and `node tools/smoke.mjs` stay green.
- Old `midi-warz.orbit2.*` data and share links load.
- Review panel: the 3 core reviewers (verifier, architect, sound) **+ the 3 named below**. New reviewer ports: noor
  5411/9411, nils 5412/9412, yuki 5413/9413. Scratch goes in `/tmp/orbit2-<id>/`.
- I sit on every phase that changes how the instrument plays.

| # | title | goal | scope (files / areas) | must not regress | acceptance | panel (+ core 3) |
|---|---|---|---|---|---|---|
| **RD-1** | **Setlog and the gates** (S) | Measure before changing anything. | New `orbit2/src/poly/setlog.js` (pure ring buffer, reversal tagging, JSON download), hooked at the action points in `app.js` (pointer / key / Move source, target, before → after) only when `?setlog` is set. New `orbit2/tools/face-audit.mjs` for A1, A5, A6 and A7. Baseline numbers recorded in the RD-1 review file. | With the flag off: no listeners, no cost, no change. No logging inside the Tone.Loop callback. | Face audit runs green against today's page and reports 160 / 189 controls. A setlog JSON contains time, source, target, before → after and a reversal flag. The A9 baseline hash is recorded. | noor, rio, kai |
| **RD-2** | **Light and type** (S) | The dark-room visual system, with no layout change. | `styles.css` tokens (`--v --l --b --track`, lane hues only, red only for rec); no fills on controls; play outlined; Space Grotesk at 3 sizes, 300 only ≥ 40 px, 500 for values; Major Mono only in the wordmark; `index.html` font links. | ORBIT2-03 focus rings, reduced motion, phone layout, every test selector. | A1 passes at all three sizes; no layout diff (control positions within 2 px of baseline). | greta, yuki, kai |
| **RD-3** | **Stage and sheet** (M) | Fit on one screen, with the rings fixed. | A CSS grid of three columns + console row, replacing `layoutHud()` / `stageBox` measuring; `scene.js` ring geometry from the stage cell; the 13 drawers and the right column moved, **ids kept**, into a 428 px sheet with 6 tabs, pinned open by default in this phase; the top strip stays. | Every control reachable by its id; e2e tests open the tab first; demo, quests, gift dialog, share links; phone bottom sheet. | A6 and A7 pass. A test lists every control id from the baseline and finds each in the DOM. Old saves load. | greta, dex, rio |
| **RD-4** | **Find and one Escape** (M) | One searchable deep place. | ⌘K and `/` search: an index from accessible names, a synonyms table (seeded from Rio's and Greta's feature tables) and actions, with recents; one Escape handler; empty-canvas click = the Esc order; the sheet is closed by default. | Key ownership (pad rows, Space, hold 0, Alt+1–6); no keys stolen while typing. | 100 % of labelled controls are in the index; the synonyms test (euclid, rotation, ratio, probability, stems, 7/8) passes; A4's search part passes. | greta, maya, rio |
| **RD-5** | **The console** (L) | The Move's face on screen; the top strip and lane drawer leave the face. | Console in `index.html` / `styles.css` / the UI half of `app.js`; `gauge.js` pie variant and page binding; `pages.js` page model; transport group (play, bar·beat, fill, fill next, throw, filter with detent); rhythm and sound pages following Move Shift; touch flips the row (+400 ms); the MOVE ⇢ chip; lane list with M (solo on Shift-click / long-press); the peek (touch / drag / focus); action words on hairlines; readout, top strip and lane drawer removed (the rest → Sheet → lane). | Every Move behaviour in the table; A3 knob recording (gauge onStart / onEnd); the "A" marks; step cycle; tempo extremes; undo / redo; live mode. | A5 ≤ 50; A8 < 30 ms; A2 for rhythm / sound ≥ 18/20 (scripted); Nils's T0 / T0′ / T3 / T4 rows as unit tests; the RD-1 agent baseline sets are the comparison; Vera's mis-click run. | noor, kai, nils |
| **RD-6** | **Step page and the ring answers the hand** (M) | One lock editor, and the screen shows what the hand did. | Step page (ring knobs, loop dots, clear / more… / done); 450 ms or first-turn flip; mouse latch with planet switching; hold Loop → slots on the cells; a pure page resolver for Nils's full state table; the lock panel and the radial menu retired; `scene.js` read-only answers (shift trails, hits re-spread, swing ticks, chance dim, push lead/lag, length pulse, held-step halo); the touched-knob plate. | Every lock (tune … condition, nudge, repeats, stroke, slice, start / end) settable and saved; Move hold-step + jog / push-jog; R4 conditions; phone long-press. | Nils's table T0–T4 + all edge cases pass as unit tests; A2 for the step page ≥ 18/20; A9 frame time; a tap (< 450 ms, no turn) toggles the step and never flashes the page. | noor, nils, rio |
| **RD-7** | **Pills** (S–M) | State always visible, in one place. | A `role="status"` pill region in a fixed order; button + ×; max 4, then "+N more"; it replaces the welcome bar, quest card and jam panel (download / discard on the jam pill); quest pill with "show me" (a ghost gesture drawn once by `scene.js`). | Quest progression (I6), welcome back (F3), jam takes, pending-mute timing, MIDI clock follow. | Each pill announced once and its text never updates per bar (A4 part); 1280×720 with 6 pills keeps the sheet ≥ 340 px; A7 still passes. | maya, greta, kai |
| **RD-8** | **Light on the canvas** (M) | The score speaks without opening anything. | `scene.js`: sun numeral (300, continuous), first-visit "press play" + play pulse, fill flare, cycle caption in straight type, read-only generative arc with a continuous countdown (per beat under reduced motion), slot moons, one arc label (13 px rules), labels cached as sprites; the evolve pill drops its countdown. | Frame time and the stress meter while playing; reduced motion; nothing on the canvas becomes clickable. | A9 (frame p95 ≤ +1 ms, audio hash identical); the 6-lane / 32-step drop order matches Yuki's list; the label ladder checked at night (13 px word / 15 px number floors). | noor, yuki, ines |
| **RD-9** | **The set** (S–M) | Forty minutes without fighting the UI. | F mode (hides controls, keeps pills, peek and light); a "night" brightness in Sheet → setup; the "?" overlay drawing the Move with the current page's meanings (the Move table moves into help's second tab); the final setlog sets. | Live mode (P1); every Move table semantic; "?" keyboard help. | **A3 budget met** (0 destructive, ≤ 1 harmless per set, 3 sets each); full A2; A7 with F on; Vera's mis-click run clean. | noor, kai, ines |
| **RD-10** | **Phone, access and clean-up** (M–L) | One interface everywhere, with no dead DOM. | Phone layout; the canvas as one tab stop (`role="application"`, ↑↓ lane, ←→ step, Enter cycles, synced with the cells; ships as `tabindex=-1` if it fails); Tab order (play first, then the console in Move order); dead DOM and the simple / everything switch removed; test selectors updated. | ORBIT2-03 / 14 touch rules and 44 px targets; T3 accessible names; no skipped tests. | **A4 full walk**; A1, A5 and A6 at 390×844; zero orphan ids in `index.html`. | greta, maya, yuki |
| **RD-11** | **Drift (`?drift`)** (M) | The generative layer under the hands. | The Move binding in `app.js` / `midi.js` for hold − + knobs; LED painting (lanes 1–6, countdown 9–16, touched-knob meter); a drift page on screen only while − is held; tap-− timing as described above; Move table updated. | With the flag off, the mapping is identical; the evolve / coupling model and save format; tap − still toggles evolve. | **A10 5/5**; a 40-minute evolve take rendered by Sofia with no clicks or level drift; scripted LED-state tests. The flag is removed only after A10 passes on real hardware. | noor, ines, nils |

## 4. Decided together

- **Greta:** the skeleton (lanes left, pills right, console, one searchable sheet), the dark-room tokens and the 0.475
  luminance cap, the page cues by shape (arc / pie / ring), the overlay sheet with rings fixed at 630 px, the
  1280×720 rules, the filter detent, and no hover peek.
- **Rio:** the setlog and the accident budget, the ring answering the hand, the fill flare and slot moons, quest "show
  me", "press play" in the sun, drawers re-hosted as-is, and the synonyms table. He conceded the sun and the sky.
- **Nils:** the peek, cells that change with the hand, the latched / momentary state table, the MOVE ⇢ chip, the
  bar·beat counter, weight 500 for values, the "?" Move drawing, and drift as one held page with an LED meter.
- **Yuki:** the visual language (colour = sound, white = structure, red = rec), hairline action words, the sun numeral,
  the continuous generative arc, the label floors and drop order, F keeping every pill, the touched knob on the ring,
  and one-tab-stop canvas focus over cells that stay.

## Needs the conductor (answered 2026-11-14)

- 1 → **No:** agents perform the A2 / A3 / A10 / night-ladder runs (see "Acceptance tests"). No playbook pauses for a human.
- 2 → **Approved** (2026-11-14, after the detail): hold − + knobs = drift, Move LEDs carry the state, tap − toggles evolve
  on release with no knob turned. Still behind `?drift` until A10 passes (agent-run).
- 3 → **OK** (rings 64 px off-centre at 1280×720), plus the console-log overlay above.

Original questions:


1. The real-hardware runs: A2, A3 (a baseline set before RD-5 and the final sets in RD-9), A10, and the night run of
   the label ladder need the conductor and me at the Move in a dark room. Reviewers can only run scripted versions.
2. Approval of the one Move mapping change (RD-11, hold −), including moving tap − to fire on release if it fires on
   press today.
3. The rings sit 64 px off-centre at 1280×720. The alternative is a 330 px sheet, which is too narrow for export. I
   chose off-centre.

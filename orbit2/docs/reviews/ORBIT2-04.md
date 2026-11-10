---
type: review
phase: ORBIT2-04
title: ORBIT2-04 calmer screen (C1–C5), review panel
date: 2026-11-10
round: 1
result: IN PROGRESS
reviewers:
  verifier: HAPPY
  architect: NOT HAPPY
  sound: HAPPY
  greta: HAPPY
  kai: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-03]]'
---

# ORBIT2-04 · Calmer screen: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), greta, kai. Process: [[REVIEW-PANEL]].

Phase start: `9c22a4e` (ORBIT2-03 closed). Implementation commits: `bf44477` (C1, C2), `811c008` (C3–C5), `2d7ea50`
(tests and browser check).

## For the brief: every control that moved, and where it went

Nothing was removed as a feature; these moved or changed how you reach them.

| control | before (shipped Orbits / phase 03) | now |
| --- | --- | --- |
| play / stop | right column, top row | header transport strip (first); on phones (≤ 760 px) a 76 px round button fixed bottom-right |
| master tempo gauge | "global" drawer, left column | transport strip, arc + "N bpm" (label spoken, not shown) |
| tap tempo | right column button "tap tempo" | transport strip, small "tap" |
| undo / redo | right column row "↶ undo / ↷ redo" | transport strip "undo" / "redo" |
| fill (hold) | right column row | transport strip |
| jam | right column, top row | transport strip (the jam progress panel stays at the top of the right column) |
| help | (did not exist) | transport strip "?" button or the ? key: `<dialog id="help">` |
| big readout | fixed top-left, 7 lines | header last row: one status line (tempo · playing/stopped · slot · rec · evolve · kit, + FILL / jam n/256 / queued slot when live) |
| per-lane rows, sound row, engine, cycle, humanize %, chain, setup, dice, MIDI out, ext bpm | readout lines | left column, last drawer "Nerd stats" (closed) |
| humanize gauge | "global" drawer | same drawer, renamed "Humanize" (closed by default) |
| engine switch synth/dsp + note | lane drawer, sound section | left column "Settings" drawer |
| reset phase | right column button | "Settings" drawer |
| focus mode | (did not exist) | key F, or "focus mode" in Settings; Esc, F or the "exit focus" pill to come back |
| stress meter | bottom-left, always | bottom-left, only with `?debug` in the URL |
| ring labels (voice, length × speed) | drawn next to each ring on the canvas | `#legend` above the rings (wide windows), under the canvas (narrow ones) |
| "what each parameter does" table | lane drawer | removed; every knob keeps its tooltip (`INFO`) |
| gauges / speed paragraph | lane drawer hint | help dialog |
| slot mouse shortcuts (Shift / Cmd / Alt + click) | Patterns hint | help dialog (slot tooltips unchanged) |
| keyboard pads (1–8 / q–i / a–k / z–,) | Record hint | help dialog |
| Move hints (Loop, Duplicate, Record, Shift+Record, Shift+Capture, Layout, Sampling, Undo, Shift+Mute, knob 8, wheel, track buttons, Shift + knobs) | drawer hints, button titles, tooltips, gauge labels | only the Move panel table (bottom-left drawer, now titled "Move") |
| drawer headers | "global · master tempo & humanize", "library · saved setups", … | Humanize · Library · Patterns · Record · Evolve · Dice · Export · MIDI · Settings · Nerd stats · Move · "Lane N · voice" |
| drawers open on load | global, patterns, lane | lane only |

Layout: on windows wider than 1100 px the left column is 340 px and the right one 400 px; `layoutHud()` hands the
scene the free box between them under the header and the legend (`scene.setStage`, pure `ringGeo()` in scene.js), so
no panel covers the rings at any size.

Known behaviour: F is also the keyboard pad for lane 2 step 4. Now F toggles focus mode; while record is armed it
stays a pad (the keys are pads then), and Shift+F still toggles that step's accent.

Browser check (headless, `/tmp/orbit2-impl/e2e.mjs`, deleted afterwards): before shots from `poly.html`, after shots
from `orbit2/index.html` at 1440×900, 1280×720, 1000×760, 390×844 (mobile). All passed: nothing over the ring box
(closed drawers and every drawer open), every moved control visible where it went, one status line, nerd stats
7 rows, legend 4 lanes, play from the strip (phone: trusted tap on the floating button, also scrolled with panels under
it), tempo gauge turns, undo/redo, F → focus mode (panels hidden, canvas = window), F / Esc back, ? opens help, Esc
closes it, engine switch + reset phase in Settings, stress meter hidden, `?debug` shows it, 0 page errors.

## Pre-checks

`npm run check` clean, `npm test` 109 + 9 green on 2d7ea50 before the panel started.

## Round 1: 4 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; greta, kai on sonnet), own ports
5401 / 5402 / 5403 / 5409 / 5404 (+ 940x), the verifier also ran the smoke on 9222. Brief: the phase goal, C1–C5
verbatim from [[BACKLOG]] plus the phase spec, the moved-controls table above, the layout and F-key notes,
`git diff --stat 9c22a4e..2d7ea50` (7 files, +277/−91), `git status --short` (clean), the must-fix rule, how to drive
`orbit2/index.html` with `orbit2/tools/cdp.mjs` and how to run the phase-start version from a `git archive` in their
scratch dir. The MUST-FIX was reproduced by the implementer on 2d7ea50 (5400/9400, 1440×900): Settings opened with a
click, ArrowUp, F, F → `activeElement = btn-focus`; Space → `{ focus: true, playing: false }`; control run (Tab, Esc,
F, F, Space) plays.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | none. check, 109 + 9, smoke 10/10; nothing over the rings at 1440×900 (panels ≥ 49 px clear) and 1280×720 (≥ 40 px), nor at 1000×760 and 390×844, also after resizes and in and out of focus mode; every moved control works where the table says (play incl. the phone's button, tempo gauge, tap 147 bpm, undo/redo, fill hold, jam, queued slot, reset phase, engine, humanize); help blocks page keys, Esc closes it before leaving focus mode; F with record armed stays a pad; no Move hint outside the Move panel; only the lane drawer open; phase-start localStorage (5 keys) and a phase-start `#p=` link load identically. |
| architect | NOT HAPPY | C5: leaving focus mode with F hands Space to the Settings "focus mode" button. `setFocusMode(false)` always focused `#btn-focus` (`app.js:1136`); with `lastInput === 'key'` the `focusin` hook (`app.js:1003`) marked it keyboard-owned, so `controlOwnsKey` gave it Space and letters: Settings open, any arrow, F, F, Space → focus mode again, not playing, every time until Esc or a click. With Settings closed `.focus()` did nothing (a closed `<details>`), so the bug hung on an unrelated drawer being open. |
| sound | HAPPY | none. A/B offline WAV 9c22a4e vs HEAD (demo groove, 120 bpm, 4 bars, dice locked, seeded noise), synth then dsp: same length (352,800 frames), peak / RMS equal to 0.01 dB, same onsets; the only difference 1 LSB in 2–35 samples, as HEAD vs HEAD. The moved controls do the same audible thing (first strip click starts one clock, stop mid-bar freezes it, gauge drag and taps retime the transport, fill, undo/redo, dsp switch while playing keeps the clock, reset phase, a jam from the strip records 4 lanes + mix, phone play scrolled 2,080 px down). Frame time, long tasks and scheduling headroom equal at base, HEAD and HEAD in focus mode; `readout()` ≈ 0.02 ms. |
| greta | HAPPY | none (hierarchy reads transport → orbit → lane at 1440, 1280 and 390; help: modal `<dialog>` named "keys & mouse", focus in and back to `#btn-help`, page keys blocked; strip: group "transport", every button named, tab order play → tempo → tap → undo → redo → fill → jam → ?; focus mode: F, Esc and the pill, F stays a pad while recording) |
| kai | HAPPY | none (1440×900 mid-set: play / stop / Space from the strip; fill held ~3 s across a bar line and released outside the button clears; tap while playing 100 → 148 bpm; F while playing: the clock runs on; Space, hold 0 and Alt+2 work in focus mode; Esc comes back with the lane drawer; F with record armed is a pad; ? help) |

SHOULD items recorded (never block): the legend isn't observed, so when it wraps (long voices, muted lanes) the rings
stay where they were; fine at the spec sizes, not on a short window (verifier, architect); `setStage` rebuilt both
full-window canvases and re-rolled the stars (each resize twice on wide windows, a star reshuffle on every focus
toggle), layout state held twice (`--hud-top` and an inline top), the stage math untested and the test's boxes left
out the legend (architect); F with Caps Lock toggled the pad, the help's pads row didn't mention F, plain F no longer
places a plain hit on lane 2 step 4 (architect, sound); Escape handled in three places, the modal check matches any
`dialog[open]` (architect); dead `.top-row` / `.drawer.inner`, a `min-width: 1101px` query that disagrees with JS
`innerWidth <= 1100` at zoomed fractional widths, the focus-mode `!important` (architect); the stress interval wakes
without `?debug`, the nerd stats are rebuilt while closed (architect); the phone header is 250 px tall (architect);
phone focus mode hides the floating play, so stopping needs "exit focus" first, and coming back jumps to the top of
the page (verifier, sound); leaving focus mode dropped the focus to `<body>` when Settings was closed (greta, the same
code as the MUST-FIX); `?` (and F) do nothing on a keyboard-focused drawer header (greta); on touch "tap" 40 and "?"
32 px wide, the exit pill at 0.55 opacity (greta); the floating play covers the welcome bar's "×" and "wild" at the
top of a 390 phone (greta); nothing on screen names F (greta); the status line's live states don't stand out, 11 px
mono with the chromatic shadow (kai, greta); nerd stats below the fold at 1280×720 (greta); the strip's tempo knob is
small and its arrows step 10 bpm after a Tab (kai); undo sits next to redo and fill (kai); mutes / solo unreachable by
mouse in focus mode (kai); the Move panel, when open, reaches 171 px into the rings at 1440×900 (verifier,
pre-existing popup); the first-visit toast over the stage's bottom at 1280×720 (verifier, pre-existing); between 1101
and 1180 px the longer jam labels wrap the header and shrink the rings (sound); exports differ by 1 LSB run to run
(sound, pre-existing); the jam's raw mix peaks at −0.19 dBFS on dsp (sound, pre-existing). Tooling: `cdp.mjs` pages
could turn hidden, so resize, ResizeObserver and the `?debug` meter looked dead (verifier, sound) and the status line's
"jam n/256" looked stuck (verifier). Not a defect: the legend already says "· muted" (kai); the tempo gauge's visible
label is hidden by design, its value "N bpm" shows (greta).

### Changes after round 1

- **Focus mode comes back where you were** (the MUST-FIX): `setFocusMode` remembers, before the panels hide, the
  focused element, whether the keyboard owned it, and the scroll position; coming back it refocuses that element with
  the same ownership (a click on "exit focus" took the keys back, so then the page keeps them) and scrolls back (on a
  phone the page is one window tall while the panels are hidden, so it used to come back at the top). F, F, Space
  plays; a keyboard user who opened it with the Settings button is back on that button (Space presses it, as before
  they left); from the tempo knob, back on the knob (arrows turn it, Space plays). Entering twice does nothing.
- **Phone focus mode keeps play**: the header turns invisible instead of `display: none`, and ≤ 760 px the floating
  play stays visible (no Space bar on a phone); the rest of the header stays hidden. (verifier, sound)
- **The legend moves the rings**: `#legend` joins the ResizeObserver list. The stage math is a pure `stageBox()` next
  to `ringGeo()` in `scene.js`; the left column's top comes from `--hud-top` only; JS asks `matchMedia('(max-width:
  1100px)')`, the CSS's own test; the legend is `position: fixed` by default with a narrow override (no `min-width:
  1101px` query). (verifier, architect)
- **A new stage repaints only the backdrop**: `backdrop()` split out of `resize()` (reusing its canvas when the size
  holds); `setStage` calls only that, so the canvases aren't reallocated and the stars stay put. (architect)
- **Keys**: `?` opens the help from anywhere but a text field (a keyboard-focused button or drawer header too); F with
  Caps Lock is focus mode too (`e.key` lowercased, no Shift; Shift+F still accents); the help's pads row says F is
  focus mode until record is armed; the modal check reads `$('help').open`. (greta, architect)
- **Idle work**: the stress interval exists only with `?debug`; the nerd stats are written only while their drawer is
  open, and opening it fills them. (architect)
- **CSS**: `.top-row` and `.drawer.inner` removed; on touch the strip's buttons and the exit pill are ≥ 44 px wide and
  the pill 0.9 opaque (no hover there). (architect, greta)
- **Harness** (`orbit2/tools/cdp.mjs`): `open()` brings its page to front with focus emulation. After `p.key('Escape')`
  (the native key code added in this phase) the page turned hidden: no rAF, resize events, ResizeObserver or Tone.Draw
  callbacks; that is why "jam n/256" looked stuck (`renderJam()` already refreshes the status line every beat) and
  resizes looked dead. Chrome now also runs with `--disable-audio-output` (a fake, silent output stream clocks the
  AudioContext): halfway through this round the Mac's own output device stalled, every headless AudioContext clock
  froze at 0.11 s and nothing played on any commit (a pristine `git archive` of 2d7ea50 too); reviews no longer depend
  on, or sound through, the machine's speakers.
- Later → [[BACKLOG]]: the rest of the SHOULDs (one Escape handler, CSS grid stage, phone header height, F vs the pad,
  jam label width, bit-identical exports, jam mix headroom, the floating play over content, F on screen, status line
  emphasis, nerd stats below the fold, tempo nudge key, undo spacing, mute in focus mode, Move panel over the rings,
  toast over the stage).
- Tests: the stage test now goes through `stageBox()` with 1–4 legend lines at 1280×720, 1440×900 and 1101×640, plus
  the 120 px floor (109 orbit2 tests). The focus restore is DOM in `app.js`: checked in the browser. `npm run check`
  clean, `npm test` 109 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 ok (serve.py 5400 + headless Chrome
  9222, both stopped). Browser (5400/9400, one browser per viewport, `/tmp/orbit2-impl/e2e.mjs`, deleted): 61/61, run
  twice. 1440×900: nothing over the rings, drawers closed or all open; the architect's repro → focus back on the
  drawer header, Space plays, Space stops; control run plays; Enter on a keyboard-focused "focus mode" → Esc → back on
  the button, Space presses it; F, F from the tempo knob → back on it, ArrowUp turns it, Space plays; click "focus
  mode" → the canvas keeps its size → click the pill → focus on the button, Space plays; `?` on a keyboard-focused
  drawer header opens the help, page keys blocked, Esc closes; Caps Lock F → focus mode, lane 2 untouched, Shift+F
  accents, F with record armed is a pad; legend 17.6 → 39.2 px (muted, longest voices) → the rings move down 10 px by
  themselves, nothing over them, and back exactly when it shrinks; nerd stats empty until opened, then 7 rows that
  follow; the status line counts "jam n/256" live; 1101 px: fixed legend and a stage between the columns, 1100 px:
  static legend, canvas-centred. 1280×720: nothing over the rings. 1000×760: nothing over the rings; F hides the
  play too (keyboard window); Esc comes back at the same scroll; `?debug` meter runs, hidden without it. Phone 390×844
  touch: tap / ? / undo / redo / fill / jam ≥ 44 × 44; focus mode from Settings far down the page: canvas = window,
  the floating play visible and on top, the rest of the header hidden, tap plays and stops without leaving focus
  mode, pill 76 × 44, tap it → back at the same scroll, square canvas again; nothing over the rings. 0 page errors;
  screenshots looked at.

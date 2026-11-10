---
type: review
phase: ORBIT2-04
title: ORBIT2-04 calmer screen (C1–C5), review panel
date: 2026-11-10
round: 0
result: IN PROGRESS
reviewers:
  verifier: pending
  architect: pending
  sound: pending
  greta: pending
  kai: pending
---

Phase start: `9c22a4e` (ORBIT2-03 closed). Implementation commits: `bf44477` (C1, C2), `811c008` (C3–C5), then the
tests-and-browser-check commit.

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

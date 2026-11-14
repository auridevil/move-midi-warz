---
type: brief
title: Orbits redesign brief
date: 2026-11-14
tags: [orbit2, redesign]
---

# Orbits redesign brief

## The ask (from the conductor, in their words)

"A team of UX designers rethinks the whole interface. It should fit on my screen, and should be more courageous, and
less buttons all around. They propose to a product owner, who is also an experimental music / IDM / ambient musician,
and together they decide a new set of playbooks."

## The screen

- The conductor's screen: MacBook Pro 14", 3024×1964 Retina → **1512×982 CSS px**. With the menu bar and the browser's
  own chrome the page gets about **1512×860**. That is the design target: **everything that matters on one screen, no
  page scroll**. A browser in full screen (1512×982) must also look intentional.
- Phones keep working (the touch work of ORBIT2-03/14 must not regress), but the desktop at 1512×860 is the priority.

## Today (baseline screenshots in `baseline/`, taken at 1512×860)

- **160 interactive controls visible on first load** (189 in the page), **13 `<details>` drawers**, a right column
  that already scrolls at this size, a three-line text readout, help paragraphs, a quest card.
- The orbit canvas (rings = lanes, comets = playheads, planets = hits) is the soul of the app and the one thing
  everyone loves. It sits in the middle, framed by panels.
- Every feature the panel built (73 backlog ids + automation, see `orbit2/docs/BACKLOG.md`) is reachable, mostly as
  its own button, chip, gauge or drawer.
- The **Ableton Move** is a first-class input (8 knobs, 32 pads, 16 step buttons, transport, wheel; full table in the
  "Move controls" section of `orbit2/index.html`). Much of the screen duplicates what the Move does.

## What "courageous" means here

Not a reskin. Proposals may remove the left/right panels entirely, make the canvas the interface, move rarely used
features behind one place (a command palette, a context menu, a "deep" mode, the Move), change the information
architecture, the typography, the colour, the motion. **Every feature must stay reachable** (say where it went), but
"reachable" does not mean "visible".

## Constraints (technical)

- Vanilla ES modules, no build step, no new dependencies; Tone.js + an AudioWorklet engine; canvas 2D scene
  (`orbit2/src/poly/scene.js`); GitHub Pages (static files only).
- The model and audio stay (`lanes.js`, `export.js`, voices, clock): this is an interface redesign.
- Accessibility basics stay (keyboard, screen reader names, focus, reduced motion; ORBIT2-03).
- Silence: browsers only through `tools/cdp.mjs` or `tools/headless-chrome.sh` (muted).

## What a proposal contains (`proposals/<designer>/`)

1. `proposal.md`: the concept in one sentence; who it is for; the screen at 1512×860 (wireframe: ASCII or an SVG
   file); the interaction model (what a click, drag, key, Move control does); **where every current feature goes**
   (a table: feature / today / in the proposal); what disappears from view; what it costs (rough phases, S/M/L);
   risks; what you'd test first.
2. `mock.html` (+ optional assets): a static, self-contained mock at 1512×860 that shows the main screen (it can embed
   a screenshot of the real canvas, or draw rings with CSS/SVG). Screenshot it to `mock-1512x860.png`.
3. Optional: a second screen (a deep/edit state, the phone).

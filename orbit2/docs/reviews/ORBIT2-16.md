---
type: review
phase: ORBIT2-16
title: ORBIT2-16 learning and simple mode (I6, I7), review panel
date: 2026-11-13
round: 1
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  maya: HAPPY
  greta: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-15]]'
---

# ORBIT2-16 · Learning and simple mode: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), maya, greta. Process: [[REVIEW-PANEL]].

Phase start: `fc54a63` (ORBIT2-15 closed). Implementation commits: `072a312` (I7 simple mode, I6 quests),
`43bc644` (tests and browser check).

## For the brief: where the new things are

| item | model / logic | on screen / input |
| --- | --- | --- |
| I6 quests (data) | new `orbit2/src/poly/quests.js` (pure, no DOM): `QUESTS` = 5 × `{ id, title, hint, drawer, check(machine, events) }` in order: `three-four` "make 3 against 4", `backbeat` "rotate the snare onto 2 and 4", `evolve` "let it evolve 8 bars", `slot` "save your first slot", `export` "export a loop". Helpers `sounding`, `loopQuarters`, `threeAgainstFour`, `snareLanes`, `onTwoAndFour`. A check needs your own move (an event) and the result | — |
| I6 events | `app.js` `questEvent(e)` appends to `questLog` (memory only, since the current quest came up; capped at 400) and runs `checkQuest` on a 0 ms timer: `{ type: 'edit', lane, k }` from a lane gauge's `onChange`, `nudge` (Move encoders 1–7), a canvas turn / pull / pinch (`gestureEnd`: `rotation` or `length`); `{ type: 'bar', evolving }` from every bar line in `onTick`; `{ type: 'slot-save' }` from `saveSlot`; `{ type: 'export', what }` from `exportWav`, `exportMidi`, `exportAll`, `exportStems`, `shareAudio` | — |
| I6 progress | key `midi-warz.orbit2.quests` = `{ done: [ids], view: 'simple' \| 'all' \| null, hidden }`, read through `questsFrom` (junk dropped); `currentQuest(done)` = the first not done; `hintDrawer(done)` = its drawer | quest card `#quest` in the right panel (`.hud`, under the welcome bar, above the jam panel): "quest N of 5", title, hint, `skip` (`#quest-skip`: marks it done, toast "skipped: …"), `×` (`#quest-x`: hides the card; switching to simple shows it again). The current quest's drawer gets a yellow border and a "quest N" tag on its summary (`.quest-lit`, `data-quest`): `lane-drawer`, `evolve-drawer`, `patterns-drawer`, `export-drawer` |
| I6 celebration | `celebrate(q)`: `.cheer` on the card (1.2 s glow + 3 % scale; `prefers-reduced-motion`: a steady glow, no animation) and a 4 s toast "quest done: … ✓ · next: …" ("that was the last one") | — |
| I7 view | `quests.view` = `startView(saved, firstVisit)`: a first visit (no `midi-warz.orbit2.v2` pattern saved) starts `simple`; a returning visit with no saved view starts `all`; a choice is kept. `setView(v)`: `body.simple`, gauge labels, closes an open lock panel, re-renders the card | `#view-mode` segmented "simple / everything", first row of the left panel (`#hud-left`) |
| I7 plain words | `PLAIN` = `{ euclid: 'hits', rotation: 'shift', ratio: 'speed', prob: 'chance' }`, `paramLabel(k, label, simple)`; applied in `buildSliders` and on every `setView` (`gauge.setLabel`) | lane drawer gauges: "hits", "shift", "speed", "chance" in simple; "euclid hits", "rotation", "speed ×", "probability" in everything |
| I7 tucked away | `body.simple .adv { display: none !important }` on: `#dice-drawer`, `#midi-drawer`, the evolve drawer's "how often each change" (`.evo-sub`), the lock panel `#lockpanel`, the lane drawer's generative block `#gen-block`. `locksTucked()`: in simple, `editLocks` (Alt+click / long-press a step) and `openRingMenu` (long-press a planet) open nothing and toast 'step locks are in "everything" (the switch at the top of the left panel)' | — |

Page handles: `__poly.quests` (the live progress object), `setView`, `questEvent`, `questLog`, plus `m`, `sync`,
`saveSlot`, `recallSlot`, `setEvolve`, `exportWav`, `exportMidi`, `exportAll`, `exportStems`, `shareAudio`, `editLocks`,
`applyTempo`, `undo`, `redo`, `initPattern`, `loadGroove`, `randomizeAll`, `setLaneCount`. Tests:
`orbit2/test/quests.test.js` (8).

## Pre-checks

`npm run check` clean, `npm test` 227 + 9 green on `43bc644` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; maya, greta on sonnet), own ports
5401 / 5402 / 5403 / 5405 / 5409 (+ 940x; the phase start `git archive fc54a63` on +100), the verifier also ran the
smoke (server 5451 + Chrome 9222). Brief: the phase goal, I6 / I7 verbatim from [[BACKLOG]], the phase spec (the build
tasks), the "where the new things are" table above, `git diff --stat fc54a63..43bc644` (5 files, +265/−19),
`git status --short` (only this file), the must-fix rule with the later phases (17 final, 18 automation) and the known
Later items, how to drive `orbit2/index.html` with `orbit2/tools/cdp.mjs` (first vs returning visits, reduced motion),
and how to run the phase start. (An earlier run had started round 1 and stopped before recording anything; its
scratch was removed and the round run again from the start.) `stalled: 0`: nothing was open before round 1.

| reviewer | verdict | MUST-FIX |
| --- | --- | --- |
| verifier | NOT HAPPY | 1 NEW (I6): "rotate the snare onto 2 and 4" can't be done by shifting on the beat every first visit gets: the demo `poly345` (`grooves.js:85-92`) has no snare voice, so `snareLanes` falls back to lane 2 by its internal name, shown as "2 rim" (`'X....'` at ×4, a loop of 1.25 beats); `onTwoAndFour` is false for every shift of every lane, also after the quest-1 moves (rim 5→3, hat 3→4); only length 8 + shift 4 gets there, and the hint (`quests.js:57`) says neither that nor which lane. 2 NEW (I7): the plain words reach only the lane-drawer gauges: simple mode still shows "rotation" in the evolve drawer's scope chips (`app.js:914`, the drawer quest 3 sends you to) and "euclid hits · rotation · speed ratio", "probability" in the Move table (`index.html:247-248`) |
| architect | NOT HAPPY | 1 NEW (= verifier 1): in node on the real groove, 5 steps (as loaded) and 3 steps (after rim 5→3) are false for every shift; in the page shift never ticked it until length 3→8, then shift 4 |
| sound | NOT HAPPY | 1 NEW (= verifier 1): every shift of every lane `00000` on the demo (kick `0000`, hat `000`, wood `00`), `000` after rim 5→3; of lengths 3/4/5/6/8/12/16 only 8 + shift 4; wants a unit test that the hinted moves work on `DEMO_GROOVE` (the tests only use a fresh 4-step ×1 lane) |
| maya | HAPPY | — |
| greta | HAPPY | — |

SHOULDs (never block): quest 1's hint reads as already done on the demo (a 3-step hat and a 4-step kick at
different speeds): say "at the same speed" (verifier, architect, sound, maya); the backbeat hint says "shift" in
"everything", where the knob reads "rotation" (verifier, architect); with reduced motion `.cheer` is never removed, the
glow stays for every later quest (verifier, architect); the lane drawer never shows the yellow border, its inline lane
colour wins (architect); skipped and finished quests look the same in the saved data, and the skip tooltip promises a
"list of what is left" that doesn't exist (architect, verifier, maya); `mount()` drops `#view-mode`'s title and
`.ctl` (architect); a move can go stale: a length change that isn't 3 : 4, then evolve / a slot / undo makes it 3 : 4,
ticks the quest on the next bar line (architect); the locks toast says "the switch at the top of the left panel", on a
phone it sits ~2400 px down (verifier, architect, greta); the evolve scope's "everything" chip beside the view
switch's "everything" (verifier); the export quest promises "a loop" while the demo's 4 bars cut its 5-bar cycle
(sound, export length from before the phase); the backbeat check reads the grid, not swing (sound); "hits" reads as a
count, the demo kick shows "0 hits" (verifier); on a phone the fixed ▶ covers the card's right end, the card and the
lane knobs sit low (verifier, architect, maya, greta); the Move still sets step locks in simple (architect); desktop
targets 32 px, the bare ×, no roving focus in the switch (greta).

### Changes after round 1

- **MUST-FIX 1 (verifier 1 = architect 1 = sound 1), the backbeat quest on the first-visit beat.** The hint is now
  written for the beat on screen (`quests.js`): every quest's `hint(m, say)` gets `say.word(k)` (a lane knob's label as
  the view shows it) and `say.lane(i)` (the lane as the screen names it, "lane 2 · rim"). `backbeatLane(m)` picks the
  snare lane (the first one only a shift away, else the first); `backbeatSetup(m, li)` lists what it lacks before a
  shift can do it: 4/4, an unmute, and when no rotation of its steps lands on 2 and 4 (the new pure `backbeatAt(l, rot)`;
  `onTwoAndFour(m, li, rot)` takes a rotation without moving the lane) the knobs of a plain backbeat it doesn't have yet:
  "length" 4, "speed" 1, "hits" 2 (beats 1 and 3, one shift away). On the demo: "Your snare is lane 2 · rim. Pick it,
  set "length" to 4, "speed" to 1 and "hits" to 2; then turn "shift" (or drag along its ring) until it hits on beats 2
  and 4, not 1 and 3."; `sync()` redraws the card, so the hint shrinks as you go ("…: pick it and turn "shift"…" once
  only the shift is left; ≤ 0.11 ms per hint in the worst case, 6 lanes × 32 steps). The length knob's rule moved into
  the model (`Lane.resize`, used by PARAMS and the tests), so the test follows the hint through the knobs' own code.
- **MUST-FIX 2 (verifier 2), plain words beyond the lane gauges.** `knobWord(k)` (one place: PARAMS label through
  `paramLabel` and the view) names the knobs wherever the page does: the lane gauges, the evolve scope chips
  (`evoScopeOptions()`: "shift / + hits / all" in simple, "rotation / + hits / all" in everything; the third chip is
  "all" in both, so the evolve drawer no longer has a second "everything") and the Move table (`[data-word]` spans:
  "length · hits · shift · speed", "swing · chance · tune", the locks row's "chance"; `setView` swaps them, the full
  words come back in everything).
- Quick SHOULDs: quest 1's hint says "both at the same speed" and "every 12 steps"; the backbeat hint uses the view's
  words ("rotation" in everything); the export hint says "your beat as a file" instead of "a loop"; a quest is checked
  only right after a move that can finish it (`on`: edit / edit / bar / slot-save / export) and the knob quests read
  your latest move (`lastEdit`), so evolve, a slot recall, an undo or an unrelated knob after an old length move no
  longer ticks it; the cheer class goes after 1.5 s (the steady reduced-motion glow too); the quest light is an inner
  line (`box-shadow: inset`), so the lane drawer shows it beside its lane-coloured border; progress keeps `skipped`
  (a subset of `done`; old keys load with `skipped: []`) and the skip tooltip says what skip does; the switch's title
  sits on its wrapper (`mount()` replaced it) and the radiogroup has an aria-label; the locks toast says "(the simple ·
  everything switch)", not "at the top of the left panel".
- Not done (BACKLOG Later, 7 entries): "The backbeat you hear" (swing), "Export the whole cycle", ""hits" on a hand-set
  lane", "Learning on a phone", "Step locks from the Move in simple", "Quest badges", "The quest card's controls".
- Tests: `quests.test.js` 8 → 9 (the `on` lists; latest-move cases for both knob quests; `onTwoAndFour` with a
  rotation leaves the lane alone; a new test follows the backbeat hint through the knobs on the demo, in another knob
  order, after quest 1 done as rim 5 → 3, on every starter groove, and on a fresh lane / an empty one / a muted one / a
  3/4 pattern; `skipped` parsing). `npm run check` clean, `npm test` 228 + 9 green, `node tools/smoke.mjs` 10/10.
  Own page e2e (cdp 5400/9400) 34/34 at 1440×900 + 390×844, 0 page errors: quest 1 by Shift+↓ on length, the quest-2
  hint followed with real keys (lane tab 2, length, speed ×7, hits ×2: the hint shrinks; the setup alone doesn't tick
  it, Shift+↑ on shift does), quest 3's drawer lit, the cheer gone 1.5 s later under reduced motion, done + skipped
  saved, everything by a click restores the full words and the drawers, the phase's first quests key and a returning
  visit load.

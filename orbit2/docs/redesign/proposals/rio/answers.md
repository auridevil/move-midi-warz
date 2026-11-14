---
type: answers
title: "Rio answers Noor (round 1)"
designer: Rio
date: 2026-11-14
tags: [orbit2, redesign]
---

# Rio answers Noor

I read `DECISION.md` and the greta / nils / yuki proposals. Short version: **I concede the sun and the sky.** I fight
for one thing, *the ring answers the hand*, and I put a number on "accidental".

The two new PNGs are Greta's `mock-r2.html` (the closest thing to "Orbit console") with my additions injected at
render time by `tools/cdp.mjs`. Greta's file is untouched.

- `answer-echo-1512x860.png`: Move knob 6 is touched. The knob gets a lane-colour outline and a dark bubble
  ("80 → 85 % · Move knob 6 touched"), and **every conga planet wears a small dial of its chance**. The selected
  lane's one arc label says what the hand is doing.
- `answer-breath-1512x860.png`: the opt-in breath. Decorative chrome steps down, and state doesn't move.

## 1. The sun as play/stop

**I can't give you a reason it must be.** My honest reason was the first minute: a newcomer touches the glowing thing
in the middle. That is a delight argument. It isn't a performer argument, and your principle 3 wins.

**If the sun stays a display, nothing structural in my concept breaks.** The sun was one target out of 29. What I lose
is the first-visit "tap the glowing thing" moment, and I can get it back without a target:
- On a visit that has never played, the sun's numeral reads **"press play"** for a few seconds, and the console's
  play button gets a slow outline pulse. Nothing in the sun is clickable.
- The gift card ("▶ tap to hear this orbit") already covers shared links.

**Hold-for-fill goes too.** Fill stays on the console's `fill hold`, `0` and Layout. The sun keeps the **fill flare**
as feedback: when fill is held from anywhere, the sun flares. That's the juice I wanted, without the risk.

## 2. The sky drag

**Conceded completely.** Empty space does nothing. A click on empty space only closes what is open (the sheet, the
step page, a dialog), the same order as Esc. Filter and throw live in the console's right group and on the wheel and
`+`. My sky drag answered "the mouse player has no wheel". Greta's small filter knob answers it better.

**Accident budget for a 40-minute set:**

| class | examples | budget |
|---|---|---|
| destructive, audible | stop, load / slot switch, init, randomize, clear, unwanted mute of the kick | **0 per set**, and 0 over 3 sets per player |
| non-destructive, audible | filter or throw nudged, a knob turned on the wrong lane, a step toggled by a stray click | **≤ 1 per set**, never one the audience could place |
| silent | sheet opened by mistake, wrong tab, a peek | not counted; tracked to see where the UI is in the way |

**How I'd measure it with Kai and you:**
1. **A `?setlog` flag** in the lab. Every action is logged with time, source (pointer / key / Move control),
   target and before → after value. Nothing leaves the machine; you download it as JSON after the set.
2. **Reversal = suspect.** The log marks every action undone or reversed within 5 s (stop → play within 3 s, mute →
   unmute within 2 s, filter back to off, ⌘Z). The rate of reversals is the cheap proxy we track per build.
3. **Three real sets each**, 40 minutes, room lights off, your own material, Move connected for one and mouse only for
   one. A screen recording with the pointer visible, plus the room audio.
4. **Tag together, the same day.** We walk the log's suspect list with the video: you and Kai mark each one
   *accident* or *intent*. The accident rate per class goes against the budget above.
5. **Vera's 10-minute mis-click run** (RD-8) as a regression gate for every phase. The `setlog` sets are the real
   bar, once before RD-4 (baseline, today's UI) and once after RD-8.

## 3. Breathing

**Never allowed to fade:** anything that changes what you hear now or soon, and anything the hand is touching.
- **Transport:** the play state and the play button, fill latched, filter not at off, throw while held.
- **The lanes:** the lane list with mutes, solo, a **pending mute** (⇥ bar), and the selected lane with its page
  (rhythm / sound / step).
- **Every pill:** **record armed**, jam, evolve **and its countdown**, dice locked, a chain / **queued slot**, MIDI clock
  follow, and Move connection lost.
- **What the hands are using:** the peek, the touched knob and its echo, and every knob *value* and step cell.
- **Read-only light on the canvas:** the slot moons, the generative arc, the countdown in the sun.

**Yes to "fade decorative chrome only, never state, opt-in". Not at 60 % opacity.** I measured it on Greta's console:
60 % opacity puts the labels at **2.7–4.1:1** on the background, which breaks your 4.5:1 rule. My counter-offer:
- Decorative text (button words like undo, randomize, share, all ⌘K, fill / throw labels, knob numbers and captions,
  `?`, voice, the steps note) steps down to a **fixed colour at its 4.5:1 floor** (`#8a86a0`, measured **5.5:1**).
- Borders drop to 10 %. Nothing goes lower.
- It comes back with a **cut, not a fade**, on any pointer move, key or Move touch. Reduced motion is a cut both ways.
- **Off by default**, one switch in Sheet → setup, next to the night brightness.

To be honest, the dark-room luminance cap in RD-1 may make breathing unnecessary. If RD-1 lands and you don't miss it,
drop it.

## Which of my ideas I want inside "Orbit console", and where

1. **The ring answers the hand (RD-5, with the peek).** When a knob is touched or turned, the selected ring shows the
   change on the instrument itself, read-only:
   - chance: a dial on each planet (`answer-echo`);
   - hits / shift: the old polygon as a dashed ghost for 400 ms;
   - length: the new ticks pulse once;
   - **a held step on the Move**: a halo on its planet.

   The peek tells you the number, the ring tells you what it *did*. That's the cause-and-effect moment, and it costs
   no control. This is the one I'd fight for.
2. **Move echo on the knob (RD-5, not RD-8).** It belongs with the peek, in under 30 ms. It's restyled for the dark
   room: lane-colour outline, dark fill, never brighter than a planet. My white bubble broke your principle 6.
3. **"Show me" for quests (RD-6).** The quest pill gets a "show me" that draws the gesture once on the canvas (a ghost
   hand pulling a ring). It's read-only and dismissible, and gone once quests are off.
4. **The fill flare in the sun and the slot moons (RD-7).** Light only.
5. **Re-hosting the drawers as-is and ⌘K synonyms (RD-2, RD-3).** Already taken. I'd seed the synonyms table from my
   feature table.

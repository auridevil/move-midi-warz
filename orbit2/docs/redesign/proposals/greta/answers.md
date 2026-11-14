---
type: redesign-answers
title: "Greta answers Noor (round 1 → 2)"
designer: Greta
date: 2026-11-14
tags: [orbit2, redesign]
---

# Answers to Noor

New mock: `mock-r2.html` (round 1's `mock.html` stays as it was). Four renders:

| file | what |
|---|---|
| `mock-r2-dark-1512x860.png` | the main screen at dark-room luminance; rings capped at 630 px; the peek; three pills |
| `mock-r2-pages-1512x860.png` | the knob row's pages at full size, stacked (rhythm, sound, step 7, and rhythm on another lane) |
| `mock-r2-sheet-1512x860.png` | the sheet as an overlay in the right column; the rings have not moved |
| `mock-r2-small-1280x720.png` | 1280×720, 6 lanes, three pills, sheet open |

Each render was measured in the page: every text element, composited over its real background (lane-colour
legend dots skipped, they carry the planet's own colour by definition).

| render | lowest text contrast | brightest control pixel (relative luminance) |
|---|---|---|
| dark 1512 | **5.14 : 1** (a pill's ×) | **0.475** (`--v`, the outline of a pressed M) |
| sheet 1512 | 5.14 : 1 | 0.475 |
| small 1280 | 5.14 : 1 | 0.475 |
| pages | 5.17 : 1 (a knob's index number) | 0.475 for controls; 0.67 for clave's own accent cell, under the clave planet (0.69) |

## 1. Why should transport outshine the rings?

It shouldn't. You are right, and the white disc goes. I made play the brightest thing so that a newcomer finds it. That
is a daylight argument, and this instrument is played in the dark.

What changes (`mock-r2-dark-1512x860.png`):

- **A luminance ceiling for the face.** No control pixel is brighter than `--v` = `#b9b5c8` (relative luminance 0.46).
  The planets' cores, the comet heads and the sun are drawn at about 1.0, so the canvas is always the brightest thing.
  The lane dots in the list use the lane's own colour, which is never brighter than its planet.
- **Four greys and nothing else** on `#0c0919`:
  - `--v` `#b9b5c8` for values and active text (9.8 : 1);
  - `--l` `#8d889e` for labels (5.7 : 1 on the background, 5.1 on a pill: the floor);
  - `--b` `#625d73` for borders (3.1 : 1, which meets WCAG 1.4.11 for component edges; round 1's 12 % hairlines did
    not);
  - `--track` for knob tracks only, never for text.
- **No fills on controls.** "On" is a 2 px `--v` outline (a muted M, a pressed chip). Play is a 64 px outlined ring
  with an outlined triangle. Playing turns the triangle into a square. Play stays the largest control and the first
  Tab stop, so it is found by size and position, not by light.
- **Lit cells are dimmed lane colour**: on = 45 % of the lane colour over the background, accent = 62 %, ghost = 22 %.
  The 1:2 condition mark is a two-dot pictogram, not dark text on a lit cell (that text failed at 2.3 : 1).
- **Red only for record** (`#ff6b78`, 7 : 1), on the record pill and the jam dot.
- **The trade-off**: with no fill, play is found by size, place and the Space bar, not by glare. I accept that. A
  newcomer is helped by the demo already playing, not by a white disc.

## 2. Which page, which lane, in 300 ms, without reading

You don't have time to read in 300 ms; you have time to see shape, colour and position. Each question gets two cues
that work without text (`mock-r2-pages-1512x860.png`, at real size: look at it from arm's length).

**Which page:**

| page | knob shape | the cells | the page switch | the band |
|---|---|---|---|---|
| rhythm | thin **arcs** with a dot | **rectangles** (steps) | underline on the left | none |
| sound (Shift) | filled **pies** | the same rectangles (the Move's step buttons don't change with Shift either) | underline in the middle | the knob row sits on a lit lane-tinted band, like Shift lighting up on hardware |
| step N (a step held) | **rings**: solid and lane-coloured where locked, dashed grey where the step follows the lane | **round dots**, the step's 16 loops (Nils): filled = plays, white ring = the loop now | underline on the right | header in the lane colour: "conga › step 7" |

Arc, pie and ring differ in their outline. At 70 cm a 40 px knob is about 8 mm across, and a filled pie next to an
open arc does not need focus to tell apart. Rectangles turning into circles is the strongest change in the console,
which is right: the step page is the one where the cells stop being steps.

**Which lane:** one colour runs through every mark that belongs to the lane. That is the 2 px rule along the top edge
of the console, the knob arcs or pies, the lit cells, the dot by the name and the bar in the lane list. Change lanes and
every mark changes hue at once (the fourth strip, clave). The selected ring on the canvas should brighten too (RD-7).
That is the same cue in the place you are actually looking.

**Which knob your hand is on:** the touched knob gets a faint plate. The peek sits in the empty left column, under the
lane list: the knob number in the lane colour, the value at 64 px weight 300, and one plain line ("plays 85 of 100
loops"). It is never on the rings and never under the sheet.

**What I would test:** Noor and Kai, with a Move, look away, hold or turn something, look up for 300 ms (a shutter),
then name the page and the lane. 20 trials each. If fewer than 18 of 20 are right, I would add a fourth cue: the knob
index numbers swap to S1–S8 and L1–L8 on the sound and step pages.

## 3. Can the sheet open without touching the rings?

Yes (`mock-r2-sheet-1512x860.png`). The design is three fixed columns, and the sheet is an overlay on the third one.

- **Left column, x 24–300**: lanes, then the peek. Nothing ever overlays it.
- **Stage**: the rings, **630 px** across (the outer cycle arc), centred at x 756, y 358, at every moment. The sheet
  does not move or resize them, and neither does anything else.
- **Right column, x 1084–1512**: the Move pill and "?", then the pills, then the sheet. The sheet opens as a 428 px
  overlay **under the last pill**, down to the console. State is never covered (principle 4), and the pills do not
  reflow onto the rings.

**What we lose at 1512×860:**
- 70 px of ring diameter against round 1 (−10 % across, −19 % area). Today's ring is about 600, so we are still ahead.
- Sheet height. With three pills the sheet is 512 px tall, about 10 % less than a full-height sheet. A tab with more
  than that (export, MIDI) scrolls inside the sheet. The page itself never scrolls.
- The right column is empty when nothing is on and the sheet is closed. I like that: it is the dark.

**At 1280×720, with 6 lanes and three pills** (`mock-r2-small-1280x720.png`):
- **Console** 128 px: 44 px cells, 34 px knobs, 52 px play. Every target is still at least 32 px (T2/T7).
- **Left column** 256 px: six 40 px lane rows, then the peek.
- **Right column** from x 900: the pills, then the sheet. With three pills the sheet starts at y 204 and is **388 px
  tall**. It shows the search, the tabs and about one and a half sections, then scrolls inside. Search becomes the
  main route there.
- **Rings 568 px**, centred between the columns at x 578, not at the window centre (640). They are fixed in place, but
  64 px off the centre of the screen. If Noor wants them centred at 1280, the cost is a 330 px sheet, too narrow for
  the export tab.
- **Four or more pills**: the column stops growing at four. The fifth and later pills fold into "+2 more ▾" (still
  `role="status"`, still announced), so the sheet always has at least 340 px.

## Where I disagree

- **Fill next, throw and filter on the face (Noor).** I accept them, small, in the transport group next to fill, as
  the mock shows. All "perform" controls then sit in one place. But a mouse-dragged filter is a poor performance
  control: it has no detent at "off", and dragging is slow. It needs a centre detent and double-click = off, or it will
  be left at 0.2 in the middle of a set.
- **The peek on hover after 0.6 s (DECISION, rule 3).** No. In a dark room the pointer rests anywhere, and a 64 px
  number appearing because the mouse sat still is exactly the noise you are cutting. The peek should appear on Move
  touch, a drag, or keyboard focus (focus also helps a screen-magnifier user). Never on hover.
- **Rio's Move echo bubble on the knob, as well as the peek.** That is two readouts of one gesture. Keep the peek,
  and drop the bubble or reduce it to the touched knob's plate.
- **Yuki's generative arc on the canvas as well as the pills.** If both are used, each state should be shown once.
  The pill is the control (its × turns the mode off), and the arc is the time (the countdown to the next mutation).
  The pill text should not repeat the countdown; in my mock "evolve · next in 3 bars" should become "evolve ×" once
  the arc ships.
- **Space Grotesk 300 (Yuki) below 40 px.** Thin light strokes on a dark ground bloom and break up on a dark screen
  (halation). 300 only for the peek and the countdown numeral; 400 / 500 everywhere else.
- **Nils's step page, latched with the mouse.** When the cells become loops, a mouse player can't pick another step to
  edit without "done" first. That is fine on the Move (you let go). On screen I'd let a click on a planet switch the
  step while the page is latched.

## What I take from the others

- **Nils:** the peek; cells as loops while a step is held; the latched / momentary rule; knob index numbers 1–8 on
  every knob (now in the mock); the "?" that draws the Move.
- **Yuki:** the colour and type rules (adopted above, with the 300 limit); the countdown numeral in the sun; the cycle
  captioned in words; the generative arc as read-only time.
- **Rio:** re-hosting the drawers as they are, which is my own phase 1 too; a search with recents and synonyms; the
  slot moons as a read-out.

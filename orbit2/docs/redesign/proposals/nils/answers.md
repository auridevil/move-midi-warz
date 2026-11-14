---
type: redesign-answers
designer: Nils
to: Noor (DECISION.md, round 1)
date: 2026-11-14
tags: [orbit2, redesign]
---

# Nils: answers to Noor

Sheets: `answer-states-1512x860.png` (Q2) and `answer-drift-1512x860.png` (Q1). Both come from `answers.html` (`#states`,
`#drift`) and are drawn in the "Orbit console" direction.

I checked the facts below against today's code, not my memory:
- **The held step.** In `app.js`, the `encoder` / `step` / `button` handlers do this: with a step held, knobs 1–7 are
  locks whether or not Shift is down. Knob 8 is the condition, and Shift + knob 8 is repeats.
- **Look vs tap.** `LOOK_MS` is 450 ms. A release after a look or after a knob turn does not toggle the step.
- **Accent** only happens when Shift is already down at the moment the step is pressed.
- **LEDs today** (`paintLeds`): the − LED is magenta while evolve is on. The Move has no LEDs on its encoders.

## Q1. Drift with the screen off

**Short answer:** in my round-1 proposal it was "look at the screen", so it was *not* a Move feature. I am changing it
until it is one:

1. **One drift page, momentary only.** You are on drift while your finger holds −, and there is no other way in.
   - I drop the WORLD/LANE sub-page. A page you can be on without holding anything is exactly what fails with the
     screen off.
   - I drop hold Loop + knobs (those are pattern settings, so they go to sheet › pattern).
   - I drop "Shift = step page 2". Nudge and stroke stay on the jog; the rest goes to sheet › lane.
   - **Hold Loop keeps today's meaning only.**
2. **The Move's LEDs while − is held** (encoders have none, so the step buttons carry everything):

   | LED | Shows |
   |---|---|
   | − | white while held; magenta when evolve is on (as today) |
   | steps 1–6 | lanes that evolve in their lane colour, steady lanes dark. Tapping a step toggles that lane (a flagged chord) |
   | steps 9–16 | the countdown to the next mutation: 8 white LEDs that drain one per ⅛ of "every" |
   | pads, tracks | unchanged: the music and the lane selection |
3. **The touched knob's value on the step LEDs.** While a drift encoder is touched (touch notes 0–7), all 16 step LEDs
   become a meter for it. Every = 8 bars lights 8 LEDs, and amount, gravity, coupling and humanize work the same way
   in 16ths. Let go of the knob and the table above returns.

   This is the part that matters. Drift knobs have no audible result right away (a mutation comes every N bars), so
   unlike Shift + knobs you cannot hear your way to a value. **Without the meter, drift is a screen feature with a Move
   shortcut**, and I would not ship it under the Move's name.

**RD-10 gate.** With the screen off, set every = 8, amount ≈ half, and lanes 1, 2 and 4 evolving, then check the
screen. It passes at 5/5 tries with no glance at the screen. If the meter fails this test, drift stays a page you
reach with the mouse.

## Q2. Latched page × Move-held control

**The one rule:**
- A Move control that is **held** (Shift, a step, Loop, −) or **touched** (an encoder) **owns the knob row and the
  cells** for as long as it is held or touched.
- On release, the row returns to the page latched on screen, not to rhythm.
- The Move mapping never changes. The screen latch only changes what the *mouse* edits.
- The mouse always drags what is drawn. While a Move hold owns the row, a mouse drag edits the same thing the Move
  knob would.
- The header carries a small "MOVE ⇢ …" chip that names what the Move's knobs edit right now. When that differs from
  the page you see (T0), it is grey; when the Move owns the row it is white.

Noor's sequence: SOUND latched with the mouse → hold step 7 → press Shift → let go of step 7 → let go of Shift.

| t | Hands (Move) | Move knobs 1–7 edit | Move knob 8 edits | Row shows (and the mouse drags) | Cells show | Header / chip | Move LEDs (steps) |
|---|---|---|---|---|---|---|---|
| T0 | nothing | length · hits · shift · speed · swing · chance · tune | tempo | **sound** (latched): decay … level | lane steps, playhead | `4 · conga  sound` · chip grey **MOVE ⇢ RHYTHM** | lane steps |
| T0′ | touch encoder 3 | (same) | (same) | **rhythm**, while touched + 400 ms; the peek shows "shift 2" | lane steps | chip white **MOVE ⇢ RHYTHM** | lane steps |
| T1a | step 7 down, < 450 ms, no turn | **locks of step 7** (tune · chance · velocity · decay · tone · snap · color) | **condition** | still **sound** (it may be a tap); cell 7 is outlined within a frame | lane steps, cell 7 outlined | unchanged | lane steps |
| T1b | step 7 held ≥ 450 ms **or** a knob turned | locks of step 7 | condition | **step 7**: the 8 locks; unlocked ones are grey "lane" values | **16 loops of step 7** (lit = plays, ring = now) | `step 7 · held on Move` · chip white **MOVE ⇢ STEP 7** | 16 loops (P7, as today) |
| T2 | + Shift (step still held) | **still the locks** (Shift is ignored on 1–7, today and after) | **repeats ×1–4** | step 7; **only slot 8 repaints**, as "repeats ⇧" | loops | `… ⇧` · **MOVE ⇢ STEP 7 ⇧** | loops; track buttons show lanes 5–6 (Shift, as today) |
| T3 | let go of step 7, Shift held | **sound**: decay · tone · drive · snap · color · send · pan | level | **sound** (because of Shift; the same page as the latch, so only the header changes) | lane steps | `sound ⇧` · **MOVE ⇢ SOUND ⇧** | lane steps |
| T4 | let go of Shift | rhythm (as T0) | tempo | **sound** (latched) | lane steps | = T0 | lane steps |

Edge cases, decided:
- **Shift let go first (T2 → step still held):** knob 8 goes back to condition and slot 8 repaints. Nothing else
  changes.
- **A quick tap:** step down, Shift, both up within 450 ms with no turn. The step toggles, as today. The row never left
  sound.
- **The mouse clicks a page tab while a Move hold owns the row:** the click changes the *latch*, so it changes what you
  come back to. The row keeps showing the held page.
- **A mouse step page (long-press cell 3) plus a Move hold on step 7:** the Move wins while it is held, then you come
  back to step 3. Esc closes step 3.
- **Hold Loop:** the cells show the 16 slots. The knobs keep their latched or Move meaning, because Loop + knobs is
  dropped (see Q1).

## Q3. What never repaints

A page repaints **24 controls and one header line**: the 8 slots, the 16 cells and the console header. It never
repaints anything else. In every page (rhythm, sound, step, slots, drift), these pixels answer the three questions:

| Question | Pixels (fixed position, never repainted by a page) |
|---|---|
| Is it still playing? | ① **the comets moving on the rings** (the rings are never repainted or moved, principle 1); ② the transport glyph **■** (outlined, not filled); ③ a **bar·beat count** "03.2" next to it, 18 px, ticking. I ask for ③ in RD-4: Greta's console lacks it, and at 70 cm a ticking number is quicker to read than a comet. Also, in the step page the "now" loop ring moves on every loop. |
| Which lane is muted? | the **lane list** (top left): a filled M lamp plus the name at 35 %, and **the ring itself at 35 %** on the canvas. When the selected lane is muted, the console header's lane chip also shows the M. A pending mute is the blue lamp plus its pill. |
| Is record armed? | the **"● rec armed ×" pill** (top right, red, the only red on the face) and the record control's ring in red. While armed *and* playing, a **2 px red line along the console's top edge**. It is dim enough to stay under the planets, and it is visible in every page because the console edge is never part of a page. |

**If DRIFT is one knob page rather than a mode, what do I lose?** Very little, and I agree with the change:
- **The LANE sub-page:** push/pull, vel humanize, swing template, euclid mask, modulation and scale move to sheet ›
  lane. That costs me feel controls under the hands. If players miss them, I'd bring back only **push/pull and vel
  humanize**, as swaps for two drift knobs after the screen-off test, never as a sub-page.
- **The ring treatment** (stronger "didn't play" ghosts). It broke principle 1 anyway, and Yuki's read-only
  generative arc does the job better.
- **The coupling matrix on the cells.** It goes to sheet › groove. I keep the matrix's *lift* as drift knob 6.
- **What stays:** the 8 world knobs and the cells as "which lanes evolve" (and with Q1, the LED meter). That is all of
  drift that a hand needs in a set.

## Where I disagree with the direction

1. **"The screen follows within a frame"** cannot be literal for a held step. Until 450 ms, a step press might be a
   tap, and flashing the step page on every tap would be noise in a 40-minute set. My split: the cell outline appears
   in one frame, and the page flips at 450 ms or on the first knob turn. The page should flip *sooner* only for a turn,
   never for time alone.
2. **The silent mismatch at T0.** With SOUND latched, the Move's knobs edit rhythm while the screen shows sound. The
   "MOVE ⇢ RHYTHM" chip and the touch flip have to ship in RD-4, not RD-5. Otherwise the first touch of a Move knob
   edits a parameter that isn't drawn. The alternative is a "Shift lock" that latches the Move too, but that changes
   the mapping, so I don't propose it.
3. **Yuki's weight 300 for the knob values.** Thin numerals in a dark room at 70 cm fail before contrast does. Use 300
   for the countdown numeral and the peek (64 px) only, and **500** for the 22 px knob values.
4. **The peek on hover (0.6 s).** For a mouse player, hovering is not touching: it will fire while they aim across the
   row. Show the peek on drag and on Move touch only. Hover can show the name in the slot's own label.
5. **The bar·beat counter.** It is not in the decided wireframe. I think it is the cheapest "still playing" signal for
   someone looking up from the Move, and I would add it.

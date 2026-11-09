---
type: process
title: Orbit2 review panel and the "everyone happy" loop
tags: [orbit2, review, playbook]
---

# Review panel

Every playbook phase ends with this panel. The phase is done only when **every reviewer named for the phase says
HAPPY**. Reviewers are sub-agents (Agent tool, `general-purpose`), launched **in parallel in one message**, each with
its own persona, its own ports and a fresh brief. They never edit repo files; they report.

## The reviewers

Core (in every phase):

| id | Who | Looks at |
|---|---|---|
| `verifier` | **Vera, QA / verification engineer.** Adversarial, reproduces everything. | Reads the diff; runs `npm run check`, `npm test`, `node tools/smoke.mjs`; drives `orbit2/index.html` in headless Chrome; tries edge cases (tempo extremes, empty pattern, max lengths, phone size, stop/start mid-bar, undo/redo, reload, a share link, old saved data). Reports only confirmed defects, with repro. |
| `architect` | **Arjun, senior software architect.** Pragmatic, hates accidental complexity. | Module boundaries (pure model in `lanes.js`/`export.js`/`jam.js` vs DOM/audio in `app.js`), duplication (reuse existing helpers: `ui.js`, `gauge.js`, `expandHits`, `collectHits`), data model + save format compatibility (old `midi-warz.orbit2.*` data must still load), testability (new logic has unit tests), performance on the audio path (nothing heavy inside the Tone.Loop callback), file size growth of `app.js`, naming and comment style matching the codebase. |
| `sound` | **Sofia, sound / mastering engineer.** Ears first, then meters. | Renders audio offline (exportWav/exportStems via `cdp.mjs`, `parseWav`) and analyses it: peak/RMS, clipping, DC, clicks at loop points and at note starts/ends, phase between stems and mix, latency, aliasing, level balance between voices/kits, gain staging through the master comp/limiter, timing accuracy in samples, CPU/stress meter while playing. Judges whether changes sound musical, not only correct. |

Personas (named per phase, from the panel that produced the backlog):

| id | Who | Cares about |
|---|---|---|
| `kai` | Kai, 38, Berlin techno live performer, Elektron user, expert | Playing live without looking, mutes/fills/transitions, MIDI clock + latency, safety on stage |
| `maya` | Maya, 19, lo-fi beginner, Move owner | First 5 minutes, sounds good fast, plain language, phone |
| `dex` | Dex, 31, DnB/jungle producer, Ableton Arrangement | Samples/breaks, ghost notes, round-trip to Ableton (stems, MIDI, Drum Rack) |
| `ines` | Ines, 45, IDM/generative composer, Max/SC | Rhythm model correctness, steerable generative, microtiming, visuals that reveal structure |
| `tomi` | Tomi, 34, Afro-house/Amapiano producer + percussionist | Groove/feel, swing, 12/8, clave, cross-rhythms, percussion voices, dynamics |
| `greta` | Greta, 50, minimalist UX/interaction designer | Hierarchy, cognitive load, consistency, accessibility (ARIA, focus, keyboard, contrast, targets) |
| `rio` | Rio, 29, playful UX/product designer, mobile-first | Onboarding, delight, touch, sharing, coming back |

## Ports (never share them)

Each reviewer uses `launch({ port, debugPort })` from `orbit2/tools/cdp.mjs` with:
verifier 5401/9401, architect 5402/9402, sound 5403/9403, kai 5404/9404, maya 5405/9405, dex 5406/9406,
ines 5407/9407, tomi 5408/9408, greta 5409/9409, rio 5410/9410. The implementing agent itself uses 5400/9400.
Scratch files go to `/tmp/orbit2-<id>/`, deleted at the end. Always `await b.close()`.

## Who reviews which phase

At most **five reviewers per phase**: the three core reviewers (verifier, architect, sound) plus the **two personas**
closest to the phase. The playbook names them in its header. The final phase (ORBIT2-17) uses all ten.

| phase | personas | phase | personas |
|---|---|---|---|
| 01 bugs | kai, ines | 10 export | dex, kai |
| 02 first visit | maya, rio | 11 live | kai, greta |
| 03 touch + a11y | greta, rio | 12 generative | ines, tomi |
| 04 calmer screen | greta, kai | 13 structure visuals | ines, greta |
| 05 groove | tomi, dex | 14 canvas | rio, maya |
| 06 clock + meter | ines, kai | 15 sharing | rio, dex |
| 07 32 steps, 6 lanes | tomi, kai | 16 learning | maya, greta |
| 08 voices | tomi, dex | 17 final | all ten |
| 09 samples | dex, maya | | |

## What blocks HAPPY (the must-fix rule)

A MUST-FIX is only:

1. a defect in this phase's own backlog items (it doesn't do what the item says, or does it wrong), or
2. a regression caused by this phase's changes (something that worked before the phase and doesn't now), or
3. a broken test, check or smoke run, a page error, or data loss (old saved data / share links no longer load).

Everything else is a SHOULD and **never blocks HAPPY**: problems the shipped Orbits already had, polish, ideas,
taste, things another phase owns. The implementer does a SHOULD only if it takes a few minutes; the rest goes to the
"Later" section of `BACKLOG.md` with the reviewer and phase. Reviewers get this rule in their brief, and a NOT HAPPY
without an in-scope MUST-FIX counts as HAPPY.

## State lives in the review file

`orbit2/docs/reviews/ORBIT2-NN.md`, so any task (and any restarted session) knows exactly where the phase stands:

```yaml
---
type: review
phase: ORBIT2-NN
title: ...
date: YYYY-MM-DD
round: 2            # last COMPLETED round (0 = none yet)
result: IN PROGRESS # IN PROGRESS | HAPPY | BLOCKED
reviewers:          # this phase's panel and each one's latest verdict
  verifier: HAPPY
  architect: NOT HAPPY
  sound: HAPPY
  kai: HAPPY
  ines: NOT HAPPY
---
```

Body: one section per round (`## Round N`), a table `reviewer | verdict | MUST-FIX` (with evidence), then
`### Changes after round N` (what was fixed, tests added, check/test results). Factual, short.

## One review round (one playbook task)

Each round is its own checkbox, so a round is a bounded piece of work and a crash loses at most one round.

1. **Read the state.** If `result` is HAPPY or BLOCKED, or `round` is already ≥ this task's round, tick the box and
   stop. (Round 1 also checks the gate: the previous phase's review file says `result: HAPPY`; if not, halt the
   playbook saying so.)
2. **Who:** round 1 = the whole panel; later rounds = only reviewers whose latest verdict is NOT HAPPY.
3. **Brief** (same for everyone): the phase goal, its backlog ids with their text from `BACKLOG.md`, the must-fix rule
   above, `git diff --stat <phase start>..HEAD` + `git status --short`, how to open `orbit2/index.html` with
   `orbit2/tools/cdp.mjs`, and for a re-review: that reviewer's own previous MUST-FIX items plus the "Changes after
   round N-1" section. Plus persona, ports, scratch dir and these rules: read-only (never edit repo files), verify by
   running things, **at most ~25 tool calls, stay on this phase**, close every browser and server, answer exactly:

   ```
   VERDICT: HAPPY | NOT HAPPY
   MUST-FIX (in scope only, blocks HAPPY): numbered, each with evidence (file:line, repro, measurement), expected vs actual
   SHOULD (never blocks): numbered
   GOOD: up to 3 things to keep
   ```

4. **Launch** them as fresh sub-agents (Agent tool, `general-purpose`) **in one message, in parallel**. Core reviewers
   use the default model; personas use `model: "sonnet"`. Never reuse agent ids from an earlier task: they do not
   survive a new session, which is why previous findings travel in the brief.
5. **Record** the verdicts in the file (round table, `reviewers`, `round`, and `result: HAPPY` if all are HAPPY).
6. **Fix** every in-scope MUST-FIX inside `orbit2/` with tests; run `npm run check`, `npm test`, `node tools/smoke.mjs`;
   write "Changes after round N"; **commit locally** (`orbit2: phase NN review round N`). Do not start the next round
   in the same task.

## Closing a phase (the close task)

1. If `result` is IN PROGRESS: a **confirmation round** with only the reviewers still NOT HAPPY, on the fixes of the last
   round (same brief rules). If they are all HAPPY now, set `result: HAPPY`. Otherwise fix what's in scope **once**
   more, then set `result: BLOCKED`, list each open MUST-FIX and the reviewer, and halt the playbook with that reason:
   the conductor decides. Two reviewers demanding incompatible things is also BLOCKED.
2. If `result: HAPPY`: mark the phase's backlog ids done, run check/test (green), confirm only `orbit2/` changed, commit
   locally `orbit2: <phase title>`.

A reviewer is never told what to conclude, and never given the implementer's opinion of the work, only the brief.

## Running the playbooks

Run them on a **dedicated Maestro agent** for this repo (not the agent you chat with): a message to the agent running
an Auto Run interrupts the task in progress. Commits stay local; push when you are happy.

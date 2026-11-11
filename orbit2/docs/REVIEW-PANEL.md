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
stalled: 0          # rounds in a row that closed none of the previous round's MUST-FIX
result: IN PROGRESS # IN PROGRESS | HAPPY | BLOCKED
reviewers:          # this phase's panel and each one's latest verdict
  verifier: HAPPY
  architect: NOT HAPPY
  sound: HAPPY
  kai: HAPPY
  ines: HAPPY (deferred: <item>, see [[ORBIT2-NN-FOLLOWUP]])
---
```

Body: one section per round (`## Round N`), a table `reviewer | verdict | MUST-FIX` (with evidence; findings that are
new this round are marked NEW), then `### Changes after round N` (what was fixed, tests added, check/test results), and
if it comes to that `## Motion to defer`. Factual, short.

## The loop: fix until happy, as long as it makes progress

A NOT HAPPY reviewer is never the end of the road. The phase cycles **review → fix → re-check** while each round closes
something, and when it stops closing things the **whole panel decides** whether the rest can move to a follow-up
playbook. Only a refused deferral stops the run for the conductor.

```
round 1 (whole panel) ─► fix ─► re-check (only the NOT HAPPY ones) ─► fix ─► … ─► all HAPPY ─► close
                                   │
                                   └─ 2 rounds in a row with no MUST-FIX closed, or the round slots run out
                                        ─► motion to defer ─► whole panel votes
                                              ├─ unanimous ACCEPT ─► follow-up playbook, phase closes HAPPY
                                              └─ any REJECT ─► BLOCKED, halt: the conductor decides
```

### One review round (one playbook task; a playbook has several round slots)

1. **Read the state.** If `result` is not IN PROGRESS, or `round` is already ≥ this slot's number, or `stalled` ≥ 2,
   change nothing and tick the box (the next task takes over).
2. **Who:** round 1 = the whole panel. Later rounds = only the reviewers whose latest verdict is NOT HAPPY.
3. **Brief** (same for everyone): the phase goal, its backlog ids with their text from `BACKLOG.md`, the must-fix rule
   above, `git diff --stat <phase start>..HEAD` + `git status --short`, how to open `orbit2/index.html` with
   `orbit2/tools/cdp.mjs`. For a **re-check**, also that reviewer's open MUST-FIX items and the latest "Changes after
   round" section, with the instruction: *first confirm each of your open items is fixed (with the same repro), then
   check the fix broke nothing nearby; report anything else only if it is in scope, and mark it NEW.* Plus persona,
   ports, scratch dir and these rules: read-only (never edit repo files), verify by running things, **at most ~25 tool
   calls, stay on this phase**, close every browser and server, answer exactly:

   ```
   VERDICT: HAPPY | NOT HAPPY
   MUST-FIX (in scope only, blocks HAPPY): numbered, each with evidence (file:line, repro, measurement), expected vs actual; NEW if not raised before
   SHOULD (never blocks): numbered
   GOOD: up to 3 things to keep
   ```

4. **Launch** them as fresh sub-agents (Agent tool, `general-purpose`) **in one message, in parallel**. Core reviewers
   use the default model; personas use `model: "sonnet"`. Never reuse agent ids from an earlier task: they do not
   survive a new session, which is why previous findings travel in the brief.
5. **Record** the round (table, `reviewers`, `round`). **Progress:** if at least one MUST-FIX open before this round is
   now closed, or everyone is HAPPY, set `stalled: 0`; otherwise `stalled` + 1. All HAPPY → `result: HAPPY`, commit
   locally, done.
6. **Fix** every open in-scope MUST-FIX inside `orbit2/` with tests; run `npm run check`, `npm test`,
   `node tools/smoke.mjs`; write "Changes after round N"; **commit locally** (`orbit2: phase NN review round N`). Do not
   start the next round in the same task: the next slot re-checks the fix. **A fix is never left unchecked.**

### Motion to defer (one task, after the round slots)

Runs only if `result` is still IN PROGRESS (the loop stalled twice, or the slots ran out). For each open MUST-FIX the
implementer writes a motion in the review file under `## Motion to defer`:

- the item, its reviewer, the evidence and how many rounds it has been open (and what each fix closed);
- **why the phase can ship without it**: how rare it is, what a user would hear or see, whether it is a regression of the
  shipped Orbits (a regression can't be deferred unless it is guarded off);
- a **guard** added now when possible (a test pinned as a known failure, an assertion, the feature off in that case);
- where it goes: `.maestro/playbooks/2026-11-06-Orbit2-Lab/followups/ORBIT2-NN-FOLLOWUP.md`.

**The whole panel votes** (fresh sub-agents, one message, parallel, personas on `sonnet`, about 10 tool calls each),
including the reviewer who raised the item. Brief: the motion, its evidence and the last round's section. Answer:
`VOTE: ACCEPT | REJECT` and one paragraph. Record the votes.

- **Unanimous ACCEPT:** write the follow-up playbook (same header and rules as the phase, one build task per deferred
  item with its repro and the expected behaviour, a tests-and-browser task, round slots, motion and close per this
  file, the same panel); add the items to `BACKLOG.md` under "Deferred" with a link; set the raising reviewer to
  `HAPPY (deferred: …)`, `result: HAPPY`; commit locally.
- **Any REJECT:** `result: BLOCKED`, the rejecting reviewers and their reasons in the file, commit locally, and halt the
  playbook: "ORBIT2-NN blocked: <reviewer> rejected deferring <item>". This is the only way a phase stops the run.

Two reviewers demanding incompatible things is settled the same way: the motion proposes one side, the panel votes.

### Closing a phase (the close task)

`result: HAPPY` → mark the phase's backlog ids done (` ✅ ORBIT2-NN`, plus ` (part deferred → ORBIT2-NN-FOLLOWUP)` where
it applies), run check/test (green), confirm only `orbit2/` changed, commit locally `orbit2: <phase title>`.
`result: BLOCKED` or still IN PROGRESS → halt the playbook with the reason in the file.

A reviewer is never told what to conclude, and never given the implementer's opinion of the work, only the brief.

## Running the playbooks

Run them on a **dedicated Maestro agent** for this repo (not the agent you chat with): a message to the agent running
an Auto Run interrupts the task in progress. Commits stay local; push when you are happy.

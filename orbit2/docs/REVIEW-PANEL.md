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

## The loop (run by the phase's review task)

1. Make sure the work is in place: `git status` shows the phase's changes, `npm run check` and `npm test` pass.
2. Write the **brief** once: the phase goal, the backlog ids it covers (copy their text from `docs/BACKLOG.md`), the
   list of changed files (`git diff --stat` + `git status --short`), how to open it (`orbit2/index.html`), and what
   "done" means for the phase. Every reviewer gets the same brief plus their persona, ports and these rules:
   *read-only (never edit repo files), verify claims by running things, answer with exactly this format:*

   ```
   VERDICT: HAPPY | NOT HAPPY
   MUST-FIX (blocks HAPPY): numbered, each with evidence (file:line, repro, measurement) and expected vs actual
   SHOULD (not blocking): numbered
   GOOD: up to 3 things to keep
   ```

3. Launch all reviewers of the phase **in parallel** (one message, several Agent calls).
4. Fix every MUST-FIX inside `orbit2/` (respecting the rules in `orbit2/README.md`), add or update tests, re-run
   check/test/smoke. SHOULD items: do the cheap ones, list the rest in `docs/BACKLOG.md` under "Later".
5. Re-run **only the reviewers who were NOT HAPPY**, using SendMessage to their agent id (so they keep context), with
   a short list of what changed. Repeat.
6. Stop when everyone is HAPPY. **Max 4 rounds.** If a reviewer is still NOT HAPPY after round 4, or two reviewers
   demand opposite things that cannot both be satisfied, write the conflict in the review file and halt the playbook
   with that reason so the conductor decides (this is a real blocker, not an ordinary failure).
7. Record everything in `orbit2/docs/reviews/<PHASE-ID>.md` (YAML front matter: type review, phase, date, rounds,
   result): per round, each reviewer's verdict and must-fix list, and what was changed in response. Keep it factual.

A reviewer is never told what to conclude, and never given the implementer's opinion of the work, only the brief.

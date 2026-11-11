# orbit2: Orbits lab

A full, self-contained copy of Orbits (`../poly.html` + `../src/poly/`) to try improvements without touching the
shipped Orbits. Open it at `orbit2/index.html` (locally `npm start` → http://localhost:5173/orbit2/index.html, live
https://auridevil.github.io/move-midi-warz/orbit2/index.html).

## Rules

- **Edit only inside `orbit2/`.** The main Orbits (`poly.html`, `src/poly/`, `src/*.js`, `styles.css`, `test/`) stays
  as it is. When an improvement is proven here, porting it back is a separate, explicit step.
- Same folder layout as the repo root, so imports are unchanged: `orbit2/src/poly/app.js` imports `../ui.js` →
  `orbit2/src/ui.js` (a copy). Shared, read-only assets come from the root: `../vendor/tone/Tone.js`,
  `../node_modules/movewire/`, `../favicon.svg`, `../icons/`, `../manifest.webmanifest`, `../src/analytics.js`,
  `../src/pwa.js`, `../src/dev-reload.js`.
- Saved data is separate: every localStorage key is `midi-warz.orbit2.*` (pattern, settings, slots, library, engine,
  tempo). Samples (IndexedDB `midi-warz-samples`) and Unassembler slices are shared on purpose.
- Tests: `orbit2/test/*.test.js` (run by `npm test` from the root). `npm run check` syntax-checks `orbit2/src/**`.
  `node tools/smoke.mjs` loads `orbit2/index.html` with the other pages.
- After editing `orbit2/src/poly/dsp-core.js`, regenerate the worklet: `node orbit2/tools/build-worklet.mjs`.
- Browsers are always muted: `orbit2/tools/cdp.mjs` or `tools/headless-chrome.sh <port>`, never Chrome by hand.
- Browser checks: `orbit2/tools/cdp.mjs` (headless Chrome helper: open, eval, click/tap/key, screenshot, capture
  downloads, `parseWav`, `unzipStored`).

## Docs

- `docs/BACKLOG.md`: every improvement from the producer + UX panel, with ids.
- `docs/REVIEW-PANEL.md`: the reviewers and the "everyone happy" validation loop each playbook phase runs.
- `docs/reviews/`: one file per phase with every round's verdicts.
- Playbooks (Maestro Auto Run): `.maestro/playbooks/2026-11-06-Orbit2-Lab/ORBIT2-*.md`.

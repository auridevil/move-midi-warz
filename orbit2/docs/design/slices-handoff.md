---
type: design
title: Unassembler → Orbits slice hand-off (ORBIT2-09, S2)
created: 2026-11-11
tags: [orbit2, samples, slices, unassembler, design]
related:
  - '[[BACKLOG]]'
  - '[[REVIEW-PANEL]]'
  - '[[ORBIT2-09]]'
---

# Unassembler → Orbits slice hand-off

Backlog S2: Unassembler sends 16 slices (not a hard-coded 8) and can send them all to ONE lane as a slice set.

## Transport (unchanged)

- Same origin, shared IndexedDB `midi-warz-samples`, object store `kv`, key **`unasm-slices`** (`SLICES_KEY`).
- After writing, the sender sets localStorage **`midi-warz.samples.slices`** (`SLICES_PING`) to `Date.now()`; every
  other Orbits tab gets a `storage` event and re-reads the key (`app.js renderSlices`).
- One hand-off at a time: a new one overwrites the last.

## Payloads

The reader is `orbit2/src/samples.js` **`readSlices(rec)`**. It accepts both payloads and returns one shape:
`{ name, sampleRate, slices: [[Float32Array per channel]…] (1–16), mode: 'tiles' | 'set' }`, or `null`.

### v1 (what `src/unasm/app.js` sends today)

```js
{ name: 'track.wav', sampleRate: 44100, slices: [ [L, R], [L, R], … ] }   // 8 equal slices, 1–2 Float32Array each
```

No version field. Read as is; any count from 1 to 16 is accepted (more are cut off), slices with an empty or
non-Float32Array channel are dropped. `mode` is always `'tiles'`.

### v2 (new, optional)

```js
{ v: 2, name: 'track.wav', sampleRate: 44100,
  channels: [L, R],            // the whole region (loop or bar) ONCE, 1–2 Float32Array of the same length
  cuts: [5512, 11025, …],      // sample offsets inside the region where a new slice starts (0 and the end are implied)
  mode: 'set' }                // optional: 'set' = meant for one lane as a slice set, 'tiles' (default) = loose slices
```

- `cuts.length + 1` slices, at most **16** (cuts past the 15th are ignored; the 16th slice ends at the 16th cut).
- Cuts are rounded, deduplicated, sorted, and those outside `(0, length)` are dropped, so equal slices, transient
  slices and uneven slices all fit the same format.
- The region is stored once instead of 16 copies, and the cut points survive (a later "re-slice" can use them).
- `mode: 'set'` only changes the hint in Orbits ("sent as one break"); the user still picks the lane, because the
  sender can't know which lane is selected in another tab.

## What Orbits does with it

- The sample row shows a tile per slice (waveform + number). Tap a tile = that slice on the selected lane (one sample,
  as before). **all to this lane** = every slice on the selected lane as a slice set (`Lane.loadBreak`): step N plays
  slice N (mod the set), a `slice` step lock picks another. The break is laid across the lane (`Lane.layBreak`: a step
  per slice, all on, from step 1, played straight, at the speed `breakSpeed` picks so the steps last the break at the
  current tempo: 16 slices of a bar as 16ths, 8 as 8ths, 16 of two bars as 8ths), unless the lane already plays a slice
  set with steps on: then its chops stay and only the audio changes.
- A slice played to its end hands over to the slice after it in the set, fading out over the first moment of it while
  the next step's slice fades in (`samples.js sampleWindow`), so slices played in order join without a hole.
- Each slice is stored under its own id (`orbits-<time>-<lane>-s<k>`), so the lane keeps playing after the next
  hand-off overwrites `unasm-slices`.

## Porting the sender later (one file: `src/unasm/app.js`)

In the `btn-to-orbits` handler, replace the 8-slice `putSample(SLICES_KEY, { name, sampleRate, slices })` with:

```js
const n = 16, len = Math.floor((r.end - r.start) * sr), w = Math.floor(len / n);
const channels = chans.map(d => d.slice(a, a + len)), cuts = Array.from({ length: n - 1 }, (_, k) => (k + 1) * w);
await putSample(SLICES_KEY, { v: 2, name: st.name || 'track', sampleRate: sr, channels, cuts, mode: 'set' });
```

Old Orbits builds (the shipped `src/poly/app.js`) only read v1: keep sending v1 until that reader is ported too, or
send v1 there and v2 to orbit2.

## Break from a file (inside orbit2)

`break file…` in the sample row loads a whole break (up to 16 s, no silence trim so the cuts follow the bar) and cuts
it into 8 or 16 equal slices (`samples.js chopEqual`), then puts them on the selected lane as a slice set, laid out as
above. A longer file says so (a toast): only its first 16 s are cut.

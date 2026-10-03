# Next — Orbits ideas not built yet

Two rounds of October 2026 shipped the whole first list: master clock, MIDI I/O (notes, clock out, clock in with
phase lock), pattern slots & chains, live record, step locks, evolve, trig conditions & ratchets, share link / WAV /
MIDI export, undo/redo, seeded dice, solo & choke groups, samples on lanes (file, mic, Unassembler slices),
symmetric humanize, headroom-based stress meters. What's left is smaller:

## Export
- WAV of a whole chain (today WAV renders the current pattern; MIDI already does chains). Needs the offline kit
  rebuilt per slot, since slots can use different voices.
- Stems: one WAV per lane.

## Samples
- Share links drop samples (they live in this browser's IndexedDB). An "export kit" zip (pattern + WAVs) would
  carry them.
- Sample start/end trim by hand, and a waveform in the lane drawer.

## Clock
- Phase lock trims the tempo by at most ±4 % and snaps beyond 3 ticks of drift; tune both on real gear (Live,
  a hardware drum machine) — never tested against a real clock source.

## Move
- Show slot / condition / seed on the Move's display (needs the display SysEx, not extracted yet).

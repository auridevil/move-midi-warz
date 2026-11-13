---
type: review
phase: ORBIT2-15
title: ORBIT2-15 sharing (I2–I5), review panel
date: 2026-11-13
round: 1
stalled: 0
result: IN PROGRESS
reviewers:
  verifier: NOT HAPPY
  architect: NOT HAPPY
  sound: NOT HAPPY
  rio: HAPPY
  dex: HAPPY
tags: [orbit2, review]
related:
  - '[[REVIEW-PANEL]]'
  - '[[BACKLOG]]'
  - '[[ORBIT2-14]]'
---

# ORBIT2-15 · Sharing: review panel

Reviewers: verifier (Vera), architect (Arjun), sound (Sofia), rio, dex. Process: [[REVIEW-PANEL]].

Phase start: `1682334` (ORBIT2-14 closed). Implementation commits: `ee5d46d` (I2 / I3 share flow and the gift card),
`800a119` (I4 library gallery, I5 Seed of the Day and the postcard), `a2a606b` (tests and browser check).

## For the brief: where the new things are

| item | model / logic | on screen / input |
| --- | --- | --- |
| I2 share up front | `export.js` `encodeShare(m, tempo, { title, from })` / `decodeShare` → `{ v: 1, tempo, m, title, from }` (optional strings, trimmed, ≤ 60 chars, null when absent or not a string; same `v: 1`). `app.js` `shareTitle` (the library setup on screen, else "an orbit"), `shareUrl()` → `{ code, title, url }`, `shareLink` | transport: `#btn-share` "share" = the link in one tap (touch with a share sheet: `navigator.share`; else the clipboard; clipboard blocked: the address bar; a toast each time) and `#btn-share-more` "…" opening `#share-menu` (link, 4 bars of audio, postcard (video)); Esc or a pointer down outside closes it. The export drawer's "link" button calls the same `shareLink` |
| I2 a link opens as a gift | `loadShared` (boot with `#p=`, or a `hashchange`): the pattern loads underneath first (one undo step; on a first visit the history starts there), then `showGift(o, first)` | `<dialog id="gift">`, modal, full screen: kicker, the rings drawn small (`share.js` `drawRings` on `#gift-rings`), title, "N bpm · N rings (· meter)", "from “…”" when the link has lineage, "▶ tap to hear this orbit" (starts play, then reads "■ stop" / "▶ play" and shows "remix"); "remix" keeps it (lineage = its title, or its `from` when untitled); "back to my beat" (not on a first visit) = undo; × and Esc keep the beat. While open, the page's keys are off |
| I3 one-tap audio | `renderPattern({ bars: 4 })` (4 bars whatever the export drawer's length; its loop setting, bit depth and rate) → `mixWav` → `shareFile(file, what)`: `navigator.canShare({ files })` → `navigator.share({ files, title, text: the remix link })`; no file sharing, or NotAllowed: a download plus the remix link to the clipboard; a toast either way | "…" → "4 bars of audio" (`shareAudio`) |
| I4 gallery | `share.js` `ringShapes(machine)` / `shapesOf(json)` (through `Machine.from`, as loading migrates), `drawRings(ctx, shapes, { cx, cy, r, hex })`, `thumbURL(json, hex, 96)` → PNG data URL; `library.js` `Library.setThumb(id, url)` (persisted; storage full: not kept, the save never pays for it); `save` drops an entry's `thumb` on a re-save | library rows (`#lib-list`): `img.lib-thumb` 48 px in the first column spanning the row's two lines, a click loads the setup; drawn the first time a row renders, then cached as `entry.thumb` |
| I5 Seed of the Day | `share.js` `utcDay(date)` (UTC 'YYYY-MM-DD'), `daySeed(day)` (1–9999 through `dice.js` `hash01`), `dayLabel(day)` ("13 Nov"), `seedOfDay(day)` → `{ day, seed, tempo 84–128, family, title: 'seed of the day · YYYY-MM-DD', m }` (a fresh `Machine(4)` rolled by `randomizeMusical` from `Dice.take(seed).stream(0)`, the tempo from stream 1) | chip `#seed-today` "today's seed · 13 Nov", first in the grooves row (`#grooves`): `loadDaySeed` locks the dice to the day's seed (repeat 1), loads the beat (one undo step), sets the lineage; a toast |
| I5 lineage | `lineage` in `app.js`: kept in the settings (`midi-warz.orbit2.settings.v1`, `from`) and in library entries (`from`); rides as `from` in links and in the audio / postcard share text; reset by init, a groove, randomize; set by remix / × / Esc on the card, the day's seed, loading a setup | the card's "from “…”" line |
| I5 postcard | `recordPostcard`: the canvas's `captureStream(30)` plus the master tapped after its limiter (`makeMaster` keeps it as `input.out` = `kit.master.out`) into a `MediaStreamAudioDestinationNode`, through `MediaRecorder` (vp9 / vp8 + opus WebM), 4 bars in real time (starts the beat if stopped), `window.__postcard` = the blob, then `shareFile` | "…" → "postcard (video)" (disabled while it records) |

Page handles: `__poly.shareLink`, `shareUrl()`, `shareAudio`, `recordPostcard`, `loadDaySeed`, `lineage`, `lib`,
`loadSetup`, `saveSetup`, `renderPattern`, `exportWav`, `undo`, `redo`, `hist`, `m`, `dice`, `applyTempo`, `wake`,
`initPattern`, `loadGroove`, `randomizeAll`. Tests: `orbit2/test/share.test.js` (5).

## Pre-checks

`npm run check` clean, `npm test` 215 + 9 green on `a2a606b` before the panel started.

## Round 1: 2 of 5 HAPPY

Fresh sub-agents in one message (verifier, architect, sound on the default model; rio, dex on sonnet), own ports
5401 / 5402 / 5403 / 5410 / 5406 (+ 940x; the phase start `git archive 1682334` on +100), the verifier also ran the
smoke on 9222. Brief: the phase goal, I2–I5 verbatim from [[BACKLOG]], the phase spec (the build tasks), the "where the
new things are" table above, `git diff --stat 1682334..a2a606b` (7 files, +323/−26), `git status --short` (only this
file), the must-fix rule with the later phases' ids (I6, I7, A) and the known Later items (links carry no samples), how
to drive `orbit2/index.html` with `orbit2/tools/cdp.mjs` (links, first vs returning visits, stubbing the share sheet and
the clipboard, decoding a WebM in the page), and how to run the phase start. `stalled: 0`: nothing was open before
round 1.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | NOT HAPPY | (1) NEW, I2: a link opened while the beat plays shows "▶ tap to hear this orbit" over a beat already heard, and the tap stops it. `showGift` always set that label, and the button called `togglePlay()` whatever the state. 1440 × 900, returning visit: a groove playing, then `location.hash = '#p=…'`: the card reads "▶ tap to hear", the transport "■ stop", the clock running (tick 3535 and on); one click: the transport "▶ play", the tick frozen at 5530, the button "▶ play". Stopped (a first visit, or a link pasted while stopped) it works. (2) NEW, I2 / I5: the share title stays on a library setup's name after the beat is replaced. `shareTitle` (`app.js:1146`) reads `libCurrent`, which only `loadShared` and `loadDaySeed` cleared, not init, a groove or randomize. `saveSetup('night bus')`, then a groove, randomize or init: `shareUrl().title` still "night bus" each time (lineage null); the friend's card names a trap groove "NIGHT BUS", and remix / × / Esc make it their lineage. Check clean, 215 + 9, smoke 10/10. |
| architect | NOT HAPPY | (1) NEW = verifier 2, with a fourth path: the dice drawer's "pattern from seed" (`app.js:1050`) keeps `libCurrent` and the lineage too. `saveSetup('night bus')` then `loadGroove(…)`: title "night bus", lineage null; after `randomizeAll()` the same. Expected "an orbit": the beat is no longer that setup. |
| sound | NOT HAPPY | (1) NEW, I5: the postcard records 4 bars' worth of time from the tap, not 4 bars of the beat. `app.js:1196` starts the beat (the transport at `+0.05` on top of Tone's 0.1 s look-ahead), `mr.start` at once, `mr.stop` on a `setTimeout`: nothing lines it up with a bar line. House at 120 bpm (bar 2.000 s), the WebM decoded and lined up against a worklet tap on `kit.master.out`: from stopped the file is 7.98 s, 0.158 s of silence before beat 1, and it stops 0.178 s before the end of bar 4, while the master still sounded (peak −21.9 dBFS, the last 16th); it ends on a hard cut mid-decay (last 5 ms peak 0.054): 3.91 bars and dead air; while playing it starts wherever the tap fell (beat 3.25) and ends 4 bars of time later. Expected: bar 1 beat 1 to the end of bar 4, the recorder started just before the next bar line on the audio clock, stopped 4 bars of audio time later with a few ms of fade. |
| rio | HAPPY | none (phone 390 × 844 with touch and desktop: share in the transport, "…" closes on Esc; a link opens the card, "▶ tap to hear" plays and turns to "■ stop", remix appears and keeps the beat with its lineage; "back to my beat" only on a returning visit; × and Esc keep the beat; 4 bars of audio with the remix link in the share text (stubbed); a ring thumbnail in the library; today's seed: lineage "seed of the day · 2026-11-13", dice locked at 9467, the same beat after undo and a re-tap, and the lineage on the card of a link made from it; a 670 KB postcard; no page errors) |
| dex | HAPPY | none (174 bpm: the 4-bar WAV is 243,310 frames at 44.1 kHz against 243,309.9 for 4 bars, ACID 16 beats at 174 bpm, smpl loop 0–243,309: it drops into Ableton as a warped loop; a 6-lane link opens as a full-screen card "100 bpm · 6 rings" with "back to my beat"; with the clipboard stubbed the audio download puts the remix link on it; no page errors on desktop and phone) |

SHOULD items recorded (never block): undo doesn't cover lineage or dice: a remix then undo keeps the link's name as your
lineage, today's seed then undo leaves the dice locked at 9467 / repeat 1 and the dice you had are gone (verifier,
architect); an unnamed link (every link from before the phase) kept with ×, Esc or remix made "an orbit" a lineage, so
the next card said `from “an orbit”` (verifier, architect); two calls at once could record two postcards (the
`postcarding` guard was set after `await wake()`; the menu closes on a click, so not from the UI) (verifier); two links
pasted while the card is open: "back to my beat" lands on the first link (verifier); on a phone held sideways (844 × 390)
the card's kicker sat at y −31 (off screen, out of scroll reach) and "back to my beat" needed a scroll (verifier);
thumbnails are 9.1–11.4 K characters each, about twice a setup's JSON, and the first render after the upgrade rewrote
the whole library once per row (60 setups: 60 writes, 136 ms), and nothing frees that room when a save finds storage full
(verifier, architect); Enter on a share-menu item left the focus on BODY (verifier); a cut or mangled link toasted "link:
Failed to fetch" (verifier); "16 bars to make it yours" (I5's backlog text) is neither in the phase spec nor built
(verifier, architect); a postcard started from stopped left the beat playing (verifier, architect) and
`window.__postcard` keeps the last blob for the session (architect); `loadShared` cleared `libCurrent` without
`renderLib`, so the old row stayed marked (architect); the postcard's file type was hard-coded `video/webm` whatever
`mr.mimeType` (architect); the share sheet comes after the tap's user activation has run out (the render, or 8 s of
postcard), so it falls back to a download, and where the clipboard needs a gesture the remix link is lost without a
word; one rule for the sheet (links on touch only, files wherever `canShare`) (architect, sound); ~110 lines of share
UI in `app.js` could be a module (architect); Seed of the Day's hat sits ~22 dB under the kick (the Common kit's raw
defaults), every day the same four voices, 7 of 14 days "tresillo over four", tempo apart from the family (sound); the
4-bar share follows the drawer's loop setting (on: the wrapped ring-out under the downbeat and a cut end; off: 11.6 s
"4bars+2tail-oneshot") where a share sheet wants a listening version (sound, dex); renders differ by a −8.8 dB residual
from the unseeded noise voices, −9.1 at the phase start (sound); "tap to hear" sounds 162 / 205 ms after the tap, as
Play (sound); an unnamed beat arrives as "an orbit"; the thumbnails are faint at 48 px on a phone; on a desktop the
library is a closed drawer and on a phone it sits far down, the seed chip needs a scroll, "…" reads cryptic; "back to my
beat" leaves the transport playing; a "make your own" line after a first-visit remix (rio); the 4-bar WAV "peaks at 1.0"
on the default pattern (not confirmed: sound measured −8.85 dBFS peak / −26.25 RMS at the defaults), a last-sample edge
fade, the card doesn't say a lane played a sample or that the beat has ghost notes, chance or 32 steps, the app showed for
a moment before the card on one load (dex).

GOOD: compatibility holds both ways: a phase-start link opens on HEAD ("an orbit · 97 bpm · 4 rings", the same hits), a
new link with title and from opens on the phase-start page, phase-start library and settings load (thumbnails drawn and
cached, lineage null); with storage full the thumbnails are simply not kept (verifier, architect); the 4 bars of audio
are exact and ignore the drawer's length (8.000 s at 120, 24.000 at 40, 4.000 at 240; 341,419 frames at 124 bpm, acid
16 beats, smpl 0–341,418, the seam step 0.004, no clipping, DC under −57 dBFS; `exportWav` unchanged since the phase
start), every share-sheet branch toasts right (verifier, sound, dex); the postcard's audio matches the live master
within 0.1 dB (correlation 0.996 through Opus), the tap leaves the live output bit-identical and the stress meter flat,
video and audio start within 35 ms with no drift; the cold "tap to hear" plays the full downbeat on the grid; Seed of the
Day is one beat everywhere on a UTC date (Kiritimati, Pago Pago, Los Angeles, Tokyo: seed 9467) and turns over at 00:00
UTC (sound, verifier); `share.js` is a clean model module reusing `Machine.from`, `Dice.take`, `randomizeMusical` and
`hash01`, `drawRings` serves the card and the gallery (architect); the card feels like a present (rio).

### Changes after round 1

- **The card's button follows the transport** (verifier 1): `giftPlay`, set while the card is open and called at the end
  of `togglePlay` (so the Move's play button and a MIDI start / stop too): "■ stop" while the beat plays, "▶ tap to hear
  this orbit" until it has played under the card, then "▶ play"; "remix" shows once it has played. A link opened while
  the beat plays (the pattern swaps under the running transport, as before) reads "■ stop" with remix from the start, and
  the first tap stops it. Page, the verifier's repro: the card reads "■ stop", remix and "back to my beat" shown; a tap
  stops the beat ("▶ play"), the next plays it again; stopped: "▶ tap to hear this orbit", no remix until the tap, then
  "■ stop" with the focus on remix.
- **A fresh start leaves the library setup** (verifier 2, architect 1): `freshBeat()` (lineage null + `leaveSetup()`:
  `libCurrent` null and the library re-rendered, so its row loses its mark) in init, a groove and `rollPattern` (so
  randomize, wild and the dice drawer's "pattern from seed" alike); `loadShared` and `loadDaySeed` call `leaveSetup()`
  (architect's SHOULD: the stale row mark). A beat with no setup shares with no title at all: `shareName()` is the setup's
  name or null, "an orbit" (`UNTITLED`) is only what the card shows, never written into a link; taking a link sets the
  lineage to its name, else the lineage it came with, else none (`share.js` `linkName`, `lineageOf`; the verifier's and
  architect's SHOULD: no more `from “an orbit”`). Page: after a saved "night bus", each of a groove, randomize, init and
  "pattern from seed": `shareUrl().title` "an orbit", no title in the link, no row marked, lineage null; today's seed:
  untitled, lineage "seed of the day · 2026-11-13".
- **The postcard is 4 bars of the beat** (sound 1): the scheduler hands over its next bar line (`barWait`, checked in
  `onTick` next to the jam's own bar-line start; Play's tick 0 when the postcard starts the beat); a gain gate between the
  master's limiter and the MediaStream destination opens at that bar line plus the master's look-ahead (`masterLatency`)
  and closes 4 bars later, with a 4 ms fade at each end (`share.js` `postcardWindow`, on the audio clock); the recorder
  starts 30 ms before the gate opens and stops 120 ms after it closes (MediaRecorder drops the last ~30 ms still on their
  way to it). A postcard that started the beat stops it again (the verifier's and architect's SHOULD). If the beat stops
  before a bar line comes, it says so. Page (120 bpm, one kick a bar): from stopped the 4 downbeats at 0.049 / 2.049 /
  4.049 / 6.049 s in the decoded WebM, the first as loud as the rest (0.266 vs 0.264–0.275), 8.16 s in all, the tail
  silent, the beat stopped after; started 2.9 s into play: downbeats at 0.042 / 2.042 / 4.042 / 6.042 s (on the bar
  line), the beat still playing after; house at 124 bpm (16th hats): sound from 0.046 s to 7.803 s (bar 4 ends at 7.788),
  faded to −70 dB, then 57 ms of silence.
- **Quick SHOULDs done:** the `postcarding` guard is set before the first `await` (verifier); the file type follows
  `mr.mimeType` (`.webm`, or `.mp4` where a browser records MP4) (architect); closing the share menu with the focus inside
  (Esc, Enter on an item) gives it back to "…" (verifier); a broken or cut link toasts "link: this link is broken or cut
  short" ("not an Orbits link" kept) (verifier); the card centres "safely" and scrolls, its rings follow the window's
  height (`34dvh`) and short windows get tighter gaps: at 844 × 390 the kicker is on screen (verifier); thumbnails drawn
  in one render are cached in one write (`Library.setThumbs`), and a save that finds storage full drops the cached
  thumbnails before it gives up (`dropThumbs`: they are drawn again) (architect, verifier).
- **Not changed** → [[BACKLOG]] Later: "Lineage and dice through undo", "Back to my beat after two links", "Sharing
  after a long wait", "Lighter thumbnails" (WebP measured: 7.0–7.6 K against 9.0–11.1 K, not worth a lossy image), "A
  share module", "16 bars to make it yours", "Seed of the Day sound", "A listening version of the 4 bars", "Faster tap to
  hear", "The gift and the gallery on a phone"; appended to "Slice sets in share links" (dex) and "Seeded noise in offline
  renders" (sound).
- Tests (218 + 9; `orbit2/test/share.test.js` 5 → 8): "I2 r1 a beat without a name stays unnamed" (`linkName`,
  `lineageOf`, an unnamed share writes no title), "I5 r1 the postcard is 4 whole bars on the audio clock"
  (`postcardWindow`: the bar line plus the look-ahead, exactly 4 bars, the recorder round the fades, 7/8), "I4 r1 drawn
  thumbnails are cached in one write; a full store drops them before it fails a save". `npm run check` clean, `npm test`
  218 + 9, `node tools/smoke.mjs http://localhost:5400` 10/10 (serve.py 5400 + headless Chrome 9222, both stopped). Page
  (5400/9400, silent, `/tmp/orbit2-impl/`, deleted): the checks above, 26 of 26, 0 page errors on desktop (1440 × 900)
  and phones (390 × 844, 844 × 390); screenshots looked at (the card playing, the card sideways, the library's four
  thumbnails). `app.js` 1966 → 1996 lines.

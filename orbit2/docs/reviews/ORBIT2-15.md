---
type: review
phase: ORBIT2-15
title: ORBIT2-15 sharing (I2–I5), review panel
date: 2026-11-13
round: 2
stalled: 0
result: HAPPY
reviewers:
  verifier: HAPPY
  architect: HAPPY
  sound: HAPPY
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

## Round 2 (re-check): verifier, architect and sound HAPPY, the whole panel HAPPY

Only the reviewers NOT HAPPY after round 1 (verifier, architect, sound, all on the default model), fresh sub-agents in
one message, own ports 5401 / 5402 / 5403 (+ 940x; the phase start `1682334` on +100, the code before the round-1 fixes
`a2a606b` on +200), the verifier also ran the smoke on 9222. Brief as in round 1 (goal, I2–I5, the spec, where things
are, the must-fix rule with the later ids and the Later items, the page), `git diff a2a606b..d81cd67` (the round-1 fixes
alone: app.js, library.js, share.js, styles.css, share.test.js, +145/−52) and the whole phase (`1682334..d81cd67`, 9
files, +621/−35 with the docs), each one's own round-1 MUST-FIX and "Changes after round 1", with the instruction to
confirm their items first with the same repro, then check nearby, anything new only in scope and marked NEW.
`stalled: 0`: every round-1 MUST-FIX is closed and everyone is HAPPY.

| reviewer | verdict | MUST-FIX |
|---|---|---|
| verifier | HAPPY | (1) FIXED: 1440 × 900, returning visit, boom bap playing, then `location.hash = '#p=…'`: the card reads "■ stop" with remix and "back to my beat", the clock running (tick 4655 → 5600 in 0.5 s); tap 1: "▶ play", the transport stopped (tick held at 5670); tap 2: "■ stop", the clock running; remix closes the card with the beat playing. At `a2a606b` the same repro still fails ("▶ tap to hear this orbit" over a running clock, the tap stops it). Stopped, a link pasted: "▶ tap to hear this orbit", no remix, focus on it; Enter: "■ stop", focus on remix; first visit: no "back to my beat", tap / tap / remix as expected. (2) FIXED: a saved "night bus" reloaded before each step; after a groove, randomize, wild, init and "pattern from seed" (`#dice-make`): `shareUrl().title` "an orbit", the decoded link with no title and no from, no row marked, lineage null, every time; today's seed: untitled, from and lineage "seed of the day · 2026-11-13"; at `a2a606b` all five still share as "night bus" with the row marked. Nearby: × and Esc keep the beat (lineage "night bus"), "back to my beat" restores the previous beat (undo / redo flip between the two; opened while playing it keeps playing), a re-share after a remix has no title and from "night bus"; a `1682334` link opens as "an orbit · 124 bpm · 4 rings", Esc leaves the lineage null; an `a2a606b` link carrying the placeholder takes its from, never "an orbit"; `#p=abc` and a half-length code: "link: this link is broken or cut short", no card; Esc and Enter on a menu item give the focus back to "…"; postcard at 120 bpm from stopped 8.16 s, first sound at 49 ms, the beat stopped after, a second call while recording returns at once (one file); from playing 8.10 s, first sound at 43 ms; the beat stopped during the wait: "the beat stopped before a bar line", the menu item enabled again; 4 bars of audio 8.000 s; 844 × 390: the kicker at 33–51 px, all within 390 px. Check clean, 218 + 9, smoke 10/10, no page errors. |
| architect | HAPPY | (1) FIXED: a link taken with Esc ("friend beat" as lineage), `saveSetup('night bus')` (its `from` "friend beat"), then for each of a groove, randomize, wild, init and `#dice-make` after `loadSetup(night bus)`: before, title "night bus", lineage "friend beat", the row marked; after every one, title "an orbit", the link with title and from null, lineage null (the getter and the saved settings), no row marked. At `a2a606b`: "night bus" and the mark after all five, and "pattern from seed" kept the lineage (the link said from "friend beat"). Nearby: the day's seed over a setup is untitled with its own lineage; a link over a setup unmarks the row as the card opens; an untitled link with a from gives that from as lineage, without one none (`a2a606b`: "an orbit"); the phase-start library and settings carried over: one write at boot caches both thumbnails, lineage null; `barWait` at 240 bpm from stopped (4.28 s, stopped after), while playing (keeps playing), 40 bpm stopped 0.6 s in ("the beat stopped before a bar line", the next postcard works); the card's button with a link opened while playing; `leaveSetup`'s re-render with 42 setups: a groove after a setup 9.0–13.9 ms against 9.9–11.6 after a groove; storage filled to under 2 K free with 42 setups and thumbnails: a 43rd save is stored (the thumbnails dropped), load, randomize and a groove after it raise nothing and lose nothing. 218 + 9, check clean, no page errors on the three trees. |
| sound | HAPPY | (1) FIXED: house at 120 bpm, an AudioWorklet tap on `kit.master.out`, the WebM decoded at 48 kHz and lined up by cross-correlation (r 0.984–0.997, −0.1 dB): from stopped, bar 1 beat 1 at 48.6 ms in the file, the sound ends 0.4 ms before the end of bar 4 on a 4 ms linear fade (file / master 0.95, 0.86, 0.61, 0.35, 0.16, 0), then −62.9 dBFS, 8.16 s in all; the four downbeats −10.7 / −10.7 / −11.3 / −10.6 dB against −10.6 / −10.7 / −10.7 / −10.3 on the master; the gate's look-ahead 12.0 ms (measured 12.1), the recorder 34 ms before the gate and 120.7 ms after; the beat stopped after. Tapped at bar 2 beat 2.88 while playing: it starts on bar 3 (1.046 s later), bar 1 beat 1 at 44.6 ms, ends at the end of bar 4 with the fade, the beat keeps playing. The same script on `a2a606b`: 7.98 s, 168.6 ms of silence before beat 1, ending 188.6 ms early on a hard cut (−28 dBFS) while the master still sounded; while playing from bar 2 beat 2.88 to bar 6 beat 2.83. Nearby: the master's level per bar the same inside and outside a postcard (−26.2…−26.6 dB), stress headroom 74.3 / 74.1 ms mean, 69.8 / 70.9 min, level 0, also at 40 and 240 bpm; 7/8 at 240 bpm from stopped (4 bars of 875 ms, a 3.66 s file, r 0.994), 4/4 at 240 while playing, poly345 at 40 bpm while playing (the next bar line 4.45 s after the tap, a 24.12 s file, r 0.997), all ending at the end of bar 4 with the fade; the beat stopped mid-way: no error, the file follows the master to the stop; stopped before the line: the message after 4.0 s, the next postcard works; `exportWav` (HEAD, `a2a606b`, `1682334`) and the 4-bar share (HEAD, `a2a606b`) unchanged (352,800 frames, fmt / acid / smpl / data, acid 16 beats, the loop 0–352,799, RMS within 0.04 dB; sample differences at the level of two renders of one build: the parked unseeded noise); the card's button follows a stop or start from outside it. No page errors. |

SHOULD items recorded (never block): NEW, the share title still follows the setup on screen when a slot recall or an
undo replaces the beat (`recallSlot(1)` after loading "night bus": the house beat shares as "night bus", its row
marked; a setup's name does not come back with an undo either, failing safe as unnamed; the row mark behaved so before
the phase) (verifier, architect); a failed postcard ("the beat stopped before a bar line", or a recorder that can't be
made) left the canvas capture running, one more live track each time (architect); with storage nearly full,
`setThumbs`' one write is all or nothing, so after a save that needed `dropThumbs` none are cached again and every render
fails a write of the whole library (43 setups: 7 failed writes; randomize after a setup 28 ms) (architect); "what this
beat is" is decided in 7 places, pinned by no unit test (architect); `loadShared` told its own errors apart by matching
`export.js`'s wording (architect); NEW, a postcard that started the beat stops it ~0.25 s after bar 4 ends, so bar 5's
downbeat is heard live (−11.2 dBFS within 50 ms; the file is right) (sound); NEW, nothing said the postcard was waiting
for its bar line (up to a bar: 4.45 s at 40 bpm), and a beat stopped before it was reported only after a bar + 2 s
(sound); NEW, a beat stopped mid-postcard still gives a 4-bar-long file (music to 4.1 s, then silence) (sound).

GOOD: the card's button follows the transport through the one place `playing` changes (`togglePlay`), right playing and
stopped, and for the Move's and MIDI's start / stop too (verifier); `freshBeat` / `leaveSetup` plus `linkName` /
`lineageOf` keep "an orbit" out of every link and lineage, and placeholder links from before still open right
(verifier, architect); the postcard is exactly 4 bars from the beat's own bar line at every tempo and meter tried, the
look-ahead measured, not guessed, the 4 ms fades leave no cut and no click, the first downbeat as loud as the rest, and
it costs the live sound nothing (sound); `barWait` is one null check per tick, and every postcard path leaves the
transport as it found it (architect).

### Changes after round 2

- **Quick SHOULDs done** (nothing a reviewer confirmed changes):
  - a postcard that fails or stops early leaves nothing running: the recorder, the stream's tracks (the canvas capture
    and the destination's audio) and the master's tap all end in `finally` (architect). Page: a postcard whose beat is
    stopped while it waits: 0 live capture tracks after it, the menu item enabled.
  - the postcard says when it waits: "postcard: it starts on the next bar line…" while the beat plays, and a beat
    stopped meanwhile is noticed within 100 ms (checked every 100 ms beside the bar-line hand-over), not after a bar + 2 s
    (sound). Page: 40 bpm, a postcard started 0.4 s after Play, the beat stopped 300 ms later: "the beat stopped before
    a bar line" at once.
  - `decodeShare` says what went wrong in words for people ("this link is broken or cut short" when base64, inflate or
    JSON fail; "not an Orbits link" for a whole link of something else), so `loadShared` shows its message as it is,
    matching no text (architect).
  - the `libCurrent` comment says what it now is: the setup on screen (architect).
- **Not changed** → [[BACKLOG]] Later: the setup's name through slot recalls and undo, appended to "Lineage and dice
  through undo" (verifier, architect); thumbnails all or nothing on a full store, appended to "Lighter thumbnails"
  (architect); "what this beat is" in one place, appended to "A share module" (architect); "The postcard's edges" (the
  live stop ~0.25 s after bar 4, a file 4 bars long after a stop mid-way) (sound).
- Tests (219 + 9; `orbit2/test/share.test.js` 8 → 9): "I2 r2 a broken or cut link says so in plain words; a link of
  something else says that" ('AAAA', a stray character, a link cut to 40 characters and one missing its last 5, a whole
  payload without a pattern). `npm run check` clean, `npm test` 219 + 9, `node tools/smoke.mjs http://localhost:5400`
  10/10 (serve.py 5400 + headless Chrome 9222, both stopped). Page (5400/9400, silent, `/tmp/orbit2-impl/`, deleted):
  the checks above plus a postcard from stopped at 120 bpm (downbeats at 0.049 / 2.057 / 4.057 / 6.057 s, the capture
  ended, the beat stopped; the first bar 8 ms long because the script had just gone from 40 to 120 bpm and the
  transport's tempo glides over 0.1 s, so bar 4 ended 8 ms after the gate closed: the end is reckoned at the start's
  tempo, see "The postcard's edges" in Later) and the broken-link toast, 7 of 7, no page errors. `app.js` 1996 → 1999 lines. **Phase 15
  review: `result: HAPPY`.**

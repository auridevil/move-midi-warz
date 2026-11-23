import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex } from 'movewire';
import { Machine, RATIOS, RATIO_LABEL, ratioIndexOf, MAX_STEPS, MAX_LANES, LANE_COUNTS, SOUND_KEYS, DEFAULT_SOUND, PPQ, MIDI_DIV, BAR_TICKS, METERS, meterParts, LOCK_KEYS, CONDS, MAX_RATCHET, SWING_TEMPLATES, SWING_KEYS, OFFSET_MS, MAX_SLICES, EVOLVE_KINDS, EVOLVE_WEIGHTS, MAX_WEIGHT, weightsFrom, ratchetTimes, ratchetGains, EUCLID_MODES, MOD_TARGETS, TIMBRE_KEYS, SCALE_KEYS, LOCK_RANGE, GHOST_VEL, AUTO_KEYS, AUTO_RES, AUTO_MAX, AUTO_LOOPS_MAX, laneCountOf } from './lanes.js';
import { Dice } from './dice.js';
import { History } from './history.js';
import { MovePages, PAD_COLS, PAD_ROWS, STEP_BTNS, LOOK_MS, padPages, trackLane, resolvePage, PAGES, TOUCH_HOLD_MS, stepLoops, cellAction, planetAction } from './pages.js';
import { hitVel, tuneLock, liveTick, liveQuiet, earlyStep, collectHits, chainSixteenths, chainMeters, hitsToMidi, encodeShareFit, decodeShare, autoRamps, autoCCs, collectChainAuto, LINK_MAX } from './export.js';
import { putSample, getSample, fromAudioBuffer, toAudioBuffer, trimRecord, sampleWindow, padChannels, SLICES_KEY, SLICES_PING, readSlices, chopEqual } from '../samples.js';
import { encodeWav, WAV_BITS } from '../unasm/wav.js';
import { JAM_BEATS, stemsZip, stemFiles, foldLoop, oneShot, renderLead, wholeBarCycle, trimChunks, tagWav, trimOneShot, safeName, headroomGain, logHit, pendingSteps, ringPlan, ringOut, joinRing } from './jam.js';
import { zipStored } from '../punch/ablbundle.js';
import { Library } from './library.js';
import { phaseCorrection } from './midiio.js';
import { onBar, trackBars, blockTick, SlotBank, SLOT_COUNT, SWITCH_MODES } from './slots.js';
import { PolyMidi, FOLLOW_MODES, strokeNotes, LATENCY_MAX, autoLatencyMs, AUTO_CC_KEYS } from './midiio.js';
import { VOICES, VOICE_KEYS, velShape, ARTICS, articAt, TUNE_SEMIS } from './voices.js';
import { HOLD_MS, MuteQueue, MuteBounce, FillLatch, Guard, fxFreqs, stepFilter } from './perform.js';
import { DSP_VOICES } from './dsp-voices.js';
import { KITS, KIT_KEYS } from './kits.js';
import { getTempo, setTempo, onTempo, makeTapTempo } from '../tempo.js';
import { makeGauge, bindRow } from '../gauge.js';
import { segmented, toggleChip, mount, longPress, LONG_MS, LONG_SLOP } from '../ui.js';
import { createScene, ringBox, ringAngle, angleDelta, turnRotation, outward, pullLength, pinchLength, dragKind, genClock } from './scene.js';
import { SHEET_KEY, SHEET_TABS, sheetFrom, tabMove } from './sheet.js';
import { drawMoveHelp } from './moveface.js';
import { FIND_KEY, ACTIONS, entry, search, recentsFrom, pushRecent, opensFind, escStep } from './find.js';
import { GROOVES, DEMO_GROOVE, grooveByKey, bootMode } from './grooves.js';
import { utcDay, dayLabel, seedOfDay, shapesOf, drawRings, thumbURL, UNTITLED, linkName, lineageOf, postcardWindow } from './share.js';
import { QUESTS, QUESTS_KEY, questsFrom, currentQuest, startView, hintDrawer, paramLabel } from './quests.js';
import { attachSetlog, patternWords } from './setlog.js';
import { PILL_ORDER, pillsOn, pillLayout, pillOff, focusAfter } from './pills.js';

const $ = (id) => document.getElementById(id);
const T = window.Tone;
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));
const SAVE = 'midi-warz.orbit2.v2'; // v2: step = quarter note at ratio 1
const LANE_HEX = ['#f0abfc', '#67e8f9', '#fde047', '#a78bfa', '#86efac', '#fdba74'];   // L2: lanes 5–6 green, orange
// first ever visit = nothing saved yet (read before the first sync() writes it): it gets the demo groove, not init
let firstVisit = true; try { firstVisit = localStorage.getItem(SAVE) == null; } catch {}
let neverPlayed = false;   // RD-8: a first visit that has not played yet: the sun reads "press play", the play ring pulses
let m; try { m = Machine.from(JSON.parse(localStorage.getItem(SAVE) || 'null')); } catch { m = new Machine(); }
// RD-1 setlog (?setlog only): the action log for the accident budget (setlog.js). Off, slog is null and every hook is
// `slog?.…`: no listeners, no work, the arguments never evaluated. The Move's bytes mark their source on the way in.
const slog = new URLSearchParams(location.search).has('setlog') ? attachSetlog({ win: window, model: () => m.toJSON(), now: () => performance.now(), defer: (f) => setTimeout(f, 0) }) : null;
if (slog) { const recv = move.receive.bind(move); move.receive = (b, t) => { slog.from('move'); return recv(b, t); }; }
const slogWords = () => patternWords(m.toJSON());
const slogBefore = () => { slog.begin(); return slogWords(); };   // an action that replaces the pattern: hand edits first
if (!m.lanes.some(l => l.hits.some(Boolean))) { m.lanes[0].setEuclid(2); m.lanes[1].setEuclid(2); m.lanes[1].rotation = 1; m.lanes[2].setEuclid(8); m.lanes[3].setEuclid(2); } // kick 1·3, snare 2·4, hats in 8ths, perc 5 over 8ths
let tempo = getTempo(112), awake = false, playing = false, shift = false, vol = 0.8;
const barBeat = $('barbeat');   // RD-5: the console's bar·beat counter ("03.2"), beside play
let statusLine = '';            // RD-5: the old readout's status line (readout()), off the face: the console log shows it
// every edit lands in save(): that's where undo history is recorded (knob turns within 0.7 s fold into one step).
// Mute, solo and the selected lane are performance moves, not edits: they are left out of the step key (perfKey), so
// they never make an undo step and Undo keeps them as they are; undoing a load (setup, slot, link, init, groove, a
// randomize roll: loadNext) brings back the pattern you had exactly, its own mutes included, and the tempo you had
// when the load set one (loadNext = { tempo, was }).
// A canvas gesture (I1: a tap, a turn, a pull) is one undo step of its own (ownNext), never folded into a knob turn.
const hist = new History(); let restoring = false, loadNext = false, ownNext = false;
let spoken = null, announceTimer = 0, hush = false;   // screen-reader announcements (announceChanges, next to readout)
const perfKey = () => JSON.stringify(m, (k, v) => (k === 'muted' || k === 'solo' || k === 'selected' ? undefined : v));
// A3: a gesture that records is one undo step: nothing is committed while it writes (its end saves, with ownNext)
const save = () => { if (knobGest?.rec && !restoring) { knobGest.dirty = true; return; } const full = JSON.stringify(m); if (restoring) hist.refresh(full); else hist.commit(full, { key: perfKey(), load: !!loadNext, own: ownNext, ...(loadNext?.tempo != null ? loadNext : {}) }); loadNext = false; ownNext = false; try { localStorage.setItem(SAVE, full); } catch {} slog?.dirty(hush); };   // hush: the clock changed it (evolve, a slot, a waiting mute)
const dice = new Dice(); let fill = false, fillHold = false;   // fill = held (Layout, the fill button, key 0) or latched for a bar (P3)
const latch = new FillLatch(), muteQ = new MuteQueue(), muteBounce = new MuteBounce();   // P3 fill for the next bar; P2 mutes waiting for the next bar line; RD-9 a mute press that bounces
const lib = new Library(localStorage); let libCurrent = null;   // named setups; id of the one on screen (loaded or saved, until a fresh start or a link: leaveSetup)
// page settings (not part of a pattern): live record, evolve, MIDI I/O
const SETTINGS = 'midi-warz.orbit2.settings.v1';
const rec = { armed: false, accentVel: 100, pitchPads: false, quant: 'nearest', knobs: 'off' };   // knobs (A3): record knob moves, off / touch / latch
/** A3 (automation, below): knobGest = the hand on a knob now { li, lane, k, kind ('curve' | 'step'), src ('snd' | 'lane'
 *  | 'lock'), knob (a Move encoder), touch, v (lock units), rec, wrote, latched, … }; handNow = liveTick's hand (per
 *  lane { key: value }); stripKey = the automation strip's parameter { k, kind }. */
let knobGest = null, handNow = null, stripKey = null;
// home: return to the snapshot after N mutations (0 = never). V1: weights per kind (lanes.js EVOLVE_WEIGHTS), gravity %
// (pull back toward home instead of the hard reset), maxBars = the longest cycle a move may make (0 = no limit)
const evo = { on: false, every: 4, amount: 40, scope: 'hits', home: 0, gravity: 0, maxBars: 32, weights: { ...EVOLVE_WEIGHTS } };
let evoSnap = null, evoCount = 0;   // evoSnap: evolve's home, always m.snapshot() (a copy: gravity pulls toward it)
const bank = new SlotBank(localStorage);
const pmidi = new PolyMidi({ getAccess: () => midi.access, isMovePort: (p) => move.inControl && /move/i.test(p.name) });
// E1–E3, E6 export format: bit depth (16 / 24 / 32 float), sample rate of offline renders, jam ring-out files, dry
// stems + delay return, MIDI as one Drum-Rack track. Older settings have none of it: the defaults are the old formats
// (16-bit, 44.1 kHz, wet stems, a track per lane); 16-bit stems now share one gain with their raw mix (stemFiles).
// printFx (P6): the mix WAV goes through the performance filter as it is set (off: exports ignore performance FX)
const exp = { bits: 16, rate: 44100, ring: false, dry: false, midiOne: false, printFx: false };
// P1 / P2 live performance: live = the Move's pads play instead of writing steps, Capture / Delete need Shift or a hold
// (on by default: it only changes what the Move does); muteBar = mutes wait for the next bar line while playing
const perf = { live: true, muteBar: false };
// I5 lineage: what the beat on screen was remixed from (a shared link's title, the day's seed), carried into the links
// and postcards you share, so a remix of a remix still says where it came from. A fresh start (init, groove, roll) drops it.
let lineage = null;
let closeShareMenu = () => {};   // RD-4: set where the share menu is built (the Esc order reaches it)
// I2: the open shared-beat card's ▶ button, kept in step with the transport whoever starts or stops it (togglePlay)
let giftPlay = null;
// I5: the postcard waits here for the clock's next bar line (onTick hands over its audio time)
let barWait = null;
// I6 / I7: quest progress + the view (simple / everything), one key of their own. A first visit starts simple; a page
// that already has a beat saved starts with everything (nothing it had disappears). questLog: what you did since the
// current quest came up (quests.js events), in memory only
const quests = (() => { try { return questsFrom(JSON.parse(localStorage.getItem(QUESTS_KEY) || 'null')); } catch { return questsFrom(null); } })();
quests.view = startView(quests.view, firstVisit);
let questLog = [], questTimer = 0, cheerTimer = 0;
let welcomeOn = false;   // F3 welcome back: a returning visit's pill, until the beat plays, loads or it is dismissed (RD-7)
const face = { log: false, night: false };   // RD-5: the console-log overlay (` or Sheet → setup); RD-9: night. Both off by default, remembered
const readExp = (o) => { if (!o) return; if (WAV_BITS.includes(o.bits)) exp.bits = o.bits; if (o.rate === 44100 || o.rate === 48000) exp.rate = o.rate; for (const k of ['ring', 'dry', 'midiOne', 'printFx']) if (typeof o[k] === 'boolean') exp[k] = o[k]; };
try { const o = JSON.parse(localStorage.getItem(SETTINGS) || 'null'); if (o) { Object.assign(rec, o.rec, { armed: false }); if (!['off', 'touch', 'latch'].includes(rec.knobs)) rec.knobs = 'off'; Object.assign(evo, o.evo, { on: false }); evo.weights = weightsFrom(evo.weights); evo.gravity = Math.max(0, Math.min(100, +evo.gravity || 0)); evo.maxBars = Math.max(0, Math.min(64, Math.round(+evo.maxBars) || 0)); if (o.perf) { if (typeof o.perf.live === 'boolean') perf.live = o.perf.live; if (typeof o.perf.muteBar === 'boolean') perf.muteBar = o.perf.muteBar; } pmidi.fromJSON(o.midi); dice.fromJSON(o.dice); readExp(o.exp); if (typeof o.from === 'string') lineage = o.from; if (typeof o.face?.log === 'boolean') face.log = o.face.log; if (typeof o.face?.night === 'boolean') face.night = o.face.night; } } catch {}
const saveSettings = () => { try { localStorage.setItem(SETTINGS, JSON.stringify({ rec, evo, midi: pmidi, dice, exp, perf, from: lineage, face })); } catch {} };
const setLineage = (from) => { lineage = from || null; saveSettings(); };

// ---- sounds ----
let kit = null, loop = null;
// every lane owns a chain: voice → choke → drive → tone filter → pan → level ┐
//                                                          └→ send → its own delay ┴→ lane bus → master
// One delay per lane (instead of a shared one) sounds the same — a delay is linear — but keeps each lane's echoes on
// its own bus, so stems and jam recordings carry them. raw = no master compressor/limiter (stems for a DAW).
/** The master glue: compressor → limiter → out. Both look ahead, so the chain delays everything (masterLatency).
 *  fx (P6 performance FX, the live kit; an export only with "print FX"): the filter before the compressor (low-pass →
 *  high-pass, both open at the centre), and the delay throw: a send from the master input into its own dotted-eighth
 *  delay that feeds the filter, so its echoes follow the knob too. The input node carries them as `.fx`. fx.sr: the rate
 *  the filter is heard at (a print at another export rate keeps the cutoffs heard live); fx.throw: a throw held while the
 *  kit is built (the first press on a cold page wakes it) starts thrown. */
const FX_Q = 0.9, THROW = { send: 0.7, fb: 0.55, rest: 0.3 };   // P6: resonance (a touch over flat, so a sweep is heard); the throw's send and feedback held / at rest
function makeMaster(gain, fx = null) {
  const limiter = new T.Limiter(-2).toDestination(); const comp = new T.Compressor({ threshold: -18, ratio: 3 }).connect(limiter), input = new T.Gain(gain);
  input.out = limiter;   // the master's last node: the postcard (I5) taps the mix here
  if (!fx) return input.connect(comp);
  const raw = T.getContext().rawContext, f = fxFreqs(fx.filter, fx.sr || raw.sampleRate), lp = raw.createBiquadFilter(), hp = raw.createBiquadFilter();
  lp.type = 'lowpass'; hp.type = 'highpass'; lp.Q.value = hp.Q.value = FX_Q; lp.frequency.value = Math.min(f.lp, raw.sampleRate / 2); hp.frequency.value = f.hp;
  T.connect(input, lp); lp.connect(hp); T.connect(hp, comp);
  const delay = new T.FeedbackDelay({ delayTime: 60 / tempo * 0.75, maxDelay: 2, feedback: fx.throw ? THROW.fb : THROW.rest, wet: 1 }), send = new T.Gain(fx.throw ? THROW.send : 0).connect(delay); T.connect(delay, lp); input.connect(send);
  input.fx = { lp, hp, delay, send }; return input;
}
/** One more lane chain on kit k (L2: a kit grows when the pattern goes to 6 lanes; it never shrinks, a spare chain is
 *  silent). The live kit's new bus also feeds the jam recorder. */
function addChain(k) {
  const bus = new T.Gain(1).connect(k.master);
  const delay = new T.FeedbackDelay({ delayTime: 60 / tempo * 0.75, maxDelay: 2, feedback: 0.3, wet: 1 }).connect(bus);   // dotted eighth
  const level = new T.Gain(0.8).connect(bus); const send = new T.Gain(0.15).connect(delay); const pan = new T.Panner(0); pan.connect(level); pan.connect(send);
  const tone = new T.Filter({ type: 'lowpass', frequency: 8000, Q: 0.7 }).connect(pan); const drive = new T.Distortion({ distortion: 0, wet: 0 }).connect(tone);
  const choke = new T.Gain(1).connect(drive);   // another lane's hit can cut this one off (choke groups)
  k.chains.push({ v: null, voice: null, choke, drive, tone, pan, level, send, delay, bus });
  if (k === kit && jam.node) bus.connect(jam.node, 0, k.chains.length - 1);
}
/** A kit plays the pattern's lanes, or its own `lanes` (a jam take's ring-out plays the lanes the take ended with). */
const lanesOf = (k) => k?.lanes || m.lanes;
function makeKit({ raw = false, lanes = null, fx = null } = {}) {
  const master = raw ? new T.Gain(1).toDestination() : makeMaster(vol, fx);
  const kit = { master, chains: [], tc: T.getContext(), lanes }; rebuildVoices(kit); return kit;
}
/** (Re)build a lane's voice nodes from the library, disposing the previous ones. */
function buildVoice(li, k = kit) {
  if (!k) return; while (k.chains.length <= li) addChain(k); const lane = lanesOf(k)[li], c = k.chains[li];
  const key = lane.voice === 'sample' && lane.sample ? 'sample' : VOICES[lane.voice] ? lane.voice : 'kick';
  if (key === 'sample') ensureSample(lane);   // also on a chain that already plays a sample: a recalled slot, an undo or a setup can bring a set this page never loaded
  const eng = engine === 'dsp' && key !== 'sample' && DSP_VOICES[key] && dspReady(k.tc) ? 'dsp' : 'synth';
  if (c.voice === key && c.engine === eng && c.v) return;
  if (c.v) for (const n of Object.values(c.v)) { try { n.dispose(); } catch {} }
  if (eng === 'dsp') {   // one worklet node per lane, made once and kept: it is silent between hits
    if (!c.dsp) { c.dsp = k.tc.createAudioWorkletNode('orbits-dsp', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }); T.connect(c.dsp, c.choke); }
    c.v = {};
  } else c.v = key === 'sample' ? {} : VOICES[key].make(T, c.choke);   // samples make their nodes per hit
  c.voice = key; c.engine = eng;
  // the dsp engine is wanted but its module is not in this context yet: load it, then move every lane over
  if (engine === 'dsp' && eng === 'synth' && key !== 'sample' && !dspReady(k.tc)) ensureDsp(k.tc).then(() => { lanesOf(k).forEach((_, i) => buildVoice(i, k)); }).catch(() => {});
}
// ---- engines: 'synth' = the Tone.js voices in voices.js, 'dsp' = the AudioWorklet drum models in dsp-voices.js ----
const ENGINE_KEY = 'midi-warz.orbit2.engine';
let engine = localStorage.getItem(ENGINE_KEY) === 'dsp' ? 'dsp' : 'synth';
// Tone's addAudioWorkletModule remembers only the first module per context, so the dsp voices and the jam recorder
// would lock each other out: load through the context's own audioWorklet (Tone's wrapper, which its nodes accept).
const addWorklet = (tc, path) => tc.rawContext.audioWorklet.addModule(new URL(path, import.meta.url).href);
const dspCtx = new WeakSet(), dspLoading = new WeakMap();   // per Tone context (offline renders have their own)
const dspReady = (tc) => dspCtx.has(tc);
let pingId = 0;
const dspFlush = (k) => Promise.all(k.chains.map(c => c.dsp && new Promise((res) => { const id = ++pingId; const on = (e) => { if (e.data?.pong === id) { c.dsp.port.removeEventListener('message', on); res(); } }; c.dsp.port.addEventListener('message', on); c.dsp.port.start(); c.dsp.port.postMessage({ ping: id }); })));
function ensureDsp(tc = T.getContext()) {
  if (dspCtx.has(tc)) return Promise.resolve();
  if (!dspLoading.has(tc)) dspLoading.set(tc, addWorklet(tc, './dsp-worklet.js').then(() => { dspCtx.add(tc); }));
  return dspLoading.get(tc);
}
function setEngine(e) {
  engine = e === 'dsp' ? 'dsp' : 'synth'; try { localStorage.setItem(ENGINE_KEY, engine); } catch {}
  ui.engine?.set(engine);
  const swap = () => { if (!kit) return; m.lanes.forEach((_, i) => buildVoice(i)); if (awake && !playing) hitSound(m.lane, T.now(), false); };
  if (engine === 'dsp' && kit && !dspReady(kit.tc)) ensureDsp(kit.tc).then(swap).catch((err) => { $('engine-note').textContent = `dsp engine unavailable: ${err.message}`; }); else swap();
  $('engine-note').textContent = engine === 'dsp' ? 'dsp: purpose-built drum models in an AudioWorklet — exponential pitch sweeps, soft-clipped bodies, 808-style metal hats, real clap bursts. Same knobs.' : 'synth: the original Tone.js voices.';
  sync();
}
function buildEngineUI() {
  ui.engine = mount('engine-select', segmented({ options: [['synth', 'synth', 'the original Tone.js voices'], ['dsp', 'dsp', 'purpose-built drum DSP (AudioWorklet)']], value: engine, onChange: setEngine }));
  $('engine-note').textContent = engine === 'dsp' ? 'dsp: purpose-built drum models in an AudioWorklet. Same knobs.' : 'synth: the original Tone.js voices.';
}
// ---- samples on lanes: buffers by id (IndexedDB holds the audio; the lane only keeps { id, name }) ----
const sampleBufs = new Map();
/** Every audio buffer a lane plays: its sample, or each slice of its set (S1) with its padded copy (padBuf), and the
 *  reversed ones when something on the lane plays backwards (S3): made here, the scheduler never copies a buffer. */
async function ensureSample(lane) {
  const ids = lane.sample?.slices || [lane.sample?.id];
  await Promise.all(ids.map(async (id) => { if (!id || sampleBufs.has(id)) return; const r = await getSample(id); if (r) sampleBufs.set(id, toAudioBuffer(r, T.getContext().rawContext)); }));
  const rev = lane.usesRev();
  if (lane.sliceCount()) ids.forEach((_, k) => { padBuf(lane, k, false); if (rev) padBuf(lane, k, true); });
  else if (rev && ids[0]) revBuf(ids[0]);
}
/** S3: a sample backwards, made once per id (Web Audio can't play a buffer in reverse). */
function revBuf(id) {
  const k = `${id}~rev`; if (sampleBufs.has(k)) return sampleBufs.get(k); const b = sampleBufs.get(id); if (!b) return null;
  const r = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: b.length, sampleRate: b.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) r.copyToChannel(b.getChannelData(c).slice().reverse(), c);
  sampleBufs.set(k, r); return r;
}
/** One-shot playback: tune = rate (±1 oct), decay = how much of the sample plays, snap < ½ softens the attack and
 *  > ½ skips into the sample, color = a pitch swoop into the note (up above ½, down below). S1 / S3: `slice` picks the
 *  slice of a set; start / end / rev (locks over the lane's) cut the part that plays, backwards with rev, and the knobs
 *  above work inside that part (samples.js sampleWindow). */
function playSample(c, lane, p, time, lock = null, slice = null) {
  const id = lane.sampleId(slice), tr = lane.trimAt(lock), plain = sampleBufs.get(id); if (!plain) return;
  // a slice of a set plays from its copy with what follows it in the break (padBuf), so it can fade out over that
  const n = lane.sliceCount(), padded = n ? padBuf(lane, slice ?? 0, tr.rev) : null, buf = padded || (tr.rev ? revBuf(id) : plain);
  const w = sampleWindow({ dur: plain.duration, pad: buf.duration - plain.duration, ...tr, snap: p.snap, tune: p.tune, decay: p.decayRaw, slice: n > 0 });
  const src = new T.ToneBufferSource(buf), env = new T.Gain(0).connect(c.choke); src.connect(env);
  env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(p.vel, time + w.attack); env.gain.setValueAtTime(p.vel, time + w.hold); env.gain.linearRampToValueAtTime(0, time + w.play);
  src.playbackRate.setValueAtTime(w.rate * Math.pow(2, (p.color - 0.5) * 2), time); src.playbackRate.exponentialRampToValueAtTime(w.rate, time + 0.06);
  // an offline render (WAV, stems) runs its clock, onended included, before it renders: disposing there silenced the
  // sample in every export. The offline context is thrown away whole afterwards anyway.
  if (!T.getContext().isOffline) src.onended = () => { try { src.dispose(); env.dispose(); } catch {} };
  src.start(time, w.offset); src.stop(time + w.play + 0.02);
}
/** The longest fade-out a slice makes over what follows it: snap 0's 31 ms attack at twice the speed (tune +1). */
const PAD_SEC = 0.07;
/** S1: slice k of the lane's set with the start of the slice after it in the set appended (backwards: reversed, with
 *  the reversed end of the slice before it; samples.js padChannels), made once per pair. One source then plays straight
 *  through the cut, where two sources meeting at a buffer's edge leave a one-sample seam when Chrome resamples. null
 *  until both are loaded. */
function padBuf(lane, k, rev) {
  const n = lane.sliceCount(), id = lane.sampleId(k), nid = lane.sampleId(rev ? (k + n - 1) % n : (k + 1) % n), key = `${id}${rev ? '<' : '>'}${nid}`;
  if (sampleBufs.has(key)) return sampleBufs.get(key);
  const a = sampleBufs.get(id), b = sampleBufs.get(nid); if (!a || !b || a.sampleRate !== b.sampleRate) return null;
  const ch = (x) => Array.from({ length: x.numberOfChannels }, (_, c) => x.getChannelData(c));
  const r = toAudioBuffer({ sampleRate: a.sampleRate, channels: padChannels(ch(a), ch(b), Math.round(PAD_SEC * a.sampleRate), rev) }, T.getContext().rawContext);
  sampleBufs.set(key, r); return r;
}
/** A chain param that holds still between knob moves, set at once: one event at time 0. Tone's `.value =` puts it at
 *  now + look-ahead, and Chrome drops that event on a lane chain that is silent when it comes due (a kit built before
 *  its first hit, a knob turned on a lane that isn't sounding): the lane went on with its constructor value (send 0.15,
 *  level 0.8) while every export, rendered from time 0, had the setting, so a jam take and its ring-out disagreed. */
const holdParam = (param, v) => { param.cancelScheduledValues(0); param.setValueAtTime(v, 0); };
/** A lane sound key (0..1) → its chain param's value: the knobs' maps. tone 200 Hz .. 12 kHz (every hit sets it again
 *  at its time). drive moves the wet over a shaper set at the lane's drive top (c.dtop: the knob, or a drive curve's
 *  highest point, A2): at the top it is the knob's own sound, at 0 dry, continuous between (the knob alone jumps from
 *  dry to 0.31 wet at 0.02, which would click on a ramp). */
const SOUND_MAP = { tone: (v) => 200 * Math.pow(60, v), pan: (v) => v * 2 - 1, level: (v) => v * v * 1.2, send: (v) => v * 0.8 };
const driveWet = (d, top) => (top > 0.02 ? Math.min(1, d / top) * (0.3 + 0.7 * top) : 0);
const soundValue = (c, k, v) => (k === 'drive' ? driveWet(v, c.dtop) : SOUND_MAP[k](v));
/** The chain param a curve key (lanes.js AUTO_KEYS) moves. */
const autoParam = (c, k) => (k === 'tone' ? c.tone.frequency : k === 'pan' ? c.pan.pan : k === 'level' ? c.level.gain : k === 'send' ? c.send.gain : c.drive.wet);
/** Push a lane's sound params into its chain (called on every Shift+knob / slider change). A2: on the live kit while the
 *  clock runs, a param riding a curve is the clock's (rampAuto): a hold here would wipe its ramps, and the knob reaches
 *  it through the curve's empty points. Anywhere else (stopped, an offline render before its ramps, the kit export) it
 *  starts at the knob. soft: keys left alone here (autoEdit glides them itself). */
function applySound(li, k = kit, soft = null) {
  if (!k) return; const lane = lanesOf(k)[li], s = lane.sound, c = k.chains[li], a = lane.auto, own = (key) => !(a?.[key] && k === kit && playing) && !soft?.has(key);
  c.dtop = a?.drive ? lane.autoTop('drive') : s.drive; c.drive.distortion = c.dtop * 0.9; if (own('drive')) holdParam(c.drive.wet, soundValue(c, 'drive', s.drive));
  if (own('tone')) c.tone.frequency.value = SOUND_MAP.tone(s.tone);
  if (own('pan')) holdParam(c.pan.pan, SOUND_MAP.pan(s.pan)); if (own('level')) holdParam(c.level.gain, SOUND_MAP.level(s.level)); if (own('send')) holdParam(c.send.gain, SOUND_MAP.send(s.send));
}
/** Every lane's voice and sound on kit k: after a load, an undo, a kit or a lane-count change. The curves' next block
 *  line starts with a jump (rampAuto). */
function rebuildVoices(k = kit) { lanesOf(k).forEach((_, i) => { buildVoice(i, k); applySound(i, k); if (k) k.chains[i].ramp = k.chains[i].handAt = null; }); }
/**
 * A2: one block line of a lane curve on a chain param (autoRamps → here, live and in every render alike): a jump the
 * first time (c.ramp empty: Play, a load, an undo, a new curve), else a ramp from the last line (exponential on the
 * filter = linear in the knob's map), nothing while the value holds still (leaving such a run re-anchors at its last
 * line first, or the ramp would start where the run began). The live kit logs what it schedules for a jam take's
 * ring-out (replayRamps).
 */
function rampAuto(k, li, key, time, v) {
  const c = k.chains[li]; if (!c) return; const x = soundValue(c, key, v), st = (c.ramp ??= {})[key];
  if (!st) { autoSet(k, c, li, key, x, time, false); c.ramp[key] = { x, t: time, ev: time, flat: false }; return; }
  // ev: the param's last scheduled event. A line at or before it is covered (a hand-off's ramp ends there, a late clock
  // catching up), and an event on a ramp's end while that ramp runs makes Chrome hold the ramp's start until then (a step)
  if (time <= st.ev + 1e-9) return;
  if (x === st.x) { st.t = time; st.flat = true; return; }
  if (st.flat && st.t > st.ev + 1e-9) autoSet(k, c, li, key, st.x, st.t, false);
  autoSet(k, c, li, key, x, time, true); Object.assign(st, { x, t: time, ev: time, flat: false });
}
/** One curve event on a chain param (a set, or a ramp to it), logged on the live kit for a jam take's ring-out. */
function autoSet(k, c, li, key, x, t, ramp) {
  const p = autoParam(c, key); try { if (!ramp) p.setValueAtTime(x, t); else if (key === 'tone') p.exponentialRampToValueAtTime(x, t); else p.linearRampToValueAtTime(x, t); } catch {}
  if (k === kit && jam.ramps) logHit(jam.ramps, { li, k: key, time: t, x, ramp }, RING_KEEP);
}
/** E6 + A2: the live kit's logged curve moves on a jam ring-out's kit; t0 = the live time of the render's start: what
 *  was set before it holds from the start, the rest lands where it did live. */
function replayRamps(k, log, t0) {
  const start = new Map();
  for (const r of log) if (r.time <= t0 && k.chains[r.li]) start.set(`${r.li}:${r.k}`, r);
  for (const r of start.values()) autoParam(k.chains[r.li], r.k).setValueAtTime(r.x, 0);
  for (const r of log) { const c = k.chains[r.li]; if (!c || r.time <= t0) continue; const p = autoParam(c, r.k), t = r.time - t0; if (!r.ramp) p.setValueAtTime(r.x, t); else if (r.k === 'tone') p.exponentialRampToValueAtTime(r.x, t); else p.linearRampToValueAtTime(r.x, t); }
}
/** Seconds of live hits a jam take keeps for its ring-out (E6): the delay's tail plus a long sample at half speed. */
const RING_KEEP = 48;
/** slice: the slice of a set this hit plays (Lane.sliceAt; null = the lock's, else the first). step: when the step it
 *  plays is due on the grid, before swing, nudge, push or humanize (the scheduler's; a pad or an audition: its time).
 *  auto (A2): the lane's curve values where the hit sounds (expandHits). Returns the jam log entry it made (E6), if any. */
function hitSound(lane, time, accent, lock = null, vel = null, k = kit, slice = null, step = null, auto = null) {
  const li = lanesOf(k).indexOf(lane), c = k?.chains[li]; if (!c?.v) return; const s = lane.sound, L = lock || {}, dec = L.decay ?? s.decay;
  // a jam take that wants its ring-out remembers what the live kit played, to render the tails past its end (renderRing),
  // with when its step was due: a downbeat humanized or nudged before the take's end is still the next bar's. A time,
  // not a tick: Play and reset count the ticks from 0 again, a MIDI clock's snap renumbers them
  const logged = k === kit && jam.log ? { li, lane, time, step: step ?? time, accent, lock, vel, slice, auto } : null; if (logged) logHit(jam.log, logged, RING_KEEP);
  // A2: the hit puts the lane's other curve params on their curve at its own time too, so a chain silent between hits
  // (whose ramps Chrome may not have run) sounds right; the clock's next ramp goes on from there
  if (auto) for (const key in auto) if (key !== 'tone') try { autoParam(c, key).setValueAtTime(soundValue(c, key, auto[key]), time); } catch {}
  // G5: a soft hit is darker, softer and a little shorter (velShape, per voice); dsp layers darken in the worklet
  const p = velShape({ vel: vel ?? hitVel(accent, lock), tune: L.tune ?? lane.tune, dec: 0.04 + dec * dec * 1.2, decayRaw: dec, snap: L.snap ?? s.snap, color: L.color ?? s.color, artic: lane.strokeAt(lock) ?? undefined }, c.voice);   // L3: the stroke live MIDI and the export send too
  const viaDsp = c.voice !== 'sample' && c.engine === 'dsp';
  // choke groups: this hit opens its own lane and cuts the lane it chokes (open hat ← closed hat)
  try { c.choke.gain.setValueAtTime(1, time); const o = k.chains[lane.choke]; if (o && lane.choke !== li) o.choke.gain.setTargetAtTime(0, time, 0.008); } catch {}
  // every hit sets the lane filter at its own time: a tone lock opens / closes it for that hit only, a soft hit (synth
  // voices and samples) closes it by p.dark octaves, any other hit puts it back (on a tone curve: onto the curve, A2).
  // Hits can be scheduled out of time order (a ratchet nudged past the next step is scheduled before that step, sounds
  // after it): the automation sorts by time
  const dark = viaDsp ? 0 : p.dark;
  try { c.tone.frequency.setValueAtTime(SOUND_MAP.tone(L.tone ?? auto?.tone ?? s.tone) * Math.pow(2, -dark), time); } catch {}
  try { if (c.voice === 'sample') playSample(c, lane, p, time, lock, slice ?? lane.sliceAt(0, lock)); else if (viaDsp) c.dsp.port.postMessage({ t: time, layers: DSP_VOICES[c.voice](p).map(x => p.dark ? { ...x, dark: p.dark } : x) }); else VOICES[c.voice].hit(T, c.v, p, time); } catch {}
  return logged;
}
/** Live MIDI out for a hit: the note of the stroke it plays (L3). The one path to pmidi.note, for the clock and the pads. */
function midiHit(li, lane, vel, at, lock) { pmidi.note(li, vel, at, lane.strokeAt(lock)); }
const ui = {};   // segmented controls / chips by name (src/ui.js)
const voiceLabel = (lane) => lane.voice === 'sample' ? `♪ ${(lane.sample?.name || 'sample').replace(/\.[^.]+$/, '').slice(0, 12)}` : VOICES[lane.voice]?.label || lane.voice;
/** File / track names for n lanes (stems, jam takes, MIDI tracks): a lane the pattern no longer has is "lane N". */
const laneNames = (n) => Array.from({ length: n }, (_, i) => (m.lanes[i] ? voiceLabel(m.lanes[i]) : `lane ${i + 1}`));
function setVoice(li, key) { m.lanes[li].setVoice(key); buildVoice(li); if (awake && !playing) hitSound(m.lanes[li], T.now(), false); sync(); }
function cycleVoice(li, dir) { const keys = m.lanes[li].sample ? [...VOICE_KEYS, 'sample'] : VOICE_KEYS, i = keys.indexOf(m.lanes[li].voice); setVoice(li, keys[((i + dir) % keys.length + keys.length) % keys.length]); }
function applyKit(key) { if (!KITS[key]) return; m.applyKit(KITS[key], DEFAULT_SOUND); rebuildVoices(); sync(); }
/** The kit select shows the truth: the kit every lane still matches, else "custom" (so picking any kit, even the one
 *  you started from, is a change and re-applies it). */
function renderKit() { const k = m.kitKey(), ks = $('kit-select'); ks.querySelector('option[value=custom]').hidden = !!k; ks.value = k || 'custom'; }
function cycleKit(dir) { const cur = m.kitKey() ?? KIT_KEYS.find(k => KITS[k].name === m.kit) ?? KIT_KEYS[0]; const i = KIT_KEYS.indexOf(cur); applyKit(KIT_KEYS[((i + dir) % KIT_KEYS.length + KIT_KEYS.length) % KIT_KEYS.length]); }
// stopped + idle: nothing moves, so the canvas skips frames once the fading trails have settled (~1.5 s)
let busyUntil = 0; function poke() { busyUntil = performance.now() + 1500; }
async function wake() { if (awake) return; await T.start(); if (engine === 'dsp') await ensureDsp(T.getContext()).catch(() => {}); kit = makeKit({ fx: pfx }); awake = true; T.getTransport().bpm.value = tempo; buildLoops(); await setAutoLatency(); }
// ---- P6 performance FX on the live master: the filter (Move wheel, the transport strip's knob) and the delay throw
// (hold + on the Move, or "throw"). Not saved: a page always opens with them off. Exports leave them out unless
// "print FX" is on, and then print the filter as it is set (a throw is a moment, not part of the pattern). ----
const pfx = { filter: 0, throw: false };
/** A param glides to v (time constant `tc` s): no zipper noise however fast the knob turns, every move takes over from where the last one is. */
function glide(param, v, tc = 0.03) { const now = T.getContext().rawContext.currentTime; param.cancelScheduledValues(now); param.setTargetAtTime(v, now, tc); }
function setFilter(x) {
  const was = pfx.filter; pfx.filter = Math.max(-1, Math.min(1, Math.round(x * 100) / 100)); const f = kit?.master.fx;
  if (f) { const { lp, hp } = fxFreqs(pfx.filter, T.getContext().rawContext.sampleRate); glide(f.lp.frequency, lp); glide(f.hp.frequency, hp); }
  sliders.fxFilter?.set(Math.round(pfx.filter * 100)); readout(); if (pfx.filter !== was) slog?.act('filter', was, pfx.filter, { merge: true });
}
function setThrow(on) {
  if (pfx.throw === on) return; pfx.throw = on; const f = kit?.master.fx;
  // in fast so the hit you throw on is caught; out a little slower; the echoes ring on at the resting feedback
  if (f) { glide(f.send.gain, on ? THROW.send : 0, on ? 0.005 : 0.02); glide(f.delay.feedback, on ? THROW.fb : THROW.rest, on ? 0.01 : 0.08); }
  $('btn-throw').classList.toggle('armed', on); $('btn-throw').setAttribute('aria-pressed', on); paintLeds(); readout();
}
/** The filter knob's words: "off", "low-pass 1.2 kHz", "high-pass 340 Hz" (at the page's own rate, as heard). */
function filterSay(v) {
  if (!v) return 'off'; const { lp, hp } = fxFreqs(v / 100, T.getContext().rawContext.sampleRate), hz = v < 0 ? lp : hp;
  return `${v < 0 ? 'low-pass' : 'high-pass'} ${hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`}`;
}
/** P5: the auto MIDI out offset = when a hit leaves the speakers: the output's latency (known once the context runs)
 *  + the master's look-ahead (measured once per rate, like the exports': wake waits for it, so the first Play's MIDI
 *  start has it too; later calls find it measured and set it at once). */
async function setAutoLatency() {
  const raw = T.getContext().rawContext, sr = raw.sampleRate, s = latencyCache.has(sr) ? latencyCache.get(sr) : await masterLatency(sr).catch(() => 0);
  pmidi.autoMs = autoLatencyMs(raw, s); if (pmidi.offsetMs == null) sliders.midiLat?.set(pmidi.latencyMs);
}

// ---- the master clock: 840 ticks per beat drive every lane, MIDI clock, slots and evolve ----
// Each lane's position is derived from the tick (Lane.at), so lanes can't drift apart, whatever you change mid-play.
// The Tone loop still fires 24 times per beat (cheap); each call is a block of MIDI_DIV (35) ticks: one MIDI clock,
// the modulo bookkeeping on every tick, the lanes only on ticks where something can happen (liveQuiet).
const stress = { level: 0, headMs: 100 };
let tick = 0, resetPending = false, clockRef = { tick: 0, time: 0 }; const skip = new Set();   // skip: 'lane:tick' a pad already played live
const clockPast = [];   // RD-8: the latest blocks' { tick, time }, the newest last (= clockRef): the heard tick is read off them
const early = [];   // per lane: the steps decided ahead of their tick, since part of them sounds before it (liveTick)
const pending = pendingSteps();   // E6: the jam log's early parts, by their step's tick: given its real time when it comes
/** R3 bar lines: at + k × len (trackBars, slots.js). A new time signature (the meter control, a slot, undo, a link)
 *  starts on the next bar line of the old one, so a bar is never cut short, and the lanes start there on step 1
 *  (m.setOrigin); a restart counts from tick 0 in the pattern's meter. barN: bar lines since Play, in any meter. */
let bars = { at: 0, len: BAR_TICKS, next: null }, barN = 0, barAt = 0, barBeats = { meter: null, num: 4 };   // barAt: the tick of the last bar line (RD-8: the crawl counts from it)
const resetBars = () => { bars = { at: 0, len: m.barTicks(), next: null }; barN = 0; barAt = 0; m.setOrigin(0); };
function trackMeter(t) { const b = trackBars(bars, t, m.barTicks()); if (b !== bars) { bars = b; m.setOrigin(bars.at); } }
const tickSec = () => 60 / tempo / PPQ;
/** The cycle depends on the locked dice repeat too: every cycleTicks() caller passes this. */
const cycleOpts = () => ({ repeat: dice.locked ? dice.repeat : 1 });
const perfAt = (time) => performance.now() + (time - T.getContext().rawContext.currentTime) * 1000;   // audio time → Web MIDI timestamp
/** The master tick (fractional) at audio-context time `time`, from the clock's latest block. */
const tickAt = (time) => (clockPast.length > 1 ? blockTick(clockPast, time, tickSec()) : clockRef.tick + (time - clockRef.time) / tickSec());
/** The master tick being heard right now (fractional): the scheduler runs ahead of the speakers, which lag a little. */
const heardTick = () => { const raw = T.getContext().rawContext; return tickAt(raw.currentTime - (raw.outputLatency || 0)); };
function buildLoops() { loop?.dispose(); loop = new T.Loop((time) => onBlock(time), `${T.getTransport().PPQ / 24}i`); loop.start(0); }
function onBlock(time) {
  if (resetPending) { tick = 0; resetPending = false; skip.clear(); early.length = 0; pending.clear(); resetBars(); m.resetAll(); }   // all keyed on the old ticks; loops count from 0 again
  if (tick === 0) clockPast.length = 0;   // a run (or a reset) starts its own line of blocks
  const t0 = tick, ts = tickSec(); tick += MIDI_DIV; clockRef = { tick: t0, time }; clockPast.push(clockRef); if (clockPast.length > 64) clockPast.shift();
  stress.headMs = stress.headMs * 0.9 + (time - T.getContext().rawContext.currentTime) * 1000 * 0.1;   // audio headroom: how far ahead of the speakers we schedule
  pmidi.clockAt(t0, perfAt(time));   // a block starts on the 24-PPQ grid: one clock, 24 per quarter
  let cyc = m.cycleTicks(cycleOpts());   // once per block (and again when a slot or evolve changes the pattern)
  for (let t = t0; t < t0 + MIDI_DIV; t++) cyc = onTick(t, time + (t - t0) * ts, cyc, ts);
}
function onTick(t, time, cyc, ts) {
  trackMeter(t);
  // a slot in another meter starts its bars (and lanes) here; P4 with "restart on change" any slot does: step 1, loop 1
  const si = bank.due(t, cyc, bars, m.origin); if (si >= 0) { loadSlot(si, true); if (bank.restart) m.setOrigin(t); cyc = m.cycleTicks(cycleOpts()); trackMeter(t); }
  if ((t - m.origin) % cyc === 0) T.getDraw().schedule(() => scene.bloom(), time);   // the whole machine lines up again
  // evolve every N bars: the bar lines since Play, counted as they come in whatever meter (the anchor's own included);
  // its way home can bring back another meter, which starts on this bar line too
  const line = t > 0 && onBar(t, bars); if (line) { barN++; barAt = t; }
  // RD-5 the bar·beat counter: worked out here (integers; the meter's beats a bar read when it changes), drawn on its
  // beat by Tone.Draw (no DOM in the clock), not after a stop (a beat queued just before it would undo its "01.1")
  if (m.meter !== barBeats.meter) barBeats = { meter: m.meter, num: meterParts(m.meter).num };
  const bt = bars.len / barBeats.num, inBar = (((t - bars.at) % bars.len) + bars.len) % bars.len; if (inBar % bt === 0) { const bb = `${String(barN % 100 + 1).padStart(2, '0')}.${Math.floor(inBar / bt) + 1}`; T.getDraw().schedule(() => { if (playing) barBeat.textContent = bb; }, time); }
  if (line && evo.on && barN % evo.every === 0) { evolveNow(barN, true); cyc = m.cycleTicks(cycleOpts()); trackMeter(t); }
  if (line) questEvent({ type: 'bar', evolving: evo.on });   // I6 (a log entry; the check runs off the clock)
  // P2 / P3 on every bar line, Play's downbeat included, once a slot or evolve's way home has set this line's lanes (a
  // waiting mute lands on the lanes that play from here): queued mutes land, the fill latch turns on (or off) for the bar
  if ((muteQ.size || latch.state !== 'off') && onBar(t, bars)) barPerf();
  jamTick(t, time);   // after the slot and evolve: a take starting here counts in the meter that plays from here
  if (barWait && onBar(t, bars)) { const f = barWait; barWait = null; f(time); }   // I5: a postcard starts on this bar line
  if (pending.size) pending.settle(t, time);   // E6: the early parts of the steps on this tick get the time it came at
  // A2: a block line (every MIDI_DIV ticks, from the pattern this tick plays: after a slot or evolve): one ramp per curve,
  // but not under a hand (A3: it glides the param itself)
  if (t % MIDI_DIV === 0 && m.lanes.some(l => l.auto)) for (const r of autoRamps(m, t, t + 1)) if (handNow?.[r.li]?.[r.k] == null) rampAuto(kit, r.li, r.k, time, r.v);
  // the steps from a queued slot's switch, or from a new meter's first bar line, belong to what starts there
  const cut = Math.min(bank.nextSwitch(t, cyc, bars, m.origin), bars.next ? bars.next.at : Infinity);
  if (knobGest?.rec) autoRecordTick(t, ts, cut);   // A1 / A2: a recording gesture writes before this tick's steps are made
  if (liveQuiet(m, t, early, { humanize: m.humanize, tickSec: ts, cut })) { if (skip.size) m.lanes.forEach((_, li) => skip.delete(`${li}:${t}`)); return cyc; }
  const now = T.getContext().rawContext.currentTime, at = perfAt(time);
  const play = (li, lane, h, step) => { const ht = Math.max(now, time + h.dt), e = hitSound(lane, ht, h.accent, h.lock, h.vel, kit, h.slice, step, h.auto); midiHit(li, lane, h.vel, at + (ht - time) * 1000, h.lock); return e; };
  // swing, nudge, push/pull, ±humanize, ratchets; a step nudged or pushed before its tick plays its early part from an
  // earlier tick (liveTick, export.js), unless a queued slot takes over by then (cut) or a pad just played it (skip).
  // step: when the hit's own step is due (this tick; for an early part the later tick it belongs to, estimated at this
  // tempo until that tick comes: pending)
  liveTick(m, t, early, { fill, dice: dice.locked ? dice : null, tickSec: ts, cut, skip, cycle: cyc, hand: handNow }).forEach(({ ev, hits, early: soon }, li) => {
    const lane = m.lanes[li]; for (const h of soon) { const e = play(li, lane, h, time + (h.tick - t) * ts); if (e) pending.add(h.tick, e); }
    if (!ev) return;
    for (const h of hits) play(li, lane, h, time);
    // drawn at its time: by then the lane may be gone (6 → 4 lanes, an undo, a slot with fewer lanes)
    T.getDraw().schedule(() => { if (li >= m.lanes.length) return; scene.onStep({ lane: li, index: ev.index, hit: ev.hit, accent: ev.accent, miss: ev.miss, loop: ev.loop }); lane.shown = ev.index; if (li === m.selected) paintPlayhead(); paintLeds(); }, time);
  });
  return cyc;
}
// the delays glide to the new dotted eighth (a jump in delay time clicks on the echoes still ringing)
// RD-9: the transport's tempo moves as a step (`bpm.value`: cancel + setValueAtTime at now(), as the MIDI clock paths
// do), never a ramp: Tone's bpm.rampTo (setRampPoint → cancelAndHoldAtTime) leaves its TickParam an event with no
// ticks, and a ramp between near-equal values solves to the wrong root, so overlapping ramps (a knob dragged, a step
// every 25 ms) sent the clock's next tick before 0 (a TypeError in Clock._loop, the block dropped) or held it in place
// (the page hung) in the final sets. The delays are plain params: they still glide.
function retime({ transport = true } = {}) { if (!awake) return; if (transport) T.getTransport().bpm.value = tempo; const d = 60 / tempo * 0.75; for (const c of kit.chains) c.delay.delayTime.rampTo(d, 0.1); kit.master.fx?.delay.delayTime.rampTo(d, 0.1); }
async function togglePlay() {
  slog?.begin(); await wake(); playing = !playing; $('btn-play').classList.remove('pulse'); neverPlayed = false; hideWelcome();
  // clockRef restarts with the transport (the countdown and live record read it before the first tick comes): at the time
  // the transport starts, now() + 0.05 (now() is currentTime + the lookahead; RD-8: a guess 0.1 s early ran the heard
  // tick ahead until the first block put it back, and the crawl stepped back after Play)
  if (playing) { setAutoLatency(); tick = 0; resetPending = false; skip.clear(); early.length = 0; pending.clear(); resetBars(); m.resetAll(); scene.reset(); for (const c of kit.chains) c.ramp = c.handAt = null; const at0 = T.now() + 0.05; clockRef = { tick: 0, time: at0 }; clockPast.length = 0; T.getTransport().start(at0); pmidi.start(performance.now() + 50); if (!autoRaf) autoRaf = requestAnimationFrame(autoFrame); } else { gestEnd(true); if (jam.state === 'rec' || jam.state === 'armed') stopJam(); const at = T.now(); T.getTransport().stop(at); pmidi.stop(perfAt(at)); flushPerf(); m.lanes.forEach((l, i) => { if (l.auto) applySound(i); }); if (autoParams(m.lane).length) sync(); }   // MIDI start ahead of the first clock (never before a stop on its way); stop when the transport stops, after the clocks it still schedules; A2: a curve starts with a jump on Play, stopped the knobs play
  { const b = $('btn-play'); b.textContent = playing ? '■' : '▷'; b.setAttribute('aria-label', playing ? 'stop' : 'play'); if (!playing) barBeat.textContent = '01.1'; } recLine(); paintPlayhead(); paintLeds(); readout(); giftPlay?.();
  slog?.act('transport', playing ? 'stopped' : 'playing', playing ? 'playing' : 'stopped', { absorb: true });   // a stop lands the waiting mutes
}
$('btn-play').onclick = togglePlay;
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (!awake) wake(); }, { once: true });

// ---- tempo ----
/** exact: keep 0.01 bpm (an external clock at 127.5 is 127.5); knobs and taps use whole bpm. transport: false when
 *  the phase lock is steering the transport itself: only our grid maths, delays and display follow. */
function applyTempo(bpm, publish = true, { exact = false, transport = true } = {}) {
  const was = tempo, c = Math.min(240, Math.max(40, bpm)); tempo = exact ? Math.round(c * 100) / 100 : Math.round(c);
  if (publish) setTempo(tempo, 'poly'); if (tempo !== was) retime({ transport });
  sliders.tempo?.set(tempo); readout();
}
/** MIDI clock in (already smoothed, called only on a real change). In phase lock while playing, the clock-tick trim
 *  drives the transport: a retime would fight it. */
const followClockTempo = (bpm) => { hush = true; try { applyTempo(bpm, true, { exact: true, transport: !(pmidi.follow === 'lock' && playing) }); } finally { hush = false; } };   // the clock's tempo isn't announced: you didn't touch it
onTempo((bpm, src) => { if (src !== 'poly') applyTempo(bpm, false, { exact: true }); });
/** A tempo the hands set (knob, tap, Move knob 8): logged by the setlog, a turn as one entry. */
const handTempo = (bpm) => { const was = tempo; applyTempo(bpm); if (tempo !== was) slog?.act('tempo', was, tempo, { merge: true }); };
const tap = makeTapTempo(); const tapTempo = () => { const b = tap(); if (b) handTempo(b); }; $('btn-tap').onclick = tapTempo;

// ---- lane params (UI + Move) ----
const INFO = {
  length: 'How many steps the lane loops over (1–32; past 16 the step strip shows a second row). Different lengths at the same speed = polymeter: 3 against 4 lines up every 12 steps.',
  euclid: 'Spreads this many hits as evenly as possible over the length (E(3,8) is the tresillo). Changing it rewrites the pattern; toggles after that are yours.',
  rotation: 'Shifts the whole pattern by N steps without changing it. Rotate the snare so its hits fall on 2 and 4.',
  pre: 'PRE / not PRE: play only if the last step with a condition on this lane passed its condition (or failed it). It reads the condition, not whether that step sounded: a mute or its probability roll don\'t count. Pair it with a 1:2 step for an either-or: one plays, the other answers.',
  lanes: 'How many lanes this pattern has: 4, or 6 (lanes 5 and 6 start empty, with the kit\'s open hat and cymbal or their likes). Going back to 4 drops lanes 5 and 6; undo brings them back. A slot, a saved setup or a link keeps its own count. On the Move, Shift + track buttons pick lanes 5 and 6.',
  meter: 'Time signature of this pattern: how long a bar is. Next-bar slot switching, chains, evolve, jam takes and exports count in these bars; 7/8 = 3½ beats. A change starts on the next bar line, where the pattern starts again on step 1 (so does a slot or a chain step in another meter).',
  ratio: 'Speed against the master tempo. ×1 = one step per beat (4 steps = a bar), ×2 eighths, ×4 sixteenths, ½ half notes; 3/2 or ⅔ against ×1 is a true polyrhythm; 5/4 and 7/4 play fives and sevens across four beats, 4/3 the hemiola, ×6 sixteenth triplets.',
  swing: 'Delays every second step by this fraction of a step. Steps are counted on the master clock, not the loop, so the swung moments stay put whatever the length. With the MPC template, at ×3, ×3/2 and ×¾ the middle step of each three swings. 0 = straight, ~20% = loose, 33% = triplet swing (2:1), 50% = dotted (3:1). The template next to it changes which steps move.',
  'swing template': 'Which steps the swing moves, and how far: it shapes the swing amount, so at 0% swing every template plays straight. MPC 16th: every second step (the classic). triplet: at 50% exactly the 2:1 shuffle. 3-3-2 and aksak 2+2+3 lean on their groups. amapiano: the "e" pushed further than the "a". straight: no swing at all.',
  offset: 'Push / pull: the whole lane early (−) or late (+) by up to 30 ms. A hat a few ms late lays back; a snare early drives.',
  velHuman: 'Random velocity on every hit of this lane, up and down around its tier (at 100% up to ±20% of the hit\'s own velocity, so a ghost wobbles as much as an accent). With locked dice it repeats.',
  prob: 'Chance that a programmed hit actually plays. 100% = always; 60% = the pattern breathes differently every loop.',
  tune: 'Pitch of the voice, about ±1 octave (less for some voices).',
  decay: 'Length of the sound, from a tick (40 ms) to a long tail (1.2 s). Kits scale it per voice.',
  tone: 'Low-pass filter after the voice: left = dark and muffled, right = open and bright.',
  drive: 'Distortion before the filter. A little adds body, a lot shreds. Recorded as a curve (knobs record), it moves how much of the drive at the curve\'s highest point you hear: the values between blend that drive in, they are not the knob\'s own sound there.',
  snap: 'The transient: click on the kick, body on the snare, bursts on the clap, stutters on glitch, sweep height on zap.',
  color: 'The character knob: pitch-drop on kick/tom, noise-vs-body on snare, metal harmonics on hat/gong, FM ratio on bell/perc, bit depth on glitch, bass / tone / slap on djembe (thirds), low / high bell on agogo, how far the log drum glides down.',
  send: 'How much of the lane goes to the tempo-synced delay (dotted eighth).',
  pan: 'Stereo position, left to right.',
  level: 'Lane volume.',
  tempo: 'Master tempo in bpm, shared by every page. Global, not per lane.',
  humanize: 'Random timing jitter on every hit (up to ~15 ms), to make the machine feel less like a machine. Velocity humanize is per lane, in the lane drawer.',
  'lock nudge': 'Moves this step early (−) or late (+) by up to half a step. On the Move: hold the step and turn the jog wheel.',
  'step locks': 'Long-press, right-click or Alt+click a step to override tune, probability, velocity, decay, tone, snap, color or nudge on that step only, and pick its stroke on a conga, bongo, djembe, hat, agogo or shekere (Move: hold the step and push the jog wheel). Locked hits glow cyan and get a small moon.',
  'lock vel': 'Velocity of this step only (an accent still adds on top). Also sent as the MIDI note velocity.',
  'lock tone': 'Opens or closes the lane filter for this hit only; the next unlocked hit puts it back.',
  'switch at': 'When a recalled slot takes over: at once, on the next bar line (4 beats), or when every lane lines up again (the full polyrhythm cycle).',
  'restart on change': 'A slot (or the next slot of a chain) starts its lanes on step 1 where it comes in, and its first loop counts as the first again, so "1st loop" steps play. Off: it picks up where the running count is. The chain\'s MIDI export follows it.',
  'chain bars':'In a chain (song), how many bars each slot plays before the next one comes in. Chains always change on a bar line.',
  'accent above': 'Live record: pad velocity at or above this becomes an accent (keyboard: Shift = accent).',
  quantize: 'Live record: "nearest step" rounds, so a slightly early hit lands on the coming step; "step just played" always files it under the last step.',
  'automation cc': 'MIDI export: each automated parameter of a lane goes out as this CC on the lane\'s track and channel: step values (locks) just before each note, curves wherever they change. 0 = left out. Defaults: tone 74, decay 75, snap 73, color 71, tune 16, drive 17, level 7, pan 10, send 91. "One Drum-Rack track" has one channel for every lane, so it carries notes only.',
  'record knobs': 'Record knob moves into the selected lane, armed and playing. off = knobs act as always. touch = while you hold a knob (a gauge, or a Move knob you touch) its moves are recorded: chance, tune, decay, snap and color (and the step lock knobs) as step locks on the steps that play, tone, drive, send, pan and level as a smooth curve over the lane\'s loops; let go and it plays back. latch = after you let go the last value goes on until the loop is back where you started. The lane\'s own value stays; each touch is one undo step. The strip under the steps shows it; clear it there (Move: touch the knob + Delete).',
  'pitch pads': 'Live record: the 8 pads of a row play the lane at 8 pitches and write a tune lock with the hit.',
  'evolve every': 'Evolve mode: how many bars between two mutations.',
  'evolve amount': 'Evolve mode: chance per lane of being nudged at each mutation.',
  'evolve scope': 'What evolve may touch: rotation only; rotation + the hits; or everything with a weight (also length, speed, chance and tune). A euclid lane you edited by hand keeps your edits: evolve adds or takes away one hit. Accents, locks and conditions travel with their hits.',
  'evolve weight': 'How often evolve picks this kind of change, against the others (0 = never). Chance and tune start at 0.',
  'evolve gravity': 'Gravity: the chance a nudge goes back toward home instead of somewhere new. 0 = wander freely, 100 % = every nudge heads home, then the lane holds still. Home = the pattern when you switched evolve on, loaded or saved a slot, or pressed "home = now".',
  'evolve max cycle': 'The longest the whole pattern may take to repeat, in bars: a change that would make it longer is not made. Off = no limit. Gravity\'s steps home are never held back (home is your own pattern): on the way there the whole can repeat later than this, and with low gravity for a good while, since the other changes then keep to the longer cycle.',
  coupling: 'Coupling: a hit on one lane makes another lane more likely to play its next step (it adds to that step\'s chance; steps at 100 % already play). "next lane": lane 1 lifts lane 2, 2 lifts 3 … the last lifts lane 1. Matrix: pick who lifts whom (row = the lane that hits, column = the lane it lifts; tap a cell to step 0 → 25 → 50 → 75 → 100 %). Saved with the pattern. Locked dice play it the same every time.',
  'return home': 'After this many mutations evolve snaps back to the home pattern (set when you enable evolve, load or save a slot, or press "home = now"). 0 = drift forever.',
  'midi offset': 'MIDI out offset, −50…+50 ms: notes and clock leave this much later (+) or earlier (−) than the hit is scheduled here. Auto = the audio output\'s latency, so a drum machine on MIDI sounds with the speakers; turn it down when the other device is slow itself.',
  'clock out':'Sends MIDI clock (24 per beat, from the master clock) plus start/stop to the MIDI out port, so a DAW or a drum machine follows Orbits.',
  condition: 'Per step: play only on some loops (1:2 = first of every two, 3:4 = third of every four), only while Fill is held (keyboard: hold 0), never while it is, only/never on the first loop after Play, or only if the last conditional step on the lane passed / failed its condition (PRE / not PRE).',
  repeats: 'Per step ratchet: the hit repeats 2–8 times inside its own step; "fade" makes each repeat quieter.',
  'ratchet curve': 'How the repeats are spaced inside the step: evenly, speeding up (the gaps get shorter, like a bouncing ball coming to rest; the last repeat lands where an even one would) or slowing down (the gaps get longer, into the next step). Repeats that come closer together play softer by as much, so a curve is as loud as an even roll.',
  'ratchet ramp': 'Pitch ramp: the last repeat plays this many semitones above (+) or below (−) the first, the ones between in steps. The knob shows the lane voice\'s own semitones (voices tuned ±24 move twice as far).',
  'euclid mode': 'How the euclid hits combine with the steps you set. Replace: the euclid knob writes the steps (as always). AND: only your steps that are also euclid hits play. XOR: euclid hits play, and each step you set flips one (on an euclid hit it rests, off it it plays). With AND / XOR your steps stay as you set them: the knob moves only the mask. (These are the even "floor" fills: E(5,8) is x.x.xx.x; Bjorklund\'s cinquillo x.xx.xx. is the same with rotation 6.)',
  modulate: 'A slow wave on one sound knob of this lane (tone, color or decay): it rises and falls by ± half the depth around where the knob (or a step lock) is, once every N loops of this lane, or once over the whole cycle.',
  'timbre dice': 'Every hit rolls its tone, color or decay within this range around where it is (± half the range). Lock the dice to make the rolls repeat.',
  scale: 'Snap this lane\'s tune (and its tune locks, pitch ramps and the evolve tune moves) to a scale from the voice\'s own note: major, minor, pentatonic, or just intonation (pure ratios like 3/2 and 5/4 instead of equal steps). Pitched voices only. On marimba, conga and bongo the color knob bends the pitch too, so a color modulator or color dice takes them off the scale.',
  solo: 'Solo: only soloed lanes play (several can be).',
  'mute next bar': 'While playing, a mute or unmute waits for the next bar line, so it lands on the one (press again before it to take it back; a slot coming in on that line gets it too). On the Move: hold Mute and press a track button or a pad of a lane\'s row.',
  'console log': 'The console log: the status line and the per-lane and sound rows as plain text over the rings (key `). Text only, nothing to press.',
  night: 'Night: the controls\' light turned down for a dark room (values, words and labels dim; the canvas, the lane colours and the edges stay). Everything still reads at 4.5:1.',
  'live mode': 'Live mode (the Move): pads play the lane\'s sound with their velocity instead of writing steps (arm Record to write), and Capture (randomize all) and Delete (clear lane) need Shift, or a 600 ms hold, so a stray press can\'t wipe the set. Off: pads toggle steps and the buttons act at once, as in editing.',
  'fx filter': 'Performance filter on the whole mix, before the master compressor: left = low-pass (darker, down to 200 Hz), right = high-pass (thinner, up to 6 kHz), centre = off. Glides, so a fast turn doesn\'t crackle. Move: the jog wheel (it stops at the centre on the way across; push it = off; Shift + wheel = humanize). Exports leave it out unless "print FX" is on.',
  'fill latch':'Fill for the next whole bar, hands free (Move: Shift + Layout). Press again before it starts to cancel.',
  chokes: 'Choke group: when this lane hits it cuts off the lane picked here, like a closed hat stopping an open hat.',
  sample: 'Load a file, record up to 4 s from the mic, take a slice Unassembler sent (or all of them as a slice set), load a whole break and cut it into 8 or 16 slices, or drop an audio file on a ring. On a sample: tune = speed (±1 octave), decay = how much plays, snap = soft attack (left) or skip into the sample (right), color = a pitch swoop into the hit. A slice set plays slice N on step N; lock a step to another slice in its lock panel (Move: hold the step, turn knob 7).',
  trim: 'Start and end: the part of the sample (of each slice) that plays, from 0 to 100 % of it. With backwards it plays from the end to the start.',
  dice: 'Free dice = every probability roll is new. Locked dice = rolls come from the seed, so a probabilistic groove (and humanize, evolve, randomize) repeats exactly. Same seed, same groove.',
  'dice repeat': 'Locked dice: the rolls repeat every N loops of each lane (1 = every loop identical).',
  share: 'Copy link puts the whole pattern (not samples) in the URL: open it anywhere to get the groove. WAV renders the current pattern; MIDI writes the pattern or the running chain, one track per lane with the MIDI I/O notes.',
  'clock in': 'Follow another device: "tempo" takes its bpm, "tempo + start/stop" also starts and stops with it, "phase lock" also keeps the beat aligned to its clock ticks (and Song Position Pointer).',
};
// grid order: swing last, so its template can sit beside it on the same row
const PARAMS = [
  { k: 'length', label: 'length', min: 1, max: MAX_STEPS, get: l => l.length, set: (l, v) => l.resize(v), fmt: v => v, say: v => `${v} step${v === 1 ? '' : 's'}` },
  { k: 'euclid', label: 'euclid hits', min: 0, max: MAX_STEPS, get: l => l.euclidK, set: (l, v) => l.setEuclid(v), fmt: v => v, say: v => `${v} hit${v === 1 ? '' : 's'}` },
  { k: 'rotation', label: 'rotation', min: 0, max: MAX_STEPS - 1, get: l => l.rotation, set: (l, v) => { l.rotation = ((Math.round(v) % l.length) + l.length) % l.length; }, fmt: v => v, say: v => `${v} step${v === 1 ? '' : 's'}` },
  { k: 'ratio', label: 'speed ×', min: 0, max: RATIOS.length - 1, get: l => l.ratioIndex, set: (l, v) => { l.setRatio(v); }, fmt: v => RATIO_LABEL[v], say: v => `times ${RATIO_LABEL[v]}` },
  { k: 'prob', label: 'probability', min: 0, max: 100, get: l => Math.round(l.prob * 100), set: (l, v) => { l.prob = Math.max(0, Math.min(1, v / 100)); }, fmt: v => v + '%' },
  { k: 'tune', label: 'tune', min: -100, max: 100, get: l => Math.round(l.tune * 100), set: (l, v) => { l.tune = Math.max(-1, Math.min(1, v / 100)); }, fmt: v => (v > 0 ? '+' : '') + v, say: tuneSay },
  { k: 'offset', label: 'push / pull', min: -OFFSET_MS, max: OFFSET_MS, get: l => l.offsetMs, set: (l, v) => l.setOffset(v), fmt: v => (v > 0 ? '+' : '') + v + ' ms', say: v => v ? `${Math.abs(v)} ms ${v > 0 ? 'late' : 'early'}` : 'on time' },
  { k: 'velHuman', label: 'vel humanize', min: 0, max: 100, get: l => Math.round(l.velHuman * 100), set: (l, v) => { l.velHuman = Math.max(0, Math.min(1, v / 100)); }, fmt: v => v + '%' },
  { k: 'swing', label: 'swing', min: 0, max: 100, get: l => Math.round(l.swing * 100), set: (l, v) => { l.swing = Math.max(0, Math.min(0.66, v / 100)); }, fmt: v => v + '%' },
];
function tuneSay(v) { return v === 0 ? 'centre' : `${Math.abs(v)}% ${v > 0 ? 'up' : 'down'}`; }   // spoken: ±100 = about an octave
const sliders = {};   // k -> gauge handle ({ set, value })
const laneTabs = [], laneMs = [];  // RD-5 the lane list: a row per lane (select it) and its M lamp (mute; Shift / long press = solo)
function buildSliders() {
  const el = $('sliders'); el.innerHTML = '';
  // A3: chance and tune record (as step locks) when knobs record; the rest are the grid, never recorded
  for (const p of PARAMS) { const auto = p.k === 'prob' || p.k === 'tune', g = makeGauge({ label: knobWord(p.k), min: p.min, max: p.max, value: p.get(m.lane), fmt: p.fmt, say: p.say, title: INFO[p.k], onChange: (v) => { const x = auto ? handTurn('lane', p.k, v / 100) : v / 100; if (x === undefined) return; p.set(m.lane, auto ? Math.round(x * 100) : v); sync(); questEvent({ type: 'edit', lane: m.selected, k: p.k }); }, ...(auto && { onStart: (v) => handHold('lane', p.k, v / 100), onEnd: () => handLetGo('lane', p.k), prime: () => handPrime('lane', p.k) }) }); sliders[p.k] = g; el.appendChild(g.el); }
  // G6: the swing template sits right after the swing gauge
  ui.swingTpl = segmented({ options: SWING_KEYS.map(k => [k, SWING_TEMPLATES[k].name, INFO['swing template']]), value: m.lane.swingTpl, onChange: (k) => { m.lane.setSwingTpl(k); sync(); } });
  const sw = document.createElement('div'); sw.className = 'ctl swing-tpl'; sw.title = INFO['swing template']; sw.innerHTML = '<span class="ctl-lbl">swing template</span>'; sw.appendChild(ui.swingTpl.el); sliders.swing.el.after(sw);
  const ge = $('global-sliders'); ge.innerHTML = '';
  // exact: a clock-in tempo of 127.5 shows as 127.5 (turning the knob still moves in whole bpm)
  sliders.tempo = makeGauge({ label: 'tempo', min: 40, max: 240, value: tempo, exact: true, say: (v) => v + ' bpm', title: INFO.tempo, color: 'var(--ember-magenta)', onChange: (v) => handTempo(v) });
  $('tempo-gauge').replaceChildren(sliders.tempo.el);   // its home in the sheet; the rhythm page shows it as knob 8 (RD-5)
  sliders.humanize = makeGauge({ label: 'humanize', min: 0, max: 100, value: Math.round(m.humanize * 100), fmt: (v) => v + '%', title: INFO.humanize, color: 'var(--nebula-purple)', onChange: (v) => { m.humanize = v / 100; save(); readout(); } }); ge.appendChild(sliders.humanize.el);
  // RD-5 the lane list: a row selects its lane, M mutes it (as the Move's Mute: never an undo step, "on next bar" too);
  // Shift+click or a long press solos it (Shift + Mute on the Move)
  for (let i = 0; i < MAX_LANES; i++) {
    const li = document.createElement('li'); li.style.setProperty('--lane', LANE_HEX[i]);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lane-tab'; b.onclick = () => { m.select(i); lockStep = -1; sync(); };
    const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'lane-m'; mb.textContent = 'M';
    mb.onclick = (e) => { if (e.shiftKey) toggleSolo(i); else toggleMute(i); }; longPress(mb, () => toggleSolo(i));
    li.append(b, mb); $('legend').appendChild(li); laneTabs.push(b); laneMs.push(mb);
  }
  // picked with the mouse, a select lets go of the focus, so the arrow keys don't keep changing it (see controlOwnsKey)
  const vs = $('voice-select'); vs.innerHTML = ''; for (const k of VOICE_KEYS) vs.add(new Option(VOICES[k].label, k)); vs.onchange = () => { setVoice(m.selected, vs.value); letGoAfterPointer(vs); };
  const ks = $('kit-select'); ks.innerHTML = ''; const cu = new Option('custom', 'custom'); cu.disabled = true; ks.add(cu); for (const k of KIT_KEYS) ks.add(new Option(KITS[k].name, k)); ks.onchange = () => { applyKit(ks.value); letGoAfterPointer(ks); };
  const se = $('sound-sliders'); se.innerHTML = '';
  const panSay = (v) => v === 50 ? 'centre' : `${Math.abs(v - 50) * 2}% ${v < 50 ? 'left' : 'right'}`;   // spoken: the knob shows 0–100
  // A3: every sound knob records when knobs record: tone, drive, send, pan, level as a curve, decay, snap, color as locks
  for (const k of SOUND_KEYS) { const g = makeGauge({ label: k, min: 0, max: 100, value: Math.round(m.lane.sound[k] * 100), say: k === 'pan' ? panSay : (v) => v + '%', title: INFO[k], color: 'var(--ember-magenta)', onChange: (v) => { const x = handTurn('snd', k, v / 100); if (x === undefined) return; m.lane.setSound(k, x); applySound(m.selected); sync(); }, onStart: (v) => handHold('snd', k, v / 100), onEnd: () => handLetGo('snd', k), prime: () => handPrime('snd', k) }); sliders['snd:' + k] = g; se.appendChild(g.el); }
}
const pages = new MovePages();   // the Move's pages and pad window (pages.js, used by the Move section below)
function sync() {
  pages.window(m.selected, m.lanes.length);   // the pad window follows every selection, Move or not: the computer keys mirror the pads
  const handG = handGauge();   // A3: the knob a hand turns shows the hand (autoFrame), not the lane value under it
  for (const p of PARAMS) if (sliders[p.k] !== handG) sliders[p.k].set(p.get(m.lane));
  ui.swingTpl.set(m.lane.swingTpl);
  for (const k of SOUND_KEYS) if (sliders['snd:' + k] !== handG) sliders['snd:' + k].set(Math.round(m.lane.sound[k] * 100));
  sliders.tempo.set(tempo); sliders.humanize.set(Math.round(m.humanize * 100)); ui.meter?.set(m.meter);
  muteQ.trim(m.lanes.length);   // a lane the pattern no longer has (6 → 4, a slot) has no mute waiting
  $('lane-name').textContent = `Lane ${m.selected + 1} · ${voiceLabel(m.lane)}${m.lane.muted ? ' (muted)' : ''}`;
  ui.laneCount?.set(m.lanes.length); renderLanes(); renderVoiceOptions(); renderLaneMix(); renderKit();
  // RD-2 / RD-5: the lane drawer and the console take the selected lane's ink (borders, cells, playhead, every lane knob)
  const hex = LANE_HEX[m.selected]; $('lane-drawer').open = true; $('lane-drawer').style.setProperty('--lane', hex); $('topbar').style.setProperty('--lane', hex);
  for (const p of PARAMS) sliders[p.k].setColor(hex); for (const k of SOUND_KEYS) sliders['snd:' + k].setColor(hex);
  $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : '';
  renderPage(); renderSteps(); renderLocks(); renderAuto(); renderGen(); paintLeds(); save(); readout(); renderStrokeNotes(); renderQuest();
}
/** RD-5 the lane list: each row its voice and length · ×speed (inner ring first), the selected one outlined; its M lamp
 *  lit when muted, dashed while a mute waits for the bar line, "S" while soloed. */
function renderLanes() {
  laneTabs.forEach((b, i) => {
    const li = b.parentElement, l = m.lanes[i]; li.hidden = !l; if (!l) return;
    const t = `${voiceLabel(l)} ${l.length}·×${RATIO_LABEL[l.ratioIndex]}`; if (b.textContent !== t) b.textContent = t;
    const q = muteQ.has(i);
    li.classList.toggle('sel', i === m.selected); li.classList.toggle('muted', !!l.muted); b.setAttribute('aria-pressed', i === m.selected);
    b.title = `select lane ${i + 1} (Alt+${i + 1})`; b.setAttribute('aria-label', `lane ${i + 1} ${voiceLabel(l)}`);
    const mb = laneMs[i]; mb.textContent = l.solo ? 'S' : 'M'; mb.classList.toggle('pend', q); mb.setAttribute('aria-pressed', l.muted ? 'true' : 'false');
    mb.setAttribute('aria-label', `mute lane ${i + 1}${l.solo ? ', solo' : ''}${q ? `, ${muteWord(i)} on the next bar` : ''}`);
    mb.title = q ? `lane ${i + 1}: ${muteWord(i)} on the next bar line` : `mute lane ${i + 1} · Shift+click or long-press = solo`;
  });
}
// ---- RD-5 the console's knob row: one page at a time, chosen by pages.js resolvePage (Nils's state table): rhythm =
// the Move's knobs 1–8, sound = Shift + knobs, step = a step's locks (the Move's hold-step knobs 1–7; RD-6 draws the
// rest of the step page). The gauges are the sheet's own, moved into the row (gauge.js bindRow): a page's knobs leave
// the sheet while the row shows them and go back when it doesn't. The mouse latches a page with its tab (or a cell's
// long-press: step); a Move hold or touch owns the row while it lasts (+ TOUCH_HOLD_MS); ⇧ held shows sound ----
// key ownership ("Who owns a key press?", by controlOwnsKey below), declared before the console's first render reads it
const KNOB_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']), keyFocused = new WeakSet();
let lastInput = 'pointer';
const RHYTHM_KEYS = ['length', 'euclid', 'rotation', 'ratio', 'swing', 'prob', 'tune'];   // the Move's knobs 1–7 (8 = tempo)
// RD-6: knob 8 on a step page = its condition, or its repeats while the Move holds the step with Shift (row8, pages.js)
const ROW_KEYS = { rhythm: [...RHYTHM_KEYS, 'tempo'], sound: SOUND_KEYS, step: [...LOCK_KEYS.slice(0, 7), 'cond'] };
const pageGauges = (pg, r8) => (pg === 'sound' ? SOUND_KEYS.map(k => sliders['snd:' + k]) : pg === 'step' ? [...LOCK_KEYS.slice(0, 7).map(k => sliders['lock:' + k]), sliders[r8 === 'repeats' ? 'lock:ratchet' : 'lock:cond']] : [...RHYTHM_KEYS.map(k => sliders[k]), sliders.tempo]);
// latch: the page the screen chose; step: the step a cell's long-press latched (on lane `lane`), back: where it came from
const knobPage = { latch: 'rhythm', back: 'rhythm', step: -1, lane: -1, shown: null, r8: null, r: null, forced: null, lost: null };   // forced: the lock editor before a Move look took it; lost: a knob the row took the focus from
const hands = { touch: new Set(), touchUntil: 0, loop: false, timer: 0 };   // the Move's encoders touched, the touch's tail (one timer), Loop held
const touchTail = () => { hands.touchUntil = performance.now() + TOUCH_HOLD_MS; clearTimeout(hands.timer); hands.timer = setTimeout(renderPage, TOUCH_HOLD_MS + 10); };
/** What the hands and the latch make of the row now (pages.js). A latched step goes with its lane, or a shorter loop. */
function pageNow() {
  const now = performance.now(), h = pages.held.size ? [...pages.held.values()][0] : null, look = pages.looked(now);
  if (knobPage.lane !== m.selected || knobPage.step >= m.lane.length) knobPage.step = -1;
  if (knobPage.latch === 'step' && knobPage.step < 0) knobPage.latch = knobPage.back;   // the step closed (Esc, another lane, a shorter loop)
  return resolvePage({ latch: knobPage.latch, latchStep: knobPage.step, back: knobPage.back, shift, kbdShift, held: h && { step: (look || h).step, looked: !!look }, touch: hands.touch.size > 0 || now < hands.touchUntil, loop: hands.loop });
}
/** The mouse's step page: a cell (or a planet) opened step i (-1 = closed). The Move's holds come and go over it. */
function latchStep(i) {
  if (i >= 0) { if (knobPage.latch !== 'step') knobPage.back = knobPage.latch; Object.assign(knobPage, { latch: 'step', step: i, lane: m.selected }); }
  else if (knobPage.latch === 'step') Object.assign(knobPage, { latch: knobPage.back, step: -1 });
  renderPage();
}
function renderPage() {
  const r = knobPage.r = pageNow(), lane = m.lane;
  // a Move hold that owns the step page borrows the lock editor for the held step (as the Move's knobs edit it); once the
  // row leaves the Move's look, edited or not, the editor goes back as it was: closed, or the mouse's own step page (r.own
  // false), so nothing stays selected that Esc can't close
  const look = r.row === 'step' && r.own;
  if (r.row === 'step' && r.step !== lockStep && r.step < lane.length) { if (look) knobPage.forced ??= { prev: lockStep }; else knobPage.forced = null; lockStep = r.step; renderSteps(); renderLocks(); }
  else if (!look && knobPage.forced) { lockStep = r.row === 'step' ? r.step : knobPage.forced.prev < lane.length ? knobPage.forced.prev : -1; knobPage.forced = null; renderSteps(); renderLocks(); }
  // a knob the pointer holds stays put: the row flips once it is let go (#knobs pointerup below)
  const pg = r.row, first = cellFirst();
  if ((pg !== knobPage.shown || r.row8 !== knobPage.r8) && !(knobPage.shown && pageGauges(knobPage.shown, knobPage.r8).some(g => g?.held))) {
    const fo = document.activeElement?.closest?.('.gauge') ? document.activeElement : null;   // a knob that moves loses the focus
    knobPage.shown = pg; knobPage.r8 = r.row8; bindRow([...$('knobs').children], pageGauges(pg, r.row8), pg === 'sound' ? 'pie' : pg === 'step' ? 'ring' : 'arc'); $('knobs').dataset.page = pg;
    if (fo && document.activeElement !== fo) { knobPage.lost = { el: fo, owned: keyFocused.has(fo) }; peekOff('focus'); }   // (a moved element gets no focusout)
  }
  lockPanelShown();
  // … and gets it back, with its keys, where it is drawn again (the row, the open sheet), unless the focus went elsewhere,
  // a click came, or Esc gave the keys back meanwhile (a key on the page, Space say, while the Move's Shift holds it away, doesn't)
  const lost = knobPage.lost, at = document.activeElement;
  if (lost && at && at !== document.body) knobPage.lost = null;
  else if (lost && lost.el.getClientRects().length) { knobPage.lost = null; focusAs(lost.el, lost.owned); }
  for (const t of PAGES) $('pg-' + t).setAttribute('aria-pressed', String(t === knobPage.shown));   // the tab of the page drawn
  $('pg-step').setAttribute('aria-disabled', String(lockStep < 0));
  const lh = `${m.selected + 1} · ${voiceLabel(lane)}${lane.muted ? ' · M' : ''}`; if ($('lh-lane').textContent !== lh) $('lh-lane').textContent = lh;
  $('lh-steps').textContent = `steps ${Math.min(first + 1, lane.length)}–${Math.min(first + STEP_BTNS, lane.length)} of ${lane.length}`;
  $('lh-page').textContent = r.word;
  const chip = $('move-chip'); chip.textContent = move.inControl ? r.chip : ''; chip.classList.toggle('own', r.own);   // only with a Move to name
  // RD-6: the step page's words (clear / more… / done) in the header, where "steps 1–16 of 16" was; the cells follow
  // what the hands make of them (steps, the step's 16 loops, or the slots while Loop is held)
  const onStep = r.row === 'step', noSteps = onStep || r.cells === 'slots';   // RD-9: the slots are not "steps 1–16 of 16"
  if ($('step-tools').hidden === onStep) $('step-tools').hidden = !onStep;
  if ($('lh-steps').hidden !== noSteps) $('lh-steps').hidden = noSteps;
  if (r.cells !== cellsMode || (r.cells === 'loops' && r.step !== cellsStep)) renderSteps();
  paintPeek();
  if (helpMoveUp()) drawHelpMove();   // RD-9: the "?" overlay's Move drawing follows the page under the hands
}
for (const t of ['rhythm', 'sound']) $('pg-' + t).onclick = () => { knobPage.latch = t; renderPage(); };
// the step tab: the step a cell's long-press (right-click, Alt+click) or a planet opened; none yet, it says how
$('pg-step').onclick = () => { if (lockStep < 0) return toast('long-press, right-click or Alt+click a cell for its step page', 2500); latchStep(lockStep); };
$('knobs').addEventListener('pointerup', () => setTimeout(renderPage), true);   // a held knob let go: a flip it held back happens now
// ⇧ held on the keyboard shows the sound page too (DECISION: "Move Shift, ⇧ held, or the sound tab"). Not where the
// focus has a Shift of its own: a text field, a knob (Shift + arrows = fine steps). And ⇧ with another key is a chord
// (Shift+Tab, + an arrow, + a letter), not a held ⇧: the row goes back before that key does anything, so Shift+Tab
// lands on the page it left
let kbdShift = false;
const setKbdShift = (on) => { if (kbdShift === on) return; kbdShift = on; renderPage(); };
addEventListener('keydown', (e) => {
  if (e.key !== 'Shift') { if (kbdShift) setKbdShift(false); return; }
  if (!e.repeat && !(e.target instanceof Element && e.target.closest('input, textarea, .gauge'))) setKbdShift(true);
}, true);
addEventListener('keyup', (e) => { if (e.key === 'Shift') setKbdShift(false); }); addEventListener('blur', () => setKbdShift(false));
addEventListener('pointerdown', () => { knobPage.lost = null; }, true);   // a click elsewhere too
/** A Move encoder (0–7) touched or let go: the row flips to the Move's page for the touch and TOUCH_HOLD_MS after it. */
function moveTouch(index, on) {
  if (on && slog) { performance.mark('peek-touch'); peek.mark = true; }   // A8 from the touch, the row's flip included
  if (on) hands.touch.add(index); else { hands.touch.delete(index); touchTail(); }
  renderPage(); if (on) peekAt(index, 'touch'); else peekOff('touch');
  sceneHand('move' + index, on ? moveKey(index) : null);
}
// ---- RD-6 the ring answers the hand: the key of the knob a hand is on (a Move encoder touched or turned, a drag on any
// knob, the console's or the sheet's) goes to the scene, which shows on the selected ring what the change did while it
// lasts and HAND_MS after (scene.js setHand). Read-only: nothing on the canvas becomes clickable for it ----
const handOn = new Map();   // source ('move3', 'turn', 'drag') → the key its knob edits ('rotation', 'snd:decay', 'lock:tune', …)
function sceneHand(src, k) { if (k) handOn.set(src, k); else handOn.delete(src); const ks = [...handOn.values()]; scene.setHand(ks.length ? { li: m.selected, k: ks[ks.length - 1] } : null); }
/** What Move encoder `index` edits now (the page its knobs are on: a held step's locks, Shift's sound, else the rhythm). */
const moveKey = (index) => { const mv = knobPage.r?.move ?? 'rhythm', k = ROW_KEYS[mv][index]; return mv === 'step' && k !== 'cond' ? 'lock:' + k : mv === 'sound' ? 'snd:' + k : k; };
addEventListener('pointerdown', (e) => { const g = e.target instanceof Element && e.target.closest('.gauge'); if (g) sceneHand('drag', Object.keys(sliders).find(k => sliders[k]?.el === g) || 'knob'); }, true);
for (const t of ['pointerup', 'pointercancel']) addEventListener(t, () => { if (handOn.has('drag')) sceneHand('drag', null); }, true);
addEventListener('blur', (e) => { if (e.target === window && handOn.has('drag')) sceneHand('drag', null); });   // a release outside the window never comes
// ---- RD-5 the peek (left column): the touched knob's number (64 px, weight 300), its name and what it means in plain
// words. Only on a Move encoder touch (or turn), a knob drag, or keyboard focus on a knob (magnifier users): never on
// hover. It stays PEEK_MS after the hand lets go. A8: with ?setlog, a touch marks `peek-touch` (moveTouch) and the task
// after the frame that paints the peek measures `peek` (performance entries) ----
const PEEK_MS = TOUCH_HOLD_MS, peek = { slot: -1, el: null, why: new Set(), timer: 0, mark: false };   // el: the knob a drag or the focus opened it for
const PEEK_SAYS = {
  length: v => `${v} step${v === 1 ? '' : 's'} a loop`, euclid: v => v ? `${v} hit${v === 1 ? '' : 's'}, spread evenly` : 'no hits spread',
  rotation: v => v ? `the hits start ${v} step${v === 1 ? '' : 's'} later` : 'not shifted', ratio: v => `${RATIO_LABEL[v]} step${RATIO_LABEL[v] === '1' ? '' : 's'} a beat`,
  swing: v => v ? `every other step ${v}% late` : 'straight', prob: v => `plays ${v} of 100 loops`, tune: v => tuneSay(v), tempo: v => `${v} beats a minute`,
};
/** A Move touch or turn peeks a slot: whatever that encoder edits now (Shift down mid-touch: the sound knob). A drag or
 *  the focus peeks its own knob (el): when the row lets that knob go, the peek goes with it. */
function peekAt(slot, why, el = null) { clearTimeout(peek.timer); peek.slot = slot; peek.el = el; peek.why.add(why); paintPeek(); }
function peekOff(why) { peek.why.delete(why); if (peek.why.size) return; clearTimeout(peek.timer); peek.timer = setTimeout(() => { if (!peek.why.size) { peek.slot = -1; peek.el = null; paintPeek(); } }, PEEK_MS); }
function paintPeek() {
  const kn = $('knobs'), el = $('peek'), g = peek.el ? (peek.el.parentElement?.parentElement === kn ? peek.el : null) : peek.slot >= 0 ? kn.children[peek.slot]?.firstElementChild : null;
  // RD-6: the touched (or dragged, or turned) knob gets a lane-colour plate while the peek shows for it (not for focus alone)
  const plate = g && !(peek.why.size === 1 && peek.why.has('focus')) ? g.parentElement : null;
  for (const s of kn.children) if (s.classList.contains('plate') !== (s === plate)) s.classList.toggle('plate', s === plate);
  if (!g) { if (!el.hidden) el.hidden = true; return; }
  const slot = [...kn.children].indexOf(g.parentElement), k = ROW_KEYS[knobPage.shown]?.[slot], v = +g.getAttribute('aria-valuenow'), label = g.querySelector('.g-label').textContent;
  const put = (id, t) => { const e = $(id); if (e.textContent !== t) e.textContent = t; };   // it repaints with every move of its knob
  put('peek-n', g.querySelector('.g-val').textContent);
  put('peek-name', `knob ${slot + 1} · ${label} · ${voiceLabel(m.lane)}`);
  put('peek-mean', PEEK_SAYS[k]?.(v) ?? `${label} ${g.getAttribute('aria-valuetext')}`);
  el.hidden = false;
  if (peek.mark) { peek.mark = false; requestAnimationFrame(() => setTimeout(() => performance.measure('peek', 'peek-touch'))); }   // after the frame that paints it
}
{
  const kn = $('knobs'), slotOf = (el) => [...kn.children].indexOf(el.closest('#knobs > *'));
  kn.addEventListener('pointerdown', (e) => { const g = e.target instanceof Element && e.target.closest('.gauge'); if (g) peekAt(slotOf(g), 'drag', g); });
  for (const t of ['pointerup', 'pointercancel']) kn.addEventListener(t, () => peekOff('drag'));
  kn.addEventListener('focusin', (e) => { const g = e.target.closest('.gauge'); if (lastInput === 'key' && g) peekAt(slotOf(g), 'focus', g); });
  kn.addEventListener('focusout', () => peekOff('focus'));
  // the peek follows its knob whatever moves it (a turn, the hand's value drawn each frame, a curve, the keys)
  new MutationObserver(() => { if (peek.slot >= 0) paintPeek(); }).observe(kn, { subtree: true, childList: true, characterData: true });
}
/** The first of the 16 steps the cells show: the 16 holding the step being edited, else the Move's step buttons' (the
 *  16 holding the pad page: they follow the playhead, or the page Back pinned). */
const cellFirst = () => (lockStep >= 0 ? STEP_BTNS * Math.floor(lockStep / STEP_BTNS) : pages.stepFirst(m.lane, playing));
/** The MIDI drawer names the note of every stroke the lanes can play now (strokeNotes; it follows voices and notes). */
function renderStrokeNotes() {
  const rows = strokeNotes(pmidi.lanes), now = m.lanes.flatMap((l, i) => ARTICS[l.voice] ? [`lane ${i + 1} ${voiceLabel(l)}: ${ARTICS[l.voice].map((s, a) => `${s} ${rows[i][a]}`).join(' · ')}`] : []);
  $('midi-artic-map').textContent = now.length ? `Now: ${now.join('; ')}.` : '';
}
function renderVoiceOptions() {
  const vs = $('voice-select'), want = m.lane.sample ? `sample:${m.lane.sample.id}` : 'none';
  if (vs.dataset.sample !== want) { vs.querySelector('option[value=sample]')?.remove(); if (m.lane.sample) vs.add(new Option(voiceLabel({ voice: 'sample', sample: m.lane.sample }), 'sample'), 0); vs.dataset.sample = want; }
  vs.value = m.lane.voice;
}
function renderLaneMix() {
  const lane = m.lane; $('btn-solo').classList.toggle('armed', lane.solo);
  const mb = $('btn-mute'); mb.classList.toggle('armed', lane.muted); mb.setAttribute('aria-pressed', lane.muted); mb.textContent = muteQ.has(m.selected) ? `${muteQ.target(m.selected) ? 'mute' : 'unmute'} ⇥ bar` : 'mute';
  ui.choke.setOptions([[-1, 'nothing'], ...m.lanes.map((l, i) => [i, `${i + 1} · ${voiceLabel(l)}`, `cut lane ${i + 1} when this lane hits`])]); ui.choke.disable(m.selected); ui.choke.set(lane.choke);
  [...ui.choke.el.children].forEach((b, k) => { if (k) b.style.setProperty('--chip', LANE_HEX[k - 1]); });
  $('sample-name').textContent = lane.sample ? `${lane.sample.name}${lane.sliceCount() ? ` · ${lane.sliceCount()} slices, a slice per step` : ''}${lane.voice === 'sample' ? '' : ' (pick it in voice)'}` : 'none loaded';
  renderTrim();
}
function nudge(k, delta) { const p = PARAMS.find(x => x.k === k); p.set(m.lane, p.get(m.lane) + delta); sync(); questEvent({ type: 'edit', lane: m.selected, k }); }
// Step buttons are built once and repainted in place: a rebuild would drop the keyboard focus on every edit, and a
// long press that opens the lock panel would leave the finger on a detached button.
const stepBtns = [];
function buildSteps() {
  const el = $('stepsui');
  for (let i = 0; i < MAX_STEPS; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'st';
    // RD-6: what a click does follows what the cells show (pages.js cellAction): a step cycles, a loop dot opens that
    // cell's step page (switching the step), a slot (Loop held on the Move) does nothing
    b.onclick = (e) => { const lane = m.lane, act = cellAction(cellsMode, i, lane.length, e.altKey); if (act === 'open') return e.altKey ? editLocks(i) : openStep(i); if (act === 'none') return; const si = lane.stepIndex(i); if (e.shiftKey) lane.toggleAccent(si); else lane.cycleStep(si); sync(); };
    longPress(b, () => { if (cellAction(cellsMode, i, m.lane.length, true) === 'open') openStep(i); });
    el.appendChild(b); stepBtns.push(b);
  }
}
/** The step of the selected lane sounding now, lit on the strip while playing (only the old and new button change). */
let playheadAt = -1, cellsAt = 0, cellsMode = 'steps', cellsStep = -1, cellsLoop = -1;   // cellsAt: the first step the cells show; cellsMode: steps | loops | slots (renderSteps)
function paintPlayhead() {
  if (cellsMode === 'loops' && playing && m.lane.loopN !== cellsLoop) return renderSteps();   // RD-6: the "now" ring moves on every loop
  if (cellsMode !== 'steps') return;   // dots have no playhead
  const i = playing && m.lane.shown != null && m.lane.shown < m.lane.length ? m.lane.shown : -1; if (i === playheadAt) return;
  if (cellFirst() !== cellsAt) { renderSteps(); renderPage(); return; }   // RD-5: the cells follow the Move's step page (a 32-step lane's second half)
  stepBtns[playheadAt]?.classList.remove('ph'); stepBtns[i]?.classList.add('ph'); playheadAt = i;
}
function renderSteps() {
  const lane = m.lane; playheadAt = -1;
  if (lockStep >= lane.length) lockStep = -1;   // a shorter loop closes the lock panel: no step stays "expanded"
  const first = cellsAt = cellFirst(), hs = new Set([...pages.held.values()].map(h => h.step));   // RD-5: 16 cells, the Move's 16 step buttons (L1's steps 17–32 on their page); a Move step held is outlined
  const r = knobPage.r, mode = cellsMode = r?.cells === 'slots' ? 'slots' : r?.cells === 'loops' && r.step >= 0 && r.step < lane.length ? 'loops' : 'steps';
  cellsStep = mode === 'loops' ? r.step : -1; cellsLoop = lane.loopN;
  const su = $('stepsui'), name = mode === 'loops' ? `the loops of step ${r.step + 1}` : mode === 'slots' ? 'slots' : 'steps';
  if (su.dataset.cells !== mode) su.dataset.cells = mode; if (su.getAttribute('aria-label') !== name) su.setAttribute('aria-label', name);
  if (mode !== 'steps') return renderDots(mode, lane, first, hs);
  stepBtns.forEach((b, i) => {
    const inLoop = i < lane.length, hit = inLoop && lane.hitAt(i), acc = hit && lane.accentAt(i), lk = inLoop && lane.shownLock(i), tg = inLoop && lane.trigAt(i), gh = hit && lane.tierAt(lane.stepIndex(i)) === 'ghost', mk = inLoop && lane.maskedOut(lane.stepIndex(i));
    b.className = `st${!inLoop ? ' off' : hit ? (acc ? ' acc' : gh ? ' on gh' : ' on') : ''}${mk ? ' mk' : ''}${lk ? ' lk' : ''}${tg ? ' tg' : ''}${i === lockStep ? ' sel' : ''}${hs.has(i) ? ' held' : ''}${i < first || i >= first + STEP_BTNS ? ' out' : ''}`; b.title = STEP_TITLE;
    const tgText = tg ? `${tg.cond !== 'always' ? tg.cond : ''}${tg.ratchet > 1 ? ` ×${tg.ratchet}` : ''}`.trim() : '';
    if (tgText) b.dataset.tg = tgText; else delete b.dataset.tg;
    b.disabled = !inLoop; b.setAttribute('aria-pressed', !!hit);
    b.setAttribute('aria-label', `step ${i + 1}, ${!inLoop ? 'outside the loop' : hit ? (acc ? 'on, accent' : gh ? 'on, ghost' : 'on') : mk ? 'off (silenced by the euclid mask)' : 'off'}${lk ? ', locked' : ''}${tg && tg.cond !== 'always' ? `, plays ${tg.cond}` : ''}${tg?.ratchet > 1 ? `, ${tg.ratchet} repeats` : ''}`);
    if (i === lockStep) b.setAttribute('aria-expanded', 'true'); else b.removeAttribute('aria-expanded');
  });
  paintPlayhead();
}
const STEP_TITLE = 'tap = off → on → accent → ghost → off · long-press, right-click or Alt+click = its step page (locks, condition, repeats) · Shift+click = accent only';
/**
 * RD-6 the cells as dots. On a step page: the 16 loops of its step (pages.js stepLoops, the Move's LEDs while a step is
 * looked at): lit = it plays on that loop, dashed = it depends on fill or the step before, a ring = the loop playing now;
 * a click opens that cell's step page (a dot is never an edit). While Loop is held on the Move: the 16 slots (lit =
 * filled, a ring = playing, dashed = queued, outlined = picked for a chain). A Move step held stays outlined.
 */
function renderDots(mode, lane, first, hs) {
  const st = mode === 'loops' ? knobPage.r.step : -1, si = st >= 0 ? lane.stepIndex(st) : 0;
  const L = st >= 0 ? stepLoops({ cond: lane.trigs[si]?.cond, on: lane.played(si), loopN: lane.loopN, playing }) : null;
  stepBtns.forEach((b, i) => {
    const k = i - first; let cls = 'st dot', label = '';
    if (k < 0 || k >= STEP_BTNS) cls += ' out';
    else if (L) { const p = L.loops[k]; cls += p === true ? ' lp-on' : p === null ? ' lp-cue' : ''; if (k === L.now) cls += ' lp-now'; label = `loop ${L.from + k + 1} of step ${st + 1}: ${p === true ? 'plays' : p === null ? 'depends on fill or the step before' : 'rests'}${k === L.now ? ', playing now' : ''}`; }
    else { const f = bank.filled(k), cur = bank.current === k, nx = bank.pending === k, pk = chainPick.includes(k); cls += `${f ? ' lp-on' : ''}${cur ? ' lp-now' : ''}${nx ? ' lp-cue' : ''}${pk ? ' lp-pick' : ''}`; label = `slot ${k + 1}: ${cur ? 'playing' : nx ? 'queued' : f ? 'saved' : 'empty'}${pk ? ', picked for a chain' : ''}`; }
    if (hs.has(i)) cls += ' held';
    b.className = cls; delete b.dataset.tg; b.disabled = false; b.removeAttribute('aria-pressed'); b.removeAttribute('aria-expanded'); b.setAttribute('aria-label', label);
    b.title = L ? (i < lane.length ? `${label} · click: step ${i + 1}'s page` : label) : label;
  });
}

// ---- per-step locks: hold a step on the Move and turn knobs 1–7, or Alt/right-click a step here ----
let lockStep = -1, articFor = null;   // visible step the lock panel edits (-1 = closed); the voice the stroke chooser shows
const LOCK_UI = {
  tune: { label: 'tune', min: -100, max: 100, fmt: v => (v > 0 ? '+' : '') + v, say: tuneSay, base: l => l.tune },
  prob: { label: 'probability', fmt: v => v + '%', base: l => l.prob },
  vel: { label: 'velocity', fmt: v => v + '%', base: () => 0.7 },
  decay: { label: 'decay', base: l => l.sound.decay }, tone: { label: 'tone', base: l => l.sound.tone },
  snap: { label: 'snap', base: l => l.sound.snap }, color: { label: 'color', base: l => l.sound.color },
  nudge: { label: 'nudge', min: -50, max: 50, fmt: v => (v > 0 ? '+' : '') + v + '%', say: v => v ? `${Math.abs(v)}% of a step ${v > 0 ? 'late' : 'early'}` : 'on the grid', base: () => 0 },
};
const lockValue = (lane, i, k) => lane.lockAt(i)?.[k] ?? LOCK_UI[k].base(lane);
// RD-6 one lock editor: the console's step page (latchStep). A cell's long-press (right-click, Alt+click) or a planet's
// opens it, another cell or planet switches it; done, Esc or the same Alt+click closes it. It no longer opens the sheet:
// "more…" does, for the locks the 8 knobs don't hold (nudge, stroke, slice, start / end, direction, the condition's
// loop and the repeats' shape), the old lock panel in Sheet → lane
function openStep(i) { if (i < 0 || i >= m.lane.length || (lockStep !== i && locksTucked())) return; lockStep = i; renderSteps(); renderLocks(); latchStep(i); }
function editLocks(i) { if (lockStep === i) { if (knobPage.forced) knobPage.forced.prev = -1; lockStep = -1; renderSteps(); renderLocks(); latchStep(-1); } else openStep(i); }   // closed under a Move hold: its release gives back nothing either
/** After a lock / condition / repeat edit: redraw the steps, record it, and refresh the readout (a condition or a
 *  prob lock can change the cycle). A Move knob turned on a held step is a look (RD-5: the step page). */
function stepEdited() { renderSteps(); renderLocks(); renderPage(); save(); paintLeds(); readout(); }
/** A Move hold edits step i (knobs 1–7, knob 8, a slice, the jog, its push): it borrows the lock editor as a look does
 *  (renderPage), so letting go gives it back, edited or not, also when the edit came before the look (inside LOOK_MS). */
function borrowStep(i) { if (lockStep === i) return; knobPage.forced ??= { prev: lockStep }; lockStep = i; }
/** Lock parameter k on the step the lock panel edits to v (null = unlock), then audition it and record it. */
function lockHere(k, v) {
  if (lockStep < 0) return; const lane = m.lane, i = lane.stepIndex(lockStep); if (v == null) lane.unlock(i, k); else lane.setLock(i, k, v);
  if (k === 'rev') ensureSample(lane);   // the reversed copies, made before the step plays
  auditionLock(); stepEdited();
}
/** S3: a start / end gauge in % of the sample (the lane's row and the lock panel); onChange gets 0..1. */
function trimGauge(k, onChange) { return makeGauge({ label: k, value: k === 'end' ? 100 : 0, fmt: v => v + '%', title: INFO.trim, onChange: (v) => onChange(v / 100) }); }
function buildLockGauges() {
  // RD-6 one lock editor: the step page's knobs 1–7 (tune … color) wait in a hidden holder when the row doesn't show them
  // (gauge.js bindRow sends them back there), never in "more…"; nudge, the one lock knob the row has no slot for, is
  // "more…"'s
  const el = $('lock-gauges'), row = $('step-knobs'), ROW_LOCKS = ROW_KEYS.step.slice(0, 7); el.innerHTML = ''; row.replaceChildren();
  for (const k of LOCK_KEYS) {
    // A3: recording, a lock knob writes onto the steps that play (a gesture), not the one step the panel shows
    const u = LOCK_UI[k]; const g = makeGauge({ label: u.label, min: u.min ?? 0, max: u.max ?? 100, value: 0, fmt: u.fmt, say: u.say || u.fmt || ((v) => v + '%'), title: INFO['lock ' + k] || INFO[k] || '', color: 'var(--signal-cyan)',
      onChange: (v) => { if (handTurn('lock', k, v / 100) === undefined || lockStep < 0) return; const lane = m.lane; lane.setLock(lane.stepIndex(lockStep), k, v / 100); auditionLock(); stepEdited(); },
      onStart: (v) => handHold('lock', k, v / 100), onEnd: () => handLetGo('lock', k) });
    sliders['lock:' + k] = g; (ROW_LOCKS.includes(k) ? row : el).appendChild(g.el);
  }
  const setTrig = (patch) => { if (lockStep < 0) return; m.lane.setTrig(m.lane.stepIndex(lockStep), patch); auditionLock(); stepEdited(); };
  // RD-6 the step page's knob 8: the condition (the Move's hold step + knob 8, the same order), or the repeats (+ Shift).
  // They live in the step page only (their home is a hidden holder); "more…" has the condition's loops and the repeats' shape
  const COND_SHORT = { always: 'all', fill: 'fill', 'not fill': 'no fill', first: '1st', 'not first': 'not 1st', pre: 'pre', 'not pre': 'not pre' };
  const condSay = (c) => ({ always: 'every loop', fill: 'only with fill', 'not fill': 'only without fill', first: 'only the first loop', 'not first': 'after the first loop', pre: 'if the last condition passed', 'not pre': 'if the last condition failed' })[c] ?? `loop ${c.replace(':', ' of every ')}`;
  sliders['lock:cond'] = makeGauge({ label: 'condition', min: 0, max: CONDS.length - 1, value: 0, fmt: v => COND_SHORT[CONDS[v]] ?? CONDS[v], say: v => condSay(CONDS[v]), title: INFO.condition, onChange: (v) => setTrig({ cond: CONDS[v] }) });
  sliders['lock:ratchet'] = makeGauge({ label: 'repeats', min: 1, max: MAX_RATCHET, value: 1, fmt: v => '×' + v, say: v => v === 1 ? 'one hit' : `${v} hits inside the step`, title: 'Repeat the hit inside its step', onChange: (v) => setTrig({ ratchet: v }) });
  row.append(sliders['lock:cond'].el, sliders['lock:ratchet'].el);
  $('st-clear').onclick = () => { if (lockStep < 0) return; const i = m.lane.stepIndex(lockStep); m.lane.clearLocks(i); m.lane.trigs[i] = null; stepEdited(); };
  $('st-more').onclick = () => { if (lockStep >= 0) reveal('lockpanel').scrollIntoView({ block: 'nearest' }); };
  $('st-done').onclick = () => { if (lockStep >= 0 && knobPage.latch === 'step') editLocks(lockStep); else latchStep(-1); };
  // condition = "every N loops" + which loop (dots), or one of the fill / first specials
  ui.condEvery = mount('cond-every', segmented({ options: [[1, 'always'], [2, '1 in 2'], [3, '1 in 3'], [4, '1 in 4']], value: 1, onChange: (b) => setTrig({ cond: b === 1 ? 'always' : `1:${b}` }) }));
  ui.condSpecial = mount('cond-special', segmented({ options: [['fill', 'with fill', INFO.condition], ['not fill', 'without fill'], ['first', '1st loop'], ['not first', 'after 1st'], ['pre', 'if last passed', INFO.pre], ['not pre', 'if last failed', INFO.pre]], value: null, chips: true,
    onChange: (c) => setTrig({ cond: m.lane.trigAt(lockStep)?.cond === c ? 'always' : c }) }));
  ui.ratchet = mount('trig-ratchet', segmented({ options: Array.from({ length: MAX_RATCHET }, (_, k) => k + 1).map(r => [r, r === 1 ? '1' : `×${r}`, r === 1 ? 'one hit' : `${r} hits inside the step`]), value: 1, onChange: (r) => setTrig({ ratchet: r }) }));
  ui.fade = mount('trig-fade', toggleChip({ label: 'fade repeats', title: 'Each repeat quieter', onChange: (v) => setTrig({ fade: v }) }));
  // V4: how the repeats are spaced, and a pitch ramp across them
  ui.curve = mount('trig-curve', segmented({ options: [['even', 'even', INFO['ratchet curve']], ['up', 'speed up', INFO['ratchet curve']], ['down', 'slow down', INFO['ratchet curve']]], value: 'even', onChange: (c) => setTrig({ curve: c }) }));
  // the value is 12ths of the tune range: shown in the lane voice's own semitones (×2 on voices tuned ±24)
  const rampSt = (v) => (v * (TUNE_SEMIS[m.lane.voice] || 12)) / 12;
  sliders.ramp = makeGauge({ label: 'pitch ramp', min: -12, max: 12, value: 0, fmt: v => (v > 0 ? '+' : '') + rampSt(v), say: v => `${rampSt(v)} semitones`, title: INFO['ratchet ramp'], color: 'var(--signal-cyan)', onChange: (v) => setTrig({ ramp: v / 12 }) });
  $('trig-ramp').replaceChildren(sliders.ramp.el);
  // L3 stroke: 'lane' = no artic lock (the lane's own sound); the options follow the lane's voice (renderLocks)
  ui.artic = mount('lock-artic', segmented({ options: [], value: 'lane', onChange: (v) => lockHere('artic', v === 'lane' ? null : v) }));
  // S3 on a sample lane: this step's start / end and direction ('lane' = no lock: the lane's own)
  $('lock-trim').innerHTML = '';
  for (const k of ['start', 'end']) { const g = trimGauge(k, (v) => lockHere(k, v)); sliders['lock:' + k] = g; $('lock-trim').appendChild(g.el); }
  ui.lockRev = mount('lock-rev', segmented({ options: [['lane', 'lane', 'no lock: as the lane plays'], [0, 'forwards'], [1, 'backwards']], value: 'lane', onChange: (v) => lockHere('rev', v === 'lane' ? null : v) }));
}
/** "slap" for an artic lock, "slice 3" / "backwards" for the sample locks, the key name for the rest (the lock panel title). */
const lockName = (lane, k, lk) => k === 'artic' ? ARTICS[lane.voice]?.[articAt(lane.voice, lk)] ?? `stroke (not on ${voiceLabel(lane)})`   // kept from another voice: plays the lane sound here
  : k === 'slice' ? `slice ${lk.slice + 1}` : k === 'rev' ? (lk.rev ? 'backwards' : 'forwards') : k;
/** A waveform thumbnail of channel data `d` on canvas `c`, a peak per pixel column (slice tiles, the slice picker). */
function drawWave(c, d) {
  const g = c.getContext('2d'), w = c.width, h = c.height, step = Math.max(1, Math.floor(d.length / w)); g.clearRect(0, 0, w, h); g.fillStyle = '#67e8f9';
  for (let x = 0; x < w; x++) { let pk = 0; for (let j = x * step; j < (x + 1) * step && j < d.length; j += 4) pk = Math.max(pk, Math.abs(d[j])); const bh = Math.max(1, pk * (h - 2)); g.fillRect(x, (h - bh) / 2, 1, bh); }
}
/** A slice tile: its waveform (if the audio is there) and its number, so you pick by shape, not by number. */
function sliceTile(d, label, title, onclick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'slice'; b.title = title; b.onclick = onclick;
  const c = document.createElement('canvas'); c.width = 64; c.height = 26; if (d) drawWave(c, d); const n = document.createElement('span'); n.textContent = label; b.append(c, n); return b;
}
/** S1 slice picker: a tile per slice of the lane's set and a "step" tile (no lock: step i plays slice i mod N). Rebuilt
 *  only when the set or its loaded audio changes, so a click never lands on a detached tile; the lit tile follows. */
let slicesFor = '';
function renderSliceLock(lane, lk) {
  const el = $('lock-slices'), n = lane.sliceCount(); $('lock-slice-row').hidden = !n; if (!n) return;
  const ids = lane.sample.slices, key = ids.map(id => id + (sampleBufs.has(id) ? '+' : '')).join();
  if (slicesFor !== key) {
    slicesFor = key; el.innerHTML = '';
    const pick = (s) => () => lockHere('slice', s);
    el.appendChild(sliceTile(null, 'step', 'no slice lock: step N plays slice N of the set (wrapping round)', pick(null)));
    ids.forEach((id, k) => el.appendChild(sliceTile(sampleBufs.get(id)?.getChannelData(0), k + 1, `this step plays slice ${k + 1}`, pick(k))));
    if (ids.some(id => !sampleBufs.has(id))) ensureSample(lane).then(() => { if (lockStep >= 0) renderLocks(); });
  }
  const si = lane.stepIndex(lockStep), cur = lane.sliceAt(si, lk);
  [...el.children].forEach((b, k) => { const on = k ? lk.slice != null && cur === k - 1 : lk.slice == null; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.classList.toggle('dflt', k > 0 && lk.slice == null && cur === k - 1); });
}
/** RD-6 one lock editor: the old lock panel (Sheet → lane) is only "more…", the rest of the open step's locks (never the
 *  page's knobs: their home is the hidden #step-knobs). A step is open while lockStep ≥ 0: the step page shown or
 *  latched, a Move hold borrowing it, or the step tab's step after another tab; the panel, the step tab and Esc
 *  (escState) all read that one rule, and Esc closes it. */
function lockPanelShown() { const lp = $('lockpanel'), hide = lockStep < 0; if (lp.hidden !== hide) lp.hidden = hide; }
function renderLocks() {   // always after renderSteps, which closes a step a shorter loop left out
  const lane = m.lane; lockPanelShown(); if (lockStep < 0) return;   // the values even while hidden: the row may show them next
  const lk = lane.lockAt(lockStep) || {}, keys = Object.keys(lk);
  renderTrig(lane.trigAt(lockStep));
  $('lock-title').textContent = `step ${lockStep + 1} · more · ${keys.length ? 'locked: ' + keys.map(k => lockName(lane, k, lk)).join(', ') : 'no locks yet (dashed = the lane value)'}`;
  const arts = ARTICS[lane.voice]; $('artic-wrap').hidden = !arts;   // a sample lane has none
  if (arts) { if (articFor !== lane.voice) { articFor = lane.voice; ui.artic.setOptions([['lane', 'lane sound', 'no stroke lock: the lane\'s own sound'], ...arts.map((n, a) => [a, n])]); } ui.artic.set(articAt(lane.voice, lk) ?? 'lane'); }   // rebuilt only for a new voice: a click never lands on a detached button
  // RD-2: in the lane's ink, solid where this step is locked, dotted where it plays the lane's value (a dim colour sank
  // under the knob track once the track became an edge)
  const lockLook = (g, k) => { g.setColor(LANE_HEX[m.selected]); g.el.classList.toggle('follows', lk[k] == null); };
  for (const k of LOCK_KEYS) { const g = sliders['lock:' + k]; g.set(Math.round(lockValue(lane, lockStep, k) * 100)); lockLook(g, k); }
  const tg = lane.trigAt(lockStep), cg = sliders['lock:cond'], rg = sliders['lock:ratchet'];   // knob 8: "always" and one hit follow the lane
  cg.set(Math.max(0, CONDS.indexOf(tg?.cond || 'always'))); rg.set(tg?.ratchet || 1);
  for (const [g, f] of [[cg, !tg || tg.cond === 'always'], [rg, !(tg?.ratchet > 1)]]) { g.setColor(LANE_HEX[m.selected]); g.el.classList.toggle('follows', f); }
  const smp = lane.voice === 'sample' && !!lane.sample; $('lock-sample').hidden = !smp;   // S1 / S3
  if (smp) {
    renderSliceLock(lane, lk); const tr = lane.trimAt(lk);
    for (const k of ['start', 'end']) { const g = sliders['lock:' + k]; g.set(Math.round(tr[k] * 100)); lockLook(g, k); }
    ui.lockRev.set(lk.rev ?? 'lane');
  }
}
/** Condition picker state from a step's trig: 'a:b' → "1 in b" + dot a lit; specials light their chip. */
function renderTrig(tg) {
  const cond = tg?.cond || 'always', ab = /^(\d):(\d)$/.exec(cond), b = ab ? +ab[2] : cond === 'always' ? 1 : null, a = ab ? +ab[1] : 1;
  ui.condEvery.set(b); ui.condSpecial.set(ab || cond === 'always' ? null : cond); ui.ratchet.set(tg?.ratchet || 1); ui.fade.set(!!tg?.fade); ui.curve.set(tg?.curve || 'even'); sliders.ramp.set(Math.round((tg?.ramp || 0) * 12)); $('trig-shape').hidden = !(tg?.ratchet > 1);
  const dots = $('cond-dots'); dots.innerHTML = ''; $('cond-dots-wrap').hidden = !(b > 1);
  for (let k = 1; k <= (b || 0); k++) { const d = document.createElement('button'); d.type = 'button'; d.className = `ldot${k === a ? ' on' : ''}`; d.textContent = k; d.title = `play on loop ${k} of every ${b}`; d.style.setProperty('--chip', LANE_HEX[m.selected]); d.onclick = () => { m.lane.setTrig(m.lane.stepIndex(lockStep), { cond: `${k}:${b}` }); auditionLock(); stepEdited(); }; dots.appendChild(d); }
  $('cond-text').textContent = ab ? `plays on loop ${a} of every ${b}${b > 1 ? ` (${[0, 1, 2].map(n => a + n * b).join(', ')}…)` : ''}` : { always: 'plays every loop', fill: 'plays only while Fill is held', 'not fill': 'rests while Fill is held', first: 'plays only on the first loop after Play', 'not first': 'rests on the first loop, then plays', pre: 'plays when the last step with a condition on this lane passed it (PRE)', 'not pre': 'plays when the last step with a condition on this lane failed it (not PRE)' }[cond];
}
/** Play visible step i of a lane as it will sound (its accent, locks and repeats, with their spacing, pitch ramp and
 *  fade): the lock panel's audition and a tap on the canvas (I1). Only while stopped, like every audition: an extra hit
 *  on a playing lane's voice would cut the note already queued for its next step. */
function auditionStep(lane, i) {
  if (!awake || playing) return; const tg = lane.trigAt(i), n = tg?.ratchet || 1, lk = lane.lockAt(i), acc = lane.accentAt(i), v = hitVel(acc, lk);
  const at = ratchetTimes(n, tg?.curve), g = ratchetGains(n, tg?.curve), t0 = T.now();   // one start: the repeats keep their spacing
  for (let k = 0; k < n; k++) hitSound(lane, t0 + at[k] * 0.18, acc && !k, tuneLock(lane, lk, n > 1 ? (tg?.ramp || 0) * k / (n - 1) : 0), (tg?.fade ? v * Math.pow(0.72, k) : v) * g[k], kit, lane.sliceAt(lane.stepIndex(i), lk));
}
function auditionLock() { if (lockStep >= 0) auditionStep(m.lane, lockStep); }

// ---- pattern slots & chains ----
// Called from the master clock (fromClock): the model and the voices change now, so this tick already plays the new
// state, but the DOM rebuild, JSON, localStorage and undo commit wait until the clock callback has returned.
// A microtask, not Draw.schedule: Draw drops callbacks that come late (hidden tab), and these must not be lost.
// What the machine changes on its own is not announced to screen readers (hush): only what you touch is.
const offClock = (fromClock, fn) => fromClock ? queueMicrotask(() => { hush = true; try { fn(); } finally { hush = false; } }) : fn();
function loadSlot(i, fromClock = false) {
  gestEnd(true, fromClock);   // A3: a gesture keeps what it wrote on the pattern it played (one undo step), then the slot comes in
  m.assign(bank.get(i), { selected: m.selected }); rebuildVoices();
  evoSnap = bank.get(i); evoCount = 0; lockStep = -1; offClock(fromClock, () => { loadNext = true; sync(); renderSlots(); renderLanesEvolve(); });
}
/** L2: 4 or 6 lanes, an edit of this pattern (undo brings dropped lanes back); a slot, a setup or a link keeps its own count. */
function setLaneCount(n) {
  if (laneCountOf(n) !== m.lanes.length) gestEnd(true);   // A3: its lane may leave the pattern
  const was = m.lanes.length; m.setLaneCount(n); if (m.lanes.length === was) return;
  rebuildVoices(); lockStep = -1; sync(); renderLanesEvolve();
}
function saveSlot(i) { slog?.act('slot.save', null, i + 1); bank.save(i, m.toJSON()); evoSnap = m.snapshot(); evoCount = 0; renderSlots(); paintLeds(); readout(); questEvent({ type: 'slot-save', slot: i }); }
/** Stopped: load at once. Playing: queue for the next boundary (now / bar / cycle). */
function recallSlot(i) { slog?.begin(); const was = bank.current; if (!bank.recall(i)) return; if (!playing) { bank.take(i); loadSlot(i); } renderSlots(); readout(); paintLeds(); slog?.act('slot', was + 1 || null, i + 1, { queued: playing, absorb: true }); }
function chainSlots(list) { slog?.begin(); const was = slog && bank.chain.map(i => i + 1); bank.setChain(list); if (!playing && bank.chain.length) { bank.take(bank.chain[0]); loadSlot(bank.chain[0]); } renderSlots(); readout(); paintLeds(); slog?.act('chain', was, list.map(i => i + 1), { absorb: true }); }
// Slot buttons are built once (a clock-driven slot switch repaints them mid-press). A long press (or right-click)
// opens a small menu under the grid: the touch way to save, chain and erase.
const slotBtns = []; let slotMenuFor = -1;
const addToChain = (i) => chainSlots([...(bank.chain.length ? bank.chain : bank.current >= 0 ? [bank.current] : []), i]);
function renderSlots() {
  slotBtns.forEach((b, i) => {
    const filled = bank.filled(i), cur = bank.current === i, queued = bank.pending === i, chained = bank.chain.length > 1 && bank.chain.includes(i);
    b.className = `slot${filled ? ' filled' : ''}${cur ? ' cur' : ''}${queued ? ' queued' : ''}${chained ? ' chain' : ''}${slotMenuFor === i ? ' menu' : ''}`;
    b.setAttribute('aria-label', `slot ${i + 1}, ${filled ? 'saved' : 'empty'}${cur ? ', playing' : ''}${queued ? ', queued' : ''}${chained ? ', in the chain' : ''}`);
  });
  $('chain-info').textContent = bank.chain.length > 1 ? `chain ${bank.chain.map(i => i + 1).join(' → ')} · ${bank.chainBars} bar${bank.chainBars > 1 ? 's' : ''} each` : bank.pending >= 0 ? `slot ${bank.pending + 1} waits for the next ${bank.switchAt === 'now' ? 'tick' : bank.switchAt}` : bank.current >= 0 ? `playing slot ${bank.current + 1}` : 'nothing saved yet: long-press a slot (or Shift+click) to save';
  renderSlotMenu();
}
function renderSlotMenu() {
  const menu = $('slot-menu'), i = slotMenuFor; menu.hidden = i < 0; if (i < 0) return;
  $('slot-menu-title').textContent = `slot ${i + 1}`;
  // aria-disabled, not disabled: the menu can slide under a held finger, and a finger lifting on a disabled button
  // drops the focus to the page (the gesture guard never sees that press)
  for (const act of ['chain', 'erase']) menu.querySelector(`[data-act=${act}]`).setAttribute('aria-disabled', !bank.filled(i));
}
function openSlotMenu(i) {
  slotMenuFor = slotMenuFor === i ? -1 : i; renderSlots(); if (slotMenuFor < 0) return;
  const menu = $('slot-menu'); menu.scrollIntoView({ block: 'nearest' }); menu.querySelector('[data-act=save]').focus({ preventScroll: true });   // under the grid, maybe below the fold
}
function closeSlotMenu(refocus = false) { const i = slotMenuFor; if (i < 0) return; slotMenuFor = -1; renderSlots(); if (refocus) slotBtns[i].focus({ preventScroll: true }); }
function buildSlotsUI() {
  const el = $('slots');
  for (let i = 0; i < SLOT_COUNT; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = i + 1;
    b.title = 'click = load · long-press or right-click = save / chain / erase · Shift+click = save here · Cmd/Ctrl+click = add to chain · Alt+click = erase';
    b.onclick = (e) => { closeSlotMenu(); if (e.shiftKey) saveSlot(i); else if (e.altKey) { bank.erase(i); renderSlots(); } else if (e.metaKey || e.ctrlKey) addToChain(i); else recallSlot(i); };
    longPress(b, () => openSlotMenu(i));
    el.appendChild(b); slotBtns.push(b);
  }
  $('slot-menu').onclick = (e) => {
    const btn = e.target instanceof Element && e.target.closest('button'), act = btn?.dataset.act, i = slotMenuFor;
    if (!act || i < 0 || btn.getAttribute('aria-disabled') === 'true') return;
    slotMenuFor = -1;
    if (act === 'save') saveSlot(i); else if (act === 'chain') addToChain(i); else if (act === 'erase') bank.erase(i);
    renderSlots(); slotBtns[i].focus({ preventScroll: true });
  };
  $('slot-menu').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeSlotMenu(true); } });

  ui.meter = mount('meter', segmented({ options: METERS.map(k => [k, k, INFO.meter]), value: m.meter, onChange: (v) => { m.setMeter(v); sync(); } }));
  ui.laneCount = mount('lane-count', segmented({ options: LANE_COUNTS.map(n => [n, `${n} lanes`, INFO.lanes]), value: m.lanes.length, onChange: setLaneCount }));
  ui.slotSwitch = mount('slot-switch', segmented({ options: [['now', 'at once'], ['bar', 'next bar'], ['cycle', 'full cycle', 'when every lane lines up again']], value: bank.switchAt, onChange: (v) => { bank.switchAt = v; bank.persist(); renderSlots(); } }));
  ui.slotRestart = mount('slot-restart', toggleChip({ label: 'restart on change', on: bank.restart, title: INFO['restart on change'], onChange: (v) => { bank.restart = v; bank.persist(); } }));
  sliders.chainBars = makeGauge({ label: 'bars per slot', min: 1, max: 16, value: bank.chainBars, say: (v) => `${v} bar${v === 1 ? '' : 's'}`, title: INFO['chain bars'], color: 'var(--ember-magenta)', onChange: (v) => { bank.chainBars = v; bank.persist(); renderSlots(); } }); $('slot-gauges').appendChild(sliders.chainBars.el);
  $('chain-stop').onclick = () => { bank.chain = []; bank.persist(); renderSlots(); readout(); };
  renderSlots();
}

// ---- live record: armed + playing, pads (or keys) play and write the nearest step ----
/** velocity null = a computer key (no velocity: the lane's default level); accent: pads by the "accent above" knob, keys by Shift. */
function liveHit(li, col, velocity = 100, accent = velocity != null && velocity >= rec.accentVel) {
  const lane = m.lanes[li]; if (!awake) { wake(); return; }
  const tune = rec.pitchPads ? Math.round(((col - 3.5) / 3.5) * 60) / 100 : null, v = velocity == null ? null : Math.max(0.25, Math.min(1, velocity / 127));
  const lock = tune != null ? { tune } : null, recd = rec.armed && playing;
  // a pad plays what its step will play (S1 its slice, S3 its start / end / direction): recording, the step the hit
  // lands on (steps count from the pattern's bar 1); otherwise the step under the pad. Before a run's first downbeat is
  // heard (the heard tick under 0: Play starts the transport 150 ms out) there is no loop before it: step 1, not the last
  const q = recd ? lane.quantize(Math.max(0, heardTick()) - m.origin, rec.quant) : null, idx = lane.stepIndex(recd ? q.index : pages.padFirst(lane, playing) + col), ph = lane.padHit(idx, lock);
  // A2: playing, a pad hit lands on the lane's curves where you hear (the hand's value on a knob it holds)
  const auto = playing && lane.auto ? Object.fromEntries(AUTO_KEYS.filter(k => lane.auto[k]).map(k => [k, handNow?.[li]?.[k] ?? playedValue(lane, k, 'curve')])) : null;
  hitSound(lane, T.immediate(), accent, ph.lock, accent ? 1 : v, kit, ph.slice, null, auto); midiHit(li, lane, accent ? 1 : v ?? hitVel(false, null), performance.now(), lock);
  if (!recd) { m.select(li); sync(); return; }
  lane.recordHit(idx, { accent, vel: accent ? null : v, tune });   // ghost notes stay ghosts (a vel lock), a soft overdub drops an old accent
  const qTick = m.origin + q.step * lane.stepTicks(); if (qTick > clockRef.tick) skip.add(`${li}:${qTick}`);   // not scheduled yet: don't play it twice
  scene.flash(li, q.index, accent); m.select(li); sync();
}
function setRec(on) { if (on !== rec.armed) slog?.act('record', rec.armed, on); if (!on) gestEnd(true); rec.armed = on; $('btn-rec').classList.toggle('armed', on); $('btn-rec').textContent = on ? '● recording' : '● arm record'; recLine(); saveSettings(); paintLeds(); readout(); }
/** RD-5: armed and playing, a 2 px red line along the console's top edge (the one red on the face but the recorders). */
const recLine = () => $('topbar').classList.toggle('rec-live', rec.armed && playing);
function buildRecUI() {
  $('btn-rec').onclick = () => setRec(!rec.armed);
  sliders.accentVel = makeGauge({ label: 'accent above', min: 1, max: 127, value: rec.accentVel, say: (v) => `velocity ${v}`, title: INFO['accent above'], onChange: (v) => { rec.accentVel = v; saveSettings(); } }); $('rec-gauges').appendChild(sliders.accentVel.el);   // no colour: grey like every non-lane knob (RD-2: a rose arc read as recording)
  ui.quant = mount('rec-quant', segmented({ options: [['nearest', 'nearest step', 'early hits land on the coming step'], ['previous', 'step just played']], value: rec.quant, onChange: (v) => { rec.quant = v; saveSettings(); } }));
  ui.pitchPads = mount('rec-pitch', toggleChip({ label: 'pitch pads', on: rec.pitchPads, title: INFO['pitch pads'], onChange: (v) => { rec.pitchPads = v; saveSettings(); } }));
  ui.recKnobs = mount('rec-knobs', segmented({ options: KNOB_MODES.map(k => [k, k, INFO['record knobs']]), value: rec.knobs, onChange: setKnobs }));
}

// ---- A3 / A4 / A6 automation (docs/design/automation.md). A hand on a knob of the selected lane is a gesture: a gauge
// held (pointer down → up), a Move encoder touched (touch on → off), or moves no more than 400 ms apart (keys, the
// mouse wheel, a controller without touch). Armed + playing + knobs on touch / latch: it records (the step keys as locks
// on the steps the scheduler sends while it lasts, the curve keys as points up to where you hear) and the lane value
// stays. Always, while it lasts, the hand plays over the lane's locks and curves (liveTick's hand). One at a time. ----
const KNOB_MODES = ['off', 'touch', 'latch'], GEST_GAP = 400;
const recKnobs = () => rec.armed && playing && rec.knobs !== 'off';
/** Where `lane` is heard now, in its steps from bar 1 (fractional). */
const heardStep = (lane) => (heardTick() - m.origin) / lane.stepTicks();
const lockClamp = (k, v) => { const [lo, hi] = LOCK_RANGE[k] || [0, 1]; return Math.max(lo, Math.min(hi, v)); };
/** What `lane` plays for key k now: a curve where it is heard, else the lock of the step sounding (or the lane's). */
const playedValue = (lane, k, kind) => (kind === 'curve' ? lane.autoAt(k, heardStep(lane)) ?? lane.sound[k] : lockValue(lane, lane.shown ?? 0, k));
/** A6: the recordable parameter a Move knob is (fixed when touched): Shift + knobs 1–8 = the sound keys (a curve on tone,
 *  drive, send, pan, level; locks on decay, snap, color), knob 6 / 7 = chance / tune (locks); null for the rest. */
const moveKnob = (index, sh) => (sh ? { src: 'snd', k: SOUND_KEYS[index], kind: AUTO_KEYS.includes(SOUND_KEYS[index]) ? 'curve' : 'step' } : index === 5 ? { src: 'lane', k: 'prob', kind: 'step' } : index === 6 ? { src: 'lane', k: 'tune', kind: 'step' } : null);
function setKnobs(v) { rec.knobs = KNOB_MODES.includes(v) ? v : 'off'; ui.recKnobs?.set(rec.knobs); if (rec.knobs === 'off') gestEnd(true); saveSettings(); readout(); }
/** A curve gesture moves its chain param itself (the clock leaves it alone meanwhile): 30 ms to the hand, no zipper. */
function handGlide(g) {
  const c = kit?.chains[g.li]; if (!c || !playing) return;
  if (g.k === 'drive' && g.v > c.dtop) { c.dtop = g.v; c.drive.distortion = c.dtop * 0.9; }   // the shaper grows with the hand (applySound sets the curve's top on release)
  const p = autoParam(c, g.k), t = handFrom(c, p, g.k); try { p.setTargetAtTime(soundValue(c, g.k, g.v), t, HAND_TAU); } catch {}
  (c.handAt ??= {})[g.k] = t;
}
/**
 * The hand moves a chain param, and hands it back, with setTargetAtTime only: each target from its start on, from
 * wherever the param really is then. Never a cancel inside a ramp the browser is playing, nor a value on that ramp's
 * end: Chrome then holds the ramp's start until that end (a step); a ramp started from Tone's model of a glide would
 * start from the wrong value (Tone models a setTarget from its previous target). HAND_TAU: the approach (99.75 % in 6 τ).
 */
const HAND_TAU = 0.01;
/** When the hand may take param p: just past the end of the clock's ramp under way (its next block line), the clock's
 *  events after it dropped; once the hand has it, from its own last target on, the values the clock's hits scheduled
 *  ahead with an older hand value dropped (under the hand nothing else is after it, and its running target stays). */
function handFrom(c, p, key) {
  const now = T.getContext().rawContext.currentTime + 0.002, d = MIDI_DIV * tickSec();
  const t = c.handAt?.[key] != null ? Math.max(now, c.handAt[key]) : (clockRef.time >= now ? clockRef.time - Math.floor((clockRef.time - now) / d) * d : now) + 0.001;
  try { p.cancelScheduledValues(t + 1e-4); } catch {}
  return t;
}
/** The lane's own value of key k (the knob: tune and chance on the lane, the rest in its sound). */
const laneValue = (lane, k) => (k === 'tune' ? lane.tune : k === 'prob' ? lane.prob : lane.sound[k]);
/** v: the hand's value. Recording, it starts from what plays; not recording the knob is the lane value (handTurn,
 *  handHold, the Move). */
function gestStart(li, k, kind, { touch, v, src, knob = null }) {
  if (knobGest) gestEnd(true);   // one hand at a time: a new gesture ends the one before (a latch too)
  const lane = m.lanes[li]; if (!lane || !playing) return null;
  const g = knobGest = { li, lane, k, kind, src, knob, touch, v, rec: recKnobs(), timer: 0, wrote: false, latched: false };
  stripKey = { k, kind }; handNow = []; handNow[li] = { [k]: v };
  if (g.rec) { startBlink('record'); if (kind === 'curve') { const s = heardStep(lane); Object.assign(g, { s0: s, lastS: s, lastV: v, grow: !lane.auto?.[k] }); curveWrite(g); } }
  if (kind === 'curve') handGlide(g);
  if (!touch) gestTimer(g);
  return g;
}
function gestMove(v) {
  const g = knobGest; if (!g) return; g.v = v; handNow[g.li][g.k] = v;
  if (g.rec && g.kind === 'curve') curveWrite(g);
  if (g.kind === 'curve') handGlide(g);
  if (!g.touch) gestTimer(g);
}
function gestTimer(g) { clearTimeout(g.timer); g.timer = setTimeout(() => { if (knobGest === g) gestEnd(); }, GEST_GAP); }
/** A2 record: curve points from the last write to where you hear now, linear from the hand's last value to this one
 *  (a jump of the heard position, a restart or a new bar line, starts afresh there); a gesture that began on an empty
 *  curve doubles its span each time it comes back to its start (up to the cap). */
function curveWrite(g) {
  let s = heardStep(g.lane); if (!(s >= 0)) return;
  if (s < g.lastS || s - g.lastS > g.lane.length * AUTO_LOOPS_MAX) { g.lastS = s; g.lastV = g.v; }
  if (g.latched) s = Math.min(s, g.end - 0.5 / AUTO_RES);   // nothing past a latch's end: it would land on the gesture's start
  // the span doubles before the points past it are written (they belong to the new half, not over the first points)
  while (g.grow && g.lane.auto && s - g.s0 >= g.lane.auto.loops * g.lane.length) if (!g.lane.spanAuto(1)) g.grow = false;
  if (s <= g.lastS && g.lane.auto?.[g.k]) return;
  if (g.lane.recordCurve(g.k, g.lastS, g.lastV, s, g.v)) g.wrote = true; g.lastS = s; g.lastV = g.v;
}
/**
 * The clock's side of a recording gesture, every master tick before liveTick (the lane being still the gesture's: a load,
 * an undo or a slot ends it). A1: the steps this tick decides (its own step, and a later one played early from here)
 * get the hand's value as a lock first, so the hit heard is the value kept: only steps with a hit, whatever their roll,
 * condition or mute. A2: on a block line, the curve's points up to where you hear. Latch: until its end.
 */
function autoRecordTick(t, ts, cut) {
  const g = knobGest, end = () => queueMicrotask(() => { if (knobGest === g) gestEnd(true); });
  if (m.lanes[g.li] !== g.lane) return end();
  if (g.kind === 'curve') { if (t % MIDI_DIV) return; curveWrite(g); if (g.latched && heardStep(g.lane) >= g.end) end(); return; }
  const lane = g.lane, st = lane.stepTicks(), o0 = m.origin, r = t - o0, due = early[g.li];
  const put = (step) => {
    if (g.latched && step >= g.end) return end(); const i = step % lane.length; if (!lane.hitAt(i)) return;
    lane.recordStepValue(lane.stepIndex(i), g.k, g.v); g.wrote = true; g.s0 ??= step; g.last = Math.max(g.last ?? step, step);
  };
  if (r >= 0 && r % st === 0 && !due?.has(t)) put(r / st);
  const s = earlyStep(lane, r, { humanize: m.humanize, tickSec: ts, cut: cut - o0 }); if (s >= 0 && !due?.has(o0 + s * st)) put(s);
}
/**
 * The hand lets go (touch off, pointer up, 400 ms without a move), or something ends the gesture (force: a load, Stop,
 * disarm, an undo, another gesture). Latch (not forced): the last value goes on being written until the playhead is
 * back where the gesture began (a curve's span, a lane loop of steps). The curve takes over again, gliding to where it
 * is; a gesture that wrote is one undo step. fromClock: the page catches up after the clock callback.
 */
function gestEnd(force = false, fromClock = false) {
  const g = knobGest; if (!g) return; clearTimeout(g.timer); const here = m.lanes[g.li] === g.lane;
  if (!force && g.rec && rec.knobs === 'latch' && !g.latched && here && playing && g.s0 != null) {
    const L = g.lane.length, span = g.kind === 'curve' ? (g.lane.auto?.loops || 1) * L : L, from = g.kind === 'curve' ? g.s0 : g.s0 ?? 0, at = g.kind === 'curve' ? heardStep(g.lane) : (g.last ?? from) + 1;
    Object.assign(g, { latched: true, touch: true, grow: false, end: from + Math.ceil(Math.max(1e-9, at - from) / span) * span }); return;
  }
  if (g.rec && g.kind === 'curve' && here && playing) curveWrite(g);   // the curve up to where you hear the hand let go (the clock writes once per block)
  knobGest = null; handNow = null; stopBlink('record');
  if (here && g.kind === 'curve' && playing) autoHandoff(g.li, g.k);
  if (g.wrote || g.dirty) { if (here) applySound(g.li); ownNext = true; save(); }   // the gesture's undo step now, before a load replaces the pattern
  if (!fromClock) (g.wrote || g.dirty || !g.rec ? sync : renderAuto)();   // the held gauge shows the lane again; from the clock (a slot, evolve's way home) the caller redraws, as its load
}
/** A curve's param handed back to the clock without a jump (a hand lets go, a curve cleared while playing): it glides
 *  (handFrom, a setTarget) to the curve's value on the first block line the clock hasn't scheduled yet, is set there
 *  (what is left of the glide by then: a few tenths of a percent), and the clock ramps on from that line, its state
 *  starting there (a line before it is covered: rampAuto). */
function autoHandoff(li, key) {
  const c = kit?.chains[li], lane = m.lanes[li]; if (!c || !lane) return; const p = autoParam(c, key), start = handFrom(c, p, key), d = MIDI_DIV * tickSec();
  let tick = clockRef.tick + MIDI_DIV, at = clockRef.time + d; while (at < start + 0.02) { tick += MIDI_DIV; at += d; }
  const x = soundValue(c, key, lane.autoAt(key, (tick - m.origin) / lane.stepTicks()) ?? lane.sound[key]);
  try { p.setTargetAtTime(x, start, Math.max(0.003, (at - start) / 6)); p.setValueAtTime(x, at); } catch {}
  if (c.handAt) delete c.handAt[key]; (c.ramp ??= {})[key] = { x, t: at, ev: at, flat: false };
}
/**
 * A gauge changed (v in lock units) on the selected lane: its gesture follows, or one starts (held by the pointer: until
 * it lets go; else timed, 400 ms after its last move). → the value the knob's own edit writes: undefined when the gesture
 * records (the hand writes automation, the lane value stays); else v, which the hand plays while it lasts. Not
 * recording the gauge works on the lane value (handPrime, handHold put it there first), so a turn, a jump (Home, End,
 * double-click) or a drag is the knob's own edit. Stopped, or a lock-panel knob not recording: v (the knob as always).
 */
function handTurn(src, k, v, kind = src === 'snd' && AUTO_KEYS.includes(k) ? 'curve' : 'step') {
  if (!playing || (src === 'lock' && !recKnobs())) return v;
  let g = knobGest; const x = lockClamp(k, Math.round(v * 100) / 100), held = !!gaugeOf(src, k)?.held;
  if (g && g.src === src && g.k === k && g.knob == null && g.li === m.selected && !g.latched) { if (held && !g.touch) { g.touch = true; clearTimeout(g.timer); } gestMove(x); }   // a drag taking over a key's timed gesture holds it until the pointer lets go
  else g = gestStart(m.selected, k, kind, { touch: held, v: x, src });
  return g?.rec ? undefined : x;
}
const gaugeOf = (src, k) => (src === 'snd' ? sliders['snd:' + k] : src === 'lane' ? sliders[k] : null);
/** The gauge the gesture on now holds, if it is one of the selected lane's (sync leaves it to the hand). */
const handGauge = () => { const g = knobGest; return g?.li === m.selected ? gaugeOf(g.src, g.k) : null; };
/** Before a key or a wheel step on a gauge (gauge.js prime): not recording while playing, the knob is the lane value, so
 *  the gauge goes there first (it may show a lock or a curve that plays) and the step is the lane value's, in full. */
function handPrime(src, k) { if (playing && !recKnobs() && !knobGest?.rec) gaugeOf(src, k)?.set(Math.round(laneValue(m.lane, k) * 100)); }
/** A gauge held. Recording, its gesture runs from what plays until the pointer lets go (touch mode writes while it is
 *  held). Not recording you hold the knob itself: the gauge goes to the lane value before the drag starts from it (the
 *  full range is there), and nothing changes until it moves (handTurn starts the hand then). */
function handHold(src, k, v) {
  if (!playing || (src === 'lock' && !recKnobs())) return;
  if (recKnobs()) gestStart(m.selected, k, src === 'snd' && AUTO_KEYS.includes(k) ? 'curve' : 'step', { touch: true, v, src }); else handPrime(src, k);
}
function handLetGo(src, k) { const g = knobGest; if (g && g.src === src && g.k === k && g.knob == null && g.touch && !g.latched) gestEnd(); }
/** A4: the selected lane's automated parameters: curves first, then the keys it has locks of (not the ghost tier). */
function autoParams(lane) { const a = lane.auto; return [...AUTO_KEYS.filter(k => a?.[k]).map(k => ({ k, kind: 'curve' })), ...LOCK_KEYS.filter(k => lane.locks.some((lk, i) => i < lane.length && lk?.[k] != null && !(k === 'vel' && lk.vel === GHOST_VEL))).map(k => ({ k, kind: 'step' }))]; }
/** A4: the "A" marks on the knobs that record, the strip's picker (the last touched parameter, else the first), its draw. */
function renderAuto() {
  const lane = m.lane; autoShown = [];
  const mark = (gg, k, src, kind) => { const on = lane.automates(k); gg?.setMark(on); if (gg && on) autoShown.push({ gg, k, src, kind }); };
  for (const k of SOUND_KEYS) mark(sliders['snd:' + k], k, 'snd', AUTO_KEYS.includes(k) ? 'curve' : 'step'); for (const k of ['tune', 'prob']) mark(sliders[k], k, 'lane', 'step');
  const list = autoParams(lane), strip = $('auto-strip'); strip.hidden = !list.length; if (!list.length) return;
  const cur = list.find(p => p.k === stripKey?.k && p.kind === stripKey?.kind) || list[0], sel = $('auto-key'), opts = list.map(p => `${p.kind}:${p.k}`).join();
  if (sel.dataset.opts !== opts) { sel.innerHTML = ''; for (const p of list) sel.add(new Option(`${knobWord(p.k)} · ${p.kind === 'curve' ? 'curve' : 'locks'}`, `${p.kind}:${p.k}`)); sel.dataset.opts = opts; }
  sel.value = `${cur.kind}:${cur.k}`; stripKey = cur;
  const a = lane.auto, n = lane.locks.filter((lk, i) => i < lane.length && lk?.[cur.k] != null).length;
  $('auto-text').textContent = cur.kind === 'curve' ? `over ${nLoops(a.loops)} of this lane` : `on ${n} step${n === 1 ? '' : 's'}`;
  $('auto-half').disabled = cur.kind !== 'curve' || a.loops <= 1; $('auto-double').disabled = cur.kind !== 'curve' || a.loops * 2 * a.len * AUTO_RES > AUTO_MAX || a.loops >= AUTO_LOOPS_MAX;
  drawStrip();
}
const nLoops = (n) => `${n} loop${n === 1 ? '' : 's'}`;
/** Lock units → 0..1 for drawing (tune −1..1, nudge ±½). */
const unitOf = (k, v) => (k === 'tune' ? (v + 1) / 2 : k === 'nudge' ? v + 0.5 : v);
/** A4 strip: a curve over its span (loop dividers, the lane value dashed where it has no points) or a key's locks as bars
 *  per step, and the playhead. The picture is drawn once into `stripBg` and redrawn only when what it shows changes
 *  (stripSig); a frame (autoFrame) copies it and adds the playhead. The selected lane only. */
let stripBg = null, stripSig = '';
function drawStrip() {
  const cv = $('auto-cv'), lane = m.lane, p = stripKey; if (!p || $('auto-strip').hidden) return;
  const w = cv.clientWidth, h = cv.clientHeight, px = devicePixelRatio || 1; if (!w || !h) return;
  if (cv.width !== Math.round(w * px) || cv.height !== Math.round(h * px)) { cv.width = Math.round(w * px); cv.height = Math.round(h * px); }
  const L = lane.length, loops = p.kind === 'curve' ? lane.auto?.loops || 1 : 1, span = loops * L, xs = (s) => (s / span) * w;
  const sig = `${m.selected}|${p.kind}:${p.k}|${L}|${w}x${h}@${px}|${p.kind === 'curve' ? `${loops}|${lane.sound[p.k]}|${lane.auto?.[p.k]}` : Array.from({ length: L }, (_, i) => `${lane.hitAt(i) ? 1 : 0}${lane.lockAt(i)?.[p.k] ?? ''}`).join()}`;
  if (sig !== stripSig) {
    stripSig = sig; stripBg ??= document.createElement('canvas'); stripBg.width = cv.width; stripBg.height = cv.height;
    const g = stripBg.getContext('2d'), col = LANE_HEX[m.selected], y = (v) => h - 3 - unitOf(p.k, v) * (h - 6); g.setTransform(px, 0, 0, px, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(236,233,247,.2)'; g.lineWidth = 1; for (let i = 1; i < span; i++) { if (i % L && L > 16) continue; g.globalAlpha = i % L ? 0.35 : 1; g.beginPath(); g.moveTo(xs(i), i % L ? h - 5 : 0); g.lineTo(xs(i), h); g.stroke(); } g.globalAlpha = 1;
    if (p.kind === 'curve') {
      const base = lane.sound[p.k], n = span * AUTO_RES; g.setLineDash([3, 3]); g.strokeStyle = 'rgba(236,233,247,.35)'; g.beginPath(); g.moveTo(0, y(base)); g.lineTo(w, y(base)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); let pen = false;
      for (let q = 0; q <= n; q++) { const v = lane.autoAt(p.k, q / AUTO_RES); if (v == null) { pen = false; continue; } const x = (q / n) * w; if (pen) g.lineTo(x, y(v)); else g.moveTo(x, y(v)); pen = true; }
      g.stroke();
    } else for (let i = 0; i < L; i++) { const v = lane.lockAt(i)?.[p.k]; if (v == null) continue; g.fillStyle = lane.hitAt(i) ? col : 'rgba(236,233,247,.25)'; const top = y(v); g.fillRect(xs(i) + 1, top, Math.max(1, xs(1) - 2), h - 3 - top); }
  }
  const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(stripBg, 0, 0);
  if (playing) { const s = p.kind === 'curve' ? heardStep(lane) : lane.shown != null ? lane.shown + 0.5 : -1; if (s >= 0) { const x = xs(((s % span) + span) % span) * px; g.fillStyle = '#fff'; g.fillRect(x - 0.75 * px, 0, 1.5 * px, cv.height); } }
}
/** A4 while playing, once per frame: the selected lane's automated knobs (autoShown, from renderAuto) follow what plays
 *  (the hand while it holds one), each set only when its shown value moves, and the strip's playhead moves. Nothing
 *  automated and no hand: nothing to do. Stopped, the knobs show the lane values again (sync). */
let autoRaf = 0, autoShown = [];
function autoFrame() {
  autoRaf = requestAnimationFrame(autoFrame); if (!playing) { cancelAnimationFrame(autoRaf); autoRaf = 0; return; }
  const lane = m.lane, g = knobGest?.li === m.selected ? knobGest : null; if (!autoShown.length && !g) return;
  const show = (gg, v) => { const x = Math.round(v * 100); if (!gg.held && gg.value !== x) gg.set(x); };
  for (const a of autoShown) if (!(g && g.src === a.src && g.k === a.k)) show(a.gg, playedValue(lane, a.k, a.kind));
  if (g && (g.src === 'snd' || g.src === 'lane')) show(sliders[g.src === 'snd' ? 'snd:' + g.k : g.k], g.v);
  drawStrip();
}
function buildAutoUI() {
  $('auto-key').onchange = (e) => { const [kind, k] = e.target.value.split(':'); stripKey = { k, kind }; renderAuto(); letGoAfterPointer(e.target); };
  $('auto-half').onclick = () => autoEdit(l => l.spanAuto(-1)); $('auto-double').onclick = () => autoEdit(l => l.spanAuto(1));
  $('auto-clear').onclick = () => { const p = stripKey; if (p && autoEdit(l => l.clearAuto(p.k, p.kind))) toast(`${knobWord(p.k)}: ${p.kind === 'curve' ? 'curve' : 'locks'} cleared on this lane`); };
  $('auto-clear-lane').onclick = () => { if (autoEdit(l => l.clearAuto())) toast('this lane\'s automation cleared'); };
}
/** A4: an edit of the selected lane's automation (½, ×2, a clear): one undo step; its chain starts over from the knob or
 *  the curve (a jump on the next block line). True when it changed something. */
function autoEdit(fn, li = m.selected) {
  gestEnd(true); const lane = m.lanes[li], was = AUTO_KEYS.map(k => lane.auto?.[k] && `${lane.auto.loops}:${lane.auto[k]}`); if (!fn(lane)) return false;
  // playing, each curve it changed glides to what plays now (a cleared one to the knob) instead of jumping there; the
  // rest (a lock-only clear changes none) keep their scheduled ramps
  const had = AUTO_KEYS.filter((k, i) => was[i] && was[i] !== (lane.auto?.[k] && `${lane.auto.loops}:${lane.auto[k]}`)), soft = playing && kit ? new Set(had) : null; applySound(li, kit, soft);
  if (soft) for (const k of had) autoHandoff(li, k);
  ownNext = true; sync(); return true;
}

// ---- evolve: every N bars, nudge some lanes; optionally come back home ----
let lastEvolve = '';
/** Clearing or randomizing is a fresh start: evolve stops (it would mutate the new pattern away from you). */
function clearLane() { const was = slog && slogBefore(); if (evo.on) setEvolve(false); m.lane.clear(); sync(); slog?.act('clear', was, slogWords(), { lane: m.selected + 1, absorb: true }); }
/**
 * Every load (init, a groove, a link, a setup) goes through here: the pattern with its voices and sounds, one undo
 * step of its own, and its tempo when it brings one (undo puts the tempo you had back too). Once the beat is
 * replaced, the welcome-back bar has nothing left to offer.
 */
function loadMachine(json, { bpm = null, exact = false, selected = 0 } = {}) {
  gestEnd(true); if (evo.on) setEvolve(false); const was = tempo;
  m.assign(json, { selected }); if (bpm) applyTempo(bpm, true, { exact });
  rebuildVoices(); lockStep = -1; hideWelcome();
  loadNext = bpm ? { tempo, was } : true; sync(); renderLanesEvolve();
}
/** Init: every lane empty (as many lanes as now), length 4 at ×1, default voices and sounds; one kick on step 1 of lane 1. Undoable. */
function initPattern() {
  const was = slog && slogBefore(), n = new Machine(m.lanes.length); n.lanes.forEach(l => { l.clear(); l.setLength(4); l.setRatio(ratioIndexOf(1)); }); n.lanes[0].hits[0] = true;
  loadMachine(n.toJSON()); freshBeat(); slog?.act('init', was, slogWords(), { absorb: true });
}
/** The beat on screen is no longer the library setup last loaded or saved: a share stops using its name (shareName),
 *  and its row its mark. */
function leaveSetup() { if (libCurrent == null) return; libCurrent = null; renderLib(); }
/** A fresh start (init, a groove, a roll): a new beat, no setup's and no remix of anything. */
function freshBeat() { setLineage(null); leaveSetup(); }
/** A starter groove (grooves.js): pattern + kit + swing and its tempo, one undo step; the toast names it with its
 *  one-liner (the chips' tooltips never show on touch). */
function loadGroove(key) {
  const g = grooveByKey(key); if (!g) return; const was = slog && slogBefore(); loadMachine(g.m, { bpm: g.tempo }); slog?.act('load', was, slogWords(), { what: `groove ${key}`, absorb: true }); freshBeat(); toast(`${g.name} · ${g.tempo} bpm · ${g.desc}`, 5000);
}
/**
 * Randomize: musical by default (a groove family, named in a toast); wild = the old anything-goes roll (Shift+click,
 * long-press, 'wild'). Every roll is its own undo step. With locked dice a fresh seed is rolled and shown, so a groove
 * you like can be re-made from its number ("pattern from seed").
 */
function randomizeAll(wild = false) {
  if (dice.locked) { dice.reroll(); saveSettings(); renderDice(); }
  rollPattern(wild);
}
/** A roll, its own undo step, named in a toast. seeded: from the dice seed's first stream (also with free dice, for
 *  "pattern from seed"), so a seed always makes the same groove. A roll is a fresh start. */
function rollPattern(wild, seeded = dice.locked) {
  gestEnd(true); if (evo.on) setEvolve(false); const was = slog && slogBefore();
  const rng = seeded ? Dice.take(dice.seed).stream(0) : Math.random, name = wild ? (m.randomize(rng), 'wild') : m.randomizeMusical(rng).name;
  loadNext = true; hideWelcome(); freshBeat(); sync(); toast(`${name}${seeded ? ` · dice ${dice.seed}` : ''}`); slog?.act('randomize', was, slogWords(), { what: name, absorb: true });
}
// ---- undo / redo ----
/** Put back an undo / redo step. Live mutes and solos stay as they are (keepPerf), unless the step crosses a load;
 *  a load that set the tempo takes its tempo with it. */
function applyState(step, what) {
  if (!step) return; const was = slog && slogBefore(); restoring = true; const live = m.lanes.map(l => ({ muted: l.muted, solo: l.solo }));
  m.assign(JSON.parse(step.json), { keep: true, selected: m.selected });   // keep: loops go on counting (R4)
  if (step.keepPerf) m.lanes.forEach((l, i) => { l.muted = !!live[i]?.muted; l.solo = !!live[i]?.solo; });
  if (step.tempo != null) applyTempo(step.tempo, true, { exact: true });
  rebuildVoices(); lockStep = -1; sync(); renderLanesEvolve(); restoring = false; slog?.act(what, was, slogWords(), { absorb: true });
}
// A3: a gesture going on ends first (its one undo step is then what undo takes back)
const undo = () => { gestEnd(true); applyState(hist.undo({ tempo }), 'undo'); }, redo = () => { gestEnd(true); applyState(hist.redo(), 'redo'); };
/** Momentary fill (Layout, the fill button, key 0): on while held, on top of a latched bar. */
function setFill(on) { if (fillHold === on) return; fillHold = on; fill = fillHold || latch.on; renderFill(); }
/** P3: Shift + Layout or "fill next bar": the next whole bar fills (again before it starts = cancel). Stopped, it waits for Play's downbeat. */
function armLatch() { latch.arm(); fill = fillHold || latch.on; renderFill(); }
function renderFill() {
  $('btn-fill').classList.toggle('armed', fill); const b = $('btn-latch'); b.classList.toggle('armed', latch.state !== 'off');
  b.textContent = latch.state === 'armed' ? 'fill next…' : latch.on ? 'fill this bar' : 'fill next'; b.setAttribute('aria-pressed', latch.state !== 'off');
  paintLeds(); readout();
}
/** P2: mute or unmute lane li without selecting it: at once, or on the next bar line while playing with "mute on next
 *  bar" (it waits for the mute asked now, whatever loads before the line; a second press before it takes it back). A
 *  performance move: never an undo step (perfKey). */
function toggleMute(li) {
  if (li < 0 || li >= m.lanes.length) return;
  const muteNow = () => (muteQ.has(li) ? muteQ.target(li) : !!m.lanes[li].muted), t = performance.now();
  // RD-9: every press flips what the lane is (or waits) to be; one that would mute it right after a press unmuted it is
  // a bounce (perform.js MuteBounce): dropped, so the lane keeps sounding
  if (!muteNow() && muteBounce.bounce(li, t)) return;
  const was = slog && (slog.begin(), muteNow());
  if (perf.muteBar && playing) muteQ.toggle(li, !m.lanes[li].muted); else m.lanes[li].muted = !m.lanes[li].muted;
  if (!muteNow()) muteBounce.unmuted(li, t);
  sync(); slog?.act(`lane${li + 1}.mute`, was, muteNow(), { voice: m.lanes[li].voice, queued: muteQ.has(li), absorb: true });
}
/** What a waiting mute does to lane li, in words ("mutes" / "unmutes"). */
const muteWord = (li) => (muteQ.target(li) ? 'mutes' : 'unmutes');
/** Master clock, on a bar line: what P2 / P3 queued for it, after a slot due here has loaded and evolve's way home has
 *  run (a waiting mute lands on the lanes that play from here). The model changes now (this tick plays it), the page after. */
function barPerf() {
  const waited = muteQ.size; muteQ.apply(m.lanes);
  if (latch.bar()) fill = fillHold || latch.on;
  offClock(true, () => { if (waited) sync(); renderFill(); });
}
/** Stopped: nothing waits for a bar line that won't come (queued mutes land now, the latch lets go). */
function flushPerf() { flushMutes(); latch.clear(); fill = fillHold; renderFill(); }
/** The waiting mutes land now (stop, or "mute on next bar" switched off). */
function flushMutes() { if (!muteQ.size) return; muteQ.apply(m.lanes); sync(); }
function evolveNow(bar = 0, fromClock = false) {
  if (!evoSnap) evoSnap = m.snapshot();
  if (evo.home && evoCount >= evo.home) { gestEnd(true, fromClock); m.assign(evoSnap, { keep: true, selected: m.selected }); rebuildVoices(); evoCount = 0; lastEvolve = 'back home'; }
  else {
    const ch = m.evolve({ scope: evo.scope, amount: evo.amount / 100, weights: evo.weights, gravity: evo.gravity / 100, home: evoSnap, maxBars: evo.maxBars, repeat: cycleOpts().repeat }, dice.stream(1000 + bar)); evoCount++;
    lastEvolve = ch.map(c => `${voiceLabel(m.lanes[c.lane])} ${c.kind}${c.held ? ' (too long)' : c.home ? ' ↺' : c.dir > 0 ? '+' : '−'}`).join(', ') || 'held still';
  }
  offClock(fromClock, sync);
}
function setEvolve(on) { if (on !== evo.on) slog?.act('evolve', evo.on, on); evo.on = on; if (on) { evoSnap = m.snapshot(); evoCount = 0; lastEvolve = ''; } $('btn-evolve').classList.toggle('armed', on); $('btn-evolve').textContent = on ? '◉ evolving' : '◌ evolve'; saveSettings(); paintLeds(); readout(); }
function renderLanesEvolve() {
  const el = $('evo-lanes'); el.innerHTML = '';
  m.lanes.forEach((l, i) => el.appendChild(toggleChip({ label: `${i + 1} · ${voiceLabel(l)}`, on: l.evolve, color: LANE_HEX[i], title: 'lit = evolve may change this lane', onChange: (v) => { l.evolve = v; save(); } }).el));
  renderCouple();
}
/** V3 / V5 per-lane generative controls: euclid combine mode, slow modulator, timbre dice, scale snap. */
function buildGenUI() {
  ui.genEuclid = mount('gen-euclid', segmented({ options: [['replace', 'replace', INFO['euclid mode']], ['and', 'AND', INFO['euclid mode']], ['xor', 'XOR', INFO['euclid mode']]], value: m.lane.euclidMode, onChange: (v) => { m.lane.setEuclidMode(v); sync(); } }));
  const setMod = (patch) => { const l = m.lane, o = { target: 'tone', loops: 4, depth: 0.5, ...(l.mod || {}), ...patch }; l.setMod(o.target === 'off' ? null : o); sync(); };
  ui.genMod = mount('gen-mod', segmented({ options: [['off', 'off'], ...MOD_TARGETS.map(k => [k, k, INFO.modulate])], value: m.lane.mod?.target || 'off', onChange: (v) => setMod({ target: v }) }));
  sliders.modLoops = makeGauge({ label: 'period', min: 0, max: 16, value: 4, fmt: v => v ? `${v} loop${v === 1 ? '' : 's'}` : 'cycle', say: v => v ? `${v} loops` : 'the whole cycle', title: INFO.modulate, color: 'var(--nebula-purple)', onChange: (v) => setMod({ loops: v }) });
  sliders.modDepth = makeGauge({ label: 'depth', min: 0, max: 100, value: 50, fmt: v => v + '%', title: INFO.modulate, color: 'var(--nebula-purple)', onChange: (v) => setMod({ depth: v / 100 }) });
  $('gen-mod-gauges').append(sliders.modLoops.el, sliders.modDepth.el);
  for (const k of TIMBRE_KEYS) { sliders['td:' + k] = makeGauge({ label: `${k} range`, min: 0, max: 100, value: 0, fmt: v => v ? `±${v / 2}%` : 'off', say: v => v ? `plus or minus ${v / 2} percent` : 'off', title: INFO['timbre dice'], color: 'var(--nebula-purple)', onChange: (v) => { m.lane.setTimbreDice({ ...(m.lane.tdice || {}), [k]: v / 100 }); sync(); } }); $('gen-tdice').append(sliders['td:' + k].el); }
  ui.genScale = mount('gen-scale', segmented({ options: SCALE_KEYS.map(k => [k, { off: 'off', major: 'major', minor: 'minor', penta: 'pentatonic', just: 'just' }[k], INFO.scale]), value: m.lane.scale, onChange: (v) => { m.lane.setScale(v); sync(); } }));
}
function renderGen() {
  const l = m.lane; ui.genEuclid.set(l.euclidMode); ui.genMod.set(l.mod?.target || 'off'); $('gen-mod-gauges').hidden = !l.mod;
  if (l.mod) { sliders.modLoops.set(l.mod.loops); sliders.modDepth.set(Math.round(l.mod.depth * 100)); }
  for (const k of TIMBRE_KEYS) sliders['td:' + k].set(Math.round((l.tdice?.[k] || 0) * 100));
  ui.genScale.set(l.scale); $('gen-scale-note').textContent = l.voice === 'sample' || !TUNE_SEMIS[l.voice] ? `${voiceLabel(l)} has no pitch to snap: the scale works on toms, congas, bells, mallets and other pitched voices.` : '';
}
/** V2 coupling (part of the pattern: a slot, undo or link brings its own): the mode, the "next lane" amount, the matrix. */
function renderCouple() {
  const c = m.couple, n = m.lanes.length; ui.coupleMode?.set(c.mode); sliders.coupleAmount?.set(Math.round(c.amount * 100));
  if (sliders.coupleAmount) sliders.coupleAmount.el.hidden = c.mode !== 'next';
  const g = $('couple-matrix'); g.hidden = c.mode !== 'matrix'; if (g.hidden) return; g.innerHTML = ''; g.style.setProperty('--n', n + 1);
  const cell = (txt, cls = 'cm-head') => { const s = document.createElement('span'); s.className = cls; s.textContent = txt; return s; };
  g.append(cell('hit ↓ lifts →'), ...m.lanes.map((_, b) => cell(String(b + 1))));
  for (let a = 0; a < n; a++) {
    g.append(cell(String(a + 1)));
    for (let b = 0; b < n; b++) {
      const v = c.matrix[a][b], btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cm-cell'; btn.textContent = v ? `${Math.round(v * 100)}` : '·';
      btn.style.setProperty('--a', v); btn.style.setProperty('--chip', LANE_HEX[a]); btn.setAttribute('aria-label', `a hit on lane ${a + 1} lifts lane ${b + 1} by ${Math.round(v * 100)} percent`);
      btn.onclick = () => { c.matrix[a][b] = (Math.round(v * 4) + 1) % 5 / 4; sync(); renderCouple(); };
      g.append(btn);
    }
  }
}
/** The evolve scope's choices in the view's words (I7: "shift" in simple; "all", so it isn't a second "everything"). */
function evoScopeOptions() { const rot = knobWord('rotation'); return [['rotate', rot], ['hits', '+ hits'], ['all', 'all', `${rot}, hits, length, speed, chance and tune (whatever has a weight)`]]; }
function buildEvolveUI() {
  $('btn-evolve').onclick = () => setEvolve(!evo.on); $('evo-home-now').onclick = () => { evoSnap = m.snapshot(); evoCount = 0; lastEvolve = 'home set'; readout(); };
  const g = $('evo-gauges');
  sliders.evoEvery = makeGauge({ label: 'every · bars', min: 1, max: 32, value: evo.every, say: (v) => `${v} bar${v === 1 ? '' : 's'}`, title: INFO['evolve every'], color: 'var(--nebula-purple)', onChange: (v) => { evo.every = v; saveSettings(); readout(); } });
  sliders.evoAmount = makeGauge({ label: 'amount', min: 0, max: 100, value: evo.amount, fmt: v => v + '%', title: INFO['evolve amount'], color: 'var(--nebula-purple)', onChange: (v) => { evo.amount = v; saveSettings(); } });
  sliders.evoHome = makeGauge({ label: 'home after', min: 0, max: 16, value: evo.home, fmt: v => v ? v + '×' : 'never', say: v => v ? `${v} mutation${v === 1 ? '' : 's'}` : 'never', title: INFO['return home'], color: 'var(--nebula-purple)', onChange: (v) => { evo.home = v; saveSettings(); } });
  g.append(sliders.evoEvery.el, sliders.evoAmount.el, sliders.evoHome.el);
  ui.evoScope = mount('evo-scope', segmented({ options: evoScopeOptions(), value: evo.scope, onChange: (v) => { evo.scope = v; saveSettings(); } }));
  // V1: gravity, the max cycle guard, and how often each kind of change comes up
  sliders.evoGravity = makeGauge({ label: 'gravity', min: 0, max: 100, value: evo.gravity, fmt: v => v + '%', title: INFO['evolve gravity'], color: 'var(--nebula-purple)', onChange: (v) => { evo.gravity = v; saveSettings(); } });
  sliders.evoMax = makeGauge({ label: 'max cycle', min: 0, max: 64, value: evo.maxBars, fmt: v => v ? `${v} bars` : 'off', say: v => v ? `${v} bars` : 'no limit', title: INFO['evolve max cycle'], color: 'var(--nebula-purple)', onChange: (v) => { evo.maxBars = v; saveSettings(); } });
  $('evo-more').append(sliders.evoGravity.el, sliders.evoMax.el);
  const KIND_LABEL = { rotate: 'rotation', hits: 'hits', length: 'length', ratio: 'speed', prob: 'chance', tune: 'tune' };
  for (const k of EVOLVE_KINDS) { sliders['evoW:' + k] = makeGauge({ label: `${KIND_LABEL[k]} weight`, min: 0, max: MAX_WEIGHT, value: evo.weights[k], fmt: v => v ? `×${v}` : 'never', title: INFO['evolve weight'], color: 'var(--nebula-purple)', onChange: (v) => { evo.weights[k] = v; saveSettings(); } }); $('evo-weights').append(sliders['evoW:' + k].el); }
  // V2: coupling
  ui.coupleMode = mount('couple-mode', segmented({ options: [['off', 'off'], ['next', 'next lane', 'a hit lifts the next lane'], ['matrix', 'matrix', 'pick who lifts whom']], value: m.couple.mode, onChange: (v) => { m.couple.mode = v; sync(); renderCouple(); } }));
  sliders.coupleAmount = makeGauge({ label: 'lift', min: 0, max: 100, value: Math.round(m.couple.amount * 100), fmt: v => v + '%', title: INFO.coupling, color: 'var(--nebula-purple)', onChange: (v) => { m.couple.amount = v / 100; sync(); } });
  $('couple-gauges').append(sliders.coupleAmount.el);
  renderLanesEvolve();
}

// ---- MIDI I/O ----
async function enableMidi() {
  try { if (!midi.access) await midi.init(); } catch (e) { $('midi-status').textContent = e.message; return; }
  midi.addEventListener('ports', () => { pmidi.refresh(); renderMidi(); }); pmidi.refresh(); renderMidi();
}
function renderMidi() {
  renderPills();   // RD-7: following a clock is a pill
  const has = !!midi.access; $('btn-midi-enable').hidden = has; $('midi-body').hidden = !has; if (!has) return;
  const opts = (ports) => [['', 'none'], ...ports.map(p => [p.name, p.name])];
  ui.midiOut.setOptions(opts(pmidi.outputs())); ui.midiOut.set(pmidi.outName); ui.midiIn.setOptions(opts(pmidi.inputs())); ui.midiIn.set(pmidi.inName);
  const bad = pmidi.outName && !pmidi.out;
  $('midi-status').textContent = bad ? `"${pmidi.outName}" can't take notes right now (the Move in control mode would light pads instead)` : pmidi.follow !== 'off' && pmidi.inName ? `following ${pmidi.inName}${pmidi.extBpm ? ` · ${pmidi.extBpm} bpm` : ' · waiting for clock'}` : '';
}
function buildMidiUI() {
  $('btn-midi-enable').onclick = enableMidi;
  ui.midiOut = mount('midi-out', segmented({ options: [['', 'none']], value: '', chips: true, onChange: (v) => { pmidi.setOutput(v); saveSettings(); renderMidi(); } }));
  ui.midiIn = mount('midi-in', segmented({ options: [['', 'none']], value: '', chips: true, onChange: (v) => { pmidi.setInput(v); saveSettings(); renderMidi(); } }));
  ui.clockOut = mount('midi-clock-out', toggleChip({ label: 'send clock + start/stop', on: pmidi.clockOut, title: INFO['clock out'], onChange: (v) => { pmidi.clockOut = v; saveSettings(); } }));
  ui.follow = mount('midi-follow', segmented({ options: [['off', 'off'], ['tempo', 'tempo'], ['transport', '+ start/stop'], ['lock', '+ phase lock', 'tempo, start/stop and beat position']], value: pmidi.follow, onChange: (v) => { pmidi.setFollow(v); retime(); saveSettings(); renderMidi(); } }));   // leaving the phase lock: the transport leaves its last trim
  // note + channel per lane as gauges (note names in Live's convention, C3 = 60), then the gate
  const NOTE = (p) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][p % 12] + (Math.floor(p / 12) - 2), g = $('midi-lanes');
  pmidi.lanes.forEach((_, i) => {   // all six: lanes 5–6 keep their notes for a 6-lane pattern
    g.appendChild(makeGauge({ label: `lane ${i + 1} note`, min: 0, max: 127, value: pmidi.lanes[i].note, fmt: (v) => `${NOTE(v)} · ${v}`, color: LANE_HEX[i], onChange: (v) => { pmidi.lanes[i].note = v; saveSettings(); renderStrokeNotes(); } }).el);
    g.appendChild(makeGauge({ label: `lane ${i + 1} ch`, min: 1, max: 16, value: pmidi.lanes[i].ch, fmt: (v) => `ch ${v}`, say: (v) => `channel ${v}`, color: LANE_HEX[i], onChange: (v) => { pmidi.lanes[i].ch = v; saveSettings(); renderStrokeNotes(); } }).el);
  });
  g.appendChild(makeGauge({ label: 'gate', min: 5, max: 500, value: pmidi.gateMs, fmt: (v) => `${v} ms`, color: 'var(--star-white)', title: 'how long each MIDI note is held', onChange: (v) => { pmidi.gateMs = v; saveSettings(); } }).el);
  // P5: notes and clock out later (+) or earlier (−) than the audio is scheduled; auto = the audio output's latency
  sliders.midiLat = makeGauge({ label: 'out offset', min: -LATENCY_MAX, max: LATENCY_MAX, value: pmidi.latencyMs, fmt: (v) => `${v > 0 ? '+' : ''}${v} ms`, say: (v) => v ? `${Math.abs(v)} ms ${v > 0 ? 'later' : 'earlier'}` : 'no offset', color: 'var(--star-white)', title: INFO['midi offset'], onChange: (v) => { pmidi.offsetMs = v; ui.midiLatAuto.set(false); saveSettings(); } });
  g.appendChild(sliders.midiLat.el);
  ui.midiLatAuto = mount('midi-lat-auto', toggleChip({ label: 'auto offset', on: pmidi.offsetMs == null, title: INFO['midi offset'], onChange: (v) => { pmidi.offsetMs = v ? null : pmidi.latencyMs; sliders.midiLat.set(pmidi.latencyMs); saveSettings(); } }));
  // A7: the CC each automated parameter goes out on in the MIDI export (0 = left out); no ports needed for that
  for (const k of AUTO_CC_KEYS) $('midi-cc').appendChild(makeGauge({ label: `${k} CC`, min: 0, max: 119, value: pmidi.cc[k], fmt: (v) => (v ? `CC ${v}` : 'off'), say: (v) => (v ? `CC ${v}` : 'left out'), color: 'var(--star-white)', title: INFO['automation cc'], onChange: (v) => { pmidi.cc[k] = v; saveSettings(); } }).el);
  pmidi.handlers = { tempo: (bpm) => { followClockTempo(bpm); renderMidi(); }, start: () => { if (!playing) togglePlay(); }, stop: () => { if (playing) togglePlay(); },
    // phase lock: compare where our clock is with the incoming tick at the moment it arrived; trim the tempo or snap
    tick: (ext, t) => {
      if (!playing) return; const raw = T.getContext().rawContext, audioT = raw.currentTime + (t - performance.now()) / 1000;
      // compared in MIDI clock ticks (24 PPQ); a snap moves our clock by whole MIDI ticks, so blocks stay on that grid
      const { jump: j, trim } = phaseCorrection((clockRef.tick + (audioT - clockRef.time) / tickSec()) / MIDI_DIV - ext), jump = j * MIDI_DIV;
      // a snap renumbers the ticks still to come; the reference moves with them, or every clock tick that arrives
      // before the next scheduler batch would apply the same snap again (and the clock would swing further and further)
      if (jump) { const to = Math.max(0, tick + jump); clockRef = { ...clockRef, tick: clockRef.tick + to - tick }; tick = to; clockPast.length = 0; }   // the blocks before the snap count the old ticks
      T.getTransport().bpm.value = (pmidi.extBpm || tempo) * trim; stress.drift = jump ? 'snap' : `${((trim - 1) * 100).toFixed(1)}%`;
    } };
  renderMidi();
}
// ---- solo & choke ----
function toggleSolo(li = m.selected) { m.lanes[li].solo = !m.lanes[li].solo; sync(); }
function buildMixUI() {
  $('btn-solo').onclick = () => toggleSolo(); $('btn-mute').onclick = () => toggleMute(m.selected);
  ui.muteBar = mount('mute-bar', toggleChip({ label: 'on next bar', on: perf.muteBar, title: INFO['mute next bar'], onChange: (v) => { perf.muteBar = v; saveSettings(); if (!v) flushMutes(); } }));
  ui.live = mount('live-mode', toggleChip({ label: 'live mode', on: perf.live, title: INFO['live mode'], onChange: (v) => { perf.live = v; padHints = 3; saveSettings(); paintLeds(); movePill(); } }));
  ui.consoleLog = mount('console-log-chip', toggleChip({ label: 'console log', on: face.log, title: INFO['console log'], onChange: setLog }));
  ui.night = mount('night-chip', toggleChip({ label: 'night', on: face.night, title: INFO.night, onChange: setNight }));
  ui.choke = mount('choke-select', segmented({ options: [[-1, 'nothing']], value: -1, chips: true, onChange: (v) => { m.lane.choke = v; sync(); } }));
}

// ---- samples: load a file, record the mic, or take a slice from Unassembler; drop a file on a ring ----
async function assignSample(li, rec) {
  if (!rec?.channels?.length) return; await wake(); const id = `orbits-${Date.now().toString(36)}-${li}`;
  await putSample(id, rec); sampleBufs.set(id, toAudioBuffer(rec, T.getContext().rawContext));
  // a fresh slice plays whole from its first sample (loadSample), not with the drum's short decay or skip-in
  const lane = m.lanes[li]; lane.loadSample({ id, name: rec.name || 'sample' }); buildVoice(li); m.select(li); sync();
  if (!playing) hitSound(lane, T.now(), false);
}
async function sampleFromFile(li, file) {
  try { await wake(); const buf = await T.getContext().rawContext.decodeAudioData(await file.arrayBuffer()); await assignSample(li, trimRecord(fromAudioBuffer(buf, file.name), { thr: 0.001, maxSec: 8 })); }
  catch (e) { $('sample-name').textContent = `could not read ${file.name}: ${e.message || e}`; }
}
let micRec = null;
async function toggleMic() {
  if (micRec) { micRec.stop(); return; }
  try {
    await wake(); const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const chunks = [], li = m.selected, mr = new MediaRecorder(stream); micRec = mr; $('btn-mic').classList.add('armed'); $('btn-mic').textContent = '■ stop mic';
    const auto = setTimeout(() => mr.state === 'recording' && mr.stop(), 4000);   // 4 s max
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = async () => {
      clearTimeout(auto); stream.getTracks().forEach(t => t.stop()); micRec = null; $('btn-mic').classList.remove('armed'); $('btn-mic').textContent = '● mic';
      try { const buf = await T.getContext().rawContext.decodeAudioData(await new Blob(chunks).arrayBuffer()); await assignSample(li, trimRecord(fromAudioBuffer(buf, `mic ${new Date().toTimeString().slice(0, 5)}`))); } catch (e) { $('sample-name').textContent = `mic: ${e.message || e}`; }
    };
    mr.start();
  } catch (e) { $('sample-name').textContent = `mic: ${e.message || e}`; }
}
/** S2: the Unassembler hand-off (8 slices today, 16 in the v2 payload: samples.js readSlices) as tiles, one to a lane,
 *  or all of them to the selected lane as a slice set. */
async function renderSlices() {
  const sl = readSlices(await getSample(SLICES_KEY)), el = $('slice-select'); el.innerHTML = '';
  if (!sl) { el.innerHTML = '<p class="hint tight">No slices yet: in Unassembler press <b>→ orbits</b>, they show up here.</p>'; return; }
  const short = sl.name.replace(/\.[^.]+$/, '').split(' · ')[0].slice(0, 16), head = document.createElement('p'); head.className = 'hint tight slice-head';
  head.textContent = `${sl.slices.length} slices of ${sl.name.split(' · ')[0]}${sl.mode === 'set' ? ' (sent as one break)' : ''} · tap one to put it on this lane, or `;
  const all = document.createElement('button'); all.type = 'button'; all.className = 'small'; all.id = 'btn-slices-all'; all.textContent = 'all to this lane'; all.title = 'Put every slice on the selected lane as a slice set: step N plays slice N';
  all.onclick = () => assignSlices(m.selected, short, sl.sampleRate, sl.slices); head.appendChild(all); el.appendChild(head);
  sl.slices.forEach((ch, k) => el.appendChild(sliceTile(ch[0], k + 1, `slice ${k + 1}`, () => assignSample(m.selected, { name: `${short} #${k + 1}`, sampleRate: sl.sampleRate, channels: ch }))));
}
/** S1: put a slice set on lane li: each slice stored under its own id, the lane plays slice i on step i. The break is
 *  laid across the lane (a step per slice, all on, at the speed that makes them last the break at this tempo) unless the
 *  lane already plays a slice set with steps on: then the chops stay (Lane.loadBreak). */
async function assignSlices(li, name, sampleRate, slices) {
  if (!slices?.length) return; await wake(); const base = `orbits-${Date.now().toString(36)}-${li}`, ctx = T.getContext().rawContext, use = slices.slice(0, MAX_SLICES);
  const ids = await Promise.all(use.map(async (channels, k) => { const id = `${base}-s${k}`, rec = { name: `${name} #${k + 1}`, sampleRate, channels }; await putSample(id, rec); sampleBufs.set(id, toAudioBuffer(rec, ctx)); return id; }));
  const lane = m.lanes[li]; lane.loadBreak({ name, slices: ids, sec: use.reduce((a, ch) => a + ch[0].length, 0) / sampleRate, bpm: tempo });
  buildVoice(li); applySound(li); m.select(li); sync();
  if (!playing) hitSound(lane, T.now(), false, null, null, kit, 0);
}
/** S2: a whole break from a file, cut into 8 or 16 equal slices, onto lane li as a slice set. Kept as it is (no
 *  silence trim: the cut points follow the bar), up to 16 s. */
let breakN = 16;
async function breakFromFile(li, file, n = breakN) {
  try {
    await wake(); const buf = await T.getContext().rawContext.decodeAudioData(await file.arrayBuffer()), rec = fromAudioBuffer(buf, file.name);
    const cap = Math.round(16 * rec.sampleRate); if (rec.channels[0].length > cap) { rec.channels = rec.channels.map(d => d.slice(0, cap)); toast(`${file.name} is longer than 16 s: its first 16 s are cut into slices`, 4000); }
    await assignSlices(li, file.name.replace(/\.[^.]+$/, '').slice(0, 16), rec.sampleRate, chopEqual(rec, n));
  } catch (e) { $('sample-name').textContent = `could not read ${file.name}: ${e.message || e}`; }
}
/** S3: the lane's own start / end and direction, under the sample row (only on a sample lane). */
function renderTrim() {
  const lane = m.lane, on = lane.voice === 'sample' && !!lane.sample; $('sample-trim').hidden = !on; if (!on) return;
  const tr = lane.trimAt(null); sliders['trim:start'].set(Math.round(tr.start * 100)); sliders['trim:end'].set(Math.round(tr.end * 100)); ui.rev.set(tr.rev);
}
function buildSampleUI() {
  $('btn-sample-file').onclick = () => $('sample-file').click();
  $('sample-file').onchange = () => { const f = $('sample-file').files[0]; if (f) sampleFromFile(m.selected, f); $('sample-file').value = ''; };
  $('btn-mic').onclick = toggleMic;
  $('btn-break-file').onclick = () => $('break-file').click();
  $('break-file').onchange = () => { const f = $('break-file').files[0]; if (f) breakFromFile(m.selected, f); $('break-file').value = ''; };
  ui.breakN = mount('break-n', segmented({ options: [[8, '8'], [16, '16']], value: breakN, onChange: (n) => { breakN = n; } }));
  const trim = (k, v) => { m.lane.setTrim(k, v); if (k === 'rev') ensureSample(m.lane); save(); if (awake && !playing) hitSound(m.lane, T.now(), false); };
  for (const k of ['start', 'end']) { const g = trimGauge(k, (v) => trim(k, v)); sliders['trim:' + k] = g; $('sample-trim-gauges').appendChild(g.el); }
  ui.rev = mount('sample-rev', toggleChip({ label: 'backwards', title: 'Play the sample (every slice) backwards', onChange: (v) => trim('rev', v) }));
  addEventListener('storage', (e) => { if (e.key === SLICES_PING) renderSlices(); });
  for (const ev of ['dragenter', 'dragover']) $('cv').addEventListener(ev, (e) => e.preventDefault());
  $('cv').addEventListener('drop', (e) => { e.preventDefault(); const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('audio') || /\.(wav|mp3|aif+|flac|ogg|m4a)$/i.test(f.name)); if (!f) return; const r = scene.pick(e.clientX, e.clientY); sampleFromFile(r >= 0 ? r : m.selected, f); });
  renderSlices();
}

// ---- dice: free or locked (seeded) randomness ----
function renderDice() {
  $('btn-dice').classList.toggle('armed', dice.locked); $('btn-dice').textContent = dice.locked ? '● dice locked' : '○ dice free';
  $('dice-seed').value = dice.seed; sliders.diceRepeat?.set(dice.repeat);
}
function buildDiceUI() {
  $('btn-dice').onclick = () => { dice.locked = !dice.locked; saveSettings(); renderDice(); readout(); };
  $('dice-seed').onchange = (e) => { dice.seed = Math.max(1, +e.target.value | 0); saveSettings(); readout(); };
  $('dice-roll').onclick = () => { dice.reroll(); saveSettings(); renderDice(); readout(); };
  // the groove randomize rolls from this seed (the toast's "dice N" makes it again); Shift+click: the wild roll
  $('dice-make').onclick = (e) => rollPattern(e.shiftKey, true);
  sliders.diceRepeat = makeGauge({ label: 'repeat · loops', min: 1, max: 16, value: dice.repeat, say: (v) => `every ${v} loop${v === 1 ? '' : 's'}`, title: INFO['dice repeat'], color: 'var(--signal-cyan)', onChange: (v) => { dice.repeat = v; saveSettings(); readout(); } }); $('dice-gauges').appendChild(sliders.diceRepeat.el);
  renderDice();
}

// ---- share & export ----
const download = (bytes, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const pad2 = (n) => String(n).padStart(2, '0');
/** Local time to the second, so two exports in the same minute don't overwrite each other. */
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
/** Length of a render in master ticks: N bars, or whole bars holding whole polyrhythm cycles (capped at 64 bars). */
function renderTicks() { const v = ui.expLen.value, bar = m.barTicks(); return v === 'cycle' ? wholeBarCycle(m.cycleTicks(cycleOpts()), bar, 64) : { ticks: +v * bar, capped: false }; }
/** ACID tag of a render N bars long: beats in the meter's beat unit (a 7/8 bar = 7), plus the meter. */
const acidOf = (bpm, nBarsLong, meter = m.meter, loop = true) => { const { num, den } = meterParts(meter); return { bpm, beats: nBarsLong * num, num, den, loop }; };
// Every audio export is whole bars at the current tempo, so a DAW lines it up. Renders start PRE_ROLL before the
// earliest hit (renderLead, jam.js: the master needs it to settle) and ring out for a tail long enough for the delay to
// die away; then either
//   loop     (default): foldLoop wraps the tail onto the start → exactly N bars that loop seamlessly (Session clips)
//   one-shot:           starts on the downbeat, keeps the ring-out, rounded up to whole bars (place once in a song)
// The stereo WAV goes through the master compressor + limiter, which look ahead and so delay the sound: the measured
// latency is taken off, so the first downbeat is on sample 0 like the (raw) stems.
const tailSec = () => Math.max(2.5, 60 / tempo * 0.75 * 9 + 1.5);   // 9 dotted-eighth echoes at 0.3 feedback ≈ -94 dB, plus decay
/**
 * Every offline render (exports, the kit, a jam ring-out) → an AudioBuffer. Like T.Offline, except Tone's global context
 * is the offline one only while `build(ctx)` runs, synchronously: T.Offline keeps it global across the build's awaits
 * (the dsp module, the worklet flush), and a live hit scheduled meanwhile (the pattern playing on) would make its nodes
 * there and be lost. build returns the kit it made (its worklets are flushed before the render starts), or null.
 */
async function offline(build, sec, channels, sr, { dsp = engine === 'dsp' } = {}) {
  const live = T.getContext(), ctx = new T.OfflineContext(channels, sec, sr);
  if (dsp) await ensureDsp(ctx);
  T.setContext(ctx); let k; try { k = build(ctx); } finally { T.setContext(live); }
  if (k) await dspFlush(k);   // the worklets must hold every hit before the render starts
  return (await ctx.render()).get();
}
/** Stems on an offline kit: each lane bus to its own channel pair, nothing through the master; dry (E2): every lane's
 *  delay leaves its bus for one more pair, the delay return. */
function routeStems(k, dry = false) {
  const ctx = T.getContext().rawContext, n = k.chains.length, merger = ctx.createChannelMerger(2 * n + (dry ? 2 : 0)); merger.connect(ctx.destination); k.master.disconnect();
  const pair = (node, i) => { const sp = ctx.createChannelSplitter(2); node.connect(sp); sp.connect(merger, 0, 2 * i); sp.connect(merger, 1, 2 * i + 1); };
  const ret = dry ? new T.Gain(1) : null; if (ret) pair(ret, n);
  k.chains.forEach((c, i) => { c.bus.disconnect(); pair(c.bus, i); if (ret) { c.delay.disconnect(); c.delay.connect(ret); } });
}
const latencyCache = new Map();   // per sample rate: the look-ahead is counted in samples
async function masterLatency(sr) {
  if (latencyCache.has(sr)) return latencyCache.get(sr);
  const at = 0.01, b = await offline(() => {
    const ctx = T.getContext().rawContext, g = makeMaster(1), buf = ctx.createBuffer(1, 1, ctx.sampleRate), src = ctx.createBufferSource();
    buf.getChannelData(0)[0] = 0.5; src.buffer = buf; T.connect(src, g); src.start(at); return null;
  }, 0.2, 1, sr, { dsp: false });
  const d = b.getChannelData(0), i = d.findIndex(x => Math.abs(x) > 1e-4), lat = i < 0 ? 0 : Math.max(0, i / sr - at);
  latencyCache.set(sr, lat); return lat;
}
/** The pattern's hit list for an export (one roll: exportDice), `ticks` long. */
const exportHits = (ticks = renderTicks().ticks) => collectHits(m, { from: 0, to: ticks, tempo, dice: exportDice() });
/** The current pattern rendered offline at the export rate: { chans, sr, bars, hits, capped, loop }. stems: raw kit, a
 *  pair per lane; dry (E2): the lanes' delays leave their lane pairs for one more pair, the delay return, so the lane
 *  pairs plus the return still add up to the wet stems' sum. hits: a hit list already rolled (E5: export all renders
 *  the mix and the stems from one). bars: this many bars instead of the export drawer's length (I3: 4-bar share). */
async function renderPattern({ stems = false, dry = false, hits = null, bars = null } = {}) {
  const { ticks, capped } = bars ? { ticks: bars * m.barTicks(), capped: false } : renderTicks(), sec = ticks * tickSec(), barSec = m.barTicks() * tickSec(), loop = ui.expLoop.value, rate = exp.rate;
  const fx = !stems && exp.printFx && pfx.filter !== 0 ? { filter: pfx.filter, sr: T.getContext().rawContext.sampleRate } : null;   // P6: the mix only (stems stay raw), at the cutoffs heard live
  hits ??= exportHits(ticks);
  // a nudge or a push can put a hit well before tick 0: the render starts early enough to hold it (loops wrap it)
  const lead = renderLead(hits);
  for (const l of m.lanes) await ensureSample(l);
  const lat = stems ? 0 : await masterLatency(rate);
  const b = await offline(({ transport }) => {
    transport.bpm.value = tempo;
    const k = makeKit({ raw: stems, fx });   // a fresh kit in the offline context, same voices and sounds (P6: the filter only with "print FX")
    if (stems) routeStems(k, dry);
    // A2: the curves' block lines as the live clock schedules them, from the one before tick 0 (what the pre-roll and a
    // loop's wrap hear) through the tail (live, the pattern plays on)
    for (const r of autoRamps(m, -MIDI_DIV, ticks + Math.ceil(tailSec() / tickSec()), 0)) rampAuto(k, r.li, r.k, lead + r.t * tickSec(), r.v);
    // a one-shot starts on the downbeat, so a hit humanized before it is clamped there instead of losing its attack
    for (const h of hits) hitSound(m.lanes[h.li], (loop ? h.time : Math.max(0, h.time)) + lead, h.accent, h.lock, h.vel, k, h.slice, null, h.auto);
    return k;
  }, lead + sec + tailSec(), stems ? 2 * m.lanes.length + (dry ? 2 : 0) : 2, rate);   // stems: a stereo pair per lane (8 or 12 channels, + the return)
  const sr = b.sampleRate, pre = lead + lat, raw = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const chans = loop ? raw.map(d => foldLoop(d, sr, sec, pre)) : oneShot(raw, sr, sec, pre, barSec);
  return { chans, sr, bars: Math.round(chans[0].length / sr / barSec), patternBars: ticks / m.barTicks(), hits, capped, loop, fx };
}
const nBars = (n) => `${n} bar${n === 1 ? '' : 's'}`;
const fmtNote = () => `${exp.bits === 32 ? '32-bit float' : `${exp.bits}-bit`} ${exp.rate / 1000} kHz`;
/** Tags of a render: tempo (ACID) always, the smpl loop when it is a loop (a one-shot is placed once, not looped). */
const renderTags = (r) => ({ acid: acidOf(tempo, r.bars), smpl: r.loop });
const mixWav = (r) => tagWav(encodeWav(r.chans, r.sr, { bits: exp.bits }), r.sr, renderTags(r));
/** File names carry tempo and length; a one-shot names the pattern and its ring-out ("4bars+2tail-oneshot"). */
const fileBase = (kind, r, bpm = tempo) => `orbits-${kind ? `${kind}-` : ''}${bpm}bpm-${r.loop ? nBars(r.bars).replace(' ', '') : `${nBars(r.patternBars).replace(' ', '')}+${r.bars - r.patternBars}tail-oneshot`}-${stamp()}`;
const renderNote = (r) => `${r.loop ? nBars(r.bars) : `${nBars(r.patternBars)} + ${nBars(r.bars - r.patternBars)} ring-out`} at ${tempo} bpm, ${r.loop ? 'loops seamlessly' : 'one-shot'}${r.capped ? ' · the cycle is longer than 64 bars: cut at 64, so the loop point falls mid-cycle' : ''}${r.fx ? ` · performance filter printed (${filterSay(Math.round(r.fx.filter * 100))})` : ''}`;
// One take, one hit list: free dice still roll, but from a per-take seed, so WAV, stems and MIDI made while this roll
// is current hold the same hits (count and times). "new roll" draws another take; locked dice use their own seed.
const newRoll = () => 1 + Math.floor(Math.random() * 99999);
let expRoll = newRoll();
const exportDice = () => dice.locked ? dice : Dice.take(expRoll);
const rollNote = () => dice.locked ? `dice ${dice.seed}` : `roll ${expRoll}`;
/** What a share is called: the library setup on screen (none: shown as UNTITLED, which is never written into the
 *  link); lineage rides along as `from`. */
const shareName = () => (libCurrent && lib.get(libCurrent)?.name) || null;
/** A5: the link stays under LINK_MAX (encodeShareFit: curves at half resolution, else left out); `note` says so. */
async function shareUrl() {
  const name = shareName(), pre = `${location.origin}${location.pathname}#p=`, { code, curves } = await encodeShareFit(m.toJSON(), tempo, { title: name, from: lineage }, LINK_MAX - pre.length);
  const note = curves === 'none' ? 'the automation curves were left out: the link would be too long' : curves === 'half' ? 'the automation curves at half resolution, to keep the link short' : '';
  return { code, title: name || UNTITLED, url: pre + code, note };
}
// The OS share sheet where it is a phone's habit (touch); on a desktop the clipboard is the one-tap path.
const touchShare = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;
/** I2: the link. Touch with a share sheet: the sheet; else the clipboard; clipboard blocked: the address bar. Every
 *  outcome says so in a toast (the export drawer may be closed). The address bar keeps no #p= link otherwise: on a
 *  reload the link would win over the beat you made since. */
async function shareLink() {
  slog?.act('export', null, 'link');
  const { code, title, url, note } = await shareUrl(), also = note ? ` · ${note}` : '';
  if (touchShare()) { try { await navigator.share({ title: `${title} · orbits`, url }); toast(`shared${also}`, note ? 5000 : 2400); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); $('exp-status').textContent = `link copied (${url.length} chars)${also}`; toast(`link copied · paste it anywhere${also}`, note ? 5000 : 2400); }
  catch { history.replaceState(null, '', `#p=${code}`); $('exp-status').textContent = `link is in the address bar (clipboard blocked)${also}`; toast('the link is in the address bar: copy it from there', 4000); }
}
/** A file into the share sheet (with the remix link as its text) when the browser can share files, else a download. */
async function shareFile(file, what) {
  const { title, url } = await shareUrl();
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${title} · orbits`, text: `${title} · remix it: ${url}` }); toast(`${what} shared`); return; }
    catch (e) { if (e.name === 'AbortError') { toast('share cancelled'); return; } }   // NotAllowed (no gesture left after a long render): download
  }
  // no file sharing here: the file downloads and the remix link goes to the clipboard, to send along with it
  download(file, file.name, file.type); let copied = false; try { await navigator.clipboard.writeText(url); copied = true; } catch {}
  toast(`${what} saved: ${file.name}${copied ? ' · remix link copied' : ''}`, 4000);
}
/** I3: one tap → 4 bars of the mix (the export format, loop as set) → share sheet or download. */
async function shareAudio() {
  slog?.act('export', null, 'audio');
  await wake(); toast('rendering 4 bars…', 15000);
  const r = await renderPattern({ bars: 4 });
  await shareFile(new File([mixWav(r)], `${fileBase('', r)}.wav`, { type: 'audio/wav' }), '4 bars'); questEvent({ type: 'export', what: 'share' });
}
/**
 * I5 orbit postcard: 4 bars of the rings as they play, with their sound, as a WebM: the canvas's captureStream (30 fps)
 * plus the live master (tapped after its limiter into a MediaStreamAudioDestinationNode), through MediaRecorder. Real
 * time, so it records what you hear (performance FX, a jam, evolve included). The bars are the beat's own: the clock
 * hands over its next bar line (Play's downbeat when the postcard starts the beat, which it stops again after), a gate
 * on the audio clock lets exactly those 4 bars through as they leave the master (its look-ahead added, a few ms of fade
 * at each end: no cut mid-hit), and the recorder runs just around them (a timer can't start it to the sample).
 * Shared like the audio, with the remix link (and its lineage) as the text.
 */
const POSTCARD_BARS = 4; let postcarding = false;
const sleep = (sec) => new Promise(r => setTimeout(r, Math.max(0, sec * 1000)));
async function recordPostcard() {
  if (postcarding) return; const cv = $('cv');
  if (!window.MediaRecorder || !cv.captureStream) throw new Error('this browser cannot record video');
  slog?.act('export', null, 'postcard');   // only a postcard that starts
  postcarding = true; $('share-postcard').disabled = true;
  const raw = T.getContext().rawContext, dest = raw.createMediaStreamDestination(), gate = raw.createGain(); let out = null, ours = false, stream = null, mr = null;
  try {
    await wake(); out = kit.master.out; gate.gain.value = 0; out.connect(gate); gate.connect(dest);
    const lat = await masterLatency(raw.sampleRate);
    stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    mr = new MediaRecorder(stream, mimeType ? { mimeType } : {}); const chunks = [], stopped = new Promise(r => { mr.onstop = r; });
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    // the next bar line's audio time, from the scheduler (Play's tick 0 when the postcard starts the beat); null as soon
    // as the beat stops (checked every 100 ms), or if it never gets there
    const until = raw.currentTime + m.barTicks() * tickSec() + 2;
    const line = new Promise(r => { const end = (t) => { clearInterval(iv); barWait = null; r(t); }, iv = setInterval(() => { if (!playing || raw.currentTime > until) end(null); }, 100); barWait = end; });
    if (!playing) { ours = true; await togglePlay(); } else toast('postcard: it starts on the next bar line…', 4000);   // up to a bar of waiting
    const t0 = await line; if (t0 == null) throw new Error('the beat stopped before a bar line');
    const w = postcardWindow({ line: t0, lat, barSec: m.barTicks() * tickSec(), bars: POSTCARD_BARS }), g = gate.gain;
    g.setValueAtTime(0, w.fadeIn); g.linearRampToValueAtTime(1, w.a); g.setValueAtTime(1, w.fadeOut); g.linearRampToValueAtTime(0, w.b);
    await sleep(w.recStart - raw.currentTime); mr.start(250); toast(`recording a postcard: ${nBars(POSTCARD_BARS)}…`, (w.b - raw.currentTime) * 1000 + 2000);
    await sleep(w.recStop - raw.currentTime); mr.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
    if (ours && playing) await togglePlay();
    const type = (mr.mimeType || 'video/webm').split(';')[0], blob = new Blob(chunks, { type }); if (!blob.size) throw new Error('the recording came out empty');
    window.__postcard = blob;   // the browser check reads it back (tracks, size)
    await shareFile(new File([blob], `orbits-postcard-${tempo}bpm-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type }), 'postcard');
  } finally {   // whatever happened: no recorder or canvas capture left running, the master untapped
    if (mr?.state === 'recording') mr.stop(); stream?.getTracks().forEach(t => t.stop());
    try { out?.disconnect(gate); } catch {} gate.disconnect(); barWait = null; postcarding = false; $('share-postcard').disabled = false;
  }
}
/** I5 Seed of the Day: the day's constellation (share.js seedOfDay: UTC date → seed → musical randomize on a fresh
 *  4-lane machine) with the dice locked to that seed, so its chance and humanize roll the same for everyone. One undo
 *  step; the seed becomes its lineage, so what you share from it says where it started. */
function loadDaySeed() {
  const s = seedOfDay(utcDay()), was = slog && slogBefore();
  dice.locked = true; dice.seed = s.seed; dice.repeat = 1; saveSettings(); renderDice();
  loadMachine(s.m, { bpm: s.tempo }); leaveSetup(); setLineage(s.title); slog?.act('load', was, slogWords(), { what: 'seed of the day', absorb: true });
  toast(`today's seed · ${s.family} · dice ${s.seed} · ${s.tempo} bpm · make it yours, then share it`, 5000);
}
async function exportWav() {
  slog?.act('export', null, 'wav');
  await wake(); $('exp-status').textContent = 'rendering…';
  const r = await renderPattern();
  download(mixWav(r), `${fileBase('', r)}.wav`, 'audio/wav');
  $('exp-status').textContent = `WAV: ${r.hits.length} hits · ${rollNote()} · ${renderNote(r)} · ${fmtNote()}`; questEvent({ type: 'export', what: 'wav' });
}
/** A MIDI file of `hits` (the pattern's, or a chain's: `states`, its slots), a track per lane or one Drum-Rack track
 *  (exp.midiOne, E3). */
function midiOf(hits, { states = null, bars, ccs = null }) {
  // a chain is as long as its slots' bars in their own meters, with a time signature wherever a slot changes it
  const nl = Math.max(m.lanes.length, ...(states || []).map(s => s?.lanes?.length || 0));   // a track per lane: 4 or 6
  return hitsToMidi(hits, { tempo, lanes: pmidi.lanes.slice(0, nl), map: pmidi.lanes, names: laneNames(nl), gateSec: pmidi.gateMs / 1000, bars, loop: ui.expLoop.value, meter: m.meter, meters: states ? chainMeters(states, bank.chainBars) : null, sixteenths: states ? chainSixteenths(states, bank.chainBars) : null, merge: exp.midiOne, ccs });   // early notes wrap like the loop WAV
}
/** A7: the pattern's automation (step values, curves) as CCs, `ticks` long, for the hit list of an export. */
const patternCCs = (hits, ticks) => autoCCs(m, hits, autoRamps(m, 0, ticks, 0), { cc: pmidi.cc, tickSec: tickSec() });
const midiNote = (ccs = []) => `${exp.midiOne ? 'one Drum-Rack track' : 'a track per lane'}${!ccs.length ? '' : exp.midiOne ? ' · one track holds no per-lane CCs: the automation is left out (a track per lane keeps it)' : ` · automation as ${ccs.length} CC${ccs.length === 1 ? '' : 's'}`}`;
function exportMidi() {
  slog?.act('export', null, 'midi');
  const chain = ui.expWhat.value === 'chain' && bank.chain.length > 1, { ticks } = renderTicks();
  const states = chain ? bank.chain.map(i => bank.get(i)) : null, bars = chain ? bank.chainBars * bank.chain.length : ticks / m.barTicks();
  const { hits, ccs } = chain ? collectChainAuto(states, { bars: bank.chainBars, tempo, dice: exportDice(), restart: bank.restart, cc: pmidi.cc }) : (h => ({ hits: h, ccs: patternCCs(h, ticks) }))(exportHits(ticks));
  download(midiOf(hits, { states, bars, ccs }), `${fileBase(chain ? 'chain' : '', { loop: true, bars })}.mid`, 'audio/midi'); $('exp-status').textContent = `MIDI: ${hits.length} notes · ${rollNote()} · ${bars} bars · ${midiNote(ccs)}${chain ? ` · chain of ${bank.chain.length}` : ''}`; questEvent({ type: 'export', what: 'midi' });
}
/**
 * E5 export all: ONE hit list (this roll) → the mix WAV, the stems (dry + return when "dry stems" is on) with their raw
 * mix, and the MIDI, in one zip, every file named after one base. The pattern only (a chain is MIDI-only: its audio
 * would need every slot's kit). Both renders get the same hits, so the files line up note for note.
 */
async function exportAll() {
  slog?.act('export', null, 'all');
  await wake(); $('exp-status').textContent = `rendering the mix and ${m.lanes.length} stems…`;
  const { ticks } = renderTicks(), hits = exportHits(ticks), mix = await renderPattern({ hits }), st = await renderPattern({ stems: true, dry: exp.dry, hits });
  const base = fileBase('all', mix), n = m.lanes.length, pairs = Array.from({ length: n }, (_, i) => [st.chans[2 * i], st.chans[2 * i + 1]]);
  const { files, gain } = stemFiles(pairs, laneNames(n), st.sr, base, { bits: exp.bits, ...renderTags(st), ret: exp.dry ? [st.chans[2 * n], st.chans[2 * n + 1]] : null });
  files.unshift({ name: `${base}/${base}-mix.wav`, data: mixWav(mix) });
  const ccs = patternCCs(hits, ticks); files.push({ name: `${base}/${base}.mid`, data: midiOf(hits, { bars: ticks / m.barTicks(), ccs }) });
  download(zipStored(files), `${base}.zip`, 'application/zip');
  $('exp-status').textContent = `all: mix + ${n} ${exp.dry ? 'dry stems + delay return' : 'stems'} + raw mix + MIDI (${midiNote(ccs)}) · ${hits.length} hits · ${rollNote()} · ${renderNote(mix)} · ${fmtNote()}${gain < 1 ? ` · stems scaled ${(20 * Math.log10(gain)).toFixed(1)} dB` : ''}${ui.expWhat.value === 'chain' ? ' · this pattern only: a chain exports as MIDI' : ''}`; questEvent({ type: 'export', what: 'all' });
}
/**
 * E4 kit: each lane's sound as one-shot WAVs to load into Simpler or a Drum Rack, an accent and a normal hit (velocity
 * 1 and 0.7, as the pattern plays them), with the lane's current voice, knobs, drive, tone and pan, but no delay (a
 * rack has its own sends) and no master. 2 s at most, cut where it falls silent, the onset on sample 0. Tempo-free:
 * no ACID, no smpl. One offline render per hit, so no lane chokes or bleeds into another. Named like the stems.
 */
const KIT_PRE = 0.05, KIT_SEC = 2;
async function exportKit() {
  slog?.act('export', null, 'kit');
  await wake(); const n = m.lanes.length, rate = exp.rate, shots = [], base = `orbits-kit-${stamp()}`, names = laneNames(n);
  for (const l of m.lanes) await ensureSample(l);
  for (let li = 0; li < n; li++) for (const accent of [true, false]) {
    $('exp-status').textContent = `rendering the kit: lane ${li + 1} of ${n}…`;
    // 0.1 s past the longest one-shot: a voice that speaks a few ms after its hit still has its whole 2 s to the cut
    const b = await offline(() => { const k = makeKit({ raw: true }); for (const c of k.chains) c.send.gain.value = 0; hitSound(m.lanes[li], KIT_PRE, accent, null, null, k); return k; }, KIT_PRE + KIT_SEC + 0.1, 2, rate);
    shots.push({ name: `${base}/orbits-kit-${li + 1}-${safeName(names[li])}-${accent ? 'accent' : 'normal'}.wav`, chans: trimOneShot([b.getChannelData(0), b.getChannelData(1)], rate, { pre: KIT_PRE, maxSec: KIT_SEC }) });
  }
  // no master: a raw hit can go over 0 dBFS, which PCM would clip. One gain for the whole kit keeps the lanes' balance
  // and each accent / normal pair as it plays (32-bit float keeps the levels as rendered)
  const g = headroomGain(shots.flatMap(s => s.chans), exp.bits), files = shots.map(s => ({ name: s.name, data: encodeWav(g === 1 ? s.chans : s.chans.map(d => d.map(x => x * g)), rate, { bits: exp.bits }) }));
  download(zipStored(files), `${base}.zip`, 'application/zip');
  $('exp-status').textContent = `kit: ${n} lanes × accent + normal · one-shots, no delay · ${fmtNote()}${g < 1 ? ` · all scaled ${(20 * Math.log10(g)).toFixed(1)} dB to avoid clipping` : ''}`;
}
/** Open a #p= link (once: it leaves the address bar). first = a first visit: there is no beat of yours behind it, so
 *  history starts at the link and play pulses, like the demo. */
async function loadShared({ first = false } = {}) {
  const mm = /#p=([\w-]+)/.exec(location.hash); if (!mm) return; history.replaceState(null, '', location.pathname + location.search);
  try {
    const o = await decodeShare(mm[1]), was = slog && slogBefore(); loadMachine(o.m, { bpm: o.tempo, exact: true }); leaveSetup(); slog?.act('load', was, slogWords(), { what: 'link', absorb: true });
    if (first) hist.restart();
    $('exp-status').textContent = 'loaded from the link (undo brings your pattern back)'; showGift(o, first);
  } catch (e) { $('exp-status').textContent = `link: ${e.message}`; toast(`link: ${e.message}`, 4000); }   // decodeShare's words are for people
}
/**
 * I2: a shared beat opens as a gift, a full-screen card: its rings drawn small, title, tempo, where it came from, and
 * one big "▶ tap to hear this orbit" (the tap is also the gesture audio needs). The button follows the transport
 * (giftPlay): a link opened while the beat plays is heard at once, so it reads "■ stop" from the start. Once it has
 * played, "remix" takes it as yours (the lineage becomes its title, or keeps its own lineage when it has none). "back
 * to my beat" (not on a first visit: there is none) undoes the load. Esc or × keep it, like remix. The pattern is
 * already loaded underneath: the card only frames it.
 */
function showGift(o, first) {
  const d = $('gift'); if (!d.open) d.showModal();   // open first: the canvas has its CSS size only once shown
  const cv = $('gift-rings'), px = devicePixelRatio || 1, size = cv.clientWidth || 180;
  cv.width = cv.height = Math.round(size * px); const g = cv.getContext('2d'); g.setTransform(px, 0, 0, px, 0, 0);
  drawRings(g, shapesOf(o.m), { cx: size / 2, cy: size / 2, r: size / 2 - 4, hex: LANE_HEX });
  const hear = $('gift-hear'), remix = $('gift-remix');
  $('gift-title').textContent = linkName(o) || UNTITLED;
  $('gift-meta').textContent = `${Math.round(o.tempo)} bpm · ${o.m.lanes.length} rings${o.m.meter && o.m.meter !== '4/4' ? ` · ${o.m.meter}` : ''}`;
  $('gift-from').textContent = o.from ? `from “${o.from}”` : ''; $('gift-from').hidden = !o.from; $('gift-back').hidden = first;
  let heard = false;
  giftPlay = () => { heard ||= playing; hear.textContent = playing ? '■ stop' : heard ? '▶ play' : '▶ tap to hear this orbit'; remix.hidden = !heard; };
  giftPlay();
  const take = (msg) => { setLineage(lineageOf(o)); if (d.open) d.close(); if (msg) toast(msg, 3500); };
  hear.onclick = async () => { const was = heard; await togglePlay(); if (heard && !was) remix.focus(); };
  remix.onclick = () => take('it is yours now · change anything, then share it back');
  $('gift-back').onclick = () => { if (d.open) d.close(); undo(); toast('back to your beat'); };
  $('gift-x').onclick = () => take('');
  d.oncancel = (e) => { e.preventDefault(); take(''); };   // Esc keeps the beat (like remix), it never undoes
  d.onclose = () => { giftPlay = null; };
  hear.focus();
}
function buildExportUI() {
  ui.expLen = mount('exp-len', segmented({ options: [[1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16 bars'], ['cycle', 'cycle', 'whole bars that hold whole polyrhythm cycles (max 64 bars)']], value: 4 }));
  ui.expLoop = mount('exp-loop', toggleChip({ label: 'render as loop', on: true, title: 'on: the ring-out wraps onto the start, so the file is exactly N bars and loops seamlessly (Session clips). off: one-shot that starts on the downbeat and keeps its ring-out, rounded up to whole bars (place it once in a song). MIDI follows it: a note nudged or pushed before the downbeat wraps to the end (on) or starts on the downbeat (off).' }));
  ui.expBits = mount('exp-bits', segmented({ options: [[16, '16'], [24, '24'], [32, '32f', '32-bit float: nothing clips, levels as rendered']], value: exp.bits, onChange: (v) => { exp.bits = v; saveSettings(); } }));
  ui.expRate = mount('exp-rate', segmented({ options: [[44100, '44.1'], [48000, '48', '48 kHz (video, most interfaces)']], value: exp.rate, onChange: (v) => { exp.rate = v; saveSettings(); } }));
  ui.expRing = mount('exp-ring', toggleChip({ label: 'jam ring-out', on: exp.ring, title: 'jam takes add each lane\'s ring-out, the echoes and decays their last bar line cut, as "-ringout" files: place them right after the take. Made from the hits the take played, so they hold no new hits even when the pattern plays on.', onChange: (v) => { exp.ring = v; saveSettings(); } }));
  ui.expDry = mount('exp-dry', toggleChip({ label: 'dry stems', on: exp.dry, title: 'stems without their delay: every lane\'s echoes go to one more stem pair, "delay return", so you can treat them in the DAW. The stems plus the return still add up to the mix.', onChange: (v) => { exp.dry = v; saveSettings(); } }));
  ui.expPrintFx = mount('exp-print-fx', toggleChip({ label: 'print FX', on: exp.printFx, title: 'on: the WAV mix (and the mix in export all) goes through the performance filter as it is set now. Stems, the kit and jam takes never do; a delay throw is a moment, never printed. off: exports ignore the performance FX.', onChange: (v) => { exp.printFx = v; saveSettings(); } }));
  ui.expMidiOne = mount('exp-midi-one', segmented({ options: [[false, 'per lane', 'a MIDI track per lane, each on its own channel'], [true, 'one track', 'one track for a Drum Rack: every lane on its note from the MIDI drawer, on lane 1\'s channel']], value: exp.midiOne, onChange: (v) => { exp.midiOne = v; saveSettings(); } }));
  ui.expWhat = mount('exp-what', segmented({ options: [['pattern', 'this pattern'], ['chain', 'the chain', 'each slot of the running chain for its bars']], value: 'pattern' }));
  $('exp-link').onclick = shareLink; $('exp-wav').onclick = () => exportWav().catch(e => { $('exp-status').textContent = `WAV: ${e.message}`; }); $('exp-mid').onclick = exportMidi; $('exp-kit').onclick = () => exportKit().catch(e => { $('exp-status').textContent = `kit: ${e.message}`; }); $('exp-all').onclick = () => exportAll().catch(e => { $('exp-status').textContent = `export all: ${e.message}`; }); $('exp-stems').onclick = () => exportStems().catch(e => { $('exp-status').textContent = `stems: ${e.message}`; });
  $('exp-roll').onclick = () => { expRoll = newRoll(); $('exp-status').textContent = dice.locked ? `dice are locked: exports use dice ${dice.seed} (re-roll in the dice drawer)` : `roll ${expRoll}: the next WAV, stems and MIDI share these hits`; };
  addEventListener('hashchange', () => loadShared());
  // I2 / I3 share in the transport: one tap = the link; … = the other ways (4 bars of audio, …), each a toast when done
  const fail = (what) => (e) => toast(`${what}: ${e.message}`, 4000), menu = $('share-menu'), more = $('btn-share-more');
  // closing with the focus inside (Esc, Enter on an item) hands it back to "…", not to the page
  const setMenu = (open) => { const had = menu.contains(document.activeElement); menu.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('button')?.focus(); else if (had) (more.getClientRects().length ? more : $('btn-share')).focus(); };
  closeShareMenu = () => setMenu(false);   // RD-4: the one Esc order closes it too when the focus is elsewhere
  // RD-5: on the wide console "…" is not drawn (A5: the face's 48 controls + the quest's two): a long press, a
  // right-click or ↓ on "share" opens the other ways (find reaches each of them too)
  const sb = $('btn-share'); sb.onclick = () => shareLink().catch(fail('share')); longPress(sb, () => setMenu(true));
  sb.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setMenu(true); } });
  more.onclick = () => setMenu(menu.hidden);
  $('share-link').onclick = () => { setMenu(false); shareLink().catch(fail('share')); };
  $('share-audio').onclick = () => { setMenu(false); shareAudio().catch(fail('4 bars')); };
  $('share-postcard').onclick = () => { setMenu(false); recordPostcard().catch(fail('postcard')); };
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); } });
  addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== more) setMenu(false); });
}

// ---- undo / redo / fill buttons ----
function buildEditUI() {
  $('btn-undo').onclick = undo; $('btn-redo').onclick = redo; $('btn-all').onclick = () => openFind();   // RD-5 "all ⌘K": the sheet with find
  const f = $('btn-fill'); f.onpointerdown = () => setFill(true); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) f.addEventListener(ev, () => setFill(false));
  $('btn-latch').onclick = armLatch; $('btn-latch').title = INFO['fill latch'];
  // P6: the filter knob (double-click = off) and the hold-to-throw button, beside fill in the transport strip
  // RD-5: a centre detent (DECISION "Filter on the face"): off holds a few pixels of a drag, a step stops on it on the way across
  sliders.fxFilter = makeGauge({ label: 'filter', min: -100, max: 100, value: 0, detent: 0, fmt: (v) => (v ? `${v < 0 ? 'LP' : 'HP'} ${Math.abs(v)}` : 'off'), say: filterSay, title: INFO['fx filter'], color: 'var(--signal-cyan)', onChange: (v) => setFilter(v / 100) });
  $('fx-gauge').replaceChildren(sliders.fxFilter.el);
  const th = $('btn-throw'); th.onpointerdown = () => { wake(); setThrow(true); }; for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) th.addEventListener(ev, () => setThrow(false));
  // keys hold it only when the keyboard reached it (controlOwnsKey): clicked, Space is the page's play / stop, as on every other button
  th.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && controlOwnsKey(e)) { e.preventDefault(); setThrow(true); } }); th.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') setThrow(false); }); th.addEventListener('blur', () => setThrow(false));
}

// ---- jam: record what you play (edits, mutes, evolve, slots, knobs) as a track per lane (4 or 6), up to 256 beats ----
// The recorder taps each lane bus (pre-master), starts on a bar line and ends on one (stop rounds up to the next
// bar), so the four files are sample-aligned, the same length and whole bars long: a DAW lines them up at this tempo.
const jam = { state: 'idle', node: null, startTick: 0, stopTick: 0, lastTick: 0, lastTime: 0, beats: 0, chunks: null, lanes: 4, sr: 44100, bar: BAR_TICKS, meter: '4/4' };   // idle → armed → rec → finishing → done; bar / meter: the take's, from its first bar line
// E6 ring-out: log = the live hits while a take that wants one runs (hitSound), ring = its rendered tails (renderRing),
// ringJob = that render while it runs, take = which take a render belongs to (a discard or a new take drops a late one)
Object.assign(jam, { startTime: 0, endTime: 0, log: null, ramps: null, ring: null, ringJob: null, take: 0 });   // endTime: the end last posted to the recorder; ramps (A2): the curve moves the live kit made, for the ring-out
async function ensureJamNode() {
  // through Tone's context: its rawContext is a wrapper the native AudioWorkletNode constructor rejects
  if (jam.node) return; const tc = T.getContext(), ctx = tc.rawContext; jam.sr = ctx.sampleRate;
  await addWorklet(tc, './jam-worklet.js');
  jam.node = tc.createAudioWorkletNode('orbits-jam', { numberOfInputs: MAX_LANES, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  jam.node.connect(ctx.destination);   // silent output, keeps the recorder pulled by the graph
  kit.chains.forEach((c, i) => c.bus.connect(jam.node, 0, i));
  jam.node.port.onmessage = ({ data }) => {
    if (data.lanes) data.lanes.forEach(([L, R], i) => { jam.chunks[i][0].push(L); jam.chunks[i][1].push(R); });
    if (data.done) {   // cut to the exact take (a stop in the grace window ends on a bar line already recorded past)
      if (data.frames != null) jam.chunks = trimChunks(jam.chunks, data.frames);
      const any = jam.chunks[0][0].length; jam.state = any ? 'done' : 'idle';
      // E6: the ring-out renders now, from the hits the take played; its end on the recorder's clock = start + frames
      if (any && jam.log && data.frames != null) {
        const take = jam.take;
        jam.ringJob = renderRing(jam.log, jam.ramps, Math.round(jam.startTime * jam.sr) + data.frames, jam.endTime).then((r) => { if (jam.take === take) jam.ring = r && joinRing(jam.chunks, r, Math.round(0.002 * jam.sr)); }, (e) => console.error('jam ring-out:', e))
          .finally(() => { if (jam.take === take) { jam.ringJob = null; renderJam(); } });
      }
      jam.log = jam.ramps = null; renderJam(); paintLeds();
    }
  };
}
async function toggleJam() {
  if (jam.state === 'rec' || jam.state === 'armed') return stopJam();
  if (jam.state === 'finishing') return;   // the take is closing on its bar line: a press now would mix two takes
  try { await wake(); await ensureJamNode(); } catch (e) { toast(`jam: ${e.message}`, 4000); return; }
  // lanes: the most the take played (L2)
  jam.chunks = Array.from({ length: MAX_LANES }, () => [[], []]); jam.take++; jam.ring = jam.ringJob = null; jam.log = exp.ring ? [] : null; jam.ramps = exp.ring ? [] : null; jam.lanes = m.lanes.length; jam.beats = 0; jam.state = 'armed'; renderJam(); paintLeds();
  if (!playing) togglePlay();
}
function stopJam() {
  if (jam.state === 'armed') { jam.state = 'idle'; jam.log = jam.ramps = null; jam.node?.port.postMessage({ cancel: true }); }
  else if (jam.state === 'rec') {
    // The take ends on a bar line, like Live's record quantize: the next one, or the one just passed if the stop came
    // within a 16th of it (late by a hair shouldn't cost a whole bar). "Now" is the audible tick, not the last
    // scheduled one (the clock runs ahead). The end is posted now (the transport may be stopping) and re-posted from
    // the clock when it gets there, which stays exact even if the tempo moves meanwhile.
    const now = jam.lastTick - Math.max(0, jam.lastTime - T.getContext().rawContext.currentTime) / tickSec(), el = Math.max(0, now - jam.startTick);
    const B = jam.bar, n = Math.max(1, el % B < PPQ / 4 ? Math.floor(el / B) : Math.ceil(el / B));   // within a 16th note of the bar line, any meter
    jam.stopTick = jam.startTick + n * B; jam.beats = n * B / PPQ; jam.state = 'finishing';
    jam.endTime = jam.lastTime + (jam.stopTick - jam.lastTick) * tickSec(); jam.node.port.postMessage({ end: jam.endTime });
  }
  renderJam(); paintLeds();
}
/** Master-clock side: start on the next bar, stop at 256 beats sharp (or on the bar line after a stop). */
function jamTick(t, time) {
  if (jam.state === 'finishing' && t === jam.stopTick) { jam.endTime = time; jam.node.port.postMessage({ end: time }); }
  if (jam.state === 'finishing' && t % PPQ === 0) T.getDraw().schedule(renderJam, time);
  if (jam.state === 'finishing' && t < jam.stopTick && tempo !== jam.tempo) jam.tempoMoved = true;   // still inside the take
  if (jam.state === 'armed' && onBar(t, bars)) { jam.bar = bars.len; jam.meter = m.meter; jam.startTick = jam.lastTick = t; jam.lastTime = time; jam.stopTick = -1; jam.tempo = tempo; jam.tempoMoved = false; jam.startTime = time; jam.node.port.postMessage({ start: time }); jam.state = 'rec'; T.getDraw().schedule(() => { renderJam(); paintLeds(); }, time); }
  if (jam.state !== 'rec') return;
  jam.lastTick = t; jam.lastTime = time; if (tempo !== jam.tempo) jam.tempoMoved = true; jam.lanes = Math.max(jam.lanes, m.lanes.length); const el = t - jam.startTick; jam.beats = el / PPQ;
  // the cap: the last whole bar within 256 beats (a 7/8 bar is 3.5)
  if (el >= Math.floor(JAM_BEATS * PPQ / jam.bar) * jam.bar) { jam.stopTick = t; jam.endTime = time; jam.node.port.postMessage({ end: time }); jam.state = 'finishing'; T.getDraw().schedule(renderJam, time); }
  else if (el % PPQ === 0) T.getDraw().schedule(renderJam, time);
}
/** How long a hit can sound from its lane's sample (a reach for the ring-out): its longest buffer at half speed (tune an
 *  octave down); 0 on a drum voice, whose decay and echoes tailSec covers. */
const sampleSec = (lane) => (lane?.voice === 'sample' && lane.sample ? 2 * Math.max(0, ...(lane.sample.slices || [lane.sample.id]).map(id => sampleBufs.get(id)?.duration || 0)) : 0);
/**
 * E6: a take's ring-out, rendered offline from the hits it played (jam.log) on a raw kit with the lanes it ended with:
 * the tails of those hits past the take's end (`endFrame`, on the context's frame clock), as if the music stopped on
 * that bar line, whether or not the pattern played on. Same sample grid, rate and 16-bit shape as the take, a pair per
 * lane; null when nothing rings past the end.
 */
async function renderRing(log, ramps, endFrame, endTime) {
  const sr = jam.sr, tail = tailSec(), plan = ringPlan(log, { endFrame, endTime, sampleRate: sr, reach: (li, lane) => tail + sampleSec(lane) }); if (!plan) return null;
  // each lane as it played its last hit in the take (a lane that played none: a placeholder, it stays silent)
  const lanes = Array.from({ length: Math.max(jam.lanes, plan.lanes.length) }, (_, i) => plan.lanes[i] || m.lanes[i] || m.lanes[0]);
  for (const l of new Set(lanes)) await ensureSample(l);
  // A2: the curves as the live kit moved them (replayRamps), on the hits' clock (the render starts lead frames before the end)
  const b = await offline(() => { const k = makeKit({ raw: true, lanes }); routeStems(k); if (ramps?.length) replayRamps(k, ramps, endFrame / sr - plan.lead / sr); for (const h of plan.hits) hitSound(lanes[h.li], h.at, h.accent, h.lock, h.vel, k, h.slice, null, h.auto); return k; }, (plan.lead + plan.frames) / sr + 0.01, 2 * lanes.length, sr);
  return ringOut(Array.from({ length: jam.lanes }, (_, i) => [b.getChannelData(2 * i), b.getChannelData(2 * i + 1)]), plan.lead, plan.frames);
}
// RD-7: the take is a pill (renderPills): its words change with its state only, never with the beats (they count on the
// jam word and the canvas); the take's details are the download's title
function renderJam() {
  const st = jam.state, b = Math.floor(jam.beats), btn = $('btn-jam'), had = document.activeElement;   // (discard: the focus is handed on)
  btn.classList.toggle('on', st === 'rec' || st === 'armed'); btn.textContent = st === 'rec' ? `■ jam ${b}/${JAM_BEATS}` : st === 'armed' ? '● jam: next bar…' : st === 'finishing' ? '◌ jam: closing…' : '● jam';
  if (st === 'done') {
    const secs = jam.chunks ? jam.chunks[0][0].reduce((a, c) => a + c.length, 0) / jam.sr : 0;
    const t = `the take: ${nBars(Math.round(jam.beats * PPQ / jam.bar))}${jam.meter !== '4/4' ? ` of ${jam.meter}` : ''} at ${jam.tempo} bpm · ${secs.toFixed(1)} s · ${jam.lanes} lane tracks + raw mix (.zip)${jam.ringJob ? ' · rendering the ring-out…' : jam.ring ? ' + ring-out files' : ''}${jam.tempoMoved ? ' · the tempo moved during the take, so it is not whole bars at one tempo' : ''}`;
    if ($('jam-dl').title !== t) $('jam-dl').title = t;
  }
  setHidden($('jam-dl'), st !== 'done'); setHidden($('jam-discard'), st !== 'done'); keepFocus(had); readout();   // only when it changes: this runs every beat of a take, inside the status region
}
async function downloadJam() {
  slog?.act('export', null, 'jam');
  // a ring-out still rendering goes in the same zip; one that hangs (a worklet that never answers) doesn't hold the take
  if (jam.state !== 'done') return; let timer;
  const late = await Promise.race([jam.ringJob?.then(() => false), new Promise(r => { timer = setTimeout(() => r(true), 15000); })]); clearTimeout(timer);
  if (jam.state !== 'done') return; const n = Math.round(jam.beats * PPQ / jam.bar), base = fileBase('jam', { loop: true, bars: n }, jam.tempo);
  download(stemsZip(jam.chunks.slice(0, jam.lanes), laneNames(jam.lanes), jam.sr, base, acidOf(jam.tempo, n, jam.meter), { smpl: true, ring: late ? null : jam.ring }), `${base}.zip`, 'application/zip');
  if (late) toast('downloaded without the ring-out: it was still rendering', 4000);
}
function buildJamUI() {
  $('btn-jam').onclick = toggleJam; $('jam-dl').onclick = () => downloadJam().catch(e => toast(`jam: ${e.message}`, 4000));
  $('jam-go').onclick = () => { if (jam.state === 'rec' || jam.state === 'armed') stopJam(); else if (jam.state === 'done') $('jam-dl').focus(); };   // recording: ends the take on its bar line (kept)
  $('jam-discard').onclick = () => { jam.state = 'idle'; jam.chunks = jam.ring = jam.ringJob = jam.log = jam.ramps = null; jam.take++; renderJam(); paintLeds(); };
  renderJam();
}

// ---- stems: the current pattern rendered once, each lane to its own pair of channels → equal-length WAVs ----
async function exportStems() {
  slog?.act('export', null, 'stems');
  await wake(); $('exp-status').textContent = `rendering ${m.lanes.length} stems…`;
  const r = await renderPattern({ stems: true, dry: exp.dry }), n = m.lanes.length, base = fileBase('stems', r);
  const { files, gain } = stemFiles(Array.from({ length: n }, (_, i) => [r.chans[2 * i], r.chans[2 * i + 1]]), laneNames(n), r.sr, base, { bits: exp.bits, ...renderTags(r), ret: exp.dry ? [r.chans[2 * n], r.chans[2 * n + 1]] : null });
  download(zipStored(files), `${base}.zip`, 'application/zip');
  $('exp-status').textContent = `stems: ${n} lanes${exp.dry ? ' (dry) + delay return' : ''} + raw mix · ${r.hits.length} hits · ${rollNote()} · ${renderNote(r)} · ${fmtNote()}${gain < 1 ? ` · all scaled ${(20 * Math.log10(gain)).toFixed(1)} dB to avoid clipping` : ''}`; questEvent({ type: 'export', what: 'stems' });
}
// ---- welcome back, toasts ----
// When the welcome bar goes, everything under it moves up: clicks are swallowed for a moment, so the second click of
// a double-click (or a double tap) can't land on whatever moved under the pointer (clear lane, jam, play).
let clickGuard = 0, toastTimer = 0;
for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) addEventListener(ev, (e) => { if (performance.now() < clickGuard) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
/** Close the welcome pill (once the beat plays, loads or is dismissed); focus that was in it goes to play. */
function hideWelcome() {
  if (!welcomeOn) return; const had = $('welcome').contains(document.activeElement);
  welcomeOn = false; renderPills(); clickGuard = performance.now() + 450; if (had) $('btn-play').focus({ preventScroll: true });
}
/** One short line at the bottom. A polite live region that stays in the page (only its text changes, so screen
 *  readers announce it); cleared once it has faded. */
function toast(txt, ms = 2400) {
  const t = $('toast'); t.textContent = txt; t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); toastTimer = setTimeout(() => { t.textContent = ''; }, 300); }, ms);
}
// ---- I6 quests, I7 simple mode (quests.js: the quests, their checks, the plain words) ----
const saveQuests = () => { try { localStorage.setItem(QUESTS_KEY, JSON.stringify(quests)); } catch {} };
/** Something you did (quests.js events). Called from the clock too (a bar line), so the check waits for the page; only a
 *  move that can finish the current quest (its `on`) runs it, right after that move. */
function questEvent(e) {
  const q = currentQuest(quests.done); if (!q) return; questLog.push(e); if (questLog.length > 400) questLog.splice(0, questLog.length - 400);
  if (q.on.includes(e.type) && !questTimer) questTimer = setTimeout(() => { questTimer = 0; checkQuest(); }, 0);
}
function checkQuest() {
  const q = currentQuest(quests.done); if (!q || !q.check(m, questLog)) return;
  finishQuest(q); celebrate(q);
}
function finishQuest(q) { quests.done.push(q.id); questLog = []; saveQuests(); renderQuest(); }
/** A light cheer: the pill glows once (a steady glow when motion is reduced, CSS) and a toast names the next quest. */
function celebrate(q) {
  const c = $('quest'), next = currentQuest(quests.done); c.classList.remove('cheer'); void c.offsetWidth; c.classList.add('cheer');
  clearTimeout(cheerTimer); cheerTimer = setTimeout(() => c.classList.remove('cheer'), 1500);   // the steady glow goes too
  toast(`quest done: ${q.title} ✓${next ? ` · next: ${next.title}` : ' · that was the last one'}`, 4000);
}
/** A lane knob's word in the view on screen (I7: plain in simple), wherever the page names it. */
function knobWord(k, simple = quests.view === 'simple') { return paramLabel(k, PARAMS.find(p => p.k === k)?.label ?? k, simple); }
/** The quest pill: the current quest, in simple and everything alike, until you hide it (× ; simple brings it back) or
 *  finish. sync() redraws it: the hint (in the drop-down, written while it is open) is for the beat on screen (the
 *  backbeat quest names your snare and what it lacks); the pill's words change only when the quest does. */
function renderQuest() {
  const q = currentQuest(quests.done), on = !!q && !quests.hidden;
  if (on) {
    const n = `quest ${QUESTS.indexOf(q) + 1} of ${QUESTS.length}`; if ($('quest-n').textContent !== n) $('quest-n').textContent = n;
    if ($('quest-title').textContent !== q.title) $('quest-title').textContent = q.title;
    if (!$('quest-more').hidden) { const h = $('quest-hint'), t = q.hint(m, { word: knobWord, lane: (i) => `lane ${i + 1} · ${voiceLabel(m.lanes[i])}` }); if (h.textContent !== t) h.textContent = t; }
  } else if (!$('quest-more').hidden) questMore(false);
  renderPills();
  // the drawer this quest is played in gets a light (finishing a quest lights the next one's drawer)
  const d = q && !quests.hidden ? hintDrawer(quests.done) : null;
  for (const el of document.querySelectorAll('.quest-lit')) if (el.id !== d) { el.classList.remove('quest-lit'); el.querySelector('summary')?.removeAttribute('data-quest'); }
  if (d) { const el = $(d); el.classList.add('quest-lit'); el.querySelector('summary')?.setAttribute('data-quest', `quest ${QUESTS.indexOf(q) + 1}`); }
  // RD-3: and the sheet tab that holds it, so a quest in a closed tab still points the way
  const pane = d && $(d).closest('[role=tabpanel]'); if (pane) $(pane.getAttribute('aria-labelledby')).classList.add('quest-lit');
}
/** I7: simple = plain words on the lane knobs and the advanced drawers tucked away (.adv); all = everything. */
function setView(v) {
  const simple = v === 'simple'; if (simple && quests.view !== v) quests.hidden = false;   // switching to simple brings hidden quests back
  quests.view = v; saveQuests();
  document.body.classList.toggle('simple', simple); ui.view?.set(v);
  // the knobs' words wherever the page names them: the lane gauges, the evolve scope, the Move table ([data-word])
  for (const p of PARAMS) sliders[p.k]?.setLabel(knobWord(p.k, simple));
  ui.evoScope?.setOptions(evoScopeOptions());
  for (const el of document.querySelectorAll('[data-word]')) { el.dataset.full ??= el.textContent; el.textContent = paramLabel(el.dataset.word, el.dataset.full, simple); }
  if (spoken) spoken = speakable();   // the words changed, no value did: the next knob turn is still announced
  if (simple && lockStep >= 0) editLocks(lockStep);   // an open lock panel closes with the drawers
  renderQuest();
}
/** Simple mode and a reach for the step locks: say where they are instead (nothing opens). */
function locksTucked() { if (quests.view !== 'simple') return false; toast('step locks are in "everything" (the simple · everything switch)', 3500); return true; }
ui.view = mount('view-mode', segmented({ options: [['simple', 'simple', 'plain words and the basics'], ['all', 'everything', 'every drawer and knob: dice, MIDI, evolve weights, step locks, generative']], value: quests.view, onChange: (v) => setView(v) }));
ui.view.el.setAttribute('aria-label', 'view: simple or everything');
$('quest-skip').onclick = () => { const q = currentQuest(quests.done); if (q) { quests.skipped.push(q.id); finishQuest(q); toast(`skipped: ${q.title}`); } };
$('quest-x').onclick = () => { quests.hidden = true; saveQuests(); renderQuest(); };
// ---- RD-7 the pills (pills.js): what is on, in one status region, in a fixed order. Each pill's node stays where the
// HTML put it (moving one would announce it again): renderPills shows or hides it, folds the fifth and later ones by a
// class, and writes a word or an attribute only when it changed, so the region never moves with the clock (A4: each
// pill announced once, never per bar). Before the page is built it does nothing (pillsLive) ----
let pillsLive = false, pillsOpen = false, pillsForce = null;
const PILL_EL = { rec: 'sp-rec', chain: 'sp-chain', solo: 'sp-solo', evolve: 'sp-evolve', dice: 'sp-dice', clock: 'sp-clock', welcome: 'welcome', quest: 'quest', jam: 'jam-panel' };
const PILL_WORDS = { rec: 'sp-rec-go', chain: 'sp-chain-go', solo: 'sp-solo-go', evolve: 'sp-evolve-go', dice: 'sp-dice-go', clock: 'sp-clock-go', jam: 'jam-text' };   // welcome and quest keep their own
// a test's stand-ins for pills whose mode is off (__poly.showPills: the 6-pill layout at 1280×720)
const PILL_STANDIN = { rec: '● rec armed', chain: 'chain 1 → 2', solo: 'solo · kick', evolve: 'evolve', dice: 'dice 1234', clock: 'clock · a MIDI clock', welcome: 'welcome back · play', quest: 'quest', jam: 'take ready · 4 bars' };
function pillState() {
  const q = currentQuest(quests.done);
  return { rec: { armed: rec.armed, knobs: rec.knobs }, chain: { chain: bank.chain, pending: bank.pending, switchAt: bank.switchAt, mutes: muteQ.size },
    solo: m.lanes.filter(l => l.solo).map(voiceLabel), evolve: { on: evo.on, every: evo.every }, dice: { locked: dice.locked, seed: dice.seed, repeat: dice.repeat },
    clock: { follow: pmidi.follow, inName: pmidi.inName }, welcome: welcomeOn, quest: q && !quests.hidden ? { n: QUESTS.indexOf(q) + 1, of: QUESTS.length, title: q.title } : null,
    jam: { state: jam.state, bars: jam.bar ? Math.round(jam.beats * PPQ / jam.bar) : 0 } };
}
function setHidden(el, h) { if (el.hidden !== h) el.hidden = h; }   // a write of the same value is still a mutation (a live region hears it)
// RD-07 round 1: the focus in the region whose button goes out of sight (its pill went, it folded, its drop-down closed)
// is handed on (pills.js focusAfter): never dropped to the page, never left on a folded button nobody can see that
// Enter still presses (Vera: Esc on "+N more", then Enter, discarded a take). had = the focus before the change
const pillKey = (el) => (el.closest('#quest-more') ? 'hint' : el.id === 'sp-more' ? 'more' : el.closest('#pills > .spill')?.dataset.pill);
const pillSeen = (el) => !el.closest('[hidden]') && !(el.closest('#pills > .fold') && !pillsOpen);
function keepFocus(had) {
  if (!(had instanceof HTMLElement) || !$('pills').contains(had) || pillSeen(had)) return;
  const k = pillKey(had); if (!k) return;
  const drawnNow = PILL_ORDER.filter(p => { const el = $(PILL_EL[p]); return !el.hidden && !el.classList.contains('fold'); });
  const skip = ['welcome', ...(jam.state === 'rec' || jam.state === 'armed' ? ['jam'] : [])];   // their first button plays / ends the take
  const to = focusAfter(k, drawnNow, !$('sp-more').hidden, !!(k === 'hint' ? $('quest') : had.closest('.spill'))?.classList.contains('fold'), { skip, hint: !$('quest-more').hidden });
  let el = to === 'more' ? $('sp-more') : to === 'help' ? $('btn-help') : to === 'hint' ? $('quest-show') : [...$(PILL_EL[to]).querySelectorAll('button')].find(b => !b.hidden);
  if (el && !el.getClientRects().length && focusMode) el = $('focus-exit');   // RD-9: "?" is hidden in F mode; exit focus is its stand-in
  if (el) focusAs(el, keyFocused.has(had));
}
function renderPills() {
  if (!pillsLive) return;
  const had = document.activeElement, s = pillState(), words = Object.fromEntries(pillsOn(s).map(p => [p.k, p.text])), keys = pillsForce || Object.keys(words);
  if (pillsForce) for (const k of keys) words[k] ??= PILL_STANDIN[k];
  const lay = pillLayout(keys); if (!lay.more) pillsOpen = false;
  for (const [k, id] of Object.entries(PILL_EL)) {
    const el = $(id), on = keys.includes(k), fi = lay.folded.indexOf(k); setHidden(el, !on); if (!on) continue;
    const w = PILL_WORDS[k] && $(PILL_WORDS[k]); if (w && w.textContent !== words[k]) w.textContent = words[k];
    const x = $(`sp-${k}-x`); if (x) setHidden(x, !pillOff(k, s));
    el.classList.toggle('fold', fi >= 0); if (fi >= 0 && el.style.getPropertyValue('--fi') !== String(fi)) el.style.setProperty('--fi', fi);
    // a folded pill is out of sight until "+N more" drops it down: out of the Tab order meanwhile (still in the region)
    for (const b of el.querySelectorAll('button')) { const t = fi >= 0 && !pillsOpen ? '-1' : null; if (b.getAttribute('tabindex') !== t) { if (t) b.setAttribute('tabindex', t); else b.removeAttribute('tabindex'); } }
  }
  const more = $('sp-more'), mt = `+${lay.more} more ▾`; setHidden(more, !lay.more); if (lay.more && more.textContent !== mt) more.textContent = mt;
  if (more.getAttribute('aria-expanded') !== String(pillsOpen)) more.setAttribute('aria-expanded', String(pillsOpen));
  $('pills').classList.toggle('more-open', pillsOpen);
  keepFocus(had);
}
function setPillsOpen(on) { pillsOpen = !!on; if (pillsOpen) questMore(false); renderPills(); }
/** The quest's drop-down: its hint (written now, for the beat on screen), show me, skip. */
function questMore(on) {
  const d = $('quest-more'), go = $('quest-go'), had = document.activeElement, ex = String(!!on);
  setHidden(d, !on); if (go.getAttribute('aria-expanded') !== ex) go.setAttribute('aria-expanded', ex); keepFocus(had);
  if (on) { pillsOpen = false; renderQuest(); }
}
/** A pill's first button: the mode's control shown in the sheet (its tab and drawer; simple gives way to everything for
 *  an advanced one) with the focus on it, as find does. The keys go with it only when the keyboard pressed the pill: after
 *  a click, Space still plays and stops (Kai: click "rec armed", Space disarmed record mid-set) */
function pillGo(el) {
  el = typeof el === 'string' ? $(el) : el; if (!el) return; setPillsOpen(false);
  if (!el.matches('button, select, input, summary')) el = el.querySelector('button, select, input') || el;   // a group: its first control
  if (el.closest('.adv') && quests.view === 'simple') setView('all');
  if (focusMode) setFocusMode(false); reveal(el); el.scrollIntoView({ block: 'nearest' }); focusAs(el, lastInput !== 'pointer');
}
/** Quest "show me" (Rio): the gesture drawn once on the rings as a ghost hand (scene.js, read-only; any key or click
 *  hides it); a quest played in the sheet shows its control instead. A phone is a page with the pills under the rings:
 *  the rings come into view first, or the hand is drawn where nobody sees it (RD-07 round 1, Maya). */
function showMe() {
  const q = currentQuest(quests.done), g = q?.show?.(m); questMore(false); if (!g) return;
  if (g.id) return pillGo(g.id);
  if (focusMode) setFocusMode(false);
  const geo = scene.geo(), c = $('cv').getBoundingClientRect(), top = c.top + geo.cy - geo.outer, bottom = c.top + geo.cy + geo.outer;
  if (top < 0 || bottom > innerHeight) scrollBy({ top: top < 0 ? top - 12 : Math.min(top - 12, bottom - innerHeight + 12), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  scene.ghost({ kind: g.kind, li: g.li }); poke();
}
addEventListener('pointerdown', () => { if (scene.ghosting) scene.ghost(null); }, true);
addEventListener('keydown', () => { if (scene.ghosting) scene.ghost(null); }, true);
$('sp-rec-go').onclick = () => pillGo('btn-rec'); $('sp-rec-x').onclick = () => { setPillsOpen(false); setRec(false); };
$('sp-chain-go').onclick = () => pillGo(bank.chain.length > 1 ? 'chain-stop' : $('slots').querySelector('button') || 'chain-info'); $('sp-chain-x').onclick = () => { setPillsOpen(false); $('chain-stop').click(); };
$('sp-solo-go').onclick = () => { const li = m.lanes.findIndex(l => l.solo); if (li >= 0 && li !== m.selected) { m.select(li); sync(); } pillGo('btn-solo'); };
$('sp-solo-x').onclick = () => { setPillsOpen(false); for (const l of m.lanes) l.solo = false; sync(); };
$('sp-evolve-go').onclick = () => pillGo('btn-evolve'); $('sp-evolve-x').onclick = () => { setPillsOpen(false); setEvolve(false); };
$('sp-dice-go').onclick = () => pillGo('btn-dice'); $('sp-dice-x').onclick = () => { setPillsOpen(false); dice.locked = false; saveSettings(); renderDice(); readout(); };
$('sp-clock-go').onclick = () => pillGo($('midi-follow').querySelector('button') || 'midi-follow');
$('sp-clock-x').onclick = () => { setPillsOpen(false); pmidi.setFollow('off'); ui.follow?.set('off'); retime(); saveSettings(); renderMidi(); };
$('quest-go').onclick = () => questMore($('quest-more').hidden); $('quest-show').onclick = showMe;
$('sp-more').onclick = () => setPillsOpen(!pillsOpen);
buildSliders(); buildSteps(); buildLockGauges(); buildSlotsUI(); buildRecUI(); buildAutoUI(); buildEvolveUI(); buildGenUI(); buildMidiUI(); buildMixUI(); buildSampleUI(); buildDiceUI(); buildExportUI(); buildEngineUI(); buildEditUI(); buildJamUI(); sync(); setView(quests.view);
// a shared link wins; a first visit gets the demo groove and a pulsing play button, and its history starts there (no
// hidden pattern behind it); a returning visit keeps the pattern it left and offers "start fresh" (init, undoable)
const boot = bootMode({ saved: !firstVisit, hash: location.hash });
if (boot === 'link') loadShared({ first: firstVisit });
else if (boot === 'first') { loadGroove(DEMO_GROOVE); hist.restart(); $('btn-play').classList.add('pulse'); neverPlayed = true; }
else welcomeOn = true;
pillsLive = true; renderPills();
spoken = null; clearTimeout(announceTimer);   // the page just opened: nothing to announce yet (readout() at the end starts it)
$('btn-init').onclick = initPattern;
$('wb-keep').onclick = () => { hideWelcome(); if (!playing) togglePlay(); };
$('wb-close').onclick = hideWelcome;
$('wb-fresh').onclick = () => { initPattern(); toast('fresh start · undo brings your beat back'); };
// starter grooves (grooves.js): one chip each, the description as tooltip and in the toast; loading one is undoable
// I5 "today's seed" chip, first in the row: the date is read at the tap, so a page left open past midnight (UTC) gets the new day
{ const b = document.createElement('button'); b.type = 'button'; b.id = 'seed-today'; b.className = 'seed-chip'; b.textContent = `today's seed · ${dayLabel(utcDay())}`; b.title = 'Seed of the Day: the same starting beat for everyone today (dice locked to the day\'s seed). Make it yours, then share it. Undoable.';
  b.onclick = () => { b.textContent = `today's seed · ${dayLabel(utcDay())}`; loadDaySeed(); }; $('grooves').appendChild(b); }
for (const g of GROOVES) {
  const b = document.createElement('button'); b.type = 'button'; b.id = `groove-${g.key}`; b.textContent = g.name; b.title = `${g.desc} (${g.tempo} bpm, undoable)`;
  b.onclick = () => loadGroove(g.key); $('grooves').appendChild(b);
}
// ---- library: named setups in localStorage (patterns + voices + kit + sounds + tempo + volume + dice) ----
const setupData = () => ({ m: m.toJSON(), tempo, vol, dice: dice.toJSON(), from: lineage });
const flash = (id, txt) => { const b = $(id), was = b.dataset.label || b.textContent; b.dataset.label = was; b.textContent = txt; b.classList.add('flash'); setTimeout(() => { b.textContent = was; b.classList.remove('flash'); }, 1200); };
function loadSetup(id) {
  const e = lib.get(id); if (!e?.m) return; const was = slog && slogBefore();
  if (e.vol != null) { vol = e.vol; kit?.master.gain.rampTo(vol, 0.05); } if (e.dice) { dice.fromJSON(e.dice); saveSettings(); renderDice(); }
  libCurrent = id; loadMachine(e.m, { bpm: e.tempo, exact: true, selected: m.selected }); setLineage(e.from); renderLib(); flash('btn-load', `“${e.name}” ✓`); slog?.act('load', was, slogWords(), { what: 'setup', absorb: true });
}
function saveSetup(name) {
  const e = lib.save(name, setupData()); if (!e) { $('lib-name').setCustomValidity('browser storage is full: delete a setup or a sample'); $('lib-name').reportValidity(); return; }
  libCurrent = e.id; $('lib-name').value = e.name; renderLib(); flash('btn-save', 'saved ✓'); readout();
}
function openLib(focus) { reveal('lib-drawer').scrollIntoView({ block: 'nearest' }); if (focus) { const n = $('lib-name'); n.value = lib.get(libCurrent)?.name || lib.nextName(); n.focus(); n.select(); } }
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
function renderLib() {
  const el = $('lib-list'); el.innerHTML = ''; const items = lib.list();
  if (!items.length) { el.innerHTML = '<p class="hint tight">Nothing saved yet: type a name and press save.</p>'; return; }
  const drawn = [];   // the thumbnails drawn on this render, cached in one write (a library from before I4: all of them)
  for (const e of items) {
    const row = document.createElement('div'); row.className = `lib-row${e.id === libCurrent ? ' cur' : ''}`;
    const name = document.createElement('button'); name.type = 'button'; name.className = 'lib-name'; name.textContent = e.name; name.title = 'load this setup (undoable)'; name.onclick = () => loadSetup(e.id);
    // I4 gallery: the setup's rings, drawn once and cached in the entry (a re-save drops it, so it is drawn anew)
    let url = e.thumb; if (!url && e.m?.lanes) { url = thumbURL(e.m, LANE_HEX); drawn.push([e.id, url]); }
    const img = document.createElement('img'); img.className = 'lib-thumb'; img.alt = ''; img.width = img.height = 48; if (url) img.src = url; img.onclick = () => loadSetup(e.id);
    const voices = e.m?.lanes ? Machine.from(e.m).lanes.map(l => l.voice === 'sample' ? '♪' : voiceLabel(l)).join(' · ') : '';   // as it loads (old voices migrated)
    const meta = document.createElement('span'); meta.className = 'lib-meta'; meta.textContent = `${e.tempo || '?'} bpm · ${voices} · ${ago(e.t)}`;
    const acts = document.createElement('span'); acts.className = 'lib-acts';
    const btn = (txt, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = txt; b.title = title; b.onclick = fn; acts.appendChild(b); return b; };
    btn('↻', 'overwrite with what is playing now', () => { lib.overwrite(e.id, setupData()); libCurrent = e.id; renderLib(); flash('btn-save', 'saved ✓'); });
    btn('✎', 'rename', () => {
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = e.name; inp.maxLength = 40; inp.className = 'lib-rename'; name.replaceWith(inp); inp.focus(); inp.select();
      const done = (ok) => { if (ok && !lib.rename(e.id, inp.value)) { inp.setCustomValidity('that name is taken'); inp.reportValidity(); return; } renderLib(); };
      inp.onkeydown = (k) => { if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); k.stopPropagation(); }; inp.onblur = () => done(true);
    });
    const del = btn('×', 'delete', () => { if (del.dataset.sure) { lib.remove(e.id); if (libCurrent === e.id) libCurrent = null; renderLib(); } else { del.dataset.sure = 1; del.textContent = 'sure?'; del.classList.add('danger'); setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = '×'; del.classList.remove('danger'); } }, 2500); } });
    row.append(img, name, acts, meta); el.appendChild(row);
  }
  if (drawn.length) lib.setThumbs(drawn);
}
$('lib-form').onsubmit = (e) => { e.preventDefault(); $('lib-name').setCustomValidity(''); saveSetup($('lib-name').value); };
$('lib-name').oninput = () => $('lib-name').setCustomValidity('');
$('lib-name').onkeydown = (e) => e.stopPropagation();   // typing a name must not play pads
$('btn-save').onclick = () => openLib(true);
$('btn-load').onclick = () => openLib(false);
renderLib();

// ---- Move ----
const LANE_LED = LANE_HEX.map(nearestPaletteIndex), LANE_DIM = [24, 16, 30, 34, nearestPaletteIndex('#2f7a45'), nearestPaletteIndex('#8a5a20')];
const REC_LED = nearestPaletteIndex('#ef4444'), CYAN_LED = nearestPaletteIndex('#67e8f9'), MAGENTA_LED = nearestPaletteIndex('#f0abfc');
const CUE_LED = COLOR.BLUE;   // P2 / P7 cues among lane colours: no lane is blue (cyan is lane 2's own colour)
let loopHeld = false, dupHeld = false, chainPick = [];
// P1 / P2 / P3 (perform.js): Mute held (used = it muted a lane or soloed, so its release doesn't), Layout pressed with
// Shift (its release is not the end of a held fill), Capture / Delete guarded in live mode, their LEDs blinking
const mute = { held: false, used: false }, guard = new Guard(), blink = new Map(); let latchPress = false;
const FLASH_MS = 200;   // with Shift a guarded button flashes this long before it acts
function startBlink(name) { if (blink.has(name)) return; const b = { on: true, timer: setInterval(() => { b.on = !b.on; paintLeds(); }, 90) }; blink.set(name, b); paintLeds(); }
function stopBlink(name) { const b = blink.get(name); if (!b) return; clearInterval(b.timer); blink.delete(name); paintLeds(); }
/** A destructive Move button in live mode: Shift = flash, then act; alone = blink while held, act at HOLD_MS; let go sooner = nothing (a hint says how). */
function guarded(name, pressed, act, what) {
  if (!pressed) { const cut = guard.release(name) === 'cancel'; if (cut) { stopBlink(name); toast(`${name}: hold it (or Shift + ${name}) to ${what}`); } return; }
  if (blink.has(name)) return;   // a Shift press still flashing: a quick second press doesn't act twice
  const { now, id } = guard.press(name, shift); startBlink(name);
  if (now) setTimeout(() => { stopBlink(name); act(); }, FLASH_MS);
  else setTimeout(() => { if (guard.fire(name, id)) { stopBlink(name); act(); } }, HOLD_MS);
}
// L5 pages and the L2 pad window (pages.js): a pad row shows 8 steps of its lane, the 16 step buttons 16 steps of the
// selected lane. Following (the default) each row shows the page its own lane's playhead is on, so every step's
// playhead is seen; Back + ◀ ▶ (or Back + a step button) pins one page for every row, Back alone follows again. The 4
// rows are lanes 1–4, or 3–6 once lane 5 or 6 is selected (`pages` is made before sync(), which moves the window).
const padBase = () => pages.window(m.selected, m.lanes.length);
const held = pages.held;   // step buttons held down: button → { step, used } (used = a knob turned, so release won't toggle)
function paintLeds() {
  if (!move.inControl) return;
  const anySolo = m.lanes.some(l => l.solo), base = padBase(), np = padPages(m.lanes);
  for (let r = 0; r < PAD_ROWS; r++) {
    const li = base + r, lane = m.lanes[li], f = pages.padFirst(lane, playing);
    for (let c = 0; c < PAD_COLS; c++) { const i = f + c; const pad = r * PAD_COLS + c; let col = 0; if (i < lane.length) { col = lane.hitAt(i) ? (lane.accentAt(i) ? COLOR.WHITE : LANE_LED[li]) : LANE_DIM[li]; if (playing && lane.shown === i) col = lane.hitAt(i) ? COLOR.WHITE : 120; } move.setPadColor(pad, lane.muted || (anySolo && !lane.solo) ? (col ? LANE_DIM[li] : 0) : col); }
  }
  const lane = m.lane, s0 = pages.stepFirst(lane, playing), cur = pages.current(lane, playing); let look = null;
  if (loopHeld || dupHeld) {   // step buttons show the slots: white = playing, cyan = queued, magenta = picked for a chain
    for (let i = 0; i < STEP_BTNS; i++) move.setStepColor(i, chainPick.includes(i) ? MAGENTA_LED : bank.current === i ? COLOR.WHITE : bank.pending === i ? CYAN_LED : bank.filled(i) ? (dupHeld ? REC_LED : 34) : dupHeld ? 1 : 0);
  } else if ((look = pages.looked(performance.now()))) {   // P7: a step held (LOOK_MS, or edited): the step buttons are 16 of its loops (1–16, or the 16 holding the loop playing now) and light where it plays (blue = depends on fill / the step before; white = the loop playing now)
    const si = lane.stepIndex(look.step), on = lane.played(si), { loops, now: at } = stepLoops({ cond: lane.trigs[si]?.cond, on, loopN: lane.loopN, playing });   // the step page's loop dots too (pages.js)
    for (let i = 0; i < STEP_BTNS; i++) move.setStepColor(i, !on ? (i === at ? COLOR.DARK_GREY : 0) : i === at ? (loops[i] === false ? COLOR.DARK_GREY : COLOR.WHITE) : loops[i] === null ? CUE_LED : loops[i] ? LANE_LED[m.selected] : 0);
  } else if (pages.back) {   // Back held: the step buttons are the pad pages (white = the one showing, cyan = pinned)
    for (let i = 0; i < STEP_BTNS; i++) move.setStepColor(i, i >= np ? 0 : i === cur ? (pages.follow ? COLOR.WHITE : CYAN_LED) : LANE_DIM[m.selected]);
  } else for (let b = 0; b < STEP_BTNS; b++) { const i = s0 + b; move.setStepColor(b, i >= lane.length ? 0 : (playing && lane.shown === i) ? COLOR.WHITE : lane.hitAt(i) ? (lane.shownLock(i) ? CYAN_LED : LANE_LED[m.selected]) : LANE_DIM[m.selected]); }
  move.setButtonColor('back', pages.follow ? (np > 1 ? 16 : 0) : CYAN_LED);   // lit = there are pages; cyan = one is pinned
  // Shift held: track 4 / 3 = lanes 5 / 6. Mute held: the track buttons show the mutes (lane colour = playing, off = muted, blue = changes on the next bar)
  for (let t = 1; t <= 4; t++) { const li = trackLane(t, shift, m.lanes.length); move.setButtonColor(`track${t}`, mute.held ? (muteQ.has(li) ? CUE_LED : m.lanes[li].muted ? 0 : LANE_LED[li]) : li === m.selected ? COLOR.WHITE : LANE_DIM[li]); }
  const blinkLed = (name, idle) => { const b = blink.get(name); move.setButtonColor(name, b ? (b.on ? REC_LED : 0) : idle); };
  move.setButtonColor('play', playing ? COLOR.WHITE : CYAN_LED); move.setButtonColor('mute', lane.solo ? nearestPaletteIndex('#fde047') : lane.muted ? COLOR.WHITE : 0); blinkLed('capture', evo.on ? MAGENTA_LED : LANE_LED[0]); move.setButtonColor('undo', hist.canUndo ? LANE_LED[3] : 0); move.setButtonColor('layout', fill ? COLOR.WHITE : latch.state === 'armed' ? CYAN_LED : 16); blinkLed('delete', 16); move.setButtonColor('minus', evo.on ? MAGENTA_LED : 16); move.setButtonColor('plus', pfx.throw ? COLOR.WHITE : 16);
  blinkLed('record', rec.armed ? REC_LED : nearestPaletteIndex('#fb7185')); move.setButtonColor('left', LANE_DIM[m.selected]); move.setButtonColor('right', LANE_DIM[m.selected]);   // record (A3): blinks while a gesture records
  move.setButtonColor('loop', loopHeld ? COLOR.WHITE : bank.chain.length > 1 ? CYAN_LED : 16); move.setButtonColor('duplicate', dupHeld ? REC_LED : 16); move.setButtonColor('sampling', jam.state === 'rec' ? REC_LED : jam.state === 'armed' ? CYAN_LED : jam.state === 'done' ? COLOR.WHITE : 16);
}
// Live mode is on when the Move connects, so the first pads play and write nothing: say how to write, a few times a
// visit (not more than every 15 s), and never again once you switched live mode yourself (then you know it's there).
let padHints = 0, padHintAt = -Infinity;
function liveModeHint() {
  const now = performance.now(); if (padHints >= 3 || now - padHintAt < 15000) return; padHints++; padHintAt = now;
  toast('live mode: pads play, they don\'t write · tap a step button, arm Record and play them in, or switch live mode off', 4500);
}
move.addEventListener('pad', (e) => {
  if (!e.detail.on) return; const { col, velocity } = e.detail, li = padBase() + e.detail.row;   // the row's lane in the window (selecting it keeps the window)
  if (mute.held) { mute.used = true; toggleMute(li); return; }   // P2: hold Mute + a pad of a row = that lane's mute (no sound, no step)
  if (rec.armed || perf.live) { if (!rec.armed) liveModeHint(); return liveHit(li, col, velocity); }   // P1 live mode: the pad plays its step's sound, with velocity; it writes only with Record armed
  const lane = m.lanes[li], i = pages.padFirst(lane, playing) + col; if (i >= lane.length) return; if (shift) lane.toggleAccent(lane.stepIndex(i)); else lane.toggle(lane.stepIndex(i)); if (!awake) wake(); if (awake && !playing) hitSound(lane, T.now(), false, lane.lockAt(i), null, kit, lane.sliceAt(lane.stepIndex(i), lane.lockAt(i))); m.select(li); sync();
});
move.addEventListener('step', (e) => {
  const { index: btn, on } = e.detail;
  // a release ends its own press, whatever happened since (the page turned, Back went down, the lane got shorter):
  // a tap toggles the step it went down on; a hold + knob locked something instead, a longer hold looked at its loops (P7)
  if (!on) { const h = pages.release(btn, performance.now()), lane = m.lane; if (h) stepBtns[h.step]?.classList.remove('held'); if (h && !h.used && h.step < lane.length) { lane.toggle(lane.stepIndex(h.step)); sync(); } else { renderPage(); paintLeds(); } return; }
  if (loopHeld || dupHeld) { if (dupHeld) saveSlot(btn); else if (bank.filled(btn) && !chainPick.includes(btn)) chainPick.push(btn); paintLeds(); renderSteps(); return; }   // RD-6: the cells show the slots too
  if (pages.back) { pages.pin(btn, m.lanes); paintLeds(); return; }   // Back + step button = that pad page
  const lane = m.lane, first = pages.stepFirst(lane, playing), step = first + btn; if (step >= lane.length) return;   // the step's own number (17–32 on page 2)
  // P7: held LOOK_MS, the buttons show its loops; RD-5: its cell is outlined at once, the step page comes at LOOK_MS (or a turn)
  if (shift) { lane.toggleAccent(lane.stepIndex(step)); sync(); } else { pages.press(btn, step, first, performance.now()); stepBtns[step]?.classList.add('held'); setTimeout(() => { renderPage(); paintLeds(); }, LOOK_MS + 10); }
});
move.addEventListener('encoder', (e) => {
  const { index, delta } = e.detail;
  // RD-5: a turn with no touch (a controller without touch) flips the row and shows the peek as a touch would
  if (index < 8 && !hands.touch.has(index)) { touchTail(); renderPage(); peekAt(index, 'turn'); peekOff('turn'); sceneHand('turn', moveKey(index)); sceneHand('turn', null); }
  if (held.size && index === 7) {   // hold step(s) + knob 8 = condition; + Shift = repeats (ratchet)
    const lane = m.lane;
    for (const h of held.values()) { const i = h.step; h.used = true; const si = lane.stepIndex(i), t = lane.trigs[si] || { cond: 'always', ratchet: 1 }; lane.setTrig(si, shift ? { ratchet: t.ratchet + Math.sign(delta) } : { cond: CONDS[(CONDS.indexOf(t.cond) + Math.sign(delta) + CONDS.length) % CONDS.length] }); borrowStep(i); }
    auditionLock(); stepEdited(); return;
  }
  if (held.size && index === 6 && m.lane.voice === 'sample' && m.lane.sliceCount()) {   // S1: on a slice set, hold step(s) + knob 7 = which slice, every 4 clicks either way
    const lane = m.lane, top = lane.sliceCount() - 1; let moved = false;
    for (const h of held.values()) {
      const i = h.step, si = lane.stepIndex(i), k = Math.trunc((h.sl = (h.sl || 0) + delta) / 4); h.used = true; borrowStep(i);
      if (k) { h.sl -= k * 4; lane.setLock(si, 'slice', Math.max(0, Math.min(top, lane.sliceAt(si, lane.locks[si]) + k))); moved = true; }
    }
    if (moved) auditionLock(); stepEdited(); return;
  }
  if (held.size && index < LOCK_KEYS.length) {   // hold step(s) + knob 1–7 = lock tune · prob · vel · decay · tone · snap · color on those steps
    const k = LOCK_KEYS[index], lane = m.lane, span = k === 'tune' ? 0.02 : 0.02;
    for (const h of held.values()) { const i = h.step; h.used = true; lane.setLock(lane.stepIndex(i), k, lockValue(lane, i, k) + delta * span); borrowStep(i); }
    auditionLock(); stepEdited(); return;
  }
  // A3 / A6: a knob that can record (Shift + knobs = the sound, knob 6 / 7 = chance / tune) is a gesture, on the parameter
  // it had when touched (else this move's: it ends 400 ms after the last). Recording, the lane value stays; otherwise
  // the knob acts as always (2 % per click) and the hand plays over the lane's locks and curves while it lasts
  const pk = touched.get(index) ?? moveKnob(index, shift);
  if (pk) {
    if (playing) {
      // the hand starts from what plays when it records, from the knob (the lane value) when it doesn't
      const kg = knobGest, g = kg?.knob === index && kg.k === pk.k && !kg.latched ? kg : null, v = lockClamp(pk.k, Math.round(((g ? g.v : recKnobs() ? playedValue(m.lane, pk.k, pk.kind) : laneValue(m.lane, pk.k)) + delta * 0.02) * 100) / 100);
      if (g) gestMove(v); else gestStart(m.selected, pk.k, pk.kind, { touch: touched.has(index), v, src: pk.src, knob: index });
      if (knobGest?.rec) return;
    }
    if (pk.src === 'snd') { m.lane.setSound(pk.k, m.lane.sound[pk.k] + delta * 0.02); applySound(m.selected); if (awake && !playing) hitSound(m.lane, T.now(), false); sync(); return; }
    nudge(pk.k, delta * 2); return;
  }
  if (index === 7) handTempo(tempo + delta); else nudge(RHYTHM_KEYS[index], delta * (index >= 4 ? 2 : 1));
});
// A6: a touched knob (encoder touch, notes 0–7) is a gesture from touch to release, on the parameter it is then (Shift:
// the sound); a held step makes it a lock edit instead. The volume knob's touch (8) is not one.
const touched = new Map();   // encoder index → the parameter it was touched on (moveKnob)
move.addEventListener('encoderTouch', (e) => {
  const { index, on } = e.detail; if (index > 7) return;
  moveTouch(index, on);   // RD-5: the row flips to the Move's page, the peek shows the knob
  if (!on) { touched.delete(index); const g = knobGest; if (g?.knob === index && g.touch && !g.latched) gestEnd(); return; }
  if (held.size) return; const pk = moveKnob(index, shift); if (!pk) return; touched.set(index, pk);
  // recording, a touch writes from what plays (touch mode: also while the knob holds still); not recording a finger
  // resting on a knob changes nothing: its first turn starts the hand
  if (playing && recKnobs()) gestStart(m.selected, pk.k, pk.kind, { touch: true, v: playedValue(m.lane, pk.k, pk.kind), src: pk.src, knob: index });
});
move.addEventListener('wheel', (e) => {
  if (held.size) {   // G1: hold step(s) + jog wheel = nudge those steps early / late, 5 % of a step per click
    const lane = m.lane; for (const h of held.values()) { const i = h.step; h.used = true; lane.setLock(lane.stepIndex(i), 'nudge', Math.round((lockValue(lane, i, 'nudge') + e.detail.delta * 0.05) * 100) / 100); borrowStep(i); }
    stepEdited(); return;
  }
  if (!shift) return setFilter(stepFilter(pfx.filter, e.detail.delta));   // P6: the wheel = the performance filter (it stops at "off" on the way across)
  m.humanize = Math.max(0, Math.min(1, m.humanize + e.detail.delta * 0.03)); sliders.humanize?.set(Math.round(m.humanize * 100)); readout(); save(); });   // Shift + wheel = humanize
// L3: hold step(s) + push the jog wheel = the next stroke (open → mute → slap → lane sound) on voices that have them
move.addEventListener('wheelPush', (e) => {
  if (e.detail.pressed && !held.size) return setFilter(0);   // P6: push the wheel with no step held = filter off
  if (!e.detail.pressed || !held.size || !ARTICS[m.lane.voice]) return; const lane = m.lane;
  for (const h of held.values()) { h.used = true; lane.cycleArtic(lane.stepIndex(h.step)); borrowStep(h.step); }
  auditionLock(); stepEdited();
});
move.addEventListener('volume', (e) => { vol = Math.max(0, Math.min(1, vol + e.detail.delta * 0.02)); kit?.master.gain.rampTo(vol, 0.05); });
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : ''; renderPage(); paintLeds(); return; }   // the track buttons show lanes 5–6 while Shift is held
  if (name === 'loop') { loopHeld = hands.loop = pressed; renderPage(); if (!pressed) { if (chainPick.length === 1) recallSlot(chainPick[0]); else if (chainPick.length > 1) chainSlots(chainPick); chainPick = []; } paintLeds(); return; }
  if (name === 'duplicate') { dupHeld = pressed; paintLeds(); return; }
  if (name === 'back') { if (pressed) pages.backDown(); else pages.backUp(); paintLeds(); return; }   // L5 pages
  if ((name === 'left' || name === 'right') && pages.back) { if (pressed) { pages.pin(pages.current(m.lane, playing) + (name === 'right' ? 1 : -1), m.lanes); paintLeds(); } return; }
  // hold = fill; P3 Shift + Layout = fill for the next bar (its release is not the end of a held fill)
  if (name === 'layout') { if (pressed && shift) { latchPress = true; armLatch(); } else if (!pressed && latchPress) latchPress = false; else setFill(pressed); return; }
  if (name === 'sampling' && pressed) { toggleJam(); return; }
  if (name === 'plus') { setThrow(pressed); return; }   // P6: hold + = delay throw
  // P2 Mute: a tap (on release) mutes the selected lane, Shift + Mute = solo; held, a track button or a pad row mutes that lane instead
  if (name === 'mute') {
    if (pressed) { mute.held = true; mute.used = shift; if (shift) toggleSolo(); paintLeds(); }
    else { const used = mute.used; mute.held = false; mute.used = false; if (!used) toggleMute(m.selected); else paintLeds(); }
    return;
  }
  if (name === 'delete' && pressed && held.size) { for (const h of held.values()) { h.used = true; m.lane.clearLocks(m.lane.stepIndex(h.step)); m.lane.trigs[m.lane.stepIndex(h.step)] = null; } stepEdited(); return; }
  // A4 / A6: touching a knob, Delete clears that knob's automation on the selected lane (one undo step); Record cycles
  // knob recording off → touch → latch
  if (pressed && touched.size && (name === 'delete' || (name === 'record' && !shift))) {
    const pk = [...touched.values()].at(-1);
    if (name === 'record') { setKnobs(KNOB_MODES[(KNOB_MODES.indexOf(rec.knobs) + 1) % KNOB_MODES.length]); toast(`knob recording: ${rec.knobs}`); return; }
    toast(autoEdit(l => l.clearAuto(pk.k, pk.kind)) ? `${knobWord(pk.k)}: automation cleared on lane ${m.selected + 1}` : `${knobWord(pk.k)}: no automation on lane ${m.selected + 1}`); return;
  }
  // P1: in live mode Delete (clear lane) and Capture (randomize all) need Shift or a hold, and flash first
  if (name === 'delete' && (perf.live || guard.held('delete'))) return guarded('delete', pressed, clearLane, 'clear the lane');
  if (name === 'capture' && (perf.live || guard.held('capture'))) return guarded('capture', pressed, () => randomizeAll(), 'randomize all');
  if (!pressed) return;
  const tr = /^track(\d)$/.exec(name); if (tr) { const li = trackLane(+tr[1], shift, m.lanes.length); if (mute.held) { mute.used = true; toggleMute(li); return; } m.select(li); lockStep = -1; sync(); return; }   // track 1 is the top button = lane 4; Shift + track 4 / 3 = lane 5 / 6; Mute held = that lane's mute
  if (name === 'delete') { clearLane(); return; }   // Delete alone = clear the lane (undoable)
  if (name === 'minus') { setEvolve(!evo.on); return; }   // − = evolve on / off (in live mode Shift + Capture randomizes)
  if (name === 'play') togglePlay(); if (name === 'undo') { if (shift) redo(); else undo(); }
  if (name === 'capture') { if (shift) setEvolve(!evo.on); else randomizeAll(); }
  if (name === 'record') { if (shift) tapTempo(); else setRec(!rec.armed); }
  if (name === 'left' || name === 'right') { const dir = name === 'right' ? 1 : -1; if (shift) cycleKit(dir); else cycleVoice(m.selected, dir); }
});
// randomize: click = musical, Shift+click or a long press (touch) = wild; the 'wild' button says it out loud
{ const b = $('btn-random'); longPress(b, () => randomizeAll(true)); b.onclick = (e) => randomizeAll(e.shiftKey); }
$('btn-wild').onclick = () => randomizeAll(true);
$('btn-clear').onclick = clearLane; $('btn-reset').onclick = () => { if (playing) resetPending = true; m.resetAll(); scene.reset(); };
const KEYS = ['12345678', 'qwertyui', 'asdfghjk', 'zxcvbnm,'];
window.addEventListener('keyup', (e) => { if (e.key === '0') setFill(false); });
// Who owns a key press? A control owns it only when the keyboard put the focus there (Tab, arrows): then Space / Enter
// press that control and letters don't reach the pads. Focus left behind by a click or a tap counts for nothing, and
// any press of the mouse or a finger, or a knob turned with the wheel, takes the keys back from a control the keyboard
// focused before (knobs don't take the focus): Space plays, letters toggle steps, as from the page. Escape gives them
// back too; scrolling the page doesn't. Text fields own every key; a knob only its arrows; a select all of them
// (type-ahead); modifier shortcuts (Alt+1–4, Cmd/Ctrl+Z) work everywhere but in text fields. (:focus-visible can't
// tell the two apart: Chrome turns it on at the first key press.)
const TEXT_SEL = 'input, textarea, [contenteditable]:not([contenteditable=false])', CONTROL_SEL = 'button, summary, a[href], select, [role=slider], .gauge';
// (KNOB_KEYS, keyFocused and lastInput are declared above the RD-5 console, which reads them)
const takeKeysBack = () => { if (document.activeElement) keyFocused.delete(document.activeElement); };
addEventListener('pointerdown', () => { lastInput = 'pointer'; takeKeysBack(); }, true);
addEventListener('wheel', (e) => { if (e.target instanceof Element && e.target.closest('.gauge')) takeKeysBack(); }, { capture: true, passive: true });
addEventListener('keydown', (e) => { if (e.key === 'Tab' || (e.key.startsWith('Arrow') && e.target?.id !== 'find')) lastInput = 'key'; }, true);   // the keys that move focus (find's ↑↓ pick a row, they move none)
addEventListener('focusin', (e) => { if (lastInput === 'key') keyFocused.add(e.target); else keyFocused.delete(e.target); }, true);
/** Focus a control on the page's behalf (no scroll) with the ownership given: focusin alone goes by the last input. */
function focusAs(el, owned) { el.focus({ preventScroll: true }); if (owned) keyFocused.add(el); else keyFocused.delete(el); }
function controlOwnsKey(e) {
  const el = e.target instanceof Element ? e.target : null; if (!el || el === document.body || el.id === 'cv') return false;
  if (el.closest(TEXT_SEL)) return true; if (e.altKey || e.metaKey || e.ctrlKey) return false;
  const c = el.closest(CONTROL_SEL); if (!c || !keyFocused.has(el)) return false;
  return c.matches('[role=slider], .gauge') ? KNOB_KEYS.has(e.key) : true;
}
/** A select picked with the mouse gives the focus back to the page (else the arrow keys would keep changing it). */
function letGoAfterPointer(el) { if (lastInput === 'pointer') el.blur(); }
window.addEventListener('keydown', (e) => {
  if ($('help').open || $('gift').open) return;   // the help and the shared-beat card are modal: keys are their own (Esc closes them)
  // a held Space repeats: the repeats are the page's too, or the browser presses the button the mouse left focused on
  // release (holding Space to play also toggled the step just clicked)
  if (e.repeat) { if (e.key === ' ' && !controlOwnsKey(e)) e.preventDefault(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { if (e.target instanceof Element && e.target.closest(TEXT_SEL)) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  // ? = help from anywhere but a text field: a button or a drawer header the keyboard reached has no use for it
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !(e.target instanceof Element && e.target.closest(TEXT_SEL))) { e.preventDefault(); openHelp(); return; }
  // RD-4 ⌘K / Ctrl+K and / = find, from anywhere but a text field (it owns its keys); / not from a select (type-ahead)
  if (opensFind(e, !(e.target instanceof Element) ? '' : e.target.closest(TEXT_SEL) ? 'text' : e.target.closest('select') ? 'select' : '')) { e.preventDefault(); openFind(); return; }
  if (controlOwnsKey(e)) return;
  if (e.code === 'Backquote' && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setLog(!face.log); return; }   // RD-5: ` = the console log (a field keeps its keys: above)
  if (slog && e.key.toLowerCase() === 'l' && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const f = slog.file({ page: location.pathname, tempo }); download(f.text, f.name, 'application/json'); return; }   // RD-1: L saves the setlog
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if (e.key === '0') { setFill(true); return; }
  // F = focus mode (Caps Lock too; Shift+F accents the pad); while record is armed the keys are pads, so F plays its pad
  // (Esc still leaves focus mode)
  if (e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !rec.armed) { e.preventDefault(); setFocusMode(!focusMode); return; }
  if (e.altKey && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); const li = +e.code.slice(5) - 1; if (li < m.lanes.length) { m.select(li); lockStep = -1; sync(); } return; }   // code, not key: Option+1 types ¡ on a Mac
  const r = KEYS.findIndex(k => k.includes(e.key.toLowerCase())); if (r < 0 || e.metaKey || e.ctrlKey) return;
  e.preventDefault();   // a select the mouse left focused would also jump to the voice starting with that letter
  const row = padBase() + 3 - r, col = KEYS[r].indexOf(e.key.toLowerCase()); if (rec.armed) return liveHit(row, col, null, e.shiftKey);   // keys have no velocity: Shift = accent; the rows are the pads' lanes
  const lane = m.lanes[row], i = pages.padFirst(lane, playing) + col; if (i >= lane.length) return;   // the keys mirror the pads, page included
  if (e.shiftKey) lane.toggleAccent(lane.stepIndex(i)); else lane.toggle(lane.stepIndex(i)); m.select(row); sync();
});

// ---- Move connection ----
function setPill(t, cls, title = '') { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; el.title = title; }
// RD-7 the Move pill heads the column (DECISION: "Move · live"): connected, it says the pads' mode (live or edit)
let moveFw = '';
const movePill = () => { if (moveOn) setPill(`Move · ${perf.live ? 'live' : 'edit'}`, 'pill-on', `Move connected${moveFw} · live mode ${perf.live ? 'on: the pads play' : 'off: the pads edit steps'} (Sheet → setup)`); };
// One button says what it does next (Connect Move → Connecting… → Disconnect Move); the pill beside it says how it went.
// Its words carry the state, so no aria-pressed (a toggle's label must not change). While connecting it is
// aria-disabled, not disabled: a disabled button drops the keyboard focus to the page. Where Web MIDI is missing (iOS
// Safari, Firefox without the add-on) the Move can't work at all, so the connect UI (hidden in the HTML) stays hidden.
let moveOn = false, connecting = false, portsWatched = false;
function paintConnect(busy = false) {
  const b = $('btn-connect'); connecting = busy; b.setAttribute('aria-disabled', busy);
  b.textContent = busy ? 'Connecting…' : moveOn ? 'Disconnect Move' : 'Connect Move'; b.classList.toggle('primary', !moveOn);
}
async function connectMove() {
  paintConnect(true);
  try {
    await wake(); const inputs = midi.access ? midi.inputs() : (await midi.init()).inputs;
    if (!portsWatched) { portsWatched = true; midi.addEventListener('ports', () => { pmidi.refresh(); renderMidi(); }); }
    const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn'); const { identity } = await move.connect(); moveOn = true; paintLeds();
    moveFw = identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''; movePill(); pmidi.refresh(); renderMidi();
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); } finally { paintConnect(); }
}
function disconnectMove() { move.disconnect(); moveOn = false; touched.clear(); if (knobGest?.knob != null) gestEnd(true); setPill('Move: disconnected (back to standalone)', 'pill-off'); paintConnect(); }   // A6: no touch can end after this
$('btn-connect').onclick = () => { if (!connecting) (moveOn ? disconnectMove() : connectMove()); };
if (midi.supported) { $('move-status').hidden = false; paintConnect(); }
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---- visuals: concentric orbits, one ring per lane, each turning at its own speed (see scene.js) ----
// RD-6 held: the steps that get a halo (a Move step button down on the selected lane, and the step a step-page knob edits
// while a hand is on it)
// RD-6 the halos: the Move's held steps once looked at (a tap draws nothing), and the step a step-page knob edits while a
// hand is on it. Asked every frame: nothing allocated while nothing is held
const NO_HELD = [];
const scene = createScene($('cv'), { held: () => { if (!pages.held.size && !handOn.size) return NO_HELD; const out = pages.lookedSteps(performance.now()).map(i => ({ li: m.selected, i })); const h = handOn.size && [...handOn.values()].pop(); if (h && lockStep >= 0 && knobPage.shown === 'step' && /^lock:|^cond$/.test(h)) out.push({ li: m.selected, i: lockStep }); return out; }, machine: () => m, align: () => ({ tick: playing ? Math.max(0, heardTick() - m.origin) : 0, cycle: m.cycleTicks(cycleOpts()), bar: bars.len, beat: PPQ }), isRecording: () => rec.armed, jamProgress: () => (jam.state === 'rec' || jam.state === 'armed' ? jam.beats / JAM_BEATS : null), jamBeats: JAM_BEATS, laneHex: LANE_HEX, isPlaying: () => playing, isBusy: () => playing || performance.now() < busyUntil, stepMs: (lane) => m.stepSeconds(lane, tempo) * 1000,
  // RD-8 the light's sources, read per frame (cheap getters, no DOM): the generative layer and its clock (bars since Play,
  // how far the ear is into the bar from the last line: the crawl), the slots, fill from anywhere, the first visit, the
  // selected lane's words
  gen: () => ({ evolve: evo.on, every: evo.every, home: evo.home > 0, ...genClock(playing, barN, playing ? heardTick() : 0, barAt, bars.len), beats: barBeats.num || Math.round(bars.len / PPQ), dice: dice.locked ? dice.seed : null, repeat: dice.repeat, coupling: m.couple?.mode || 'off', gravity: evo.gravity }),
  slots: () => ({ filled: bank.slots.map(Boolean), current: bank.current, pending: bank.pending }), fill: () => fill, hint: () => neverPlayed, laneLabel: (li) => ({ name: voiceLabel(m.lanes[li]), ratio: RATIO_LABEL[m.lanes[li].ratioIndex] }) });
addEventListener('resize', poke); document.fonts?.ready.then(poke);
// ---- I1 playing on the canvas (pointer events: mouse, pen and touch alike). Tap a step tick = a hit (a pop; heard at
// once when stopped, on its turn while playing), tap a planet = on → accent → off, drag along a ring = rotate it (whole
// steps), drag across it or pinch = its length, long-press (or right-click) a planet = a radial menu of its locks.
// Touching a ring selects its lane. Each gesture is one undo step (ownNext): the drag paints as it goes and records once,
// on release. A gesture belongs to the lane it started on: if that lane goes (a slot, a chain step, undo, a load), the
// gesture ends with nothing done. The keyboard way is the steps strip and the lane knobs. ----
const lenParam = PARAMS.find(p => p.k === 'length'), rotParam = PARAMS.find(p => p.k === 'rotation');
const TAP_PX = 22;       // a tap this close to a tick (or planet) plays it; farther along the ring it only selects the lane
const pts = new Map();   // pointers down on the canvas: id → { x, y }
let gest = null;         // { li, lane, step, x0, y0, dx0, dy0, kind: null | 'turn' | 'pull' | 'pinch' | 'long', start, … }
let emptyTap = null;     // RD-4: a press off the rings, { id, x, y }: released in place = one Esc
const fingers = () => [...pts.values()], spread = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y), gone = (g) => m.lanes[g.li] !== g.lane;
/** While a drag is under way: the steps strip and the lane knobs follow, the canvas redraws, nothing is recorded yet. */
function dragPaint() { for (const p of PARAMS) sliders[p.k].set(p.get(m.lane)); renderSteps(); paintLeds(); poke(); }
/** A pull or a pinch sets the length from the lane as it was when the gesture started (`start`, a copy of it), so a pull
 *  out and back in leaves every hit, accent and lock as they were, not as a shorter euclid fill rewrote them. */
function dragLength(len) {
  const g = gest, lane = m.lanes[g.li]; if (len === lane.length) return;
  lane.restore(g.start); if (len !== g.len0) lenParam.set(lane, len);   // back where it started: exactly as it was
  g.changed = 'len'; dragPaint();
}
function canvasTap(li, i) {
  const lane = m.lanes[li]; lane.tapStep(lane.stepIndex(i)); m.select(li); ownNext = true; sync();
  const on = lane.hitAt(i); scene.flash(li, i, on && lane.accentAt(i));   // off (or a euclid mask silenced it): a small flash only
  if (on) auditionStep(lane, i);   // stopped: you hear it now; playing: on its turn (a hit now would cut the queued one)
}
const cv = $('cv');
cv.addEventListener('pointerdown', (e) => {
  if (e.button) return;   // right-click: contextmenu below
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture?.(e.pointerId);
  if (pts.size === 2 && gest && gest.kind !== 'long' && !gone(gest)) {   // a second finger: pinch the ring the first one is on
    clearTimeout(gest.timer); if (gest.kind === 'turn') { rotParam.set(gest.lane, gest.rot0); }   // a pinch, not a turn
    Object.assign(gest, { kind: 'pinch', d0: Math.max(10, spread(fingers())) }); if (m.selected !== gest.li) { m.select(gest.li); sync(); } return;
  }
  if (pts.size > 1) return;
  // RD-4: a press off the rings is a click on empty canvas: released where it went down, it is one Esc (the Esc order).
  // A press that closes a popup is that popup's Esc already, so its release does nothing more
  const popup = popupOpen(); if (popup) closePopups(); emptyTap = null; longFired = false;
  const at = scene.locate(e.clientX, e.clientY); if (at.lane < 0) { gest = null; if (!popup) emptyTap = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
  const lane = m.lanes[at.lane], onTick = at.off <= TAP_PX;
  gest = { li: at.lane, lane, step: onTick ? at.step : -1, x0: e.clientX, y0: e.clientY, dx0: at.dx, dy0: at.dy, kind: null, rot0: lane.rotation, len0: lane.length, start: structuredClone(lane.toJSON()), changed: null,
    stepPx: Math.max(8, (at.g.gap * at.g.R) / 3), timer: onTick && lane.hitAt(at.step) ? setTimeout(() => { if (!gest || gest.kind || gone(gest)) return; gest.kind = 'long'; longFired = true; planetStep(gest.li, gest.step); }, LONG_MS) : 0 };
});
cv.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const g = gest; if (!g || g.kind === 'long') return;
  if (gone(g)) { clearTimeout(g.timer); gest = null; return; }   // its lane went: the gesture is over
  if (g.kind === 'pinch') { if (pts.size === 2) dragLength(pinchLength(g.len0, spread(fingers()) / g.d0)); return; }
  const mx = e.clientX - g.x0, my = e.clientY - g.y0;
  if (!g.kind) { if (Math.hypot(mx, my) <= LONG_SLOP) return; clearTimeout(g.timer); g.kind = dragKind(g.dx0, g.dy0, mx, my); g.a = ringAngle(g.dx0, g.dy0); g.turn = 0; if (m.selected !== g.li) { m.select(g.li); sync(); } }
  const at = scene.locate(e.clientX, e.clientY), lane = g.lane;
  if (g.kind === 'turn') {
    const a = ringAngle(at.dx, at.dy); g.turn += angleDelta(g.a, a); g.a = a;
    const rot = turnRotation(g.rot0, g.turn, lane.length); if (rot !== lane.rotation) { rotParam.set(lane, rot); g.changed = 'rot'; dragPaint(); }
  } else dragLength(pullLength(g.len0, outward(g.dx0, g.dy0, at.dx - g.dx0, at.dy - g.dy0), g.stepPx));   // along the line it started on: past the centre still shorter
});
function gestureEnd(e, tap) {
  if (!pts.delete(e.pointerId) || pts.size) return;
  const t = emptyTap; emptyTap = null; if (t && tap && t.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= LONG_SLOP) escapeOnce();   // never an edit
  const g = gest; gest = null; if (!g) return; clearTimeout(g.timer); if (gone(g)) return;
  // between the ticks: select only; RD-6: a planet tapped while the mouse holds a step page open switches the page to it
  if (!g.kind && tap) { if (g.step >= 0 && g.lane.hitAt(g.step) && planetAction(knobPage.latch === 'step' && lockStep >= 0) === 'open') planetStep(g.li, g.step); else if (g.step >= 0) canvasTap(g.li, g.step); else { m.select(g.li); sync(); } }
  else if (g.changed) { ownNext = true; sync(); questEvent({ type: 'edit', lane: g.li, k: g.changed === 'rot' ? 'rotation' : 'length' }); }   // the whole turn / pull / pinch: one undo step
}
// touch: a finger that lands on a ring plays it (no scroll, no zoom); off the rings (the core, the corners of a phone's
// stage) the page scrolls as it always did: touch-action can't tell the rings from the space between them, this can.
// A long press that opened the lock menu sends no click on release (it would press the pill under the finger). A
// cancelled touch sends no mouse events either, so it takes the focus off a field itself, as a click there does
cv.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0]; if (!gest && !(t && scene.locate(t.clientX, t.clientY).lane >= 0)) return;
  e.preventDefault(); const a = document.activeElement; if (a instanceof HTMLElement && a !== document.body) a.blur();
}, { passive: false });
let longFired = false;   // a long press opened a step page: its touch sends no click on release
cv.addEventListener('touchend', (e) => { if (longFired) { longFired = false; e.preventDefault(); } }, { passive: false });
cv.addEventListener('pointerup', (e) => gestureEnd(e, true));
cv.addEventListener('pointercancel', (e) => gestureEnd(e, false));
cv.addEventListener('contextmenu', (e) => {   // right-click, or a touch browser's own long press: the planet's step page
  e.preventDefault(); if (gest?.kind === 'long') return; const at = scene.locate(e.clientX, e.clientY);
  if (at.lane >= 0 && at.off <= TAP_PX && m.lanes[at.lane].hitAt(at.step)) planetStep(at.lane, at.step);
});
/** RD-6: a planet's long-press or right-click (or a tap while a step page is latched) opens its step page on the
 *  console: the one lock editor (the radial menu it replaces put five lock buttons over the rings). Focus mode hides the
 *  console the page lives on, so opening it leaves focus mode. */
function planetStep(li, i) { if (focusMode) setFocusMode(false); if (m.selected !== li) { m.select(li); lockStep = -1; sync(); } openStep(i); }
// ---- stress meter: canvas frame time + audio scheduler lateness → 0..1 (the scene sheds sparks/stars on its own) ----
// C4: a diagnostic, so it shows (and runs) only with ?debug in the URL
const DEBUG = new URLSearchParams(location.search).has('debug'); $('stress-meter').hidden = !DEBUG;
if (DEBUG) setInterval(() => {
  if (document.hidden) return; const { frameMs, quality } = scene.stats();
  const jank = playing ? Math.min(1, Math.max(0, (frameMs - 18) / 40)) : 0, late = playing ? Math.min(1, Math.max(0, (30 - stress.headMs) / 50)) : 0;   // < 30 ms of headroom starts to count, < −20 ms = notes in the past
  const lvl = (stress.level = stress.level * 0.6 + Math.max(jank, late) * 0.4); if (!playing && lvl < 0.005 && $('stress').style.width === '0%') return;
  const col = lvl > 0.7 ? 'var(--bad)' : lvl > 0.4 ? '#fde047' : 'var(--signal-cyan)', word = lvl > 0.7 ? 'overload' : lvl > 0.4 ? 'busy' : quality < 1 ? 'shedding visuals' : 'calm';
  const bar = $('stress'); bar.style.width = `${Math.round(lvl * 100)}%`; bar.style.background = col;
  const sv = $('stress-val'); sv.textContent = `${Math.round(lvl * 100)}% · ${word}`; sv.style.color = col;
  $('stress-val').parentElement.title = `stress ${Math.round(lvl * 100)}% · frame ${frameMs.toFixed(0)} ms · audio headroom ${stress.headMs.toFixed(0)} ms · visuals ${Math.round(quality * 100)}%`;
}, 300);
// C2: one status line (tempo, play state, slot, rec, evolve, kit + whatever is live right now); the per-lane rows and
// the sound row repeat the knobs, so they sit in the collapsed "nerd stats" drawer with the rest of the details. RD-5:
// the line left the face; the console log (` or Sheet → setup) shows it with the per-lane and sound rows (consoleLog)
function readout() {
  poke();
  const slot = `slot ${bank.current >= 0 ? bank.current + 1 : '–'}${bank.pending >= 0 ? ` → ${bank.pending + 1}` : ''}`;
  statusLine = [`${tempo} bpm`, ...(m.meter !== '4/4' ? [m.meter] : []), playing ? 'playing' : 'stopped', slot, rec.armed ? `rec ●${rec.knobs !== 'off' ? ` knobs ${rec.knobs}` : ''}` : 'rec ○', `evolve ${evo.on ? 'on' : 'off'}`, `kit ${KITS[m.kitKey()]?.name || 'custom'}`,
    ...(fill ? ['FILL'] : latch.state === 'armed' ? ['fill next bar'] : []), ...(pfx.filter ? [filterSay(Math.round(pfx.filter * 100))] : []), ...(pfx.throw ? ['THROW'] : []), ...(muteQ.size ? [`${muteQ.size} mute${muteQ.size > 1 ? 's' : ''} at the bar`] : []), ...(jam.state === 'rec' ? [`jam ${Math.floor(jam.beats)}/${JAM_BEATS}`] : [])].join(' · ');
  if ($('nerd').open) $('nerd-stats').textContent = nerdLines().join('\n');   // written only while someone reads it (opening the drawer fills it)
  if (face.log) paintLog();
  renderLanes(); renderPills(); announceChanges();
}
/** "Nerd stats": the engine line, a row per lane, the selected lane's sound row, what is queued or locked. */
function nerdLines() {
    const sd = m.lane.sound; return [`engine ${engine}   meter ${m.meter}   cycle ${(m.cycleTicks(cycleOpts()) / PPQ).toFixed(1)} beats   humanize ${(m.humanize * 100).toFixed(0)}%`,
      ...m.lanes.map((l, i) => `${i === m.selected ? '▸' : ' '} ${voiceLabel(l).padEnd(7)} len ${String(l.length).padStart(2)}  ×${RATIO_LABEL[l.ratioIndex].padEnd(3)} E${l.euclidK} rot ${l.rotation} swing ${Math.round(l.swing * 100)}%${l.swingTpl !== 'mpc' ? ` ${SWING_TEMPLATES[l.swingTpl].name}` : ''}${l.offsetMs ? ` ${l.offsetMs > 0 ? '+' : ''}${l.offsetMs}ms` : ''} prob ${Math.round(l.prob * 100)}%${l.muted ? '  muted' : ''}${l.solo ? '  solo' : ''}${l.choke >= 0 ? `  chokes ${l.choke + 1}` : ''}`),
      `  sound  ${SOUND_KEYS.map(k => `${k} ${Math.round(sd[k] * 100)}`).join('  ')}`,
      `${bank.pending >= 0 ? `slot ${bank.pending + 1} queued   ` : ''}${bank.chain.length > 1 ? `chain ${bank.chain.map(i => i + 1).join('·')}   ` : ''}${libCurrent && lib.get(libCurrent) ? `setup “${lib.get(libCurrent).name}”   ` : ''}${dice.locked ? `dice ${dice.seed}${dice.repeat > 1 ? `/${dice.repeat}` : ''}   ` : ''}evolve ${evo.on ? `every ${evo.every} bar${evo.every > 1 ? 's' : ''} ${evo.amount}%${lastEvolve ? ` (${lastEvolve})` : ''}` : 'off'}${pmidi.out ? `   midi → ${pmidi.out.name}${pmidi.clockOut ? ' +clock' : ''}` : ''}${pmidi.follow !== 'off' && pmidi.extBpm ? `   ext ${pmidi.extBpm} bpm` : ''}`];
}
// ---- RD-5 the console log (DECISION, kept by the conductor): the old readout as read-only monospace text over the
// stage: the status line, then the per-lane and sound rows of the nerd stats. ` or Sheet → setup toggles it; off by
// default, remembered. Text, not a control (A5), not a live region, under the luminance cap, and outside the grid's
// tracks: it never moves the rings (A7) ----
function paintLog() { const lines = nerdLines(), t = [statusLine, ...lines.slice(1, m.lanes.length + 2)].join('\n'); if ($('console-log').textContent !== t) $('console-log').textContent = t; }
function setLog(on) { face.log = !!on; $('console-log').hidden = !face.log; ui.consoleLog?.set(face.log); if (face.log) paintLog(); saveSettings(); }
// RD-9 night (Sheet → setup): body.night re-points the control tokens (styles.css); state (text contrast, edges, the
// lane ink, the canvas) holds 4.5:1 / 3:1, so it is a brightness, not a theme
function setNight(on) { face.night = !!on; document.body.classList.toggle('night', face.night); ui.night?.set(face.night); saveSettings(); }
$('nerd').addEventListener('toggle', () => { if ($('nerd').open) readout(); });
// The readout is not a live region (5 knob clicks = 5 re-reads of every line). A small polite region says only what
// you changed, after the knob settles: "length 5", "tempo 124 bpm", the lane you switched to, the kit you picked.
// What the machine does on its own (evolve, slots switching on the clock) is not announced (hush).
function speakable() {
  const l = m.lane, o = { sel: m.selected, lane: `lane ${m.selected + 1} ${voiceLabel(l)}`, tempo: `tempo ${tempo} bpm`, transport: playing ? 'playing' : 'stopped', humanize: `humanize ${Math.round(m.humanize * 100)}%`,
    mute: l.muted ? 'muted' : 'unmuted', solo: l.solo ? 'solo on' : 'solo off', record: rec.armed ? 'record armed' : 'record off', fill: fill ? 'fill on' : 'fill off', evolve: evo.on ? 'evolve on' : 'evolve off' };
  for (const p of PARAMS) o[p.k] = `${knobWord(p.k)} ${p.fmt(p.get(l))}`; for (const k of SOUND_KEYS) o['snd:' + k] = `${k} ${Math.round(l.sound[k] * 100)}`;
  o.kit = `kit ${KITS[m.kitKey()]?.name || 'custom'}`;   // last: "decay 55, kit custom" says what you touched first
  return o;
}
function announceChanges() {
  const now = speakable(), prev = spoken; spoken = now; if (!prev || hush) return;
  const picked = now.kit !== prev.kit && m.kitKey();   // a kit picked: its name, not every voice and sound it changed
  const changed = now.sel !== prev.sel ? [now.lane] : picked ? [now.kit] : Object.keys(now).filter(k => k !== 'sel' && now[k] !== prev[k]).map(k => now[k]);
  if (!changed.length || changed.length > 3) return;   // a whole new pattern (undo, slot) is not one value: stay quiet
  clearTimeout(announceTimer); announceTimer = setTimeout(() => { $('announce').textContent = changed.join(', '); }, 300);
}
// ---- RD-3 layout: a CSS grid (left column, stage, right column, console row; styles.css) places everything, and the
// rings take their box from the stage cell alone (ringBox), so no drawer, sheet tab, wrap or focus mode moves them
// (A7). Only the window size does: the cell observer and resize. Narrow windows stack under a square canvas instead ----
// The CSS's own test: its wide rules say `not all and (max-width: 1100px)`, so a zoomed window 1100.5 px wide is one or
// the other, never neither (test/sheet.test.js holds both to it)
const NARROW = matchMedia('(max-width: 1100px)');
function layoutStage() {
  const c = $('stage').getBoundingClientRect();
  // a cell with no size (no grid laid out) never places the rings: they keep the canvas's own box rather than a corner
  if (NARROW.matches || !c.width || !c.height) { scene.setStage(null); poke(); return; }
  scene.setStage(ringBox({ x: c.left, y: c.top, w: c.width, h: c.height }, innerWidth), { x: c.left, y: c.top, w: c.width, h: c.height }); poke();   // RD-8: the cell too, for the light's room
}
new ResizeObserver(layoutStage).observe($('stage')); addEventListener('resize', layoutStage);
// ---- RD-3 the sheet: every drawer and the old right column in one place, six tabs (Greta's feature table). RD-4: closed
// on load everywhere (a tab, ⌘K, /, the A on a knob opens it; Esc or a click on empty canvas closes it); on narrow
// windows it is a bottom sheet, docked closed, full height once a tab is tapped. Only the tab is remembered: an RD-3
// save's `open` still loads (sheetFrom) and is ignored. reveal(el): the tab that holds el, open, and every drawer round
// it, so whatever shows a control (a lock editor, the library, find, a test) finds it drawn ----
const sheetSaved = (() => { try { return sheetFrom(localStorage.getItem(SHEET_KEY)); } catch { return {}; } })();   // storage itself can throw (blocked)
const sheet = { tab: sheetSaved.tab || 'lane', open: false };
let findOpened = false;   // RD-4: find opened the sheet (⌘K or / with it shut), so a result outside it shuts it again
function setSheet(tab, open, user = false) {
  const was = sheet.tab, a = document.activeElement; sheet.tab = SHEET_TABS.includes(tab) ? tab : sheet.tab; sheet.open = !!open;
  if (user || !sheet.open) findOpened = false;   // shut, or a tab picked: the sheet is the player's now
  $('sheet').classList.toggle('open', sheet.open); document.body.classList.toggle('sheet-open', sheet.open);
  for (const t of SHEET_TABS) { const b = $('tab-' + t), on = t === sheet.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('pane-' + t).hidden = !on; }
  // closed, find forgets its query: the next ⌘K / / opens on the recents
  $('sheet-body').hidden = !sheet.open; $('sheet-x').hidden = !sheet.open; $('find-box').hidden = !sheet.open; if (!sheet.open) { findList(false); $('find').value = ''; }
  // focus never stays on what just hid (the pane left behind, the closed body, the × itself): the selected tab takes it.
  // No box = hidden (getClientRects: checkVisibility is missing on older iOS Safari)
  // (RD-5: a closed sheet is not drawn on wide windows: its door, "all ⌘K", takes it)
  if (a && a !== document.body && $('sheet').contains(a) && !a.getClientRects().length) { const t = $('tab-' + sheet.tab); (t.getClientRects().length ? t : $('btn-all')).focus({ preventScroll: true }); }
  if (sheet.open && sheet.tab === 'lane' && was !== 'lane') renderAuto();   // the automation strip measures its canvas: drawn again once it has a size
  // a tab that is one drawer (perform, export) shows it open: the tab was the click, a closed header would ask for another
  // (and a reload that brings the tab back brings it open too)
  const one = $('pane-' + sheet.tab).querySelectorAll(':scope > details'); if (sheet.open && one.length === 1 && $('pane-' + sheet.tab).children.length === 1) one[0].open = true;
  if (user) try { localStorage.setItem(SHEET_KEY, JSON.stringify({ tab: sheet.tab })); } catch {}
}
function reveal(el) {
  el = typeof el === 'string' ? $(el) : el; if (!el) return null;
  const pane = el.closest('[role=tabpanel]'); if (pane && (!sheet.open || sheet.tab !== pane.dataset.sheet)) setSheet(pane.dataset.sheet, true);
  for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) d.open = true;
  // RD-7: a folded pill drops down from "+N more"; the quest's skip and show me drop down from its pill
  if (el.closest('#pills .fold') && !pillsOpen) setPillsOpen(true);
  if (el.closest('#quest-more') && $('quest-more').hidden && !$('quest').hidden) questMore(true);
  // RD-5: a cell of the lane off the 16 the console shows (steps 17–32): its page, as Back + a step pins it on the Move
  const i = el.matches?.('#stepsui .st.out') ? stepBtns.indexOf(el) : -1;
  if (i >= 0 && i < m.lane.length) { pages.pin(Math.floor(i / PAD_COLS), m.lanes); renderSteps(); renderPage(); paintLeds(); }
  return el;
}
// a tab opens its pane (a phone: the tapped tab of an open sheet closes it again); ← → Home End move along the tabs
for (const t of SHEET_TABS) $('tab-' + t).onclick = () => setSheet(t, !(NARROW.matches && sheet.open && sheet.tab === t), true);
$('sheet-x').onclick = () => setSheet(sheet.tab, false, true);
$('sheet').querySelector('[role=tablist]').addEventListener('keydown', (e) => {
  const f = SHEET_TABS.indexOf(document.activeElement?.id?.slice(4)), k = tabMove(e.key, f >= 0 ? f : SHEET_TABS.indexOf(sheet.tab));
  if (k < 0) return; e.preventDefault(); e.stopPropagation();
  const t = SHEET_TABS[k]; setSheet(t, sheet.open || !NARROW.matches, true); $('tab-' + t).focus();
});
NARROW.addEventListener('change', () => setSheet(sheet.tab, false));
setSheet(sheet.tab, false);
// ---- RD-4 find: ⌘K or / opens the sheet with the cursor in one field over every control. The index is read off the
// page each time it opens (lanes, slots and steps are drawn by code): every control with an accessible name, where it
// lives (tab · drawer · group), and the synonyms table (find.js). Enter runs an action (ACTIONS: play, export stems,
// init…) or shows the control: its tab, its drawers, the focus on it, the keys its own. Empty = the recents. The field
// owns its keys (B8); ↑↓ pick, Esc empties it, an empty field's Esc is the Esc order's ----
const FIND_SEL = 'button, select, input, textarea, summary, a[href], [role=slider], [role=tab], [role=radio], [role=switch], [role=checkbox]';
const FIND_OUT = '#find-box, dialog, #stage, #cv';   // the field itself, the modal cards, the canvas
let findRecents = (() => { try { return recentsFrom(localStorage.getItem(FIND_KEY)); } catch { return []; } })();
let findIndex = [], findHits = [], findAt = 0;
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** A label's own words: its text without the controls inside it (a select's options are not its name). */
const labelText = (l) => squash([...l.childNodes].filter(n => !(n instanceof Element && n.matches('select, input, textarea, button'))).map(n => n.textContent).join(' '));
/** The accessible name (aria-labelledby, aria-label, a label, the text, the title), its state after the first comma
 *  left out ("step 3, on, accent" is found as "step 3"). */
function accName(el) {
  const by = el.getAttribute('aria-labelledby'), lab = el.labels?.[0];
  const n = (by && squash(by.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' '))) || el.getAttribute('aria-label') || (lab && labelText(lab)) || (el.matches('select, input, textarea') ? '' : squash(el.textContent)) || el.title || '';
  return squash(String(n).split(',')[0]);
}
/** Hidden for a reason the sheet can't undo (no Web MIDI, a closed popup, the lock panel without a step, steps 17–32 of a
 *  16-step lane: display none on the control itself): out of the index. A closed tab's pane, the closed sheet, a closed
 *  drawer and simple view's tucked drawers (.adv) are not reasons: find opens them. Nor is the closed share menu for
 *  the actions in it (4 bars of audio, the postcard): Enter presses them without opening it. */
const findHidden = (el) => {
  // (RD-5: a cell of the lane off the console's 16 is no reason either: reveal turns the cells' page)
  if (!el.matches('.adv, #stepsui .st.out:not(:disabled)') && getComputedStyle(el).display === 'none') return true;
  const runs = !!ACTIONS[el.id];
  for (let n = el; n; n = n.parentElement) if (n.hidden && !n.matches('[role=tabpanel], #sheet-body') && !(runs && n.id === 'share-menu')) return true;
  return false;
};
/** Where a control lives, as the list says it: the tab, the drawer, the group label round it (each said once: the
 *  export tab's Export drawer is "export"). */
function findWhere(el) {
  const tab = el.closest('[role=tabpanel]')?.dataset.sheet, d = el.closest('details'), sum = d && el.tagName !== 'SUMMARY' ? squash(d.querySelector(':scope > summary')?.textContent).slice(0, 28) : '';
  const grp = el.closest('[role=radiogroup], [role=group]')?.getAttribute('aria-label'), lbl = squash(el.closest('.ctl')?.querySelector('.ctl-lbl')?.textContent);
  return [tab, sum, grp, lbl].filter(Boolean).filter((w, i, a) => a.findIndex(x => x.toLowerCase() === w.toLowerCase()) === i).join(' · ');
}
/** Every labelled control on the page now, as index entries (`el` kept for running it). */
function buildFindIndex() {
  const everything = new Map(PARAMS.map(p => [sliders[p.k]?.el, p.label]));   // I7: in simple view the shift knob is "rotation" too
  return [...document.querySelectorAll(FIND_SEL)].filter(el => !el.closest(FIND_OUT) && !findHidden(el) && !(el.matches('input') && el.type === 'hidden')).flatMap(el => {
    const name = accName(el); if (!name) return [];
    const act = ACTIONS[el.id], where = findWhere(el);
    const e = entry({ key: el.id || `${where}|${name}`, name: act ? act[0] : name, where, action: !!act || el.matches('[role=tab]'), alias: everything.get(el), extra: [act?.[1], act && name, el.tagName === 'SELECT' && [...el.options].map(o => o.text).join(' ')].filter(Boolean).join(' ') });
    return [Object.assign(e, { el })];
  });
}
function findList(show) {
  const list = $('find-list'), inp = $('find'); list.hidden = !show; inp.setAttribute('aria-expanded', String(show)); if (!show) { inp.removeAttribute('aria-activedescendant'); return; }
  list.innerHTML = '';
  findHits.forEach((h, i) => {
    const li = document.createElement('li'); li.id = `find-o${i}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === findAt));
    li.textContent = h.name; if (h.where) { const w = document.createElement('span'); w.className = 'find-where'; w.textContent = h.where; li.appendChild(w); li.setAttribute('aria-label', `${h.name}, ${h.where}`); }   // read with a pause, not run together
    li.onpointerdown = (e) => e.preventDefault();   // the field keeps the focus (and the keys)
    li.onclick = () => findRun(h); list.appendChild(li);
  });
  if (!findHits.length) { const li = document.createElement('li'); li.className = 'find-none'; li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true'); li.textContent = 'nothing by that name'; list.appendChild(li); }
  if (findHits.length) inp.setAttribute('aria-activedescendant', `find-o${findAt}`); else inp.removeAttribute('aria-activedescendant');
}
function findQuery() { findHits = search(findIndex, $('find').value, findRecents); findAt = 0; findList(true); }
/** The field takes the focus, however it got there (⌘K, /, a click, Tab): the page is read now, so a control drawn since
 *  the last time (steps 17–32 of a longer lane, a sixth lane) is found */
function findFocus() { findIndex = buildFindIndex(); findQuery(); }
function openFind() {
  if (focusMode) setFocusMode(false);   // the sheet is hidden in focus mode
  const inp = $('find'); if (!sheet.open) { setSheet(sheet.tab, true); findOpened = true; }
  if (document.activeElement === inp) findFocus(); else focusAs(inp, true);   // focusing it runs findFocus
  inp.select();
}
/** Run a result: an action is pressed (the sheet goes back as it was when it lies outside the sheet), and the keys stay
 *  the page's (Space after "export stems" plays, it doesn't export again); a tab is shown; a control is shown (its tab,
 *  its drawers; simple view gives way to everything for an advanced one) and focused, the keys its own. */
function findRun(h) {
  const el = h.el, inp = $('find'); findRecents = pushRecent(findRecents, h.key); try { localStorage.setItem(FIND_KEY, JSON.stringify(findRecents)); } catch {}
  inp.value = ''; findList(false); if (!el?.isConnected) return;
  if (el.closest('.adv') && quests.view === 'simple') setView('all');
  const inSheet = $('sheet').contains(el), back = findOpened; findOpened = false;   // a result decides the sheet: shut again, or the player's
  if (el.matches('[role=tab]')) { setSheet(el.id.slice(4), true, true); focusAs(el, true); return; }   // shown, never toggled shut (a phone's tab click would)
  if (h.action) {
    // outside the sheet: the field lets go first (closing the sheet with the focus in it would hand the focus, and the
    // keys, to its tab), then the sheet goes back as it was
    if (!inSheet) { keyFocused.delete(inp); inp.blur(); if (back) setSheet(sheet.tab, false); el.click(); return; }
    reveal(el); el.click(); if (el.getClientRects().length) focusAs(el, false); return;
  }
  reveal(el); if (!inSheet && back) setSheet(sheet.tab, false);
  el.scrollIntoView({ block: 'nearest' }); focusAs(el, true);
  if (!el.getClientRects().length) toast(`${h.name}: not on this screen`, 2500);
}
{
  const inp = $('find');
  inp.addEventListener('input', findQuery); inp.addEventListener('focus', findFocus);
  inp.addEventListener('blur', () => findList(false));
  inp.addEventListener('keydown', (e) => {
    const d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (d) { e.preventDefault(); if (findHits.length) { findAt = (findAt + d + findHits.length) % findHits.length; findList(true); $(`find-o${findAt}`)?.scrollIntoView({ block: 'nearest' }); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (findHits[findAt]) findRun(findHits[findAt]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.repeat) return; if (inp.value) { inp.value = ''; findQuery(); } else { inp.blur(); escapeOnce(); } }
  });
}
// ---- RD-4 one Escape: dialog → step page → sheet → focus mode → give the keys back (DECISION §2), one layer per press,
// only what is open and drawn counts (the lock panel hidden in focus mode, a slot menu whose tab was left, are not
// layers then: they close quietly with the next one). A click on empty canvas is the same (scene pointer events above).
// A modal card (help, the shared beat) closes itself; a text field owns its Esc (B8); a popup's own handler (slot menu,
// share menu) answers it first when the focus is in it; a held Esc is one press ----
const drawn = (el) => !!el.getClientRects().length;
// (RD-7: the pills' drop-downs, "+N more" and the quest's hint, are popups too)
const popupOpen = () => (!$('share-menu').hidden && drawn($('share-menu')) && 'share') || (slotMenuFor >= 0 && drawn($('slot-menu')) && 'slot') || (pillsOpen && drawn($('sp-more')) && 'pills') || (!$('quest-more').hidden && drawn($('quest-more')) && 'quest') || null;
function closePopups() { closeShareMenu(); closeSlotMenu(); if (pillsOpen) setPillsOpen(false); if (!$('quest-more').hidden) questMore(false); }
// RD-6: an open step is drawn by the step page, its "more…" panel, or its cell's selection outline (the step tab's step
// after another tab): any of them, really seen, makes it the layer an Esc closes. Seen: focus mode hides the console
// with visibility (so the rings never move), which keeps its boxes: a hidden page or outline is no layer then. (A box
// and the inherited visibility: checkVisibility is missing on older iOS Safari, which runs the app; Chrome keeps a box
// for what a closed <details> holds, so a closed drawer's content is not seen either)
const seen = (el) => !!el && drawn(el) && getComputedStyle(el).visibility === 'visible' && !el.closest('details:not([open])');
const stepDrawn = () => lockStep >= 0 && ((knobPage.shown === 'step' && seen($('knobs'))) || seen($('lockpanel')) || (stepBtns[lockStep]?.classList.contains('sel') && seen(stepBtns[lockStep])));
const escState = () => ({ dialog: !!popupOpen(), step: stepDrawn(), sheet: sheet.open && drawn($('sheet-body')), focus: focusMode });
function escapeOnce() {
  knobPage.lost = null;   // RD-5: a knob the row took the focus from doesn't get it back after an Esc
  const a = document.activeElement, step = escStep(escState());
  closePopups();   // the dialog step, and a popup open but not drawn (no layer) goes with whatever this press closes
  if (step === 'step') { editLocks(lockStep); if (a instanceof HTMLElement && !drawn(a)) a.blur(); }
  else if (step === 'sheet') setSheet(sheet.tab, false, true);
  else if (step === 'focus') setFocusMode(false, true);
  else if (step === 'keys' && a instanceof HTMLElement && a !== document.body) { takeKeysBack(); a.blur(); }
  return step;
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.repeat || e.defaultPrevented || $('help').open || $('gift').open) return;
  if (e.target instanceof Element && e.target.closest(TEXT_SEL)) return;
  escapeOnce();
});
// ---- C5 / RD-9 focus mode: the controls hidden, never state — the orbits fill the window and the pills, the peek and
// all canvas light stay up; the console, the lane list, the Move pill, "?" and the sheet go (styles.css). Key F, the
// settings button; Esc or F to come back ----
// Coming back puts the focus and the page where they were. F gives the keys back to whoever owned them: a control the
// keyboard had reached gets them, anything else (a click's leftover, the page) leaves them to the page, so F, F, Space
// plays. Esc gives them to the page, as it does everywhere. The scroll comes back too: the page's (on a phone it shrinks
// to the window while the panels are hidden) and each column's (a hidden column forgets it).
let focusMode = false, beforeFocus = null;
const columns = () => [$('sheet-body')];
function setFocusMode(on, esc = false) {
  if (on === focusMode) return;
  if (on) {   // before the panels go: hidden, the page is one window tall and scrollY already 0
    const a = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    beforeFocus = { el: a, owned: !!a && keyFocused.has(a), y: scrollY, cols: columns().map(c => c.scrollTop) };
    if (a?.closest('#topbar, #legend, .hud-top, #sheet')) a.blur();   // focus must not stay in a hidden panel (RD-9: the pills and the peek stay up)
  }
  focusMode = on; document.body.classList.toggle('focus-mode', on); $('focus-exit').hidden = !on;
  poke();   // the rings stay where the stage cell puts them (A7: F on or off); a phone's canvas resize redraws itself
  if (!on && beforeFocus) {
    const { el, owned, y, cols } = beforeFocus; beforeFocus = null; scrollTo({ top: y, behavior: 'instant' });
    columns().forEach((c, i) => c.scrollTo({ top: cols[i], behavior: 'instant' }));
    // a click on "exit focus" took the keys back (lastInput), so then the page keeps them
    if (el?.isConnected) focusAs(el, owned && lastInput === 'key' && !esc);
  }
}
$('btn-focus').onclick = () => setFocusMode(true); $('focus-exit').onclick = () => setFocusMode(false);
// ---- C3 / RD-9 help: two tabs in one overlay (button "?" or the ? key) — the keys and mouse tricks, and the Move
// drawn with the current page's meanings on its controls (moveface.js) over its full table. The drawing follows the
// hands while the overlay is up (renderPage), so a Move touch relabels the knobs in place ----
const HELP_TABS = ['keys', 'move'];
function drawHelpMove() { const r = knobPage.r || pageNow(); $('move-draw').innerHTML = drawMoveHelp({ row: r.row, row8: r.row8, cells: r.cells, word: r.word, live: perf.live }); }
function helpMoveUp() { return $('help').open && !$('hpane-move').hidden; }   // a declaration: renderPage asks before this line runs
function helpTab(t) {
  for (const k of HELP_TABS) { const on = k === t, b = $('htab-' + k); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('hpane-' + k).hidden = !on; }
  if (t === 'move') drawHelpMove();
}
for (const k of HELP_TABS) $('htab-' + k).onclick = () => helpTab(k);
$('help').querySelector('.help-tabs').addEventListener('keydown', (e) => {
  const f = HELP_TABS.indexOf(document.activeElement?.id?.slice(5)), j = tabMove(e.key, f >= 0 ? f : 0, HELP_TABS.length);
  if (j < 0) return; e.preventDefault(); helpTab(HELP_TABS[j]); focusAs($('htab-' + HELP_TABS[j]), true);
});
function openHelp() { const d = $('help'); if (!$('hpane-move').hidden) drawHelpMove(); if (!d.open) d.showModal(); }
$('btn-help').onclick = openHelp;
window.__poly = { move, get m() { return m; }, sync, applySound, get knobGest() { return knobGest; }, setKnobs, renderAuto, autoEdit, heardStep, setLaneCount, get bars() { return bars; }, setEngine, makeKit, wake, dspFlush, get engine() { return engine; }, get kit() { return kit; }, hitSound, ensureDsp, applyTempo, bank, rec, evo, pmidi, liveHit, setRec, setEvolve, recallSlot, saveSlot, chainSlots, editLocks, clock: () => ({ tick, clockRef }), undo, redo, hist, dice, toggleSolo, setFill, perf, pfx, setFilter, setThrow, renderPattern, latch, muteQ, toggleMute, armLatch, get fill() { return fill; }, assignSample, assignSlices, breakFromFile, exportWav, exportMidi, exportAll, exportKit, shareLink, shareUrl, shareAudio, recordPostcard, loadDaySeed, get lineage() { return lineage; }, exp, renderSlices, sampleBufs, stress, jam, toggleJam, stopJam, downloadJam, exportStems, lib, loadSetup, saveSetup, initPattern, loadGroove, clearLane, randomizeAll, setEvolve, scene, setFocusMode, get focusMode() { return focusMode; }, setNight, get night() { return face.night; }, openHelp, helpTab, quests, setView, questEvent, setSheet, reveal, renderPills, showMe, setPillsOpen, get pillsOpen() { return pillsOpen; }, showPills: (keys) => { pillsForce = keys?.length ? [...keys] : null; renderPills(); }, hideWelcome, get welcomeOn() { return welcomeOn; }, get sheet() { return { ...sheet }; }, openFind, findIndex: buildFindIndex, escapeOnce, escState, get page() { return pageNow(); }, renderPage, get questLog() { return questLog; }, get setlog() { return slog; } };
$('console-log').hidden = !face.log;   // RD-5: as it was left (off the first time)
document.body.classList.toggle('night', face.night);   // RD-9: night as it was left
readout(); layoutStage(); scene.start();

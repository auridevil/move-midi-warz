import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex } from 'movewire';
import { Machine, RATIOS, RATIO_LABEL, ratioIndexOf, MAX_STEPS, MAX_LANES, LANE_COUNTS, SOUND_KEYS, DEFAULT_SOUND, PPQ, MIDI_DIV, BAR_TICKS, METERS, meterParts, LOCK_KEYS, CONDS, MAX_RATCHET, SWING_TEMPLATES, SWING_KEYS, OFFSET_MS, MAX_SLICES } from './lanes.js';
import { Dice } from './dice.js';
import { History } from './history.js';
import { MovePages, PAD_COLS, PAD_ROWS, STEP_BTNS, padPages, trackLane } from './pages.js';
import { hitVel, liveTick, liveQuiet, collectHits, collectChain, chainSixteenths, chainMeters, hitsToMidi, encodeShare, decodeShare } from './export.js';
import { putSample, getSample, fromAudioBuffer, toAudioBuffer, trimRecord, sampleWindow, padChannels, SLICES_KEY, SLICES_PING, readSlices, chopEqual } from '../samples.js';
import { encodeWav, WAV_BITS } from '../unasm/wav.js';
import { JAM_BEATS, stemsZip, stemFiles, foldLoop, oneShot, renderLead, wholeBarCycle, trimChunks, tagWav, trimOneShot, safeName, headroomGain, logHit, pendingSteps, ringPlan, ringOut, joinRing } from './jam.js';
import { zipStored } from '../punch/ablbundle.js';
import { Library } from './library.js';
import { phaseCorrection } from './midiio.js';
import { onBar, trackBars, SlotBank, SLOT_COUNT, SWITCH_MODES } from './slots.js';
import { PolyMidi, FOLLOW_MODES, strokeNotes } from './midiio.js';
import { VOICES, VOICE_KEYS, velShape, ARTICS, articAt } from './voices.js';
import { DSP_VOICES } from './dsp-voices.js';
import { KITS, KIT_KEYS } from './kits.js';
import { getTempo, setTempo, onTempo, makeTapTempo } from '../tempo.js';
import { makeGauge } from '../gauge.js';
import { segmented, toggleChip, mount, longPress } from '../ui.js';
import { createScene, stageBox } from './scene.js';
import { GROOVES, DEMO_GROOVE, grooveByKey, bootMode } from './grooves.js';

const $ = (id) => document.getElementById(id);
const T = window.Tone;
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));
const SAVE = 'midi-warz.orbit2.v2'; // v2: step = quarter note at ratio 1
const LANE_HEX = ['#f0abfc', '#67e8f9', '#fde047', '#a78bfa', '#86efac', '#fdba74'];   // L2: lanes 5–6 green, orange
// first ever visit = nothing saved yet (read before the first sync() writes it): it gets the demo groove, not init
let firstVisit = true; try { firstVisit = localStorage.getItem(SAVE) == null; } catch {}
let m; try { m = Machine.from(JSON.parse(localStorage.getItem(SAVE) || 'null')); } catch { m = new Machine(); }
if (!m.lanes.some(l => l.hits.some(Boolean))) { m.lanes[0].setEuclid(2); m.lanes[1].setEuclid(2); m.lanes[1].rotation = 1; m.lanes[2].setEuclid(8); m.lanes[3].setEuclid(2); } // kick 1·3, snare 2·4, hats in 8ths, perc 5 over 8ths
let tempo = getTempo(112), awake = false, playing = false, shift = false, vol = 0.8;
// every edit lands in save(): that's where undo history is recorded (knob turns within 0.7 s fold into one step).
// Mute, solo and the selected lane are performance moves, not edits: they are left out of the step key (perfKey), so
// they never make an undo step and Undo keeps them as they are; undoing a load (setup, slot, link, init, groove, a
// randomize roll: loadNext) brings back the pattern you had exactly, its own mutes included, and the tempo you had
// when the load set one (loadNext = { tempo, was }).
const hist = new History(); let restoring = false, loadNext = false;
let spoken = null, announceTimer = 0, hush = false;   // screen-reader announcements (announceChanges, next to readout)
const perfKey = () => JSON.stringify(m, (k, v) => (k === 'muted' || k === 'solo' || k === 'selected' ? undefined : v));
const save = () => { const full = JSON.stringify(m); if (restoring) hist.refresh(full); else hist.commit(full, { key: perfKey(), load: !!loadNext, ...(loadNext?.tempo != null ? loadNext : {}) }); loadNext = false; try { localStorage.setItem(SAVE, full); } catch {} };
const dice = new Dice(); let fill = false;
const lib = new Library(localStorage); let libCurrent = null;   // named setups; id of the one last loaded / saved
// page settings (not part of a pattern): live record, evolve, MIDI I/O
const SETTINGS = 'midi-warz.orbit2.settings.v1';
const rec = { armed: false, accentVel: 100, pitchPads: false, quant: 'nearest' };
const evo = { on: false, every: 4, amount: 40, scope: 'hits', home: 0 };   // home: return to the snapshot after N mutations (0 = never)
let evoSnap = null, evoCount = 0;
const bank = new SlotBank(localStorage);
const pmidi = new PolyMidi({ getAccess: () => midi.access, isMovePort: (p) => move.inControl && /move/i.test(p.name) });
// E1–E3, E6 export format: bit depth (16 / 24 / 32 float), sample rate of offline renders, jam ring-out files, dry
// stems + delay return, MIDI as one Drum-Rack track. Older settings have none of it: the defaults are the old formats
// (16-bit, 44.1 kHz, wet stems, a track per lane); 16-bit stems now share one gain with their raw mix (stemFiles).
const exp = { bits: 16, rate: 44100, ring: false, dry: false, midiOne: false };
const readExp = (o) => { if (!o) return; if (WAV_BITS.includes(o.bits)) exp.bits = o.bits; if (o.rate === 44100 || o.rate === 48000) exp.rate = o.rate; for (const k of ['ring', 'dry', 'midiOne']) if (typeof o[k] === 'boolean') exp[k] = o[k]; };
try { const o = JSON.parse(localStorage.getItem(SETTINGS) || 'null'); if (o) { Object.assign(rec, o.rec, { armed: false }); Object.assign(evo, o.evo, { on: false }); pmidi.fromJSON(o.midi); dice.fromJSON(o.dice); readExp(o.exp); } } catch {}
const saveSettings = () => { try { localStorage.setItem(SETTINGS, JSON.stringify({ rec, evo, midi: pmidi, dice, exp })); } catch {} };

// ---- sounds ----
let kit = null, loop = null;
// every lane owns a chain: voice → choke → drive → tone filter → pan → level ┐
//                                                          └→ send → its own delay ┴→ lane bus → master
// One delay per lane (instead of a shared one) sounds the same — a delay is linear — but keeps each lane's echoes on
// its own bus, so stems and jam recordings carry them. raw = no master compressor/limiter (stems for a DAW).
/** The master glue: compressor → limiter → out. Both look ahead, so the chain delays everything (masterLatency). */
function makeMaster(gain) { const limiter = new T.Limiter(-2).toDestination(); const comp = new T.Compressor({ threshold: -18, ratio: 3 }).connect(limiter); return new T.Gain(gain).connect(comp); }
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
function makeKit({ raw = false, lanes = null } = {}) {
  const master = raw ? new T.Gain(1).toDestination() : makeMaster(vol);
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
/** Push a lane's sound params into its chain (called on every Shift+knob / slider change). */
function applySound(li, k = kit) {
  if (!k) return; const s = lanesOf(k)[li].sound, c = k.chains[li];
  c.drive.distortion = s.drive * 0.9; holdParam(c.drive.wet, s.drive > 0.02 ? 0.3 + s.drive * 0.7 : 0);
  c.tone.frequency.value = 200 * Math.pow(60, s.tone);              // 200 Hz .. 12 kHz (every hit sets it again at its time)
  holdParam(c.pan.pan, s.pan * 2 - 1); holdParam(c.level.gain, s.level * s.level * 1.2); holdParam(c.send.gain, s.send * 0.8);
}
/** Every lane's voice and sound on kit k: after a load, an undo, a kit or a lane-count change. */
function rebuildVoices(k = kit) { lanesOf(k).forEach((_, i) => { buildVoice(i, k); applySound(i, k); }); }
/** Seconds of live hits a jam take keeps for its ring-out (E6): the delay's tail plus a long sample at half speed. */
const RING_KEEP = 48;
/** slice: the slice of a set this hit plays (Lane.sliceAt; null = the lock's, else the first). step: when the step it
 *  plays is due on the grid, before swing, nudge, push or humanize (the scheduler's; a pad or an audition: its time).
 *  Returns the jam log entry it made (E6), if any. */
function hitSound(lane, time, accent, lock = null, vel = null, k = kit, slice = null, step = null) {
  const li = lanesOf(k).indexOf(lane), c = k?.chains[li]; if (!c?.v) return; const s = lane.sound, L = lock || {}, dec = L.decay ?? s.decay;
  // a jam take that wants its ring-out remembers what the live kit played, to render the tails past its end (renderRing),
  // with when its step was due: a downbeat humanized or nudged before the take's end is still the next bar's. A time,
  // not a tick: Play and reset count the ticks from 0 again, a MIDI clock's snap renumbers them
  const logged = k === kit && jam.log ? { li, lane, time, step: step ?? time, accent, lock, vel, slice } : null; if (logged) logHit(jam.log, logged, RING_KEEP);
  // G5: a soft hit is darker, softer and a little shorter (velShape, per voice); dsp layers darken in the worklet
  const p = velShape({ vel: vel ?? hitVel(accent, lock), tune: L.tune ?? lane.tune, dec: 0.04 + dec * dec * 1.2, decayRaw: dec, snap: L.snap ?? s.snap, color: L.color ?? s.color, artic: lane.strokeAt(lock) ?? undefined }, c.voice);   // L3: the stroke live MIDI and the export send too
  const viaDsp = c.voice !== 'sample' && c.engine === 'dsp';
  // choke groups: this hit opens its own lane and cuts the lane it chokes (open hat ← closed hat)
  try { c.choke.gain.setValueAtTime(1, time); const o = k.chains[lane.choke]; if (o && lane.choke !== li) o.choke.gain.setTargetAtTime(0, time, 0.008); } catch {}
  // every hit sets the lane filter at its own time: a tone lock opens / closes it for that hit only, a soft hit (synth
  // voices and samples) closes it by p.dark octaves, any other hit puts it back. Hits can be scheduled out of time order
  // (a ratchet nudged past the next step is scheduled before that step, sounds after it): the automation sorts by time
  const dark = viaDsp ? 0 : p.dark;
  try { c.tone.frequency.setValueAtTime(200 * Math.pow(60, L.tone ?? s.tone) * Math.pow(2, -dark), time); } catch {}
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
async function wake() { if (awake) return; await T.start(); if (engine === 'dsp') await ensureDsp(T.getContext()).catch(() => {}); kit = makeKit(); awake = true; T.getTransport().bpm.value = tempo; buildLoops(); }

// ---- the master clock: 840 ticks per beat drive every lane, MIDI clock, slots and evolve ----
// Each lane's position is derived from the tick (Lane.at), so lanes can't drift apart, whatever you change mid-play.
// The Tone loop still fires 24 times per beat (cheap); each call is a block of MIDI_DIV (35) ticks: one MIDI clock,
// the modulo bookkeeping on every tick, the lanes only on ticks where something can happen (liveQuiet).
const stress = { level: 0, headMs: 100 };
let tick = 0, resetPending = false, clockRef = { tick: 0, time: 0 }; const skip = new Set();   // skip: 'lane:tick' a pad already played live
const early = [];   // per lane: the steps decided ahead of their tick, since part of them sounds before it (liveTick)
const pending = pendingSteps();   // E6: the jam log's early parts, by their step's tick: given its real time when it comes
/** R3 bar lines: at + k × len (trackBars, slots.js). A new time signature (the meter control, a slot, undo, a link)
 *  starts on the next bar line of the old one, so a bar is never cut short, and the lanes start there on step 1
 *  (m.setOrigin); a restart counts from tick 0 in the pattern's meter. barN: bar lines since Play, in any meter. */
let bars = { at: 0, len: BAR_TICKS, next: null }, barN = 0;
const resetBars = () => { bars = { at: 0, len: m.barTicks(), next: null }; barN = 0; m.setOrigin(0); };
function trackMeter(t) { const b = trackBars(bars, t, m.barTicks()); if (b !== bars) { bars = b; m.setOrigin(bars.at); } }
const tickSec = () => 60 / tempo / PPQ;
/** The cycle depends on the locked dice repeat too: every cycleTicks() caller passes this. */
const cycleOpts = () => ({ repeat: dice.locked ? dice.repeat : 1 });
const perfAt = (time) => performance.now() + (time - T.getContext().rawContext.currentTime) * 1000;   // audio time → Web MIDI timestamp
/** The master tick (fractional) at audio-context time `time`, from the clock's latest block. */
const tickAt = (time) => clockRef.tick + (time - clockRef.time) / tickSec();
/** The master tick being heard right now (fractional): the scheduler runs ahead of the speakers, which lag a little. */
const heardTick = () => { const raw = T.getContext().rawContext; return tickAt(raw.currentTime - (raw.outputLatency || 0)); };
function buildLoops() { loop?.dispose(); loop = new T.Loop((time) => onBlock(time), `${T.getTransport().PPQ / 24}i`); loop.start(0); }
function onBlock(time) {
  if (resetPending) { tick = 0; resetPending = false; skip.clear(); early.length = 0; pending.clear(); resetBars(); m.resetAll(); }   // all keyed on the old ticks; loops count from 0 again
  const t0 = tick, ts = tickSec(); tick += MIDI_DIV; clockRef = { tick: t0, time };
  stress.headMs = stress.headMs * 0.9 + (time - T.getContext().rawContext.currentTime) * 1000 * 0.1;   // audio headroom: how far ahead of the speakers we schedule
  pmidi.clockAt(t0, perfAt(time));   // a block starts on the 24-PPQ grid: one clock, 24 per quarter
  let cyc = m.cycleTicks(cycleOpts());   // once per block (and again when a slot or evolve changes the pattern)
  for (let t = t0; t < t0 + MIDI_DIV; t++) cyc = onTick(t, time + (t - t0) * ts, cyc, ts);
}
function onTick(t, time, cyc, ts) {
  trackMeter(t);
  const si = bank.due(t, cyc, bars); if (si >= 0) { loadSlot(si, true); cyc = m.cycleTicks(cycleOpts()); trackMeter(t); }   // a slot in another meter starts its bars (and lanes) here
  if ((t - m.origin) % cyc === 0) T.getDraw().schedule(() => scene.bloom(), time);   // the whole machine lines up again
  // evolve every N bars: the bar lines since Play, counted as they come in whatever meter (the anchor's own included);
  // its way home can bring back another meter, which starts on this bar line too
  const line = t > 0 && onBar(t, bars); if (line) barN++;
  if (line && evo.on && barN % evo.every === 0) { evolveNow(barN, true); cyc = m.cycleTicks(cycleOpts()); trackMeter(t); }
  jamTick(t, time);   // after the slot and evolve: a take starting here counts in the meter that plays from here
  if (pending.size) pending.settle(t, time);   // E6: the early parts of the steps on this tick get the time it came at
  // the steps from a queued slot's switch, or from a new meter's first bar line, belong to what starts there
  const cut = Math.min(bank.nextSwitch(t, cyc, bars), bars.next ? bars.next.at : Infinity);
  if (liveQuiet(m, t, early, { humanize: m.humanize, tickSec: ts, cut })) { if (skip.size) m.lanes.forEach((_, li) => skip.delete(`${li}:${t}`)); return cyc; }
  const now = T.getContext().rawContext.currentTime, at = perfAt(time);
  const play = (li, lane, h, step) => { const ht = Math.max(now, time + h.dt), e = hitSound(lane, ht, h.accent, h.lock, h.vel, kit, h.slice, step); midiHit(li, lane, h.vel, at + (ht - time) * 1000, h.lock); return e; };
  // swing, nudge, push/pull, ±humanize, ratchets; a step nudged or pushed before its tick plays its early part from an
  // earlier tick (liveTick, export.js), unless a queued slot takes over by then (cut) or a pad just played it (skip).
  // step: when the hit's own step is due (this tick; for an early part the later tick it belongs to, estimated at this
  // tempo until that tick comes: pending)
  liveTick(m, t, early, { fill, dice: dice.locked ? dice : null, tickSec: ts, cut, skip }).forEach(({ ev, hits, early: soon }, li) => {
    const lane = m.lanes[li]; for (const h of soon) { const e = play(li, lane, h, time + (h.tick - t) * ts); if (e) pending.add(h.tick, e); }
    if (!ev) return;
    for (const h of hits) play(li, lane, h, time);
    // drawn at its time: by then the lane may be gone (6 → 4 lanes, an undo, a slot with fewer lanes)
    T.getDraw().schedule(() => { if (li >= m.lanes.length) return; scene.onStep({ lane: li, index: ev.index, hit: ev.hit, accent: ev.accent }); lane.shown = ev.index; if (li === m.selected) paintPlayhead(); paintLeds(); }, time);
  });
  return cyc;
}
// the delays glide to the new dotted eighth (a jump in delay time clicks on the echoes still ringing)
function retime({ transport = true } = {}) { if (!awake) return; if (transport) T.getTransport().bpm.rampTo(tempo, 0.1); const d = 60 / tempo * 0.75; for (const c of kit.chains) c.delay.delayTime.rampTo(d, 0.1); }
async function togglePlay() {
  await wake(); playing = !playing; $('btn-play').classList.remove('pulse'); hideWelcome();
  // clockRef restarts with the transport (the countdown and live record read it before the first tick comes)
  if (playing) { tick = 0; resetPending = false; skip.clear(); early.length = 0; pending.clear(); resetBars(); m.resetAll(); scene.reset(); clockRef = { tick: 0, time: T.getContext().rawContext.currentTime + 0.05 }; T.getTransport().start('+0.05'); pmidi.start(performance.now() + 50); } else { if (jam.state === 'rec' || jam.state === 'armed') stopJam(); T.getTransport().stop(); pmidi.stop(); }
  $('btn-play').textContent = playing ? '■ stop' : '▶ play'; paintPlayhead(); paintLeds(); readout();
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
const tap = makeTapTempo(); const tapTempo = () => { const b = tap(); if (b) applyTempo(b); }; $('btn-tap').onclick = tapTempo;

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
  drive: 'Distortion before the filter. A little adds body, a lot shreds.',
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
  'chain bars': 'In a chain (song), how many bars each slot plays before the next one comes in. Chains always change on a bar line.',
  'accent above': 'Live record: pad velocity at or above this becomes an accent (keyboard: Shift = accent).',
  quantize: 'Live record: "nearest step" rounds, so a slightly early hit lands on the coming step; "step just played" always files it under the last step.',
  'pitch pads': 'Live record: the 8 pads of a row play the lane at 8 pitches and write a tune lock with the hit.',
  'evolve every': 'Evolve mode: how many bars between two mutations.',
  'evolve amount': 'Evolve mode: chance per lane of being nudged at each mutation.',
  'evolve scope': 'What evolve may touch: rotation only; rotation + the euclid fill (or one step for hand-made lanes); or also length and speed.',
  'return home': 'After this many mutations evolve snaps back to the home pattern (set when you enable evolve, load or save a slot, or press "home = now"). 0 = drift forever.',
  'clock out': 'Sends MIDI clock (24 per beat, from the master clock) plus start/stop to the MIDI out port, so a DAW or a drum machine follows Orbits.',
  condition: 'Per step: play only on some loops (1:2 = first of every two, 3:4 = third of every four), only while Fill is held (keyboard: hold 0), never while it is, only/never on the first loop after Play, or only if the last conditional step on the lane passed / failed its condition (PRE / not PRE).',
  repeats: 'Per step ratchet: the hit repeats 2–4 times inside its own step; "fade" makes each repeat quieter.',
  solo: 'Solo: only soloed lanes play (several can be).',
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
  { k: 'length', label: 'length', min: 1, max: MAX_STEPS, get: l => l.length, set: (l, v) => { l.setLength(v); if (l.euclidK) l.setEuclid(Math.min(l.euclidK, l.length)); }, fmt: v => v, say: v => `${v} step${v === 1 ? '' : 's'}` },
  { k: 'euclid', label: 'euclid hits', min: 0, max: MAX_STEPS, get: l => l.euclidK, set: (l, v) => l.setEuclid(v), fmt: v => v, say: v => `${v} hit${v === 1 ? '' : 's'}` },
  { k: 'rotation', label: 'rotation', min: 0, max: MAX_STEPS - 1, get: l => l.rotation, set: (l, v) => { l.rotation = ((Math.round(v) % l.length) + l.length) % l.length; }, fmt: v => v, say: v => `${v} step${v === 1 ? '' : 's'}` },
  { k: 'ratio', label: 'speed ×', min: 0, max: RATIOS.length - 1, get: l => l.ratioIndex, set: (l, v) => { l.setRatio(v); retime(); }, fmt: v => RATIO_LABEL[v], say: v => `times ${RATIO_LABEL[v]}` },
  { k: 'prob', label: 'probability', min: 0, max: 100, get: l => Math.round(l.prob * 100), set: (l, v) => { l.prob = Math.max(0, Math.min(1, v / 100)); }, fmt: v => v + '%' },
  { k: 'tune', label: 'tune', min: -100, max: 100, get: l => Math.round(l.tune * 100), set: (l, v) => { l.tune = Math.max(-1, Math.min(1, v / 100)); }, fmt: v => (v > 0 ? '+' : '') + v, say: tuneSay },
  { k: 'offset', label: 'push / pull', min: -OFFSET_MS, max: OFFSET_MS, get: l => l.offsetMs, set: (l, v) => l.setOffset(v), fmt: v => (v > 0 ? '+' : '') + v + ' ms', say: v => v ? `${Math.abs(v)} ms ${v > 0 ? 'late' : 'early'}` : 'on time' },
  { k: 'velHuman', label: 'vel humanize', min: 0, max: 100, get: l => Math.round(l.velHuman * 100), set: (l, v) => { l.velHuman = Math.max(0, Math.min(1, v / 100)); }, fmt: v => v + '%' },
  { k: 'swing', label: 'swing', min: 0, max: 100, get: l => Math.round(l.swing * 100), set: (l, v) => { l.swing = Math.max(0, Math.min(0.66, v / 100)); }, fmt: v => v + '%' },
];
function tuneSay(v) { return v === 0 ? 'centre' : `${Math.abs(v)}% ${v > 0 ? 'up' : 'down'}`; }   // spoken: ±100 = about an octave
const sliders = {};   // k -> gauge handle ({ set, value })
const laneTabs = [];  // the four coloured lane buttons: a touch-friendly alternative to tapping a ring
function buildSliders() {
  const el = $('sliders'); el.innerHTML = '';
  for (const p of PARAMS) { const g = makeGauge({ label: p.label, min: p.min, max: p.max, value: p.get(m.lane), fmt: p.fmt, say: p.say, title: INFO[p.k], onChange: (v) => { p.set(m.lane, v); sync(); } }); sliders[p.k] = g; el.appendChild(g.el); }
  // G6: the swing template sits right after the swing gauge
  ui.swingTpl = segmented({ options: SWING_KEYS.map(k => [k, SWING_TEMPLATES[k].name, INFO['swing template']]), value: m.lane.swingTpl, onChange: (k) => { m.lane.setSwingTpl(k); sync(); } });
  const sw = document.createElement('div'); sw.className = 'ctl swing-tpl'; sw.title = INFO['swing template']; sw.innerHTML = '<span class="ctl-lbl">swing template</span>'; sw.appendChild(ui.swingTpl.el); sliders.swing.el.after(sw);
  const ge = $('global-sliders'); ge.innerHTML = '';
  // exact: a clock-in tempo of 127.5 shows as 127.5 (turning the knob still moves in whole bpm)
  sliders.tempo = makeGauge({ label: 'tempo', min: 40, max: 240, value: tempo, exact: true, fmt: (v) => v + ' bpm', title: INFO.tempo, color: 'var(--ember-magenta)', onChange: (v) => applyTempo(v) });
  $('tempo-gauge').replaceChildren(sliders.tempo.el);   // C1: tempo sits in the transport strip
  sliders.humanize = makeGauge({ label: 'humanize', min: 0, max: 100, value: Math.round(m.humanize * 100), fmt: (v) => v + '%', title: INFO.humanize, color: 'var(--nebula-purple)', onChange: (v) => { m.humanize = v / 100; save(); readout(); } }); ge.appendChild(sliders.humanize.el);
  for (let i = 0; i < MAX_LANES; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'lane-tab'; b.style.setProperty('--lane', LANE_HEX[i]); b.title = `select lane ${i + 1} (Alt+${i + 1})`; b.onclick = () => { m.select(i); sync(); }; $('lane-tabs').appendChild(b); laneTabs.push(b); }
  // picked with the mouse, a select lets go of the focus, so the arrow keys don't keep changing it (see controlOwnsKey)
  const vs = $('voice-select'); vs.innerHTML = ''; for (const k of VOICE_KEYS) vs.add(new Option(VOICES[k].label, k)); vs.onchange = () => { setVoice(m.selected, vs.value); letGoAfterPointer(vs); };
  const ks = $('kit-select'); ks.innerHTML = ''; const cu = new Option('custom', 'custom'); cu.disabled = true; ks.add(cu); for (const k of KIT_KEYS) ks.add(new Option(KITS[k].name, k)); ks.onchange = () => { applyKit(ks.value); letGoAfterPointer(ks); };
  const se = $('sound-sliders'); se.innerHTML = '';
  const panSay = (v) => v === 50 ? 'centre' : `${Math.abs(v - 50) * 2}% ${v < 50 ? 'left' : 'right'}`;   // spoken: the knob shows 0–100
  for (const k of SOUND_KEYS) { const g = makeGauge({ label: k, min: 0, max: 100, value: Math.round(m.lane.sound[k] * 100), say: k === 'pan' ? panSay : (v) => v + '%', title: INFO[k], color: 'var(--ember-magenta)', onChange: (v) => { m.lane.setSound(k, v / 100); applySound(m.selected); sync(); } }); sliders['snd:' + k] = g; se.appendChild(g.el); }
}
const pages = new MovePages();   // the Move's pages and pad window (pages.js, used by the Move section below)
function sync() {
  pages.window(m.selected, m.lanes.length);   // the pad window follows every selection, Move or not: the computer keys mirror the pads
  for (const p of PARAMS) sliders[p.k].set(p.get(m.lane));
  ui.swingTpl.set(m.lane.swingTpl);
  for (const k of SOUND_KEYS) sliders['snd:' + k].set(Math.round(m.lane.sound[k] * 100));
  sliders.tempo.set(tempo); sliders.humanize.set(Math.round(m.humanize * 100)); ui.meter?.set(m.meter);
  $('lane-name').textContent = `Lane ${m.selected + 1} · ${voiceLabel(m.lane)}${m.lane.muted ? ' (muted)' : ''}`;
  ui.laneCount?.set(m.lanes.length); laneTabs.forEach((b, i) => { b.hidden = i >= m.lanes.length; if (b.hidden) return; b.textContent = `${i + 1} ${voiceLabel(m.lanes[i])}${m.lanes[i].muted ? ' ·m' : ''}`; b.classList.toggle('sel', i === m.selected); b.setAttribute('aria-pressed', i === m.selected); b.setAttribute('aria-label', `lane ${i + 1} ${voiceLabel(m.lanes[i])}${m.lanes[i].muted ? ', muted' : ''}`); }); renderVoiceOptions(); renderLaneMix(); renderKit();
  $('lane-drawer').open = true; $('lane-drawer').style.borderColor = LANE_HEX[m.selected]; for (const p of PARAMS) sliders[p.k].setColor(LANE_HEX[m.selected]);
  $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : '';
  renderSteps(); renderLocks(); paintLeds(); save(); readout(); renderStrokeNotes();
}
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
  ui.choke.setOptions([[-1, 'nothing'], ...m.lanes.map((l, i) => [i, `${i + 1} · ${voiceLabel(l)}`, `cut lane ${i + 1} when this lane hits`])]); ui.choke.disable(m.selected); ui.choke.set(lane.choke);
  [...ui.choke.el.children].forEach((b, k) => { if (k) b.style.setProperty('--chip', LANE_HEX[k - 1]); });
  $('sample-name').textContent = lane.sample ? `${lane.sample.name}${lane.sliceCount() ? ` · ${lane.sliceCount()} slices, a slice per step` : ''}${lane.voice === 'sample' ? '' : ' (pick it in voice)'}` : 'none loaded';
  renderTrim();
}
function nudge(k, delta) { const p = PARAMS.find(x => x.k === k); p.set(m.lane, p.get(m.lane) + delta); sync(); }
// Step buttons are built once and repainted in place: a rebuild would drop the keyboard focus on every edit, and a
// long press that opens the lock panel would leave the finger on a detached button.
const stepBtns = [];
function buildSteps() {
  const el = $('stepsui');
  for (let i = 0; i < MAX_STEPS; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'st';
    b.title = 'tap = off → on → accent → ghost → off · long-press, right-click or Alt+click = step locks, condition, repeats · Shift+click = accent only';
    b.onclick = (e) => { const lane = m.lane; if (i >= lane.length) return; if (e.altKey) return editLocks(i); const si = lane.stepIndex(i); if (e.shiftKey) lane.toggleAccent(si); else lane.cycleStep(si); sync(); };
    longPress(b, () => { if (i < m.lane.length) editLocks(i); });
    el.appendChild(b); stepBtns.push(b);
  }
}
/** The step of the selected lane sounding now, lit on the strip while playing (only the old and new button change). */
let playheadAt = -1;
function paintPlayhead() {
  const i = playing && m.lane.shown != null && m.lane.shown < m.lane.length ? m.lane.shown : -1; if (i === playheadAt) return;
  stepBtns[playheadAt]?.classList.remove('ph'); stepBtns[i]?.classList.add('ph'); playheadAt = i;
}
function renderSteps() {
  const lane = m.lane; playheadAt = -1; $('stepsui').classList.toggle('short', lane.length <= 16);   // L1: steps 17–32 only for a lane that reaches them
  if (lockStep >= lane.length) lockStep = -1;   // a shorter loop closes the lock panel: no step stays "expanded"
  stepBtns.forEach((b, i) => {
    const inLoop = i < lane.length, hit = inLoop && lane.hitAt(i), acc = hit && lane.accentAt(i), lk = inLoop && lane.shownLock(i), tg = inLoop && lane.trigAt(i), gh = hit && lane.tierAt(lane.stepIndex(i)) === 'ghost';
    b.className = `st${!inLoop ? ' off' : hit ? (acc ? ' acc' : gh ? ' on gh' : ' on') : ''}${lk ? ' lk' : ''}${tg ? ' tg' : ''}${i === lockStep ? ' sel' : ''}`;
    const tgText = tg ? `${tg.cond !== 'always' ? tg.cond : ''}${tg.ratchet > 1 ? ` ×${tg.ratchet}` : ''}`.trim() : '';
    if (tgText) b.dataset.tg = tgText; else delete b.dataset.tg;
    b.disabled = !inLoop; b.setAttribute('aria-pressed', !!hit);
    b.setAttribute('aria-label', `step ${i + 1}, ${!inLoop ? 'outside the loop' : hit ? (acc ? 'on, accent' : gh ? 'on, ghost' : 'on') : 'off'}${lk ? ', locked' : ''}${tg && tg.cond !== 'always' ? `, plays ${tg.cond}` : ''}${tg?.ratchet > 1 ? `, ${tg.ratchet} repeats` : ''}`);
    if (i === lockStep) b.setAttribute('aria-expanded', 'true'); else b.removeAttribute('aria-expanded');
  });
  paintPlayhead();
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
// opening it brings the panel into view: in the scrolling lane panel the slice picker can open below its edge
function editLocks(i) { lockStep = lockStep === i ? -1 : i; renderSteps(); renderLocks(); if (lockStep >= 0) $('lockpanel').scrollIntoView({ block: 'nearest' }); }
/** After a lock / condition / repeat edit: redraw the steps, record it, and refresh the readout (a condition or a
 *  prob lock can change the cycle). */
function stepEdited() { renderSteps(); renderLocks(); save(); paintLeds(); readout(); }
/** Lock parameter k on the step the lock panel edits to v (null = unlock), then audition it and record it. */
function lockHere(k, v) {
  if (lockStep < 0) return; const lane = m.lane, i = lane.stepIndex(lockStep); if (v == null) lane.unlock(i, k); else lane.setLock(i, k, v);
  if (k === 'rev') ensureSample(lane);   // the reversed copies, made before the step plays
  auditionLock(); stepEdited();
}
/** S3: a start / end gauge in % of the sample (the lane's row and the lock panel); onChange gets 0..1. */
function trimGauge(k, onChange) { return makeGauge({ label: k, value: k === 'end' ? 100 : 0, fmt: v => v + '%', title: INFO.trim, onChange: (v) => onChange(v / 100) }); }
function buildLockGauges() {
  const el = $('lock-gauges'); el.innerHTML = '';
  for (const k of LOCK_KEYS) {
    const u = LOCK_UI[k]; const g = makeGauge({ label: u.label, min: u.min ?? 0, max: u.max ?? 100, value: 0, fmt: u.fmt, say: u.say || u.fmt || ((v) => v + '%'), title: INFO['lock ' + k] || INFO[k] || '', color: 'var(--signal-cyan)',
      onChange: (v) => { if (lockStep < 0) return; const lane = m.lane; lane.setLock(lane.stepIndex(lockStep), k, v / 100); auditionLock(); stepEdited(); } });
    sliders['lock:' + k] = g; el.appendChild(g.el);
  }
  $('lock-clear').onclick = () => { if (lockStep < 0) return; const i = m.lane.stepIndex(lockStep); m.lane.clearLocks(i); m.lane.trigs[i] = null; stepEdited(); };
  const setTrig = (patch) => { if (lockStep < 0) return; m.lane.setTrig(m.lane.stepIndex(lockStep), patch); auditionLock(); stepEdited(); };
  // condition = "every N loops" + which loop (dots), or one of the fill / first specials
  ui.condEvery = mount('cond-every', segmented({ options: [[1, 'always'], [2, '1 in 2'], [3, '1 in 3'], [4, '1 in 4']], value: 1, onChange: (b) => setTrig({ cond: b === 1 ? 'always' : `1:${b}` }) }));
  ui.condSpecial = mount('cond-special', segmented({ options: [['fill', 'with fill', INFO.condition], ['not fill', 'without fill'], ['first', '1st loop'], ['not first', 'after 1st'], ['pre', 'if last passed', INFO.pre], ['not pre', 'if last failed', INFO.pre]], value: null, chips: true,
    onChange: (c) => setTrig({ cond: m.lane.trigAt(lockStep)?.cond === c ? 'always' : c }) }));
  ui.ratchet = mount('trig-ratchet', segmented({ options: [1, 2, 3, 4].map(r => [r, r === 1 ? '1' : `×${r}`, r === 1 ? 'one hit' : `${r} hits inside the step`]), value: 1, onChange: (r) => setTrig({ ratchet: r }) }));
  ui.fade = mount('trig-fade', toggleChip({ label: 'fade repeats', title: 'Each repeat quieter', onChange: (v) => setTrig({ fade: v }) }));
  $('lock-close').onclick = () => editLocks(lockStep);
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
function renderLocks() {   // always after renderSteps, which closes a step a shorter loop left out
  const lane = m.lane, panel = $('lockpanel');
  panel.hidden = lockStep < 0; if (lockStep < 0) return;
  const lk = lane.lockAt(lockStep) || {}, keys = Object.keys(lk);
  renderTrig(lane.trigAt(lockStep));
  $('lock-title').textContent = `step ${lockStep + 1} · ${keys.length ? 'locked: ' + keys.map(k => lockName(lane, k, lk)).join(', ') : 'no locks yet (dim = lane value)'}`;
  const arts = ARTICS[lane.voice]; $('artic-wrap').hidden = !arts;   // a sample lane has none
  if (arts) { if (articFor !== lane.voice) { articFor = lane.voice; ui.artic.setOptions([['lane', 'lane sound', 'no stroke lock: the lane\'s own sound'], ...arts.map((n, a) => [a, n])]); } ui.artic.set(articAt(lane.voice, lk) ?? 'lane'); }   // rebuilt only for a new voice: a click never lands on a detached button
  for (const k of LOCK_KEYS) { const g = sliders['lock:' + k]; g.set(Math.round(lockValue(lane, lockStep, k) * 100)); g.setColor(lk[k] != null ? 'var(--signal-cyan)' : 'rgba(236,233,247,.3)'); }
  const smp = lane.voice === 'sample' && !!lane.sample; $('lock-sample').hidden = !smp;   // S1 / S3
  if (smp) {
    renderSliceLock(lane, lk); const tr = lane.trimAt(lk);
    for (const k of ['start', 'end']) { const g = sliders['lock:' + k]; g.set(Math.round(tr[k] * 100)); g.setColor(lk[k] != null ? 'var(--signal-cyan)' : 'rgba(236,233,247,.3)'); }
    ui.lockRev.set(lk.rev ?? 'lane');
  }
}
/** Condition picker state from a step's trig: 'a:b' → "1 in b" + dot a lit; specials light their chip. */
function renderTrig(tg) {
  const cond = tg?.cond || 'always', ab = /^(\d):(\d)$/.exec(cond), b = ab ? +ab[2] : cond === 'always' ? 1 : null, a = ab ? +ab[1] : 1;
  ui.condEvery.set(b); ui.condSpecial.set(ab || cond === 'always' ? null : cond); ui.ratchet.set(tg?.ratchet || 1); ui.fade.set(!!tg?.fade);
  const dots = $('cond-dots'); dots.innerHTML = ''; $('cond-dots-wrap').hidden = !(b > 1);
  for (let k = 1; k <= (b || 0); k++) { const d = document.createElement('button'); d.type = 'button'; d.className = `ldot${k === a ? ' on' : ''}`; d.textContent = k; d.title = `play on loop ${k} of every ${b}`; d.style.setProperty('--chip', LANE_HEX[m.selected]); d.onclick = () => { m.lane.setTrig(m.lane.stepIndex(lockStep), { cond: `${k}:${b}` }); auditionLock(); stepEdited(); }; dots.appendChild(d); }
  $('cond-text').textContent = ab ? `plays on loop ${a} of every ${b}${b > 1 ? ` (${[0, 1, 2].map(n => a + n * b).join(', ')}…)` : ''}` : { always: 'plays every loop', fill: 'plays only while Fill is held', 'not fill': 'rests while Fill is held', first: 'plays only on the first loop after Play', 'not first': 'rests on the first loop, then plays', pre: 'plays when the last step with a condition on this lane passed it (PRE)', 'not pre': 'plays when the last step with a condition on this lane failed it (not PRE)' }[cond];
}
function auditionLock() {
  if (!awake || playing || lockStep < 0) return; const lane = m.lane, tg = lane.trigAt(lockStep), n = tg?.ratchet || 1, v = hitVel(lane.accentAt(lockStep), lane.lockAt(lockStep));
  for (let k = 0; k < n; k++) hitSound(lane, T.now() + k * 0.09 / n * 2, lane.accentAt(lockStep) && !k, lane.lockAt(lockStep), tg?.fade ? v * Math.pow(0.72, k) : v, kit, lane.sliceAt(lane.stepIndex(lockStep), lane.lockAt(lockStep)));
}

// ---- pattern slots & chains ----
// Called from the master clock (fromClock): the model and the voices change now, so this tick already plays the new
// state, but the DOM rebuild, JSON, localStorage and undo commit wait until the clock callback has returned.
// A microtask, not Draw.schedule: Draw drops callbacks that come late (hidden tab), and these must not be lost.
// What the machine changes on its own is not announced to screen readers (hush): only what you touch is.
const offClock = (fromClock, fn) => fromClock ? queueMicrotask(() => { hush = true; try { fn(); } finally { hush = false; } }) : fn();
function loadSlot(i, fromClock = false) {
  m.assign(bank.get(i), { selected: m.selected }); rebuildVoices();
  evoSnap = bank.get(i); evoCount = 0; lockStep = -1; offClock(fromClock, () => { loadNext = true; sync(); renderSlots(); renderLanesEvolve(); });
}
/** L2: 4 or 6 lanes, an edit of this pattern (undo brings dropped lanes back); a slot, a setup or a link keeps its own count. */
function setLaneCount(n) {
  const was = m.lanes.length; m.setLaneCount(n); if (m.lanes.length === was) return;
  rebuildVoices(); lockStep = -1; sync(); renderLanesEvolve();
}
function saveSlot(i) { bank.save(i, m.toJSON()); evoSnap = m.toJSON(); evoCount = 0; renderSlots(); paintLeds(); readout(); }
/** Stopped: load at once. Playing: queue for the next boundary (now / bar / cycle). */
function recallSlot(i) { if (!bank.recall(i)) return; if (!playing) { bank.take(i); loadSlot(i); } renderSlots(); readout(); paintLeds(); }
function chainSlots(list) { bank.setChain(list); if (!playing && bank.chain.length) { bank.take(bank.chain[0]); loadSlot(bank.chain[0]); } renderSlots(); readout(); paintLeds(); }
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
  // lands on (steps count from the pattern's bar 1); otherwise the step under the pad
  const q = recd ? lane.quantize(heardTick() - m.origin, rec.quant) : null, idx = lane.stepIndex(recd ? q.index : pages.padFirst(lane, playing) + col), ph = lane.padHit(idx, lock);
  hitSound(lane, T.immediate(), accent, ph.lock, accent ? 1 : v, kit, ph.slice); midiHit(li, lane, accent ? 1 : v ?? hitVel(false, null), performance.now(), lock);
  if (!recd) { m.select(li); sync(); return; }
  lane.recordHit(idx, { accent, vel: accent ? null : v, tune });   // ghost notes stay ghosts (a vel lock), a soft overdub drops an old accent
  const qTick = m.origin + q.step * lane.stepTicks(); if (qTick > clockRef.tick) skip.add(`${li}:${qTick}`);   // not scheduled yet: don't play it twice
  scene.flash(li, q.index, accent); m.select(li); sync();
}
function setRec(on) { rec.armed = on; $('btn-rec').classList.toggle('armed', on); $('btn-rec').textContent = on ? '● recording' : '● arm record'; saveSettings(); paintLeds(); readout(); }
function buildRecUI() {
  $('btn-rec').onclick = () => setRec(!rec.armed);
  sliders.accentVel = makeGauge({ label: 'accent above', min: 1, max: 127, value: rec.accentVel, say: (v) => `velocity ${v}`, title: INFO['accent above'], color: '#fb7185', onChange: (v) => { rec.accentVel = v; saveSettings(); } }); $('rec-gauges').appendChild(sliders.accentVel.el);
  ui.quant = mount('rec-quant', segmented({ options: [['nearest', 'nearest step', 'early hits land on the coming step'], ['previous', 'step just played']], value: rec.quant, onChange: (v) => { rec.quant = v; saveSettings(); } }));
  ui.pitchPads = mount('rec-pitch', toggleChip({ label: 'pitch pads', on: rec.pitchPads, title: INFO['pitch pads'], onChange: (v) => { rec.pitchPads = v; saveSettings(); } }));
}

// ---- evolve: every N bars, nudge some lanes; optionally come back home ----
let lastEvolve = '';
/** Clearing or randomizing is a fresh start: evolve stops (it would mutate the new pattern away from you). */
function clearLane() { if (evo.on) setEvolve(false); m.lane.clear(); sync(); }
/**
 * Every load (init, a groove, a link, a setup) goes through here: the pattern with its voices and sounds, one undo
 * step of its own, and its tempo when it brings one (undo puts the tempo you had back too). Once the beat is
 * replaced, the welcome-back bar has nothing left to offer.
 */
function loadMachine(json, { bpm = null, exact = false, selected = 0 } = {}) {
  if (evo.on) setEvolve(false); const was = tempo;
  m.assign(json, { selected }); if (bpm) applyTempo(bpm, true, { exact });
  rebuildVoices(); lockStep = -1; hideWelcome();
  loadNext = bpm ? { tempo, was } : true; sync(); renderLanesEvolve();
}
/** Init: every lane empty (as many lanes as now), length 4 at ×1, default voices and sounds; one kick on step 1 of lane 1. Undoable. */
function initPattern() {
  const n = new Machine(m.lanes.length); n.lanes.forEach(l => { l.clear(); l.setLength(4); l.setRatio(ratioIndexOf(1)); }); n.lanes[0].hits[0] = true;
  loadMachine(n.toJSON());
}
/** A starter groove (grooves.js): pattern + kit + swing and its tempo, one undo step; the toast names it with its
 *  one-liner (the chips' tooltips never show on touch). */
function loadGroove(key) {
  const g = grooveByKey(key); if (!g) return; loadMachine(g.m, { bpm: g.tempo }); toast(`${g.name} · ${g.tempo} bpm · ${g.desc}`, 5000);
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
 *  "pattern from seed"), so a seed always makes the same groove. */
function rollPattern(wild, seeded = dice.locked) {
  if (evo.on) setEvolve(false);
  const rng = seeded ? Dice.take(dice.seed).stream(0) : Math.random, name = wild ? (m.randomize(rng), 'wild') : m.randomizeMusical(rng).name;
  loadNext = true; hideWelcome(); sync(); toast(`${name}${seeded ? ` · dice ${dice.seed}` : ''}`);
}
// ---- undo / redo ----
/** Put back an undo / redo step. Live mutes and solos stay as they are (keepPerf), unless the step crosses a load;
 *  a load that set the tempo takes its tempo with it. */
function applyState(step) {
  if (!step) return; restoring = true; const live = m.lanes.map(l => ({ muted: l.muted, solo: l.solo }));
  m.assign(JSON.parse(step.json), { keep: true, selected: m.selected });   // keep: loops go on counting (R4)
  if (step.keepPerf) m.lanes.forEach((l, i) => { l.muted = !!live[i]?.muted; l.solo = !!live[i]?.solo; });
  if (step.tempo != null) applyTempo(step.tempo, true, { exact: true });
  rebuildVoices(); lockStep = -1; sync(); renderLanesEvolve(); restoring = false;
}
const undo = () => applyState(hist.undo({ tempo })), redo = () => applyState(hist.redo());
function setFill(on) { if (fill === on) return; fill = on; $('btn-fill').classList.toggle('armed', on); paintLeds(); readout(); }
function evolveNow(bar = 0, fromClock = false) {
  if (!evoSnap) evoSnap = m.toJSON();
  if (evo.home && evoCount >= evo.home) { m.assign(evoSnap, { keep: true, selected: m.selected }); rebuildVoices(); evoCount = 0; lastEvolve = 'back home'; }
  else { const ch = m.evolve({ scope: evo.scope, amount: evo.amount / 100 }, dice.stream(1000 + bar)); evoCount++; lastEvolve = ch.map(c => `${voiceLabel(m.lanes[c.lane])} ${c.kind}${c.dir > 0 ? '+' : '−'}`).join(', ') || 'held still'; }
  offClock(fromClock, sync);
}
function setEvolve(on) { evo.on = on; if (on) { evoSnap = m.toJSON(); evoCount = 0; lastEvolve = ''; } $('btn-evolve').classList.toggle('armed', on); $('btn-evolve').textContent = on ? '◉ evolving' : '◌ evolve'; saveSettings(); paintLeds(); readout(); }
function renderLanesEvolve() {
  const el = $('evo-lanes'); el.innerHTML = '';
  m.lanes.forEach((l, i) => el.appendChild(toggleChip({ label: `${i + 1} · ${voiceLabel(l)}`, on: l.evolve, color: LANE_HEX[i], title: 'lit = evolve may change this lane', onChange: (v) => { l.evolve = v; save(); } }).el));
}
function buildEvolveUI() {
  $('btn-evolve').onclick = () => setEvolve(!evo.on); $('evo-home-now').onclick = () => { evoSnap = m.toJSON(); evoCount = 0; lastEvolve = 'home set'; readout(); };
  const g = $('evo-gauges');
  sliders.evoEvery = makeGauge({ label: 'every · bars', min: 1, max: 32, value: evo.every, say: (v) => `${v} bar${v === 1 ? '' : 's'}`, title: INFO['evolve every'], color: 'var(--nebula-purple)', onChange: (v) => { evo.every = v; saveSettings(); readout(); } });
  sliders.evoAmount = makeGauge({ label: 'amount', min: 0, max: 100, value: evo.amount, fmt: v => v + '%', title: INFO['evolve amount'], color: 'var(--nebula-purple)', onChange: (v) => { evo.amount = v; saveSettings(); } });
  sliders.evoHome = makeGauge({ label: 'home after', min: 0, max: 16, value: evo.home, fmt: v => v ? v + '×' : 'never', say: v => v ? `${v} mutation${v === 1 ? '' : 's'}` : 'never', title: INFO['return home'], color: 'var(--nebula-purple)', onChange: (v) => { evo.home = v; saveSettings(); } });
  g.append(sliders.evoEvery.el, sliders.evoAmount.el, sliders.evoHome.el);
  ui.evoScope = mount('evo-scope', segmented({ options: [['rotate', 'rotation'], ['hits', '+ hits'], ['all', 'everything', 'rotation, fill, length and speed']], value: evo.scope, onChange: (v) => { evo.scope = v; saveSettings(); } }));
  renderLanesEvolve();
}

// ---- MIDI I/O ----
async function enableMidi() {
  try { if (!midi.access) await midi.init(); } catch (e) { $('midi-status').textContent = e.message; return; }
  midi.addEventListener('ports', () => { pmidi.refresh(); renderMidi(); }); pmidi.refresh(); renderMidi();
}
function renderMidi() {
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
  pmidi.handlers = { tempo: (bpm) => { followClockTempo(bpm); renderMidi(); }, start: () => { if (!playing) togglePlay(); }, stop: () => { if (playing) togglePlay(); },
    // phase lock: compare where our clock is with the incoming tick at the moment it arrived; trim the tempo or snap
    tick: (ext, t) => {
      if (!playing) return; const raw = T.getContext().rawContext, audioT = raw.currentTime + (t - performance.now()) / 1000;
      // compared in MIDI clock ticks (24 PPQ); a snap moves our clock by whole MIDI ticks, so blocks stay on that grid
      const { jump: j, trim } = phaseCorrection((clockRef.tick + (audioT - clockRef.time) / tickSec()) / MIDI_DIV - ext), jump = j * MIDI_DIV;
      // a snap renumbers the ticks still to come; the reference moves with them, or every clock tick that arrives
      // before the next scheduler batch would apply the same snap again (and the clock would swing further and further)
      if (jump) { const to = Math.max(0, tick + jump); clockRef = { ...clockRef, tick: clockRef.tick + to - tick }; tick = to; }
      T.getTransport().bpm.value = (pmidi.extBpm || tempo) * trim; stress.drift = jump ? 'snap' : `${((trim - 1) * 100).toFixed(1)}%`;
    } };
  renderMidi();
}
// ---- solo & choke ----
function toggleSolo(li = m.selected) { m.lanes[li].solo = !m.lanes[li].solo; sync(); }
function buildMixUI() {
  $('btn-solo').onclick = () => toggleSolo();
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
 *  the mix and the stems from one). */
async function renderPattern({ stems = false, dry = false, hits = null } = {}) {
  const { ticks, capped } = renderTicks(), sec = ticks * tickSec(), barSec = m.barTicks() * tickSec(), loop = ui.expLoop.value, rate = exp.rate;
  hits ??= exportHits(ticks);
  // a nudge or a push can put a hit well before tick 0: the render starts early enough to hold it (loops wrap it)
  const lead = renderLead(hits);
  for (const l of m.lanes) await ensureSample(l);
  const lat = stems ? 0 : await masterLatency(rate);
  const b = await offline(({ transport }) => {
    transport.bpm.value = tempo;
    const k = makeKit({ raw: stems });   // a fresh kit in the offline context, same voices and sounds
    if (stems) routeStems(k, dry);
    // a one-shot starts on the downbeat, so a hit humanized before it is clamped there instead of losing its attack
    for (const h of hits) hitSound(m.lanes[h.li], (loop ? h.time : Math.max(0, h.time)) + lead, h.accent, h.lock, h.vel, k, h.slice);
    return k;
  }, lead + sec + tailSec(), stems ? 2 * m.lanes.length + (dry ? 2 : 0) : 2, rate);   // stems: a stereo pair per lane (8 or 12 channels, + the return)
  const sr = b.sampleRate, pre = lead + lat, raw = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const chans = loop ? raw.map(d => foldLoop(d, sr, sec, pre)) : oneShot(raw, sr, sec, pre, barSec);
  return { chans, sr, bars: Math.round(chans[0].length / sr / barSec), patternBars: ticks / m.barTicks(), hits, capped, loop };
}
const nBars = (n) => `${n} bar${n === 1 ? '' : 's'}`;
const fmtNote = () => `${exp.bits === 32 ? '32-bit float' : `${exp.bits}-bit`} ${exp.rate / 1000} kHz`;
/** Tags of a render: tempo (ACID) always, the smpl loop when it is a loop (a one-shot is placed once, not looped). */
const renderTags = (r) => ({ acid: acidOf(tempo, r.bars), smpl: r.loop });
const mixWav = (r) => tagWav(encodeWav(r.chans, r.sr, { bits: exp.bits }), r.sr, renderTags(r));
/** File names carry tempo and length; a one-shot names the pattern and its ring-out ("4bars+2tail-oneshot"). */
const fileBase = (kind, r, bpm = tempo) => `orbits-${kind ? `${kind}-` : ''}${bpm}bpm-${r.loop ? nBars(r.bars).replace(' ', '') : `${nBars(r.patternBars).replace(' ', '')}+${r.bars - r.patternBars}tail-oneshot`}-${stamp()}`;
const renderNote = (r) => `${r.loop ? nBars(r.bars) : `${nBars(r.patternBars)} + ${nBars(r.bars - r.patternBars)} ring-out`} at ${tempo} bpm, ${r.loop ? 'loops seamlessly' : 'one-shot'}${r.capped ? ' · the cycle is longer than 64 bars: cut at 64, so the loop point falls mid-cycle' : ''}`;
// One take, one hit list: free dice still roll, but from a per-take seed, so WAV, stems and MIDI made while this roll
// is current hold the same hits (count and times). "new roll" draws another take; locked dice use their own seed.
const newRoll = () => 1 + Math.floor(Math.random() * 99999);
let expRoll = newRoll();
const exportDice = () => dice.locked ? dice : Dice.take(expRoll);
const rollNote = () => dice.locked ? `dice ${dice.seed}` : `roll ${expRoll}`;
// The address bar keeps no #p= link: on a reload the link would win over the beat you made since. Only when the
// clipboard is blocked does the link go there, as the one way left to copy it.
async function shareLink() {
  const code = await encodeShare(m.toJSON(), tempo), url = `${location.origin}${location.pathname}#p=${code}`;
  try { await navigator.clipboard.writeText(url); $('exp-status').textContent = `link copied (${url.length} chars)`; toast('link copied'); }
  catch { history.replaceState(null, '', `#p=${code}`); $('exp-status').textContent = 'link is in the address bar (clipboard blocked)'; }
}
async function exportWav() {
  await wake(); $('exp-status').textContent = 'rendering…';
  const r = await renderPattern();
  download(mixWav(r), `${fileBase('', r)}.wav`, 'audio/wav');
  $('exp-status').textContent = `WAV: ${r.hits.length} hits · ${rollNote()} · ${renderNote(r)} · ${fmtNote()}`;
}
/** A MIDI file of `hits` (the pattern's, or a chain's: `states`, its slots), a track per lane or one Drum-Rack track
 *  (exp.midiOne, E3). */
function midiOf(hits, { states = null, bars }) {
  // a chain is as long as its slots' bars in their own meters, with a time signature wherever a slot changes it
  const nl = Math.max(m.lanes.length, ...(states || []).map(s => s?.lanes?.length || 0));   // a track per lane: 4 or 6
  return hitsToMidi(hits, { tempo, lanes: pmidi.lanes.slice(0, nl), map: pmidi.lanes, names: laneNames(nl), gateSec: pmidi.gateMs / 1000, bars, loop: ui.expLoop.value, meter: m.meter, meters: states ? chainMeters(states, bank.chainBars) : null, sixteenths: states ? chainSixteenths(states, bank.chainBars) : null, merge: exp.midiOne });   // early notes wrap like the loop WAV
}
const midiNote = () => exp.midiOne ? 'one Drum-Rack track' : 'a track per lane';
function exportMidi() {
  const chain = ui.expWhat.value === 'chain' && bank.chain.length > 1, { ticks } = renderTicks();
  const states = chain ? bank.chain.map(i => bank.get(i)) : null, bars = chain ? bank.chainBars * bank.chain.length : ticks / m.barTicks();
  const hits = chain ? collectChain(states, { bars: bank.chainBars, tempo, dice: exportDice() }) : exportHits(ticks);
  download(midiOf(hits, { states, bars }), `${fileBase(chain ? 'chain' : '', { loop: true, bars })}.mid`, 'audio/midi'); $('exp-status').textContent = `MIDI: ${hits.length} notes · ${rollNote()} · ${bars} bars · ${midiNote()}${chain ? ` · chain of ${bank.chain.length}` : ''}`;
}
/**
 * E5 export all: ONE hit list (this roll) → the mix WAV, the stems (dry + return when "dry stems" is on) with their raw
 * mix, and the MIDI, in one zip, every file named after one base. The pattern only (a chain is MIDI-only: its audio
 * would need every slot's kit). Both renders get the same hits, so the files line up note for note.
 */
async function exportAll() {
  await wake(); $('exp-status').textContent = `rendering the mix and ${m.lanes.length} stems…`;
  const { ticks } = renderTicks(), hits = exportHits(ticks), mix = await renderPattern({ hits }), st = await renderPattern({ stems: true, dry: exp.dry, hits });
  const base = fileBase('all', mix), n = m.lanes.length, pairs = Array.from({ length: n }, (_, i) => [st.chans[2 * i], st.chans[2 * i + 1]]);
  const { files, gain } = stemFiles(pairs, laneNames(n), st.sr, base, { bits: exp.bits, ...renderTags(st), ret: exp.dry ? [st.chans[2 * n], st.chans[2 * n + 1]] : null });
  files.unshift({ name: `${base}/${base}-mix.wav`, data: mixWav(mix) });
  files.push({ name: `${base}/${base}.mid`, data: midiOf(hits, { bars: ticks / m.barTicks() }) });
  download(zipStored(files), `${base}.zip`, 'application/zip');
  $('exp-status').textContent = `all: mix + ${n} ${exp.dry ? 'dry stems + delay return' : 'stems'} + raw mix + MIDI (${midiNote()}) · ${hits.length} hits · ${rollNote()} · ${renderNote(mix)} · ${fmtNote()}${gain < 1 ? ` · stems scaled ${(20 * Math.log10(gain)).toFixed(1)} dB` : ''}${ui.expWhat.value === 'chain' ? ' · this pattern only: a chain exports as MIDI' : ''}`;
}
/**
 * E4 kit: each lane's sound as one-shot WAVs to load into Simpler or a Drum Rack, an accent and a normal hit (velocity
 * 1 and 0.7, as the pattern plays them), with the lane's current voice, knobs, drive, tone and pan, but no delay (a
 * rack has its own sends) and no master. 2 s at most, cut where it falls silent, the onset on sample 0. Tempo-free:
 * no ACID, no smpl. One offline render per hit, so no lane chokes or bleeds into another. Named like the stems.
 */
const KIT_PRE = 0.05, KIT_SEC = 2;
async function exportKit() {
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
    const o = await decodeShare(mm[1]); loadMachine(o.m, { bpm: o.tempo, exact: true });
    if (first) { hist.restart(); $('btn-play').classList.add('pulse'); }
    $('exp-status').textContent = 'loaded from the link (undo brings your pattern back)'; toast(first ? 'a beat from a link · press play' : 'loaded from a link · undo brings your beat back', 4000);
  } catch (e) { $('exp-status').textContent = `link: ${e.message}`; toast(`link: ${e.message}`); }
}
function buildExportUI() {
  ui.expLen = mount('exp-len', segmented({ options: [[1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16 bars'], ['cycle', 'cycle', 'whole bars that hold whole polyrhythm cycles (max 64 bars)']], value: 4 }));
  ui.expLoop = mount('exp-loop', toggleChip({ label: 'render as loop', on: true, title: 'on: the ring-out wraps onto the start, so the file is exactly N bars and loops seamlessly (Session clips). off: one-shot that starts on the downbeat and keeps its ring-out, rounded up to whole bars (place it once in a song). MIDI follows it: a note nudged or pushed before the downbeat wraps to the end (on) or starts on the downbeat (off).' }));
  ui.expBits = mount('exp-bits', segmented({ options: [[16, '16'], [24, '24'], [32, '32f', '32-bit float: nothing clips, levels as rendered']], value: exp.bits, onChange: (v) => { exp.bits = v; saveSettings(); } }));
  ui.expRate = mount('exp-rate', segmented({ options: [[44100, '44.1'], [48000, '48', '48 kHz (video, most interfaces)']], value: exp.rate, onChange: (v) => { exp.rate = v; saveSettings(); } }));
  ui.expRing = mount('exp-ring', toggleChip({ label: 'jam ring-out', on: exp.ring, title: 'jam takes add each lane\'s ring-out, the echoes and decays their last bar line cut, as "-ringout" files: place them right after the take. Made from the hits the take played, so they hold no new hits even when the pattern plays on.', onChange: (v) => { exp.ring = v; saveSettings(); } }));
  ui.expDry = mount('exp-dry', toggleChip({ label: 'dry stems', on: exp.dry, title: 'stems without their delay: every lane\'s echoes go to one more stem pair, "delay return", so you can treat them in the DAW. The stems plus the return still add up to the mix.', onChange: (v) => { exp.dry = v; saveSettings(); } }));
  ui.expMidiOne = mount('exp-midi-one', segmented({ options: [[false, 'per lane', 'a MIDI track per lane, each on its own channel'], [true, 'one track', 'one track for a Drum Rack: every lane on its note from the MIDI drawer, on lane 1\'s channel']], value: exp.midiOne, onChange: (v) => { exp.midiOne = v; saveSettings(); } }));
  ui.expWhat = mount('exp-what', segmented({ options: [['pattern', 'this pattern'], ['chain', 'the chain', 'each slot of the running chain for its bars']], value: 'pattern' }));
  $('exp-link').onclick = shareLink; $('exp-wav').onclick = () => exportWav().catch(e => { $('exp-status').textContent = `WAV: ${e.message}`; }); $('exp-mid').onclick = exportMidi; $('exp-kit').onclick = () => exportKit().catch(e => { $('exp-status').textContent = `kit: ${e.message}`; }); $('exp-all').onclick = () => exportAll().catch(e => { $('exp-status').textContent = `export all: ${e.message}`; }); $('exp-stems').onclick = () => exportStems().catch(e => { $('exp-status').textContent = `stems: ${e.message}`; });
  $('exp-roll').onclick = () => { expRoll = newRoll(); $('exp-status').textContent = dice.locked ? `dice are locked: exports use dice ${dice.seed} (re-roll in the dice drawer)` : `roll ${expRoll}: the next WAV, stems and MIDI share these hits`; };
  addEventListener('hashchange', () => loadShared());
}

// ---- undo / redo / fill buttons ----
function buildEditUI() {
  $('btn-undo').onclick = undo; $('btn-redo').onclick = redo;
  const f = $('btn-fill'); f.onpointerdown = () => setFill(true); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) f.addEventListener(ev, () => setFill(false));
}

// ---- jam: record what you play (edits, mutes, evolve, slots, knobs) as a track per lane (4 or 6), up to 256 beats ----
// The recorder taps each lane bus (pre-master), starts on a bar line and ends on one (stop rounds up to the next
// bar), so the four files are sample-aligned, the same length and whole bars long: a DAW lines them up at this tempo.
const jam = { state: 'idle', node: null, startTick: 0, stopTick: 0, lastTick: 0, lastTime: 0, beats: 0, chunks: null, lanes: 4, sr: 44100, bar: BAR_TICKS, meter: '4/4' };   // idle → armed → rec → finishing → done; bar / meter: the take's, from its first bar line
// E6 ring-out: log = the live hits while a take that wants one runs (hitSound), ring = its rendered tails (renderRing),
// ringJob = that render while it runs, take = which take a render belongs to (a discard or a new take drops a late one)
Object.assign(jam, { startTime: 0, endTime: 0, log: null, ring: null, ringJob: null, take: 0 });   // endTime: the end last posted to the recorder
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
        jam.ringJob = renderRing(jam.log, Math.round(jam.startTime * jam.sr) + data.frames, jam.endTime).then((r) => { if (jam.take === take) jam.ring = r && joinRing(jam.chunks, r, Math.round(0.002 * jam.sr)); }, (e) => console.error('jam ring-out:', e))
          .finally(() => { if (jam.take === take) { jam.ringJob = null; renderJam(); } });
      }
      jam.log = null; renderJam(); paintLeds();
    }
  };
}
async function toggleJam() {
  if (jam.state === 'rec' || jam.state === 'armed') return stopJam();
  if (jam.state === 'finishing') return;   // the take is closing on its bar line: a press now would mix two takes
  try { await wake(); await ensureJamNode(); } catch (e) { $('jam-text').textContent = `jam: ${e.message}`; return; }
  // lanes: the most the take played (L2)
  jam.chunks = Array.from({ length: MAX_LANES }, () => [[], []]); jam.take++; jam.ring = jam.ringJob = null; jam.log = exp.ring ? [] : null; jam.lanes = m.lanes.length; jam.beats = 0; jam.state = 'armed'; renderJam(); paintLeds();
  if (!playing) togglePlay();
}
function stopJam() {
  if (jam.state === 'armed') { jam.state = 'idle'; jam.log = null; jam.node?.port.postMessage({ cancel: true }); }
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
async function renderRing(log, endFrame, endTime) {
  const sr = jam.sr, tail = tailSec(), plan = ringPlan(log, { endFrame, endTime, sampleRate: sr, reach: (li, lane) => tail + sampleSec(lane) }); if (!plan) return null;
  // each lane as it played its last hit in the take (a lane that played none: a placeholder, it stays silent)
  const lanes = Array.from({ length: Math.max(jam.lanes, plan.lanes.length) }, (_, i) => plan.lanes[i] || m.lanes[i] || m.lanes[0]);
  for (const l of new Set(lanes)) await ensureSample(l);
  const b = await offline(() => { const k = makeKit({ raw: true, lanes }); routeStems(k); for (const h of plan.hits) hitSound(lanes[h.li], h.at, h.accent, h.lock, h.vel, k, h.slice); return k; }, (plan.lead + plan.frames) / sr + 0.01, 2 * lanes.length, sr);
  return ringOut(Array.from({ length: jam.lanes }, (_, i) => [b.getChannelData(2 * i), b.getChannelData(2 * i + 1)]), plan.lead, plan.frames);
}
function renderJam() {
  const st = jam.state, b = Math.floor(jam.beats), btn = $('btn-jam'), panel = $('jam-panel');
  btn.classList.toggle('on', st === 'rec' || st === 'armed'); btn.textContent = st === 'rec' ? `■ jam ${b}/${JAM_BEATS}` : st === 'armed' ? '● jam: next bar…' : st === 'finishing' ? '◌ jam: closing…' : '● jam';
  panel.hidden = st === 'idle'; $('jam-fill').style.width = `${Math.min(100, (jam.beats / JAM_BEATS) * 100)}%`;
  const secs = jam.chunks ? jam.chunks[0][0].reduce((a, c) => a + c.length, 0) / jam.sr : 0;
  $('jam-text').textContent = st === 'armed' ? 'starts on the next bar' : st === 'rec' ? `recording · beat ${b} of ${JAM_BEATS} · bar ${Math.floor(jam.beats * PPQ / jam.bar) + 1}` : st === 'finishing' ? `closing the take on the bar line${playing && jam.stopTick > clockRef.tick ? ` · ${Math.ceil((jam.stopTick - clockRef.tick) / PPQ)} beat(s) to go` : '…'}` : st === 'done' ? `take ready · ${nBars(Math.round(jam.beats * PPQ / jam.bar))}${jam.meter !== '4/4' ? ` of ${jam.meter}` : ''} at ${jam.tempo} bpm · ${secs.toFixed(1)} s · ${jam.lanes} lanes + raw mix${jam.ringJob ? ' · rendering the ring-out…' : jam.ring ? ' + ring-out files' : ''}${jam.tempoMoved ? ' · the tempo moved during the take, so it is not whole bars at one tempo' : ''}` : '';
  $('jam-dl').hidden = $('jam-discard').hidden = st !== 'done'; readout();
}
async function downloadJam() {
  // a ring-out still rendering goes in the same zip; one that hangs (a worklet that never answers) doesn't hold the take
  if (jam.state !== 'done') return; let timer;
  const late = await Promise.race([jam.ringJob?.then(() => false), new Promise(r => { timer = setTimeout(() => r(true), 15000); })]); clearTimeout(timer);
  if (jam.state !== 'done') return; const n = Math.round(jam.beats * PPQ / jam.bar), base = fileBase('jam', { loop: true, bars: n }, jam.tempo);
  download(stemsZip(jam.chunks.slice(0, jam.lanes), laneNames(jam.lanes), jam.sr, base, acidOf(jam.tempo, n, jam.meter), { smpl: true, ring: late ? null : jam.ring }), `${base}.zip`, 'application/zip');
  if (late) $('jam-text').textContent += ' · downloaded without the ring-out: it was still rendering';
}
function buildJamUI() {
  $('btn-jam').onclick = toggleJam; $('jam-dl').onclick = () => downloadJam().catch(e => { $('jam-text').textContent = `jam: ${e.message}`; });
  $('jam-discard').onclick = () => { jam.state = 'idle'; jam.chunks = jam.ring = jam.ringJob = jam.log = null; jam.take++; renderJam(); paintLeds(); };
  renderJam();
}

// ---- stems: the current pattern rendered once, each lane to its own pair of channels → equal-length WAVs ----
async function exportStems() {
  await wake(); $('exp-status').textContent = `rendering ${m.lanes.length} stems…`;
  const r = await renderPattern({ stems: true, dry: exp.dry }), n = m.lanes.length, base = fileBase('stems', r);
  const { files, gain } = stemFiles(Array.from({ length: n }, (_, i) => [r.chans[2 * i], r.chans[2 * i + 1]]), laneNames(n), r.sr, base, { bits: exp.bits, ...renderTags(r), ret: exp.dry ? [r.chans[2 * n], r.chans[2 * n + 1]] : null });
  download(zipStored(files), `${base}.zip`, 'application/zip');
  $('exp-status').textContent = `stems: ${n} lanes${exp.dry ? ' (dry) + delay return' : ''} + raw mix · ${r.hits.length} hits · ${rollNote()} · ${renderNote(r)} · ${fmtNote()}${gain < 1 ? ` · all scaled ${(20 * Math.log10(gain)).toFixed(1)} dB to avoid clipping` : ''}`;
}
// ---- welcome back, toasts ----
// When the welcome bar goes, everything under it moves up: clicks are swallowed for a moment, so the second click of
// a double-click (or a double tap) can't land on whatever moved under the pointer (clear lane, jam, play).
let clickGuard = 0, toastTimer = 0;
for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) addEventListener(ev, (e) => { if (performance.now() < clickGuard) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
/** Close the welcome bar (once the beat plays, loads or is dismissed); focus that was in it goes to play. */
function hideWelcome() {
  const w = $('welcome'); if (w.hidden) return; const had = w.contains(document.activeElement);
  w.hidden = true; clickGuard = performance.now() + 450; if (had) $('btn-play').focus({ preventScroll: true });
}
/** One short line at the bottom. A polite live region that stays in the page (only its text changes, so screen
 *  readers announce it); cleared once it has faded. */
function toast(txt, ms = 2400) {
  const t = $('toast'); t.textContent = txt; t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); toastTimer = setTimeout(() => { t.textContent = ''; }, 300); }, ms);
}
buildSliders(); buildSteps(); buildLockGauges(); buildSlotsUI(); buildRecUI(); buildEvolveUI(); buildMidiUI(); buildMixUI(); buildSampleUI(); buildDiceUI(); buildExportUI(); buildEngineUI(); buildEditUI(); buildJamUI(); sync();
// a shared link wins; a first visit gets the demo groove and a pulsing play button, and its history starts there (no
// hidden pattern behind it); a returning visit keeps the pattern it left and offers "start fresh" (init, undoable)
const boot = bootMode({ saved: !firstVisit, hash: location.hash });
if (boot === 'link') loadShared({ first: firstVisit });
else if (boot === 'first') { loadGroove(DEMO_GROOVE); hist.restart(); $('btn-play').classList.add('pulse'); }
else $('welcome').hidden = false;
spoken = null; clearTimeout(announceTimer);   // the page just opened: nothing to announce yet (readout() at the end starts it)
$('btn-init').onclick = initPattern;
$('wb-keep').onclick = () => { hideWelcome(); if (!playing) togglePlay(); };
$('wb-close').onclick = hideWelcome;
$('wb-fresh').onclick = () => { initPattern(); toast('fresh start · undo brings your beat back'); };
// starter grooves (grooves.js): one chip each, the description as tooltip and in the toast; loading one is undoable
for (const g of GROOVES) {
  const b = document.createElement('button'); b.type = 'button'; b.id = `groove-${g.key}`; b.textContent = g.name; b.title = `${g.desc} (${g.tempo} bpm, undoable)`;
  b.onclick = () => loadGroove(g.key); $('grooves').appendChild(b);
}
// ---- library: named setups in localStorage (patterns + voices + kit + sounds + tempo + volume + dice) ----
const setupData = () => ({ m: m.toJSON(), tempo, vol, dice: dice.toJSON() });
const flash = (id, txt) => { const b = $(id), was = b.dataset.label || b.textContent; b.dataset.label = was; b.textContent = txt; b.classList.add('flash'); setTimeout(() => { b.textContent = was; b.classList.remove('flash'); }, 1200); };
function loadSetup(id) {
  const e = lib.get(id); if (!e?.m) return;
  if (e.vol != null) { vol = e.vol; kit?.master.gain.rampTo(vol, 0.05); } if (e.dice) { dice.fromJSON(e.dice); saveSettings(); renderDice(); }
  libCurrent = id; loadMachine(e.m, { bpm: e.tempo, exact: true, selected: m.selected }); renderLib(); flash('btn-load', `“${e.name}” ✓`);
}
function saveSetup(name) {
  const e = lib.save(name, setupData()); if (!e) { $('lib-name').setCustomValidity('browser storage is full: delete a setup or a sample'); $('lib-name').reportValidity(); return; }
  libCurrent = e.id; $('lib-name').value = e.name; renderLib(); flash('btn-save', 'saved ✓'); readout();
}
function openLib(focus) { $('lib-drawer').open = true; $('lib-drawer').scrollIntoView({ block: 'nearest' }); if (focus) { const n = $('lib-name'); n.value = lib.get(libCurrent)?.name || lib.nextName(); n.focus(); n.select(); } }
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
function renderLib() {
  const el = $('lib-list'); el.innerHTML = ''; const items = lib.list();
  if (!items.length) { el.innerHTML = '<p class="hint tight">Nothing saved yet: type a name and press save.</p>'; return; }
  for (const e of items) {
    const row = document.createElement('div'); row.className = `lib-row${e.id === libCurrent ? ' cur' : ''}`;
    const name = document.createElement('button'); name.type = 'button'; name.className = 'lib-name'; name.textContent = e.name; name.title = 'load this setup (undoable)'; name.onclick = () => loadSetup(e.id);
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
    row.append(name, acts, meta); el.appendChild(row);
  }
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
let loopHeld = false, dupHeld = false, chainPick = [];
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
  const lane = m.lane, s0 = pages.stepFirst(lane, playing), cur = pages.current(lane, playing);
  if (loopHeld || dupHeld) {   // step buttons show the slots: white = playing, cyan = queued, magenta = picked for a chain
    for (let i = 0; i < STEP_BTNS; i++) move.setStepColor(i, chainPick.includes(i) ? MAGENTA_LED : bank.current === i ? COLOR.WHITE : bank.pending === i ? CYAN_LED : bank.filled(i) ? (dupHeld ? REC_LED : 34) : dupHeld ? 1 : 0);
  } else if (pages.back) {   // Back held: the step buttons are the pad pages (white = the one showing, cyan = pinned)
    for (let i = 0; i < STEP_BTNS; i++) move.setStepColor(i, i >= np ? 0 : i === cur ? (pages.follow ? COLOR.WHITE : CYAN_LED) : LANE_DIM[m.selected]);
  } else for (let b = 0; b < STEP_BTNS; b++) { const i = s0 + b; move.setStepColor(b, i >= lane.length ? 0 : (playing && lane.shown === i) ? COLOR.WHITE : lane.hitAt(i) ? (lane.shownLock(i) ? CYAN_LED : LANE_LED[m.selected]) : LANE_DIM[m.selected]); }
  move.setButtonColor('back', pages.follow ? (np > 1 ? 16 : 0) : CYAN_LED);   // lit = there are pages; cyan = one is pinned
  for (let t = 1; t <= 4; t++) { const li = trackLane(t, shift, m.lanes.length); move.setButtonColor(`track${t}`, li === m.selected ? COLOR.WHITE : LANE_DIM[li]); }   // Shift held: track 4 / 3 = lanes 5 / 6
  move.setButtonColor('play', playing ? COLOR.WHITE : CYAN_LED); move.setButtonColor('mute', lane.solo ? nearestPaletteIndex('#fde047') : lane.muted ? COLOR.WHITE : 0); move.setButtonColor('capture', evo.on ? MAGENTA_LED : LANE_LED[0]); move.setButtonColor('undo', hist.canUndo ? LANE_LED[3] : 0); move.setButtonColor('layout', fill ? COLOR.WHITE : 16); move.setButtonColor('delete', 16);
  move.setButtonColor('record', rec.armed ? REC_LED : nearestPaletteIndex('#fb7185')); move.setButtonColor('left', LANE_DIM[m.selected]); move.setButtonColor('right', LANE_DIM[m.selected]);
  move.setButtonColor('loop', loopHeld ? COLOR.WHITE : bank.chain.length > 1 ? CYAN_LED : 16); move.setButtonColor('duplicate', dupHeld ? REC_LED : 16); move.setButtonColor('sampling', jam.state === 'rec' ? REC_LED : jam.state === 'armed' ? CYAN_LED : jam.state === 'done' ? COLOR.WHITE : 16);
}
move.addEventListener('pad', (e) => {
  if (!e.detail.on) return; const { col, velocity } = e.detail, li = padBase() + e.detail.row;   // the row's lane in the window (selecting it keeps the window)
  if (rec.armed) return liveHit(li, col, velocity);
  const lane = m.lanes[li], i = pages.padFirst(lane, playing) + col; if (i >= lane.length) return; if (shift) lane.toggleAccent(lane.stepIndex(i)); else lane.toggle(lane.stepIndex(i)); if (!awake) wake(); if (awake && !playing) hitSound(lane, T.now(), false, lane.lockAt(i), null, kit, lane.sliceAt(lane.stepIndex(i), lane.lockAt(i))); m.select(li); sync();
});
move.addEventListener('step', (e) => {
  const { index: btn, on } = e.detail;
  // a release ends its own press, whatever happened since (the page turned, Back went down, the lane got shorter):
  // a tap toggles the step it went down on; a hold + knob locked something instead
  if (!on) { const h = pages.release(btn), lane = m.lane; if (h && !h.used && h.step < lane.length) { lane.toggle(lane.stepIndex(h.step)); sync(); } else paintLeds(); return; }
  if (loopHeld || dupHeld) { if (dupHeld) saveSlot(btn); else if (bank.filled(btn) && !chainPick.includes(btn)) chainPick.push(btn); paintLeds(); return; }
  if (pages.back) { pages.pin(btn, m.lanes); paintLeds(); return; }   // Back + step button = that pad page
  const lane = m.lane, first = pages.stepFirst(lane, playing), step = first + btn; if (step >= lane.length) return;   // the step's own number (17–32 on page 2)
  if (shift) { lane.toggleAccent(lane.stepIndex(step)); sync(); } else pages.press(btn, step, first);
});
move.addEventListener('encoder', (e) => {
  const { index, delta } = e.detail;
  if (held.size && index === 7) {   // hold step(s) + knob 8 = condition; + Shift = repeats (ratchet)
    const lane = m.lane;
    for (const h of held.values()) { const i = h.step; h.used = true; const si = lane.stepIndex(i), t = lane.trigs[si] || { cond: 'always', ratchet: 1 }; lane.setTrig(si, shift ? { ratchet: t.ratchet + Math.sign(delta) } : { cond: CONDS[(CONDS.indexOf(t.cond) + Math.sign(delta) + CONDS.length) % CONDS.length] }); lockStep = i; }
    auditionLock(); stepEdited(); return;
  }
  if (held.size && index === 6 && m.lane.voice === 'sample' && m.lane.sliceCount()) {   // S1: on a slice set, hold step(s) + knob 7 = which slice, every 4 clicks either way
    const lane = m.lane, top = lane.sliceCount() - 1; let moved = false;
    for (const h of held.values()) {
      const i = h.step, si = lane.stepIndex(i), k = Math.trunc((h.sl = (h.sl || 0) + delta) / 4); h.used = true; lockStep = i;
      if (k) { h.sl -= k * 4; lane.setLock(si, 'slice', Math.max(0, Math.min(top, lane.sliceAt(si, lane.locks[si]) + k))); moved = true; }
    }
    if (moved) auditionLock(); stepEdited(); return;
  }
  if (held.size && index < LOCK_KEYS.length) {   // hold step(s) + knob 1–7 = lock tune · prob · vel · decay · tone · snap · color on those steps
    const k = LOCK_KEYS[index], lane = m.lane, span = k === 'tune' ? 0.02 : 0.02;
    for (const h of held.values()) { const i = h.step; h.used = true; lane.setLock(lane.stepIndex(i), k, lockValue(lane, i, k) + delta * span); lockStep = i; }
    auditionLock(); stepEdited(); return;
  }
  if (shift) { const k = SOUND_KEYS[index]; m.lane.setSound(k, m.lane.sound[k] + delta * 0.02); applySound(m.selected); if (awake && !playing) hitSound(m.lane, T.now(), false); sync(); return; }
  const keys = ['length', 'euclid', 'rotation', 'ratio', 'swing', 'prob', 'tune']; if (index === 7) applyTempo(tempo + delta); else nudge(keys[index], delta * (index >= 4 ? 2 : 1));
});
move.addEventListener('wheel', (e) => {
  if (held.size) {   // G1: hold step(s) + jog wheel = nudge those steps early / late, 5 % of a step per click
    const lane = m.lane; for (const h of held.values()) { const i = h.step; h.used = true; lane.setLock(lane.stepIndex(i), 'nudge', Math.round((lockValue(lane, i, 'nudge') + e.detail.delta * 0.05) * 100) / 100); lockStep = i; }
    stepEdited(); return;
  }
  m.humanize = Math.max(0, Math.min(1, m.humanize + e.detail.delta * 0.03)); sliders.humanize?.set(Math.round(m.humanize * 100)); readout(); save(); });
// L3: hold step(s) + push the jog wheel = the next stroke (open → mute → slap → lane sound) on voices that have them
move.addEventListener('wheelPush', (e) => {
  if (!e.detail.pressed || !held.size || !ARTICS[m.lane.voice]) return; const lane = m.lane;
  for (const h of held.values()) { h.used = true; lane.cycleArtic(lane.stepIndex(h.step)); lockStep = h.step; }
  auditionLock(); stepEdited();
});
move.addEventListener('volume', (e) => { vol = Math.max(0, Math.min(1, vol + e.detail.delta * 0.02)); kit?.master.gain.rampTo(vol, 0.05); });
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : ''; paintLeds(); return; }   // the track buttons show lanes 5–6 while Shift is held
  if (name === 'loop') { loopHeld = pressed; if (!pressed) { if (chainPick.length === 1) recallSlot(chainPick[0]); else if (chainPick.length > 1) chainSlots(chainPick); chainPick = []; } paintLeds(); return; }
  if (name === 'duplicate') { dupHeld = pressed; paintLeds(); return; }
  if (name === 'back') { if (pressed) pages.backDown(); else pages.backUp(); paintLeds(); return; }   // L5 pages
  if ((name === 'left' || name === 'right') && pages.back) { if (pressed) { pages.pin(pages.current(m.lane, playing) + (name === 'right' ? 1 : -1), m.lanes); paintLeds(); } return; }
  if (name === 'layout') { setFill(pressed); return; }   // hold = fill
  if (name === 'sampling' && pressed) { toggleJam(); return; }
  if (!pressed) return;
  const tr = /^track(\d)$/.exec(name); if (tr) { m.select(trackLane(+tr[1], shift, m.lanes.length)); lockStep = -1; sync(); return; }   // track 1 is the top button = lane 4; Shift + track 4 / 3 = lane 5 / 6
  if (name === 'delete' && held.size) { for (const h of held.values()) { h.used = true; m.lane.clearLocks(m.lane.stepIndex(h.step)); m.lane.trigs[m.lane.stepIndex(h.step)] = null; } stepEdited(); return; }
  if (name === 'delete') { clearLane(); return; }   // Delete alone = clear the lane (undoable)
  if (name === 'play') togglePlay(); if (name === 'mute') { if (shift) toggleSolo(); else { m.lane.muted = !m.lane.muted; sync(); } } if (name === 'undo') { if (shift) redo(); else undo(); }
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
const KNOB_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']), keyFocused = new WeakSet();
let lastInput = 'pointer';
const takeKeysBack = () => { if (document.activeElement) keyFocused.delete(document.activeElement); };
addEventListener('pointerdown', () => { lastInput = 'pointer'; takeKeysBack(); }, true);
addEventListener('wheel', (e) => { if (e.target instanceof Element && e.target.closest('.gauge')) takeKeysBack(); }, { capture: true, passive: true });
addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) lastInput = 'key'; }, true);   // the keys that move focus
addEventListener('keydown', (e) => { const a = document.activeElement; if (e.key === 'Escape' && a instanceof HTMLElement && a !== document.body && !a.closest(TEXT_SEL)) a.blur(); });
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
  if ($('help').open) return;   // the help is modal: keys are its own (Esc closes it)
  // a held Space repeats: the repeats are the page's too, or the browser presses the button the mouse left focused on
  // release (holding Space to play also toggled the step just clicked)
  if (e.repeat) { if (e.key === ' ' && !controlOwnsKey(e)) e.preventDefault(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { if (e.target instanceof Element && e.target.closest(TEXT_SEL)) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  // ? = help from anywhere but a text field: a button or a drawer header the keyboard reached has no use for it
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !(e.target instanceof Element && e.target.closest(TEXT_SEL))) { e.preventDefault(); openHelp(); return; }
  if (controlOwnsKey(e)) return;
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
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
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
    setPill(`Move: ready${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''}`, 'pill-on'); pmidi.refresh(); renderMidi();
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); } finally { paintConnect(); }
}
function disconnectMove() { move.disconnect(); moveOn = false; setPill('Move: disconnected (back to standalone)', 'pill-off'); paintConnect(); }
$('btn-connect').onclick = () => { if (!connecting) (moveOn ? disconnectMove() : connectMove()); };
if (midi.supported) { $('move-status').hidden = false; paintConnect(); }
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---- visuals: concentric orbits, one ring per lane, each turning at its own speed (see scene.js) ----
const scene = createScene($('cv'), { machine: () => m, align: () => ({ tick: Math.max(0, heardTick() - m.origin), cycle: m.cycleTicks(cycleOpts()), bar: bars.len, beat: PPQ }), isRecording: () => rec.armed, jamProgress: () => (jam.state === 'rec' || jam.state === 'armed' ? jam.beats / JAM_BEATS : null), laneHex: LANE_HEX, isPlaying: () => playing, isBusy: () => playing || performance.now() < busyUntil, stepMs: (lane) => m.stepSeconds(lane, tempo) * 1000 });
addEventListener('resize', poke); document.fonts?.ready.then(poke);
$('cv').addEventListener('click', (e) => { const ring = scene.pick(e.clientX, e.clientY); if (ring >= 0) { m.select(ring); sync(); } });
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
// the sound row repeat the knobs, so they sit in the collapsed "nerd stats" drawer with the rest of the details
function readout() {
  poke();
  const slot = `slot ${bank.current >= 0 ? bank.current + 1 : '–'}${bank.pending >= 0 ? ` → ${bank.pending + 1}` : ''}`;
  $('readout').textContent = [`${tempo} bpm`, ...(m.meter !== '4/4' ? [m.meter] : []), playing ? 'playing' : 'stopped', slot, rec.armed ? 'rec ●' : 'rec ○', `evolve ${evo.on ? 'on' : 'off'}`, `kit ${KITS[m.kitKey()]?.name || 'custom'}`,
    ...(fill ? ['FILL'] : []), ...(jam.state === 'rec' ? [`jam ${Math.floor(jam.beats)}/${JAM_BEATS}`] : [])].join(' · ');
  if ($('nerd').open) {   // written only while someone reads it (opening the drawer fills it)
    const sd = m.lane.sound, lines = [`engine ${engine}   meter ${m.meter}   cycle ${(m.cycleTicks(cycleOpts()) / PPQ).toFixed(1)} beats   humanize ${(m.humanize * 100).toFixed(0)}%`,
      ...m.lanes.map((l, i) => `${i === m.selected ? '▸' : ' '} ${voiceLabel(l).padEnd(7)} len ${String(l.length).padStart(2)}  ×${RATIO_LABEL[l.ratioIndex].padEnd(3)} E${l.euclidK} rot ${l.rotation} swing ${Math.round(l.swing * 100)}%${l.swingTpl !== 'mpc' ? ` ${SWING_TEMPLATES[l.swingTpl].name}` : ''}${l.offsetMs ? ` ${l.offsetMs > 0 ? '+' : ''}${l.offsetMs}ms` : ''} prob ${Math.round(l.prob * 100)}%${l.muted ? '  muted' : ''}${l.solo ? '  solo' : ''}${l.choke >= 0 ? `  chokes ${l.choke + 1}` : ''}`),
      `  sound  ${SOUND_KEYS.map(k => `${k} ${Math.round(sd[k] * 100)}`).join('  ')}`,
      `${bank.pending >= 0 ? `slot ${bank.pending + 1} queued   ` : ''}${bank.chain.length > 1 ? `chain ${bank.chain.map(i => i + 1).join('·')}   ` : ''}${libCurrent && lib.get(libCurrent) ? `setup “${lib.get(libCurrent).name}”   ` : ''}${dice.locked ? `dice ${dice.seed}${dice.repeat > 1 ? `/${dice.repeat}` : ''}   ` : ''}evolve ${evo.on ? `every ${evo.every} bar${evo.every > 1 ? 's' : ''} ${evo.amount}%${lastEvolve ? ` (${lastEvolve})` : ''}` : 'off'}${pmidi.out ? `   midi → ${pmidi.out.name}${pmidi.clockOut ? ' +clock' : ''}` : ''}${pmidi.follow !== 'off' && pmidi.extBpm ? `   ext ${pmidi.extBpm} bpm` : ''}`];
    $('nerd-stats').textContent = lines.join('\n');
  }
  renderLegend(); announceChanges();
}
$('nerd').addEventListener('toggle', () => { if ($('nerd').open) readout(); });
// C5: the lane names live in a fixed legend (colour dot, voice, length × speed), not on the rings
function renderLegend() {
  const ul = $('legend'); if (!ul.children.length) LANE_HEX.forEach((hex) => { const li = document.createElement('li'); li.style.setProperty('--lane', hex); ul.appendChild(li); });
  [...ul.children].forEach((li, i) => { li.hidden = i >= m.lanes.length; });   // L2: 4 or 6
  m.lanes.forEach((l, i) => { const li = ul.children[i], t = `${voiceLabel(l)} ${l.length} ×${RATIO_LABEL[l.ratioIndex]}${l.muted ? ' · muted' : ''}`; if (li.textContent !== t) li.textContent = t; li.classList.toggle('sel', i === m.selected); li.classList.toggle('muted', !!l.muted); });
}
// The readout is not a live region (5 knob clicks = 5 re-reads of every line). A small polite region says only what
// you changed, after the knob settles: "length 5", "tempo 124 bpm", the lane you switched to, the kit you picked.
// What the machine does on its own (evolve, slots switching on the clock) is not announced (hush).
function speakable() {
  const l = m.lane, o = { sel: m.selected, lane: `lane ${m.selected + 1} ${voiceLabel(l)}`, tempo: `tempo ${tempo} bpm`, transport: playing ? 'playing' : 'stopped', humanize: `humanize ${Math.round(m.humanize * 100)}%`,
    mute: l.muted ? 'muted' : 'unmuted', solo: l.solo ? 'solo on' : 'solo off', record: rec.armed ? 'record armed' : 'record off', fill: fill ? 'fill on' : 'fill off', evolve: evo.on ? 'evolve on' : 'evolve off' };
  for (const p of PARAMS) o[p.k] = `${p.label} ${p.fmt(p.get(l))}`; for (const k of SOUND_KEYS) o['snd:' + k] = `${k} ${Math.round(l.sound[k] * 100)}`;
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
// ---- layout: both columns start under the header (whose height changes: the strip and the status line wrap); the
// left one ends above the bottom-left panel. The rings get the free stage between the columns, so no panel ever
// covers them (wide windows only: narrower ones stack everything under a square canvas, see styles.css) ----
const STAGE_GAP = 16, NARROW = matchMedia('(max-width: 1100px)');   // the CSS's own test, so both agree at a zoomed 1100.5 px
function layoutHud() {
  const top = Math.round($('topbar').getBoundingClientRect().bottom + 10), hl = $('hud-left'), lg = $('legend');
  document.documentElement.style.setProperty('--hud-top', `${top}px`);   // where both columns start (CSS)
  if (NARROW.matches || focusMode) { hl.style.bottom = lg.style.left = lg.style.top = lg.style.width = ''; scene.setStage(null); poke(); return; }
  const keysOpen = $('keys-pop').open, stress = $('hud-bl').querySelector('.stress-meter');
  // while the Move-controls popup is open it floats over the column; size the column against the closed panel
  const blTop = keysOpen ? innerHeight - 18 - (stress?.offsetHeight || 0) - 8 - $('keys-pop').querySelector('summary').offsetHeight - 2 : $('hud-bl').getBoundingClientRect().top;
  hl.style.bottom = `${Math.round(Math.max(16, innerHeight - blTop + 12))}px`;
  const cols = { left: Math.max(hl.getBoundingClientRect().right, $('hud-bl').getBoundingClientRect().right), right: document.querySelector('.hud').getBoundingClientRect().left, top, bottom: innerHeight, gap: STAGE_GAP };
  // the legend heads the stage; the rings get what is left under it
  const head = stageBox(cols); lg.style.left = `${head.x}px`; lg.style.top = `${head.y}px`; lg.style.width = `${head.w}px`;
  scene.setStage(stageBox({ ...cols, legend: lg.offsetHeight + 8 })); poke();
}
// the legend too: a longer voice name or a muted lane can wrap it onto more lines, and the rings must move down
for (const id of ['topbar', 'hud-bl', 'legend']) new ResizeObserver(layoutHud).observe($(id)); addEventListener('resize', layoutHud);
$('keys-pop').addEventListener('toggle', layoutHud);
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; $('keys-pop').open = false; if (focusMode && !$('help').open) setFocusMode(false, true); });
// ---- C5 focus mode: every panel hidden, the orbits fill the window (key F, the settings button; Esc or F to come back) ----
// Coming back puts the focus and the page where they were. F gives the keys back to whoever owned them: a control the
// keyboard had reached gets them, anything else (a click's leftover, the page) leaves them to the page, so F, F, Space
// plays. Esc gives them to the page, as it does everywhere. The scroll comes back too: the page's (on a phone it shrinks
// to the window while the panels are hidden) and each column's (a hidden column forgets it).
let focusMode = false, beforeFocus = null;
const columns = () => [$('hud-left'), document.querySelector('.hud')];
function setFocusMode(on, esc = false) {
  if (on === focusMode) return;
  if (on) {   // before the panels go: hidden, the page is one window tall and scrollY already 0
    const a = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    beforeFocus = { el: a, owned: !!a && keyFocused.has(a), y: scrollY, cols: columns().map(c => c.scrollTop) };
    if (a?.closest('header, .hud, #hud-left, #hud-bl')) a.blur();   // focus must not stay in a hidden panel
  }
  focusMode = on; document.body.classList.toggle('focus-mode', on); $('focus-exit').hidden = !on;
  layoutHud(); poke();
  if (!on && beforeFocus) {
    const { el, owned, y, cols } = beforeFocus; beforeFocus = null; scrollTo({ top: y, behavior: 'instant' });
    columns().forEach((c, i) => c.scrollTo({ top: cols[i], behavior: 'instant' }));
    // a click on "exit focus" took the keys back (lastInput), so then the page keeps them
    if (el?.isConnected) focusAs(el, owned && lastInput === 'key' && !esc);
  }
}
$('btn-focus').onclick = () => setFocusMode(true); $('focus-exit').onclick = () => setFocusMode(false);
// ---- C3 help: the keys and the mouse tricks, in one overlay (button "?" or the ? key) ----
function openHelp() { const d = $('help'); if (!d.open) d.showModal(); }
$('btn-help').onclick = openHelp;
addEventListener('pointerdown', (e) => { const p = $('keys-pop'); if (p.open && !p.contains(e.target)) p.open = false; });
window.__poly = { move, get m() { return m; }, sync, setLaneCount, get bars() { return bars; }, setEngine, makeKit, wake, dspFlush, get engine() { return engine; }, get kit() { return kit; }, hitSound, ensureDsp, applyTempo, bank, rec, evo, pmidi, liveHit, setRec, setEvolve, recallSlot, saveSlot, chainSlots, editLocks, clock: () => ({ tick, clockRef }), undo, redo, hist, dice, toggleSolo, setFill, assignSample, assignSlices, breakFromFile, exportWav, exportMidi, exportAll, exportKit, shareLink, exp, renderSlices, sampleBufs, stress, jam, toggleJam, stopJam, downloadJam, exportStems, lib, loadSetup, saveSetup, initPattern, loadGroove, clearLane, randomizeAll, setEvolve, scene, setFocusMode, get focusMode() { return focusMode; }, openHelp };
readout(); layoutHud(); scene.start();

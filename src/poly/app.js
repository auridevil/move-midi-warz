import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex } from 'movewire';
import { Machine, RATIOS, RATIO_LABEL, MAX_STEPS, SOUND_KEYS, DEFAULT_SOUND, PPQ, BAR_TICKS, LOCK_KEYS, CONDS, MAX_RATCHET } from './lanes.js';
import { Dice } from './dice.js';
import { History } from './history.js';
import { hitVel, expandHits, collectHits, collectChain, hitsToMidi, encodeShare, decodeShare } from './export.js';
import { putSample, getSample, fromAudioBuffer, toAudioBuffer, trimRecord, SLICES_KEY, SLICES_PING } from '../samples.js';
import { encodeWav } from '../unasm/wav.js';
import { JAM_BEATS, stemsZip, floatStemsToInt16 } from './jam.js';
import { Library } from './library.js';
import { phaseCorrection } from './midiio.js';
import { SlotBank, SLOT_COUNT, SWITCH_MODES } from './slots.js';
import { PolyMidi, FOLLOW_MODES } from './midiio.js';
import { VOICES, VOICE_KEYS } from './voices.js';
import { KITS, KIT_KEYS } from './kits.js';
import { getTempo, setTempo, onTempo, makeTapTempo } from '../tempo.js';
import { makeGauge } from '../gauge.js';
import { segmented, toggleChip, mount } from '../ui.js';
import { createScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const T = window.Tone;
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));
const SAVE = 'midi-warz.poly.v2'; // v2: step = quarter note at ratio 1
const LANE_HEX = ['#f0abfc', '#67e8f9', '#fde047', '#a78bfa'];
let m; try { m = Machine.from(JSON.parse(localStorage.getItem(SAVE) || 'null')); } catch { m = new Machine(); }
if (!m.lanes.some(l => l.hits.some(Boolean))) { m.lanes[0].setEuclid(2); m.lanes[1].setEuclid(2); m.lanes[1].rotation = 1; m.lanes[2].setEuclid(8); m.lanes[3].setEuclid(2); } // kick 1·3, snare 2·4, hats in 8ths, perc 5 over 8ths
let tempo = getTempo(112), awake = false, playing = false, shift = false, vol = 0.8;
// every edit lands in save(): that's where undo history is recorded (knob turns within 0.7 s fold into one step)
const hist = new History(); let restoring = false;
const save = () => { const j = JSON.stringify(m); if (!restoring) hist.commit(j); try { localStorage.setItem(SAVE, j); } catch {} };
const dice = new Dice(); let fill = false;
const lib = new Library(localStorage); let libCurrent = null;   // named setups; id of the one last loaded / saved
// page settings (not part of a pattern): live record, evolve, MIDI I/O
const SETTINGS = 'midi-warz.poly.settings.v1';
const rec = { armed: false, accentVel: 100, pitchPads: false, quant: 'nearest' };
const evo = { on: false, every: 4, amount: 40, scope: 'hits', home: 0 };   // home: return to the snapshot after N mutations (0 = never)
let evoSnap = null, evoCount = 0;
const bank = new SlotBank(localStorage);
const pmidi = new PolyMidi({ getAccess: () => midi.access, isMovePort: (p) => move.inControl && /move/i.test(p.name) });
try { const o = JSON.parse(localStorage.getItem(SETTINGS) || 'null'); if (o) { Object.assign(rec, o.rec, { armed: false }); Object.assign(evo, o.evo, { on: false }); pmidi.fromJSON(o.midi); dice.fromJSON(o.dice); } } catch {}
const saveSettings = () => { try { localStorage.setItem(SETTINGS, JSON.stringify({ rec, evo, midi: pmidi, dice })); } catch {} };

// ---- sounds ----
let kit = null, loop = null;
// every lane owns a chain: voice → choke → drive → tone filter → pan → level ┐
//                                                          └→ send → its own delay ┴→ lane bus → master
// One delay per lane (instead of a shared one) sounds the same — a delay is linear — but keeps each lane's echoes on
// its own bus, so stems and jam recordings carry them. raw = no master compressor/limiter (stems for a DAW).
function makeKit({ raw = false } = {}) {
  let master;
  if (raw) master = new T.Gain(1).toDestination();
  else { const limiter = new T.Limiter(-2).toDestination(); const comp = new T.Compressor({ threshold: -18, ratio: 3 }).connect(limiter); master = new T.Gain(vol).connect(comp); }
  const chains = m.lanes.map(() => {
    const bus = new T.Gain(1).connect(master);
    const delay = new T.FeedbackDelay({ delayTime: 60 / tempo * 0.75, feedback: 0.3, wet: 1 }).connect(bus);   // dotted eighth
    const level = new T.Gain(0.8).connect(bus); const send = new T.Gain(0.15).connect(delay); const pan = new T.Panner(0); pan.connect(level); pan.connect(send);
    const tone = new T.Filter({ type: 'lowpass', frequency: 8000, Q: 0.7 }).connect(pan); const drive = new T.Distortion({ distortion: 0, wet: 0 }).connect(tone);
    const choke = new T.Gain(1).connect(drive);   // another lane's hit can cut this one off (choke groups)
    return { v: null, voice: null, choke, drive, tone, pan, level, send, delay, bus };
  });
  const kit = { master, chains }; m.lanes.forEach((_, i) => { buildVoice(i, kit); applySound(i, kit); }); return kit;
}
/** (Re)build a lane's voice nodes from the library, disposing the previous ones. */
function buildVoice(li, k = kit) {
  if (!k) return; const lane = m.lanes[li], c = k.chains[li];
  const key = lane.voice === 'sample' && lane.sample ? 'sample' : VOICES[lane.voice] ? lane.voice : 'kick';
  if (c.voice === key && c.v) return;
  if (c.v) for (const n of Object.values(c.v)) { try { n.dispose(); } catch {} }
  c.v = key === 'sample' ? {} : VOICES[key].make(T, c.choke); c.voice = key;   // samples make their nodes per hit
  if (key === 'sample') ensureSample(lane);
}
// ---- samples on lanes: buffers by id (IndexedDB holds the audio; the lane only keeps { id, name }) ----
const sampleBufs = new Map();
async function ensureSample(lane) { const id = lane.sample?.id; if (!id || sampleBufs.has(id)) return; const r = await getSample(id); if (r) sampleBufs.set(id, toAudioBuffer(r, T.getContext().rawContext)); }
/** One-shot playback: tune = rate (±1 oct), decay = how much of the sample plays, snap < ½ softens the attack and
 *  > ½ skips into the sample, color = a pitch swoop into the note (up above ½, down below). */
function playSample(c, lane, p, time) {
  const buf = sampleBufs.get(lane.sample?.id); if (!buf) return;
  const len = buf.duration, offset = p.snap > 0.5 ? (p.snap - 0.5) * 0.6 * len : 0, attack = p.snap < 0.5 ? 0.001 + (0.5 - p.snap) * 0.06 : 0.001;
  const play = Math.min(len - offset, 0.03 + Math.pow(p.decayRaw, 1.5) * (len - offset)), rate = Math.pow(2, p.tune);
  const src = new T.ToneBufferSource(buf), env = new T.Gain(0).connect(c.choke); src.connect(env);
  env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(p.vel, time + attack); env.gain.setValueAtTime(p.vel, time + Math.max(attack, play * 0.75)); env.gain.linearRampToValueAtTime(0, time + play);
  src.playbackRate.setValueAtTime(rate * Math.pow(2, (p.color - 0.5) * 2), time); src.playbackRate.exponentialRampToValueAtTime(rate, time + 0.06);
  src.onended = () => { try { src.dispose(); env.dispose(); } catch {} }; src.start(time, offset); src.stop(time + play + 0.02);
}
/** Push a lane's sound params into its chain (called on every Shift+knob / slider change). */
function applySound(li, k = kit) {
  if (!k) return; const s = m.lanes[li].sound, c = k.chains[li];
  c.drive.distortion = s.drive * 0.9; c.drive.wet.value = s.drive > 0.02 ? 0.3 + s.drive * 0.7 : 0;
  c.tone.frequency.value = 200 * Math.pow(60, s.tone);              // 200 Hz .. 12 kHz
  c.pan.pan.value = s.pan * 2 - 1; c.level.gain.value = s.level * s.level * 1.2; c.send.gain.value = s.send * 0.8;
}
function hitSound(lane, time, accent, lock = null, vel = null, k = kit) {
  const li = m.lanes.indexOf(lane), c = k?.chains[li]; if (!c?.v) return; const s = lane.sound, L = lock || {}, dec = L.decay ?? s.decay;
  const p = { vel: vel ?? hitVel(accent, lock), tune: L.tune ?? lane.tune, dec: 0.04 + dec * dec * 1.2, decayRaw: dec, snap: L.snap ?? s.snap, color: L.color ?? s.color };
  // choke groups: this hit opens its own lane and cuts the lane it chokes (open hat ← closed hat)
  try { c.choke.gain.setValueAtTime(1, time); const o = k.chains[lane.choke]; if (o && lane.choke !== li) o.choke.gain.setTargetAtTime(0, time, 0.008); } catch {}
  // a tone lock opens / closes the lane filter for this hit only; the next unlocked hit puts it back
  if (L.tone != null || c.toneLocked) { try { c.tone.frequency.setValueAtTime(200 * Math.pow(60, L.tone ?? s.tone), time); } catch {} c.toneLocked = L.tone != null; }
  try { if (c.voice === 'sample') playSample(c, lane, p, time); else VOICES[c.voice].hit(T, c.v, p, time); } catch {}
}
const ui = {};   // segmented controls / chips by name (src/ui.js)
const voiceLabel = (lane) => lane.voice === 'sample' ? `♪ ${(lane.sample?.name || 'sample').replace(/\.[^.]+$/, '').slice(0, 12)}` : VOICES[lane.voice]?.label || lane.voice;
function setVoice(li, key) { m.lanes[li].setVoice(key); buildVoice(li); if (awake && !playing) hitSound(m.lanes[li], T.now(), false); sync(); }
function cycleVoice(li, dir) { const keys = m.lanes[li].sample ? [...VOICE_KEYS, 'sample'] : VOICE_KEYS, i = keys.indexOf(m.lanes[li].voice); setVoice(li, keys[((i + dir) % keys.length + keys.length) % keys.length]); }
function applyKit(key) { m.applyKit(KITS[key], DEFAULT_SOUND); m.lanes.forEach((_, i) => { buildVoice(i); applySound(i); }); $('kit-select').value = key; sync(); }
function cycleKit(dir) { const cur = KIT_KEYS.find(k => KITS[k].name === m.kit) ?? KIT_KEYS[0]; const i = KIT_KEYS.indexOf(cur); applyKit(KIT_KEYS[((i + dir) % KIT_KEYS.length + KIT_KEYS.length) % KIT_KEYS.length]); }
// stopped + idle: nothing moves, so the canvas skips frames once the fading trails have settled (~1.5 s)
let busyUntil = 0; function poke() { busyUntil = performance.now() + 1500; }
async function wake() { if (awake) return; await T.start(); kit = makeKit(); awake = true; T.getTransport().bpm.value = tempo; buildLoops(); }

// ---- the master clock: one loop at 24 ticks per beat drives every lane, MIDI clock, slots and evolve ----
// Each lane's position is derived from the tick (Lane.at), so lanes can't drift apart, whatever you change mid-play.
const stress = { level: 0, headMs: 100 };
let tick = 0, resetPending = false, clockRef = { tick: 0, time: 0 }; const skip = new Set();   // skip: 'lane:step' already played live
const tickSec = () => 60 / tempo / PPQ;
const perfAt = (time) => performance.now() + (time - T.getContext().rawContext.currentTime) * 1000;   // audio time → Web MIDI timestamp
function buildLoops() { loop?.dispose(); loop = new T.Loop((time) => onTick(time), `${T.getTransport().PPQ / PPQ}i`); loop.start(0); }
function onTick(time) {
  if (resetPending) { tick = 0; resetPending = false; }
  const t = tick++; clockRef = { tick: t, time }; const at = perfAt(time);
  stress.headMs = stress.headMs * 0.9 + (time - T.getContext().rawContext.currentTime) * 1000 * 0.1;   // audio headroom: how far ahead of the speakers we schedule
  pmidi.clock(at); jamTick(t, time);
  const si = bank.due(t, m.cycleTicks()); if (si >= 0) loadSlot(si);
  if (evo.on && t > 0 && t % (BAR_TICKS * evo.every) === 0) evolveNow(t / BAR_TICKS);
  const now = T.getContext().rawContext.currentTime;
  m.tick(t, Math.random, { fill, dice: dice.locked ? dice : null }).forEach((ev, li) => {
    if (!ev) return; const lane = m.lanes[li];
    if (skip.delete(`${li}:${ev.step}`)) ev.hit = false;   // played live a moment ago: don't double it
    for (const h of expandHits(ev, lane, li, { humanize: m.humanize, dice: dice.locked ? dice : null, tickSec: tickSec() })) {   // swing, ±humanize, ratchets
      const ht = Math.max(now, time + h.dt); hitSound(lane, ht, h.accent, h.lock, h.vel); pmidi.note(li, h.vel, at + (ht - time) * 1000);
    }
    T.getDraw().schedule(() => { scene.onStep({ lane: li, index: ev.index, hit: ev.hit, accent: ev.accent }); lane.shown = ev.index; paintLeds(); }, time);
  });
}
function retime() { if (!awake) return; T.getTransport().bpm.rampTo(tempo, 0.1); const d = 60 / tempo * 0.75; for (const c of kit.chains) c.delay.delayTime.value = d; }   // dotted eighth
async function togglePlay() {
  await wake(); playing = !playing;
  if (playing) { tick = 0; resetPending = false; skip.clear(); m.resetAll(); scene.reset(); T.getTransport().start('+0.05'); pmidi.start(performance.now() + 50); } else { if (jam.state === 'rec' || jam.state === 'armed') stopJam(); T.getTransport().stop(); pmidi.stop(); }
  $('btn-play').textContent = playing ? '■ stop' : '▶ play'; paintLeds(); readout();
}
$('btn-play').onclick = togglePlay;
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (!awake) wake(); }, { once: true });

// ---- tempo ----
function applyTempo(bpm, publish = true) {
  tempo = Math.min(240, Math.max(40, Math.round(bpm))); if (publish) setTempo(tempo, 'poly'); retime();
  sliders.tempo?.set(tempo); readout();
}
onTempo((bpm, src) => { if (src !== 'poly') applyTempo(bpm, false); });
const tap = makeTapTempo(); const tapTempo = () => { const b = tap(); if (b) applyTempo(b); }; $('btn-tap').onclick = tapTempo;

// ---- lane params (UI + Move) ----
const INFO = {
  length: 'How many steps the lane loops over (1–16). Different lengths at the same speed = polymeter: 3 against 4 lines up every 12 steps.',
  euclid: 'Spreads this many hits as evenly as possible over the length (E(3,8) is the tresillo). Changing it rewrites the pattern; toggles after that are yours.',
  rotation: 'Shifts the whole pattern by N steps without changing it. Rotate the snare so its hits fall on 2 and 4.',
  ratio: 'Speed against the master tempo. ×1 = one step per beat (4 steps = a bar), ×2 eighths, ×4 sixteenths, ½ half notes; 3/2 or ⅔ against ×1 is a true polyrhythm.',
  swing: 'Delays every odd step by this fraction of a step. 0 = straight, ~25% = groove, 50%+ = triplet-ish.',
  prob: 'Chance that a programmed hit actually plays. 100% = always; 60% = the pattern breathes differently every loop.',
  tune: 'Pitch of the voice, about ±1 octave (less for some voices).',
  decay: 'Length of the sound, from a tick (40 ms) to a long tail (1.2 s). Kits scale it per voice.',
  tone: 'Low-pass filter after the voice: left = dark and muffled, right = open and bright.',
  drive: 'Distortion before the filter. A little adds body, a lot shreds.',
  snap: 'The transient: click on the kick, body on the snare, bursts on the clap, stutters on glitch, sweep height on zap.',
  color: 'The character knob: pitch-drop on kick/tom, noise-vs-body on snare, metal harmonics on hat/gong, FM ratio on bell/perc, bit depth on glitch.',
  send: 'How much of the lane goes to the tempo-synced delay (dotted eighth).',
  pan: 'Stereo position, left to right.',
  level: 'Lane volume.',
  tempo: 'Master tempo in bpm, shared by every page. Knob 8 (no Shift), tap tempo on the Record button. Global, not per lane.',
  humanize: 'Random timing jitter on every hit (up to ~15 ms), to make the machine feel less like a machine. Wheel.',
  'step locks': 'Hold a step button on the Move and turn knobs 1–7 (or Alt/right-click a step here) to override tune, probability, velocity, decay, tone, snap or color on that step only. Hold step + Delete clears them. Locked hits glow cyan and get a small moon.',
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
  condition: 'Per step: play only on some loops (1:2 = first of every two, 3:4 = third of every four), only while Fill is held (Move: hold Layout · keyboard: hold 0), never while it is, or only/never on the first loop after Play. Move: hold step + knob 8.',
  repeats: 'Per step ratchet: the hit repeats 2–4 times inside its own step; "fade" makes each repeat quieter. Move: hold step + Shift + knob 8.',
  solo: 'Solo: only soloed lanes play (several can be). Move: Shift + Mute.',
  chokes: 'Choke group: when this lane hits it cuts off the lane picked here, like a closed hat stopping an open hat.',
  sample: 'Load a file, record up to 4 s from the mic, take one of the 8 slices Unassembler sent, or drop an audio file on a ring. On a sample: tune = speed (±1 octave), decay = how much plays, snap = soft attack (left) or skip into the sample (right), color = a pitch swoop into the hit.',
  dice: 'Free dice = every probability roll is new. Locked dice = rolls come from the seed, so a probabilistic groove (and humanize, evolve, randomize) repeats exactly. Same seed, same groove.',
  'dice repeat': 'Locked dice: the rolls repeat every N loops of each lane (1 = every loop identical).',
  share: 'Copy link puts the whole pattern (not samples) in the URL: open it anywhere to get the groove. WAV renders the current pattern; MIDI writes the pattern or the running chain, one track per lane with the MIDI I/O notes.',
  'clock in': 'Follow another device: "tempo" takes its bpm, "tempo + start/stop" also starts and stops with it, "phase lock" also keeps the beat aligned to its clock ticks (and Song Position Pointer).',
};
const PARAMS = [
  { k: 'length', label: 'length', min: 1, max: MAX_STEPS, get: l => l.length, set: (l, v) => { l.setLength(v); if (l.euclidK) l.setEuclid(Math.min(l.euclidK, l.length)); }, fmt: v => v },
  { k: 'euclid', label: 'euclid hits', min: 0, max: MAX_STEPS, get: l => l.euclidK, set: (l, v) => l.setEuclid(v), fmt: v => v },
  { k: 'rotation', label: 'rotation', min: 0, max: MAX_STEPS - 1, get: l => l.rotation, set: (l, v) => { l.rotation = ((Math.round(v) % l.length) + l.length) % l.length; }, fmt: v => v },
  { k: 'ratio', label: 'speed ×', min: 0, max: RATIOS.length - 1, get: l => l.ratioIndex, set: (l, v) => { l.setRatio(v); retime(); }, fmt: v => RATIO_LABEL[v] },
  { k: 'swing', label: 'swing', min: 0, max: 100, get: l => Math.round(l.swing * 100), set: (l, v) => { l.swing = Math.max(0, Math.min(0.66, v / 100)); }, fmt: v => v + '%' },
  { k: 'prob', label: 'probability', min: 0, max: 100, get: l => Math.round(l.prob * 100), set: (l, v) => { l.prob = Math.max(0, Math.min(1, v / 100)); }, fmt: v => v + '%' },
  { k: 'tune', label: 'tune', min: -100, max: 100, get: l => Math.round(l.tune * 100), set: (l, v) => { l.tune = Math.max(-1, Math.min(1, v / 100)); }, fmt: v => (v > 0 ? '+' : '') + v },
];
const sliders = {};   // k -> gauge handle ({ set, value })
const laneTabs = [];  // the four coloured lane buttons: a touch-friendly alternative to tapping a ring
function buildSliders() {
  const el = $('sliders'); el.innerHTML = '';
  for (const p of PARAMS) { const g = makeGauge({ label: p.label, min: p.min, max: p.max, value: p.get(m.lane), fmt: p.fmt, title: INFO[p.k], onChange: (v) => { p.set(m.lane, v); sync(); } }); sliders[p.k] = g; el.appendChild(g.el); }
  const ge = $('global-sliders'); ge.innerHTML = '';
  sliders.tempo = makeGauge({ label: 'master tempo · knob 8', min: 40, max: 240, value: tempo, fmt: (v) => v + ' bpm', title: INFO.tempo, color: 'var(--ember-magenta)', onChange: (v) => applyTempo(v) }); ge.appendChild(sliders.tempo.el);
  sliders.humanize = makeGauge({ label: 'humanize · wheel', min: 0, max: 100, value: Math.round(m.humanize * 100), fmt: (v) => v + '%', title: INFO.humanize, color: 'var(--nebula-purple)', onChange: (v) => { m.humanize = v / 100; save(); readout(); } }); ge.appendChild(sliders.humanize.el);
  $('param-glossary').innerHTML = Object.entries(INFO).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  for (let i = 0; i < 4; i++) { const b = document.createElement('button'); b.className = 'lane-tab'; b.style.setProperty('--lane', LANE_HEX[i]); b.title = `select lane ${i + 1} (Alt+${i + 1})`; b.onclick = () => { m.select(i); sync(); }; $('lane-tabs').appendChild(b); laneTabs.push(b); }
  const vs = $('voice-select'); vs.innerHTML = ''; for (const k of VOICE_KEYS) vs.add(new Option(VOICES[k].label, k)); vs.onchange = () => setVoice(m.selected, vs.value);
  const ks = $('kit-select'); ks.innerHTML = ''; for (const k of KIT_KEYS) ks.add(new Option(KITS[k].name, k)); ks.onchange = () => applyKit(ks.value);
  const se = $('sound-sliders'); se.innerHTML = '';
  for (const k of SOUND_KEYS) { const g = makeGauge({ label: k, min: 0, max: 100, value: Math.round(m.lane.sound[k] * 100), title: INFO[k], color: 'var(--ember-magenta)', onChange: (v) => { m.lane.setSound(k, v / 100); applySound(m.selected); sync(); } }); sliders['snd:' + k] = g; se.appendChild(g.el); }
}
function sync() {
  for (const p of PARAMS) sliders[p.k].set(p.get(m.lane));
  for (const k of SOUND_KEYS) sliders['snd:' + k].set(Math.round(m.lane.sound[k] * 100));
  sliders.tempo.set(tempo); sliders.humanize.set(Math.round(m.humanize * 100));
  $('lane-name').textContent = `${m.selected + 1} · ${voiceLabel(m.lane)}${m.lane.muted ? ' (muted)' : ''}`;
  laneTabs.forEach((b, i) => { b.textContent = `${i + 1} ${voiceLabel(m.lanes[i])}${m.lanes[i].muted ? ' ·m' : ''}`; b.classList.toggle('sel', i === m.selected); }); renderVoiceOptions(); renderLaneMix(); const kk = KIT_KEYS.find(k => KITS[k].name === m.kit); if (kk) $('kit-select').value = kk;
  $('lane-drawer').open = true; $('lane-drawer').style.borderColor = LANE_HEX[m.selected]; for (const p of PARAMS) sliders[p.k].setColor(LANE_HEX[m.selected]);
  $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : '';
  renderSteps(); renderLocks(); paintLeds(); save(); readout();
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
  $('sample-name').textContent = lane.sample ? `${lane.sample.name}${lane.voice === 'sample' ? '' : ' (pick it in voice)'}` : 'none loaded';
}
function nudge(k, delta) { const p = PARAMS.find(x => x.k === k); p.set(m.lane, p.get(m.lane) + delta); sync(); }
function renderSteps() {
  const el = $('stepsui'); el.innerHTML = ''; const lane = m.lane;
  for (let i = 0; i < MAX_STEPS; i++) {
    const d = document.createElement('div'); d.className = `st ${i >= lane.length ? 'off' : lane.hitAt(i) ? (lane.accentAt(i) ? 'acc' : 'on') : ''}${i < lane.length && lane.lockAt(i) ? ' lk' : ''}${i < lane.length && lane.trigAt(i) ? ' tg' : ''}${i === lockStep ? ' sel' : ''}`;
    const tg = i < lane.length && lane.trigAt(i); if (tg) d.dataset.tg = `${tg.cond !== 'always' ? tg.cond : ''}${tg.ratchet > 1 ? ` ×${tg.ratchet}` : ''}`.trim();
    d.title = 'click = hit · Shift+click = accent · Alt+click or right-click = step locks, condition, repeats';
    d.onclick = (e) => { if (i >= lane.length) return; if (e.altKey) return editLocks(i); if (e.shiftKey) lane.toggleAccent(lane.stepIndex(i)); else lane.toggle(lane.stepIndex(i)); sync(); };
    d.oncontextmenu = (e) => { e.preventDefault(); if (i < lane.length) editLocks(i); };
    el.appendChild(d);
  }
}

// ---- per-step locks: hold a step on the Move and turn knobs 1–7, or Alt/right-click a step here ----
let lockStep = -1;   // visible step the lock panel edits (-1 = closed)
const LOCK_UI = {
  tune: { label: 'tune', min: -100, max: 100, fmt: v => (v > 0 ? '+' : '') + v, base: l => l.tune },
  prob: { label: 'probability', fmt: v => v + '%', base: l => l.prob },
  vel: { label: 'velocity', fmt: v => v + '%', base: () => 0.7 },
  decay: { label: 'decay', base: l => l.sound.decay }, tone: { label: 'tone', base: l => l.sound.tone },
  snap: { label: 'snap', base: l => l.sound.snap }, color: { label: 'color', base: l => l.sound.color },
};
const lockValue = (lane, i, k) => lane.lockAt(i)?.[k] ?? LOCK_UI[k].base(lane);
function editLocks(i) { lockStep = lockStep === i ? -1 : i; renderSteps(); renderLocks(); }
function buildLockGauges() {
  const el = $('lock-gauges'); el.innerHTML = '';
  for (const k of LOCK_KEYS) {
    const u = LOCK_UI[k]; const g = makeGauge({ label: u.label, min: u.min ?? 0, max: u.max ?? 100, value: 0, fmt: u.fmt, title: INFO['lock ' + k] || INFO[k] || '', color: 'var(--signal-cyan)',
      onChange: (v) => { if (lockStep < 0) return; const lane = m.lane; lane.setLock(lane.stepIndex(lockStep), k, v / 100); auditionLock(); renderSteps(); renderLocks(); save(); } });
    sliders['lock:' + k] = g; el.appendChild(g.el);
  }
  $('lock-clear').onclick = () => { if (lockStep < 0) return; const i = m.lane.stepIndex(lockStep); m.lane.clearLocks(i); m.lane.trigs[i] = null; renderSteps(); renderLocks(); save(); };
  const setTrig = (patch) => { if (lockStep < 0) return; m.lane.setTrig(m.lane.stepIndex(lockStep), patch); auditionLock(); renderSteps(); renderLocks(); save(); };
  // condition = "every N loops" + which loop (dots), or one of the fill / first specials
  ui.condEvery = mount('cond-every', segmented({ options: [[1, 'always'], [2, '1 in 2'], [3, '1 in 3'], [4, '1 in 4']], value: 1, onChange: (b) => setTrig({ cond: b === 1 ? 'always' : `1:${b}` }) }));
  ui.condSpecial = mount('cond-special', segmented({ options: [['fill', 'with fill', INFO.condition], ['not fill', 'without fill'], ['first', '1st loop'], ['not first', 'after 1st']], value: null, chips: true,
    onChange: (c) => setTrig({ cond: m.lane.trigAt(lockStep)?.cond === c ? 'always' : c }) }));
  ui.ratchet = mount('trig-ratchet', segmented({ options: [1, 2, 3, 4].map(r => [r, r === 1 ? '1' : `×${r}`, r === 1 ? 'one hit' : `${r} hits inside the step`]), value: 1, onChange: (r) => setTrig({ ratchet: r }) }));
  ui.fade = mount('trig-fade', toggleChip({ label: 'fade repeats', title: 'Each repeat quieter', onChange: (v) => setTrig({ fade: v }) }));
  $('lock-close').onclick = () => editLocks(lockStep);
}
function renderLocks() {
  const lane = m.lane, panel = $('lockpanel'); if (lockStep >= lane.length) lockStep = -1;
  panel.hidden = lockStep < 0; if (lockStep < 0) return;
  const lk = lane.lockAt(lockStep) || {}, keys = Object.keys(lk);
  renderTrig(lane.trigAt(lockStep));
  $('lock-title').textContent = `step ${lockStep + 1} · ${keys.length ? 'locked: ' + keys.join(', ') : 'no locks yet (dim = lane value)'}`;
  for (const k of LOCK_KEYS) { const g = sliders['lock:' + k]; g.set(Math.round(lockValue(lane, lockStep, k) * 100)); g.setColor(lk[k] != null ? 'var(--signal-cyan)' : 'rgba(236,233,247,.3)'); }
}
/** Condition picker state from a step's trig: 'a:b' → "1 in b" + dot a lit; specials light their chip. */
function renderTrig(tg) {
  const cond = tg?.cond || 'always', ab = /^(\d):(\d)$/.exec(cond), b = ab ? +ab[2] : cond === 'always' ? 1 : null, a = ab ? +ab[1] : 1;
  ui.condEvery.set(b); ui.condSpecial.set(ab || cond === 'always' ? null : cond); ui.ratchet.set(tg?.ratchet || 1); ui.fade.set(!!tg?.fade);
  const dots = $('cond-dots'); dots.innerHTML = ''; $('cond-dots-wrap').hidden = !(b > 1);
  for (let k = 1; k <= (b || 0); k++) { const d = document.createElement('button'); d.type = 'button'; d.className = `ldot${k === a ? ' on' : ''}`; d.textContent = k; d.title = `play on loop ${k} of every ${b}`; d.style.setProperty('--chip', LANE_HEX[m.selected]); d.onclick = () => { m.lane.setTrig(m.lane.stepIndex(lockStep), { cond: `${k}:${b}` }); auditionLock(); renderSteps(); renderLocks(); save(); }; dots.appendChild(d); }
  $('cond-text').textContent = ab ? `plays on loop ${a} of every ${b}${b > 1 ? ` (${[0, 1, 2].map(n => a + n * b).join(', ')}…)` : ''}` : { always: 'plays every loop', fill: 'plays only while Fill is held', 'not fill': 'rests while Fill is held', first: 'plays only on the first loop after Play', 'not first': 'rests on the first loop, then plays' }[cond];
}
function auditionLock() {
  if (!awake || playing || lockStep < 0) return; const lane = m.lane, tg = lane.trigAt(lockStep), n = tg?.ratchet || 1, v = hitVel(lane.accentAt(lockStep), lane.lockAt(lockStep));
  for (let k = 0; k < n; k++) hitSound(lane, T.now() + k * 0.09 / n * 2, lane.accentAt(lockStep) && !k, lane.lockAt(lockStep), tg?.fade ? v * Math.pow(0.72, k) : v);
}

// ---- pattern slots & chains ----
function loadSlot(i) {
  const sel = m.selected; m.assign(bank.get(i)); m.selected = sel;
  m.lanes.forEach((_, li) => { buildVoice(li); applySound(li); });
  evoSnap = bank.get(i); evoCount = 0; lockStep = -1; sync(); renderSlots(); renderLanesEvolve();
}
function saveSlot(i) { bank.save(i, m.toJSON()); evoSnap = m.toJSON(); evoCount = 0; renderSlots(); paintLeds(); readout(); }
/** Stopped: load at once. Playing: queue for the next boundary (now / bar / cycle). */
function recallSlot(i) { if (!bank.recall(i)) return; if (!playing) { bank.take(i); loadSlot(i); } renderSlots(); readout(); paintLeds(); }
function chainSlots(list) { bank.setChain(list); if (!playing && bank.chain.length) { bank.take(bank.chain[0]); loadSlot(bank.chain[0]); } renderSlots(); readout(); paintLeds(); }
function renderSlots() {
  const el = $('slots'); el.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const b = document.createElement('button'); b.textContent = i + 1;
    b.className = `slot${bank.filled(i) ? ' filled' : ''}${bank.current === i ? ' cur' : ''}${bank.pending === i ? ' queued' : ''}${bank.chain.length > 1 && bank.chain.includes(i) ? ' chain' : ''}`;
    b.title = 'click = load · Shift+click = save here · Cmd/Ctrl+click = add to chain · Alt+click = erase';
    b.onclick = (e) => { if (e.shiftKey) saveSlot(i); else if (e.altKey) { bank.erase(i); renderSlots(); } else if (e.metaKey || e.ctrlKey) chainSlots([...(bank.chain.length ? bank.chain : bank.current >= 0 ? [bank.current] : []), i]); else recallSlot(i); };
    el.appendChild(b);
  }
  $('chain-info').textContent = bank.chain.length > 1 ? `chain ${bank.chain.map(i => i + 1).join(' → ')} · ${bank.chainBars} bar${bank.chainBars > 1 ? 's' : ''} each` : bank.pending >= 0 ? `slot ${bank.pending + 1} waits for the next ${bank.switchAt === 'now' ? 'tick' : bank.switchAt}` : bank.current >= 0 ? `playing slot ${bank.current + 1}` : 'nothing saved yet: Shift+click a slot';
}
function buildSlotsUI() {
  ui.slotSwitch = mount('slot-switch', segmented({ options: [['now', 'at once'], ['bar', 'next bar'], ['cycle', 'full cycle', 'when every lane lines up again']], value: bank.switchAt, onChange: (v) => { bank.switchAt = v; bank.persist(); renderSlots(); } }));
  sliders.chainBars = makeGauge({ label: 'bars per slot', min: 1, max: 16, value: bank.chainBars, title: INFO['chain bars'], color: 'var(--ember-magenta)', onChange: (v) => { bank.chainBars = v; bank.persist(); renderSlots(); } }); $('slot-gauges').appendChild(sliders.chainBars.el);
  $('chain-stop').onclick = () => { bank.chain = []; bank.persist(); renderSlots(); readout(); };
  renderSlots();
}

// ---- live record: armed + playing, pads (or keys) play and write the nearest step ----
function liveHit(li, col, velocity = 100) {
  const lane = m.lanes[li]; if (!awake) { wake(); return; }
  const tune = rec.pitchPads ? Math.round(((col - 3.5) / 3.5) * 60) / 100 : null, v = Math.max(0.25, Math.min(1, velocity / 127)), accent = velocity >= rec.accentVel;
  hitSound(lane, T.immediate(), accent, tune != null ? { tune } : null, accent ? 1 : v); pmidi.note(li, accent ? 1 : v, performance.now());
  if (!rec.armed || !playing) { m.select(li); sync(); return; }
  // where on the master clock was this hit, as heard? (the scheduler runs ahead; the speakers lag a little)
  const raw = T.getContext().rawContext, heard = raw.currentTime - (raw.outputLatency || 0);
  const q = lane.quantize(clockRef.tick + (heard - clockRef.time) / tickSec(), rec.quant), idx = lane.stepIndex(q.index);
  lane.hits[idx] = true; if (accent) lane.accents[idx] = true; if (tune != null) lane.setLock(idx, 'tune', tune);
  if (q.step * lane.stepTicks() > clockRef.tick) skip.add(`${li}:${q.step}`);   // that step hasn't been scheduled yet: don't play it twice
  scene.flash(li, q.index, accent); m.select(li); sync();
}
function setRec(on) { rec.armed = on; $('btn-rec').classList.toggle('armed', on); $('btn-rec').textContent = on ? '● recording' : '● arm record'; saveSettings(); paintLeds(); readout(); }
function buildRecUI() {
  $('btn-rec').onclick = () => setRec(!rec.armed);
  sliders.accentVel = makeGauge({ label: 'accent above', min: 1, max: 127, value: rec.accentVel, title: INFO['accent above'], color: '#fb7185', onChange: (v) => { rec.accentVel = v; saveSettings(); } }); $('rec-gauges').appendChild(sliders.accentVel.el);
  ui.quant = mount('rec-quant', segmented({ options: [['nearest', 'nearest step', 'early hits land on the coming step'], ['previous', 'step just played']], value: rec.quant, onChange: (v) => { rec.quant = v; saveSettings(); } }));
  ui.pitchPads = mount('rec-pitch', toggleChip({ label: 'pitch pads', on: rec.pitchPads, title: INFO['pitch pads'], onChange: (v) => { rec.pitchPads = v; saveSettings(); } }));
}

// ---- evolve: every N bars, nudge some lanes; optionally come back home ----
let lastEvolve = '';
/** Clearing or randomizing is a fresh start: evolve stops (it would mutate the new pattern away from you). */
function clearLane() { if (evo.on) setEvolve(false); m.lane.clear(); sync(); }
/** Init: every lane empty, length 4 at ×1, default voices and sounds; one kick on step 1 of lane 1. Undoable. */
function initPattern() {
  if (evo.on) setEvolve(false); const n = new Machine();
  n.lanes.forEach(l => { l.clear(); l.setLength(4); l.setRatio(RATIOS.indexOf(1)); }); n.lanes[0].hits[0] = true;
  const sel = 0; m.assign(n.toJSON()); m.selected = sel; m.lanes.forEach((_, li) => { buildVoice(li); applySound(li); }); lockStep = -1; sync(); renderLanesEvolve();
}
/** Randomize: with locked dice a fresh seed is rolled and shown, so a groove you like can be re-made from its number. */
function randomizeAll() { if (evo.on) setEvolve(false); if (dice.locked) { dice.reroll(); saveSettings(); renderDice(); } m.randomize(dice.stream(0)); sync(); }
// ---- undo / redo ----
function applyState(json) {
  if (!json) return; restoring = true; const sel = m.selected; m.assign(JSON.parse(json)); m.selected = Math.min(sel, m.lanes.length - 1);
  m.lanes.forEach((_, li) => { buildVoice(li); applySound(li); }); lockStep = -1; sync(); renderLanesEvolve(); restoring = false;
}
const undo = () => applyState(hist.undo()), redo = () => applyState(hist.redo());
function setFill(on) { if (fill === on) return; fill = on; $('btn-fill').classList.toggle('armed', on); paintLeds(); readout(); }
function evolveNow(bar = 0) {
  if (!evoSnap) evoSnap = m.toJSON();
  if (evo.home && evoCount >= evo.home) { const sel = m.selected; m.assign(evoSnap); m.selected = sel; m.lanes.forEach((_, li) => { buildVoice(li); applySound(li); }); evoCount = 0; lastEvolve = 'back home'; }
  else { const ch = m.evolve({ scope: evo.scope, amount: evo.amount / 100 }, dice.stream(1000 + bar)); evoCount++; lastEvolve = ch.map(c => `${voiceLabel(m.lanes[c.lane])} ${c.kind}${c.dir > 0 ? '+' : '−'}`).join(', ') || 'held still'; }
  sync();
}
function setEvolve(on) { evo.on = on; if (on) { evoSnap = m.toJSON(); evoCount = 0; lastEvolve = ''; } $('btn-evolve').classList.toggle('armed', on); $('btn-evolve').textContent = on ? '◉ evolving' : '◌ evolve'; saveSettings(); paintLeds(); readout(); }
function renderLanesEvolve() {
  const el = $('evo-lanes'); el.innerHTML = '';
  m.lanes.forEach((l, i) => el.appendChild(toggleChip({ label: `${i + 1} · ${voiceLabel(l)}`, on: l.evolve, color: LANE_HEX[i], title: 'lit = evolve may change this lane', onChange: (v) => { l.evolve = v; save(); } }).el));
}
function buildEvolveUI() {
  $('btn-evolve').onclick = () => setEvolve(!evo.on); $('evo-home-now').onclick = () => { evoSnap = m.toJSON(); evoCount = 0; lastEvolve = 'home set'; readout(); };
  const g = $('evo-gauges');
  sliders.evoEvery = makeGauge({ label: 'every · bars', min: 1, max: 32, value: evo.every, title: INFO['evolve every'], color: 'var(--nebula-purple)', onChange: (v) => { evo.every = v; saveSettings(); readout(); } });
  sliders.evoAmount = makeGauge({ label: 'amount', min: 0, max: 100, value: evo.amount, fmt: v => v + '%', title: INFO['evolve amount'], color: 'var(--nebula-purple)', onChange: (v) => { evo.amount = v; saveSettings(); } });
  sliders.evoHome = makeGauge({ label: 'home after', min: 0, max: 16, value: evo.home, fmt: v => v ? v + '×' : 'never', title: INFO['return home'], color: 'var(--nebula-purple)', onChange: (v) => { evo.home = v; saveSettings(); } });
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
  ui.follow = mount('midi-follow', segmented({ options: [['off', 'off'], ['tempo', 'tempo'], ['transport', '+ start/stop'], ['lock', '+ phase lock', 'tempo, start/stop and beat position']], value: pmidi.follow, onChange: (v) => { pmidi.follow = v; saveSettings(); renderMidi(); } }));
  // note + channel per lane as gauges (note names in Live's convention, C3 = 60), then the gate
  const NOTE = (p) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][p % 12] + (Math.floor(p / 12) - 2), g = $('midi-lanes');
  m.lanes.forEach((_, i) => {
    g.appendChild(makeGauge({ label: `lane ${i + 1} note`, min: 0, max: 127, value: pmidi.lanes[i].note, fmt: (v) => `${NOTE(v)} · ${v}`, color: LANE_HEX[i], onChange: (v) => { pmidi.lanes[i].note = v; saveSettings(); } }).el);
    g.appendChild(makeGauge({ label: `lane ${i + 1} ch`, min: 1, max: 16, value: pmidi.lanes[i].ch, fmt: (v) => `ch ${v}`, color: LANE_HEX[i], onChange: (v) => { pmidi.lanes[i].ch = v; saveSettings(); } }).el);
  });
  g.appendChild(makeGauge({ label: 'gate', min: 5, max: 500, value: pmidi.gateMs, fmt: (v) => `${v} ms`, color: 'var(--star-white)', title: 'how long each MIDI note is held', onChange: (v) => { pmidi.gateMs = v; saveSettings(); } }).el);
  pmidi.handlers = { tempo: (bpm) => { applyTempo(bpm); renderMidi(); }, start: () => { if (!playing) togglePlay(); }, stop: () => { if (playing) togglePlay(); },
    // phase lock: compare where our clock is with the incoming tick at the moment it arrived; trim the tempo or snap
    tick: (ext, t) => {
      if (!playing) return; const raw = T.getContext().rawContext, audioT = raw.currentTime + (t - performance.now()) / 1000;
      const { jump, trim } = phaseCorrection(clockRef.tick + (audioT - clockRef.time) / tickSec() - ext);
      if (jump) tick = Math.max(0, tick + jump); T.getTransport().bpm.value = (pmidi.extBpm || tempo) * trim; stress.drift = jump ? 'snap' : `${((trim - 1) * 100).toFixed(1)}%`;
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
  const lane = m.lanes[li]; lane.sample = { id, name: rec.name || 'sample' }; lane.setVoice('sample'); buildVoice(li); m.select(li); sync();
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
async function renderSlices() {
  const sl = await getSample(SLICES_KEY), el = $('slice-select'); el.innerHTML = '';
  if (!sl) { el.innerHTML = '<p class="hint tight">No slices yet: in Unassembler press <b>→ orbits</b>, they show up here.</p>'; return; }
  const head = document.createElement('p'); head.className = 'hint tight slice-head'; head.textContent = `slices of ${sl.name.split(' · ')[0]} · tap one to put it on this lane`; el.appendChild(head);
  sl.slices.forEach((ch, k) => {   // a tile per slice with its waveform, so you pick by shape, not by number
    const b = document.createElement('button'); b.type = 'button'; b.className = 'slice'; b.title = `slice ${k + 1}`;
    const c = document.createElement('canvas'); c.width = 64; c.height = 26; const g = c.getContext('2d'), d = ch[0], step = Math.max(1, Math.floor(d.length / 64));
    g.fillStyle = '#67e8f9'; for (let x = 0; x < 64; x++) { let pk = 0; for (let j = x * step; j < (x + 1) * step && j < d.length; j += 4) pk = Math.max(pk, Math.abs(d[j])); const h = Math.max(1, pk * 24); g.fillRect(x, 13 - h / 2, 1, h); }
    const n = document.createElement('span'); n.textContent = k + 1; b.append(c, n);
    b.onclick = () => assignSample(m.selected, { name: `${sl.name.replace(/\.[^.]+$/, '').split(' · ')[0].slice(0, 16)} #${k + 1}`, sampleRate: sl.sampleRate, channels: ch });
    el.appendChild(b);
  });
}
function buildSampleUI() {
  $('btn-sample-file').onclick = () => $('sample-file').click();
  $('sample-file').onchange = () => { const f = $('sample-file').files[0]; if (f) sampleFromFile(m.selected, f); $('sample-file').value = ''; };
  $('btn-mic').onclick = toggleMic;
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
  $('dice-make').onclick = () => { const was = dice.locked; dice.locked = true; m.randomize(dice.stream(0)); dice.locked = was; sync(); };
  sliders.diceRepeat = makeGauge({ label: 'repeat · loops', min: 1, max: 16, value: dice.repeat, title: INFO['dice repeat'], color: 'var(--signal-cyan)', onChange: (v) => { dice.repeat = v; saveSettings(); } }); $('dice-gauges').appendChild(sliders.diceRepeat.el);
  renderDice();
}

// ---- share & export ----
const download = (bytes, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
/** Length of a render in master ticks: N bars, or one full polyrhythm cycle (capped at 64 bars). */
function renderTicks() { const v = ui.expLen.value; return v === 'cycle' ? Math.min(64 * BAR_TICKS, m.cycleTicks()) : +v * BAR_TICKS; }
async function shareLink() {
  const code = await encodeShare(m.toJSON(), tempo), url = `${location.origin}${location.pathname}#p=${code}`;
  history.replaceState(null, '', `#p=${code}`);
  try { await navigator.clipboard.writeText(url); $('exp-status').textContent = `link copied (${url.length} chars)`; } catch { $('exp-status').textContent = 'link is in the address bar (clipboard blocked)'; }
}
async function exportWav() {
  await wake(); const ticks = renderTicks(), sec = ticks * tickSec(), tail = 2.5; $('exp-status').textContent = `rendering ${sec.toFixed(1)} s…`;
  const hits = collectHits(m, { from: 0, to: ticks, tempo, dice: dice.locked ? dice : null });
  for (const l of m.lanes) await ensureSample(l);
  const out = await T.Offline(({ transport }) => {
    transport.bpm.value = tempo; const k = makeKit();   // a fresh kit in the offline context, same voices and sounds
    for (const h of hits) hitSound(m.lanes[h.li], Math.max(0, h.time) + 0.01, h.accent, h.lock, h.vel, k);
  }, sec + tail, 2, 44100);
  const b = out.get(); download(encodeWav([b.getChannelData(0), b.getChannelData(1)], b.sampleRate), `orbits-${stamp()}.wav`, 'audio/wav');
  $('exp-status').textContent = `WAV: ${hits.length} hits, ${(sec + tail).toFixed(1)} s`;
}
function exportMidi() {
  const chain = ui.expWhat.value === 'chain' && bank.chain.length > 1;
  const hits = chain ? collectChain(bank.chain.map(i => bank.get(i)), { bars: bank.chainBars, tempo, dice: dice.locked ? dice : null }) : collectHits(m, { from: 0, to: renderTicks(), tempo, dice: dice.locked ? dice : null });
  const bytes = hitsToMidi(hits, { tempo, lanes: pmidi.lanes, names: m.lanes.map(voiceLabel), gateSec: pmidi.gateMs / 1000 });
  download(bytes, `orbits-${chain ? 'chain' : 'pattern'}-${stamp()}.mid`, 'audio/midi'); $('exp-status').textContent = `MIDI: ${hits.length} notes${chain ? ` · chain of ${bank.chain.length}` : ''}`;
}
async function loadShared() {
  const mm = /#p=([\w-]+)/.exec(location.hash); if (!mm) return;
  try { const o = await decodeShare(mm[1]); m.assign(o.m); if (o.tempo) applyTempo(o.tempo); m.lanes.forEach((_, li) => { buildVoice(li); applySound(li); }); sync(); renderLanesEvolve(); $('exp-status').textContent = 'loaded from the link (undo brings your pattern back)'; }
  catch (e) { $('exp-status').textContent = `link: ${e.message}`; }
}
function buildExportUI() {
  ui.expLen = mount('exp-len', segmented({ options: [[1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16 bars'], ['cycle', 'cycle', 'one full polyrhythm cycle (max 64 bars)']], value: 4 }));
  ui.expWhat = mount('exp-what', segmented({ options: [['pattern', 'this pattern'], ['chain', 'the chain', 'each slot of the running chain for its bars']], value: 'pattern' }));
  $('exp-link').onclick = shareLink; $('exp-wav').onclick = () => exportWav().catch(e => { $('exp-status').textContent = `WAV: ${e.message}`; }); $('exp-mid').onclick = exportMidi; $('exp-stems').onclick = () => exportStems().catch(e => { $('exp-status').textContent = `stems: ${e.message}`; });
  addEventListener('hashchange', loadShared);
}

// ---- undo / redo / fill buttons ----
function buildEditUI() {
  $('btn-undo').onclick = undo; $('btn-redo').onclick = redo;
  const f = $('btn-fill'); f.onpointerdown = () => setFill(true); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) f.addEventListener(ev, () => setFill(false));
}

// ---- jam: record what you play (edits, mutes, evolve, slots, knobs) as 4 lane tracks, up to 256 beats ----
// The recorder taps each lane bus (pre-master), starts on a beat and ends exactly on the master clock, so the four
// files are sample-aligned and the same length.
const jam = { state: 'idle', node: null, startTick: 0, beats: 0, chunks: null, sr: 44100 };   // idle → armed → rec → finishing → done
async function ensureJamNode() {
  // through Tone's context: its rawContext is a wrapper the native AudioWorkletNode constructor rejects
  if (jam.node) return; const tc = T.getContext(), ctx = tc.rawContext; jam.sr = ctx.sampleRate;
  await tc.addAudioWorkletModule(new URL('./jam-worklet.js', import.meta.url).href);
  jam.node = tc.createAudioWorkletNode('orbits-jam', { numberOfInputs: 4, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  jam.node.connect(ctx.destination);   // silent output, keeps the recorder pulled by the graph
  kit.chains.forEach((c, i) => c.bus.connect(jam.node, 0, i));
  jam.node.port.onmessage = ({ data }) => {
    if (data.lanes) data.lanes.forEach(([L, R], i) => { jam.chunks[i][0].push(L); jam.chunks[i][1].push(R); });
    if (data.done) { const any = jam.chunks[0][0].length; jam.state = any ? 'done' : 'idle'; renderJam(); paintLeds(); }
  };
}
async function toggleJam() {
  if (jam.state === 'rec' || jam.state === 'armed') return stopJam();
  try { await wake(); await ensureJamNode(); } catch (e) { $('jam-text').textContent = `jam: ${e.message}`; return; }
  jam.chunks = Array.from({ length: 4 }, () => [[], []]); jam.beats = 0; jam.state = 'armed'; renderJam(); paintLeds();
  if (!playing) togglePlay();
}
function stopJam() {
  if (jam.state === 'armed') { jam.state = 'idle'; jam.node?.port.postMessage({ cancel: true }); }
  else if (jam.state === 'rec') { jam.state = 'finishing'; jam.node.port.postMessage({ end: T.getContext().rawContext.currentTime + 0.02 }); }
  renderJam(); paintLeds();
}
/** Master-clock side: start on the next beat, stop at 256 beats sharp. */
function jamTick(t, time) {
  if (jam.state === 'armed' && t % PPQ === 0) { jam.startTick = t; jam.node.port.postMessage({ start: time }); jam.state = 'rec'; T.getDraw().schedule(() => { renderJam(); paintLeds(); }, time); }
  if (jam.state !== 'rec') return;
  const el = t - jam.startTick; jam.beats = el / PPQ;
  if (el >= JAM_BEATS * PPQ) { jam.node.port.postMessage({ end: time }); jam.state = 'finishing'; T.getDraw().schedule(renderJam, time); }
  else if (el % PPQ === 0) T.getDraw().schedule(renderJam, time);
}
function renderJam() {
  const st = jam.state, b = Math.floor(jam.beats), btn = $('btn-jam'), panel = $('jam-panel');
  btn.classList.toggle('on', st === 'rec' || st === 'armed'); btn.textContent = st === 'rec' ? `■ jam ${b}/${JAM_BEATS}` : st === 'armed' ? '● jam: next beat…' : '● jam';
  panel.hidden = st === 'idle'; $('jam-fill').style.width = `${Math.min(100, (jam.beats / JAM_BEATS) * 100)}%`;
  const secs = jam.chunks ? jam.chunks[0][0].reduce((a, c) => a + c.length, 0) / jam.sr : 0;
  $('jam-text').textContent = st === 'armed' ? 'starts on the next beat' : st === 'rec' ? `recording · beat ${b} of ${JAM_BEATS} · bar ${Math.floor(b / 4) + 1}` : st === 'finishing' ? 'closing the take…' : st === 'done' ? `take ready · ${Math.round(jam.beats)} beats · ${secs.toFixed(1)} s · 4 lanes + mix` : '';
  $('jam-dl').hidden = $('jam-discard').hidden = st !== 'done'; readout();
}
function downloadJam() {
  if (jam.state !== 'done') return; const names = m.lanes.map(voiceLabel);
  download(stemsZip(jam.chunks, names, jam.sr, `orbits-jam-${stamp()}`), `orbits-jam-${stamp()}.zip`, 'application/zip');
}
function buildJamUI() {
  $('btn-jam').onclick = toggleJam; $('jam-dl').onclick = downloadJam; $('jam-discard').onclick = () => { jam.state = 'idle'; jam.chunks = null; renderJam(); paintLeds(); };
  renderJam();
}

// ---- stems: the current pattern rendered once, each lane to its own pair of channels → equal-length WAVs ----
async function exportStems() {
  await wake(); const ticks = renderTicks(), sec = ticks * tickSec(), tail = 2.5; $('exp-status').textContent = `rendering 4 stems, ${(sec + tail).toFixed(1)} s…`;
  const hits = collectHits(m, { from: 0, to: ticks, tempo, dice: dice.locked ? dice : null });
  for (const l of m.lanes) await ensureSample(l);
  const out = await T.Offline(() => {
    T.getTransport().bpm.value = tempo; const k = makeKit({ raw: true }), ctx = T.getContext().rawContext, merger = ctx.createChannelMerger(8);
    merger.connect(ctx.destination); k.master.disconnect();
    k.chains.forEach((c, i) => { const sp = ctx.createChannelSplitter(2); c.bus.disconnect(); c.bus.connect(sp); sp.connect(merger, 0, 2 * i); sp.connect(merger, 1, 2 * i + 1); });
    for (const h of hits) hitSound(m.lanes[h.li], Math.max(0, h.time) + 0.01, h.accent, h.lock, h.vel, k);
  }, sec + tail, 8, 44100);
  const b = out.get(), { lanes, gain } = floatStemsToInt16(m.lanes.map((_, i) => [b.getChannelData(2 * i), b.getChannelData(2 * i + 1)]));
  download(stemsZip(lanes, m.lanes.map(voiceLabel), b.sampleRate, `orbits-stems-${stamp()}`), `orbits-stems-${stamp()}.zip`, 'application/zip');
  $('exp-status').textContent = `stems: 4 lanes + mix, ${(sec + tail).toFixed(1)} s each${gain < 1 ? ` (all scaled ${(20 * Math.log10(gain)).toFixed(1)} dB to avoid clipping)` : ''}`;
}
buildSliders(); buildLockGauges(); buildSlotsUI(); buildRecUI(); buildEvolveUI(); buildMidiUI(); buildMixUI(); buildSampleUI(); buildDiceUI(); buildExportUI(); buildEditUI(); buildJamUI(); sync(); hist.commit(JSON.stringify(m));
// every visit starts from init; the pattern you left is one undo away (and a shared link wins over both)
if (!/#p=/.test(location.hash)) initPattern(); loadShared();
$('btn-init').onclick = initPattern;
// ---- library: named setups in localStorage (patterns + voices + kit + sounds + tempo + volume + dice) ----
const setupData = () => ({ m: m.toJSON(), tempo, vol, dice: dice.toJSON() });
const flash = (id, txt) => { const b = $(id), was = b.dataset.label || b.textContent; b.dataset.label = was; b.textContent = txt; b.classList.add('flash'); setTimeout(() => { b.textContent = was; b.classList.remove('flash'); }, 1200); };
function loadSetup(id) {
  const e = lib.get(id); if (!e?.m) return; if (evo.on) setEvolve(false);
  const sel = m.selected; m.assign(e.m); m.selected = Math.min(sel, m.lanes.length - 1); if (e.tempo) applyTempo(e.tempo);
  if (e.vol != null) { vol = e.vol; kit?.master.gain.rampTo(vol, 0.05); } if (e.dice) { dice.fromJSON(e.dice); saveSettings(); renderDice(); }
  m.lanes.forEach((_, li) => { buildVoice(li); applySound(li); }); lockStep = -1; libCurrent = id; sync(); renderLanesEvolve(); renderLib(); flash('btn-load', `“${e.name}” ✓`);
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
    const voices = (e.m?.lanes || []).map(l => l.voice === 'sample' ? '♪' : (VOICES[l.voice]?.label || l.voice)).join(' · ');
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
const LANE_LED = LANE_HEX.map(nearestPaletteIndex), LANE_DIM = [24, 16, 30, 34];
const REC_LED = nearestPaletteIndex('#ef4444'), CYAN_LED = nearestPaletteIndex('#67e8f9'), MAGENTA_LED = nearestPaletteIndex('#f0abfc');
const held = new Map();   // step buttons held down: index → { used } (used = a knob turned, so release won't toggle)
let loopHeld = false, dupHeld = false, chainPick = [];
function paintLeds() {
  if (!move.inControl) return;
  const anySolo = m.lanes.some(l => l.solo);
  m.lanes.forEach((lane, r) => {
    for (let c = 0; c < 8; c++) { const i = c; const pad = r * 8 + c; let col = 0; if (i < lane.length) { col = lane.hitAt(i) ? (lane.accentAt(i) ? COLOR.WHITE : LANE_LED[r]) : LANE_DIM[r]; if (playing && lane.shown === i) col = lane.hitAt(i) ? COLOR.WHITE : 120; } move.setPadColor(pad, lane.muted || (anySolo && !lane.solo) ? (col ? LANE_DIM[r] : 0) : col); }
  });
  const lane = m.lane;
  if (loopHeld || dupHeld) {   // step buttons show the slots: white = playing, cyan = queued, magenta = picked for a chain
    for (let i = 0; i < MAX_STEPS; i++) move.setStepColor(i, chainPick.includes(i) ? MAGENTA_LED : bank.current === i ? COLOR.WHITE : bank.pending === i ? CYAN_LED : bank.filled(i) ? (dupHeld ? REC_LED : 34) : dupHeld ? 1 : 0);
  } else for (let i = 0; i < MAX_STEPS; i++) move.setStepColor(i, i >= lane.length ? 0 : (playing && lane.shown === i) ? COLOR.WHITE : lane.hitAt(i) ? (lane.lockAt(i) ? CYAN_LED : LANE_LED[m.selected]) : LANE_DIM[m.selected]);
  for (let t = 1; t <= 4; t++) { const li = 4 - t; move.setButtonColor(`track${t}`, li === m.selected ? COLOR.WHITE : LANE_DIM[li]); }
  move.setButtonColor('play', playing ? COLOR.WHITE : CYAN_LED); move.setButtonColor('mute', lane.solo ? nearestPaletteIndex('#fde047') : lane.muted ? COLOR.WHITE : 0); move.setButtonColor('capture', evo.on ? MAGENTA_LED : LANE_LED[0]); move.setButtonColor('undo', hist.canUndo ? LANE_LED[3] : 0); move.setButtonColor('layout', fill ? COLOR.WHITE : 16); move.setButtonColor('delete', 16);
  move.setButtonColor('record', rec.armed ? REC_LED : nearestPaletteIndex('#fb7185')); move.setButtonColor('left', LANE_DIM[m.selected]); move.setButtonColor('right', LANE_DIM[m.selected]);
  move.setButtonColor('loop', loopHeld ? COLOR.WHITE : bank.chain.length > 1 ? CYAN_LED : 16); move.setButtonColor('duplicate', dupHeld ? REC_LED : 16); move.setButtonColor('sampling', jam.state === 'rec' ? REC_LED : jam.state === 'armed' ? CYAN_LED : jam.state === 'done' ? COLOR.WHITE : 16);
}
move.addEventListener('pad', (e) => {
  if (!e.detail.on) return; const { row, col, velocity } = e.detail;
  if (rec.armed) return liveHit(row, col, velocity);
  const lane = m.lanes[row]; if (col >= lane.length) return; if (shift) lane.toggleAccent(lane.stepIndex(col)); else lane.toggle(lane.stepIndex(col)); if (!awake) wake(); if (awake && !playing) hitSound(lane, T.now(), false); m.select(row); sync();
});
move.addEventListener('step', (e) => {
  const { index, on } = e.detail;
  if (loopHeld || dupHeld) { if (!on) return; if (dupHeld) saveSlot(index); else if (bank.filled(index) && !chainPick.includes(index)) chainPick.push(index); paintLeds(); return; }
  const lane = m.lane; if (index >= lane.length) return;
  if (on) { if (shift) { lane.toggleAccent(lane.stepIndex(index)); sync(); } else held.set(index, { used: false }); return; }
  const h = held.get(index); held.delete(index); if (h && !h.used) { lane.toggle(lane.stepIndex(index)); sync(); }   // a tap toggles; a hold + knob locked something instead
});
move.addEventListener('encoder', (e) => {
  const { index, delta } = e.detail;
  if (held.size && index === 7) {   // hold step(s) + knob 8 = condition; + Shift = repeats (ratchet)
    const lane = m.lane;
    for (const [i, h] of held) { h.used = true; const si = lane.stepIndex(i), t = lane.trigs[si] || { cond: 'always', ratchet: 1 }; lane.setTrig(si, shift ? { ratchet: t.ratchet + Math.sign(delta) } : { cond: CONDS[(CONDS.indexOf(t.cond) + Math.sign(delta) + CONDS.length) % CONDS.length] }); lockStep = i; }
    auditionLock(); renderSteps(); renderLocks(); save(); paintLeds(); return;
  }
  if (held.size && index < LOCK_KEYS.length) {   // hold step(s) + knob 1–7 = lock tune · prob · vel · decay · tone · snap · color on those steps
    const k = LOCK_KEYS[index], lane = m.lane, span = k === 'tune' ? 0.02 : 0.02;
    for (const [i, h] of held) { h.used = true; lane.setLock(lane.stepIndex(i), k, lockValue(lane, i, k) + delta * span); lockStep = i; }
    auditionLock(); renderSteps(); renderLocks(); save(); paintLeds(); return;
  }
  if (shift) { const k = SOUND_KEYS[index]; m.lane.setSound(k, m.lane.sound[k] + delta * 0.02); applySound(m.selected); if (awake && !playing) hitSound(m.lane, T.now(), false); sync(); return; }
  const keys = ['length', 'euclid', 'rotation', 'ratio', 'swing', 'prob', 'tune']; if (index === 7) applyTempo(tempo + delta); else nudge(keys[index], delta * (index >= 4 ? 2 : 1));
});
move.addEventListener('wheel', (e) => { m.humanize = Math.max(0, Math.min(1, m.humanize + e.detail.delta * 0.03)); sliders.humanize?.set(Math.round(m.humanize * 100)); readout(); save(); });
move.addEventListener('volume', (e) => { vol = Math.max(0, Math.min(1, vol + e.detail.delta * 0.02)); kit?.master.gain.rampTo(vol, 0.05); });
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : ''; return; }
  if (name === 'loop') { loopHeld = pressed; if (!pressed) { if (chainPick.length === 1) recallSlot(chainPick[0]); else if (chainPick.length > 1) chainSlots(chainPick); chainPick = []; } paintLeds(); return; }
  if (name === 'duplicate') { dupHeld = pressed; paintLeds(); return; }
  if (name === 'layout') { setFill(pressed); return; }   // hold = fill
  if (name === 'sampling' && pressed) { toggleJam(); return; }
  if (!pressed) return;
  const tr = /^track(\d)$/.exec(name); if (tr) { m.select(4 - +tr[1]); lockStep = -1; sync(); return; }   // track 1 is the top button = top pad row = lane 3
  if (name === 'delete' && held.size) { for (const [i, h] of held) { h.used = true; m.lane.clearLocks(m.lane.stepIndex(i)); m.lane.trigs[m.lane.stepIndex(i)] = null; } renderSteps(); renderLocks(); save(); paintLeds(); return; }
  if (name === 'delete') { clearLane(); return; }   // Delete alone = clear the lane (undoable)
  if (name === 'play') togglePlay(); if (name === 'mute') { if (shift) toggleSolo(); else { m.lane.muted = !m.lane.muted; sync(); } } if (name === 'undo') { if (shift) redo(); else undo(); }
  if (name === 'capture') { if (shift) setEvolve(!evo.on); else randomizeAll(); }
  if (name === 'record') { if (shift) tapTempo(); else setRec(!rec.armed); }
  if (name === 'left' || name === 'right') { const dir = name === 'right' ? 1 : -1; if (shift) cycleKit(dir); else cycleVoice(m.selected, dir); }
});
$('btn-random').onclick = randomizeAll; $('btn-clear').onclick = clearLane; $('btn-reset').onclick = () => { if (playing) resetPending = true; m.resetAll(); scene.reset(); };
const KEYS = ['12345678', 'qwertyui', 'asdfghjk', 'zxcvbnm,'];
window.addEventListener('keyup', (e) => { if (e.key === '0') setFill(false); });
window.addEventListener('keydown', (e) => {
  if (e.repeat || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (e.key === '0') { setFill(true); return; }
  if (/^[1-4]$/.test(e.key) && e.altKey) { m.select(+e.key - 1); lockStep = -1; sync(); return; }
  const r = KEYS.findIndex(k => k.includes(e.key.toLowerCase())); if (r < 0 || e.metaKey || e.ctrlKey) return;
  const row = 3 - r, col = KEYS[r].indexOf(e.key.toLowerCase()); if (rec.armed) return liveHit(row, col, e.shiftKey ? 127 : 100);
  const lane = m.lanes[row]; if (col >= lane.length) return;
  if (e.shiftKey) lane.toggleAccent(lane.stepIndex(col)); else lane.toggle(lane.stepIndex(col)); m.select(row); sync();
});

// ---- Move connection ----
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
$('btn-connect').onclick = async () => {
  try {
    await wake(); const inputs = midi.access ? midi.inputs() : (await midi.init()).inputs; midi.addEventListener('ports', () => { pmidi.refresh(); renderMidi(); }); const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn'); const { identity } = await move.connect(); paintLeds();
    setPill(`Move: ready${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''}`, 'pill-on'); $('btn-disconnect').disabled = false; pmidi.refresh(); renderMidi();
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); }
};
$('btn-disconnect').onclick = () => { move.disconnect(); setPill('Move: disconnected (back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---- visuals: concentric orbits, one ring per lane, each turning at its own speed (see scene.js) ----
const scene = createScene($('cv'), { machine: () => m, isRecording: () => rec.armed, jamProgress: () => (jam.state === 'rec' || jam.state === 'armed' ? jam.beats / JAM_BEATS : null), laneHex: LANE_HEX, label: voiceLabel, ratioLabel: RATIO_LABEL, isPlaying: () => playing, isBusy: () => playing || performance.now() < busyUntil, stepMs: (lane) => m.stepSeconds(lane, tempo) * 1000 });
addEventListener('resize', poke); document.fonts?.ready.then(poke);
$('cv').addEventListener('click', (e) => { const ring = scene.pick(e.clientX, e.clientY); if (ring >= 0) { m.select(ring); sync(); } });
// ---- stress meter: canvas frame time + audio scheduler lateness → 0..1 (the scene sheds sparks/stars on its own) ----
setInterval(() => {
  if (document.hidden) return; const { frameMs, quality } = scene.stats();
  const jank = playing ? Math.min(1, Math.max(0, (frameMs - 18) / 40)) : 0, late = playing ? Math.min(1, Math.max(0, (30 - stress.headMs) / 50)) : 0;   // < 30 ms of headroom starts to count, < −20 ms = notes in the past
  const lvl = (stress.level = stress.level * 0.6 + Math.max(jank, late) * 0.4); if (!playing && lvl < 0.005 && $('stress').style.width === '0%') return;
  const col = lvl > 0.7 ? 'var(--bad)' : lvl > 0.4 ? '#fde047' : 'var(--signal-cyan)', word = lvl > 0.7 ? 'overload' : lvl > 0.4 ? 'busy' : quality < 1 ? 'shedding visuals' : 'calm';
  const bar = $('stress'); bar.style.width = `${Math.round(lvl * 100)}%`; bar.style.background = col;
  const sv = $('stress-val'); sv.textContent = `${Math.round(lvl * 100)}% · ${word}`; sv.style.color = col;
  $('stress-val').parentElement.title = `stress ${Math.round(lvl * 100)}% · frame ${frameMs.toFixed(0)} ms · audio headroom ${stress.headMs.toFixed(0)} ms · visuals ${Math.round(quality * 100)}%`;
}, 300);
function readout() {
  poke();
  const sd = m.lane.sound; const sline = `  sound  ${SOUND_KEYS.map(k => `${k} ${Math.round(sd[k] * 100)}`).join('  ')}`;
  const lines = [`tempo ${tempo} bpm   ${playing ? 'playing' : 'stopped'}   kit ${m.kit || 'custom'}   cycle ${m.cycleSteps().toFixed(1)} beats   humanize ${(m.humanize * 100).toFixed(0)}%`, ...m.lanes.map((l, i) => `${i === m.selected ? '▸' : ' '} ${voiceLabel(l).padEnd(7)} len ${String(l.length).padStart(2)}  ×${RATIO_LABEL[l.ratioIndex].padEnd(3)} E${l.euclidK} rot ${l.rotation} swing ${Math.round(l.swing * 100)}% prob ${Math.round(l.prob * 100)}%${l.muted ? '  muted' : ''}${l.solo ? '  solo' : ''}${l.choke >= 0 ? `  chokes ${l.choke + 1}` : ''}`), sline,
    `  slot ${bank.current >= 0 ? bank.current + 1 : '–'}${bank.pending >= 0 ? ` → ${bank.pending + 1} queued` : ''}${bank.chain.length > 1 ? `   chain ${bank.chain.map(i => i + 1).join('·')}` : ''}   ${rec.armed ? 'rec ●' : 'rec ○'}   ${libCurrent && lib.get(libCurrent) ? `setup “${lib.get(libCurrent).name}”   ` : ''}${dice.locked ? `dice ${dice.seed}${dice.repeat > 1 ? `/${dice.repeat}` : ''}   ` : ''}${fill ? 'FILL   ' : ''}${jam.state === 'rec' ? `JAM ${Math.floor(jam.beats)}/${JAM_BEATS}   ` : ''}evolve ${evo.on ? `every ${evo.every} bar${evo.every > 1 ? 's' : ''} ${evo.amount}%${lastEvolve ? ` (${lastEvolve})` : ''}` : 'off'}${pmidi.out ? `   midi → ${pmidi.out.name}${pmidi.clockOut ? ' +clock' : ''}` : ''}${pmidi.follow !== 'off' && pmidi.extBpm ? `   ext ${pmidi.extBpm} bpm` : ''}`];
  $('readout').textContent = lines.join('\n');
}
// ---- layout: the left column lives between the readout (whose height changes) and the bottom-left panel ----
function layoutHud() {
  const hl = $('hud-left'); if (innerWidth <= 1100) { hl.style.top = hl.style.bottom = ''; return; }
  const top = $('readout').getBoundingClientRect().bottom + 12, keysOpen = $('keys-pop').open;
  // while the Move-controls popup is open it floats over the column; size the column against the closed panel
  const blTop = keysOpen ? innerHeight - 18 - $('hud-bl').querySelector('.stress-meter').offsetHeight - 8 - $('keys-pop').querySelector('summary').offsetHeight - 2 : $('hud-bl').getBoundingClientRect().top;
  hl.style.top = `${Math.round(top)}px`; hl.style.bottom = `${Math.round(Math.max(16, innerHeight - blTop + 12))}px`;
}
new ResizeObserver(layoutHud).observe($('readout')); new ResizeObserver(layoutHud).observe($('hud-bl')); addEventListener('resize', layoutHud);
$('keys-pop').addEventListener('toggle', layoutHud);
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('keys-pop').open = false; });
addEventListener('pointerdown', (e) => { const p = $('keys-pop'); if (p.open && !p.contains(e.target)) p.open = false; });
window.__poly = { move, get m() { return m; }, applyTempo, bank, rec, evo, pmidi, liveHit, setRec, setEvolve, recallSlot, saveSlot, chainSlots, editLocks, clock: () => ({ tick, clockRef }), undo, redo, hist, dice, toggleSolo, setFill, assignSample, exportWav, exportMidi, shareLink, renderSlices, sampleBufs, stress, jam, toggleJam, stopJam, downloadJam, exportStems, lib, loadSetup, saveSetup, initPattern, clearLane, randomizeAll, setEvolve };
readout(); scene.start();

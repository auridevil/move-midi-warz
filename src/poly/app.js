import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex } from 'movewire';
import { Machine, RATIOS, RATIO_LABEL, MAX_STEPS, SOUND_KEYS, DEFAULT_SOUND } from './lanes.js';
import { VOICES, VOICE_KEYS } from './voices.js';
import { KITS, KIT_KEYS } from './kits.js';
import { getTempo, setTempo, onTempo, makeTapTempo } from '../tempo.js';
import { makeGauge } from '../gauge.js';

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
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(m)); } catch {} };

// ---- sounds ----
let kit = null, loops = [];
// every lane owns a chain: voice (from the library) → drive → tone filter → pan → level → master (+ send → delay)
function makeKit() {
  const limiter = new T.Limiter(-2).toDestination(); const comp = new T.Compressor({ threshold: -18, ratio: 3 }).connect(limiter);
  const master = new T.Gain(vol).connect(comp);
  const delay = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.3, wet: 1 }).connect(master);
  const chains = m.lanes.map(() => {
    const level = new T.Gain(0.8).connect(master); const send = new T.Gain(0.15).connect(delay); const pan = new T.Panner(0); pan.connect(level); pan.connect(send);
    const tone = new T.Filter({ type: 'lowpass', frequency: 8000, Q: 0.7 }).connect(pan); const drive = new T.Distortion({ distortion: 0, wet: 0 }).connect(tone);
    return { v: null, voice: null, drive, tone, pan, level, send };
  });
  const kit = { master, delay, chains }; m.lanes.forEach((_, i) => { buildVoice(i, kit); applySound(i, kit); }); return kit;
}
/** (Re)build a lane's voice nodes from the library, disposing the previous ones. */
function buildVoice(li, k = kit) {
  if (!k) return; const c = k.chains[li], key = VOICES[m.lanes[li].voice] ? m.lanes[li].voice : 'kick';
  if (c.voice === key && c.v) return;
  if (c.v) for (const n of Object.values(c.v)) { try { n.dispose(); } catch {} }
  c.v = VOICES[key].make(T, c.drive); c.voice = key;
}
/** Push a lane's sound params into its chain (called on every Shift+knob / slider change). */
function applySound(li, k = kit) {
  if (!k) return; const s = m.lanes[li].sound, c = k.chains[li];
  c.drive.distortion = s.drive * 0.9; c.drive.wet.value = s.drive > 0.02 ? 0.3 + s.drive * 0.7 : 0;
  c.tone.frequency.value = 200 * Math.pow(60, s.tone);              // 200 Hz .. 12 kHz
  c.pan.pan.value = s.pan * 2 - 1; c.level.gain.value = s.level * s.level * 1.2; c.send.gain.value = s.send * 0.8;
}
function hitSound(lane, time, accent) {
  const li = m.lanes.indexOf(lane), c = kit.chains[li]; if (!c?.v) return; const s = lane.sound;
  const p = { vel: accent ? 1 : 0.7, tune: lane.tune, dec: 0.04 + s.decay * s.decay * 1.2, snap: s.snap, color: s.color };
  try { VOICES[c.voice].hit(T, c.v, p, time); } catch {}
}
const voiceLabel = (lane) => VOICES[lane.voice]?.label || lane.voice;
function setVoice(li, key) { m.lanes[li].setVoice(key); buildVoice(li); if (awake && !playing) hitSound(m.lanes[li], T.now(), false); sync(); }
function cycleVoice(li, dir) { const i = VOICE_KEYS.indexOf(m.lanes[li].voice); setVoice(li, VOICE_KEYS[((i + dir) % VOICE_KEYS.length + VOICE_KEYS.length) % VOICE_KEYS.length]); }
function applyKit(key) { m.applyKit(KITS[key], DEFAULT_SOUND); m.lanes.forEach((_, i) => { buildVoice(i); applySound(i); }); $('kit-select').value = key; sync(); }
function cycleKit(dir) { const cur = KIT_KEYS.find(k => KITS[k].name === m.kit) ?? KIT_KEYS[0]; const i = KIT_KEYS.indexOf(cur); applyKit(KIT_KEYS[((i + dir) % KIT_KEYS.length + KIT_KEYS.length) % KIT_KEYS.length]); }
const events = []; // for visuals: {lane, index, t, accent}
async function wake() { if (awake) return; await T.start(); kit = makeKit(); awake = true; T.getTransport().bpm.value = tempo; buildLoops(); }
function buildLoops() {
  for (const l of loops) l.dispose(); loops = [];
  m.lanes.forEach((lane, li) => {
    const loop = new T.Loop((time) => {
      const ev = lane.advance();
      if (ev.hit) { const jitter = (Math.random() - 0.5) * m.humanize * 0.03; const off = ev.swung * m.stepSeconds(lane, tempo); hitSound(lane, time + off + Math.max(0, jitter), ev.accent); }
      T.getDraw().schedule(() => { events.push({ lane: li, index: ev.index, hit: ev.hit, accent: ev.accent, t: performance.now() }); if (events.length > 64) events.splice(0, events.length - 64); lane.shown = ev.index; paintLeds(); }, time);
    }, m.stepSeconds(lane, tempo));
    loop.start(0); loops.push(loop);
  });
}
function retime() { if (!awake) return; T.getTransport().bpm.rampTo(tempo, 0.1); m.lanes.forEach((lane, i) => { if (loops[i]) loops[i].interval = m.stepSeconds(lane, tempo); }); kit.delay.delayTime.value = T.Time('8n.').toSeconds(); }
async function togglePlay() {
  await wake(); playing = !playing;
  if (playing) { m.resetAll(); for (const l of loops) l.start(0); T.getTransport().start('+0.05'); } else { T.getTransport().stop(); for (const l of loops) l.stop(); }
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
function buildSliders() {
  const el = $('sliders'); el.innerHTML = '';
  for (const p of PARAMS) { const g = makeGauge({ label: p.label, min: p.min, max: p.max, value: p.get(m.lane), fmt: p.fmt, title: INFO[p.k], onChange: (v) => { p.set(m.lane, v); sync(); } }); sliders[p.k] = g; el.appendChild(g.el); }
  const ge = $('global-sliders'); ge.innerHTML = '';
  sliders.tempo = makeGauge({ label: 'master tempo · knob 8', min: 40, max: 240, value: tempo, fmt: (v) => v + ' bpm', title: INFO.tempo, color: 'var(--ember-magenta)', onChange: (v) => applyTempo(v) }); ge.appendChild(sliders.tempo.el);
  sliders.humanize = makeGauge({ label: 'humanize · wheel', min: 0, max: 100, value: Math.round(m.humanize * 100), fmt: (v) => v + '%', title: INFO.humanize, color: 'var(--nebula-purple)', onChange: (v) => { m.humanize = v / 100; save(); readout(); } }); ge.appendChild(sliders.humanize.el);
  $('param-glossary').innerHTML = Object.entries(INFO).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  const vs = $('voice-select'); vs.innerHTML = ''; for (const k of VOICE_KEYS) vs.add(new Option(VOICES[k].label, k)); vs.onchange = () => setVoice(m.selected, vs.value);
  const ks = $('kit-select'); ks.innerHTML = ''; for (const k of KIT_KEYS) ks.add(new Option(KITS[k].name, k)); ks.onchange = () => applyKit(ks.value);
  const se = $('sound-sliders'); se.innerHTML = '';
  for (const k of SOUND_KEYS) { const g = makeGauge({ label: k, min: 0, max: 100, value: Math.round(m.lane.sound[k] * 100), title: INFO[k], color: 'var(--ember-magenta)', onChange: (v) => { m.lane.setSound(k, v / 100); applySound(m.selected); sync(); } }); sliders['snd:' + k] = g; se.appendChild(g.el); }
}
function sync() {
  for (const p of PARAMS) sliders[p.k].set(p.get(m.lane));
  for (const k of SOUND_KEYS) sliders['snd:' + k].set(Math.round(m.lane.sound[k] * 100));
  sliders.tempo.set(tempo); sliders.humanize.set(Math.round(m.humanize * 100));
  $('lane-name').textContent = `${m.selected + 1} · ${voiceLabel(m.lane)}${m.lane.muted ? ' (muted)' : ''}`; $('voice-select').value = m.lane.voice; const kk = KIT_KEYS.find(k => KITS[k].name === m.kit); if (kk) $('kit-select').value = kk;
  $('lane-drawer').open = true; $('lane-drawer').style.borderColor = LANE_HEX[m.selected]; for (const p of PARAMS) sliders[p.k].setColor(LANE_HEX[m.selected]);
  $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : '';
  renderSteps(); paintLeds(); save(); readout();
}
function nudge(k, delta) { const p = PARAMS.find(x => x.k === k); p.set(m.lane, p.get(m.lane) + delta); sync(); }
function renderSteps() {
  const el = $('stepsui'); el.innerHTML = ''; const lane = m.lane;
  for (let i = 0; i < MAX_STEPS; i++) { const d = document.createElement('div'); d.className = `st ${i >= lane.length ? 'off' : lane.hitAt(i) ? (lane.accentAt(i) ? 'acc' : 'on') : ''}`; d.onclick = (e) => { if (e.shiftKey) lane.toggleAccent(lane.stepIndex(i)); else lane.toggle(lane.stepIndex(i)); sync(); }; el.appendChild(d); }
}
buildSliders(); sync();

// ---- Move ----
const LANE_LED = LANE_HEX.map(nearestPaletteIndex), LANE_DIM = [24, 16, 30, 34];
function paintLeds() {
  if (!move.inControl) return;
  m.lanes.forEach((lane, r) => {
    for (let c = 0; c < 8; c++) { const i = c; const pad = r * 8 + c; let col = 0; if (i < lane.length) { col = lane.hitAt(i) ? (lane.accentAt(i) ? COLOR.WHITE : LANE_LED[r]) : LANE_DIM[r]; if (playing && lane.shown === i) col = lane.hitAt(i) ? COLOR.WHITE : 120; } move.setPadColor(pad, lane.muted ? (col ? LANE_DIM[r] : 0) : col); }
  });
  const lane = m.lane;
  for (let i = 0; i < MAX_STEPS; i++) move.setStepColor(i, i >= lane.length ? 0 : (playing && lane.shown === i) ? COLOR.WHITE : lane.hitAt(i) ? LANE_LED[m.selected] : LANE_DIM[m.selected]);
  for (let t = 1; t <= 4; t++) { const li = 4 - t; move.setButtonColor(`track${t}`, li === m.selected ? COLOR.WHITE : LANE_DIM[li]); }
  move.setButtonColor('play', playing ? COLOR.WHITE : nearestPaletteIndex('#67e8f9')); move.setButtonColor('mute', lane.muted ? COLOR.WHITE : 0); move.setButtonColor('capture', LANE_LED[0]); move.setButtonColor('undo', LANE_LED[3]); move.setButtonColor('record', nearestPaletteIndex('#fb7185')); move.setButtonColor('left', LANE_DIM[m.selected]); move.setButtonColor('right', LANE_DIM[m.selected]);
}
move.addEventListener('pad', (e) => { if (!e.detail.on) return; const { row, col } = e.detail; const lane = m.lanes[row]; if (col >= lane.length) return; if (shift) lane.toggleAccent(lane.stepIndex(col)); else lane.toggle(lane.stepIndex(col)); if (!awake) wake(); if (awake && !playing) hitSound(lane, T.now(), false); m.select(row); sync(); });
move.addEventListener('step', (e) => { if (!e.detail.on) return; const lane = m.lane; if (e.detail.index >= lane.length) return; if (shift) lane.toggleAccent(lane.stepIndex(e.detail.index)); else lane.toggle(lane.stepIndex(e.detail.index)); sync(); });
move.addEventListener('encoder', (e) => {
  const { index, delta } = e.detail;
  if (shift) { const k = SOUND_KEYS[index]; m.lane.setSound(k, m.lane.sound[k] + delta * 0.02); applySound(m.selected); if (awake && !playing) hitSound(m.lane, T.now(), false); sync(); return; }
  const keys = ['length', 'euclid', 'rotation', 'ratio', 'swing', 'prob', 'tune']; if (index === 7) applyTempo(tempo + delta); else nudge(keys[index], delta * (index >= 4 ? 2 : 1));
});
move.addEventListener('wheel', (e) => { m.humanize = Math.max(0, Math.min(1, m.humanize + e.detail.delta * 0.03)); sliders.humanize?.set(Math.round(m.humanize * 100)); readout(); save(); });
move.addEventListener('volume', (e) => { vol = Math.max(0, Math.min(1, vol + e.detail.delta * 0.02)); kit?.master.gain.rampTo(vol, 0.05); });
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; $('shift-ind').textContent = shift ? 'shift held: knobs sculpt the sound' : ''; return; } if (!pressed) return;
  const tr = /^track(\d)$/.exec(name); if (tr) { m.select(4 - +tr[1]); sync(); return; }   // track 1 is the top button = top pad row = lane 3
  if (name === 'play') togglePlay(); if (name === 'mute') { m.lane.muted = !m.lane.muted; sync(); } if (name === 'capture') { m.randomize(); sync(); } if (name === 'undo') { m.lane.clear(); sync(); } if (name === 'record') tapTempo();
  if (name === 'left' || name === 'right') { const dir = name === 'right' ? 1 : -1; if (shift) cycleKit(dir); else cycleVoice(m.selected, dir); }
});
$('btn-random').onclick = () => { m.randomize(); sync(); }; $('btn-clear').onclick = () => { m.lane.clear(); sync(); }; $('btn-reset').onclick = () => { m.resetAll(); };
const KEYS = ['12345678', 'qwertyui', 'asdfghjk', 'zxcvbnm,'];
window.addEventListener('keydown', (e) => {
  if (e.repeat || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if (/^[1-4]$/.test(e.key) && e.altKey) { m.select(+e.key - 1); sync(); return; }
  const r = KEYS.findIndex(k => k.includes(e.key.toLowerCase())); if (r < 0) return;
  const row = 3 - r, col = KEYS[r].indexOf(e.key.toLowerCase()); const lane = m.lanes[row]; if (col >= lane.length) return;
  if (e.shiftKey) lane.toggleAccent(lane.stepIndex(col)); else lane.toggle(lane.stepIndex(col)); m.select(row); sync();
});

// ---- Move connection ----
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
$('btn-connect').onclick = async () => {
  try {
    await wake(); const { inputs } = await midi.init(); const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn'); const { identity } = await move.connect(); paintLeds();
    setPill(`Move: ready${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''}`, 'pill-on'); $('btn-disconnect').disabled = false;
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); }
};
$('btn-disconnect').onclick = () => { move.disconnect(); setPill('Move: disconnected (back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---- visuals: concentric orbits, one ring per lane, each turning at its own speed ----
const cv = $('cv'), ctx = cv.getContext('2d'); const DPR = Math.min(1.5, devicePixelRatio || 1);
function resize() { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize); resize();
cv.addEventListener('click', (e) => { const cx = innerWidth * 0.5, cy = innerHeight * 0.56, R = Math.min(innerWidth, innerHeight) * 0.42; const d = Math.hypot(e.clientX - cx, e.clientY - cy) / R; const ring = Math.round((d - 0.25) / 0.2); if (ring >= 0 && ring < 4) { m.select(ring); sync(); } });
function draw() {
  ctx.fillStyle = 'rgba(14, 10, 32, 0.28)'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  const cx = innerWidth * 0.5, cy = innerHeight * 0.56, R = Math.min(innerWidth, innerHeight) * 0.42, now = performance.now();
  m.lanes.forEach((lane, li) => {
    const r = R * (0.25 + li * 0.2), sel = li === m.selected;
    ctx.strokeStyle = sel ? LANE_HEX[li] + 'aa' : 'rgba(236,233,247,.14)'; ctx.lineWidth = sel ? 1.5 : 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < lane.length; i++) {
      const a = (i / lane.length) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const hit = lane.hitAt(i), acc = lane.accentAt(i), cur = playing && lane.shown === i;
      ctx.fillStyle = hit ? (lane.muted ? 'rgba(236,233,247,.25)' : LANE_HEX[li]) : 'rgba(236,233,247,.18)'; ctx.beginPath(); ctx.arc(x, y, hit ? (acc ? 9 : 6.5) : 3, 0, Math.PI * 2); ctx.fill();
      if (cur) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); }
    }
    // label on the ring's lower-right diagonal so the four never overlap
    const la = Math.PI / 4 + li * 0.12; ctx.fillStyle = sel ? LANE_HEX[li] : 'rgba(236,233,247,.45)'; ctx.font = '11px "Major Mono Display", monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${voiceLabel(lane)} ${lane.length} ×${RATIO_LABEL[lane.ratioIndex]}${lane.muted ? ' m' : ''}`, cx + Math.cos(la) * (r + 14), cy + Math.sin(la) * (r + 14) + 4);
  });
  for (const ev of events) { const age = (now - ev.t) / 500; if (age > 1 || !ev.hit) continue; const lane = m.lanes[ev.lane], r = R * (0.25 + ev.lane * 0.2), a = (ev.index / lane.length) * Math.PI * 2 - Math.PI / 2; ctx.strokeStyle = LANE_HEX[ev.lane]; ctx.globalAlpha = 1 - age; ctx.lineWidth = ev.accent ? 3 : 1.5; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 8 + age * 26, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  requestAnimationFrame(draw);
}
function readout() {
  const sd = m.lane.sound; const sline = `  sound  ${SOUND_KEYS.map(k => `${k} ${Math.round(sd[k] * 100)}`).join('  ')}`;
  const lines = [`tempo ${tempo} bpm   ${playing ? 'playing' : 'stopped'}   kit ${m.kit || 'custom'}   cycle ${m.cycleSteps().toFixed(1)} beats   humanize ${(m.humanize * 100).toFixed(0)}%`, ...m.lanes.map((l, i) => `${i === m.selected ? '▸' : ' '} ${voiceLabel(l).padEnd(7)} len ${String(l.length).padStart(2)}  ×${RATIO_LABEL[l.ratioIndex].padEnd(3)} E${l.euclidK} rot ${l.rotation} swing ${Math.round(l.swing * 100)}% prob ${Math.round(l.prob * 100)}%${l.muted ? '  muted' : ''}`), sline];
  $('readout').textContent = lines.join('\n');
}
window.__poly = { move, m, applyTempo };
readout(); draw();

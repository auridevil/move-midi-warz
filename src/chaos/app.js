import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex, padRowCol } from 'movewire';
import { Field, N, COLS, ROWS } from './field.js';
import { Voices } from './voices.js';
import { frameLoop } from '../frames.js';
import { getTempo, setTempo, onTempo, makeTapTempo } from '../tempo.js';

const $ = (id) => document.getElementById(id);
const T = window.Tone;
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));
const field = new Field();
let voices = null, awake = false, auto = false, frozen = false, shift = false;
const PARAM_KEYS = ['entropy', 'diffusion', 'decay', 'density', 'morph', 'crush', 'space', 'arp'];
const PARAM_LABEL = { entropy: 'entropy', diffusion: 'diffusion', decay: 'decay', density: 'density', morph: 'morph', crush: 'crush', space: 'space', arp: 'arp' };
const KNOB_KEYS = ['entropy', 'diffusion', 'decay', 'density', 'morph', 'crush', 'space', 'tempo'];
let tempo = getTempo(112);

// ---- audio ----
async function wake() {
  if (awake) return; await T.start(); voices = new Voices(T); awake = true;
  T.getTransport().bpm.value = tempo;
  T.getTransport().scheduleRepeat((time) => tick(time), '16n'); T.getTransport().start();
  voices.apply(field.params); voices.syncTempo(); $('btn-audio').textContent = '⏻ engine awake'; $('btn-audio').disabled = true;
}
// ---- master tempo: shared with the other pages; ticks, arp, delay and filter LFO all follow it ----
function applyTempo(bpm, publish = true) {
  tempo = bpm; if (publish) setTempo(bpm, 'chaos');
  if (awake) { T.getTransport().bpm.rampTo(bpm, 0.15); setTimeout(() => voices?.syncTempo(), 200); }
  const sl = document.getElementById('tempo'); if (sl) sl.value = bpm; const tv = document.getElementById('tempo-val'); if (tv) tv.textContent = bpm;
}
onTempo((bpm, source) => { if (source !== 'chaos') applyTempo(bpm, false); });
const tap = makeTapTempo();
function tapTempo() { const bpm = tap(); if (bpm) applyTempo(bpm); }
$('btn-tap').onclick = tapTempo;
$('btn-audio').onclick = wake;
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (!awake) wake(); }, { once: true });

const fires = []; // recent fires for the visuals: {cell, t, note, vel}

// ---- stress meter: main-thread jank, audio scheduling lateness, voice load → 0..1, with automatic throttling ----
const stress = { frameMs: 16, headMs: 100, voices: 0, level: 0, maxFires: 8, drawEvery: 1, dropped: 0 };
function updateStress() {
  const jank = Math.min(1, Math.max(0, (stress.frameMs - 18) / 40));       // 18 ms fine, 58 ms = 1
  const late = Math.min(1, Math.max(0, (30 - stress.headMs) / 50));       // < 30 ms of audio headroom starts to count, < −20 ms (notes in the past) = 1
  const load = voices ? Math.min(1, voices.activeVoices() / voices.capacity()) : 0;
  stress.voices = voices ? voices.activeVoices() : 0;
  stress.level = stress.level * 0.85 + Math.max(jank, late, load * 0.8) * 0.15;   // smoothed
  stress.maxFires = stress.level > 0.75 ? 2 : stress.level > 0.5 ? 4 : stress.level > 0.3 ? 6 : 8;
  stress.drawEvery = stress.level > 0.6 ? 3 : stress.level > 0.35 ? 2 : 1;
}
function tick(time) {
  if (frozen) return;
  if (auto && Math.random() < 0.08) field.inject(Math.floor(Math.random() * N), 0.6 + Math.random() * 0.6);
  // headroom = how far ahead of the speakers this tick is scheduled. (T.now() − time sat at 0–50 ms in normal running, Tone's update interval,
  // so the old 'lateness' idled the meter at 25–40 %.)
  stress.headMs = stress.headMs * 0.8 + (time - T.getContext().rawContext.currentTime) * 1000 * 0.2;
  let out = field.step();
  if (out.length > stress.maxFires) { out.sort((a, b) => b.vel - a.vel); stress.dropped += out.length - stress.maxFires; out = out.slice(0, stress.maxFires); }
  for (const f of out) { if (voices.play(f, time)) fires.push({ ...f, t: performance.now() }); else stress.dropped++; }
  arpTick(time);
  updateStress();
  if (fires.length > 200) fires.splice(0, fires.length - 200);
  paintLeds();
}
// ---- arpeggiator: runs through the charged cells' notes, deterministic on top of the chance fires ----
let arpI = 0, arpDir = 1;
function arpTick(time) {
  const a = field.params.arp; if (a <= 0.02) return;
  const notes = field.arpNotes(); if (!notes.length) return;
  const every = a < 0.34 ? 4 : a < 0.67 ? 2 : 1;          // 4n / 8n / 16n
  if (field.tick % every !== 0) return;
  const span = Math.max(1, notes.length * 2 - 2); const k = arpI % span; const idx = k < notes.length ? k : span - k; arpI++;
  let note = notes[idx]; if (a > 0.8 && (arpI % 8) < 3) note += 12;
  const family = a > 0.6 ? 'fm' : 'pluck';
  voices.play({ note, vel: 0.35 + a * 0.45, family }, time);
  fires.push({ cell: -1, note, t: performance.now(), arp: true });
}
function setParam(k, v) {
  field.params[k] = Math.min(1, Math.max(0, v)); if (voices) voices.apply(field.params);
  const s = sliders[k]; if (s) s.value = Math.round(field.params[k] * 100);
}
function mutateAll() { for (const k of PARAM_KEYS) setParam(k, Math.random()); field.scale = field.scale; field.mutate(); }

// ---- Move ----
// hand-picked Move palette entries per row (the palette is coarse, nearest-colour lookups land on odd hues):
// base is always lit so the field is visible at rest; energy pushes to the bright entry; a fire flashes white.
const ROW_BASE = [24, 34, 16, 30];   // #852178 magenta · #624bad purple · #31adff blue-cyan · #90821f olive
const ROW_BRIGHT = [52, 50, 46, 7];  // #ef8bb0 pink · #bbaaf2 lavender · #80f3ff cyan · #fadc3b yellow
function paintLeds() {
  if (!move.inControl) return;
  for (let i = 0; i < N; i++) {
    const e = field.energy[i], r = Math.floor(i / COLS);
    const fired = field.lastFires.some(f => f.cell === i);
    move.setPadColor(i, fired ? COLOR.WHITE : (field.pinned.has(i) || e > 0.35) ? ROW_BRIGHT[r] : ROW_BASE[r]);
  }
  for (let s = 0; s < 16; s++) move.setStepColor(s, field.gate[s] ? (s === field.tick % 16 ? COLOR.WHITE : nearestPaletteIndex('#67e8f9')) : 0);
  move.setButtonColor('play', auto ? COLOR.WHITE : nearestPaletteIndex('#67e8f9')); move.setButtonColor('mute', frozen ? COLOR.WHITE : 0); move.setButtonColor('capture', nearestPaletteIndex('#f0abfc')); move.setButtonColor('undo', nearestPaletteIndex('#a78bfa')); move.setButtonColor('record', field.tick % 4 === 0 ? COLOR.WHITE : nearestPaletteIndex('#fb7185'));
  move.setButtonColor('left', field.octave < 0 ? COLOR.WHITE : nearestPaletteIndex('#a78bfa')); move.setButtonColor('right', field.octave > 0 ? COLOR.WHITE : nearestPaletteIndex('#a78bfa'));
}
function padHit(i, velocity) {
  if (!awake) wake();
  if (shift) field.pin(i); else field.inject(i, 0.5 + velocity / 127);
  if (voices) voices.play({ note: field.noteFor(i, true), vel: 0.4 + (velocity / 127) * 0.6, family: field.familyFor(i, true) }, T.now()); // a tap always answers
  fires.push({ cell: i, t: performance.now(), note: 0, vel: velocity / 127, hit: true }); if (move.inControl) move.setPadColor(i, COLOR.WHITE);
}
move.addEventListener('pad', (e) => { if (e.detail.on) padHit(e.detail.index, e.detail.velocity); });
move.addEventListener('step', (e) => { if (e.detail.on) { field.gate[e.detail.index] = field.gate[e.detail.index] ? 0 : 1; paintLeds(); } });
move.addEventListener('encoder', (e) => { const { index, delta } = e.detail; const k = KNOB_KEYS[index]; if (k === 'tempo') applyTempo(tempo + delta); else setParam(k, field.params[k] + delta * 0.02); });
move.addEventListener('wheel', (e) => { if (shift) field.drift = Math.max(-12, Math.min(12, field.drift + e.detail.delta)); else setParam('arp', field.params.arp + e.detail.delta * 0.03); });
move.addEventListener('volume', (e) => { vol = Math.min(1, Math.max(0, vol + e.detail.delta * 0.02)); voices?.setVolume(vol); });
let vol = 0.7;
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; return; } if (!pressed) return;
  if (name === 'play') toggleAuto(); if (name === 'mute') toggleFreeze(); if (name === 'capture') mutateAll(); if (name === 'undo') field.reset();
  if (name === 'left') setOctave(field.octave - 1); if (name === 'right') setOctave(field.octave + 1); if (name === 'record') tapTempo();
  paintLeds();
});
function setOctave(o) { field.setOctave(o); $('octave').value = field.octave; $('octave-val').textContent = (field.octave > 0 ? '+' : '') + field.octave; if (move.inControl) { move.setButtonColor('left', field.octave < 0 ? COLOR.WHITE : nearestPaletteIndex('#a78bfa')); move.setButtonColor('right', field.octave > 0 ? COLOR.WHITE : nearestPaletteIndex('#a78bfa')); } }
function toggleAuto() { auto = !auto; $('btn-auto').textContent = auto ? 'auto ●' : 'auto ◌'; }
function toggleFreeze() { frozen = !frozen; $('btn-freeze').textContent = frozen ? 'frozen' : 'freeze'; }
$('btn-seed').onclick = () => { for (let k = 0; k < 4; k++) field.inject(Math.floor(Math.random() * N), 1); };
$('btn-auto').onclick = toggleAuto; $('btn-freeze').onclick = toggleFreeze; $('btn-mutate').onclick = mutateAll; $('btn-reset').onclick = () => field.reset();
const KEYS = ['12345678', 'qwertyui', 'asdfghjk', 'zxcvbnm,'];
window.addEventListener('keydown', (e) => { if (e.repeat || ['INPUT', 'SELECT'].includes(e.target.tagName)) return; const r = KEYS.findIndex(k => k.includes(e.key.toLowerCase())); if (r >= 0) { shift = e.shiftKey; padHit((3 - r) * COLS + KEYS[r].indexOf(e.key.toLowerCase()), 100); shift = false; } if (e.key === ' ') { e.preventDefault(); toggleAuto(); } if (e.key === '[') setOctave(field.octave - 1); if (e.key === ']') setOctave(field.octave + 1); });

// ---- sliders (no Move) ----
const sliders = {};
for (const k of PARAM_KEYS) {
  const l = document.createElement('label'); l.innerHTML = `${PARAM_LABEL[k]} <input type="range" min="0" max="100" value="${Math.round(field.params[k] * 100)}" />`;
  const inp = l.querySelector('input'); inp.oninput = () => setParam(k, +inp.value / 100); sliders[k] = inp; $('sliders').appendChild(l);
}
{ const l = document.createElement('label'); l.innerHTML = `tempo <span id="tempo-val">${tempo}</span> <input id="tempo" type="range" min="40" max="240" step="1" value="${tempo}" />`; $('sliders').appendChild(l); $('tempo').oninput = () => applyTempo(+$('tempo').value); }
{ const l = document.createElement('label'); l.innerHTML = `octave <span id="octave-val">0</span> <input id="octave" type="range" min="-3" max="3" step="1" value="0" />`; $('sliders').appendChild(l); $('octave').oninput = () => setOctave(+$('octave').value); }

// ---- Move connection ----
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
$('btn-connect').onclick = async () => {
  try {
    await wake();
    const { inputs } = await midi.init(); const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn');
    const { identity } = await move.connect(); paintLeds();
    setPill(`Move: ready${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''}`, 'pill-on'); $('btn-disconnect').disabled = false;
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); }
};
$('btn-disconnect').onclick = () => { move.disconnect(); setPill('Move: disconnected (back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---- the weird interface: a living field on canvas + glitching readout ----
const cv = $('cv'), ctx = cv.getContext('2d');
const DPR = Math.min(1.5, devicePixelRatio || 1);
function resize() { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize); resize();
const HUE = ['#f0abfc', '#a78bfa', '#67e8f9', '#fde047'];
const GLYPHS = '∴∵∷⋮⋯◌◍◎●◐◑◒◓◔◕⊕⊗⊙⊚⊛⌀∞≈≋⟁⟐';
let frame = 0, lastFrameT = performance.now();
function cellXY(i) { const { row, col } = padRowCol(i); const W = innerWidth, H = innerHeight; const gx = W * 0.5, gy = H * 0.56, sx = Math.min(W * 0.8 / 8, H * 0.5 / 4); return { x: gx + (col - 3.5) * sx, y: gy - (row - 1.5) * sx, s: sx }; }
function draw() {
  frame++;
  const now = performance.now(); stress.frameMs = stress.frameMs * 0.9 + (now - lastFrameT) * 0.1; lastFrameT = now;
  if (frame % stress.drawEvery !== 0) return;          // shed frames when stressed
  ctx.fillStyle = 'rgba(14, 10, 32, 0.18)'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  // links between cells that fired together
  ctx.lineWidth = 1;
  for (let a = fires.length - 1; a >= Math.max(0, fires.length - 12); a--) for (let b = a - 1; b >= Math.max(0, fires.length - 12); b--) {
    const fa = fires[a], fb = fires[b]; if (fa.cell < 0 || fb.cell < 0 || Math.abs(fa.t - fb.t) > 40) continue; const A = cellXY(fa.cell), B = cellXY(fb.cell); const age = (now - fa.t) / 900; if (age > 1) continue;
    ctx.strokeStyle = `rgba(236,233,247,${0.5 * (1 - age)})`; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  }
  // cells as breathing blobs
  for (let i = 0; i < N; i++) {
    const e = field.energy[i], { x, y, s } = cellXY(i), r = Math.floor(i / COLS);
    const wob = Math.sin(frame * 0.03 + i) * 2, rad = 4 + Math.min(1.5, e) * s * 0.42 + wob;
    if (e < 0.04) { ctx.globalAlpha = 0.18; ctx.fillStyle = HUE[r]; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }   // cold cell: flat dot, no gradient
    else { const g = ctx.createRadialGradient(x, y, 0, x, y, rad + 14); g.addColorStop(0, HUE[r]); g.addColorStop(0.6, HUE[r] + '55'); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.15 + Math.min(1, e) * 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad + 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (field.pinned.has(i)) { ctx.strokeStyle = HUE[r]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, s * 0.46, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = 'rgba(236,233,247,.35)'; ctx.font = `${Math.max(9, s * 0.16)}px "Major Mono Display", monospace`; ctx.textAlign = 'center'; ctx.fillText(GLYPHS[(i * 7 + (field.tick >> 2)) % GLYPHS.length], x, y + 4);
  }
  // rings for fires
  for (const f of fires) { const age = (now - f.t) / 700; if (age > 1 || f.cell < 0) continue; const { x, y, s } = cellXY(f.cell); ctx.strokeStyle = `rgba(236,233,247,${(1 - age) * 0.9})`; ctx.lineWidth = f.hit ? 3 : 1.5; ctx.beginPath(); ctx.arc(x, y, s * 0.2 + age * s * 0.9, 0, Math.PI * 2); ctx.stroke(); }
  // gate ring under the field
  for (let st = 0; st < 16; st++) { const a = (st / 16) * Math.PI * 2 - Math.PI / 2, R = Math.min(innerWidth, innerHeight) * 0.46, cx = innerWidth * 0.5, cy = innerHeight * 0.56; ctx.fillStyle = field.gate[st] ? (st === field.tick % 16 ? '#fff' : 'rgba(103,232,249,.7)') : 'rgba(236,233,247,.12)'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, st === field.tick % 16 ? 5 : 3, 0, Math.PI * 2); ctx.fill(); }
  if (frame % 6 === 0) readout();
}
function readout() {
  const p = field.params; const glitch = (s) => s.replace(/[a-z0-9]/g, (c) => (Math.random() < 0.015 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : c));
  const bar = (v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor(v * 8))].repeat(1) + '·'.repeat(0);
  const lines = [
    `tempo ${String(tempo).padStart(3)} bpm   energy ${field.totalEnergy().toFixed(2).padStart(6)}   tick ${String(field.tick).padStart(6)}   ${awake ? (frozen ? 'frozen' : auto ? 'auto-seeding' : 'listening') : 'asleep'}`,
    `stress ${'█'.repeat(Math.round(stress.level * 10)).padEnd(10, '·')} ${(stress.level * 100).toFixed(0).padStart(3)}%   frame ${stress.frameMs.toFixed(0).padStart(3)} ms   headroom ${stress.headMs.toFixed(0).padStart(3)} ms   voices ${String(stress.voices).padStart(2)}   ${stress.maxFires < 8 ? `throttling → ${stress.maxFires} fires/tick${stress.drawEvery > 1 ? `, ${stress.drawEvery}× frame skip` : ''}` : 'headroom ok'}   dropped ${stress.dropped}`,
    ...PARAM_KEYS.map(k => `${PARAM_LABEL[k].padEnd(10)} ${bar(p[k])} ${p[k].toFixed(2)}`),
    `scale ${field.scale.join(' ')}   octave ${field.octave > 0 ? '+' : ''}${field.octave}   drift ${field.drift > 0 ? '+' : ''}${field.drift}   pinned ${field.pinned.size}`,
    `last  ${field.lastFires.slice(0, 5).map(f => `${f.family[0]}${f.note}`).join(' ') || '∅'}   arp ${field.arpNotes().join(' ') || '∅'}`,
  ];
  $('readout').textContent = glitch(lines.join('\n'));
  const m = $('stress'), col = stress.level > 0.7 ? 'var(--bad)' : stress.level > 0.4 ? '#fde047' : 'var(--signal-cyan)'; m.style.width = `${Math.round(stress.level * 100)}%`; m.style.background = col;
  const word = stress.level > 0.7 ? 'overload' : stress.level > 0.4 ? 'busy' : stress.maxFires < 8 ? 'throttling' : 'calm';
  const sv = $('stress-val'); sv.textContent = `${Math.round(stress.level * 100)}% · ${word}`; sv.style.color = col;
}
frameLoop(draw);

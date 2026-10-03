import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex } from 'movewire';
import { Engine, FX, LAYOUT } from './engine.js';
import { detectTempo, mono, barStep } from './beats.js';
import { renderDemo, DEMO } from './demo.js';
import { encodeWav, joinChunks } from './wav.js';
import { getTempo, onTempo } from '../tempo.js';
import { makeGauge } from '../gauge.js';
import { frameLoop } from '../frames.js';
import { putSample, SLICES_KEY, SLICES_PING } from '../samples.js';

const $ = (id) => document.getElementById(id);
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const eng = new Engine(ctx);
const ROW_HEX = ['#67e8f9', '#fde047', '#a78bfa', '#f0abfc'];          // layout rows, top → bottom
const ROW_LED = ROW_HEX.map(h => nearestPaletteIndex(h));
const ROW_DIM = ['#164a52', '#4d4410', '#352a5c', '#4f2753'].map(h => nearestPaletteIndex(h));
const QUANTS = [[0.25, '1/16'], [0.5, '1/8'], [1, '1/4'], [0, 'off']];
const LOOPS = [[0, 'off'], [1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16']];
const KEYS = ['12345678', 'qwertyui', 'asdfghjk', 'zxcvbnm,'];

// ---------------- state, saved per browser in IndexedDB (the track itself too) ----------------
let st = { name: null, demo: false, bpm: 120, offset: 0, quant: 0.25, loopBars: 0, sync: false, knobs: { filter: 0, res: 10, crush: 0, echo: 0, feedback: 45, wash: 0, pitch: 0, mix: 100, volume: 85 } };
let bytes = null, peaks = null, master = getTempo(120);
const DB = 'midi-warz-unassembler';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function dbPut(key, val) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch {} }
async function dbGet(key) { try { const db = await idb(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch { return null; } }
let saveTimer = null; const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => dbPut('state', st), 300); };

// ---------------- loading ----------------
async function loadBuffer(buffer, name, { detect = true, demo = false } = {}) {
  eng.load(buffer); st.name = name; st.demo = demo;
  if (detect) { $('track-info').textContent = 'finding the beat…'; await new Promise(r => setTimeout(r, 20)); const d = detectTempo(mono(buffer), buffer.sampleRate); st.bpm = d.bpm; st.offset = d.offset; st.conf = d.confidence; }
  eng.grid = { bpm: st.bpm, offset: st.offset }; eng.anchors = [{ t: ctx.currentTime, pos: st.offset, rate: eng.rate }];
  peaks = overviewPeaks(buffer); applyRate(); applyKnobs(); if (st.loopBars) eng.setLoop(st.loopBars);
  syncUi(); save();
}
async function loadFile(file) {
  try {
    $('track-name').textContent = file.name; $('track-info').textContent = 'decoding…';
    const ab = await file.arrayBuffer(); bytes = ab.slice(0); const buffer = await ctx.decodeAudioData(ab);
    st.loopBars = 0; await loadBuffer(buffer, file.name); dbPut('track', { name: file.name, bytes });
  } catch (e) { $('track-info').textContent = `Could not read that file: ${e.message || e}`; }
}
async function loadDemo() {
  $('track-name').textContent = DEMO.name; $('track-info').textContent = 'rendering…';
  const buf = await renderDemo(ctx.sampleRate); st.bpm = DEMO.bpm; st.offset = 0; st.conf = 1; st.loopBars = 0;
  await loadBuffer(toCtxBuffer(buf), DEMO.name, { detect: false, demo: true }); dbPut('track', { name: DEMO.name, demo: true });
}
const toCtxBuffer = (b) => { const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c), c); return out; };
$('file').onchange = () => { const f = $('file').files[0]; if (f) loadFile(f); };
$('btn-demo').onclick = () => { wake(); loadDemo(); };
for (const ev of ['dragenter', 'dragover']) window.addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('over'); });
for (const ev of ['dragleave', 'drop']) window.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'dragleave' && e.relatedTarget) return; $('drop').classList.remove('over'); });
window.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('audio') || /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(f.name)); if (f) { wake(); loadFile(f); } });

// ---------------- audio out (+ recorder) ----------------
let rec = null, recording = false, chunks = [];
async function setupOut() {
  try { await ctx.audioWorklet.addModule(new URL('./rec-worklet.js', import.meta.url)); rec = new AudioWorkletNode(ctx, 'unasm-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }); rec.port.onmessage = (e) => chunks.push(e.data); eng.output.connect(rec).connect(ctx.destination); }
  catch { eng.output.connect(ctx.destination); rec = null; }
}
const ready = setupOut();
const wake = () => { if (ctx.state !== 'running') ctx.resume(); };
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, wake, { once: true });
function toggleRec() {
  if (!rec) { $('track-info').textContent = 'Recording needs AudioWorklet (Chrome/Edge).'; return; }
  wake(); recording = !recording; rec.port.postMessage(recording ? 'start' : 'stop');
  if (recording) chunks = [];
  else if (chunks.length) {
    const wav = encodeWav(joinChunks(chunks), ctx.sampleRate); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, ''); a.download = `unassembler-${(st.name || 'take').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40)}-${stamp}.wav`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  syncUi(); paintLeds();
}
$('btn-rec').onclick = toggleRec;
// hand the 8 slices of the current loop (or bar) to Orbits through the shared sample store
$('btn-to-orbits').onclick = async () => {
  const b = eng.buffer; if (!b) { $('track-info').textContent = 'load a track first'; return; }
  // same region the slice pads use: the loop, else the bar under the playhead
  const r = eng.loop || eng.barRegion(), sr = b.sampleRate, a = Math.floor(r.start * sr), n = Math.floor((r.end - r.start) * sr / 8);
  const chans = Array.from({ length: Math.min(2, b.numberOfChannels) }, (_, c) => b.getChannelData(c));
  const slices = Array.from({ length: 8 }, (_, k) => chans.map(d => d.slice(a + k * n, a + (k + 1) * n)));
  await putSample(SLICES_KEY, { name: st.name || 'track', sampleRate: sr, slices }); try { localStorage.setItem(SLICES_PING, String(Date.now())); } catch {}
  $('track-info').textContent = `8 slices of ${(r.end - r.start).toFixed(2)} s sent: in Orbits they appear as tiles in a lane's sample row`;
};

// ---------------- grid, loop, tempo ----------------
const applyRate = () => eng.setRate((st.sync ? master / st.bpm : 1) * 2 ** (st.knobs.pitch / 12));
function setGrid(patch) { Object.assign(st, patch); st.bpm = Math.max(40, Math.min(250, Math.round(st.bpm * 10) / 10)); const bar = 240 / st.bpm; st.offset = ((st.offset % bar) + bar) % bar; eng.grid = { bpm: st.bpm, offset: st.offset }; applyRate(); if (st.loopBars) eng.setLoop(st.loopBars); syncUi(); save(); }
$('bpm').onchange = () => setGrid({ bpm: +$('bpm').value || st.bpm });
$('bpm-half').onclick = () => setGrid({ bpm: st.bpm / 2 });
$('bpm-double').onclick = () => setGrid({ bpm: st.bpm * 2 });
let taps = []; $('bpm-tap').onclick = () => { const now = performance.now(); taps = taps.filter(t => now - t < 2500); taps.push(now); if (taps.length >= 3) setGrid({ bpm: 60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)) }); };
const nudge = (d) => (e) => setGrid({ offset: st.offset + (e.shiftKey ? d * 100 * 60 / st.bpm : d) });
$('off-dn').onclick = nudge(-0.01); $('off-up').onclick = nudge(0.01);
$('off-reset').onclick = () => setGrid({ offset: eng.posAt() });
const segs = {
  quant: seg($('quant'), QUANTS, (v) => { st.quant = v; eng.quant = v; syncUi(); save(); }),
  loop: seg($('loop'), LOOPS, (v) => setLoop(v)),
};
function setLoop(bars) { st.loopBars = bars; eng.setLoop(bars || null); syncUi(); save(); }
$('sync').onchange = () => { st.sync = $('sync').checked; applyRate(); syncUi(); save(); };
onTempo((bpm) => { master = bpm; if (st.sync) applyRate(); syncUi(); });
function seg(el, items, onPick) { const btns = items.map(([v, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => onPick(v); el.append(b); return [v, b]; }); return { set: (val) => btns.forEach(([v, b]) => b.classList.toggle('on', v === val)) }; }

// ---------------- knobs ----------------
const KNOBS = [
  { k: 'filter', label: 'filter', min: -100, max: 100, fmt: (v) => (v < 0 ? `LP ${-v}` : v > 0 ? `HP ${v}` : 'open'), title: 'Left: low-pass closes. Right: high-pass opens. Middle: off.' },
  { k: 'res', label: 'resonance', title: 'Filter resonance.' },
  { k: 'crush', label: 'crush', title: 'Bit-crush, always on (the bitcrush pad pushes it further).' },
  { k: 'echo', label: 'echo', title: 'Dotted-eighth echo send, always on (echo throw pushes it).' },
  { k: 'feedback', label: 'feedback', max: 95, title: 'How long the echoes go on.' },
  { k: 'wash', label: 'wash', title: 'Reverb send, always on.' },
  { k: 'pitch', label: 'pitch', min: -12, max: 12, fmt: (v) => (v > 0 ? `+${v}` : `${v}`), title: 'Tape speed in semitones: faster and higher, or slower and lower.' },
  { k: 'mix', label: 'dry/wet', fmt: (v) => (v === 100 ? 'wet' : v === 0 ? 'dry' : `${v}%`), title: 'How much of the effected sound you hear against the original. 100 = only effects (stutters replace the track), 50 = both.' },
];
const gauges = {};
const volG = makeGauge({ label: 'volume', value: st.knobs.volume, title: 'Output level (Move: volume knob)', onChange: (v) => setKnob('volume', v) }); $('vol').append(volG.el);
for (const K of KNOBS) { gauges[K.k] = makeGauge({ label: K.label, min: K.min ?? 0, max: K.max ?? 100, value: st.knobs[K.k], fmt: K.fmt, title: K.title, onChange: (v) => setKnob(K.k, v) }); $('knobs').append(gauges[K.k].el); }
function setKnob(k, v) { st.knobs[k] = v; applyKnobs(); if (k === 'pitch') applyRate(); save(); }
function applyKnobs() {
  const K = st.knobs; eng.setBase({ filter: K.filter / 100, res: 0.7 + K.res / 100 * 12, crush: K.crush / 100, echo: K.echo / 100 * 0.7, feedback: K.feedback / 100, wash: K.wash / 100 });
  eng.setMix(K.mix / 100); eng.out.gain.setTargetAtTime((K.volume / 100) ** 1.5, ctx.currentTime, 0.03); for (const g of KNOBS) gauges[g.k].set(K[g.k]); volG?.set(K.volume);
}

// ---------------- pads (screen + keyboard) ----------------
const padEls = {};
LAYOUT.forEach((row, r) => row.forEach((id, c) => {
  const b = document.createElement('button'); b.className = 'ua-pad'; b.style.setProperty('--c', ROW_HEX[r]);
  b.innerHTML = `<span>${id.startsWith('slice') ? `slice ${+id.slice(5) + 1}` : FX[id].name}</span><kbd>${KEYS[r][c]}</kbd>`;
  b.addEventListener('pointerdown', (e) => { try { b.setPointerCapture(e.pointerId); } catch {} wake(); press(id, e.pressure && e.pressure !== 0.5 ? e.pressure : 0.5, { latch: e.shiftKey }); });
  for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => release(id));
  $('pads').append(b); padEls[id] = b;
}));
const down = new Set(), latched = new Set(); let latchMode = false;
/** latch = keep it on after the pad comes up; pressing a latched pad again frees it. Slices are jumps, never latched. */
function press(id, pressure, { latch = false } = {}) {
  if (!eng.buffer) return;
  if (latched.has(id)) { latched.delete(id); down.delete(id); eng.release(id); paintPads(); paintLeds(); return; }
  if ((latch || latchMode) && FX[id]) latched.add(id);
  down.add(id); eng.press(id, { pressure }); paintPads();
}
function release(id) { if (!down.has(id) || latched.has(id)) return; down.delete(id); eng.release(id); paintPads(); }
function freeAll() { latched.clear(); for (const id of [...down]) { down.delete(id); eng.release(id); } eng.releaseAll(); paintPads(); paintLeds(); }
function setLatchMode(on) { latchMode = on; $('btn-latch').classList.toggle('on', on); paintLeds(); }
$('btn-latch').onclick = () => setLatchMode(!latchMode);
const keyId = (key) => { for (let r = 0; r < 4; r++) { const c = KEYS[r].indexOf(key.toLowerCase()); if (c >= 0) return LAYOUT[r][c]; } return null; };
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT'].includes(e.target.tagName) || e.metaKey || e.ctrlKey) return;
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
  if (e.repeat) return; const id = keyId(e.key.length === 1 ? e.key : ''); const sid = id || keyId(SHIFTED[e.key] || ''); if (sid) { wake(); press(sid, 0.5, { latch: e.shiftKey }); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') stepBar(e.key === 'ArrowRight' ? 1 : -1);
});
const SHIFTED = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '<': ',', '£': '3', '"': '2', '/': '7', '(': '8', ')': '9' };
window.addEventListener('keyup', (e) => { const id = keyId(e.key) || keyId(SHIFTED[e.key] || ''); if (id) release(id); });
window.addEventListener('blur', () => { for (const id of [...down]) release(id); });
function paintPads() { for (const [id, el] of Object.entries(padEls)) { el.classList.toggle('on', !!(down.has(id) || (FX[id] && (eng.held.includes(id) || id in eng.mods)))); el.classList.toggle('latched', latched.has(id)); } $('fx-now').textContent = describeNow(); }
function describeNow() {
  const top = eng.held[eng.held.length - 1]; const mods = Object.keys(eng.mods).filter(id => !FX[id].x);
  if (!top && !mods.length) return 'Nothing held. Hold a pad; let go and the track is where it would have been.';
  const tag = (id) => (latched.has(id) ? ' 🔒' : '');
  return [top && `▶ ${FX[top].name}${tag(top)}`, ...mods.map(id => `+ ${FX[id].name}${tag(id)}`)].filter(Boolean).join('   ') + (latched.size ? '   · press a latched pad again (or Undo) to free it' : '');
}

// ---------------- transport ----------------
async function togglePlay() { await ready; wake(); if (!eng.buffer) { await loadDemo(); } eng.toggle(); syncUi(); paintLeds(); }
$('btn-play').onclick = togglePlay;
function stepBar(d) { if (!eng.buffer) return; eng.jump(eng.posAt() + d * 240 / st.bpm); }
eng.addEventListener('transport', () => { syncUi(); });
function syncUi() {
  $('btn-play').textContent = eng.playing ? '■' : '▶'; $('btn-play').classList.toggle('on', eng.playing);
  $('btn-rec').classList.toggle('on', recording); $('btn-rec').textContent = recording ? '■ stop rec' : '● rec';
  $('bpm').value = st.bpm; $('conf').textContent = st.conf != null && st.conf < 0.25 ? '· the tempo guess is unsure' : ''; segs.quant.set(st.quant); segs.loop.set(st.loopBars); $('sync').checked = st.sync; $('master').textContent = master;
  if (st.name) { $('track-name').textContent = st.name; const d = eng.duration; $('track-info').textContent = `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')} · ${st.bpm} bpm${st.conf != null && st.conf < 0.25 ? ' (not sure: check with ÷2 ×2 or tap)' : ''} · ${eng.rate !== 1 ? `playing ×${eng.rate.toFixed(3)}` : 'original speed'}`; }
}

// ---------------- waveform ----------------
function overviewPeaks(buf, cols = 1600) { const d = mono(buf), step = Math.max(1, Math.floor(d.length / cols)), out = new Float32Array(cols); for (let c = 0; c < cols; c++) { let m = 0; for (let i = c * step, e = Math.min(d.length, i + step); i < e; i += 4) m = Math.max(m, Math.abs(d[i])); out[c] = m; } return out; }
const ov = $('overview'), zo = $('zoom'), DPR = Math.min(2, devicePixelRatio || 1);
const fit = (cv) => { const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * DPR || cv.height !== h * DPR) { cv.width = w * DPR; cv.height = h * DPR; } const g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); return [g, w, h]; };
let zoomCache = { key: '', cols: null }, ovCache = { key: '', img: null }, lastFrame = '';
function zoomWindow() { if (eng.loop) return eng.loop; const bar = 240 / st.bpm, p = eng.posAt(), k = Math.floor((p - st.offset) / bar / 4) * 4; const start = Math.max(0, st.offset + k * bar); return { start, end: Math.min(eng.duration, start + 4 * bar) }; }
let peaksId = 0, lastPeaks = null;
function draw() {
  // stopped and nothing changed since the last frame: skip the redraw entirely
  if (peaks !== lastPeaks) { lastPeaks = peaks; peaksId++; }
  const sig = `${peaksId}|${eng.playing}|${eng.posAt()}|${eng.loop?.start}|${eng.loop?.end}|${eng.held.length}|${st.bpm}|${st.offset}|${ov.clientWidth}x${ov.clientHeight}|${zo.clientWidth}x${zo.clientHeight}|${document.fonts?.status}`;
  if (!eng.playing && sig === lastFrame) return ledTick(); lastFrame = sig;
  { const [g, w, h] = fit(ov); g.clearRect(0, 0, w, h); if (peaks && eng.buffer) {
    // the overview bars only change with the track, the loop or the size: render them once, blit per frame
    const d = eng.duration, key = `${peaksId}|${w}x${h}|${DPR}|${eng.loop?.start}|${eng.loop?.end}`;
    if (ovCache.key !== key) { const img = new OffscreenCanvas(w * DPR, h * DPR), o = img.getContext('2d'); o.scale(DPR, DPR);
      if (eng.loop) { o.fillStyle = 'rgba(253,224,71,.12)'; o.fillRect(eng.loop.start / d * w, 0, (eng.loop.end - eng.loop.start) / d * w, h); }
      o.fillStyle = 'rgba(167,139,250,.75)'; for (let x = 0; x < w; x++) { const v = peaks[Math.floor(x / w * peaks.length)] * h * 0.9; o.fillRect(x, (h - v) / 2, 1, Math.max(1, v)); }
      ovCache = { key, img }; }
    g.drawImage(ovCache.img, 0, 0, w, h);
    g.fillStyle = '#ece9f7'; g.fillRect(eng.posAt() / d * w, 0, 2, h);
  } }
  { const [g, w, h] = fit(zo); g.clearRect(0, 0, w, h); if (!eng.buffer) { g.fillStyle = 'rgba(236,233,247,.4)'; g.font = '14px Space Grotesk, sans-serif'; g.fillText('drop a track, or press demo loop', 16, h / 2); return; }
    const win = zoomWindow(), span = win.end - win.start, key = `${win.start.toFixed(3)}:${span.toFixed(3)}:${w}`;
    if (zoomCache.key !== key) { const d0 = eng.buffer.getChannelData(0), d1 = eng.buffer.getChannelData(eng.buffer.numberOfChannels - 1), sr = eng.buffer.sampleRate, cols = new Float32Array(w); for (let x = 0; x < w; x++) { const a = Math.floor((win.start + span * x / w) * sr), b = Math.floor((win.start + span * (x + 1) / w) * sr); let m = 0; for (let i = a; i < b; i += 2) m = Math.max(m, Math.abs(d0[i] || 0), Math.abs(d1[i] || 0)); cols[x] = m; } zoomCache = { key, cols }; }
    const beat = 60 / st.bpm, X = (t) => (t - win.start) / span * w;
    for (let k = Math.ceil((win.start - st.offset) / (beat / 4)); st.offset + k * beat / 4 <= win.end; k++) { const t = st.offset + k * beat / 4; const isBar = k % 16 === 0, isBeat = k % 4 === 0; g.fillStyle = isBar ? 'rgba(253,224,71,.55)' : isBeat ? 'rgba(236,233,247,.22)' : 'rgba(236,233,247,.07)'; g.fillRect(X(t), 0, 1, h); if (isBar) { g.fillStyle = 'rgba(253,224,71,.8)'; g.font = '10px Space Grotesk, sans-serif'; g.fillText(`bar ${Math.floor(k / 16) + 1}`, X(t) + 3, 11); } }
    const r = eng.loop || eng.barRegion(); g.fillStyle = 'rgba(253,224,71,.85)'; for (let s = 0; s < 8; s++) { const x = X(r.start + (r.end - r.start) * s / 8); g.fillRect(x, h - 8, 2, 8); }
    g.fillStyle = eng.held.length ? '#f0abfc' : '#67e8f9'; for (let x = 0; x < w; x++) { const v = zoomCache.cols[x] * h * 0.85; g.fillRect(x, (h - v) / 2, 1, Math.max(1, v)); }
    const p = eng.posAt(); if (p >= win.start && p <= win.end) { g.fillStyle = '#ece9f7'; g.fillRect(X(p), 0, 2, h); }
  }
  ledTick();
}
ov.addEventListener('pointerdown', (e) => { if (!eng.buffer) return; const r = ov.getBoundingClientRect(); const t = (e.clientX - r.left) / r.width * eng.duration; const bar = 240 / st.bpm; eng.jump(st.offset + Math.floor((t - st.offset) / bar) * bar); });
zo.addEventListener('pointerdown', (e) => { if (!eng.buffer) return; const r = zo.getBoundingClientRect(), win = zoomWindow(); const t = win.start + (e.clientX - r.left) / r.width * (win.end - win.start); const s16 = 15 / st.bpm; eng.jump(st.offset + Math.floor((t - st.offset) / s16) * s16); });

// ---------------- Move ----------------
let shift = false, lastStep = -1;
const moveId = (row, col) => LAYOUT[3 - row][col]; // Move rows count from the bottom
function paintLeds() {
  if (!move.inControl) return;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) { const id = moveId(row, col), lr = 3 - row; const on = !!(down.has(id) || (FX[id] && (eng.held.includes(id) || id in eng.mods))); move.setPadColor(row * 8 + col, on ? COLOR.WHITE : (lr === 1 || col % 2 === 0) ? ROW_LED[lr] : ROW_DIM[lr]); }
  move.setButtonColor('play', eng.playing ? COLOR.WHITE : nearestPaletteIndex('#67e8f9')); move.setButtonColor('record', recording ? COLOR.RED : nearestPaletteIndex('#fb7185'));
  move.setButtonColor('capture', eng.loop ? nearestPaletteIndex('#fde047') : COLOR.DIM); move.setButtonColor('undo', down.size ? COLOR.WHITE : COLOR.DIM); move.setButtonColor('loop', latchMode ? COLOR.WHITE : COLOR.DIM);
  QUANTS.forEach(([q], i) => move.setButtonColor(`track${i + 1}`, st.quant === q ? COLOR.WHITE : COLOR.DIM));
  move.setButtonColor('left', COLOR.DIM); move.setButtonColor('right', COLOR.DIM); lastStep = -1; ledTick();
}
function ledTick() {
  if (!move.inControl || !eng.buffer) return; const { step } = barStep(eng.posAt(), eng.grid); if (step === lastStep) return; lastStep = step;
  for (let i = 0; i < 16; i++) move.setStepColor(i, i === step ? COLOR.WHITE : i % 4 === 0 ? COLOR.DARK_GREY : 0);
}
move.addEventListener('pad', (e) => { const { row, col, on, velocity } = e.detail; const id = moveId(row, col); wake(); if (on) press(id, Math.max(0.2, (velocity || 80) / 127 * 0.7), { latch: shift }); else release(id); paintLeds(); });
move.addEventListener('aftertouch', (e) => { const { row, col } = { row: Math.floor(e.detail.index / 8), col: e.detail.index % 8 }; const id = moveId(row, col); if (FX[id]) { eng.setPressure(id, e.detail.pressure / 127); } });
move.addEventListener('step', (e) => { if (!e.detail.on || !eng.buffer) return; const s16 = 15 / st.bpm, bar = barStep(eng.posAt(), eng.grid).bar; eng.jump(st.offset + (bar * 16 + e.detail.index) * s16); });
const acc = {}; const accum = (k, d, need = 2) => { acc[k] = (acc[k] || 0) + d; if (Math.abs(acc[k]) < need) return 0; const s = Math.sign(acc[k]); acc[k] = 0; return s; };
move.addEventListener('encoder', (e) => { const { index, delta } = e.detail; const K = KNOBS[index]; if (!K) return; const span = (K.max ?? 100) - (K.min ?? 0); const stepV = K.k === 'pitch' ? accum('pitch', delta, 3) : delta * Math.max(1, span / 100); if (!stepV) return; setKnob(K.k, Math.max(K.min ?? 0, Math.min(K.max ?? 100, st.knobs[K.k] + stepV))); gauges[K.k].set(st.knobs[K.k]); });
move.addEventListener('wheel', (e) => { const d = accum('wheel', e.detail.delta, 1); if (d && eng.buffer) eng.jump(eng.posAt() + d * 15 / st.bpm); });
move.addEventListener('volume', (e) => { setKnob('volume', Math.max(0, Math.min(100, st.knobs.volume + e.detail.delta))); });
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; return; } if (!pressed) return;
  const tr = /^track(\d)$/.exec(name); if (tr) { const q = QUANTS[+tr[1] - 1][0]; st.quant = q; eng.quant = q; syncUi(); save(); paintLeds(); return; }
  if (name === 'play') togglePlay();
  if (name === 'record') toggleRec();
  if (name === 'capture') setLoop(shift ? 0 : st.loopBars || 1);
  if (name === 'undo') freeAll();
  if (name === 'loop') setLatchMode(!latchMode);
  if (name === 'left' || name === 'right') { const d = name === 'right' ? 1 : -1; if (shift) { const i = LOOPS.findIndex(([v]) => v === st.loopBars); setLoop(LOOPS[Math.max(0, Math.min(LOOPS.length - 1, i + d))][0]); } else stepBar(d); }
  paintLeds();
});
eng.addEventListener('fx', () => { paintPads(); paintLeds(); });
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
$('btn-connect').onclick = async () => {
  try {
    wake(); const { inputs } = await midi.init(); const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn'); const { identity } = await move.connect(); paintLeds();
    setPill(`Move: ready${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''}`, 'pill-on'); $('btn-disconnect').disabled = false;
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); }
};
$('btn-disconnect').onclick = () => { move.disconnect(); setPill('Move: disconnected (back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---------------- start: bring back yesterday's track ----------------
(async () => {
  const saved = await dbGet('state'); if (saved) st = { ...st, ...saved, knobs: { ...st.knobs, ...(saved.knobs || {}) } };
  eng.quant = st.quant; applyKnobs(); syncUi(); paintPads();
  const track = await dbGet('track');
  try {
    if (track?.demo) await loadBuffer(toCtxBuffer(await renderDemo(ctx.sampleRate)), DEMO.name, { detect: false, demo: true });
    else if (track?.bytes) { bytes = track.bytes; await loadBuffer(await ctx.decodeAudioData(track.bytes.slice(0)), track.name, { detect: false }); }
  } catch { $('track-info').textContent = 'Could not restore the last track: load it again.'; }
  frameLoop(draw);
})();
if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__unasm = { eng, ctx, st: () => st }; // for local smoke tests

import { Midi } from '../midi.js';
import { MoveDevice, COLOR, nearestPaletteIndex } from 'movewire';
import { GENRES, SCALES, PROGRESSIONS, PATTERNS, PARTS, GEN, KICKS, STEPS, NOTE_NAMES, frame, chordPcs, noteName } from './gen.js';
import { writeMidi } from './smf.js';
import { SOUNDS, defaultSound } from './sounds.js';
import { ENDINGS, applyEnding, applyChaos } from './vary.js';
import { buildSong, makeBundle, setFileName, MAX_TAKES } from './ablbundle.js';
import { getTempo, setTempo, onTempo } from '../tempo.js';
import { makeGauge } from '../gauge.js';

const $ = (id) => document.getElementById(id);
const T = window.Tone;
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));

const SAVE = 'midi-warz.punch.v1';
const HEX = { bass: '#f0abfc', pad: '#a78bfa', lead: '#67e8f9' };
const LED = Object.fromEntries(PARTS.map(p => [p, nearestPaletteIndex(HEX[p])]));
const LED_DIM = { bass: nearestPaletteIndex('#5b2a63'), pad: nearestPaletteIndex('#3b2f6b'), lead: nearestPaletteIndex('#1d5560') };
const LABEL = { bass: 'Bass', pad: 'Pad', lead: 'Lead' };
const CH = { bass: 1, pad: 2, lead: 3 };
const DEFAULT_LEN = { bass: 2, pad: 8, lead: 2 };
const newSeed = () => 1 + Math.floor(Math.random() * 999999);
const SHOWN = ['lead', 'pad', 'bass']; // top to bottom everywhere: lanes, strips, Move track buttons 1–3
const CHAOS_KEYS = ['mutate', 'ratchet', 'scatter', 'glitch'];
const allParts = (v) => ({ lead: v, pad: v, bass: v });

// ---------------- state ----------------
function fromGenre(id, prev) {
  const g = GENRES[id];
  const part = (k, pattern, oct) => ({ pattern, density: g.density, movement: g.movement, octave: oct, seed: prev?.parts?.[k]?.seed ?? newSeed(), mute: (g.mute || []).includes(k), solo: false, sound: defaultSound(k, pattern, g.sounds?.[k]) });
  return { name: prev?.name ?? 'Punchline 1', genre: id, key: prev?.key ?? 9, scale: g.scale, prog: g.prog, per: g.per, ext: g.ext, bars: prev?.bars ?? 8, swing: g.swing || 50, kick: prev?.kick ?? true,
    parts: { bass: part('bass', g.bass, g.bassOct ?? 1), pad: part('pad', g.pad, 3), lead: part('lead', g.lead, g.leadOct ?? 4) }, sel: prev?.sel ?? 'lead', bar: 0,
    ending: prev?.ending ?? { type: 'off', every: 4, parts: allParts(true) },
    // the genre brings its own amount of damage (abstract hip hop, lo-fi); the dice and part choices stay
    chaos: { mutate: 0, ratchet: 0, scatter: 0, glitch: 0, seed: prev?.chaos?.seed ?? newSeed(), parts: prev?.chaos?.parts ?? allParts(true), ...(g.chaos || {}) } };
}
/** Older saves: fill in what later versions added. */
function migrate(s) {
  const d = fromGenre(s.genre, s); for (const k of PARTS) { s.parts[k].sound ??= defaultSound(k, s.parts[k].pattern); s.parts[k].solo ??= false; }
  s.name ??= d.name; s.ending ??= d.ending; s.chaos ??= d.chaos; return s;
}
let st, notes = { bass: [], pad: [], lead: [] };
// takes: frozen versions of the whole set ({ name, st, notes }); they become scenes on the Move. Not part of undo.
let takes = [], activeTake = null;
try { const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (s?.st && GENRES[s.st.genre]) { st = migrate(s.st); notes = s.notes; takes = (s.takes || []).filter(t => GENRES[t.st?.genre]).map(t => ({ ...t, st: migrate(t.st) })); activeTake = s.activeTake ?? null; } } catch {}
if (!st) { st = fromGenre('house'); }
let tempo = getTempo(GENRES[st.genre].bpm);
let savedAt = null;
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify({ st, notes, takes, activeTake, at: Date.now() })); savedAt = new Date(); paintSaved(); } catch {} };
function paintSaved() { const el = $('saved'); if (el && savedAt) el.textContent = `autosaved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; }
const fr = () => frame(st);

// undo: snapshots of the notes (and the params that made them); knob turns coalesce into one entry
const undo = []; let lastPush = 0;
function snapshot(force = false) { const now = performance.now(); if (!force && now - lastPush < 700) { lastPush = now; return; } lastPush = now; undo.push(JSON.stringify({ st, notes })); if (undo.length > 60) undo.shift(); }
function doUndo() { const s = undo.pop(); if (!s) return; ({ st, notes } = JSON.parse(s)); lastPush = 0; syncUi(); refresh(); }

function regen(part, { seed = false } = {}) {
  const P = st.parts[part]; if (seed) P.seed = newSeed();
  const f = fr();
  let line = GEN[part](f, { pattern: P.pattern, density: P.density, movement: P.movement, octave: P.octave, seed: P.seed, lead: notes.lead });
  if (st.ending.parts[part]) line = applyEnding(f, part, line, st.ending, P.seed);
  if (st.chaos.parts[part] && !(part === 'bass' && P.pattern === 'unison')) line = applyChaos(f, part, line, st.chaos, st.chaos.seed + PARTS.indexOf(part));
  notes[part] = line;
  if (part === 'lead' && st.parts.bass.pattern === 'unison') regen('bass'); // the bass doubles the riff
}
/** Locked parts keep their seed when everything is rolled; they still follow key/progression changes. */
const regenAll = (opts = {}) => ['lead', 'bass', 'pad'].forEach(p => regen(p, { ...opts, seed: opts.seed && !st.parts[p].lock }));
/** Solo wins over mute: with any part soloed, only soloed parts sound. */
const audible = (k) => (PARTS.some(p => st.parts[p].solo) ? st.parts[k].solo : !st.parts[k].mute);
if (!notes.bass?.length && !notes.pad?.length && !notes.lead?.length) regenAll();

// ---------------- audio ----------------
let audio = null, awake = false, playing = false, step = -1, vol = 0.8;
function makeAudio() {
  const limiter = new T.Limiter(-2).toDestination(); const master = new T.Gain(vol).connect(limiter);
  const reverb = new T.Reverb({ decay: 3.5, wet: 0.28 }).connect(master);
  const delay = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.3, wet: 0.22 }).connect(reverb);
  // a bus per part: bass dry, pad into the reverb, lead dry + delay
  const bus = { bass: new T.Gain(1).connect(master), pad: new T.Gain(1).connect(reverb), lead: new T.Gain(1) };
  bus.lead.connect(master); bus.lead.connect(delay);
  const kick = new T.MembraneSynth({ volume: -8, pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0 } }).connect(master);
  const snare = new T.NoiseSynth({ volume: -22, noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(master);
  return { master, bus, voice: {}, kick, snare };
}
/** (Re)build the part's preview sound from the library. */
function setSound(k) {
  if (!audio) return; const idx = st.parts[k].sound % SOUNDS[k].length;
  if (audio.voice[k]?.idx === idx) return;
  try { audio.voice[k]?.dispose(); } catch {}
  audio.voice[k] = { ...SOUNDS[k][idx].make(T, audio.bus[k]), idx };
}
const voiceFor = () => PARTS.forEach(setSound);
async function wake() {
  if (awake) return; await T.start(); audio = makeAudio(); voiceFor(); awake = true;
  T.getTransport().bpm.value = tempo;
  new T.Loop((time) => tick(time), '16n').start(0);
}
const stepSec = () => 60 / tempo / 4;
const swingOffset = (s) => (s % 2 === 1 ? Math.max(0, st.swing - 50) / 50 * stepSec() : 0);
const mtof = (p) => T.Frequency(p, 'midi').toFrequency();
function play(part, n, time) {
  const dur = Math.max(0.03, n.d * stepSec() - 0.01), v = n.v / 127;
  const V = audio.voice[part]; if (!V) return;
  if (V.mono && 'portamento' in V.synth) { const prev = last[part]; V.synth.portamento = V.glide ?? (prev?.g ? 0.07 : 0); last[part] = n; } // a gliding voice always slides
  V.synth.triggerAttackRelease(mtof(n.p), dur, time, v);
}
let last = {};
function tick(time) {
  const total = st.bars * STEPS; step = (step + 1) % total; const s = step, inBar = s % STEPS, t = time + swingOffset(s);
  if (st.kick) { const k = KICKS[GENRES[st.genre].kick]; if (k.kick.includes(inBar)) audio.kick.triggerAttackRelease('C1', '8n', t, 0.9); if (k.snare.includes(inBar)) audio.snare.triggerAttackRelease('16n', t, 0.6); }
  for (const part of PARTS) { if (!audible(part)) continue; for (const n of notes[part]) if (n.s === s) play(part, n, t); }
  T.getDraw().schedule(() => { if (Math.floor(s / STEPS) !== st.bar && follow) { st.bar = Math.floor(s / STEPS); } paintLeds(); draw(); }, time);
}
let follow = true;
async function togglePlay() {
  await wake(); playing = !playing;
  if (playing) { step = -1; follow = true; last = {}; T.getTransport().bpm.value = tempo; T.getTransport().start('+0.05'); }
  else { T.getTransport().stop(); for (const k of PARTS) { const sy = audio.voice[k]?.synth; sy?.releaseAll ? sy.releaseAll() : sy?.triggerRelease?.(); } step = -1; }
  syncUi(); paintLeds(); draw();
}
function audition(part, p, v = 100) { if (!awake) return wake().then(() => audition(part, p, v)); audio.voice[part]?.synth.triggerAttackRelease(mtof(p), part === 'pad' ? 0.6 : 0.25, T.now(), v / 127); }

// ---------------- UI: frame controls ----------------
const keyNames = NOTE_NAMES;
const FAMILIES = [
  ['Four on the floor', ['house', 'techno', 'progtechno', 'trance', 'progpsy', 'psytrance', 'fullon', 'hardcore']],
  ['Disco & pop', ['italodisco', 'hyperpop']],
  ['Hip hop, dub, slow', ['hiphop', 'westcoast', 'lofi', 'abstract', 'triphop', 'dub']],
  ['Broken beat, bass music', ['garage', 'dubstep', 'trap', 'footwork', 'jungle', 'dnb', 'jumpup', 'neuro']],
  ['Latin & Brazil', ['cumbia', 'bossanova']],
  ['Metal', ['sludge', 'ambientblack', 'death', 'black']],
];
{ const listed = new Set(FAMILIES.flatMap(([, ids]) => ids)); const rest = Object.keys(GENRES).filter(id => !listed.has(id)); if (rest.length) FAMILIES.push(['Other', rest]); }
$('genre').replaceChildren(...FAMILIES.map(([label, ids]) => { const og = document.createElement('optgroup'); og.label = label; og.append(...ids.filter(id => GENRES[id]).map(id => new Option(`${GENRES[id].name} · ${GENRES[id].bpm}`, id))); return og; }));
const GENRE_ORDER = FAMILIES.flatMap(([, ids]) => ids);
$('key').replaceChildren(...keyNames.map((n, i) => new Option(n, i)));
$('scale').replaceChildren(...Object.entries(SCALES).map(([id, s]) => new Option(s.name, id)));
$('prog').replaceChildren(...PROGRESSIONS.map(p => new Option(`${p.id.replace(/b/g, '♭')} — ${p.mood}`, p.id)));

function chordNames() {
  const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']; // ♭II and ♭V are spelled as flats
  const f = fr(); return f.chords.map(c => `${(c.sym.startsWith('b') ? FLAT : keyNames)[(f.key + c.root) % 12]}${c.quality === 'power' ? '5' : c.quality === 'min' ? 'm' : c.quality === 'dim' ? '°' : ''}${c.tones.length > 4 ? '9' : c.tones.length > 3 ? '7' : ''}`);
}
/** Segmented control: a row of buttons, one active. */
function seg(el, items, onPick) {
  const btns = items.map(([v, label, title]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (title) b.title = title; b.onclick = () => onPick(v); el.append(b); return [v, b]; });
  return { set: (val) => btns.forEach(([v, b]) => b.classList.toggle('on', String(v) === String(val))) };
}
function why() {
  const P = PROGRESSIONS.find(p => p.id === st.prog);
  $('chords').replaceChildren(...chordNames().map((n, i) => { const c = document.createElement('span'); c.className = 'pl-chip'; c.textContent = n; c.title = fr().chords[i].sym.replace(/b/g, '♭'); return c; }));
  $('mood').textContent = `${P?.mood || ''} · one chord every ${st.per} bar${st.per > 1 ? 's' : ''} · ${st.bars} bars`;
  for (const k of PARTS) partUi[k].desc.textContent = PATTERNS[k][st.parts[k].pattern];
}
function syncUi() {
  $('genre').value = st.genre; $('key').value = st.key; $('scale').value = st.scale; $('prog').value = st.prog; segs.per.set(st.per); segs.ext.set(st.ext); segs.bars.set(st.bars);
  $('btn-play').textContent = playing ? '■' : '▶'; $('btn-play').classList.toggle('on', playing);
  $('bpm').value = tempo; $('swing').value = st.swing; $('kick').checked = st.kick;
  for (const k of PARTS) { const P = st.parts[k], ui = partUi[k]; ui.root.classList.toggle('sel', st.sel === k); ui.pattern.value = P.pattern; ui.g.density.set(P.density); ui.g.movement.set(P.movement); ui.g.octave.set(P.octave); ui.g.sound.set(P.sound); ui.g.sound.setLabel(SOUNDS[k][P.sound].name); ui.mute.classList.toggle('on', P.mute); ui.solo.classList.toggle('on', !!P.solo); ui.lock.classList.toggle('on', !!P.lock); ui.root.classList.toggle('locked', !!P.lock); ui.seed.textContent = `#${P.seed}`; ui.seed.title = 'Seed: same settings + same seed = same line'; }
  voiceFor(); why(); syncBoxes(); $('set-name').value = st.name;
}
function refresh() { save(); why(); draw(); paintLeds(); if (typeof refreshTakes === 'function' && $('takes')) refreshTakes(); }
const frameChange = (fn) => () => { snapshot(true); fn(); regenAll(); syncUi(); refresh(); };
$('genre').onchange = frameChange(() => { const keep = st; st = fromGenre($('genre').value, keep); applyTempo(GENRES[st.genre].bpm); });
$('key').onchange = frameChange(() => { st.key = +$('key').value; });
$('scale').onchange = frameChange(() => { st.scale = $('scale').value; });
$('prog').onchange = frameChange(() => { st.prog = $('prog').value; const P = PROGRESSIONS.find(p => p.id === st.prog); if (P?.major && st.scale !== 'major') st.scale = 'major'; if (!P?.major && st.scale === 'major') st.scale = 'minor'; });
const segs = {
  per: seg($('per'), [[1, '1'], [2, '2'], [4, '4']], (v) => frameChange(() => { st.per = v; })()),
  ext: seg($('ext'), [[3, 'triads'], [7, '7ths'], [9, '9ths'], [5, 'power', 'Power chords: root and fifth, no third. Neither major nor minor']], (v) => frameChange(() => { st.ext = v; })()),
  bars: seg($('bars'), [[8, '8 bars'], [16, '16 bars']], (v) => frameChange(() => { st.bars = v; st.bar = Math.min(st.bar, st.bars - 1); })()),
};
$('swing').onchange = () => { st.swing = Math.max(50, Math.min(75, +$('swing').value || 50)); save(); };
$('kick').onchange = () => { st.kick = $('kick').checked; save(); };
$('btn-play').onclick = togglePlay;
$('btn-undo').onclick = doUndo;
$('btn-regen').onclick = () => { snapshot(true); regenAll({ seed: true }); syncUi(); refresh(); };
$('btn-export').onclick = () => exportMidi();
$('btn-move').onclick = () => exportMove();

// tempo is the shared master tempo
function applyTempo(bpm, publish = true) { tempo = Math.min(240, Math.max(40, Math.round(bpm))); st.bpm = tempo; if (publish) setTempo(tempo, 'punch'); $('bpm').value = tempo; if (awake) T.getTransport().bpm.rampTo(tempo, 0.1); }
$('bpm').onchange = () => applyTempo(+$('bpm').value);
onTempo((bpm, src) => { if (src !== 'punch') applyTempo(bpm, false); });

// ---------------- UI: parts ----------------
const partUi = {};
for (const k of SHOWN) {
  const root = document.createElement('div'); root.className = 'pl-part'; root.style.setProperty('--c', HEX[k]);
  const head = document.createElement('div'); head.className = 'pl-head';
  const name = document.createElement('button'); name.className = 'pl-name'; name.textContent = LABEL[k]; name.title = `Select ${LABEL[k].toLowerCase()} (Move: track ${SHOWN.indexOf(k) + 1})`;
  const seed = document.createElement('span'); seed.className = 'pl-seed';
  const mute = document.createElement('button'); mute.textContent = 'M'; mute.className = 'pl-tog'; mute.title = 'Mute (Move: Mute)';
  const solo = document.createElement('button'); solo.textContent = 'S'; solo.className = 'pl-tog solo'; solo.title = 'Solo: hear only the soloed parts (Move: Shift + Mute)';
  const lock = document.createElement('button'); lock.textContent = '🔒'; lock.className = 'pl-tog lock'; lock.title = 'Lock: keep this line when you press Regenerate all (Move: Shift + track button)';
  head.append(name, seed, lock, mute, solo);
  const pattern = document.createElement('select'); pattern.replaceChildren(...Object.keys(PATTERNS[k]).map(p => new Option(p, p)));
  const desc = document.createElement('p'); desc.className = 'pl-desc';
  const gauges = document.createElement('div'); gauges.className = 'gauges four';
  const n = SOUNDS[k].length;
  const g = {
    sound: makeGauge({ label: SOUNDS[k][st.parts[k].sound]?.name || 'sound', min: 0, max: n - 1, value: st.parts[k].sound, fmt: (v) => `${v + 1}/${n}`, color: HEX[k], title: `Preview sound: ${n} to choose from. Only for listening, the .mid carries the notes (Move: Shift + knob 4)`, onChange: (v) => setPartSound(k, v) }),
    density: makeGauge({ label: 'density', value: st.parts[k].density, color: HEX[k], title: 'How busy: more hits, more notes per phrase.', onChange: (v) => partParam(k, 'density', v) }),
    movement: makeGauge({ label: 'movement', value: st.parts[k].movement, color: HEX[k], title: 'How far the pitch wanders from the root / chord tones. Psytrance wants zero.', onChange: (v) => partParam(k, 'movement', v) }),
    octave: makeGauge({ label: 'octave', min: 0, max: 6, value: st.parts[k].octave, color: HEX[k], title: 'Register of the part (C-octave number).', onChange: (v) => partParam(k, 'octave', v) }),
  };
  gauges.append(g.sound.el, g.density.el, g.movement.el, g.octave.el); g.sound.el.classList.add('pl-sound');
  const row = document.createElement('div'); row.className = 'pl-btns';
  const again = document.createElement('button'); again.className = 'pl-again'; again.textContent = '↻ regenerate'; again.title = 'New seed for this part only (Move: Capture)';
  const exp = document.createElement('button'); exp.textContent = '⤓ .mid'; exp.title = `Export only the ${LABEL[k].toLowerCase()}`;
  row.append(again, exp);
  root.append(head, pattern, desc, gauges, row); $('parts').append(root);
  name.onclick = () => { select(k); };
  root.addEventListener('pointerdown', () => { if (st.sel !== k) select(k); });
  pattern.onchange = () => partParam(k, 'pattern', pattern.value);
  again.onclick = () => { snapshot(true); regen(k, { seed: true }); syncUi(); refresh(); };
  mute.onclick = () => { st.parts[k].mute = !st.parts[k].mute; syncUi(); refresh(); };
  solo.onclick = () => toggleSolo(k);
  exp.onclick = () => exportMidi([k]);
  lock.onclick = () => toggleLock(k);
  partUi[k] = { root, pattern, desc, g, mute, solo, lock, seed };
}
function setPartSound(k, v) { const n = SOUNDS[k].length; st.parts[k].sound = ((v % n) + n) % n; setSound(k); syncUi(); save(); const m = notes[k].find(x => true); if (m) audition(k, m.p, 100); }
function toggleLock(k) { st.parts[k].lock = !st.parts[k].lock; syncUi(); refresh(); }
function toggleSolo(k) { st.parts[k].solo = !st.parts[k].solo; syncUi(); refresh(); }
function select(k) { st.sel = k; syncUi(); refresh(); }
function partParam(k, param, v) { snapshot(); st.parts[k][param] = v; regen(k); syncUi(); refresh(); }

// ---------------- set name, phrase ending, chaos ----------------
$('set-name').value = st.name;
$('set-name').addEventListener('input', () => { st.name = $('set-name').value.trim() || 'Punchline'; save(); });
const partChips = (el, obj, onToggle) => { const chips = SHOWN.map(k => { const b = document.createElement('button'); b.type = 'button'; b.textContent = LABEL[k].toLowerCase(); b.style.setProperty('--c', HEX[k]); b.onclick = () => onToggle(k); el.append(b); return [k, b]; }); return () => chips.forEach(([k, b]) => b.classList.toggle('on', !!obj()[k])); };
const regenAffected = (parts) => { ['lead', 'bass', 'pad'].filter(k => parts[k] || (k === 'bass' && st.parts.bass.pattern === 'unison' && parts.lead)).forEach(k => regen(k)); };
function setEnding(patch) { snapshot(); Object.assign(st.ending, patch); regenAll(); syncUi(); refresh(); }
function setChaos(patch, regenOnly = true) { snapshot(); Object.assign(st.chaos, patch); regenAffected(regenOnly ? st.chaos.parts : allParts(true)); syncUi(); refresh(); }
const endType = seg($('end-type'), Object.keys(ENDINGS).map(k => [k, k, ENDINGS[k]]), (v) => setEnding({ type: v }));
const endEvery = seg($('end-every'), [[4, '4 bars'], [8, '8 bars']], (v) => setEnding({ every: v }));
const endParts = partChips($('end-parts'), () => st.ending.parts, (k) => { st.ending.parts[k] = !st.ending.parts[k]; setEnding({}); });
const chaosG = Object.fromEntries(CHAOS_KEYS.map(key => [key, makeGauge({ label: key, value: st.chaos[key], color: 'var(--ember-magenta)', onChange: (v) => setChaos({ [key]: v }) })]));
$('chaos-gauges').append(...CHAOS_KEYS.map(k => chaosG[k].el));
const chaosParts = partChips($('chaos-parts'), () => st.chaos.parts, (k) => { const was = st.chaos.parts[k]; st.chaos.parts[k] = !was; setChaos({}, false); });
$('chaos-roll').onclick = () => setChaos({ seed: newSeed() });
$('chaos-seed').onchange = () => { const v = Math.round(+$('chaos-seed').value); if (v >= 1) setChaos({ seed: Math.min(999999, v) }); else $('chaos-seed').value = st.chaos.seed; };
$('chaos-clear').onclick = () => setChaos(Object.fromEntries(CHAOS_KEYS.map(k => [k, 0])));
function syncBoxes() {
  endType.set(st.ending.type); endEvery.set(st.ending.every); endParts(); $('end-desc').textContent = ENDINGS[st.ending.type];
  for (const k of CHAOS_KEYS) chaosG[k].set(st.chaos[k]); chaosParts(); $('chaos-seed').value = st.chaos.seed;
  document.querySelector('.pl-chaos').classList.toggle('hot', CHAOS_KEYS.some(k => st.chaos[k] > 0));
}

// ---------------- takes ----------------
const clone = (x) => JSON.parse(JSON.stringify(x));
const sameNotes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isDirty = () => activeTake == null || !takes[activeTake] || !sameNotes(takes[activeTake].notes, notes);
function keepTake() {
  if (takes.length >= MAX_TAKES) { flashTakes(`The Move has ${MAX_TAKES} scenes: delete a take first`); return; }
  takes.push({ name: `take ${takes.length + 1}`, st: clone(st), notes: clone(notes) }); activeTake = takes.length - 1; refreshTakes(); save();
}
function updateTake() { if (activeTake == null) return keepTake(); takes[activeTake] = { ...takes[activeTake], st: clone(st), notes: clone(notes) }; refreshTakes(); save(); }
function loadTake(i) {
  const t = takes[i]; if (!t) return; snapshot(true);
  const keep = { name: st.name, sel: st.sel }, locks = Object.fromEntries(PARTS.map(k => [k, !!st.parts[k].lock]));
  st = { ...clone(t.st), ...keep, bar: 0 }; for (const k of PARTS) st.parts[k].lock = locks[k]; // locks are about how you work now, not about the take
  notes = clone(t.notes); activeTake = i;
  if (st.bpm) applyTempo(st.bpm); syncUi(); refresh(); refreshTakes();
}
function deleteTake(i) { takes.splice(i, 1); if (activeTake === i) activeTake = null; else if (activeTake > i) activeTake--; refreshTakes(); save(); }
function stepTake(d) { if (!takes.length) return; loadTake(((activeTake ?? -1) + d + takes.length) % takes.length); }
let flashTimer = null;
function flashTakes(msg) { const el = $('takes-note'); el.textContent = msg; el.classList.add('warn'); clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.classList.remove('warn'); refreshTakes(); }, 2500); }
function refreshTakes() {
  const box = $('takes'); box.replaceChildren();
  takes.forEach((t, i) => {
    const chip = document.createElement('div'); chip.className = `pl-take${i === activeTake ? ' on' : ''}${i === activeTake && isDirty() ? ' dirty' : ''}`;
    const num = document.createElement('span'); num.className = 'pl-take-n'; num.textContent = i + 1;
    const label = document.createElement('span'); label.className = 'pl-take-name'; label.textContent = t.name; label.title = 'Click to load · double-click to rename';
    const del = document.createElement('button'); del.className = 'pl-take-x'; del.textContent = '×'; del.title = 'Delete this take';
    chip.append(num, label, del); box.append(chip);
    chip.onclick = (e) => { if (e.target === del) return; if (i !== activeTake || isDirty()) loadTake(i); };
    del.onclick = () => deleteTake(i);
    label.ondblclick = (e) => {
      e.stopPropagation(); const inp = document.createElement('input'); inp.value = t.name; inp.maxLength = 24; inp.className = 'pl-take-edit'; label.replaceWith(inp); inp.focus(); inp.select();
      const done = () => { t.name = inp.value.trim() || t.name; save(); refreshTakes(); };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') refreshTakes(); ev.stopPropagation(); }; inp.onblur = done;
    };
  });
  $('btn-keep').disabled = takes.length >= MAX_TAKES;
  $('btn-update').hidden = activeTake == null || !isDirty();
  if (activeTake != null) $('btn-update').textContent = `⤒ update ${takes[activeTake].name}`;
  const n = takes.length;
  $('takes-note').textContent = !n ? 'Keep the versions you like. Each take becomes a scene on the Move (up to 8).' : `${n}/${MAX_TAKES} · on the Move: scene = take${isDirty() ? ' · what you hear now is not kept yet' : ''}`;
}
$('btn-keep').onclick = keepTake;
$('btn-update').onclick = updateTake;

// ---------------- export ----------------
const slug = (t) => (t || 'punchline').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'punchline';
function exportMidi(which = SHOWN) {
  // with takes and a full export: every take one after the other, a marker at each (Live shows them as locators)
  const all = which.length > 1 && takes.length; let markers = [];
  const seq = all ? takes : [{ name: 'current', st, notes }];
  const parts = which.map(k => ({ name: LABEL[k], ch: CH[k], notes: [] }));
  let off = 0; for (const t of seq) { if (all) markers.push({ s: off, text: t.name }); which.forEach((k, i) => parts[i].notes.push(...t.notes[k].map(n => ({ ...n, s: n.s + off })))); off += t.st.bars * STEPS; }
  const name = st.name || 'punchliner';
  const bytes = writeMidi({ bpm: tempo, swing: st.swing, name, parts, markers });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  a.download = `${slug(st.name)}-${st.genre}-${keyNames[st.key].replace('#', 's')}-${tempo}bpm${which.length === 1 ? `-${which[0]}` : ''}.mid`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Download a Move Set named after the set: drag it onto the Sets list in Move Manager (move.local). */
const MOVE_COLOR = { lead: 14, pad: 6, bass: 1 };
let driftChain = null;
async function exportMove() {
  try {
    driftChain ??= await (await fetch(new URL('./move-drift.json', import.meta.url))).json();
    // takes → clip slots: take i is scene i on every track; without takes, what you hear now is scene 1
    const seq = takes.length ? takes : [{ name: 'Scene 1', st, notes }];
    const parts = [null, ...SHOWN.map(k => ({ name: LABEL[k], color: MOVE_COLOR[k], clips: seq.map(t => ({ name: `${LABEL[k]} · ${t.name}`, bars: t.st.bars, notes: t.notes[k] })) }))]; // track 1 stays empty for drums
    const song = buildSong({ bpm: tempo, key: st.key, scale: st.scale, bars: st.bars, swing: st.swing, parts, scenes: seq.map(t => t.name) }, driftChain);
    $('move-hint').dataset.takes = takes.length ? `${takes.length} take${takes.length > 1 ? 's' : ''} → scenes 1–${takes.length}.${isDirty() ? ' What you hear now is not a take, so it is not in the Set.' : ''}` : 'No takes kept: what you hear now is scene 1.';
    download(makeBundle(song), setFileName(st.name), 'application/zip');
    $('move-hint').hidden = false; $('move-takes').textContent = $('move-hint').dataset.takes;
  } catch (e) { $('move-hint').hidden = false; $('move-hint').textContent = `Could not build the Move Set: ${e.message}`; }
}
function download(bytes, name, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- piano roll: one lane per part, each zoomed to its own range ----------------
const cv = $('roll'), ctx = cv.getContext('2d'); const DPR = Math.min(2, devicePixelRatio || 1);
const TOP = 22, GAP = 8, LABEL_W = 34; let view = { w: 0, h: 0, cw: 0, lanes: [] };
function layout() {
  const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * DPR || cv.height !== h * DPR) { cv.width = w * DPR; cv.height = h * DPR; }
  // the selected lane gets more height
  const weight = (k) => (k === st.sel ? 1.7 : 1); const tot = PARTS.reduce((a, k) => a + weight(k), 0);
  const avail = h - TOP - GAP * (PARTS.length - 1); let y = TOP;
  const lanes = [...PARTS].reverse().map((k) => { // lead on top, bass at the bottom
    const ps = notes[k].map(n => n.p); const mid = ps.length ? Math.round((Math.min(...ps) + Math.max(...ps)) / 2) : 12 * (st.parts[k].octave + 1) + 6;
    let lo = ps.length ? Math.min(...ps) - 1 : mid - 6, hi = ps.length ? Math.max(...ps) + 1 : mid + 6; while (hi - lo < 12) { lo--; hi++; }
    const lh = avail * weight(k) / tot; const lane = { k, lo, hi, y, h: lh, rh: lh / (hi - lo + 1) }; y += lh + GAP; return lane;
  });
  view = { w, h, cw: (w - LABEL_W) / (st.bars * STEPS), lanes };
}
const xOf = (s) => LABEL_W + s * view.cw;
const yOf = (lane, p) => lane.y + (lane.hi - p) * lane.rh;
function draw() {
  layout(); const { w, h, cw, lanes } = view; const f = fr();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, w, h);
  const sc = f.scale.map(i => (f.key + i) % 12); const names = chordNames();
  // bar header + edit-bar highlight
  ctx.font = '11px Space Grotesk, sans-serif';
  for (let b = 0; b < st.bars; b++) {
    const x = xOf(b * STEPS);
    if (b === st.bar) { ctx.fillStyle = 'rgba(103,232,249,.06)'; ctx.fillRect(x, TOP, STEPS * cw, h - TOP); }
    ctx.fillStyle = b === st.bar ? 'rgba(103,232,249,.95)' : 'rgba(236,233,247,.6)';
    const ci = Math.floor(b / st.per) % f.chords.length; ctx.fillText(b % st.per === 0 ? `${b + 1} · ${names[ci]}` : `${b + 1}`, x + 4, 14);
  }
  for (const L of lanes) {
    const sel = L.k === st.sel, aud = audible(L.k);
    // lane frame and rows
    ctx.fillStyle = sel ? 'rgba(14,10,32,.55)' : 'rgba(14,10,32,.35)'; ctx.fillRect(LABEL_W, L.y, w - LABEL_W, L.h);
    for (let p = L.lo; p <= L.hi; p++) { const c = p % 12; ctx.fillStyle = c === f.key ? 'rgba(167,139,250,.17)' : sc.includes(c) ? 'rgba(167,139,250,.06)' : 'rgba(0,0,0,.22)'; ctx.fillRect(LABEL_W, yOf(L, p), w - LABEL_W, L.rh - 0.5); }
    for (let b = 0; b < st.bars; b++) for (let q = 0; q < 4; q++) { ctx.fillStyle = q === 0 ? 'rgba(236,233,247,.3)' : 'rgba(236,233,247,.08)'; ctx.fillRect(xOf(b * STEPS + q * 4), L.y, 1, L.h); }
    // lane label strip
    ctx.fillStyle = HEX[L.k]; ctx.globalAlpha = sel ? 1 : 0.45; ctx.fillRect(0, L.y, 3, L.h);
    ctx.save(); ctx.translate(16, L.y + L.h / 2); ctx.rotate(-Math.PI / 2); ctx.font = '600 10px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(LABEL[L.k].toUpperCase() + (aud ? '' : ' · off'), 0, 4); ctx.restore();
    ctx.globalAlpha = 1;
    if (L.rh >= 7) { ctx.fillStyle = 'rgba(236,233,247,.4)'; ctx.font = `${Math.min(9, L.rh)}px Space Grotesk, sans-serif`; for (let p = L.lo; p <= L.hi; p++) if (p % 12 === f.key) ctx.fillText(noteName(p), LABEL_W + 3, yOf(L, p) + L.rh - 1.5); }
    // notes
    ctx.globalAlpha = !aud ? 0.22 : sel ? 1 : 0.7; ctx.fillStyle = HEX[L.k];
    for (const n of notes[L.k]) { const x = xOf(n.s), y = yOf(L, n.p); const nh = Math.max(2, L.rh - 1.5); ctx.fillRect(x + 0.5, y + 0.5, Math.max(2, n.d * cw - 1.5), nh); if (nh > 6) { ctx.fillStyle = 'rgba(14,10,32,.5)'; ctx.fillRect(x + 0.5, y + 0.5, 2, nh); ctx.fillStyle = HEX[L.k]; } }
    ctx.globalAlpha = 1;
    if (sel) { ctx.strokeStyle = HEX[L.k]; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.strokeRect(LABEL_W + 0.5, L.y + 0.5, w - LABEL_W - 1, L.h - 1); ctx.globalAlpha = 1; }
  }
  if (playing && step >= 0) { ctx.fillStyle = 'rgba(236,233,247,.85)'; ctx.fillRect(xOf(step), TOP, Math.max(1.5, cw * 0.3), h - TOP); }
}
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const s = Math.max(0, Math.min(st.bars * STEPS - 1, Math.floor((x - LABEL_W) / view.cw)));
  if (y < TOP) { st.bar = Math.min(st.bars - 1, Math.floor(s / STEPS)); follow = false; refresh(); return; }
  const L = view.lanes.find(l => y >= l.y && y < l.y + l.h); if (!L) return;
  if (L.k !== st.sel) { select(L.k); return; } // first click on another lane selects it
  if (x < LABEL_W) return;
  const k = L.k, pitch = L.hi - Math.floor((y - L.y) / L.rh);
  const hit = notes[k].find(n => n.p === pitch && s >= n.s && s < n.s + n.d);
  snapshot(true);
  if (hit) { notes[k] = notes[k].filter(n => n !== hit); refresh(); return; }
  const n = { p: pitch, s, d: 1, v: 96 }; notes[k].push(n); notes[k].sort((a, b) => a.s - b.s || a.p - b.p);
  drag = { n, s0: s, lane: { ...L } }; cv.setPointerCapture(e.pointerId); audition(k, pitch); refresh();
});
cv.addEventListener('pointermove', (e) => { if (!drag) return; const r = cv.getBoundingClientRect(); const s = Math.floor((e.clientX - r.left - LABEL_W) / view.cw); drag.n.d = Math.max(1, Math.min(st.bars * STEPS - drag.s0, s - drag.s0 + 1)); draw(); });
cv.addEventListener('pointerup', () => { if (drag) { drag = null; refresh(); } });
addEventListener('resize', draw);

// ---------------- Move ----------------
let shift = false, held = null, padShift = 0; const acc = {};
const accum = (k, d, need = 3) => { acc[k] = (acc[k] || 0) + d; if (Math.abs(acc[k]) < need) return 0; const s = Math.sign(acc[k]); acc[k] = 0; return s; };
/** Pad → MIDI note: the scale laid out in rows a fourth (3 scale steps) apart, root bottom-left, in the part's octave. */
function padNote(row, col) {
  const f = fr(); const P = st.parts[st.sel]; const base = 12 * (P.octave + 1 + padShift) + f.key; const deg = row * 3 + col;
  const oct = Math.floor(deg / f.scale.length); return base + oct * 12 + f.scale[deg % f.scale.length];
}
function paintLeds() {
  if (!move.inControl) return;
  const k = st.sel, f = fr(), bar = st.bar, o = bar * STEPS;
  const chord = chordPcs(f, bar);
  const atHeld = held != null ? new Set(notes[k].filter(n => n.s === o + held).map(n => n.p)) : null;
  const sounding = playing && step >= 0 ? new Set(notes[k].filter(n => step >= n.s && step < n.s + n.d).map(n => n.p)) : new Set();
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    const p = padNote(row, col); const c = p % 12;
    let color = c === f.key % 12 ? LED[k] : chord.includes(c) ? LED_DIM[k] : COLOR.DIM;
    if (atHeld ? atHeld.has(p) : sounding.has(p)) color = COLOR.WHITE;
    move.setPadColor(row * 8 + col, color);
  }
  const starts = new Set(notes[k].filter(n => n.s >= o && n.s < o + STEPS).map(n => n.s - o));
  const head = playing && Math.floor(step / STEPS) === bar ? step % STEPS : -1;
  for (let i = 0; i < 16; i++) move.setStepColor(i, i === head ? COLOR.WHITE : i === held ? COLOR.WHITE : starts.has(i) ? LED[k] : (i % 4 === 0 ? COLOR.DARK_GREY : 0));
  SHOWN.forEach((p, i) => move.setButtonColor(`track${i + 1}`, p === k ? COLOR.WHITE : audible(p) ? LED_DIM[p] : 0));
  move.setButtonColor('track4', st.kick ? nearestPaletteIndex('#fde047') : 0);
  move.setButtonColor('play', playing ? COLOR.WHITE : nearestPaletteIndex('#67e8f9'));
  move.setButtonColor('capture', takes.length >= MAX_TAKES ? 0 : COLOR.WHITE); move.setButtonColor('duplicate', LED[k]);
  move.setButtonColor('plus', takes.length > 1 ? LED_DIM[k] : 0); move.setButtonColor('minus', takes.length > 1 ? LED_DIM[k] : 0); move.setButtonColor('undo', undo.length ? nearestPaletteIndex('#fde047') : 0);
  move.setButtonColor('mute', st.parts[k].solo ? nearestPaletteIndex('#fde047') : st.parts[k].mute ? COLOR.WHITE : 0); move.setButtonColor('record', nearestPaletteIndex('#fb7185'));
  move.setButtonColor('left', bar > 0 ? LED_DIM[k] : 0); move.setButtonColor('right', bar < st.bars - 1 ? LED_DIM[k] : 0);
}
move.addEventListener('pad', (e) => {
  const { row, col, on, velocity } = e.detail; if (!on) { paintLeds(); return; }
  const k = st.sel, p = padNote(row, col);
  if (held != null) {
    const s = st.bar * STEPS + held; snapshot(true);
    const hit = notes[k].find(n => n.s === s && n.p === p);
    if (hit) notes[k] = notes[k].filter(n => n !== hit);
    else { notes[k].push({ p, s, d: Math.min(DEFAULT_LEN[k], st.bars * STEPS - s), v: Math.max(40, velocity || 96) }); notes[k].sort((a, b) => a.s - b.s || a.p - b.p); }
    refresh();
  }
  audition(k, p, velocity || 100);
  paintLeds();
});
move.addEventListener('step', (e) => { const { index, on } = e.detail; if (on) held = index; else if (held === index) held = null; paintLeds(); });
move.addEventListener('encoder', (e) => {
  const { index, delta } = e.detail; const k = st.sel, P = st.parts[k];
  if (held != null) {
    const s = st.bar * STEPS + held; const at = notes[k].filter(n => n.s === s); if (!at.length) return;
    const d = accum(`h${index}`, delta, 2); if (!d) return; snapshot();
    if (index === 0) for (const n of at) n.d = Math.max(1, Math.min(st.bars * STEPS - s, n.d + d));
    if (index === 1) for (const n of at) n.v = Math.max(1, Math.min(127, n.v + d * 6));
    refresh(); return;
  }
  if (shift) {
    if (index === 0) { const d = accum('end', delta); if (d) { const keys = Object.keys(ENDINGS); setEnding({ type: keys[(keys.indexOf(st.ending.type) + d + keys.length) % keys.length] }); } }
    else if (index === 1) { const d = accum('every', delta); if (d) setEnding({ every: st.ending.every === 4 ? 8 : 4 }); }
    else if (index === 3) { const d = accum('snd', delta); if (d) setPartSound(k, P.sound + d); }
    else if (index >= 4) { const key = CHAOS_KEYS[index - 4]; setChaos({ [key]: Math.max(0, Math.min(100, st.chaos[key] + delta * 2)) }); }
    return;
  }
  if (index === 0) partParam(k, 'density', Math.max(0, Math.min(100, P.density + delta * 2)));
  else if (index === 1) partParam(k, 'movement', Math.max(0, Math.min(100, P.movement + delta * 2)));
  else if (index === 2) { const d = accum('oct', delta, 4); if (d) partParam(k, 'octave', Math.max(0, Math.min(6, P.octave + d))); }
  else if (index === 3) { const d = accum('pat', delta); if (d) { const keys = Object.keys(PATTERNS[k]); partParam(k, 'pattern', keys[(keys.indexOf(P.pattern) + d + keys.length) % keys.length]); } }
  else if (index === 4) { const d = accum('prog', delta, 4); if (d) { const i = PROGRESSIONS.findIndex(p => p.id === st.prog); $('prog').value = PROGRESSIONS[(i + d + PROGRESSIONS.length) % PROGRESSIONS.length].id; $('prog').onchange(); } }
  else if (index === 5) { const d = accum('key', delta, 4); if (d) { $('key').value = (st.key + d + 12) % 12; $('key').onchange(); } }
  else if (index === 6) { st.swing = Math.max(50, Math.min(75, st.swing + delta)); $('swing').value = st.swing; save(); }
  else if (index === 7) applyTempo(tempo + delta);
});
move.addEventListener('wheel', (e) => { const d = accum('wheel', e.detail.delta, 2); if (d) { padShift = Math.max(-2, Math.min(2, padShift + d)); paintLeds(); } });
move.addEventListener('volume', (e) => { vol = Math.max(0, Math.min(1, vol + e.detail.delta * 0.02)); audio?.master.gain.rampTo(vol, 0.05); });
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (name === 'shift') { shift = pressed; return; } if (!pressed) return;
  const tr = /^track(\d)$/.exec(name); if (tr) { const i = +tr[1] - 1; if (i < 3) { if (shift) toggleLock(SHOWN[i]); else select(SHOWN[i]); } else { st.kick = !st.kick; syncUi(); refresh(); } return; }
  if (name === 'play') togglePlay();
  if (name === 'capture') { if (shift) { snapshot(true); regenAll({ seed: true }); syncUi(); refresh(); } else keepTake(); }
  if (name === 'duplicate') { snapshot(true); regen(st.sel, { seed: true }); syncUi(); refresh(); }
  if (name === 'plus' || name === 'minus') stepTake(name === 'plus' ? 1 : -1);
  if (name === 'undo') doUndo();
  if (name === 'mute') { if (shift) toggleSolo(st.sel); else { st.parts[st.sel].mute = !st.parts[st.sel].mute; syncUi(); refresh(); } }
  if (name === 'record') exportMidi();
  if (name === 'left' || name === 'right') {
    const d = name === 'right' ? 1 : -1;
    if (shift) { const ids = GENRE_ORDER; $('genre').value = ids[(ids.indexOf(st.genre) + d + ids.length) % ids.length]; $('genre').onchange(); }
    else { st.bar = Math.max(0, Math.min(st.bars - 1, st.bar + d)); follow = false; refresh(); }
  }
});
window.addEventListener('keydown', (e) => {
  if (e.repeat || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
  else if (/^[1-3]$/.test(e.key)) select(SHOWN[+e.key - 1]);
  else if (e.key === 'k') keepTake();
  else if (e.key === 'r') { snapshot(true); regen(st.sel, { seed: true }); syncUi(); refresh(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { st.bar = Math.max(0, Math.min(st.bars - 1, st.bar + (e.key === 'ArrowRight' ? 1 : -1))); follow = false; refresh(); }
});
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (!awake) wake(); }, { once: true });

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

st.bpm = tempo; syncUi(); refresh(); refreshTakes();

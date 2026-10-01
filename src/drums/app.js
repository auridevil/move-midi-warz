import { Midi } from '../midi.js';
import { MoveDevice, COLOR, PALETTE, padRowCol, toHex } from 'movewire';
import { Audio } from '../audio.js';
import { EXERCISES, SCALES, TREATMENTS, RULES, DYN_NAME } from './exercises.js';
import { SynthKit, KIT_PRESETS, PAD_SOUND, CORE, SOUND_NAME, HAND_COLOR, KIT_COLOR, LAYOUT, soundOf, padFor } from './kit.js';
import { DrillEngine } from './engine.js';
import { setTempo, onTempo } from '../tempo.js';

const $ = (id) => document.getElementById(id);
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));
const audio = new Audio();
const kit = new SynthKit(audio);
const engine = new DrillEngine({ audio, kit });
move.addEventListener('sent', (e) => { if (e.detail.bytes[0] === 0xF0) log(`→ sysex ${toHex(e.detail.bytes)}`); });
move.addEventListener('identity', (e) => log(`← identity ${e.detail.idOk ? 'OK' : 'UNEXPECTED ID'} fw ${e.detail.major}.${e.detail.minor}.${e.detail.build} serial ${e.detail.serial}`));
move.addEventListener('reply', (e) => log(`← move reply cmd ${e.detail.cmd} [${e.detail.args.join(', ')}]`));
move.addEventListener('unknown', (e) => { if (e.detail.bytes[0] === 0xF0) log(`← unknown sysex ${toHex(e.detail.bytes)}`); });
const log = (s) => { const el = $('log'); el.textContent += s + '\n'; if (el.textContent.length > 12000) el.textContent = el.textContent.slice(-9000); el.scrollTop = el.scrollHeight; };

// ---- exercise picker ----
for (const [scale, title] of Object.entries(SCALES)) {
  const g = document.createElement('optgroup'); g.label = title;
  for (const ex of EXERCISES.filter(e => e.scale === +scale)) g.appendChild(new Option(`${ex.id} · ${ex.name}`, ex.id));
  $('exercise').appendChild(g);
}
for (const [k, t] of Object.entries(TREATMENTS)) $('treatment').add(new Option(t.name, k));
let ex = EXERCISES.find(e => e.id === 21) || EXERCISES[0];
function pickExercise(id) {
  ex = EXERCISES.find(e => e.id === +id) || EXERCISES[0];
  $('exercise').value = ex.id;
  $('bpm').value = ex.bpm; $('swing').value = ex.swing ?? 50;
  const hands = { R: 'right hand', L: 'left hand', RL: 'both hands', LR: 'both hands, left leads' }[ex.hands];
  $('ex-meta').textContent = `${SCALES[ex.scale].split(' · ')[0]} · ${hands} · ${ex.bpm} bpm${ex.bpmMax ? ` → ${ex.bpmMax}` : ''} · ${ex.steps === 16 ? 'one bar' : ex.steps === 32 ? 'one bar in 32nds' : `${ex.bars} bars`}${ex.genre ? ` · ${ex.genre}` : ''}`;
  $('ex-note').textContent = ex.note;
  compile(); renderGrid();
}
function compile() { return engine.load(ex, { treatment: $('treatment').value, bpm: +$('bpm').value, swing: +$('swing').value }); }
$('exercise').onchange = () => { stop(); pickExercise($('exercise').value); showBest(); };
const TREATMENT_INFO = {
  none: 'The exercise as written.',
  shift2: 'Same notes, but the pattern starts on beat 2. Unmasks whether you learnt a rhythm or a sequence of movements.',
  shift3: 'Same notes, starting on beat 3. The hardest of the three displacements.',
  shift4: 'Same notes, starting on beat 4. Do this one after 2 and 3.',
  hole: 'Four bars: play three, keep silent on the fourth, come back in exactly on time. Trains the inner clock, not the hands. Hard version: click off.',
  ladder: '+5 bpm automatically after every 8 clean bars, −10 after a dirty one. Ten minutes and you know exactly where your limit is today.',
};
const TIMING_INFO = { '0.7': 'Strict: window shrunk by 30%. For exercises you already own.', '1': 'Normal: ±45% of a step, capped at 60–120 ms. Tight = half of that.', '1.4': 'Loose: window widened by 40%. For a new exercise or a new tempo.' };
function showChoiceInfo() { $('choice-info').textContent = `${TREATMENT_INFO[$('treatment').value]}  ·  ${TIMING_INFO[$('tolerance').value]}`; }
$('treatment').onchange = () => { stop(); compile(); renderGrid(); showChoiceInfo(); showBest(); };
$('bpm').onchange = () => engine.setBpm(+$('bpm').value);
$('swing').onchange = () => { engine.swing = +$('swing').value; };
$('tolerance').onchange = () => { engine.tolerance = +$('tolerance').value; showChoiceInfo(); };
$('click').onchange = () => { engine.click = $('click').checked; };
for (const [k, p] of Object.entries(KIT_PRESETS)) $('kit-preset').add(new Option(p.name, k));
const KIT_PARAM = ['kick', 'snare', 'hat', 'tone'];
function kitReadout() { $('kit-readout').textContent = KIT_PARAM.map(n => `${n} ${kit.params[n].toFixed(2)}`).join(' · ') + ` · vol ${Math.round(audio.volume * 100)}`; try { localStorage.setItem('midi-warz.drums.kit', JSON.stringify({ preset: kit.preset, params: kit.params })); } catch {} }
$('kit-preset').onchange = () => { kit.usePreset($('kit-preset').value); kitReadout(); kit.play('kick', 100); setTimeout(() => kit.play('snare', 100), 180); setTimeout(() => kit.play('hat', 100), 360); };
try {
  const saved = JSON.parse(localStorage.getItem('midi-warz.drums.kit') || 'null');
  if (saved && KIT_PRESETS[saved.preset]) { kit.usePreset(saved.preset); $('kit-preset').value = saved.preset; for (const n of KIT_PARAM) if (Number.isFinite(saved.params?.[n])) kit.set(n, saved.params[n]); }
} catch {}
$('btn-kit-test').onclick = () => { audio.ensure(); kit.play('kick', 110); setTimeout(() => kit.play('snare', 110), 200); setTimeout(() => kit.play('hat', 110), 400); setTimeout(() => kit.play('openhat', 110), 600); };
kitReadout();
$('sounds').onchange = () => { engine.playSounds = $('sounds').checked; };
engine.addEventListener('bpm', (e) => { $('bpm').value = e.detail.bpm; setTempo(e.detail.bpm, 'drums'); });
$('bpm').addEventListener('change', () => setTempo(+$('bpm').value, 'drums'));
onTempo((bpm, source) => { if (source !== 'drums') { $('bpm').value = bpm; engine.bpm = bpm; } });

// ---- grid rendering ----
let cells = new Map(); // `${lane}:${step}` -> cell
let lanes = [];
function renderGrid() {
  const p = engine.pattern; const g = $('grid'); g.innerHTML = ''; cells.clear();
  lanes = [...new Map(p.hits.map(h => [`${h.sound}:${h.hand}`, h])).values()]
    .map(h => ({ key: `${h.sound}:${h.hand}`, sound: h.sound, hand: h.hand, pos: padRowCol(h.pad) }))
    .sort((a, b) => (b.pos.row - a.pos.row) || (a.pos.col - b.pos.col));
  g.className = `dgrid s${p.steps}`;
  g.style.gridTemplateColumns = `max-content repeat(${p.steps}, minmax(0, 1fr))`;
  const byKey = new Map(); for (const h of p.hits) byKey.set(`${h.sound}:${h.hand}:${h.step}`, h);
  for (const l of lanes) {
    const lbl = document.createElement('div'); lbl.className = `lbl ${l.hand}`; lbl.textContent = `${SOUND_NAME[l.sound]} ${l.hand}`; g.appendChild(lbl);
    for (let s = 0; s < p.steps; s++) {
      const c = document.createElement('div'); const h = byKey.get(`${l.key}:${s}`);
      const beat = s % (p.res / 4) === 0;
      c.className = `c ${beat ? 'beat' : ''} ${beat && s > 0 ? 'gap' : ''} ${h ? `${h.hand} ${h.dyn}` : ''}`;
      if (h) c.title = `${SOUND_NAME[h.sound]} · ${h.hand === 'R' ? 'right' : 'left'} · ${DYN_NAME[h.dyn]}`;
      g.appendChild(c); cells.set(`${l.key}:${s}`, c);
    }
  }
  const spacer = document.createElement('div'); g.appendChild(spacer);
  nums.length = 0;
  for (let s = 0; s < p.steps; s++) { const n = document.createElement('div'); const beat = s % (p.res / 4) === 0; n.className = `num ${beat && s > 0 ? 'gap' : ''}`; n.textContent = beat ? String((s / (p.res / 4)) % 4 + 1) : (s % (p.res / 8) === 0 ? '·' : ''); g.appendChild(n); nums.push(n); }
  renderKit(); buildTimeline();
}

// ---- kit mirror: the Move's left 4×4, top row first, coloured by which hand uses each pad ----
const kitCells = new Map();
function renderKit() {
  const k = $('kit'); k.innerHTML = ''; kitCells.clear();
  const used = new Map(); for (const h of engine.pattern.hits) used.set(h.pad, used.has(h.pad) && used.get(h.pad) !== h.hand ? 'both' : h.hand);
  LAYOUT.forEach((rowSounds, i) => rowSounds.forEach((sound, col) => {
    const pad = (3 - i) * 8 + col, d = document.createElement('div');
    d.className = `k ${CORE.has(sound) ? 'core' : ''} ${used.get(pad) ?? ''}`; d.textContent = SOUND_NAME[sound]; d.title = `pad row ${4 - i}, column ${col + 1}`;
    d.onclick = () => padHit(pad, 110, performance.now());
    k.appendChild(d); kitCells.set(pad, d);
  }));
  relightPads();
}
function kitFlash(pad, cls, ms = 140) { const d = kitCells.get(pad); if (!d) return; d.classList.add(cls); setTimeout(() => d.classList.remove(cls), ms); }
// ---- timeline overlay: a line through every lane, hollow dot = expected, filled dot = what you played ----
const NS = 'http://www.w3.org/2000/svg';
let tl = { svg: null, lanes: new Map(), xOfStep: [], pxPerMs: 1, pending: [], lastStep: null };
function buildTimeline() {
  const g = $('grid'); tl.svg?.remove();
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'timeline'); g.appendChild(svg); tl.svg = svg; tl.lanes.clear(); tl.xOfStep = [];
  const gr = g.getBoundingClientRect(); const p = engine.pattern;
  for (let s = 0; s < p.steps; s++) { const c = cells.get(`${lanes[0]?.key}:${s}`); if (c) { const r = c.getBoundingClientRect(); tl.xOfStep[s] = r.left - gr.left + r.width / 2; } }
  const x0 = tl.xOfStep[0] ?? 0, x1 = tl.xOfStep[p.steps - 1] ?? 0, cellW = tl.xOfStep[1] - tl.xOfStep[0] || 20;
  tl.pxPerMs = cellW / engine.stepMs;
  for (const l of lanes) {
    const c = cells.get(`${l.key}:0`); if (!c) continue; const r = c.getBoundingClientRect(); const y = r.top - gr.top + r.height / 2;
    const line = document.createElementNS(NS, 'line'); line.setAttribute('class', 'lane'); line.setAttribute('x1', x0 - cellW / 2); line.setAttribute('x2', x1 + cellW / 2); line.setAttribute('y1', y); line.setAttribute('y2', y); svg.appendChild(line);
    tl.lanes.set(l.key, { y, pad: padFor(l.sound, l.hand), hand: l.hand, dots: new Map() });
  }
}
const tlLane = (h) => tl.lanes.get(`${h.sound}:${h.hand}`);
function tlDraw(fn) { if (feedbackOn) fn(); else tl.pending.push(fn); }
function tlFlush() { for (const fn of tl.pending) fn(); tl.pending = []; }
function tlClear() { if (!tl.svg) return; for (const d of tl.svg.querySelectorAll('.exp, .act, .link')) d.remove(); for (const l of tl.lanes.values()) l.dots.clear(); }
function tlExpected(h, xOffsetMs = 0) {
  const l = tlLane(h); if (!l || tl.xOfStep[h.step] == null) return;
  const x = tl.xOfStep[h.step] + xOffsetMs * tl.pxPerMs; const c = document.createElementNS(NS, 'circle');
  c.setAttribute('class', 'exp'); c.setAttribute('cx', x); c.setAttribute('cy', l.y); c.setAttribute('r', 5); c.setAttribute('stroke', l.hand === 'R' ? '#67e8f9' : '#a78bfa');
  tl.svg.appendChild(c); l.dots.set(h.step, { x, el: c }); return { x, l };
}
function tlActual(h, devMs, cls) {
  const l = tlLane(h); if (!l) return; const e = l.dots.get(h.step); const x = (e ? e.x : tl.xOfStep[h.step]) + devMs * tl.pxPerMs;
  if (e && Math.abs(devMs) * tl.pxPerMs > 6) { const k = document.createElementNS(NS, 'line'); k.setAttribute('class', 'link'); k.setAttribute('x1', e.x); k.setAttribute('x2', x); k.setAttribute('y1', l.y); k.setAttribute('y2', l.y); tl.svg.appendChild(k); }
  const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', `act ${cls}`); c.setAttribute('cx', x); c.setAttribute('cy', l.y); c.setAttribute('r', 4.5); tl.svg.appendChild(c);
}
function tlExtra(pad, t) {
  const l = [...tl.lanes.values()].find(v => v.pad === pad); if (!l || !tl.lastStep) return;
  const x = tl.xOfStep[tl.lastStep.step] + (t - tl.lastStep.t) * tl.pxPerMs; if (x < 0 || x > (tl.xOfStep.at(-1) + 20)) return;
  const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'act extra'); c.setAttribute('cx', x); c.setAttribute('cy', l.y); c.setAttribute('r', 4); tl.svg.appendChild(c);
}
window.addEventListener('resize', () => { if (engine.pattern) buildTimeline(); });

const nums = [];
function setHead(step) { for (const c of cells.values()) c.classList.remove('head'); for (const l of lanes) cells.get(`${l.key}:${step}`)?.classList.add('head'); nums.forEach((n, i) => n.classList.toggle('head', i === step)); }
function markCell(h, cls, ms = 600) { const c = cells.get(`${h.sound}:${h.hand}:${h.step}`); if (!c) return; c.classList.add(cls); setTimeout(() => c.classList.remove(cls), ms); }

// ---- Move LEDs ----
const nearestColor = (hex) => { const r = hex >> 16, g = (hex >> 8) & 255, b = hex & 255; let best = 0, bd = Infinity; PALETTE.forEach((c, i) => { const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
const IDLE_COLOR = { R: nearestColor(0x8a3a08), L: nearestColor(0x163a8a), both: nearestColor(0x6a3a6a) };
const STEP_COLOR = { R: HAND_COLOR.R, L: HAND_COLOR.L, both: nearestColor(0xf0abfc) };
const HIT = { hold: 320, cue: COLOR.WHITE, tight: COLOR.BRIGHT_GREEN, loose: nearestColor(0xffd000), extra: COLOR.RED, miss: COLOR.BRIGHT_RED, plain: COLOR.WHITE };
/** Colour per step button for one bar of the pattern (32nd grids fold two steps into one button). */
function stepColors(bar = 0) {
  const p = engine.pattern, per = p.res / 16, out = new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    const hands = new Set();
    for (let k = 0; k < per; k++) for (const h of p.hitsByStep.get(bar * p.res + i * per + k) || []) hands.add(h.hand);
    out[i] = hands.size === 0 ? 0 : hands.size > 1 ? STEP_COLOR.both : STEP_COLOR[[...hands][0]];
  }
  return out;
}
let stepCols = new Array(16).fill(0);
function paintSteps(bar = 0) { if (!move.inControl) return; stepCols = stepColors(bar % (engine.pattern.steps / engine.pattern.res)); stepCols.forEach((c, i) => move.setStepColor(i, c)); }
const padBase = new Map();
function relightPads() {
  const used = new Map(); for (const h of engine.pattern.hits) used.set(h.pad, used.has(h.pad) && used.get(h.pad) !== h.hand ? 'both' : h.hand);
  for (const [pad, sound] of PAD_SOUND) padBase.set(pad, used.has(pad) ? STEP_COLOR[used.get(pad)] : CORE.has(sound) ? KIT_COLOR.core : KIT_COLOR.other);
  paintKit();
}
const padTimers = new Map();
function padColor(pad, color, revertMs) {
  if (!move.inControl) return;
  clearTimeout(padTimers.get(pad)); move.setPadColor(pad, color);
  if (revertMs) padTimers.set(pad, setTimeout(() => move.setPadColor(pad, padBase.get(pad) ?? 0), revertMs));
}
function paintKit() { if (!move.inControl) return; for (const t of padTimers.values()) clearTimeout(t); padTimers.clear(); for (let i = 0; i < 32; i++) move.setPadColor(i, padBase.get(i) ?? 0); paintSteps(0); move.setButtonColor('play', COLOR.GREEN); move.setButtonColor('mute', feedbackOn ? 0 : COLOR.WHITE); move.setButtonColor('left', COLOR.DARK_GREY); move.setButtonColor('right', COLOR.DARK_GREY); }

// ---- live feedback switch (the "judge") ----
let feedbackOn = true;
function setFeedback(on) {
  feedbackOn = on; $('feedback-on').checked = on;
  if (!on) { $('feedback').textContent = 'judge off — just play'; $('feedback').style.color = 'var(--muted)'; }
  if (move.inControl) move.setButtonColor('mute', on ? 0 : COLOR.WHITE);
}
$('feedback-on').onchange = () => setFeedback($('feedback-on').checked);

// ---- engine events ----
let best = 0, barsRow = [];
const setStats = (o) => { for (const [k, v] of Object.entries(o)) $(`st-${k}`).textContent = v; };
engine.addEventListener('start', () => { tlClear(); tl.pending = []; best = 0; barsRow = []; $('bars').innerHTML = ''; $('levelup').hidden = true; for (const id of ['q-bar', 'q-16', 'q-session']) $(id).textContent = '—'; $('q-grade').textContent = ''; setStats({ bar: 0, streak: 0, best: 0, dev: '—', early: 0, late: 0, dyn: 0, miss: 0, extra: 0 }); $('feedback').textContent = ''; });
engine.addEventListener('step', (e) => {
  const { step, stepInBar, due, res, t } = e.detail;
  setHead(step); tl.lastStep = { step, t };
  if (step === 0) tlDraw(tlClear);
  const swingMs = (stepInBar % 2 === 1 && res === 16) ? (engine.swing - 50) / 50 * engine.stepMs : 0;
  if (engine.grading) for (const h of due) tlDraw(() => tlExpected(h, swingMs));
  if (move.inControl) {
    const per = res / 16, btn = Math.floor(stepInBar / per), prev = (btn + 15) % 16;
    if (stepInBar === 0) paintSteps(e.detail.bar);
    if (stepInBar % per === 0) { move.setStepColor(prev, stepCols[prev]); move.setStepColor(btn, COLOR.WHITE); }
    for (const h of due) padColor(h.pad, HIT.cue, engine.windowMs + 40);
  }
  for (const h of due) kitFlash(h.pad, 'pop', engine.windowMs + 40);
});
engine.addEventListener('hit', (e) => {
  const { expected: h, dev, velocity, dynOk, tight } = e.detail;
  tlDraw(() => tlActual(h, dev, tight && dynOk ? 'tight' : 'loose'));
  if (!feedbackOn) { padColor(h.pad, HIT.plain, HIT.hold); kitFlash(h.pad, 'pop', HIT.hold); return; }
  markCell(h, tight && dynOk ? 'ok' : 'off'); padColor(h.pad, tight && dynOk ? HIT.tight : HIT.loose, HIT.hold); kitFlash(h.pad, tight && dynOk ? 'ok' : 'pop', HIT.hold);
  $('feedback').textContent = `${SOUND_NAME[h.sound]} ${h.hand}: ${dev > 0 ? '+' : ''}${dev} ms${tight ? '' : dev > 0 ? ' late' : ' early'} · vel ${velocity} ${dynOk ? '' : `(wanted ${DYN_NAME[h.dyn]})`}`;
  $('feedback').style.color = tight && dynOk ? 'var(--ok)' : 'var(--fg)';
});
engine.addEventListener('extra', (e) => { tlDraw(() => tlExtra(e.detail.pad, e.detail.t)); if (!feedbackOn) { padColor(e.detail.pad, HIT.plain, HIT.hold); return; } padColor(e.detail.pad, HIT.extra, HIT.hold); kitFlash(e.detail.pad, 'bad', HIT.hold); $('feedback').textContent = `extra hit on ${SOUND_NAME[soundOf(e.detail.pad)] ?? 'pad ' + e.detail.pad}`; $('feedback').style.color = 'var(--bad)'; });
engine.addEventListener('miss', (e) => { const h = e.detail.expected; tlDraw(() => tlLane(h)?.dots.get(h.step)?.el.classList.add('miss')); if (!feedbackOn) return; markCell(h, 'bad'); padColor(h.pad, HIT.miss, HIT.hold); });
const BEST_KEY = () => `midi-warz.drums.best.${ex.id}.${$('treatment').value}`;
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY()) || '{}'); } catch { return {}; } };
function showBest() {
  const b = loadBest();
  $('best').textContent = b.streak ? `Best here: streak ${b.streak} @ ${b.streakBpm} bpm · quality ${b.quality ?? '—'} · fastest level-up ${b.levelUpBpm ?? '—'} bpm · ${b.bars ?? 0} bars total` : 'No history for this exercise yet.';
}
function updateBest(patch) { const b = loadBest(); const n = { ...b, ...patch }; try { localStorage.setItem(BEST_KEY(), JSON.stringify(n)); } catch {} showBest(); renderProgress(); }
// ---- overall progress: per-day aggregates + merged per-exercise bests ----
const DAYS_KEY = 'midi-warz.drums.days';
const loadDays = () => { try { return JSON.parse(localStorage.getItem(DAYS_KEY) || '{}'); } catch { return {}; } };
function recordDay(score) { const d = loadDays(), k = new Date().toISOString().slice(0, 10); const e = d[k] || { bars: 0, sum: 0 }; e.bars++; e.sum += score; d[k] = e; try { localStorage.setItem(DAYS_KEY, JSON.stringify(d)); } catch {} }
function mergedBests() {
  const out = new Map();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i); const m = /^midi-warz\.drums\.best\.(\d+)\.(.+)$/.exec(k); if (!m) continue;
    let b; try { b = JSON.parse(localStorage.getItem(k)); } catch { continue; }
    const id = +m[1], cur = out.get(id) || { bars: 0 };
    if ((b.streak || 0) > (cur.streak || 0) || ((b.streak || 0) === (cur.streak || 0) && (b.streakBpm || 0) > (cur.streakBpm || 0))) { cur.streak = b.streak; cur.streakBpm = b.streakBpm; }
    cur.quality = Math.max(cur.quality || 0, b.quality || 0) || cur.quality; cur.levelUpBpm = Math.max(cur.levelUpBpm || 0, b.levelUpBpm || 0) || cur.levelUpBpm; cur.bars += b.bars || 0;
    out.set(id, cur);
  }
  return out;
}
function renderProgress() {
  const days = loadDays(), bests = mergedBests(), today = new Date().toISOString().slice(0, 10);
  const totBars = Object.values(days).reduce((a, d) => a + d.bars, 0), totSum = Object.values(days).reduce((a, d) => a + d.sum, 0);
  const overall = totBars ? Math.round(totSum / totBars) : null;
  $('ov-quality').textContent = overall ?? '—'; $('ov-grade').textContent = overall != null ? grade(overall) : '';
  $('ov-today').textContent = days[today] ? Math.round(days[today].sum / days[today].bars) : '—';
  $('ov-bars').textContent = totBars; $('ov-ex').textContent = bests.size; $('ov-days').textContent = Object.keys(days).length;
  // last 14 days as bars (height = quality)
  const el = $('days'); el.innerHTML = '';
  for (let i = 13; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); const k = dt.toISOString().slice(0, 10); const d = days[k]; const bar = document.createElement('i'); const q = d ? Math.round(d.sum / d.bars) : 0; bar.style.height = `${d ? Math.max(6, q * 0.44) : 4}px`; bar.className = d ? '' : 'empty'; bar.title = d ? `${k}: quality ${q}, ${d.bars} bars` : `${k}: —`; el.appendChild(bar); }
  // table
  const t = $('progress'); t.innerHTML = '<tr><th>#</th><th>Exercise</th><th>Best streak</th><th>Quality</th><th>Level-up</th><th>Bars</th></tr>';
  for (const e of [...EXERCISES].sort((a, b) => a.scale - b.scale || a.id - b.id)) {
    const b = bests.get(e.id), tr = document.createElement('tr'); tr.className = b ? '' : 'todo';
    tr.innerHTML = `<td class="scale">${e.id}</td><td>${e.name}<span class="scale"> · S${e.scale}</span></td><td>${b?.streak ? `${b.streak} @ ${b.streakBpm} bpm` : '—'}</td><td>${b?.quality ? `<b class="g">${grade(b.quality)}</b> ${b.quality}` : '—'}</td><td>${b?.levelUpBpm ? `${b.levelUpBpm} bpm` : '—'}</td><td>${b?.bars || '—'}</td>`;
    tr.onclick = () => { stop(); pickExercise(e.id); showBest(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    t.appendChild(tr);
  }
}
$('btn-progress-clear').onclick = () => { if (!confirm('Clear all drumming history in this browser?')) return; for (const k of Object.keys(localStorage)) if (k.startsWith('midi-warz.drums.best.') || k === DAYS_KEY) localStorage.removeItem(k); renderProgress(); showBest(); };
const grade = (q) => (q >= 95 ? 'S' : q >= 85 ? 'A' : q >= 70 ? 'B' : q >= 50 ? 'C' : 'D');
const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
engine.addEventListener('bar', (e) => {
  if (e.detail.preview) return;
  const { bar, clean, stats, cleanStreak, avgAbsDev, score } = e.detail;
  best = Math.max(best, cleanStreak);
  const session = mean(engine.scores), last16 = mean(engine.scores.slice(-16));
  $('q-bar').textContent = score; $('q-16').textContent = last16 ?? '—'; $('q-session').textContent = session ?? '—'; $('q-grade').textContent = session != null ? grade(session) : '';
  recordDay(score);
  const b = loadBest(); const patch = { bars: (b.bars || 0) + 1 };
  if (cleanStreak > (b.streak || 0) || (cleanStreak === b.streak && engine.bpm > (b.streakBpm || 0))) { patch.streak = cleanStreak; patch.streakBpm = engine.bpm; }
  if (engine.scores.length >= 8 && session > (b.quality || 0)) patch.quality = session;
  updateBest(patch);
  const i = document.createElement('i'); i.className = clean ? 'clean' : 'dirty'; i.title = `bar ${bar + 1}: ${clean ? 'clean' : `${e.detail.errors} errors`}`; $('bars').appendChild(i);
  setStats({ bar: bar + 1, streak: cleanStreak, best, dev: avgAbsDev ?? '—', early: +$('st-early').textContent + stats.early, late: +$('st-late').textContent + stats.late, dyn: +$('st-dyn').textContent + stats.dyn, miss: +$('st-miss').textContent + stats.misses, extra: +$('st-extra').textContent + stats.extras });
});
engine.addEventListener('levelUp', (e) => {
  const d = e.detail; const twice = d.times >= RULES.timesInARow;
  if (twice) { const b = loadBest(); if (!b.levelUpBpm || engine.bpm > b.levelUpBpm) updateBest({ levelUpBpm: engine.bpm }); }
  $('levelup').hidden = false;
  $('levelup').textContent = twice ? `${d.streak} clean bars — that's twice in a row. Go up ${RULES.bpmUp} bpm → ${d.suggestBpm}.` : `${RULES.cleanBarsToLevelUp} clean bars. Once more and you move up to ${d.suggestBpm} bpm.`;
});
engine.addEventListener('ladder', (e) => { $('feedback').textContent = `tempo ladder: ${e.detail.direction} → ${e.detail.bpm} bpm`; });
engine.addEventListener('stop', (e) => { tlFlush(); drawTake(e.detail.history); });

// ---- start / stop ----
function start(preview = false) {
  if (!preview && engine.running && !engine.grading) { // from a preview: keep it playing underneath, grade from the next pattern start
    engine.startGrading(); $('btn-start').disabled = true; $('feedback').textContent = 'grading starts at the next bar…'; $('feedback').style.color = 'var(--muted)';
    if (move.inControl) move.setButtonColor('play', COLOR.RED); return;
  }
  stop(); compile(); renderGrid(); audio.ensure();
  engine.click = $('click').checked; engine.playSounds = $('sounds').checked; engine.tolerance = +$('tolerance').value; engine.guide = false; engine.grading = !preview;
  engine.start(); $('btn-start').disabled = !preview; $('btn-stop').disabled = false; $('btn-preview').disabled = true;
  if (move.inControl) move.setButtonColor('play', preview ? COLOR.WHITE : COLOR.RED);
}
function stop() { if (!engine.running) return; engine.stop(); engine.grading = true; engine.guide = false; $('btn-start').disabled = false; $('btn-stop').disabled = true; $('btn-preview').disabled = false; paintKit(); for (const c of cells.values()) c.classList.remove('head'); }
$('btn-start').onclick = () => start(false); $('btn-stop').onclick = stop; $('btn-preview').onclick = () => start(true);

// ---- pad input (Move or keyboard) ----
function padHit(pad, velocity, t) {
  const sound = soundOf(pad); if (!sound) return;
  if (engine.playSounds) kit.play(sound, velocity);
  if (engine.running) engine.onPad(pad, velocity, t); else { padColor(pad, HIT.plain, HIT.hold); kitFlash(pad, 'pop', HIT.hold); }
}
move.addEventListener('pad', (e) => { if (e.detail.on) padHit(e.detail.index, e.detail.velocity, e.detail.t); });
move.addEventListener('encoder', (e) => {
  const { index, delta } = e.detail;
  if (index === 0) engine.setBpm(engine.bpm + delta);
  if (index === 1) { $('swing').value = Math.min(75, Math.max(50, +$('swing').value + delta)); engine.swing = +$('swing').value; }
  if (index >= 2 && index <= 5) { const n = KIT_PARAM[index - 2]; kit.nudge(n, delta); kitReadout(); if (!engine.running) kit.play(n === 'tone' ? 'snare' : n, 100); }
  if (index === 7) setVolume(audio.volume * 100 + delta * 2);
});
move.addEventListener('button', (e) => {
  const { name, pressed } = e.detail; if (!pressed) return;
  if (name === 'play') engine.running && engine.grading ? stop() : start(false);
  if (name === 'mute') setFeedback(!feedbackOn);
  if (name === 'left' || name === 'right') { stop(); pickExercise((ex.id + (name === 'right' ? 1 : EXERCISES.length - 1)) % EXERCISES.length); }
});
const KEYROWS = ['1234', 'qwer', 'asdf', 'zxcv']; // top row first, like the printed grid
window.addEventListener('keydown', (e) => {
  if (e.repeat || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const r = KEYROWS.findIndex(k => k.includes(e.key.toLowerCase())); if (r < 0) return;
  padHit((3 - r) * 8 + KEYROWS[r].indexOf(e.key.toLowerCase()), e.shiftKey ? 30 : 110, performance.now());
});

// ---- Move connection ----
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
$('btn-connect').onclick = async () => {
  try {
    audio.ensure();
    const { inputs } = await midi.init();
    const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn');
    const { identity } = await move.connect();
    relightPads();
    setPill(`Move: control mode${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ' (no identity reply)'}`, identity ? 'pill-on' : 'pill-warn');
    $('btn-disconnect').disabled = false;
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); log(`! ${e.message}`); }
};
$('btn-disconnect').onclick = () => { stop(); move.disconnect(); setPill('Move: disconnected (back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });

// ---- diary (localStorage) ----
const DIARY_KEY = 'midi-warz.drums.diary';
const loadDiary = () => { try { return JSON.parse(localStorage.getItem(DIARY_KEY) || '[]'); } catch { return []; } };
function renderDiary() {
  const d = loadDiary().slice(-30).reverse(); $('diary').innerHTML = '';
  for (const e of d) { const li = document.createElement('li'); li.textContent = `${e.date} — #${e.exercise} ${e.name} · ${e.bpm} bpm · best streak ${e.best} · ${e.bars} bars`; $('diary').appendChild(li); }
}
$('btn-diary-save').onclick = () => {
  const d = loadDiary(); d.push({ date: new Date().toISOString().slice(0, 10), exercise: ex.id, name: ex.name, bpm: engine.bpm, best, bars: +$('st-bar').textContent, treatment: $('treatment').value });
  try { localStorage.setItem(DIARY_KEY, JSON.stringify(d)); } catch {}
  renderDiary();
};
renderDiary();

// ---- "last take": timing deviation per hit, velocity as bar height ----
function drawTake(history) {
  const svg = $('take'); svg.innerHTML = '';
  const hits = history.filter(h => !h.extra); if (!hits.length) return;
  const W = 1000, H = 120, mid = 60, scale = 40 / engine.windowMs; // ± window = ±40px
  const el = (n, a) => { const e = document.createElementNS('http://www.w3.org/2000/svg', n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.appendChild(e); return e; };
  el('line', { x1: 0, y1: mid, x2: W, y2: mid, stroke: '#3a3f4c' });
  el('rect', { x: 0, y: mid - engine.tightMs * scale, width: W, height: engine.tightMs * scale * 2, fill: '#1f3d2c', opacity: .5 });
  const t0 = hits[0].t, t1 = hits[hits.length - 1].t || t0 + 1;
  for (const h of hits) {
    const x = 10 + (h.t - t0) / (t1 - t0 || 1) * (W - 20), y = mid - Math.max(-55, Math.min(55, h.dev * scale));
    el('circle', { cx: x, cy: y, r: 2 + (h.velocity / 127) * 4, fill: h.dynOk ? (Math.abs(h.dev) <= engine.tightMs ? '#3ddc84' : '#e8e8ec') : '#d9a400' });
  }
  for (const h of history.filter(h => h.extra)) el('rect', { x: 10 + (h.t - t0) / (t1 - t0 || 1) * (W - 20) - 1, y: 0, width: 2, height: H, fill: '#ff4d6d' });
  el('text', { x: 4, y: 12, fill: '#8a8f9a', 'font-size': 10 }).textContent = 'early ↑';
  el('text', { x: 4, y: H - 4, fill: '#8a8f9a', 'font-size': 10 }).textContent = 'late ↓ · dot size = velocity · green = tight & right dynamics · red bar = extra hit';
}
$('btn-clear-take').onclick = () => { $('take').innerHTML = ''; };

window.__mw = { kit, engine, audio, move };
pickExercise(21); showChoiceInfo(); showBest(); renderProgress();
log('ready — pick an exercise, Start, and play the 4×4 kit on the left half of the Move (or 1234/QWER/ASDF/ZXCV; Shift = ghost).');

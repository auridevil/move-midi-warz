// RD-1 player-agent sessions (DECISION A2, A3, A10 "run by agents"): the pure parts of session.mjs, glance.mjs and
// moveview.mjs. A seeded performer turns musical intentions into timed actions (Move bytes, clicks, keys), the slip
// injector spoils some of them the way hands do, and the accident tagger reads the page's setlog against what the
// script meant to change. No browser here: unit-tested in orbit2/test/session.test.js.
import { mulberry32 } from '../src/poly/dice.js';
import { SOUND_KEYS } from '../src/poly/lanes.js';

// ---- the Move on the wire (movewire's protocol: pads 68+, steps 16+, encoders CC 71–78 relative, buttons by CC) ----
export const MOVE = { PAD: 68, STEP: 16, ENC: 71, WHEEL: 14, BTN: { shift: 49, layout: 50, back: 51, capture: 52, minus: 54, plus: 55, undo: 56, loop: 58, duplicate: 60, left: 62, right: 63, play: 85, record: 86, mute: 88, sampling: 118, delete: 119, track1: 43, track2: 42, track3: 41, track4: 40 } };
export const bytes = {
  btn: (name, down) => [0xB0, MOVE.BTN[name], down ? 127 : 0],
  step: (i, down) => [down ? 0x90 : 0x80, MOVE.STEP + i, down ? 100 : 0],
  pad: (row, col, down, vel = 100) => [down ? 0x90 : 0x80, MOVE.PAD + row * 8 + col, down ? vel : 0],
  touch: (k, on) => [on ? 0x90 : 0x80, k, on ? 127 : 0],
  enc: (k, delta) => [0xB0, MOVE.ENC + k, delta >= 0 ? Math.min(63, delta) : 128 + Math.max(-63, delta)],
  wheel: (delta) => [0xB0, MOVE.WHEEL, delta >= 0 ? Math.min(63, delta) : 128 + Math.max(-63, delta)],
};
/** Lane li (0-based, 4 lanes) → the track button that selects it (track 1 is the top button = lane 4). */
export const trackOf = (li) => `track${4 - li}`;
/** The Move's knob row without Shift (app.js 'encoder'), as setlog targets of the selected lane. */
export const KNOB_TARGETS = ['length', 'euclidK', 'rotation', 'ratio', 'swing', 'prob', 'tune', null];   // knob 8 = tempo

// ---- what counts as what (DECISION A3) ----
const DESTRUCTIVE = new Set(['init', 'randomize', 'clear', 'load', 'slot']);   // slot: a recall replaces the pattern, like a load
const SILENT = new Set(['select', 'export', 'slot.save', 'record', 'chain']);
/** destructive (stop, load, init, randomize, clear, a kick muted) | silent (nothing heard changes) | harmless (all else that sounds). */
export function classOf(e) {
  if (e.target === 'transport') return e.after === 'stopped' ? 'destructive' : 'harmless';
  if (DESTRUCTIVE.has(e.target)) return 'destructive';
  if (/^lane\d+\.mute$/.test(e.target) && e.after === true && /kick/.test(e.voice || '')) return 'destructive';
  if (SILENT.has(e.target)) return 'silent';
  return 'harmless';
}
const matches = (pat, target) => pat === target || (pat.endsWith('*') && target.startsWith(pat.slice(0, -1)));

// ---- the performer ----
/** Persona weights: how often each intention comes up, and the rests between them (s). */
export const PERSONAS = {
  noor: { rest: [8, 30], intents: { build: 2, knobs: 4, evolve: 2, slots: 2, mute: 2, fill: 1, tempo: 1, listen: 4 } },
  kai: { rest: [2, 8], intents: { build: 2, knobs: 2, evolve: 0.5, slots: 3, mute: 5, drop: 1, fill: 4, tempo: 0.5, listen: 1 } },
};
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const between = (rng, [a, b]) => a + rng() * (b - a);
function weighted(rng, w) { const e = Object.entries(w).filter(([, x]) => x > 0), tot = e.reduce((s, [, x]) => s + x, 0); let r = rng() * tot; for (const [k, x] of e) if ((r -= x) <= 0) return k; return e.at(-1)[0]; }
/**
 * A set as a list of timed actions. opts: { seed, minutes, persona ('noor' | 'kai' or { rest, intents }), mouse (no Move:
 * clicks and keys only), intents (weights that replace the persona's), lanes (4) }. Each action: { id, at (ms from the
 * start, before speed), intent, kind, …args, expect: [setlog targets it means to change ('lane2.hits.*' = any step)],
 * hold (ms the hands keep something down) }. The selected lane is tracked, so the expectations name the right lane.
 */
export function performer({ seed = 1, minutes = 40, persona = 'noor', mouse = false, intents = null, lanes = 4 } = {}) {
  const rng = mulberry32(seed * 7919 + 17), p = typeof persona === 'string' ? PERSONAS[persona] : persona, w = intents || p.intents;
  const out = [], end = minutes * 60000; let t = 1000, sel = 0, playing = false, evolving = false, id = 0;
  const muted = new Set(), saved = new Set();
  const add = (o) => { out.push({ id: id++, at: Math.round(t), ...o }); t += (o.hold || 0) + 400 + rng() * 600; };
  const select = (li, intent) => { if (li === sel) return; sel = li; add(mouse ? { intent, kind: 'click', sel: `#lane-tabs button:nth-child(${li + 1})`, expect: ['select'] } : { intent, kind: 'move.select', lane: li, expect: ['select'] }); };
  const play = (intent) => { playing = !playing; add(mouse ? { intent, kind: pick(rng, ['click', 'key']), sel: '#btn-play', key: ' ', expect: ['transport'] } : { intent, kind: 'move.play', expect: ['transport'] }); };
  play('start');
  while (t < end) {
    const intent = weighted(rng, w);
    if (intent === 'build') {
      const li = Math.floor(rng() * lanes); select(li, intent);
      for (let k = 0, n = 2 + Math.floor(rng() * 4); k < n; k++) {
        const step = Math.floor(rng() * 8);
        add(mouse ? { intent, kind: 'click', sel: `#stepsui button:nth-child(${step + 1})`, expect: [`lane${li + 1}.hits.*`, `lane${li + 1}.accents.*`, `lane${li + 1}.locks.*`] } : { intent, kind: 'move.step', step, expect: [`lane${li + 1}.hits.*`] });
      }
    } else if (intent === 'mute' || intent === 'drop') {
      const li = intent === 'drop' ? 0 : 1 + Math.floor(rng() * (lanes - 1)), on = !muted.has(li); on ? muted.add(li) : muted.delete(li);
      if (mouse) { select(li, intent); add({ intent, kind: 'click', sel: '#btn-mute', expect: [`lane${li + 1}.mute`] }); }
      else add({ intent, kind: 'move.mute', lane: li, expect: [`lane${li + 1}.mute`] });
      if (intent === 'drop') { t += 2000 + rng() * 4000; muted.delete(li); add(mouse ? { intent, kind: 'click', sel: '#btn-mute', expect: [`lane${li + 1}.mute`] } : { intent, kind: 'move.mute', lane: li, expect: [`lane${li + 1}.mute`] }); }
    } else if (intent === 'fill') {
      add(mouse ? { intent, kind: 'hold', sel: '#btn-fill', hold: 1500 + rng() * 1500, expect: [] } : { intent, kind: 'move.hold', button: 'layout', hold: 1500 + rng() * 1500, expect: [] });
    } else if (intent === 'knobs') {
      const sound = !mouse && rng() < 0.6, k = sound ? Math.floor(rng() * SOUND_KEYS.length) : [0, 1, 2, 4, 5][Math.floor(rng() * 5)];
      const target = sound ? `lane${sel + 1}.sound.${SOUND_KEYS[k]}` : `lane${sel + 1}.${KNOB_TARGETS[k]}`, turns = (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 6));
      add(mouse ? { intent, kind: 'drag', sel: `#sliders .gauge:nth-child(${k + 1})`, dy: -turns * 6, expect: [target] } : { intent, kind: 'move.knob', knob: k, shift: sound, turns, expect: [target] });
    } else if (intent === 'evolve') {
      if (mouse) { add({ intent, kind: 'click', sel: '#btn-evolve', expect: ['evolve'] }); } else add({ intent, kind: 'move.button', button: 'minus', expect: ['evolve'] });
      evolving = !evolving;
    } else if (intent === 'slots' && !mouse) {
      const s = Math.floor(rng() * 4);
      if (!saved.has(s) || rng() < 0.3) { saved.add(s); add({ intent, kind: 'move.slotSave', slot: s, expect: ['slot.save'] }); }
      else add({ intent, kind: 'move.slotRecall', slot: s, expect: ['slot'] });
    } else if (intent === 'tempo') {
      const d = rng() < 0.5 ? -2 : 2;
      add(mouse ? { intent, kind: 'drag', sel: '.tstrip-tempo .gauge', dy: -d * 3, expect: ['tempo'] } : { intent, kind: 'move.knob', knob: 7, shift: false, turns: d, expect: ['tempo'] });
    }
    t += between(rng, p.rest) * 1000;   // listening
  }
  if (playing) play('end');
  return out;
}

// ---- slips: what hands do wrong ----
export const SLIPS = ['offset', 'stray-knob', 'wrong-row', 'double'];
/**
 * Spoil some actions: rate = the chance per action. A click lands 20–40 px off its target (offset); a knob next to the
 * one meant is touched and turned too (stray-knob; with the mouse: a gauge dragged a little); a pad or Mute row is
 * one off (wrong-row); a button or step is pressed twice (double). The intended targets stay as they were: whatever
 * else the page logs is an accident. Returns a new list (ids kept, stray actions get their own).
 */
export function injectSlips(script, { rate = 0.08, seed = 1, kinds = SLIPS } = {}) {
  const rng = mulberry32(seed * 104729 + 3), out = []; let id = Math.max(-1, ...script.map(a => a.id)) + 1;
  for (const a of script) {
    if (a.intent === 'start' || a.intent === 'end' || rng() >= rate) { out.push(a); continue; }
    const can = kinds.filter(k => (k === 'offset' && (a.kind === 'click' || a.kind === 'hold' || a.kind === 'drag')) || (k === 'wrong-row' && a.kind === 'move.mute') || (k === 'double' && /^(move\.(step|button|play|select|mute)|click|key)$/.test(a.kind)) || k === 'stray-knob');
    const k = pick(rng, can);
    if (k === 'offset') { const ang = rng() * Math.PI * 2, d = 20 + rng() * 20; out.push({ ...a, slip: { kind: k, dx: Math.round(Math.cos(ang) * d), dy: Math.round(Math.sin(ang) * d) } }); }
    else if (k === 'wrong-row') { const row = a.lane === 0 ? 1 : a.lane === 3 ? 2 : a.lane + (rng() < 0.5 ? -1 : 1); out.push({ ...a, slip: { kind: k, row } }); }
    else if (k === 'double') out.push({ ...a, slip: { kind: k } });
    else {   // stray-knob: the hand brushes another knob on its way
      out.push(a);
      const mouse = /^(click|key|hold|drag)$/.test(a.kind);
      out.push(mouse ? { id: id++, at: a.at + 300, intent: a.intent, kind: 'drag', sel: `#sliders .gauge:nth-child(${1 + Math.floor(rng() * 5)})`, dy: (rng() < 0.5 ? -1 : 1) * (6 + Math.floor(rng() * 12)), expect: [], slip: { kind: k, of: a.id } }
        : { id: id++, at: a.at + 300, intent: a.intent, kind: 'move.knob', knob: Math.floor(rng() * 7), shift: rng() < 0.4, turns: (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3)), expect: [], slip: { kind: k, of: a.id } });
    }
  }
  return out;
}

// ---- the accident tagger ----
/**
 * Read a setlog's entries against the actions that ran: runs = [{ id, t0, t1 }] in setlog time (ms), script = the
 * actions (with expect and slip). Every entry inside an action's window that the action meant (each expected target
 * once: a second entry of it is a double press) is intended; anything else is an accident: destructive, harmless
 * (audible) or silent, with its cause (the slip kind, 'side effect' when the action had no slip, 'unattributed' outside
 * every window). Returns { entries: [{ …entry, action, intent, class, cause, intended }], accidents: { destructive,
 * harmless, silent, byCause } }.
 */
export function tagAccidents(entries, runs, script) {
  const byId = new Map(script.map(a => [a.id, a])), used = new Map(), tagged = [];
  for (const e of entries) {
    const r = runs.find(x => e.t >= x.t0 && e.t <= x.t1), a = r ? byId.get(r.id) : null;
    // each target an action meant counts once: the same target again in its window (a double press) was not meant
    let intended = false;
    if (a) { const seen = used.get(a.id) || new Set(); intended = a.expect.some(p => matches(p, e.target)) && !seen.has(e.target); seen.add(e.target); used.set(a.id, seen); }
    const cls = intended ? 'intended' : classOf(e), cause = intended ? null : !a ? 'unattributed' : a.slip ? a.slip.kind : 'side effect';
    tagged.push({ ...e, action: a?.id ?? null, intent: a?.intent ?? null, intended, class: cls, cause });
  }
  const acc = tagged.filter(e => !e.intended), byCause = {};
  for (const e of acc) { const c = (byCause[e.cause] ||= { destructive: 0, harmless: 0, silent: 0 }); c[e.class]++; }
  return { entries: tagged, accidents: { destructive: acc.filter(e => e.class === 'destructive').length, harmless: acc.filter(e => e.class === 'harmless').length, silent: acc.filter(e => e.class === 'silent').length, byCause } };
}

// ---- glance trials (glance.mjs, A2) ----
export const GLANCE_PAGES = ['rhythm', 'sound', 'step', 'slots'];
/** n trials: { trial, lane (1-based), page, knob (rhythm / sound), step (step page, 1-based) }; seeded. */
export function glanceTrials(n = 20, seed = 1, lanes = 4) {
  const rng = mulberry32(seed * 31337 + 5);
  return Array.from({ length: n }, (_, i) => { const page = GLANCE_PAGES[Math.floor(rng() * 4)]; return { trial: i + 1, lane: 1 + Math.floor(rng() * lanes), page, knob: Math.floor(rng() * 7), step: 1 + Math.floor(rng() * 8) }; });
}
/** A judge's words → one of GLANCE_PAGES (or null): "step 5" → step, "sound page" → sound, "slot" → slots. */
export function pageWord(s) { const w = String(s || '').toLowerCase(); return /slot/.test(w) ? 'slots' : /step/.test(w) ? 'step' : /sound|timbre|tone/.test(w) ? 'sound' : /rhythm|pattern|main|lane page/.test(w) ? 'rhythm' : null; }
/** key: the trials; answers: [{ trial, page, lane }] from the judges. A trial is right when page and lane both are. */
export function scoreGlance(key, answers, pass = 18) {
  const by = new Map(answers.map(a => [+a.trial, a]));
  const rows = key.map(k => { const a = by.get(k.trial), page = pageWord(a?.page), lane = a ? parseInt(a.lane, 10) : NaN; return { trial: k.trial, page: k.page, lane: k.lane, said: a ? { page: a.page, lane: a.lane } : null, pageOk: page === k.page, laneOk: lane === k.lane, ok: page === k.page && lane === k.lane }; });
  const right = rows.filter(r => r.ok).length;
  return { right, of: rows.length, pass: right >= Math.min(pass, rows.length) && rows.length > 0, pageRight: rows.filter(r => r.pageOk).length, laneRight: rows.filter(r => r.laneOk).length, rows };
}

// ---- the Move drawn (moveview.mjs, A10) ----
/** ledState (movewire: key = status × 256 + id → palette index) → { pads[32] (0 = bottom-left), steps[16], buttons { name } }. */
export function ledsOf(state) {
  const m = new Map(state), pads = [], steps = [], buttons = {};
  for (let i = 0; i < 32; i++) pads.push(m.get(0x90 * 256 + MOVE.PAD + i) ?? 0);
  for (let i = 0; i < 16; i++) steps.push(m.get(0x90 * 256 + MOVE.STEP + i) ?? 0);
  for (const [n, cc] of Object.entries(MOVE.BTN)) buttons[n] = m.get(0xB0 * 256 + cc) ?? 0;
  return { pads, steps, buttons };
}
const LABEL = { shift: 'Shift', layout: 'Layout', back: 'Back', capture: 'Capture', minus: '−', plus: '+', undo: 'Undo', loop: 'Loop', duplicate: 'Copy', left: '◀', right: '▶', play: '▶', record: '●', mute: 'Mute', sampling: 'Sample', delete: 'Delete', track1: '', track2: '', track3: '', track4: '' };
/** An SVG of the Move's face with its lights as the page left them. hex(i) = palette index → '#rrggbb'. */
export function drawMove(leds, hex) {
  const lit = (i) => (i ? hex(i) : '#1b1b1f'), W = 980, H = 560, o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="28" fill="#2a2a2e"/>`);
  o.push('<rect x="40" y="36" width="250" height="70" rx="6" fill="#050506"/>');   // the display: dark (screen-off test)
  for (let k = 0; k < 8; k++) o.push(`<circle cx="${340 + k * 70}" cy="72" r="24" fill="#3a3a40" stroke="#555" stroke-width="2"/>`);   // 8 knobs
  o.push('<circle cx="905" cy="72" r="30" fill="#3a3a40" stroke="#555" stroke-width="2"/>');   // the wheel
  const btn = (n, x, y, w = 56, h = 30) => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${lit(leds.buttons[n])}" stroke="#555"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" font-family="sans-serif" font-size="13" text-anchor="middle" fill="${leds.buttons[n] ? '#000' : '#9a9aa2'}">${LABEL[n]}</text>`);
  // track buttons: track 1 (top) … track 4 (bottom), left of the pads
  ['track1', 'track2', 'track3', 'track4'].forEach((n, r) => btn(n, 40, 150 + r * 62, 56, 50));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) { const i = (3 - r) * 8 + c; o.push(`<rect x="${120 + c * 70}" y="${150 + r * 62}" width="58" height="50" rx="6" fill="${lit(leds.pads[i])}"/>`); }
  for (let s = 0; s < 16; s++) o.push(`<rect x="${120 + s * 35}" y="${410}" width="28" height="22" rx="4" fill="${lit(leds.steps[s])}"/><text x="${134 + s * 35}" y="448" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#9a9aa2">${s + 1}</text>`);
  [['shift', 40, 470], ['layout', 110, 470], ['back', 180, 470], ['capture', 250, 470], ['minus', 320, 470], ['plus', 390, 470], ['undo', 460, 470], ['loop', 530, 470], ['duplicate', 600, 470], ['left', 670, 470], ['right', 740, 470]].forEach(([n, x, y]) => btn(n, x, y));
  [['play', 720, 150], ['record', 800, 150], ['mute', 720, 200], ['sampling', 800, 200], ['delete', 720, 250]].forEach(([n, x, y]) => btn(n, x, y, 66, 38));
  o.push('</svg>');
  return o.join('');
}

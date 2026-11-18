// RD-1 player-agent sessions (DECISION A2, A3, A10 "run by agents"): the pure parts of session.mjs, glance.mjs and
// moveview.mjs. A seeded performer turns musical intentions into timed actions (Move bytes, clicks, keys), the slip
// injector spoils some of them the way hands do, and the accident tagger reads the page's setlog against what the
// script meant to change. No browser here: unit-tested in orbit2/test/session.test.js.
import { mulberry32 } from '../src/poly/dice.js';
import { SOUND_KEYS } from '../src/poly/lanes.js';
import { PAD_FIRST, STEP_FIRST, ENCODER_FIRST_CC, WHEEL_CC, BUTTON } from 'movewire';

// ---- the Move on the wire (movewire's protocol: pads 68+, steps 16+, encoders CC 71–78 relative, buttons by CC) ----
export const MOVE = { PAD: PAD_FIRST, STEP: STEP_FIRST, ENC: ENCODER_FIRST_CC, WHEEL: WHEEL_CC, BTN: BUTTON };
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
/** RD-5: the mouse drags the console's knob row (rhythm page, the Move's order: app.js RHYTHM_KEYS, knob 8 = tempo), as
 *  the 1-based slot of each setlog target. (RD-1 dragged #sliders in PARAMS order.) */
export const MOUSE_GAUGE = { length: 1, euclidK: 2, rotation: 3, ratio: 4, swing: 5, prob: 6, tune: 7, tempo: 8 };
export const knobSel = (n) => `#knobs > :nth-child(${n}) .gauge`;

// ---- what counts as what (DECISION A3) ----
const DESTRUCTIVE = new Set(['init', 'randomize', 'clear', 'load', 'slot', 'chain']);   // a slot recall or a chain loads a slot: a load
const SILENT = new Set(['select', 'export', 'slot.save', 'record']);
const WORDS = new Set(['undo', 'redo']);   // they log the pattern in words ("4 lanes · 6 hits"): the same words are not the same pattern
/**
 * A lane left with no hits (the hits knob at 0; one click down on a hand-drawn lane re-fills it from E(0)). Not one of
 * A3's classes, so it never changes one: the tags and the summary report it beside them, for Noor to weigh.
 */
export const emptied = (e) => (/^lane\d+\.hits$/.test(e.target) && /x/.test(e.before ?? '') && !/x/.test(e.after ?? '')) || (/^lane\d+\.euclidK$/.test(e.target) && e.before > 0 && e.after === 0);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** A3's words: destructive (stop, load, init, randomize, clear, a kick muted) | silent (nothing heard changes) | harmless (all else that sounds). */
export function classOf(e) {
  if (e.target === 'transport') return e.after === 'stopped' ? 'destructive' : 'harmless';
  if (e.target === 'chain' && !(Array.isArray(e.after) && e.after.length)) return 'silent';   // a chain cleared loads nothing
  if (DESTRUCTIVE.has(e.target)) return 'destructive';
  if (/^lane\d+\.mute$/.test(e.target) && e.after === true && /kick/.test(e.voice || '')) return 'destructive';
  // a value turned and brought back to where it began (a lane's, the tempo, the filter); loads return above
  if (SILENT.has(e.target) || (!WORDS.has(e.target) && 'before' in e && same(e.before, e.after))) return 'silent';
  return 'harmless';
}
// an expectation: a target ('select'), a family ('lane2.hits.*') or a target and the value it should end on
// ('lane1.mute=false': a press meant to bring the kick back that mutes it instead is not what the hand meant)
const matches = (pat, e) => { const [p, v] = pat.split('='); return (p === e.target || (p.endsWith('*') && e.target.startsWith(p.slice(0, -1)))) && (v === undefined || String(e.after) === v); };

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
 * start, before speed), g (which intention it belongs to: a drop's mute and unmute share one), intent, kind, …args,
 * expect: [setlog targets it means to change ('lane2.hits.*' = any step, 'lane1.mute=false' = and the value it ends on)],
 * hold (ms the hands keep something down) }. The selected lane and the mutes are tracked, so the expectations name the
 * right lane and direction.
 */
export function performer({ seed = 1, minutes = 40, persona = 'noor', mouse = false, intents = null, lanes = 4 } = {}) {
  const rng = mulberry32(seed * 7919 + 17), p = typeof persona === 'string' ? PERSONAS[persona] : persona, w = intents || p.intents;
  const out = [], end = minutes * 60000; let t = 1000, sel = 0, playing = false, evolving = false, id = 0, g = 0;
  const muted = new Set(), saved = new Set();
  const add = (o) => { out.push({ id: id++, at: Math.round(t), g, ...o }); t += (o.hold || 0) + 400 + rng() * 600; };
  const select = (li, intent) => { if (li === sel) return; sel = li; add(mouse ? { intent, kind: 'click', sel: `#legend li:nth-child(${li + 1}) .lane-tab`, expect: ['select'] } : { intent, kind: 'move.select', lane: li, expect: ['select'] }); };
  const play = (intent) => { playing = !playing; add(mouse ? { intent, kind: pick(rng, ['click', 'key']), sel: '#btn-play', key: ' ', expect: ['transport'] } : { intent, kind: 'move.play', expect: ['transport'] }); };
  const muteAct = (li, on, intent) => mouse ? { intent, kind: 'click', sel: '#btn-mute', expect: [`lane${li + 1}.mute=${on}`] } : { intent, kind: 'move.mute', lane: li, expect: [`lane${li + 1}.mute=${on}`] };
  play('start');
  while (t < end) {
    const intent = weighted(rng, w); g++;
    if (intent === 'build') {
      const li = Math.floor(rng() * lanes); select(li, intent);
      for (let k = 0, n = 2 + Math.floor(rng() * 4); k < n; k++) {
        const step = Math.floor(rng() * 8);
        add(mouse ? { intent, kind: 'click', sel: `#stepsui button:nth-child(${step + 1})`, expect: [`lane${li + 1}.hits.*`, `lane${li + 1}.accents.*`, `lane${li + 1}.locks.*`] } : { intent, kind: 'move.step', step, expect: [`lane${li + 1}.hits.*`] });
      }
    } else if (intent === 'mute' || intent === 'drop') {
      const li = intent === 'drop' ? 0 : 1 + Math.floor(rng() * (lanes - 1)), on = !muted.has(li); on ? muted.add(li) : muted.delete(li);
      if (mouse) select(li, intent);
      add(muteAct(li, on, intent));
      if (intent === 'drop') { t += 2000 + rng() * 4000; muted.delete(li); add(muteAct(li, false, intent)); }
    } else if (intent === 'fill') {
      add(mouse ? { intent, kind: 'hold', sel: '#btn-fill', hold: 1500 + rng() * 1500, expect: [] } : { intent, kind: 'move.hold', button: 'layout', hold: 1500 + rng() * 1500, expect: [] });
    } else if (intent === 'knobs') {
      const sound = !mouse && rng() < 0.6, k = sound ? Math.floor(rng() * SOUND_KEYS.length) : [0, 1, 2, 4, 5][Math.floor(rng() * 5)];
      const target = sound ? `lane${sel + 1}.sound.${SOUND_KEYS[k]}` : `lane${sel + 1}.${KNOB_TARGETS[k]}`, turns = (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 6));
      // what the knob does to the steps is the turn too: a shorter lane keeps only the hits that fit (Lane.resize clamps
      // euclid hits), and the hits knob re-fills the lane from E(k), so on a hand-drawn lane held at 0 it logs the steps
      const expect = sound ? [target] : k === 0 ? [target, `lane${sel + 1}.euclidK`] : k === 1 ? [target, `lane${sel + 1}.hits*`] : [target];
      add(mouse ? { intent, kind: 'drag', sel: knobSel(MOUSE_GAUGE[KNOB_TARGETS[k]]), dy: -turns * 6, expect } : { intent, kind: 'move.knob', knob: k, shift: sound, turns, expect });
    } else if (intent === 'evolve') {
      if (mouse) { add({ intent, kind: 'click', sel: '#btn-evolve', expect: ['evolve'] }); } else add({ intent, kind: 'move.button', button: 'minus', expect: ['evolve'] });
      evolving = !evolving;
    } else if (intent === 'slots' && !mouse) {
      const s = Math.floor(rng() * 4);
      if (!saved.has(s) || rng() < 0.3) { saved.add(s); add({ intent, kind: 'move.slotSave', slot: s, expect: ['slot.save'] }); }
      else add({ intent, kind: 'move.slotRecall', slot: s, expect: ['slot'] });
    } else if (intent === 'tempo') {
      const d = rng() < 0.5 ? -2 : 2;
      add(mouse ? { intent, kind: 'drag', sel: knobSel(MOUSE_GAUGE.tempo), dy: -d * 3, expect: ['tempo'] } : { intent, kind: 'move.knob', knob: 7, shift: false, turns: d, expect: ['tempo'] });
    }
    t += between(rng, p.rest) * 1000;   // listening
  }
  g++; if (playing) play('end');
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
      out.push(mouse ? { id: id++, at: a.at + 300, g: a.g, intent: a.intent, kind: 'drag', sel: knobSel(1 + Math.floor(rng() * 5)), dy: (rng() < 0.5 ? -1 : 1) * (6 + Math.floor(rng() * 12)), expect: [], slip: { kind: k, of: a.id } }
        : { id: id++, at: a.at + 300, g: a.g, intent: a.intent, kind: 'move.knob', knob: Math.floor(rng() * 7), shift: rng() < 0.4, turns: (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3)), expect: [], slip: { kind: k, of: a.id } });
    }
  }
  return out;
}

// ---- the accident tagger ----
/**
 * Read a setlog's entries against the actions that ran: runs = [{ id, t0, t1 }] in setlog time (ms), script = the
 * actions (with expect and slip). Every entry inside an action's window that the action meant (each expected target
 * once: a second entry of it is a double press; a knob turn or a drag may log twice when it rests, both are the turn)
 * is intended; so is nothing a double press's second press did (its entries come later: one press is one save). The
 * rest are accidents: destructive, harmless (audible) or silent, with their cause: the action's slip, else the slip of
 * an earlier action of the same intention (g: the Mute after a missed lane tab hits the wrong lane because the tab
 * click missed), else 'side effect', or 'unattributed' outside every window. A lane emptied is marked on its entry
 * (emptied) and counted apart (A3 does not name it). Returns { entries: [{ …entry, action, intent, class, cause,
 * intended, emptied? }], accidents: { destructive, harmless, silent, byCause, emptied: { accident, meant } } }.
 */
export function tagAccidents(entries, runs, script) {
  const byId = new Map(script.map(a => [a.id, a])), at = new Map(script.map((a, i) => [a.id, i])), used = new Map(), tagged = [];
  const slipOf = (a) => { if (a.slip) return a.slip.kind; if (a.g == null) return null; for (let i = at.get(a.id) - 1; i >= 0 && script[i].g === a.g; i--) if (script[i].slip && script[i].slip.kind !== 'stray-knob') return script[i].slip.kind; return null; };
  const actionOf = (e) => { const r = runs.find(x => e.t >= x.t0 && e.t <= x.t1); return r ? byId.get(r.id) : null; };
  const first = new Map(); for (const e of entries) { const a = actionOf(e); if (a && !(first.get(a.id) <= e.t)) first.set(a.id, e.t); }
  for (const e of entries) {
    const a = actionOf(e);
    let intended = false;
    if (a) {
      const seen = used.get(a.id) || new Set(), second = a.slip?.kind === 'double' && e.t > first.get(a.id);
      intended = !second && a.expect.some(p => matches(p, e)) && (/^(drag|move\.knob)$/.test(a.kind) || !seen.has(e.target)); seen.add(e.target); used.set(a.id, seen);
    }
    const cls = intended ? 'intended' : classOf(e), cause = intended ? null : !a ? 'unattributed' : slipOf(a) || 'side effect';
    tagged.push({ ...e, action: a?.id ?? null, intent: a?.intent ?? null, intended, class: cls, cause, ...(emptied(e) && { emptied: true }) });
  }
  const acc = tagged.filter(e => !e.intended), byCause = {};
  for (const e of acc) { const c = (byCause[e.cause] ||= { destructive: 0, harmless: 0, silent: 0 }); c[e.class]++; }
  const gone = tagged.filter(e => e.emptied);
  return { entries: tagged, accidents: { destructive: acc.filter(e => e.class === 'destructive').length, harmless: acc.filter(e => e.class === 'harmless').length, silent: acc.filter(e => e.class === 'silent').length, byCause, emptied: { accident: gone.filter(e => !e.intended).length, meant: gone.filter(e => e.intended).length } } };
}

// ---- glance trials (glance.mjs, A2) ----
export const GLANCE_PAGES = ['rhythm', 'sound', 'step', 'slots'];
/** n trials: { trial, lane (1-based), page, knob (rhythm / sound), step (step page, 1-based) }; seeded. pages: the pages
 *  in play (RD-5 judges rhythm / sound only); every trial draws four numbers, so a seed keeps its lanes and knobs.
 *  RD-6: half the step-page trials turn a knob on the held step too (turn; the other half only hold it), picked by a
 *  stream of their own, so the four numbers stay the seed's. */
export function glanceTrials(n = 20, seed = 1, lanes = 4, pages = GLANCE_PAGES) {
  const rng = mulberry32(seed * 31337 + 5);
  const out = Array.from({ length: n }, (_, i) => { const page = pages[Math.floor(rng() * pages.length)]; return { trial: i + 1, lane: 1 + Math.floor(rng() * lanes), page, knob: Math.floor(rng() * 7), step: 1 + Math.floor(rng() * 8) }; });
  const st = out.filter(k => k.page === 'step'), r2 = mulberry32(seed * 7907 + 13);
  for (let i = st.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [st[i], st[j]] = [st[j], st[i]]; }   // a seeded shuffle: its first half turn
  st.forEach((k, i) => { k.turn = i < Math.floor(st.length / 2); });
  return out;
}
/** A judge's words → one of GLANCE_PAGES (or null): "step 5" → step, "sound page" → sound, "slot" → slots. */
export function pageWord(s) { const w = String(s || '').toLowerCase(); return /slot/.test(w) ? 'slots' : /step/.test(w) ? 'step' : /sound|timbre|tone/.test(w) ? 'sound' : /rhythm|pattern|main|lane page/.test(w) ? 'rhythm' : null; }
const num = (x) => { const d = /\d+/.exec(String(x ?? '')); return d ? +d[0] : NaN; };   // "step 5", "5", 5 → 5
/** key: the trials; answers: [{ trial, page, lane, step? }] from the judges. A trial is right when page and lane both
 *  are; with ask naming 'step' (RD-6: the judge names the held step too) a step-page trial also needs its step. */
export function scoreGlance(key, answers, pass = 18, ask = ['page', 'lane']) {
  const by = new Map(answers.map(a => [+a.trial, a])), steps = ask.includes('step');
  const rows = key.map(k => {
    const a = by.get(k.trial), page = pageWord(a?.page), lane = a ? parseInt(a.lane, 10) : NaN, isStep = steps && k.page === 'step';
    const pageOk = page === k.page, laneOk = lane === k.lane, stepOk = !isStep || num(a?.step) === k.step;
    return { trial: k.trial, page: k.page, lane: k.lane, ...(isStep && { step: k.step, turn: !!k.turn }), said: a ? { page: a.page, lane: a.lane, ...(steps && { step: a.step ?? null }) } : null, pageOk, laneOk, ...(isStep && { stepOk }), ok: pageOk && laneOk && stepOk };
  });
  const right = rows.filter(r => r.ok).length, byPage = {};
  for (const r of rows) { const b = (byPage[r.page] ||= { right: 0, of: 0 }); b.of++; if (r.ok) b.right++; }
  return { right, of: rows.length, pass: right >= Math.min(pass, rows.length) && rows.length > 0, pageRight: rows.filter(r => r.pageOk).length, laneRight: rows.filter(r => r.laneOk).length, ...(steps && { stepRight: rows.filter(r => r.stepOk === true).length }), byPage, rows };
}

// ---- the night run of the label ladder (night-ladder.mjs, RD-8) ----
/** Yuki's floors (proposals/yuki/answers.md §1): a known word at 13 px, a number read in a glance at 15 px. */
export const NIGHT_FLOORS = { word: 13, number: 15 };
/** A text's words and numbers in order, upper case: "CONGA 16 × 4 · −2 MS" → CONGA 16 4 -2 MS (separators, %, × and a
 *  typed x between numbers dropped; − read as -). [{ t, kind: 'word' | 'number' }] */
export function nightTokens(s) {
  const out = [];
  for (const [t] of String(s ?? '').replace(/[−–]/g, '-').matchAll(/-?\d+|[a-z]+/gi)) if (!/^x$/i.test(t)) out.push({ t: t.toUpperCase(), kind: /\d/.test(t) ? 'number' : 'word' });
  return out;
}
/** Which of a's tokens a longest common subsequence with b keeps (a reading that skips or adds a word loses only that). */
function lcsHits(a, b) {
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)), hit = new Array(a.length).fill(false);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { hit[i++] = true; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
  return hit;
}
/**
 * What one picture's canvas says, as items to read. light = `__poly.scene.light` at the shutter (what that frame drew),
 * slots = { current, pending, count } (0-based, −1 = none). Only what was drawn: the label and the arc's words when they
 * fit their band, the moons' numbers by the ladder's plan (all: the playing and the queued at 15 px, the rest 13 px dim;
 * some: those two), the caption's lines. px as scene.js sets them; dim = set at 55 % white (the other moons' numbers),
 * not 78 % or brighter. [{ item, text, px, curve, dim, tokens }]
 */
export function nightItems(light, slots, px = { label: 13, number: 15, sun: 40, caps: 11, caption: 13 }) {
  const items = [], add = (item, text, size, curve, dim = false) => { const tokens = nightTokens(text); if (tokens.length) items.push({ item, text: String(text), px: size, curve, dim, tokens }); };
  if (light.label && light.labelFits) add('label', light.label, px.label, true);
  if (light.gen && light.genFits) add('arc', light.gen, px.label, true);
  if (light.sun) { add('sun', light.sun, px.sun, false); add('sun word', 'BEATS', px.caps, false); }
  const nums = light.moons ? light.plan?.slotNumbers : 'none', cur = slots?.current ?? -1, pend = slots?.pending ?? -1;
  if (nums === 'all' || nums === 'some') {
    if (cur >= 0) add('playing moon', cur + 1, px.number, false);
    if (pend >= 0) add('queued moon', pend + 1, px.number, false);
    if (nums === 'all') add('moon numbers', Array.from({ length: slots?.count ?? 16 }, (_, k) => k + 1).filter(k => k !== cur + 1 && k !== pend + 1).join(' '), px.label, false, true);
  }
  (light.lines || []).forEach((l, k) => add(`caption ${k + 1}`, l, px.caption, false));
  return items;
}
/**
 * A reader's answer { label, arc, sun, sunWord, moons: { numbers: [..], playing, queued }, caption: [lines] } against
 * nightItems: every token read right or not, with its size against its floor (a word ≥ 13 px, a number ≥ 15 px). The
 * caption is read as one text (a reader may split or join its lines), the moons' numbers as a set. { read, of, floor:
 * { at, below } ({ read, of } each), by (per kind, px and curve), rows }
 */
export function scoreNight(items, ans, floors = NIGHT_FLOORS) {
  const said = { label: ans?.label, arc: ans?.arc, sun: ans?.sun, 'sun word': ans?.sunWord, 'playing moon': ans?.moons?.playing, 'queued moon': ans?.moons?.queued };
  const caps = items.filter(i => /^caption/.test(i.item)), capHit = lcsHits(caps.flatMap(i => i.tokens.map(t => t.t)), nightTokens((ans?.caption || []).join(' · ')).map(t => t.t));
  const moonSet = new Set((ans?.moons?.numbers || []).map(x => String(parseInt(x, 10)))), rows = []; let c = 0;
  for (const it of items) {
    const hit = /^caption/.test(it.item) ? it.tokens.map(() => capHit[c++]) : it.item === 'moon numbers' ? it.tokens.map(t => moonSet.has(t.t)) : lcsHits(it.tokens.map(t => t.t), nightTokens(said[it.item]).map(t => t.t));
    it.tokens.forEach((t, k) => rows.push({ item: it.item, t: t.t, kind: t.kind, px: it.px, curve: it.curve, dim: !!it.dim, atFloor: it.px >= floors[t.kind], read: !!hit[k] }));
  }
  const tally = (rs) => ({ read: rs.filter(r => r.read).length, of: rs.length }), by = {};
  for (const r of rows) { const b = (by[`${r.kind} ${r.px} px ${r.curve ? 'curve' : 'straight'}${r.dim ? ' dim' : ''}`] ||= { kind: r.kind, px: r.px, curve: r.curve, dim: r.dim, atFloor: r.atFloor, read: 0, of: 0 }); b.of++; if (r.read) b.read++; }
  return { ...tally(rows), floor: { at: tally(rows.filter(r => r.atFloor)), below: tally(rows.filter(r => !r.atFloor)) }, by, rows };
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

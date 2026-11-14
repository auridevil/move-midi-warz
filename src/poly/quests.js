// I6 quests and I7 simple mode: pure data and checks, no DOM (the app draws the card and keeps the event log).
// A quest is { id, title, on, drawer, hint(machine, say), check(machine, events) }. machine = a lanes.js Machine (or
// anything with its shape: lanes[] with length / ratio / rotation / muted / voice / name / euclidK / euclidMode,
// played(), hitAt(), and meter); events = what you did since the quest became the current one, oldest first:
//   { type: 'edit', lane, k }   a lane knob or gesture you moved (k: 'length' | 'ratio' | 'rotation' | 'euclid' | …)
//   { type: 'bar', evolving }   a bar line went by while playing (evolving: evolve was on)
//   { type: 'slot-save', slot } { type: 'export', what }
// A check needs your own move as well as the result, so a beat that already happens to be "3 against 4" does not tick
// the quest by itself. on: the event types that can finish it; the app checks right after one of them, so a result
// that evolve, a slot or an undo brings later is not credited to an older move. hint(m, say): the card's words for the
// beat on screen; say = { word(k): a lane knob's label as shown (plain in simple), lane(i): a lane as the screen names
// it }. drawer: the panel the quest is played in (its hint lights there).
import { RATIOS } from './lanes.js';

export const QUESTS_KEY = 'midi-warz.poly.quests';
export const VIEWS = ['simple', 'all'];

/** I7 plain words: the lane knobs a beginner sees, by PARAMS key (app.js). Unlisted keys keep their label. */
export const PLAIN = { euclid: 'hits', rotation: 'shift', ratio: 'speed', prob: 'chance' };
export const paramLabel = (k, label, simple) => (simple && PLAIN[k]) || label;

const EPS = 1e-9;
const ratioOf = (l) => (Number.isFinite(l.ratio) ? l.ratio : RATIOS[l.ratioIndex] ?? 1);
/** Does step i of the loop play, read through rotation `rot` (the lane's own unless given)? As Lane.hitAt. */
const playsAt = (l, i, rot = l.rotation) => l.played((((i - rot) % l.length) + l.length) % l.length);
/** A lane you can hear: not muted, and at least one of its steps plays. */
export const sounding = (l) => !l.muted && Array.from({ length: l.length }, (_, i) => l.hitAt(i)).some(Boolean);
/** A lane's loop in quarter notes (a step is a quarter at speed ×1). */
export const loopQuarters = (l) => l.length / ratioOf(l);

/** Two lanes you can hear whose loops are 3 : 4 long (lengths 3 and 4 at one speed, or one length at speeds 4 and 3). */
export function threeAgainstFour(m) {
  const q = m.lanes.filter(sounding).map(loopQuarters);
  return q.some((a, i) => q.some((b, j) => i !== j && Math.abs(a * 4 - b * 3) < EPS));
}

/** The snare lanes: a snare or clap voice; if none, the lane that started as the snare. */
export function snareLanes(m) {
  const by = m.lanes.map((l, i) => i).filter(i => /snare|clap|snap/.test(m.lanes[i].voice || ''));
  return by.length ? by : m.lanes.map((l, i) => i).filter(i => m.lanes[i].name === 'snare');
}
/** The grid alone (no meter, no mute): through rotation `rot`, over a whole number of bars, the lane's hits land on
 *  beats 2 and 4 and never on 1 or 3 (offbeat ghosts are fine). */
function backbeatAt(l, rot) {
  const r = ratioOf(l), loop = loopQuarters(l), whole = (x) => Math.abs(x - Math.round(x)) < EPS;
  let n = 1; while (n < 16 && !whole(loop * n / 4)) n++;   // n loops = a whole number of bars (or 16 loops, enough to tell)
  const span = Math.max(4, loop * n), seen = new Set();
  for (let k = 0; k * (1 / r) < span - EPS; k++) {
    if (!playsAt(l, k % l.length, rot)) continue; const q = (k / r) % 4, beat = Math.round(q);
    if (Math.abs(q - beat) >= EPS) continue; const b = beat % 4; if (b === 0 || b === 2) return false;   // a hit on 1 or 3: no
    seen.add(b);
  }
  return seen.has(1) && seen.has(3);
}
/** In 4/4, heard: lane li on beats 2 and 4, through rotation `rot` (its own unless given). */
export function onTwoAndFour(m, li, rot) {
  const l = m.lanes[li]; return !!l && (!m.meter || m.meter === '4/4') && sounding(l) && backbeatAt(l, rot);
}
/**
 * What lane li needs before turning "shift" can put it on 2 and 4: [] when a shift is all it takes. Else 4/4, an
 * unmute, and when no shift of its steps lands on 2 and 4, the knobs of a plain backbeat it lacks: 4 steps at speed 1
 * with 2 hits (beats 1 and 3: a shift away). [{ k: 'meter' | 'mute' | 'length' | 'ratio' | 'mode' | 'euclid', v }],
 * the values as the knobs show them; the knobs in any order get there (the length knob re-spreads the hits a hits knob
 * set), the euclid mode first: in AND / XOR the hits knob only moves a mask over the steps you set.
 */
export function backbeatSetup(m, li) {
  const l = m.lanes[li], need = [], mode = l.euclidMode || 'replace';
  if (m.meter && m.meter !== '4/4') need.push({ k: 'meter', v: '4/4' });
  if (l.muted) need.push({ k: 'mute', v: false });
  if (Array.from({ length: l.length }, (_, r) => r).some(r => backbeatAt(l, r))) return need;
  if (l.length !== 4) need.push({ k: 'length', v: 4 });
  if (Math.abs(ratioOf(l) - 1) > EPS) need.push({ k: 'ratio', v: 1 });
  // the 2 hits: already x.x. / .x.x in 4 steps, or 2 euclid hits the length knob spreads over 4; else the hits knob
  const two = l.length === 4 && [0, 1, 2, 3].filter(i => l.played(i)).length === 2 && l.played(0) === l.played(2);
  const spreads = mode === 'replace' && l.euclidK === 2 && l.length !== 4;
  if (!two && !spreads) { if (mode !== 'replace') need.push({ k: 'mode', v: 'replace' }); need.push({ k: 'euclid', v: 2 }); }
  return need;
}
/** The snare lane the backbeat quest points at: the first that is only a shift away, else the first (-1: none). */
export function backbeatLane(m) { const s = snareLanes(m); return s.find(li => !backbeatSetup(m, li).length) ?? s[0] ?? -1; }

const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a.at(-1)}` : a.join(''));
/** The words for a backbeat setup (backbeatSetup): 'unmute it, set "length" to 4 and "hits" to 2'. */
function setupWords(need, say) {
  const knobs = need.filter(n => n.k === 'length' || n.k === 'ratio' || n.k === 'euclid').map(n => `"${say.word(n.k)}" to ${n.v}`);
  return and([need.some(n => n.k === 'meter') ? 'set the meter to 4/4 (in "Patterns")' : '', need.some(n => n.k === 'mute') ? 'unmute it' : '',
    need.some(n => n.k === 'mode') ? 'set its "euclid" to "replace" (under "generative", in "everything")' : '', knobs.length ? `set ${and(knobs)}` : ''].filter(Boolean));
}
/** Your latest knob or gesture move: the app checks right after an edit, so it is the move that just happened. */
const lastEdit = (events) => events.findLast(e => e.type === 'edit');

export const QUESTS = [
  { id: 'three-four', title: 'make 3 against 4', drawer: 'lane-drawer', on: ['edit'],
    hint: () => 'Give one ring 3 steps and another 4, both at the same speed (the "length" knob, or pull a ring outwards). They line up every 12 steps.',
    check: (m, ev) => ['length', 'ratio'].includes(lastEdit(ev)?.k) && threeAgainstFour(m) },
  { id: 'backbeat', title: 'rotate the snare onto 2 and 4', drawer: 'lane-drawer', on: ['edit'],
    hint: (m, say) => {
      const li = backbeatLane(m), turn = `turn "${say.word('rotation')}" (or drag along its ring) until it hits on beats 2 and 4, not 1 and 3`;
      if (li < 0) return `Pick the snare lane and ${turn}.`;
      const set = setupWords(backbeatSetup(m, li), say);
      if (!set && onTwoAndFour(m, li)) return `Your snare (${say.lane(li)}) already plays on 2 and 4: pick it and turn "${say.word('rotation')}" away and back (or drag along its ring) to land it there yourself.`;
      return set ? `Your snare is ${say.lane(li)}. Pick it, ${set}; then ${turn}.` : `Your snare is ${say.lane(li)}: pick it and ${turn}.`;
    },
    check: (m, ev) => { const e = lastEdit(ev); return e?.k === 'rotation' && snareLanes(m).includes(e.lane) && onTwoAndFour(m, e.lane); } },
  { id: 'evolve', title: 'let it evolve 8 bars', drawer: 'evolve-drawer', on: ['bar'],
    hint: () => 'Open "Evolve", press ◌ evolve and play: every few bars the rings change by themselves. Listen for 8 bars.',
    check: (m, ev) => ev.filter(e => e.type === 'bar' && e.evolving).length >= 8 },
  { id: 'slot', title: 'save your first slot', drawer: 'patterns-drawer', on: ['slot-save'],
    hint: () => 'Open "Patterns" and long-press a slot (or Shift+click it) to keep this beat there. Tap it later to bring it back.',
    check: (m, ev) => ev.some(e => e.type === 'slot-save') },
  { id: 'export', title: 'export a loop', drawer: 'export-drawer', on: ['export'],
    hint: () => 'Open "Export" and press ⤓ WAV (or ⤓ MIDI): your beat as a file you can drop into any music app.',
    check: (m, ev) => ev.some(e => e.type === 'export') },
];

/** Saved progress: { done: [ids], skipped: [ids], view: 'simple' | 'all' | null, hidden }. done = finished or skipped
 *  (the order walks it); skipped = the ones you passed over (a badge is done but not skipped). Junk is dropped. */
export function questsFrom(o) {
  const ids = new Set(QUESTS.map(q => q.id)), done = Array.isArray(o?.done) ? [...new Set(o.done.filter(id => ids.has(id)))] : [];
  return { done, skipped: Array.isArray(o?.skipped) ? [...new Set(o.skipped.filter(id => done.includes(id)))] : [], view: VIEWS.includes(o?.view) ? o.view : null, hidden: o?.hidden === true };
}
/** The quest to play now: the first one not done, in order (null when all are). */
export const currentQuest = (done) => QUESTS.find(q => !done.includes(q.id)) || null;
/** A first visit starts simple; someone who already has a beat saved here starts with everything they had. */
export const startView = (saved, firstVisit) => saved || (firstVisit ? 'simple' : 'all');
/** The drawer whose hint is lit: the current quest's, so finishing one quest lights the next one's drawer. */
export const hintDrawer = (done) => currentQuest(done)?.drawer || null;

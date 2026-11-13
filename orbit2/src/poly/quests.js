// I6 quests and I7 simple mode: pure data and checks, no DOM (the app draws the card and keeps the event log).
// A quest is { id, title, hint, drawer, check(machine, events) }. machine = a lanes.js Machine (or anything with its
// shape: lanes[] with length / ratio / rotation / muted / voice / name, played(), hitAt(), and meter); events = what
// you did since the quest became the current one, oldest first:
//   { type: 'edit', lane, k }   a lane knob or gesture you moved (k: 'length' | 'ratio' | 'rotation' | 'euclid' | …)
//   { type: 'bar', evolving }   a bar line went by while playing (evolving: evolve was on)
//   { type: 'slot-save', slot } { type: 'export', what }
// A check needs your own move (an edit, a bar, a save) as well as the result, so a beat that already happens to be
// "3 against 4" does not tick the quest by itself. drawer: the panel the quest is played in (its hint lights there).
import { RATIOS } from './lanes.js';

export const QUESTS_KEY = 'midi-warz.orbit2.quests';
export const VIEWS = ['simple', 'all'];

/** I7 plain words: the lane knobs a beginner sees, by PARAMS key (app.js). Unlisted keys keep their label. */
export const PLAIN = { euclid: 'hits', rotation: 'shift', ratio: 'speed', prob: 'chance' };
export const paramLabel = (k, label, simple) => (simple && PLAIN[k]) || label;

const EPS = 1e-9;
const ratioOf = (l) => (Number.isFinite(l.ratio) ? l.ratio : RATIOS[l.ratioIndex] ?? 1);
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
/** In 4/4: the lane's hits, over a whole number of bars, land on beats 2 and 4 and never on 1 or 3 (offbeat ghosts are fine). */
export function onTwoAndFour(m, li) {
  const l = m.lanes[li]; if (!l || (m.meter && m.meter !== '4/4') || !sounding(l)) return false;
  const r = ratioOf(l), loop = loopQuarters(l), whole = (x) => Math.abs(x - Math.round(x)) < EPS;
  let n = 1; while (n < 16 && !whole(loop * n / 4)) n++;   // n loops = a whole number of bars (or 16 loops, enough to tell)
  const span = Math.max(4, loop * n), seen = new Set();
  for (let k = 0; k * (1 / r) < span - EPS; k++) {
    if (!l.hitAt(k % l.length)) continue; const q = (k / r) % 4, beat = Math.round(q);
    if (Math.abs(q - beat) < EPS) seen.add(beat % 4);
  }
  return seen.has(1) && seen.has(3) && !seen.has(0) && !seen.has(2);
}

const edited = (events, keys, lanes = null) => events.some(e => e.type === 'edit' && keys.includes(e.k) && (!lanes || lanes.includes(e.lane)));

export const QUESTS = [
  { id: 'three-four', title: 'make 3 against 4', drawer: 'lane-drawer',
    hint: 'Give one ring 3 steps and another 4 (the "length" knob, or pull a ring outwards). They line up every 12.',
    check: (m, ev) => edited(ev, ['length', 'ratio']) && threeAgainstFour(m) },
  { id: 'backbeat', title: 'rotate the snare onto 2 and 4', drawer: 'lane-drawer',
    hint: 'Pick the snare lane and turn "shift" (or drag along its ring) until it hits on beats 2 and 4, not 1 and 3.',
    check: (m, ev) => { const s = snareLanes(m); return edited(ev, ['rotation'], s) && s.some(li => onTwoAndFour(m, li)); } },
  { id: 'evolve', title: 'let it evolve 8 bars', drawer: 'evolve-drawer',
    hint: 'Open "Evolve", press ◌ evolve and play: every few bars the rings change by themselves. Listen for 8 bars.',
    check: (m, ev) => ev.filter(e => e.type === 'bar' && e.evolving).length >= 8 },
  { id: 'slot', title: 'save your first slot', drawer: 'patterns-drawer',
    hint: 'Open "Patterns" and long-press a slot (or Shift+click it) to keep this beat there. Tap it later to bring it back.',
    check: (m, ev) => ev.some(e => e.type === 'slot-save') },
  { id: 'export', title: 'export a loop', drawer: 'export-drawer',
    hint: 'Open "Export" and press ⤓ WAV (or ⤓ MIDI): a loop you can drop into any music app.',
    check: (m, ev) => ev.some(e => e.type === 'export') },
];

/** Saved progress: { done: [ids], view: 'simple' | 'all' | null, hidden }. Unknown ids and junk are dropped. */
export function questsFrom(o) {
  const ids = new Set(QUESTS.map(q => q.id));
  return { done: Array.isArray(o?.done) ? [...new Set(o.done.filter(id => ids.has(id)))] : [], view: VIEWS.includes(o?.view) ? o.view : null, hidden: o?.hidden === true };
}
/** The quest to play now: the first one not done, in order (null when all are). */
export const currentQuest = (done) => QUESTS.find(q => !done.includes(q.id)) || null;
/** A first visit starts simple; someone who already has a beat saved here starts with everything they had. */
export const startView = (saved, firstVisit) => saved || (firstVisit ? 'simple' : 'all');
/** The drawer whose hint is lit: the current quest's, so finishing one quest lights the next one's drawer. */
export const hintDrawer = (done) => currentQuest(done)?.drawer || null;

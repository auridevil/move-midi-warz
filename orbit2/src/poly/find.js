// RD-4 find and one Escape, the pure half: the words a control is found by (its accessible name, where it lives, and the
// synonyms table: plain word ↔ technical word, seeded from Greta's and Rio's feature tables), the ranking, the recents,
// and the one Esc order. The DOM half (reading names off the page, the field, running a result) lives in app.js.
export const FIND_KEY = 'midi-warz.orbit2.find';
export const RECENTS_MAX = 6;

/** Groups of words that mean the same thing here: a control named with any of them is found by all of them. The plain
 *  word the face uses comes first (I7's "hits, shift, speed, chance"), then the musician's and the DAW's words. */
export const SYNONYMS = [
  ['hits', 'euclid', 'euclidean', 'pulses'],
  ['shift', 'rotation', 'rotate'],
  ['speed', 'ratio', 'rate', 'division', 'tuplet', 'polyrhythm'],
  ['chance', 'probability', 'prob', 'odds'],
  ['length', 'len'],
  ['swing', 'shuffle'],
  ['tune', 'pitch', 'transpose'],
  ['velocity', 'vel', 'dynamics'],
  ['push', 'pull', 'late', 'early'],
  ['humanize', 'human', 'feel', 'sloppy'],
  ['stems', 'multitrack', 'tracks', 'daw'],
  ['meter', 'time signature', 'signature'],
  ['tempo', 'bpm', 'faster', 'slower', 'fast', 'slow'],
  ['tap', 'tap tempo'],
  ['mute', 'silence'],
  ['throw', 'echo', 'dub', 'delay'],
  ['filter', 'cutoff', 'lowpass', 'highpass', 'sweep'],
  ['evolve', 'mutate', 'mutation', 'drift', 'generative'],
  ['coupling', 'couple'],
  ['dice', 'seed', 'roll'],
  ['randomize', 'random', 'generate'],
  ['wild', 'chaos'],
  ['init', 'empty', 'blank', 'from scratch', 'start over'],
  ['save', 'store'],
  ['load', 'recall', 'library'],
  ['slots', 'patterns', 'scenes', 'slot'],
  ['chain', 'song', 'arrange', 'arrangement'],
  ['export', 'render', 'bounce', 'download'],
  ['wav', 'audio', 'mixdown'],
  ['midi', 'smf'],
  ['kit', 'drum rack', 'one-shots', 'oneshots'],
  ['sample', 'break'],
  ['mic', 'microphone'],
  ['record', 'rec', 'arm', 'overdub', 'capture'],
  ['quantize', 'snap to grid'],
  ['jam', 'session'],
  ['share', 'url', 'send link'],
  ['focus', 'zen', 'fullscreen'],
  ['help', 'shortcuts', 'keys'],
  ['engine', 'dsp', 'synth'],
  ['condition', 'trig'],
  ['decay', 'release', 'envelope'],
  ['level', 'volume', 'gain', 'louder', 'quieter', 'loud', 'quiet'],
  ['pan', 'stereo'],
  ['drive', 'distortion', 'saturation'],
  ['clock', 'sync', 'follow'],
  ['voice', 'instrument'],
  ['lane', 'track', 'channel'],
  ['steps', 'step', 'sequencer'],
  ['clear', 'erase', 'delete', 'wipe'],
  ['undo', 'revert'],
  ['nerd', 'stats', 'diagnostics', 'debug'],
  ['accent', 'emphasis'],
  ['ring-out', 'ring out', 'tail'],
];

/** The buttons a search RUNS (Enter presses them) rather than shows, by id, with the name the search gives them (the
 *  button's own text is a symbol and a file type) and extra words. Everything else is shown and focused. */
export const ACTIONS = {
  'btn-play': ['play', 'stop start transport'],
  'btn-undo': ['undo', ''], 'btn-redo': ['redo', ''],
  'btn-tap': ['tap tempo', ''],
  'btn-share': ['share link', 'copy'],
  'btn-help': ['help: keys, mouse and the Move', 'move table'],
  'btn-focus': ['focus mode', 'hide panels'],
  'btn-init': ['init pattern', 'start from scratch'],
  'btn-random': ['randomize', 'groove family'],
  'btn-wild': ['wild randomize', ''],
  'btn-save': ['save setup', ''], 'btn-load': ['load setup', ''],
  'btn-clear': ['clear lane', ''],
  'btn-reset': ['reset phase', 'restart'],
  'exp-wav': ['export WAV', 'mix'],
  'exp-stems': ['export stems', 'zip'],
  'exp-mid': ['export MIDI', ''],
  'exp-kit': ['export kit', 'zip'],
  'exp-all': ['export all', 'zip'],
  'exp-link': ['copy share link', ''],
  'share-audio': ['share 4 bars of audio', ''],
  'share-postcard': ['share a postcard (video)', 'webm'],
};
/** What an empty search offers after the recents: the things people reach for (Rio: "the keyboard user's map"). RD-7:
 *  nothing destructive (A3: stop, randomize, init) in it: the list drops open under the field on a click, so a stray
 *  second click there must not stop or wipe the beat (Vera's mis-click run found it); those are one word away. */
export const FIND_DEFAULTS = ['exp-all', 'exp-stems', 'btn-share', 'btn-focus'];
/** A3's destructive actions: never offered unasked. */
export const FIND_UNASKED = ['btn-play', 'btn-random', 'btn-wild', 'btn-init', 'btn-clear', 'btn-load'];

/** Lower-case words of a text: letters and digits, "7/8" and "1:3" kept whole, accents and symbols (⤓ ▶ ×) dropped. */
export function words(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+(?:[/:][a-z0-9]+)*/g) || [];
}
// a one-word member is a key into its group; a phrase ("tap tempo") only lends its words to whatever its group finds
// (else "tempo" would pull in the tap group); a word may sit in several groups
const GROUP_OF = new Map();
for (const g of SYNONYMS) for (const m of g) { const ws = words(m); if (ws.length === 1) GROUP_OF.set(ws[0], [...(GROUP_OF.get(ws[0]) || []), ...g]); }

/** One index entry: `key` (stable: the id, else where + name; recents keep it), `name` (what the list shows), `where`
 *  (the tab · drawer · group it sits in), `action` (Enter runs it), `extra` (words it is found by but not named:
 *  select options, the action's words), `alias` (another name it has, found as its name; the page passes none since
 *  RD-10 removed I7's simple view, whose "shift" was the rotation knob). It is found by its names' words, its where, and
 *  every synonym of those. */
export function entry({ key, name, where = '', action = false, extra = '', alias = '' }) {
  const own = [...new Set([...words(name), ...words(alias)])], near = [...words(where), ...words(extra)];
  const synOf = (ws) => { const out = new Set(); for (const w of ws) for (const s of (GROUP_OF.get(w) || [])) for (const x of words(s)) out.add(x); return out; };
  const syn = [...synOf(own)].filter(w => !own.includes(w));
  return { key, name, where, action, own, syn, near: [...new Set([...near, ...synOf(near)])].filter(w => !own.includes(w) && !syn.includes(w)) };
}

/** How well one query word fits an entry: on its name 6 (whole word) / 5 (start of a word), on a synonym of its name 4 / 3
 *  ("euclid" is the hits knob before a control that only lives near the euclid mask), on its where / extra words and
 *  their synonyms 2 / 1, else 0. "7/8" is one word ("7" finds 7/8 and 7/4 by their start). */
function fit(e, q) {
  const on = (ws) => (ws.includes(q) ? 2 : ws.some(w => w.startsWith(q)) ? 1 : 0);
  return on(e.own) + 4 * !!on(e.own) || on(e.syn) + 2 * !!on(e.syn) || on(e.near);
}

/** The entries for a query, best first: every query word must fit, a query that says the whole name counts one more; ties
 *  go to actions, then to recents (newest first),
 *  then to the shorter name, then to page order. An empty query gives the recents, then the defaults. */
export function search(index, query, recents = [], max = 8) {
  const qs = words(query), rec = (e) => { const i = recents.indexOf(e.key); return i < 0 ? 0 : RECENTS_MAX - i; };
  if (!qs.length) {
    const byKey = new Map(index.map(e => [e.key, e])), out = [];
    for (const k of [...recents, ...FIND_DEFAULTS]) { const e = byKey.get(k); if (e && !out.includes(e)) out.push(e); }
    return out.slice(0, max);
  }
  const scored = [];
  index.forEach((e, i) => {
    let s = 0; for (const q of qs) { const f = fit(e, q); if (!f) return; s += f; }
    // the query says the whole name (each word, or a synonym of it): "tempo" and "bpm" are the knob before "tap tempo"
    if (e.own.every(w => qs.some(q => q === w || (GROUP_OF.get(w) || []).includes(q)))) s += 1;   // one-word synonyms only ("tap tempo" doesn't make "tap" a tempo)
    scored.push({ e, s, a: e.action ? 1 : 0, r: rec(e), i });
  });
  scored.sort((x, y) => y.s - x.s || y.a - x.a || y.r - x.r || x.e.name.length - y.e.name.length || x.i - y.i);
  return scored.slice(0, max).map(x => x.e);
}

/** The saved recents (localStorage text) → keys, newest first. Anything but a list of strings counts as none. */
export function recentsFrom(text) {
  let v; try { v = JSON.parse(text ?? 'null'); } catch { return []; }
  return Array.isArray(v) ? [...new Set(v.filter(k => typeof k === 'string' && k))].slice(0, RECENTS_MAX) : [];
}
/** `key` used now: first, once, the list kept short. */
export const pushRecent = (recents, key) => [key, ...recents.filter(k => k !== key)].slice(0, RECENTS_MAX);

/** Does this key open find? ⌘K / Ctrl+K from anywhere but a text field (it owns its keys: Ctrl+K deletes to the end of
 *  the line there); / from anywhere but a text field or a select (type-ahead). `at` is where the focus is: 'text',
 *  'select' or '' (the page, a button, a knob). */
export function opensFind(e, at = '') {
  if (at === 'text') return false;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) return String(e.key).toLowerCase() === 'k';
  return e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && at !== 'select';
}

/** The one Esc order (DECISION §2: dialog → step page → sheet → focus mode → give the keys back): which of the open
 *  layers one Esc (or one click on empty canvas) closes. `s` says which are open (and drawn) now. */
export const ESC_ORDER = ['dialog', 'step', 'sheet', 'focus', 'keys'];
export const escStep = (s = {}) => ESC_ORDER.find(k => k === 'keys' || s[k]);

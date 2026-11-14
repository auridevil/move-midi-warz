// RD-1 setlog: what the hands did during a set, for the accident budget (DECISION A3). Only with ?setlog in the URL:
// app.js builds the hooks then and never otherwise (no listeners, no cost). Pure: the ring buffer, the reversal tag,
// the pattern diff and the JSON file; attachSetlog takes its window, clock and deferral from the caller (tests fake them).
//
// An entry: { id, t (ms since the log began), source ('pointer' | 'key' | 'move' | 'touch'), target, before, after,
// reversed (the same target set back to what it was within 5 s), reverses (the id it undid), end (a merged knob turn's
// last move), …extra }. Targets: named actions ('transport', 'init', 'randomize', 'clear', 'load', 'undo', 'slot',
// 'export', 'tempo', 'filter', 'evolve', 'record', 'lane2.mute', 'lane2.solo') and model fields from the diff
// ('lane1.hits.5', 'lane3.sound.tone', 'lane2.locks.4', 'lane1.length', 'select', 'meter', 'lanes').

export const SOURCES = ['pointer', 'key', 'move', 'touch'];
export const REVERSE_MS = 5000;   // the same target set back within this = a reversal (a slip caught, or a change of mind)
export const MERGE_MS = 700;      // a knob turn is one entry: moves of one target closer than this fold (as undo folds them)
export const SETLOG_CAP = 5000;   // a 40-minute set of a busy player is ~2000 entries
export const SETLOG_FORMAT = 'orbits-setlog';

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
/** A value small enough to read in the log: long ones (a curve, a lock set) become their size and a short hash. */
export function brief(v) {
  if (typeof v === 'number') return Math.round(v * 1e4) / 1e4;   // 0.5399999999999999 → 0.54
  if (v == null || typeof v !== 'object') return v ?? null;
  const s = JSON.stringify(v); if (s.length <= 120) return v;
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `#${(h >>> 0).toString(36)} (${s.length} chars)`;
}

export class Setlog {
  constructor({ cap = SETLOG_CAP } = {}) { this.cap = cap; this.buf = []; this.head = 0; this.n = 0; this.dropped = 0; }
  get size() { return this.buf.length; }
  /** Oldest first. */
  entries() { return this.buf.length < this.cap ? this.buf.slice() : [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)]; }
  /** Newest first (the reversal and merge look-backs stop at their window). */
  *back() { const n = this.buf.length, top = n < this.cap ? n : this.head; for (let k = 1; k <= n; k++) yield this.buf[(top - k + n) % n]; }
  /**
   * Add { t, source, target, before, after, merge?, …extra }. merge: a continuous control (a knob, a slider): it folds
   * into the newest entry of the same target and source still moving (≤ MERGE_MS since its last move), so a turn logs
   * once, on release, with the value it started from. Returns the entry (new or merged).
   */
  add({ t, source, target, before, after, merge = false, ...extra }) {
    if (merge) for (const e of this.back()) {
      if ((e.end ?? e.t) < t - MERGE_MS) break;
      if (e.target === target) { if (e.merge && e.source === source) { e.after = brief(after); e.end = t; this.tag(e); return e; } break; }
    }
    const e = { id: this.n++, t, source, target, before: brief(before), after: brief(after), reversed: false, ...(merge && { merge: true }), ...extra };
    this.tag(e);
    if (this.buf.length < this.cap) this.buf.push(e); else { this.buf[this.head] = e; this.head = (this.head + 1) % this.cap; this.dropped++; }
    return e;
  }
  /** Reversal: an earlier entry of this target, within REVERSE_MS, whose `before` this entry's `after` puts back. */
  tag(e) {
    e.reversed = false; delete e.reverses;
    for (const p of this.back()) {
      if (p === e) continue; if ((p.end ?? p.t) < e.t - REVERSE_MS) break;
      if (p.target === e.target) { if (!p.reversed && same(p.before, e.after) && !same(e.before, e.after)) { e.reversed = true; e.reverses = p.id; } break; }
    }
  }
  toJSON(meta = {}) {
    return { format: SETLOG_FORMAT, v: 1, ...meta, dropped: this.dropped, entries: this.entries().map(({ merge, ...e }) => e) };
  }
}

// ---- the pattern diff: what an edit changed, from two Machine.toJSON() copies ----
const STEP_ARRAYS = ['hits', 'accents', 'locks', 'trigs'];
const SKIP = new Set(['ratioIndex', 'ratio', 'name']);   // ratio: logged once as `ratio` below (ratioIndex is its old twin)
const steps = (a) => (a || []).map(x => (x ? 'x' : '.')).join('');
/**
 * [{ target, before, after, merge }] from pattern a to pattern b. A step toggled is one entry (lane1.hits.5, 1-based);
 * an edit that moves many steps at once (euclid, rotation, a lock knob over many steps) is one entry for the array; a
 * lane whose own knobs changed (length, euclid, rotation…) logs the knobs only: the steps moved because of them.
 */
export function diffPattern(a, b) {
  const out = [], push = (target, before, after, merge) => out.push({ target, before, after, merge });
  if (!a || !b) return out;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'lanes' || same(a[k], b[k])) continue;
    push(k === 'selected' ? 'select' : k, k === 'selected' ? a[k] + 1 : a[k], k === 'selected' ? b[k] + 1 : b[k], k !== 'selected' && k !== 'meter' && k !== 'kit');
  }
  const la = a.lanes || [], lb = b.lanes || [];
  if (la.length !== lb.length) push('lanes', la.length, lb.length, false);
  for (let i = 0; i < Math.min(la.length, lb.length); i++) {
    const x = la[i], y = lb[i], p = `lane${i + 1}`, own = [];
    if (!same(x.ratio, y.ratio)) own.push([`${p}.ratio`, x.ratio, y.ratio, true]);
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (SKIP.has(k) || STEP_ARRAYS.includes(k) || same(x[k], y[k])) continue;
      if (k === 'sound') { for (const s of Object.keys({ ...x.sound, ...y.sound })) if (!same(x.sound?.[s], y.sound?.[s])) push(`${p}.sound.${s}`, x.sound?.[s], y.sound?.[s], true); continue; }
      if (k === 'muted' || k === 'solo') { push(`${p}.${k === 'muted' ? 'mute' : 'solo'}`, !!x[k], !!y[k], false); continue; }
      own.push([`${p}.${k}`, x[k], y[k], k !== 'voice' && k !== 'evolve' && k !== 'sample']);
    }
    for (const o of own) push(...o);
    if (own.some(o => o[3])) continue;   // the steps followed a knob
    for (const k of STEP_ARRAYS) {
      const ax = x[k] || [], ay = y[k] || [], at = [];
      for (let j = 0; j < Math.max(ax.length, ay.length); j++) if (!same(ax[j] ?? null, ay[j] ?? null)) at.push(j);
      if (at.length === 1) push(`${p}.${k}.${at[0] + 1}`, ax[at[0]] ?? null, ay[at[0]] ?? null, k === 'locks');
      else if (at.length) push(`${p}.${k}`, k === 'hits' || k === 'accents' ? steps(ax) : ax, k === 'hits' || k === 'accents' ? steps(ay) : ay, true);
    }
  }
  return out;
}
/** A pattern in a few words, for the before / after of a load, an init or a roll: "4 lanes · 19 hits". */
export function patternWords(j) {
  const lanes = j?.lanes || []; let hits = 0;
  for (const l of lanes) for (let i = 0; i < (l.length || 0); i++) if (l.hits?.[i]) hits++;
  return `${lanes.length} lanes · ${hits} hit${hits === 1 ? '' : 's'}`;
}

/**
 * The page's hooks, built only with ?setlog. env: { win (addEventListener target), model () → the pattern's toJSON,
 * now () → ms, defer (fn) → runs fn later, off the audio clock }. Returns:
 *   from(source)               the input that acts next (app.js wraps move.receive with 'move')
 *   begin()                    before an action that replaces the pattern: waiting hand edits are diffed now
 *   act(target, before, after, { absorb, …extra })   a named action, logged at once; absorb: its pattern diff is not logged
 *   dirty(machine)             the pattern was saved; machine = the clock did it (evolve, a chain): absorbed, not logged
 *   log, file(meta) → { name, text }
 * Nothing here runs inside the Tone.Loop callback: a save there only marks the log dirty, and the diff runs deferred.
 */
export function attachSetlog({ win, model, now, defer, cap } = {}) {
  const log = new Setlog({ cap }), t0 = now(), started = new Date().toISOString();
  const copy = () => JSON.parse(JSON.stringify(model()));   // toJSON hands out the lanes' own step arrays: keep a copy
  let src = 'pointer', prev = copy(), pend = null, queued = false;
  const at = () => Math.round((now() - t0) * 10) / 10;
  if (win) {
    win.addEventListener('pointerdown', (e) => { src = e.pointerType === 'touch' ? 'touch' : 'pointer'; }, true);
    win.addEventListener('wheel', () => { src = 'pointer'; }, { capture: true, passive: true });
    win.addEventListener('keydown', () => { src = 'key'; }, true);
  }
  const flush = () => {
    queued = false; const p = pend; pend = null; const cur = copy();
    if (p && !p.machine) for (const d of diffPattern(prev, cur)) log.add({ t: p.t, source: p.source, ...d });
    prev = cur;
  };
  const later = () => { if (!queued) { queued = true; defer(flush); } };
  return {
    log,
    get source() { return src; },
    now: at,   // the log's clock (ms since it began): the session tools time their actions on it
    from(s) { src = s; },
    // before an action that changes the pattern: the hand edits still waiting are logged now, as they were
    begin() { if (pend && !pend.machine) flush(); },
    // absorb (called after the action, from a hand's event, never the clock): the action changed the pattern (a load's
    // hundred fields), and that change is the action: the log takes the pattern as it is now, so its diff is not logged
    // again. An action that leaves the pattern alone (a tempo, an export) absorbs nothing
    act(target, before, after, { absorb = false, ...extra } = {}) { log.add({ t: at(), source: src, target, before, after, ...extra }); if (absorb) { pend = null; prev = copy(); } },
    // never diffs here (a clock change saves inside the audio callback); a clock change in the same deferral as a hand
    // edit takes the hand edit with it (both are within one task: rare, and never a false accident)
    dirty(machine = false) { if (pend) pend.machine ||= machine; else pend = { t: at(), source: src, machine }; later(); },
    flush,
    file(meta = {}) { flush(); const d = new Date(); const pad = (n) => String(n).padStart(2, '0'); return { name: `orbits-setlog-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`, text: JSON.stringify(log.toJSON({ started, ...meta }), null, 1) }; },
  };
}

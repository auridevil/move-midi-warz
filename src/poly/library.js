// Named saves: many configurations in this browser's localStorage. Each entry is a whole setup — patterns, voices,
// kit, per-lane sound, locks, trigs, samples (by id), humanize — plus tempo, volume and dice. Pure: storage injected.
export const LIB_KEY = 'midi-warz.poly.library.v1';
const OLD_SAVE = 'midi-warz.poly.saved.v1';

export class Library {
  constructor(store = null) {
    this.store = store; this.items = [];
    try { this.items = JSON.parse(store?.getItem(LIB_KEY) || '[]') || []; } catch { this.items = []; }
    // the single save from before the library becomes its first entry
    try { const old = JSON.parse(store?.getItem(OLD_SAVE) || 'null'); if (old?.m && !this.items.length) { this.items.push({ id: uid(), name: 'saved', t: old.t || Date.now(), tempo: old.tempo, m: old.m }); this.persist(); } } catch {}
  }
  persist() { try { this.store?.setItem(LIB_KEY, JSON.stringify(this.items)); return true; } catch { return false; } }
  /** Newest first. */
  list() { return [...this.items].sort((a, b) => b.t - a.t); }
  get(id) { return this.items.find(i => i.id === id) || null; }
  byName(name) { const n = norm(name); return this.items.find(i => norm(i.name) === n) || null; }
  /** Save under a name; the same name (case-insensitive) overwrites. Returns the entry, or null if storage is full. */
  save(name, data, now = Date.now()) {
    name = (name || '').trim() || this.nextName(); const hit = this.byName(name);
    const entry = { ...(hit || { id: uid() }), name, t: now, ...clone(data) };
    if (hit) this.items[this.items.indexOf(hit)] = entry; else this.items.push(entry);
    if (!this.persist()) { if (hit) this.items[this.items.indexOf(entry)] = hit; else this.items.pop(); return null; }
    return entry;
  }
  overwrite(id, data, now = Date.now()) { const e = this.get(id); return e ? this.save(e.name, data, now) : null; }
  rename(id, name) { const e = this.get(id); name = (name || '').trim(); if (!e || !name) return false; const other = this.byName(name); if (other && other !== e) return false; e.name = name; return this.persist(); }
  remove(id) { const n = this.items.length; this.items = this.items.filter(i => i.id !== id); this.persist(); return this.items.length < n; }
  /** "pattern 3" — the first free number. */
  nextName() { let k = this.items.length + 1; while (this.byName(`pattern ${k}`)) k++; return `pattern ${k}`; }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = (s) => (s || '').trim().toLowerCase();
const clone = (o) => JSON.parse(JSON.stringify(o));

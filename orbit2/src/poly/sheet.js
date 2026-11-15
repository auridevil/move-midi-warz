// RD-3 the sheet's pure half: its six tabs (Greta's feature table), what a saved value may bring back, and where a key
// moves the tab. The DOM half (setSheet, reveal) lives in app.js.
export const SHEET_KEY = 'midi-warz.orbit2.sheet';
export const SHEET_TABS = ['lane', 'pattern', 'groove', 'perform', 'export', 'setup'];

/** The saved sheet (localStorage text) → { tab?, open? }. Only a known tab and a true / false open come back; anything
 *  else (nothing saved, broken JSON, a string, a number, an array, an unknown tab) counts as nothing saved, so a bad value
 *  can never break the page or stay stuck in storage (the next tab click writes a clean one). */
export function sheetFrom(text) {
  let v; try { v = JSON.parse(text ?? 'null'); } catch { return {}; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out = {}; if (SHEET_TABS.includes(v.tab)) out.tab = v.tab; if (typeof v.open === 'boolean') out.open = v.open;
  return out;
}

/** The tab index a key moves to from index `i` along `n` tabs: ← → wrap round, Home the first, End the last; -1 for any
 *  other key (it is not the tab row's). */
export function tabMove(key, i, n = SHEET_TABS.length) {
  return key === 'Home' ? 0 : key === 'End' ? n - 1 : key === 'ArrowRight' ? (i + 1) % n : key === 'ArrowLeft' ? (i - 1 + n) % n : -1;
}

// Master tempo shared by every page (and every open tab): last tempo set anywhere wins.
const KEY = 'midi-warz.tempo';
const listeners = new Set();
export const clampTempo = (bpm) => Math.min(240, Math.max(40, Math.round(bpm)));
export function getTempo(fallback = 120) { try { const v = +localStorage.getItem(KEY); return v ? clampTempo(v) : fallback; } catch { return fallback; } }
export function setTempo(bpm, source = 'local') {
  const v = clampTempo(bpm); try { localStorage.setItem(KEY, String(v)); } catch {}
  for (const cb of listeners) cb(v, source); return v;
}
export function onTempo(cb) { listeners.add(cb); return () => listeners.delete(cb); }
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) for (const cb of listeners) cb(clampTempo(+e.newValue), 'other-tab'); });
/** Tap tempo: call on every tap; returns the new bpm once there are 2+ taps within 2 s, else null. */
export function makeTapTempo() {
  let taps = [];
  return () => { const now = performance.now(); taps = taps.filter(t => now - t < 2000); taps.push(now); if (taps.length < 2) return null; const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); return clampTempo(60000 / iv); };
}

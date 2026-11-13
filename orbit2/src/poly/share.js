// ORBIT2-15 sharing (I2–I5): Seed of the Day, what a shared beat is called and where it came from, the postcard's
// timing, and the small ring drawings of the share card and the library gallery. Pure: no page state. drawRings takes
// any 2d context (an offscreen canvas for a thumbnail, the card's canvas).
import { Machine } from './lanes.js';
import { Dice, hash01 } from './dice.js';

/** What a beat without a name is called on screen. Never written into a link or a lineage: it names nothing. */
export const UNTITLED = 'an orbit';
/** A shared beat's own name: its title, unless it has none (or the placeholder links carried for a while). */
export const linkName = (o) => (o?.title && o.title !== UNTITLED ? o.title : null);
/** I5 the lineage of a beat taken from a link (remix, ×, Esc): its name, else the lineage it came with, else none. */
export const lineageOf = (o) => linkName(o) || o?.from || null;
/**
 * I5 postcard timing, on the audio clock. line: the bar line the scheduler handed over; lat: the master's look-ahead,
 * so [a, b] is when those bars leave the master. The gate fades in to a and out to b (no cut mid-hit), and the
 * recorder runs round the fades: a timer can't start it to the sample, so it starts `pre` early, into silence, and
 * stops `post` late, as the last ~30 ms still on their way to it when it stops are dropped.
 */
export function postcardWindow({ line, lat = 0, barSec, bars = 4, fade = 0.004, pre = 0.03, post = 0.12 }) {
  const a = line + lat, b = a + bars * barSec;
  return { a, b, fadeIn: a - fade, fadeOut: b - fade, recStart: a - fade - pre, recStop: b + post };
}

const pad2 = (n) => String(n).padStart(2, '0');
/** The day in UTC, 'YYYY-MM-DD': everyone on Earth gets the same seed on the same day, whatever their time zone. */
export const utcDay = (d = new Date()) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
/** 'YYYY-MM-DD' → a dice seed (1–9999, the dice drawer's range), the same for a day everywhere. */
export function daySeed(day) {
  const [y, mo, d] = String(day).split('-').map(Number);
  return 1 + Math.floor(hash01(y, mo, d, 0x5eed) * 9999);
}
/** "13 Nov" for the chip (UTC, like the seed). */
export const dayLabel = (day) => { const [y, mo, d] = day.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
/**
 * The day's constellation: a fresh 4-lane machine (default voices, so it never depends on what you had) rolled by the
 * musical randomize from the locked dice's first stream, and a tempo from its second. Same day → same beat.
 */
export function seedOfDay(day = utcDay()) {
  const seed = daySeed(day), dice = Dice.take(seed), n = new Machine(4), fam = n.randomizeMusical(dice.stream(0));
  const tempo = 84 + Math.round(dice.stream(1)() * 44);   // 84–128 bpm
  return { day, seed, tempo, family: fam.name, title: `seed of the day · ${day}`, m: n.toJSON() };
}
/** Each lane as the scene draws it: loop length, hit steps (as played, euclid included), accented hits. */
export function ringShapes(machine) {
  return machine.lanes.map(l => {
    const hits = [], acc = []; for (let i = 0; i < l.length; i++) if (l.hitAt(i)) { hits.push(i); if (l.accentAt(i)) acc.push(i); }
    return { len: l.length, hits, acc, muted: !!l.muted };
  });
}
/** A saved / shared machine JSON → its shapes (Machine.from migrates old saves the way loading does). */
export const shapesOf = (json) => { try { return json?.lanes ? ringShapes(Machine.from(json)) : []; } catch { return []; } };
/**
 * The rings drawn small: a faint orbit per lane (inner first, 0.25–0.85 of r like the scene), the hits joined into
 * their polygon, a dot per hit (bigger for an accent). No glow, no motion: it reads at 40 px.
 */
export function drawRings(ctx, shapes, { cx, cy, r, hex, bg = null }) {
  const n = shapes.length, gap = 0.6 / Math.max(1, n - 1), dot = Math.max(1, r / 28);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); }
  shapes.forEach((s, li) => {
    const rr = r * (0.25 + li * gap), c = s.muted ? '#6b6585' : hex[li % hex.length], at = (i) => { const a = (i / s.len) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
    ctx.globalAlpha = 0.3; ctx.strokeStyle = c; ctx.lineWidth = Math.max(0.5, r / 90); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    if (s.hits.length >= 3) { ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(0.75, r / 60); ctx.beginPath(); s.hits.forEach((i, k) => { const [x, y] = at(i); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 0.12; ctx.fillStyle = c; ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = c;
    for (const i of s.hits) { const [x, y] = at(i); ctx.beginPath(); ctx.arc(x, y, s.acc.includes(i) ? dot * 1.6 : dot, 0, Math.PI * 2); ctx.fill(); }
  });
  ctx.globalAlpha = 1;
}
/** A thumbnail as a PNG data URL (cached in the library entry: one draw per setup, not per render). */
export function thumbURL(json, hex, size = 96) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawRings(c.getContext('2d'), shapesOf(json), { cx: size / 2, cy: size / 2, r: size / 2 - 2, hex }); return c.toDataURL('image/png');
}

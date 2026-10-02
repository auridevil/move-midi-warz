// Tempo and beat-grid detection for a decoded track. Pure (Float32Arrays in, numbers out) so it is testable.
// Onset envelope (rectified log-energy rise) → autocorrelation for the tempo → comb filter for the phase and the downbeat.

const HOP = 256;

/** Mono mix of an AudioBuffer-like { numberOfChannels, getChannelData(i) } or of plain channel arrays. */
export function mono(channels) {
  const chs = Array.isArray(channels) ? channels : Array.from({ length: channels.numberOfChannels }, (_, i) => channels.getChannelData(i));
  if (chs.length === 1) return chs[0];
  const out = new Float32Array(chs[0].length); for (const c of chs) for (let i = 0; i < out.length; i++) out[i] += c[i] / chs.length; return out;
}

/** Onset strength per hop: how much the (log) energy rises from the previous frame. */
export function onsets(x, sampleRate, maxSeconds = 120) {
  const n = Math.min(x.length, Math.floor(maxSeconds * sampleRate)); const frames = Math.floor(n / HOP);
  const env = new Float32Array(frames); let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0; const o = f * HOP; for (let i = 0; i < HOP; i++) { const v = x[o + i]; e += v * v; }
    const l = Math.log1p(e * 1000); env[f] = Math.max(0, l - prev); prev = l;
  }
  // remove the slow trend so loud sections don't dominate
  const w = 32, out = new Float32Array(frames); let acc = 0;
  for (let f = 0; f < frames; f++) { acc += env[f]; if (f >= w) acc -= env[f - w]; out[f] = Math.max(0, env[f] - acc / Math.min(f + 1, w)); }
  // smooth the spikes a little (a ~30 ms bump) so lags that fall between frames still line up
  const K = [0.15, 0.5, 1, 0.5, 0.15], sm = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let v = 0; for (let k = -2; k <= 2; k++) { const g = f + k; if (g >= 0 && g < frames) v += out[g] * K[k + 2]; } sm[f] = v; }
  return { env: sm, sharp: out, rate: sampleRate / HOP };
}

/** Comb score: the envelope summed at a period (in frames) from a phase, with linear interpolation. */
function comb(env, period, phase) { let s = 0, k = 0; for (let t = phase; t < env.length - 1; t += period, k++) { const i = Math.floor(t), fr = t - i; s += env[i] * (1 - fr) + env[i + 1] * fr; } return k ? s / k : 0; }

/**
 * Detect { bpm, offset (seconds of the first downbeat), confidence 0–1 } from mono samples.
 * Range 70–180 bpm, with a mild preference for 90–140 to settle octave errors.
 */
export function detectTempo(x, sampleRate, { min = 70, max = 180 } = {}) {
  const { env, sharp, rate } = onsets(x, sampleRate);
  if (env.length < rate * 4) return { bpm: 120, offset: 0, confidence: 0 };
  // autocorrelation at fractional lags on a 0.5 bpm grid (integer lags alone favour tempos that happen to fall on a whole frame)
  const at = (t) => { const k = Math.floor(t), fr = t - k; return k + 1 < env.length ? env[k] * (1 - fr) + env[k + 1] * fr : 0; };
  const prefer = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / 118) / 0.55) ** 2);
  const acAt = (b) => { const lag = rate * 60 / b; let sum = 0, n = 0; for (let i = 0; i + lag + 1 < env.length; i++, n++) sum += env[i] * at(i + lag); return sum / (n || 1); };
  let best = null;
  for (let b = min; b <= max; b += 0.5) { const raw = acAt(b), score = raw * (0.6 + 0.4 * prefer(b)); if (!best || score > best.score) best = { bpm: b, score, raw }; }
  // octave check: if twice the tempo explains the beats (almost) as well, it is the real one (dnb 174 vs 87, dubstep 140 vs 70)
  if (best.bpm * 2 <= max) { const dbl = acAt(best.bpm * 2); if (dbl >= best.raw * 0.85) best = { bpm: best.bpm * 2, score: dbl, raw: dbl }; }
  // refine the tempo finely with the comb over the whole track
  // two passes (±1.5 bpm by 0.05, then ±0.06 by 0.01); the sharp curve rewards exact alignment, the smooth one keeps it stable
  let top = { bpm: best.bpm, phase: 0, s: -1 };
  const search = (lo, hi, stepB) => { for (let k = 0; lo + k * stepB <= hi + 1e-9; k++) { const b = lo + k * stepB, period = rate * 60 / b; for (let ph = 0; ph < period; ph += 0.25) { const s = comb(sharp, period, ph) + 0.5 * comb(env, period, ph); if (s > top.s) top = { bpm: b, phase: ph, s }; } } };
  search(best.bpm - 1.5, best.bpm + 1.5, 0.05); search(top.bpm - 0.06, top.bpm + 0.06, 0.01);
  let bpm;
  bpm = Math.round(top.bpm * 10) / 10;
  const period = rate * 60 / bpm;
  // downbeat: of the four beats in a bar, the one that is loudest on average (raw energy just after the beat)
  const win = Math.floor(sampleRate * 0.06), beatS = period / rate, ph = top.phase / rate; let down = 0, ds = -1;
  for (let k = 0; k < 4; k++) {
    let e = 0, n = 0;
    for (let t = ph + k * beatS; t * sampleRate + win < Math.min(x.length, sampleRate * 120); t += 4 * beatS, n++) { const o = Math.floor(t * sampleRate); for (let i = 0; i < win; i += 4) e += x[o + i] * x[o + i]; }
    if (n && e / n > ds) { ds = e / n; down = k; }
  }
  let offset = ((top.phase + down * period) / rate) % (4 * 60 / bpm);
  // refine on the raw samples: where, within ±25 ms of each beat, the energy jumps the most (in 2 ms steps)
  const hop = Math.max(16, Math.round(sampleRate * 0.002)), span = Math.round(0.025 * sampleRate / hop); let shift = 0, cnt = 0;
  for (let t = offset; t * sampleRate < Math.min(x.length, sampleRate * 60) - sampleRate * 0.05 && cnt < 64; t += beatS, cnt++) {
    const c = Math.round(t * sampleRate); let bestJ = 0, bestRise = -1, prevE = null;
    for (let j = -span - 1; j <= span; j++) { const o = c + j * hop; if (o < 0) continue; let e = 0; for (let i = 0; i < hop; i++) e += x[o + i] * x[o + i]; if (prevE !== null && e - prevE > bestRise) { bestRise = e - prevE; bestJ = j; } prevE = e; }
    shift += bestJ * hop / sampleRate;
  }
  if (cnt) offset = ((offset + shift / cnt) % (4 * beatS) + 4 * beatS) % (4 * beatS);
  const mean = env.reduce((a, b) => a + b, 0) / env.length || 1;
  return { bpm, offset: Math.round(offset * 1000) / 1000, confidence: Math.max(0, Math.min(1, (top.s / mean - 1) / 4)) };
}

// ---------- grid math ----------
/** Beat length in seconds. */
export const beatSec = (bpm) => 60 / bpm;
/** Position (s) of the grid line at or after `pos`, for a grid of `div` beats (1/16 = 0.25). */
export function nextGrid(pos, { bpm, offset = 0 }, div) {
  if (!div) return pos; const g = beatSec(bpm) * div; const k = Math.ceil((pos - offset) / g - 1e-6); return offset + k * g;
}
/** Bar index and 16th within the bar at a position. */
export function barStep(pos, { bpm, offset = 0 }) {
  const s16 = Math.floor((pos - offset) / (beatSec(bpm) / 4) + 1e-6); return { bar: Math.floor(s16 / 16), step: ((s16 % 16) + 16) % 16 };
}
/** Start (s) of a bar. */
export const barStart = (bar, { bpm, offset = 0 }) => offset + bar * 4 * beatSec(bpm);

// The handbook's 4×4 Drum Kit layout on the LEFT half of the Move pads (cols 0–3, rows 0–3, bottom-up),
// plus a small synthesized kit so the browser can make the sounds (Move is silent in control-surface mode).
import { padAt, COLOR, nearestPaletteIndex } from 'movewire';

// row 3 (top) … row 0 (bottom), left → right. Same as the printed grid.
export const LAYOUT = [
  ['tomlow', 'tommid', 'tomhigh', 'crash'],
  ['hat', 'openhat', 'hat', 'ride'],
  ['rim', 'snare', 'snare', 'rim'],
  ['perc', 'kick', 'kick', 'perc'],
];
export const CORE = new Set(['kick', 'snare', 'hat', 'openhat']);
export const SOUND_NAME = { kick: 'Kick', snare: 'Snare', hat: 'Hi-hat', openhat: 'Open hat', rim: 'Rimshot', perc: 'Perc', tomlow: 'Low tom', tommid: 'Mid tom', tomhigh: 'High tom', crash: 'Crash', ride: 'Ride' };

/** pad index -> sound, and sound+hand -> pad index (duplicated sounds: L = left pad, R = right pad). */
export const PAD_SOUND = new Map();
export const SOUND_PADS = {};
LAYOUT.forEach((rowSounds, i) => rowSounds.forEach((sound, col) => {
  const row = 3 - i, pad = padAt(row, col);
  PAD_SOUND.set(pad, sound);
  (SOUND_PADS[sound] ??= []).push(pad);
}));
export function padFor(sound, hand) {
  const pads = SOUND_PADS[sound];
  if (!pads) throw new Error(`unknown sound ${sound}`);
  return pads.length === 1 ? pads[0] : (hand === 'L' ? pads[0] : pads[1]);
}
export const soundOf = (pad) => PAD_SOUND.get(pad) ?? null;

export const HAND_HEX = { R: '#67e8f9', L: '#a78bfa', both: '#f0abfc' }; // signal cyan / nebula purple / ember magenta — same as the screen
export const HAND_COLOR = { L: nearestPaletteIndex(HAND_HEX.L), R: nearestPaletteIndex(HAND_HEX.R) };
export const KIT_COLOR = { core: COLOR.DIM, other: COLOR.DARK_GREY };

/** Minimal synthesized drum kit (WebAudio). play(sound, velocity 0–127, when = audio time). */
export const KIT_PRESETS = {
  studio: { name: 'Studio', kick: 1, snare: 1, hat: 1, tone: 1 },
  '808':  { name: '808', kick: 0.6, snare: 0.7, hat: 0.7, tone: 0.6 },
  punchy: { name: 'Punchy', kick: 1.4, snare: 1.3, hat: 1.2, tone: 1.3 },
  lofi:   { name: 'Lo-fi', kick: 0.8, snare: 0.9, hat: 0.5, tone: 0.5 },
};
export class SynthKit {
  constructor(audio) { this.audio = audio; this.params = { kick: 1, snare: 1, hat: 1, tone: 1 }; this.preset = 'studio'; }
  /** kick = pitch (0.5–2), snare = snap/noise (0.3–2), hat = length (0.3–2), tone = brightness (0.3–2). */
  set(name, value) { this.params[name] = Math.min(2, Math.max(0.3, value)); return this.params[name]; }
  nudge(name, delta) { return this.set(name, this.params[name] + delta * 0.05); }
  usePreset(key) { const p = KIT_PRESETS[key]; if (!p) return; this.preset = key; Object.assign(this.params, { kick: p.kick, snare: p.snare, hat: p.hat, tone: p.tone }); }
  play(sound, velocity = 100, when = 0, gain = 1) {
    const ctx = this.audio.ensure(); const t = when || ctx.currentTime; const v = Math.max(0.02, velocity / 127) * gain;
    const { kick: K, snare: S, hat: Hh, tone: T } = this.params;
    const out = this.audio.master;
    const env = (node, peak, decay, start = t) => { node.gain.setValueAtTime(peak, start); node.gain.exponentialRampToValueAtTime(0.001, start + decay); };
    const noise = (decay, hp, peak) => { const n = ctx.createBufferSource(); n.buffer = this.noiseBuffer(ctx); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain(); env(g, peak, decay); n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + decay + 0.05); };
    const tone = (f0, f1, decay, peak, type = 'sine') => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6); const g = ctx.createGain(); env(g, peak, decay); o.connect(g).connect(out); o.start(t); o.stop(t + decay + 0.05); };
    switch (sound) {
      case 'kick': tone(150 * K, 45 * K, 0.35 / Math.sqrt(K), 0.9 * v); tone(400 * T, 60, 0.03, 0.5 * v * T); break;
      case 'snare': tone(190 * T, 150 * T, 0.18, 0.4 * v / S, 'triangle'); noise(0.22 * S, 1500 * T, 0.7 * v * S); break;
      case 'rim': tone(900 * T, 700 * T, 0.05, 0.4 * v, 'square'); noise(0.04, 3000, 0.3 * v); break;
      case 'hat': noise(0.06 * Hh, 7000 * T, 0.45 * v); break;
      case 'openhat': noise(0.35 * Hh, 6000 * T, 0.4 * v); break;
      case 'ride': noise(0.6, 5000, 0.25 * v); tone(520, 500, 0.5, 0.15 * v, 'triangle'); break;
      case 'crash': noise(1.2, 3500, 0.5 * v); break;
      case 'tomlow': tone(130, 80, 0.4, 0.7 * v); break;
      case 'tommid': tone(180, 110, 0.35, 0.7 * v); break;
      case 'tomhigh': tone(240, 150, 0.3, 0.7 * v); break;
      case 'perc': tone(600, 300, 0.12, 0.5 * v, 'triangle'); break;
      default: noise(0.1, 2000, 0.3 * v);
    }
  }
  noiseBuffer(ctx) {
    if (!this._nb) { const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this._nb = b; }
    return this._nb;
  }
}

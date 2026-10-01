// Kits: four voices + sound tweaks per lane. Applying a kit changes sounds, never patterns.
export const KITS = {
  common: { name: 'Common', lanes: [{ voice: 'kick' }, { voice: 'snare' }, { voice: 'hat', sound: { decay: 0.3 } }, { voice: 'wood', sound: { decay: 0.3, color: 0.6 } }] },
  boombox: { name: '808‑ish', lanes: [{ voice: 'sub', sound: { decay: 0.7, color: 0.3 } }, { voice: 'clap', sound: { snap: 0.6 } }, { voice: 'hat', sound: { decay: 0.2, color: 0.3, tone: 0.9 } }, { voice: 'cowbell', sound: { decay: 0.35 } }] },
  industrial: { name: 'Industrial', lanes: [{ voice: 'kick', sound: { drive: 0.6, snap: 0.9, color: 0.8 } }, { voice: 'glitch', sound: { color: 0.3, snap: 0.5 } }, { voice: 'zap', sound: { decay: 0.4, snap: 0.7 } }, { voice: 'gong', sound: { decay: 0.4, drive: 0.3 } }] },
  skins: { name: 'Wood & skin', lanes: [{ voice: 'tom', sound: { decay: 0.5, color: 0.5 } }, { voice: 'rim', sound: { snap: 0.7 } }, { voice: 'shaker', sound: { decay: 0.35, tone: 0.9 } }, { voice: 'wood', sound: { decay: 0.4, color: 0.4 } }] },
  space: { name: 'Space', lanes: [{ voice: 'sub', sound: { decay: 0.9, send: 0.4 } }, { voice: 'bell', sound: { decay: 0.6, send: 0.5 } }, { voice: 'blip', sound: { decay: 0.3, send: 0.6, pan: 0.7 } }, { voice: 'gong', sound: { decay: 0.8, send: 0.6, pan: 0.3 } }] },
  glitch: { name: 'Glitch', lanes: [{ voice: 'snap', sound: { decay: 0.4, drive: 0.4 } }, { voice: 'zap', sound: { decay: 0.3, color: 0.2 } }, { voice: 'glitch', sound: { color: 0.6 } }, { voice: 'blip', sound: { decay: 0.2, snap: 0.9 } }] },
};
export const KIT_KEYS = Object.keys(KITS);

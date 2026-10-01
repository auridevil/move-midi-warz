// Ableton Move Set (.ablbundle) writer: a ZIP (stored, no compression) with one Song.abl JSON at the root.
// Format facts from MidiToMove (MIT, github.com/OnjLouis/MidiToMove) and Move-saved Sets in extending-move (MIT).
// Move takes 4 tracks, 8 clip slots; times are in quarter-note beats; the Set's name is the file name.

const MOVE_SCALE = { minor: 'Minor', harmonic: 'Harmonic Minor', dorian: 'Dorian', phrygian: 'Phrygian', major: 'Major' };
const SLOTS = 8;
const GROOVE = { id: 1, name: 'Swing 16ths', base: '1/16', loop: { start: 0, end: 4 }, events: Array.from({ length: 16 }, (_, i) => ({ time: Math.floor(i / 2) * 0.5 + (i % 2 ? 1 / 3 : 0) })) };

/** Beats for a step (a sixteenth), swing pushing odd sixteenths late like the .mid export. */
const beats = (s, swing) => s / 4 + (s % 2 === 1 ? Math.max(0, swing - 50) / 50 * 0.25 : 0);

/** Notes → Move clip notes, same-pitch overlaps trimmed (Move rejects them). */
function clipNotes(notes, swing) {
  const sorted = [...notes].sort((a, b) => a.s - b.s);
  return sorted.map((n, i) => {
    const start = beats(n.s, swing); let end = beats(n.s + n.d, swing);
    const again = sorted.slice(i + 1).find(m => m.p === n.p && m.s > n.s); if (again) end = Math.min(end, beats(again.s, swing));
    return { noteNumber: n.p, startTime: +start.toFixed(6), duration: +Math.max(0.01, end - start).toFixed(6), velocity: n.v, offVelocity: 0 };
  });
}

/**
 * parts: up to 4 tracks, each { name, color (Move palette index), clips: [{ name, bars, notes } | null] } or null (an empty
 * track, e.g. kept for drums). Clip i goes in slot i = scene i; scenes are named from `scenes`. Shorthand: { notes } = one clip
 * of `bars`. devices: the instrument chain JSON for every track.
 */
export function buildSong({ bpm, key = 0, scale = 'minor', bars = 8, swing = 50, parts, scenes = [] }, devices) {
  const tracks = [];
  for (let t = 0; t < 4; t++) {
    const p = parts[t]; const clips = p ? (p.clips || [{ name: p.name, bars, notes: p.notes }]) : [];
    const clipAt = (i) => {
      const c = clips[i]; if (!c) return null; const len = (c.bars || bars) * 4;
      return { isPlaying: i === 0, name: c.name ?? p.name, color: p.color, isEnabled: true, region: { start: 0, end: len, loop: { start: 0, end: len, isEnabled: true } }, grooveId: 1, stepEditorScrollPosition: 0, notes: clipNotes(c.notes, swing), envelopes: [] };
    };
    tracks.push({ kind: 'midi', name: p?.name ?? (t === 0 ? 'Drums' : ''), color: p?.color ?? 16, isSelected: t === 0,
      clipSlots: Array.from({ length: SLOTS }, (_, i) => ({ hasStop: true, clip: clipAt(i) })),
      isArmed: false, isNoteRepeatOn: false, noteRepeatRate: '1/16', noteRepeatArpeggio: { style: 'chordRepeat' }, uiOctaveIndex: 4, midiInputMode: 'auto', midiOutputEndpoint: null,
      devices: structuredClone(devices), mixer: { pan: 0, 'solo-cue': false, speakerOn: true, volume: 0, sends: [] } });
  }
  return { $schema: 'http://tech.ableton.com/schema/song/1.8.3/song.json', stepEditorResolution: '1/16', tempo: bpm, globalGrooveAmount: 0, timeSignature: { upper: 4, lower: 4 },
    rootNote: key, scale: MOVE_SCALE[scale] || 'Minor', melodicLayout: 'chromatic', tracks, returnTracks: [],
    masterTrack: { color: 23, isSelected: false, devices: [], mixer: { pan: 0, volume: 0 } },
    scenes: Array.from({ length: SLOTS }, (_, i) => ({ name: scenes[i] ?? (i === 0 ? 'Scene 1' : ''), color: null })), grooves: [GROOVE], metadata: { usedFeatures: [] } };
}
export const MAX_TAKES = SLOTS;

// ---- minimal ZIP (stored) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const le = (n, bytes) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 255);
/** files: [{ name, data: Uint8Array }] → zip bytes, method 0 (stored), UTF-8 names. */
export function zipStored(files) {
  const enc = new TextEncoder(); const chunks = [], central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const local = [...le(0x04034b50, 4), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(crc, 4), ...le(size, 4), ...le(size, 4), ...le(name.length, 2), ...le(0, 2), ...name];
    chunks.push(Uint8Array.from(local), f.data);
    central.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(crc, 4), ...le(size, 4), ...le(size, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4), ...name);
    offset += local.length + size;
  }
  const end = [...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(central.length, 4), ...le(offset, 4), ...le(0, 2)];
  const out = new Uint8Array(offset + central.length + end.length); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; } out.set(central, p); out.set(end, p + central.length); return out;
}
export const makeBundle = (song) => zipStored([{ name: 'Song.abl', data: new TextEncoder().encode(JSON.stringify(song)) }]);
/** A Set name that is safe as a file name (it becomes the name on the Move). */
export const setFileName = (name) => `${(name || 'Punchline').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Punchline'}.ablbundle`;

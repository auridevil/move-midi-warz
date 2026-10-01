// Minimal music theory helpers: note names, scales, intervals, chords.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Minor': [0, 2, 3, 5, 7, 8, 10],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'Lydian': [0, 2, 4, 6, 7, 9, 11],
  'Phrygian': [0, 1, 3, 5, 7, 8, 10],
  'Minor Pentatonic': [0, 3, 5, 7, 10],
  'Major Pentatonic': [0, 2, 4, 7, 9],
  'Blues': [0, 3, 5, 6, 7, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const INTERVALS = [
  [1, 'minor 2nd'], [2, 'major 2nd'], [3, 'minor 3rd'], [4, 'major 3rd'], [5, 'perfect 4th'],
  [6, 'tritone'], [7, 'perfect 5th'], [8, 'minor 6th'], [9, 'major 6th'], [10, 'minor 7th'], [11, 'major 7th'], [12, 'octave'],
];

export const CHORDS = {
  'maj': [0, 4, 7], 'min': [0, 3, 7], 'dim': [0, 3, 6], 'aug': [0, 4, 8],
  'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10], '7': [0, 4, 7, 10],
};

export const noteName = (n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
export const pitchClass = (n) => ((n % 12) + 12) % 12;
export const inScale = (n, root, scale) => scale.includes(pitchClass(n - root));

/** Scale degree index (0-based) of note n in scale, or -1. */
export const degreeOf = (n, root, scale) => scale.indexOf(pitchClass(n - root));

/** MIDI note for scale degree index d (may exceed scale length -> wraps octave) from a base note. */
export function noteAtDegree(base, d, scale) {
  const oct = Math.floor(d / scale.length);
  const step = ((d % scale.length) + scale.length) % scale.length;
  return base + oct * 12 + scale[step];
}

export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

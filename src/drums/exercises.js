// The 21 finger-drumming exercises of "Handbook Music" (lessons 03–05), transcribed from the grids.
// hands: R = right, L = left. dyn: f = full hit (100–127), w = soft accent (60–90), g = ghost (15–40).
// steps are 16ths from 0; `steps` = grid length (16 = one bar). Sounds map to the 4×4 kit in kit.js.

export const DYN = { f: [100, 127], w: [60, 90], g: [15, 40] };
export const DYN_NAME = { f: 'full', w: 'soft', g: 'ghost' };

const every = (start, stride, count, dyn = 'f') => Object.fromEntries(Array.from({ length: count }, (_, i) => [start + i * stride, dyn]));
const at = (dyn, ...steps) => Object.fromEntries(steps.map(s => [s, dyn]));
const lane = (sound, hand, hits) => ({ sound, hand, hits });

export const EXERCISES = [
  // ---- Scale 0 · first steps (added, not from the source lessons) ----
  { id: 21, scale: 0, name: 'One hit per bar', hands: 'R', bpm: 70, steps: 16, note: 'Kick on beat 1 only. Feel the bar, wait, land exactly on the click. Boring is the point.',
    lanes: [lane('kick', 'R', at('f', 0))] },
  { id: 22, scale: 0, name: 'Kick on 1 and 3', hands: 'R', bpm: 70, steps: 16, note: 'Half notes. Watch that the second hit is not early: most people rush the 3.',
    lanes: [lane('kick', 'R', at('f', 0, 8))] },
  { id: 23, scale: 0, name: 'Snare on 2 and 4', hands: 'R', bpm: 70, steps: 16, note: 'The backbeat alone. Middle finger, small wrist drop, same strength both times.',
    lanes: [lane('snare', 'R', at('f', 4, 12))] },
  { id: 24, scale: 0, name: 'Hi-hat on the quarters', hands: 'R', bpm: 80, steps: 16, note: 'Index finger, four even taps. This is the hand that will later do the busiest work.',
    lanes: [lane('hat', 'R', every(0, 4, 4))] },
  { id: 25, scale: 0, name: 'Hi-hat in eighths', hands: 'R', bpm: 70, steps: 16, note: 'Eight even taps with one finger. Keep the finger close to the pad: less travel, more even.',
    lanes: [lane('hat', 'R', every(0, 2, 8))] },
  { id: 26, scale: 0, name: 'Kick 1 · snare 3', hands: 'R', bpm: 70, steps: 16, note: 'Two sounds, two beats apart. Thumb down, middle finger up, one hand.',
    lanes: [lane('snare', 'R', at('f', 8)), lane('kick', 'R', at('f', 0))] },
  { id: 27, scale: 0, name: 'Hands take turns · quarters', hands: 'RL', bpm: 70, steps: 16, note: 'Right, left, right, left on the two hi-hat pads. The first alternation exercise: slow and even.',
    lanes: [lane('hat', 'R', at('f', 0, 8)), lane('hat', 'L', at('f', 4, 12))] },
  { id: 28, scale: 0, name: 'Hands take turns · eighths', hands: 'RL', bpm: 70, steps: 16, note: 'Right on the beats, left in between. The blast beat at walking pace, on hi-hats.',
    lanes: [lane('hat', 'R', every(0, 4, 4)), lane('hat', 'L', every(2, 4, 4))] },
  { id: 29, scale: 0, name: 'Loud, soft, loud, soft', hands: 'R', bpm: 70, steps: 16, note: 'Snare on the quarters, alternating full and soft. Dynamics start here: the soft ones should be clearly softer, not just a bit.',
    lanes: [lane('snare', 'R', { 0: 'f', 4: 'w', 8: 'f', 12: 'w' })] },
  { id: 30, scale: 0, name: 'Kick and hat together', hands: 'RL', bpm: 70, steps: 16, note: 'Right hand hi-hat on the quarters, left thumb kick on 1 and 3. Two hands, different jobs, slowly.',
    lanes: [lane('hat', 'R', every(0, 4, 4)), lane('kick', 'L', at('f', 0, 8))] },
  { id: 31, scale: 0, name: 'Left hand · kick on the quarters', hands: 'L', bpm: 70, steps: 16, note: 'Exercise 0 with the left hand, so the weak hand never falls too far behind.',
    lanes: [lane('kick', 'L', every(0, 4, 4))] },
  { id: 32, scale: 0, name: 'Left hand · hi-hat in eighths', hands: 'L', bpm: 70, steps: 16, note: 'Eight even taps, left index finger. Slower than the right hand did it, that is fine.',
    lanes: [lane('hat', 'L', every(0, 2, 8))] },

  // ---- Scale 1 · Lesson 03 · hitting ----
  { id: 0, scale: 1, name: 'Kick on the quarters', hands: 'R', bpm: 90, steps: 16, note: 'Just this, with the metronome. Watch whether the hit lands on the click or a hair early.',
    lanes: [lane('kick', 'R', every(0, 4, 4))] },
  { id: 1, scale: 1, name: 'Backbeat', hands: 'R', bpm: 90, steps: 16, note: 'Two sounds, one hand: thumb goes down, middle finger goes up.',
    lanes: [lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 8))] },
  { id: 2, scale: 1, name: 'Eighth-note groove', hands: 'R', bpm: 90, steps: 16, note: 'The big jump: one hand plays the whole groove.',
    lanes: [lane('hat', 'R', at('f', 2, 6, 10, 14)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 8))] },
  { id: 3, scale: 1, name: 'Open hi-hat', hands: 'R', bpm: 90, steps: 16, note: 'Move to the neighbouring pad without losing time.',
    lanes: [lane('openhat', 'R', at('f', 14)), lane('hat', 'R', at('f', 2, 6, 10)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 8))] },
  { id: 4, scale: 1, name: 'Sixteenths', hands: 'RL', bpm: 90, steps: 16, note: 'The left hand fills in between the right hand\'s hits. This is where duplicated pads pay off.',
    lanes: [lane('hat', 'L', every(1, 2, 8, 'w')), lane('hat', 'R', at('f', 2, 6, 10, 14)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 8))] },
  { id: 5, scale: 1, name: 'Ghost note', hands: 'RL', bpm: 90, steps: 16, note: 'A dynamics exercise, not a rhythm one: at 30%, or they are not ghosts.',
    lanes: [lane('hat', 'R', at('f', 2, 6, 10, 14)), lane('snare', 'L', at('g', 3, 11)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 8))] },
  { id: 6, scale: 1, name: 'Full boom bap', hands: 'RL', bpm: 90, steps: 16, swing: 55, note: 'Everything together, alternating hands. It is the beat from lesson 01.',
    lanes: [lane('hat', 'R', at('f', 2, 6, 10, 14)), lane('snare', 'L', at('g', 13)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'L', at('f', 10)), lane('kick', 'R', at('f', 0, 8))] },

  // ---- Scale 2 · Lesson 04 · splitting ----
  { id: 7, scale: 2, name: 'House · straight kick', genre: 'house', hands: 'RL', bpm: 124, steps: 16, note: 'The right hand plays four unshakeable hits, the left does everything else. Independence, not speed.',
    lanes: [lane('openhat', 'L', at('f', 2, 6, 10, 14)), lane('snare', 'L', at('f', 4, 12)), lane('kick', 'R', every(0, 4, 4))] },
  { id: 8, scale: 2, name: 'UK garage · swung two-step', genre: 'uk garage', hands: 'RL', bpm: 134, steps: 16, swing: 60, note: 'Swung two-step: here being off the grid is the goal, not the mistake.',
    lanes: [lane('openhat', 'L', at('f', 10)), lane('hat', 'L', at('w', 2, 8, 14)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 6))] },
  { id: 9, scale: 2, name: 'Drum & bass · fast two-step', genre: 'drum & bass', hands: 'RL', bpm: 120, bpmMax: 174, steps: 16, note: 'Exercise 6 at double tempo. From 120 to 174 over weeks, not minutes.',
    lanes: [lane('hat', 'L', at('w', 2, 6, 10, 14)), lane('snare', 'L', at('g', 3, 11)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 10))] },
  { id: 33, scale: 2, name: 'Drum & bass · full break', genre: 'drum & bass', hands: 'RL', bpm: 150, bpmMax: 174, steps: 16, note: 'Variant, not from the source: the same two-step (kick 1 and the "and" of 3, snare 2 and 4) with hi-hats on every eighth, right hand on the beats, left in between, ghosts before the snares. Sounds like the record from 160 up.',
    lanes: [lane('hat', 'R', every(0, 4, 4)), lane('hat', 'L', every(2, 4, 4, 'w')), lane('snare', 'L', at('g', 3, 11)), lane('snare', 'R', at('f', 4, 12)), lane('kick', 'R', at('f', 0, 10))] },
  { id: 10, scale: 2, name: 'Trap · 32nd-note roll', genre: 'trap', hands: 'RL', bpm: 140, steps: 32, resolution: 32, note: '32nd-note grid. The closing roll alternates hands with rising dynamics: the difficulty is the dynamics, not the speed.',
    lanes: [lane('hat', 'R', { 0: 'f', 4: 'f', 8: 'f', 12: 'f', 16: 'f', 20: 'f', 24: 'g', 26: 'w', 28: 'w', 30: 'f' }), lane('hat', 'L', { 25: 'g', 27: 'w', 29: 'w', 31: 'f' }),
            lane('snare', 'R', at('f', 16)), lane('kick', 'R', at('f', 0, 12, 20))] },
  { id: 11, scale: 2, name: 'Footwork · three against four', genre: 'footwork', hands: 'RL', bpm: 160, steps: 16, note: 'Right hand every three steps, left hand on two and four. Do not count: learn the right hand alone first.',
    lanes: [lane('snare', 'L', at('f', 4, 12)), lane('kick', 'R', every(0, 3, 6))] },
  { id: 12, scale: 2, name: 'Blast beat · pure alternation', genre: 'black metal', hands: 'RL', bpm: 70, bpmMax: 100, steps: 16, note: 'Pure alternation, nothing else. It is the chromatic scale of finger drumming: five minutes a day and everything else improves.',
    lanes: [lane('snare', 'L', every(1, 2, 8)), lane('kick', 'R', every(0, 2, 8))] },
  { id: 13, scale: 2, name: 'Dubstep · half-time', genre: 'dubstep', hands: 'RL', bpm: 140, steps: 16, note: 'One strong hit, on three. The exercise is resisting the urge to fill the gap.',
    lanes: [lane('hat', 'L', { 2: 'f', 6: 'w', 10: 'f', 14: 'w' }), lane('snare', 'R', at('f', 8)), lane('kick', 'R', at('f', 0, 11))] },

  // ---- Scale 3 · Lesson 05 · the weak hand ----
  { id: 14, scale: 3, name: 'Mirror backbeat', hands: 'L', bpm: 70, steps: 16, note: 'Exercise 1 with hands swapped. Start twenty bpm below the tempo you do it at with the right hand.',
    lanes: [lane('snare', 'L', at('f', 4, 12)), lane('kick', 'L', at('f', 0, 8))] },
  { id: 15, scale: 3, name: 'Mirror groove', hands: 'L', bpm: 70, steps: 16, note: 'Exercise 2 inverted: the left hand plays the whole groove moving vertically. The heart of the lesson.',
    lanes: [lane('hat', 'L', at('f', 2, 6, 10, 14)), lane('snare', 'L', at('f', 4, 12)), lane('kick', 'L', at('f', 0, 8))] },
  { id: 16, scale: 3, name: 'Left-led blast', hands: 'LR', bpm: 70, steps: 16, note: 'Same blast as exercise 12, but the left hand takes the strong beats. The hand leading the alternation is the one keeping time.',
    lanes: [lane('snare', 'L', every(0, 2, 8)), lane('kick', 'R', every(1, 2, 8))] },
  { id: 17, scale: 3, name: 'Steady left', hands: 'LR', bpm: 90, steps: 16, note: 'The opposite of exercise 7: the left plays four unshakeable hits while the right moves around.',
    lanes: [lane('hat', 'R', at('w', 2, 3, 7, 10, 14, 15)), lane('snare', 'R', at('f', 6)), lane('kick', 'L', every(0, 4, 4))] },
  { id: 18, scale: 3, name: 'Displacement · from beat 2', hands: 'RL', bpm: 90, steps: 16, note: 'The eighth-note groove starting on beat two. Same notes, different position against the click.',
    lanes: [lane('hat', 'L', at('w', 2, 6, 10, 14)), lane('snare', 'R', at('f', 0, 8)), lane('kick', 'R', at('f', 4, 12))] },
  { id: 19, scale: 3, name: 'The gap · 3 bars out of 4', hands: 'RL', bpm: 90, steps: 64, bars: 4, note: 'Three bars played, the fourth in silence, then come back in on time. Trains the inner clock, not the hands. Hard version: turn the click off too.',
    lanes: [lane('hat', 'L', { ...every(2, 4, 4, 'w'), ...every(18, 4, 4, 'w'), ...every(34, 4, 4, 'w') }),
            lane('snare', 'R', at('f', 4, 12, 20, 28, 36, 44)), lane('kick', 'R', at('f', 0, 8, 16, 24, 32, 40))] },
  { id: 20, scale: 3, name: 'Moving accent', hands: 'RL', bpm: 80, steps: 64, bars: 4, note: 'Continuous sixteenths, alternating hands, on one pad. The accent moves one step every bar: the hands always do the same thing, only where you put the force changes.',
    lanes: (() => { const R = {}, L = {}; for (let s = 0; s < 64; s++) { const bar = s >> 4, accent = (s % 4) === bar; (s % 2 === 0 ? R : L)[s] = accent ? 'f' : 'g'; } return [lane('snare', 'L', L), lane('snare', 'R', R)]; })() },
];

export const SCALES = { 0: 'Scale 0 · first steps', 1: 'Scale 1 · hitting', 2: 'Scale 2 · splitting the hands', 3: 'Scale 3 · the weak hand' };

/** Treatments applicable to any exercise (handbook: "the three treatments" + tempo ladder). */
export const TREATMENTS = {
  none: { name: 'None' },
  shift2: { name: 'Displacement · from beat 2', shift: 4 },
  shift3: { name: 'Displacement · start on 3', shift: 8 },
  shift4: { name: 'Displacement · start on 4', shift: 12 },
  hole: { name: 'The gap · 4th bar silent', hole: true },
  ladder: { name: 'Tempo ladder · +5 every 8 bars', ladder: true },
};

/** Handbook rules. */
export const RULES = { cleanBarsToLevelUp: 8, timesInARow: 2, bpmUp: 5, bpmDownOnError: 10 };

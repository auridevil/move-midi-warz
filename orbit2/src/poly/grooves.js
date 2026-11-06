// Starter grooves: one-tap presets that load a whole beat (pattern + kit + tempo + swing). Pure data built with the
// model, so a groove is exactly what a saved pattern would be: GROOVES[i].m is Machine JSON (Machine.from round-trips).
import { Machine, RATIOS, DEFAULT_SOUND } from './lanes.js';
import { KITS } from './kits.js';

/**
 * A lane in a tiny step language: '.' rest, 'x' hit, 'X' accented hit, '2'..'4' a hit that ratchets that many times
 * (a hat roll). The string's length is the lane length. ratio = speed (×4 = sixteenths), voice / sound patch the kit.
 */
function lane(l, { steps, ratio = 1, voice, sound, swing = 0, rotation = 0, prob = 1 }) {
  if (voice) l.setVoice(voice); if (sound) l.sound = { ...l.sound, ...sound };
  l.clear(); l.setLength(steps.length); l.setRatio(RATIOS.indexOf(ratio)); l.swing = swing; l.rotation = rotation; l.prob = prob;
  [...steps].forEach((c, i) => {
    if (c === '.') return; l.hits[i] = true; if (c === 'X') l.accents[i] = true;
    if (/[2-4]/.test(c)) l.setTrig(i, { ratchet: +c });
  });
}
function groove({ key, name, desc, tempo, kit, humanize = 0, lanes }) {
  const m = new Machine(); m.applyKit(KITS[kit], DEFAULT_SOUND); m.humanize = humanize;
  lanes.forEach((spec, i) => lane(m.lanes[i], spec));
  return { key, name, desc, tempo, kit, swing: m.lanes.map(l => l.swing), m: m.toJSON() };
}

export const GROOVES = [
  groove({ key: 'boombap', name: 'lo-fi boom bap', tempo: 86, kit: 'lofi', humanize: 0.08,
    desc: 'Lazy head-nod beat: soft kick, snare on 2 and 4, swung shaker, a little vinyl dust.',
    lanes: [
      { steps: 'X......x..x.....', ratio: 4, swing: 0.2 },
      { steps: '....X.......X...', ratio: 4, swing: 0.2 },
      { steps: 'XxXxXxXx', ratio: 2, swing: 0.3 },                                   // shaker 8ths, every second one late
      { steps: 'x..x..x.', ratio: 1, sound: { level: 0.4 } },                         // crackle drifting over 2 bars
    ] }),
  groove({ key: 'trap', name: 'trap', tempo: 140, kit: 'trap',
    desc: 'Half-time trap: 808 kick, snare on 3, rolling hats that stutter into the next bar.',
    lanes: [
      { steps: 'X......x.x......', ratio: 4 },
      { steps: '........X.......', ratio: 4 },                                         // half time: one snare a bar, on 3
      { steps: 'xxxxxx3xxxxxx34x', ratio: 2 },                                         // 8th hats over 2 bars, ratchet rolls
      { steps: '...............x', ratio: 4, sound: { level: 0.5 } },
    ] }),
  groove({ key: 'house', name: 'house', tempo: 124, kit: 'house909',
    desc: 'Four on the floor, clap on 2 and 4, open hat on every offbeat, shuffled ride.',
    lanes: [
      { steps: 'XXXX', ratio: 1 },
      { steps: '.x.x', ratio: 1 },
      { steps: '.x', ratio: 2 },                                                      // open hat between the kicks
      { steps: '.x.x.x.x.x.x.x.x', ratio: 4, swing: 0.15, sound: { level: 0.45 } },
    ] }),
  groove({ key: 'techno', name: 'techno', tempo: 130, kit: 'techno',
    desc: 'Driving kick with a low rumble behind it, rim shots, sixteenth hats pushing the offbeat.',
    lanes: [
      { steps: 'XXXX', ratio: 1 },
      { steps: '....x..x....x.x.', ratio: 4 },
      { steps: 'x.X.x.X.x.X.x.X.', ratio: 4, sound: { level: 0.6 } },
      // rumble: a low, washed sub on the two sixteenths after every kick
      { steps: '.xx.', ratio: 4, voice: 'sub', sound: { decay: 0.35, tone: 0.4, send: 0.5, level: 0.45, color: 0.2 } },
    ] }),
  groove({ key: 'dnb', name: 'DnB', tempo: 174, kit: 'breaks',
    desc: 'Two-step drum & bass: kick on 1 and the and of 3, snare on 2 and 4, ride eighths, ghost tambourine.',
    lanes: [
      { steps: 'X.........x.....', ratio: 4 },
      { steps: '....X.......X...', ratio: 4 },
      { steps: 'XxXxXxXx', ratio: 2, sound: { level: 0.6 } },
      { steps: '..x....x.x....x.', ratio: 4, sound: { level: 0.45 } },
    ] }),
  groove({ key: 'afro', name: 'afro', tempo: 118, kit: 'latin',
    desc: '3-2 son clave against a 12/8 bell (triplet speed), steady kick and conga tones.',
    lanes: [
      { steps: 'XXXX', ratio: 1, voice: 'softkick', sound: { decay: 0.45 } },
      { steps: 'X..x..x...x.x...', ratio: 2, voice: 'clave', sound: { decay: 0.2 } },   // 3-2 son clave in 8ths, 2 bars
      { steps: 'X.x.xx.x.x.x', ratio: 3, voice: 'cowbell', sound: { decay: 0.3, tone: 0.8, level: 0.5 } },   // 12/8 bell, 1 bar
      { steps: '...x..xx..x...x.', ratio: 4, voice: 'conga', sound: { decay: 0.45 }, swing: 0.1 },
    ] }),
  // every ring spans a beat except the 5, which slides a sixteenth a beat: all four start together every 5 beats
  groove({ key: 'poly345', name: '3 vs 4 vs 5', tempo: 100, kit: 'common',
    desc: 'Polyrhythm demo: a 4 kick, a 5 rim that slides against it and a 3 hat triplet line; they all meet every 5 beats.',
    lanes: [
      { steps: 'X...', ratio: 4 },
      { steps: 'X....', ratio: 4, voice: 'rim', sound: { snap: 0.6 } },
      { steps: '.xx', ratio: 3 },
      { steps: '.x', ratio: 2 },
    ] }),
];
/** The groove a first visit plays. */
export const DEMO_GROOVE = 'poly345';
export const grooveByKey = (key) => GROOVES.find(g => g.key === key) || null;

// Starter grooves: one-tap presets that load a whole beat (pattern + kit + tempo + swing). Pure data built with the
// model, so a groove is exactly what a saved pattern would be: GROOVES[i].m is Machine JSON (Machine.from round-trips).
import { Machine, RATIOS, DEFAULT_SOUND } from './lanes.js';
import { KITS } from './kits.js';

/**
 * A lane in a tiny step language: '.' rest, 'x' hit, 'X' accented hit, 'g' ghost (a soft hit: vel lock GHOST),
 * '2'..'4' a hit that ratchets that many times (a hat roll). The string's length is the lane length. ratio = speed
 * (×4 = sixteenths), voice / sound / tune patch the kit.
 * Swing moves every second step of a lane's own grid, so a groove swings on one grid: lanes that share offbeats share
 * the speed and the swing (tests check that no two lanes flam).
 */
const GHOST = 0.4;
function lane(l, { steps, ratio = 1, voice, sound, tune = 0, swing = 0, rotation = 0, prob = 1 }) {
  if (voice) l.setVoice(voice); if (sound) l.sound = { ...l.sound, ...sound };
  l.clear(); l.setLength(steps.length); l.setRatio(RATIOS.indexOf(ratio)); l.swing = swing; l.rotation = rotation; l.prob = prob; l.tune = tune;
  [...steps].forEach((c, i) => {
    if (c === '.') return; l.hits[i] = true; if (c === 'X') l.accents[i] = true; if (c === 'g') l.setLock(i, 'vel', GHOST);
    if (/[2-4]/.test(c)) l.setTrig(i, { ratchet: +c });
  });
}
function groove({ key, name, desc, tempo, kit, humanize = 0, lanes }) {
  const m = new Machine(); m.applyKit(KITS[kit], DEFAULT_SOUND); m.humanize = humanize;
  lanes.forEach((spec, i) => lane(m.lanes[i], spec));
  return { key, name, desc, tempo, kit, swing: m.lanes.map(l => l.swing), m: m.toJSON() };
}

// The mix: measured on rendered stems (BS.1770 loudness against the kick), the backbeat sits 5–9 LU under the kick,
// hats, bells and percussion 8–15 LU, and every groove plays within about 3 LU of the others (−23.5…−26.5 LUFS
// through the master), so tapping from chip to chip doesn't jump. The kits' bright voices (hats, rides, shaker) sit
// behind a 4 kHz tone filter by default: the grooves open it (tone .9–.95) and turn the kick down instead of the rest
// up past the top of the level knob. Hats and percussion pan a little off centre.
export const GROOVES = [
  groove({ key: 'boombap', name: 'lo-fi boom bap', tempo: 86, kit: 'lofi', humanize: 0.08,
    desc: 'Lazy head-nod beat: soft kick, snare on 2 and 4, swung shaker, a little vinyl dust.',
    lanes: [   // everything on eighths swung the same (60 %), so the kick's "and"s land with the shaker's
      { steps: 'X..x.x..', ratio: 2, swing: 0.2, sound: { tone: 0.6, decay: 0.65, level: 0.67 } },          // 1, the "and" of 2, the "and" of 3
      { steps: '..X...Xg', ratio: 2, swing: 0.2, sound: { tone: 0.82, decay: 0.5, drive: 0.45, level: 0.8 } },   // 2 and 4, a ghost on the last "and"
      { steps: 'XxXxXxXx', ratio: 2, swing: 0.2, sound: { tone: 0.9, decay: 0.5, drive: 0.45, level: 0.91, pan: 0.42 } },   // shaker eighths, every second one late
      { steps: 'xxxxxxxx', ratio: 2, swing: 0.2, prob: 0.5, sound: { tone: 0.9, decay: 0.7, snap: 1, color: 0.1, level: 1, pan: 0.6 } },   // vinyl dust: a crackle on about half the eighths
    ] }),
  groove({ key: 'trap', name: 'trap', tempo: 140, kit: 'trap',
    desc: 'Half-time trap: 808 kick, snare on 3, rolling hats that stutter into the next bar.',
    lanes: [
      { steps: 'X......x.x......', ratio: 4, sound: { drive: 0.25, level: 0.6 } },    // a little drive: the 808 still reads on a phone speaker
      { steps: '........X.......', ratio: 4, sound: { level: 0.75 } },                // half time: one snare a bar, on 3
      { steps: 'XxXxXx3xXxXxX34x', ratio: 2, sound: { level: 1, pan: 0.45 } },       // 8th hats over 2 bars, ratchet rolls
      { steps: '...............x', ratio: 4, sound: { level: 0.87, pan: 0.6 } },
    ] }),
  groove({ key: 'house', name: 'house', tempo: 124, kit: 'house909',
    desc: 'Four on the floor, clap on 2 and 4, open hat on every offbeat, shuffled ride.',
    lanes: [
      { steps: 'XXXX', ratio: 1, sound: { level: 0.69 } },
      { steps: '.X.X', ratio: 1, sound: { tone: 0.85, drive: 0.25, level: 0.81 } },
      { steps: '.X', ratio: 2, sound: { tone: 0.95, decay: 0.5, drive: 0.15, level: 0.83, pan: 0.42 } },   // open hat between the kicks
      { steps: '.x.x.x.x.x.x.x.x', ratio: 4, swing: 0.15, sound: { tone: 0.95, level: 0.66, pan: 0.6 } },
    ] }),
  groove({ key: 'techno', name: 'techno', tempo: 130, kit: 'techno',
    desc: 'Driving kick with a low rumble behind it, rim shots, sixteenth hats pushing the offbeat.',
    lanes: [
      { steps: 'XXXX', ratio: 1, sound: { level: 0.57 } },
      { steps: '....x..x....x.x.', ratio: 4, sound: { level: 0.86, pan: 0.58 } },
      { steps: 'xgXgxgXgxgXgxgXg', ratio: 4, sound: { level: 0.95, pan: 0.42 } },    // sixteenths, the "and"s pushed
      // rumble: a low, driven sub (an octave up, so its overtones carry on small speakers) on the two sixteenths after
      // every kick, a little of it into the delay
      { steps: '.xx.', ratio: 4, voice: 'sub', tune: 1, sound: { decay: 0.35, tone: 0.4, drive: 0.3, send: 0.1, level: 0.24, color: 0.2 } },
    ] }),
  groove({ key: 'dnb', name: 'DnB', tempo: 174, kit: 'breaks',
    desc: 'Two-step drum & bass: kick on 1 and the and of 3, snare on 2 and 4, ride eighths, ghost tambourine.',
    lanes: [
      { steps: 'X.........x.....', ratio: 4, sound: { level: 0.71 } },
      { steps: '....X.......X...', ratio: 4, sound: { tone: 0.85, level: 1 } },
      { steps: 'XxXxXxXx', ratio: 2, sound: { tone: 0.95, level: 0.75, pan: 0.42 } },
      { steps: '..x....x.x....x.', ratio: 4, sound: { tone: 0.95, level: 0.69, pan: 0.62 } },
    ] }),
  groove({ key: 'afro', name: 'afro', tempo: 118, kit: 'latin',
    desc: '3-2 son clave against a 12/8 bell (triplet speed), steady kick and conga tones.',
    lanes: [
      { steps: 'XXXX', ratio: 1, voice: 'softkick', sound: { decay: 0.45, level: 0.6 } },
      { steps: 'X..x..x...x.x...', ratio: 2, voice: 'clave', sound: { decay: 0.2, level: 0.74, pan: 0.38 } },   // 3-2 son clave in 8ths, 2 bars
      { steps: 'X.x.xx.x.x.x', ratio: 3, voice: 'cowbell', sound: { decay: 0.3, tone: 0.9, level: 0.98, pan: 0.6 } },   // 12/8 bell, 1 bar
      { steps: '...g..xx..g...x.', ratio: 4, voice: 'conga', sound: { decay: 0.45, level: 0.67, pan: 0.45 }, swing: 0.1 },
    ] }),
  // every ring spans a beat except the 5, which slides a sixteenth a beat: all four start together every 5 beats
  groove({ key: 'poly345', name: '3 vs 4 vs 5', tempo: 100, kit: 'common',
    desc: 'Polyrhythm demo: a 4 kick, a 5 rim that slides against it and a 3 hat triplet line; they all meet every 5 beats.',
    lanes: [
      { steps: 'X...', ratio: 4, sound: { level: 0.66 } },
      { steps: 'X....', ratio: 4, voice: 'rim', sound: { snap: 0.6, level: 0.87, pan: 0.4 } },
      { steps: 'Xxx', ratio: 3, sound: { tone: 0.95, decay: 0.45, level: 0.99, pan: 0.6 } },   // the 3: triplets, evenly
      { steps: '.x', ratio: 2, sound: { level: 0.94, pan: 0.45 } },
    ] }),
];
/** The groove a first visit plays. */
export const DEMO_GROOVE = 'poly345';
export const grooveByKey = (key) => GROOVES.find(g => g.key === key) || null;
/** What a visit opens with: a #p= share link wins, then a first visit (nothing saved yet) gets the demo, else the
 *  beat you left ('return': the welcome-back bar). */
export const bootMode = ({ saved, hash = '' }) => /#p=[\w-]+/.test(hash) ? 'link' : saved ? 'return' : 'first';

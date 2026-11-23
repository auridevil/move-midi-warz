// RD-9: the "?" overlay draws the Move with the current page's meanings on its controls (DECISION §3 RD-9). Pure
// (no DOM): app.js hands it what resolvePage made of the hands (row, row8, cells) and the knob words the console's
// row wears for that page (the same gauges, so the simple and the full view agree with the knobs on screen), and puts
// the string in the help dialog. Colours and fonts come from styles.css classes (mf-*), so the dark-room tokens hold
// here too; the full mapping stays in the Move table beside it (help's second tab), this picture only names what the
// knobs and the cells mean right now. Sizes are the type scale (11 / 13 / 15) measured by the face audit with the help open.

/** The Move's knobs 1–8 per page, as the Move table says them (knob 8 is the page's own: tempo / level / condition):
 *  the words drawn when the caller passes none (app.js passes the console's). */
export const KNOB_WORDS = {
  rhythm: ['length', 'euclid hits', 'rotation', 'speed ratio', 'swing', 'probability', 'tune', 'tempo'],
  sound: ['decay', 'tone', 'drive', 'snap', 'color', 'send', 'pan', 'level'],
  step: ['tune', 'prob', 'velocity', 'decay', 'tone', 'snap', 'color', 'condition'],
};
/** Knob words of a page as drawn: a held step's knob 8 is its condition, or its repeats while Shift holds it too. */
export const knobWords = (row, row8) => { const w = [...(KNOB_WORDS[row] || KNOB_WORDS.rhythm)]; if (row === 'step' && row8 === 'repeats') w[7] = 'repeats'; return w; };
/** What the 16 step buttons are now (pages.js cells). */
export const CELL_WORDS = {
  steps: 'the selected lane’s 16 steps · tap = toggle · hold one = its locks and loops',
  loops: 'the held step’s loops: lit = the loops it plays on · letting go changes nothing',
  slots: 'the 16 slots while Loop is held · tap = load · several = chain',
};
/** The pads, by live mode (the chip in Sheet → setup): short enough for their plate. */
export const PAD_WORDS = {
  live: 'pads · play the lanes · record armed: record',
  edit: 'pads · 8 steps a lane · ⇧ + pad = accent',
};
/** Capture and Delete, by live mode (the Move table: live mode wants Shift or a 0.6 s hold, P1). */
export const GUARDED = { live: ['hold: randomize', 'hold: clear lane'], edit: ['randomize', 'clear lane'] };
// name printed on the device (dim), then what it does here (one short line; the table has the rest); Capture's meaning
// is filled in by live mode
const BTNS = [
  ['Shift', 'hold: sound'], ['Layout', 'hold: fill'], ['Back', 'pin pages'], ['Capture', null], ['−', 'evolve'],
  ['+', 'throw'], ['Undo', '⇧ = redo'], ['Loop', 'hold: slots'], ['Duplicate', 'hold: save slot'], ['◀', ''], ['▶', ''],
];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The Move as a picture, labelled for the page under the hands.
 * @param {object} s  { row: 'rhythm'|'sound'|'step', row8: 'tempo'|'level'|'condition'|'repeats', cells:
 *   'steps'|'loops'|'slots', word: the page's name as the console says it, live: live mode on, words: the 8 knob
 *   words the console's row wears for this page (missing: the Move table's, knobWords) }
 * @returns {string} an <svg> (decoration: aria-hidden; the Move table beside it carries the words)
 */
export function drawMoveHelp({ row = 'rhythm', row8 = 'tempo', cells = 'steps', word = 'rhythm', live = true, words = null } = {}) {
  const o = [], text = (x, y, t, cls, anchor = 'middle', attr = '') => o.push(`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${attr}>${esc(t)}</text>`);
  const box = (x, y, w, h, cls = 'mf-box', rx = 6) => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`);
  o.push('<svg viewBox="0 0 980 600" class="mf" aria-hidden="true" focusable="false">');
  o.push('<rect x="2" y="2" width="976" height="596" rx="24" class="mf-body"/>');
  // the display says the page; the knobs wear its words, staggered over / under so neighbours never touch
  box(40, 36, 250, 70, 'mf-box', 8); text(165, 68, word, 'mf-big'); text(165, 90, 'the page under the hands', 'mf-dim');
  const kw = Array.isArray(words) && words.length === 8 ? words : knobWords(row, row8);
  kw.forEach((w, k) => {
    const cx = 340 + k * 70; o.push(`<circle cx="${cx}" cy="72" r="24" class="mf-box"/>`);
    text(cx, 76, k + 1, 'mf-dim'); text(cx, k % 2 ? 126 : 30, w, 'mf-word', 'middle', ` data-knob="${k + 1}"`);
  });
  o.push('<circle cx="910" cy="72" r="28" class="mf-box"/>'); text(910, 30, 'filter · push = off', 'mf-word');   // above: knob 8's word sits below
  // track buttons select lanes; the pads play or edit them
  for (let r = 0; r < 4; r++) { box(40, 150 + r * 62, 56, 50); text(68, 180 + r * 62, `lane ${4 - r}`, 'mf-small'); }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) box(120 + c * 70, 150 + r * 62, 58, 50, 'mf-pad');
  box(220, 251, 360, 44, 'mf-plate', 8); text(400, 277, PAD_WORDS[live ? 'live' : 'edit'], 'mf-word');
  // the right cluster: transport and the big moves
  const [capture, del] = GUARDED[live ? 'live' : 'edit'];
  for (const [name, mean, x, y] of [['▶', 'start / stop', 705, 150], ['●', 'arm record', 845, 150], ['Mute', 'mute · ⇧ solo', 705, 205], ['Sample', 'jam', 845, 205], ['Delete', del, 705, 260]]) {
    box(x, y, 120, 40); text(x + 60, y + 17, name, 'mf-dim'); text(x + 60, y + 33, mean, 'mf-word');
  }
  // the 16 step buttons, as the hands make them (steps, a held step's loops, or the slots)
  text(120, 404, CELL_WORDS[cells] || CELL_WORDS.steps, 'mf-word', 'start');
  for (let s = 0; s < 16; s++) { box(120 + s * 35, 420, 28, 22, 'mf-box', 4); text(134 + s * 35, 460, s + 1, 'mf-small'); }
  // the bottom row; ◀ ▶ share one meaning
  BTNS.forEach(([name, m], k) => {
    const x = 40 + k * 66, mean = m ?? capture; box(x, 490, 56, 30); text(x + 28, 510, name, 'mf-dim');
    if (mean) text(x + 28, k % 2 ? 574 : 552, mean, 'mf-small');
  });
  text(40 + 9.5 * 66 + 28, 552, 'voice · ⇧ kit', 'mf-small');
  o.push('</svg>');
  return o.join('');
}

// 4x8 mirror of the Move pad grid. Maps pad index <-> musical note via a layout model
// (bottom-left = root at baseOctave, +1 scale degree per column, +rowOffset degrees per row),
// and mirrors its visual state to the Move's pad LEDs when `leds` is set.
import { noteName, noteAtDegree, pitchClass } from './theory.js';
import { COLOR } from 'movewire';

export const ROWS = 4, COLS = 8;
// class -> LED colour, highest priority first
const LED_PRIORITY = [['wrong', COLOR.RED], ['hit', COLOR.GREEN], ['on', COLOR.WHITE], ['target', COLOR.BLUE], ['root', COLOR.LIGHT_GREY], ['in-scale', COLOR.DARK_GREY]];

export class PadGrid {
  constructor(el) {
    this.el = el; this.cells = []; this.noteToCells = new Map(); this.padToNote = new Array(ROWS * COLS);
    this.cfg = { root: 0, scale: [0, 2, 4, 5, 7, 9, 11], rowOffset: 3, baseOctave: 3 };
    this.leds = null; // (padIndex, colorIndex) => void
    this.build();
  }

  build() {
    this.el.innerHTML = ''; this.cells = [];
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) {
      const d = document.createElement('div');
      d.className = 'pad'; d.dataset.row = r; d.dataset.col = c; d.dataset.pad = r * COLS + c;
      this.el.appendChild(d); this.cells.push(d);
    }
    this.relabel();
  }

  configure(partial) { Object.assign(this.cfg, partial); this.relabel(); }
  noteFor(row, col) { const { root, scale, rowOffset, baseOctave } = this.cfg; return noteAtDegree((baseOctave + 1) * 12 + root, row * rowOffset + col, scale); }
  padNote(i) { return this.padToNote[i]; }

  relabel() {
    this.noteToCells.clear();
    for (const cell of this.cells) {
      const i = +cell.dataset.pad, n = this.noteFor(+cell.dataset.row, +cell.dataset.col);
      this.padToNote[i] = n; cell.dataset.note = n; cell.textContent = noteName(n);
      cell.classList.add('in-scale'); cell.classList.toggle('root', pitchClass(n - this.cfg.root) === 0);
      if (!this.noteToCells.has(n)) this.noteToCells.set(n, []);
      this.noteToCells.get(n).push(cell);
    }
    this.syncLEDs();
  }

  notes() { return [...this.noteToCells.keys()].sort((a, b) => a - b); }

  set(note, cls, on) { for (const c of this.noteToCells.get(note) || []) c.classList.toggle(cls, on); this.syncLEDs(); }
  setPad(i, cls, on) { this.cells.find(c => +c.dataset.pad === i)?.classList.toggle(cls, on); this.syncLEDs(); }
  clear(cls) { for (const c of this.cells) c.classList.remove(cls); this.syncLEDs(); }
  flash(note, cls, ms = 250) { this.set(note, cls, true); setTimeout(() => this.set(note, cls, false), ms); }

  colorFor(cell) { for (const [cls, col] of LED_PRIORITY) if (cell.classList.contains(cls)) return col; return COLOR.OFF; }
  syncLEDs() { if (!this.leds) return; for (const c of this.cells) this.leds(+c.dataset.pad, this.colorFor(c)); }
}

// Web MIDI wrapper: inputs + outputs, SysEx, parsed events.
// Requires Chrome/Edge (Safari has no Web MIDI). Works on http://localhost or https.

const STATUS = { 0x80: 'noteoff', 0x90: 'noteon', 0xA0: 'polyat', 0xB0: 'cc', 0xC0: 'program', 0xD0: 'chanat', 0xE0: 'bend' };
const hex = (a) => [...a].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

export class Midi extends EventTarget {
  constructor() {
    super();
    this.access = null; this.input = null; this.output = null; this.sysexAllowed = false;
    this.clockCount = 0; this.lastClock = 0; this.clockIntervals = []; this.activeSensing = 0;
  }

  get supported() { return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator; }

  async init() {
    if (!this.supported) throw new Error('Web MIDI not supported in this browser (use Chrome/Edge).');
    try { this.access = await navigator.requestMIDIAccess({ sysex: true }); this.sysexAllowed = true; }
    catch (e) { this.access = await navigator.requestMIDIAccess({ sysex: false }); this.sysexAllowed = false; }
    this.access.onstatechange = () => this.dispatchEvent(new CustomEvent('ports', { detail: { inputs: this.inputs(), outputs: this.outputs() } }));
    return { inputs: this.inputs(), outputs: this.outputs() };
  }

  inputs() { return this.access ? [...this.access.inputs.values()] : []; }
  outputs() { return this.access ? [...this.access.outputs.values()] : []; }

  /** Prefer a port whose name looks like the Move; fall back to the first one. */
  pickDefault(list) { return list.find(p => /move/i.test(p.name)) || list[0] || null; }
  matchOutput(input) {
    const outs = this.outputs();
    return (input && outs.find(o => o.name === input.name)) || this.pickDefault(outs);
  }

  select(input, output = this.matchOutput(input)) {
    if (this.input) this.input.onmidimessage = null;
    this.input = input; this.output = output;
    if (input) input.onmidimessage = (e) => this.handle(e);
    this.dispatchEvent(new CustomEvent('selected', { detail: { input, output } }));
  }

  send(bytes) {
    if (!this.output) throw new Error('no MIDI output selected');
    this.output.send(bytes);
    this.dispatchEvent(new CustomEvent('sent', { detail: { bytes, hex: hex(bytes) } }));
  }

  handle(e) {
    const [b0, b1, b2] = e.data;
    const t = e.timeStamp ?? performance.now();
    this.dispatchEvent(new CustomEvent('raw', { detail: { bytes: e.data, t } }));
    if (b0 === 0xF0) { this.dispatchEvent(new CustomEvent('sysex', { detail: { bytes: [...e.data], hex: hex(e.data), t } })); return; }
    if (b0 === 0xFE) { this.activeSensing++; if (this.activeSensing === 1) this.dispatchEvent(new CustomEvent('activesensing')); return; }
    if (b0 === 0xF8) { this.onClock(t); return; }
    if (b0 === 0xFA || b0 === 0xFB || b0 === 0xFC) {
      this.dispatchEvent(new CustomEvent('transport', { detail: { kind: { 0xFA: 'start', 0xFB: 'continue', 0xFC: 'stop' }[b0], t } }));
      return;
    }
    if (b0 >= 0xF0) return;
    const type = STATUS[b0 & 0xF0];
    const ch = (b0 & 0x0F) + 1;
    const ev = { type, ch, t, raw: [...e.data] };
    if (type === 'noteon' && b2 === 0) ev.type = 'noteoff';
    if (ev.type === 'noteon' || ev.type === 'noteoff' || ev.type === 'polyat') { ev.note = b1; ev.velocity = b2; }
    if (type === 'cc') { ev.cc = b1; ev.value = b2; }
    if (type === 'chanat') ev.value = b1;
    if (type === 'bend') ev.value = ((b2 << 7) | b1) - 8192;
    this.dispatchEvent(new CustomEvent('message', { detail: ev }));
    this.dispatchEvent(new CustomEvent(ev.type, { detail: ev }));
  }

  onClock(t) {
    if (this.lastClock) { this.clockIntervals.push(t - this.lastClock); if (this.clockIntervals.length > 48) this.clockIntervals.shift(); }
    this.lastClock = t; this.clockCount++;
    if (this.clockCount % 24 === 0) {
      const avg = this.clockIntervals.reduce((a, b) => a + b, 0) / (this.clockIntervals.length || 1);
      this.dispatchEvent(new CustomEvent('beat', { detail: { t, bpm: avg ? Math.round(600000 / (avg * 24)) / 10 : 0 } }));
    }
  }
}
export { hex };

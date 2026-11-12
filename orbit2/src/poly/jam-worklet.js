// Jam recorder: one stereo input per lane bus (as many as the node was made with: 6 for L2). Records from `start` to
// `end` (audio-context seconds, so the take starts and ends exactly on master-clock ticks), as 16-bit samples, posted to
// the page in batches.
const BATCH = 16384;
class JamRec extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.lanes = options?.numberOfInputs || 4; this.start = Infinity; this.end = Infinity; this.fresh();
    this.port.onmessage = ({ data }) => {
      if (data.start != null) { this.start = data.start; this.end = Infinity; this.fresh(); }
      if (data.end != null) this.end = Math.max(data.end, this.start);
      if (data.cancel) { this.start = this.end = Infinity; this.fresh(); }
    };
  }
  fresh() { this.blk = Array.from({ length: this.lanes }, () => [new Int16Array(BATCH), new Int16Array(BATCH)]); this.n = 0; }
  flush() { if (this.n) this.port.postMessage({ lanes: this.blk.map(([l, r]) => [l.slice(0, this.n), r.slice(0, this.n)]) }); this.fresh(); }
  process(inputs, outputs) {
    // whole frames: the take is round((end - start) · sampleRate) long, so N bars at a tempo are exactly N bars of samples;
    // an end already passed (stop just after a bar line) finishes at once and `frames` tells the page where to cut
    const N = 128, f0 = currentFrame, s = Math.round(this.start * sampleRate), e = s + Math.round((this.end - this.start) * sampleRate);
    if (f0 >= e) { this.flush(); this.port.postMessage({ done: true, frames: e - s }); this.start = this.end = Infinity; return true; }
    if (f0 + N <= s) return true;
    const a = Math.max(0, s - f0), b = Math.min(N, e - f0);
    for (let f = a; f < b; f++) {
      for (let i = 0; i < this.lanes; i++) {
        const inp = inputs[i] || [], L = inp[0], R = inp[1] || L;
        const l = L ? L[f] : 0, r = R ? R[f] : 0;
        this.blk[i][0][this.n] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
        this.blk[i][1][this.n] = Math.max(-32768, Math.min(32767, Math.round(r * 32767)));
      }
      if (++this.n === BATCH) this.flush();
    }
    return true;
  }
}
registerProcessor('orbits-jam', JamRec);

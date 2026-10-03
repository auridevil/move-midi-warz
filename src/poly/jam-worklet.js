// Jam recorder: 4 stereo inputs (one per lane bus). Records from `start` to `end` (audio-context seconds, so the
// take starts and ends exactly on master-clock ticks), as 16-bit samples, posted to the page in batches.
const BATCH = 16384;
class JamRec extends AudioWorkletProcessor {
  constructor() {
    super(); this.start = Infinity; this.end = Infinity; this.fresh();
    this.port.onmessage = ({ data }) => {
      if (data.start != null) { this.start = data.start; this.end = Infinity; this.fresh(); }
      if (data.end != null) this.end = Math.max(data.end, this.start);
      if (data.cancel) { this.start = this.end = Infinity; this.fresh(); }
    };
  }
  fresh() { this.blk = Array.from({ length: 4 }, () => [new Int16Array(BATCH), new Int16Array(BATCH)]); this.n = 0; }
  flush() { if (this.n) this.port.postMessage({ lanes: this.blk.map(([l, r]) => [l.slice(0, this.n), r.slice(0, this.n)]) }); this.fresh(); }
  process(inputs, outputs) {
    const N = 128, t0 = currentTime;
    if (t0 >= this.end) { this.flush(); this.port.postMessage({ done: true }); this.start = this.end = Infinity; return true; }
    if (t0 + N / sampleRate <= this.start) return true;
    const a = Math.max(0, Math.ceil((this.start - t0) * sampleRate)), b = Math.min(N, Math.ceil((this.end - t0) * sampleRate));
    for (let f = a; f < b; f++) {
      for (let i = 0; i < 4; i++) {
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

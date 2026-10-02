// AudioWorklet that passes audio through and, while recording, posts copies of each block to the page.
class Rec extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = (e) => { this.on = e.data === 'start'; }; }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    for (let c = 0; c < output.length; c++) if (input[c]) output[c].set(input[c]);
    if (this.on && input.length) this.port.postMessage(input.map(ch => ch.slice(0)));
    return true;
  }
}
registerProcessor('unasm-rec', Rec);

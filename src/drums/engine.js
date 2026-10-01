// DrillEngine: plays an exercise (click + LED cues), grades incoming pad hits on timing and dynamics,
// applies the handbook's treatments and progression rule. Pure logic + WebAudio scheduling; no DOM.
// Events: step {step, bar, stepInBar, t}, cue {expected}, hit {expected, dev, velocity, dynOk, tight}, extra {pad, t},
//         miss {expected}, bar {bar, clean, errors, avgAbsDev}, levelUp {bpm}, ladder {bpm, direction}, stop
import { DYN, RULES, TREATMENTS } from './exercises.js';
import { padFor } from './kit.js';

export class DrillEngine extends EventTarget {
  constructor({ audio, kit, now = () => performance.now() }) {
    super();
    this.audio = audio; this.kit = kit; this.now = now;
    this.bpm = 90; this.swing = 50; this.click = true; this.playSounds = true; this.tolerance = 1; // 1 = normal window
    this.guide = false;   // play the pattern with the kit while you drill
    this.grading = true;  // false = preview: playback + cues only, nothing graded
    this.timer = null; this.running = false;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  /** Compile exercise + treatment into a flat list of expected hits per loop. */
  load(exercise, { treatment = 'none', bpm, swing } = {}) {
    this.exercise = exercise; this.treatmentKey = treatment;
    const tr = TREATMENTS[treatment] || TREATMENTS.none;
    const res = exercise.resolution || 16;                 // steps per bar (16ths or 32nds)
    let steps = exercise.steps, hits = [];
    for (const l of exercise.lanes) for (const [s, dyn] of Object.entries(l.hits)) hits.push({ step: +s, sound: l.sound, hand: l.hand, dyn, pad: padFor(l.sound, l.hand) });
    if (tr.shift) hits = hits.map(h => ({ ...h, step: (h.step + tr.shift) % steps }));
    if (tr.hole && steps === res) { const bars = 4; hits = [0, 1, 2].flatMap(b => hits.map(h => ({ ...h, step: h.step + b * res }))); steps = res * bars; }
    hits.sort((a, b) => a.step - b.step);
    this.pattern = { steps, res, hits, hitsByStep: groupBy(hits, h => h.step) };
    this.bpm = bpm ?? exercise.bpm; this.swing = swing ?? exercise.swing ?? 50;
    this.ladder = !!tr.ladder;
    return this.pattern;
  }

  get stepMs() { return 60000 / this.bpm / (this.pattern.res / 4); }
  get windowMs() { return Math.max(60, Math.min(120, this.stepMs * 0.45)) * this.tolerance; }   // accept window (± ms)
  get tightMs() { return this.windowMs * 0.5; }                                                 // "clean" threshold

  start() {
    if (!this.pattern) throw new Error('load() first');
    const ctx = this.audio.ensure();
    this.running = true; this.step = 0; this.loop = 0; this.bar = 0; this.expected = []; this.history = []; this.statsByBar = new Map();
    this.cleanStreak = 0; this.levelUps = 0; this.ladderBars = 0; this.scores = [];
    this.nextAudioT = ctx.currentTime + 0.15; this.audioToWall = this.now() - ctx.currentTime * 1000;
    this.barStartWall = this.nextAudioT * 1000 + this.audioToWall; this.bar0Wall = this.barStartWall; // wall time of step 0
    this.timer = setInterval(() => this.tick(), 25);
    this.emit('start', { bpm: this.bpm });
  }
  stop() { clearInterval(this.timer); this.timer = null; this.running = false; this.armed = false; this.emit('stop', { history: this.history }); }

  /** While previewing: start grading at the next pattern start, keeping the playback as a quiet guide, in sync. */
  startGrading() { if (!this.running || this.grading) return false; this.armed = true; this.emit('armed'); return true; }
  beginGrading(wallT) {
    this.armed = false; this.grading = true; this.guide = true;
    this.loop = 0; this.bar = 0; this.barStartWall = wallT; this.bar0Wall = wallT;
    this.expected = []; this.history = []; this.statsByBar = new Map(); this.scores = []; this.cleanStreak = 0; this.levelUps = 0; this.ladderBars = 0;
    this.emit('start', { bpm: this.bpm, fromPreview: true });
  }

  newBar() { return { misses: 0, extras: 0, late: 0, early: 0, dyn: 0, devs: [] }; }
  statsFor(bar) { if (!this.statsByBar.has(bar)) this.statsByBar.set(bar, this.newBar()); return this.statsByBar.get(bar); }
  barAt(t) { return Math.max(0, Math.floor((t - this.bar0Wall) / (this.pattern.res * this.stepMs))); }

  tick() {
    const ctx = this.audio.ctx, nowWall = this.now();
    // schedule ahead
    while (this.nextAudioT < ctx.currentTime + 0.12) {
      const { res, steps } = this.pattern;
      if (this.armed && this.step === 0) this.beginGrading(this.nextAudioT * 1000 + this.audioToWall);
      const stepInBar = this.step % res, bar = this.loop * (steps / res) + Math.floor(this.step / res);
      const swingOff = (stepInBar % 2 === 1 && res === 16) ? (this.swing - 50) / 50 * this.stepMs : 0;
      const audioT = this.nextAudioT + swingOff / 1000, wallT = audioT * 1000 + this.audioToWall;
      if (this.click && stepInBar % (res / 4) === 0) this.audio.click(stepInBar === 0, this.nextAudioT);
      const due = this.pattern.hitsByStep.get(this.step) || [];
      if (this.guide || !this.grading) for (const h of due) this.kit?.play?.(h.sound, guideVelocity(h.dyn), audioT, this.grading ? 0.45 : 1);
      if (this.grading) for (const h of due) { const ex = { ...h, t: wallT, bar, hit: null, id: `${bar}:${this.step}:${h.pad}` }; this.expected.push(ex); }
      const stepEv = { step: this.step, stepInBar, bar, t: wallT, due, res, steps };
      setTimeout(() => this.emit('step', stepEv), Math.max(0, wallT - this.now() - 30)); // cue LEDs ~30 ms early
      this.nextAudioT += this.stepMs / 1000;
      this.step = (this.step + 1) % steps;
      if (this.step === 0) this.loop++;
    }
    // expire misses
    for (const ex of this.expected) if (!ex.hit && !ex.missed && nowWall > ex.t + this.windowMs) { ex.missed = true; this.statsFor(ex.bar).misses++; this.emit('miss', { expected: ex }); }
    // bar boundary: evaluate once every expected hit of the bar has resolved
    if (nowWall > this.barStartWall + this.pattern.res * this.stepMs + this.windowMs) this.closeBar();
    this.expected = this.expected.filter(ex => nowWall < ex.t + this.windowMs + 2000);
  }

  /** 0–100 quality of one bar: coverage × timing × dynamics, minus extras. */
  scoreBar(s, expectedCount) {
    const E = expectedCount, H = s.devs.length;
    if (E === 0) return s.extras ? Math.max(0, 100 - 25 * s.extras) : 100;   // a silent bar (the gap): stay silent
    const m = H ? s.devs.reduce((a, b) => a + Math.abs(b), 0) / H : this.windowMs;
    const timing = Math.max(0, 1 - m / this.windowMs);
    return Math.min(100, Math.round(100 * Math.min(1, H / E) * (0.55 + 0.45 * timing) * (1 - 0.5 * s.dyn / Math.max(H, 1)) * Math.max(0, 1 - 0.5 * s.extras / E)));
  }
  closeBar() {
    if (!this.grading) { this.emit('bar', { bar: this.bar, preview: true }); this.bar++; this.barStartWall += this.pattern.res * this.stepMs; return; }
    const s = this.statsFor(this.bar); this.statsByBar.delete(this.bar);
    const errors = s.misses + s.extras + s.late + s.early + s.dyn;
    const avgAbsDev = s.devs.length ? Math.round(s.devs.reduce((a, b) => a + Math.abs(b), 0) / s.devs.length) : null;
    const clean = errors === 0 && s.devs.length > 0;
    const res = this.pattern.res, barInLoop = this.bar % (this.pattern.steps / res);
    let expectedCount = 0; for (let st = barInLoop * res; st < (barInLoop + 1) * res; st++) expectedCount += (this.pattern.hitsByStep.get(st) || []).length;
    const score = this.scoreBar(s, expectedCount); this.scores.push(score);
    this.cleanStreak = clean ? this.cleanStreak + 1 : 0;
    this.emit('bar', { bar: this.bar, clean, errors, avgAbsDev, stats: s, cleanStreak: this.cleanStreak, score, expectedCount });
    if (this.cleanStreak > 0 && this.cleanStreak % RULES.cleanBarsToLevelUp === 0) { this.levelUps++; this.emit('levelUp', { streak: this.cleanStreak, times: this.levelUps, suggestBpm: this.bpm + RULES.bpmUp }); }
    if (this.ladder) { this.ladderBars++; if (!clean) { this.setBpm(this.bpm - RULES.bpmDownOnError); this.ladderBars = 0; this.emit('ladder', { bpm: this.bpm, direction: 'down' }); } else if (this.ladderBars >= 8) { this.setBpm(this.bpm + RULES.bpmUp); this.ladderBars = 0; this.emit('ladder', { bpm: this.bpm, direction: 'up' }); } }
    this.bar++; this.barStartWall += this.pattern.res * this.stepMs;
  }

  setBpm(bpm) { this.bpm = Math.max(40, Math.min(240, bpm)); this.emit('bpm', { bpm: this.bpm }); }

  /** Incoming pad hit (pad index, velocity 0–127, wall time ms). */
  onPad(pad, velocity, t = this.now()) {
    if (!this.running || !this.grading) return;
    let best = null, bestD = Infinity;
    for (const ex of this.expected) { if (ex.hit || ex.pad !== pad) continue; const d = t - ex.t; if (Math.abs(d) <= this.windowMs && Math.abs(d) < Math.abs(bestD)) { best = ex; bestD = d; } }
    if (!best) { this.statsFor(this.barAt(t)).extras++; this.history.push({ t, pad, velocity, extra: true }); return this.emit('extra', { pad, velocity, t }); }
    best.hit = { t, velocity, dev: bestD };
    const [lo, hi] = DYN[best.dyn]; const dynOk = velocity >= lo - 10 && velocity <= hi + 10;
    const tight = Math.abs(bestD) <= this.tightMs;
    const bs = this.statsFor(best.bar);
    if (!tight) { if (bestD > 0) bs.late++; else bs.early++; }
    if (!dynOk) bs.dyn++;
    bs.devs.push(bestD);
    this.history.push({ t, pad, velocity, dev: Math.round(bestD), dyn: best.dyn, dynOk, step: best.step, bar: best.bar });
    this.emit('hit', { expected: best, dev: Math.round(bestD), velocity, dynOk, tight });
  }
}

const guideVelocity = (dyn) => ({ f: 110, w: 75, g: 30 }[dyn] ?? 100);

function groupBy(arr, key) { const m = new Map(); for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

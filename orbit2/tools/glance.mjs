// RD-1 glance test proxy (DECISION A2): look away, hold or turn something on the Move, look up for a 300 ms shutter,
// name the page and the lane. Each trial selects a lane on the simulated Move, then holds what the page needs (a
// touched knob = rhythm, Shift + a touched knob = sound, a held step = step N, Loop held = slots) and turns the knob a
// click, waits 300 ms, screenshots 1512×860, darkens it (a dark room) and scales it to what 70 cm shows. A fresh
// sub-agent that sees ONLY one image names the page and the lane; `score` checks the answers. Muted (cdp.mjs).
// RD-6, the step page: the trial holds a step of the lane (the drawn step folded into the lane's length: a 4-step kick
// has no step 7), and half the trials touch + turn a knob on it (Nils's T1b) while the rest only hold it; the shutter
// opens 300 ms after the page is due (after the turn, or after LOOK_MS: a shorter hold is still a tap and shows no
// page). The judge then names the held step too, and the set is put back (the turn's lock undone).
//
//   node orbit2/tools/glance.mjs --trials 20 --seed 1 --out /tmp/glance-kai/      # trial-01.png …, key.json, brief.txt
//   node orbit2/tools/glance.mjs score /tmp/glance-kai/key.json answers.json        # answers: [{ trial, page, lane, step }]
//   --port 5400 --debug-port 9400   --groove techno   --exposure 0.55 --gamma 1.5 --scale 0.71
//   --pages rhythm,sound   the pages in play (RD-5's A2; RD-6's: step; default all four). The brief still names all four.
//   score … --record setlog/glance-x.json --player kai --commit abc1234   also writes the run's record (RD-1's format)
//   score … --brief-file my-brief.txt   the judges saw another brief (RD-9: the page by the decision's page table): recorded as such
//
// Give each judge brief.txt and one image, nothing else (not the key, not the other images).
import { launch } from './cdp.mjs';
import { glanceTrials, scoreGlance, bytes, trackOf, GLANCE_PAGES } from './session-core.mjs';
import { openSet } from './session.mjs';
import { LOOK_MS } from '../src/poly/pages.js';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const BRIEF = `You are shown ONE photo of a laptop screen, taken in a dark room from about 70 cm, 300 ms after the player
touched or held something on a hardware controller (an Ableton Move) connected to this drum-machine web app. Look at
the image only. Answer two things, as JSON on one line: {"page": "...", "lane": N}
- page: what the controller's eight knobs edit right now, as the screen shows it: "rhythm" (the lane's pattern: length,
  hits, shift, speed, chance…), "sound" (the lane's sound: tune, decay, tone, drive…), "step" (one held step's own
  values) or "slots" (the pattern slots). If you cannot tell, give your best guess.
- lane: the number (1–6) of the lane the controls belong to. If you cannot tell, give your best guess.`;
/** What the judge names: RD-1 / RD-5 the page and the lane; with the step page in play (RD-6) the held step too. */
export const askOf = (pages) => (pages.includes('step') ? ['page', 'lane', 'step'] : ['page', 'lane']);
export const briefFor = (ask) => (!ask.includes('step') ? BRIEF : BRIEF.replace('Answer two things', 'Answer three things').replace('"lane": N}', '"lane": N, "step": N}') + `
- step: if the page is "step", the number of the step whose own values the knobs edit (1–32); otherwise null. If you
  cannot tell, give your best guess.`);

/** Darken (exposure × then gamma) and scale a PNG in the page; returns base64 PNG (night-ladder.mjs uses it too). */
export const DARKEN = `async (b64, exposure, gamma, scale) => {
  const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale), c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h); const im = g.getImageData(0, 0, w, h), d = im.data, lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, exposure * v / 255), gamma);
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  g.putImageData(im, 0, 0); const blob = await c.convertToBlob({ type: 'image/png' }), buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
}`;

export async function runGlance({ port = 5400, debugPort = 9400, path, groove = 'techno', trials = 20, seed = 1, out, exposure = 0.55, gamma = 1.5, scale = 0.71, pages = GLANCE_PAGES } = {}) {
  mkdirSync(out, { recursive: true });
  const key = glanceTrials(trials, seed, 4, pages), ask = askOf(pages), b = await launch({ port, debugPort });
  // what the page drew at the shutter (never shown to a judge: it tells a judge's miss from the page's)
  const DRAWN = `(() => { const g = (i) => document.getElementById(i); return { page: g('knobs').dataset.page, word: g('lh-page').textContent, lane: parseInt(g('lh-lane').textContent, 10), cells: g('stepsui').dataset.cells }; })()`;
  try {
    const p = await openSet(b, { path, groove }); const send = (x) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(x)}))`);
    await send(bytes.btn('play', true)); await send(bytes.btn('play', false)); await sleep(1500);   // a set is playing
    for (const k of key) {
      await send(bytes.btn(trackOf(k.lane - 1), true)); await send(bytes.btn(trackOf(k.lane - 1), false)); await sleep(1200);   // look away
      const knob = k.page === 'rhythm' || k.page === 'sound', held = [], set = k.page === 'step' ? await p.eval('JSON.stringify(__poly.m)') : null;
      if (k.page === 'sound') { await send(bytes.btn('shift', true)); held.push(bytes.btn('shift', false)); }
      if (knob) { await send(bytes.touch(k.knob, true)); await send(bytes.enc(k.knob, 1)); held.push(bytes.touch(k.knob, false)); }
      if (k.page === 'step') {
        // a step the lane has (the buttons show 16 of a longer lane: the held cell says which step that is)
        const btn = (k.step - 1) % Math.min(16, await p.eval('__poly.m.lane.length'));
        await send(bytes.step(btn, true)); held.unshift(bytes.step(btn, false));
        k.step = await p.eval(`[...document.querySelectorAll('#stepsui .st')].findIndex(b => b.classList.contains('held')) + 1`);
        await sleep(120);   // the hand goes on to a knob, or keeps holding
        if (k.turn) { await send(bytes.touch(k.knob, true)); await send(bytes.enc(k.knob, 1)); held.push(bytes.touch(k.knob, false)); }
        await sleep(k.turn ? 0 : LOOK_MS - 120);   // the page is due: at once on a turn, at LOOK_MS on a hold
      }
      if (k.page === 'slots') { await send(bytes.btn('loop', true)); held.push(bytes.btn('loop', false)); }
      await sleep(300);   // the shutter
      const { result } = await p.send('Page.captureScreenshot', { format: 'png' }); k.drawn = await p.eval(DRAWN);
      if (knob) await send(bytes.enc(k.knob, -1));   // the click back: the set stays as it was
      for (const x of held.reverse()) await send(x);
      if (set) {   // a turn on a held step locked it: undo puts the set back (checked)
        await sleep(60); if ((await p.eval('JSON.stringify(__poly.m)')) !== set) await p.eval('__poly.undo()');
        k.restored = (await p.eval('JSON.stringify(__poly.m)')) === set;
      }
      k.file = `trial-${String(k.trial).padStart(2, '0')}.png`;
      writeFileSync(join(out, k.file), Buffer.from(await p.eval(`(${DARKEN})(${JSON.stringify(result.data)}, ${exposure}, ${gamma}, ${scale})`), 'base64'));
    }
    writeFileSync(join(out, 'key.json'), JSON.stringify({ seed, groove, path: path || 'orbit2/index.html', pages, ask, exposure, gamma, scale, errors: p.errors, trials: key }, null, 1));
    writeFileSync(join(out, 'brief.txt'), briefFor(ask) + '\n');
    return { key, errors: p.errors };
  } finally { await b.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
  if (process.argv[2] === 'score') {
    const key = JSON.parse(readFileSync(process.argv[3], 'utf8')), ans = JSON.parse(readFileSync(process.argv[4], 'utf8')), ask = key.ask || ['page', 'lane'];
    const s = scoreGlance(key.trials || key, ans, 18, ask), stepOf = (x) => (x?.step != null ? ` step ${x.step}` : '');
    for (const r of s.rows) console.log(`trial ${r.trial}: ${r.ok ? 'right' : 'WRONG'} · was ${r.page} lane ${r.lane}${stepOf(r)}${r.turn ? ' (a knob turned)' : ''} · said ${r.said ? `${r.said.page} lane ${r.said.lane}${stepOf(r.said)}` : 'nothing'}`);
    console.log(`${s.right} / ${s.of} right (page ${s.pageRight}, lane ${s.laneRight}${s.stepRight != null ? `, step ${s.stepRight}` : ''}; ${Object.entries(s.byPage).map(([k, v]) => `${k} ${v.right}/${v.of}`).join(', ')}) · A2 ${s.pass ? 'PASS' : 'FAIL'} (≥ 18 of 20)`);
    const rec = arg('--record', null), trialOf = (k) => (key.trials || key).find(x => x.trial === k);
    if (rec) writeFileSync(rec, JSON.stringify({ format: 'orbits-glance', v: 1, player: arg('--player', null), page: key.path || 'orbit2/index.html', commit: arg('--commit', null), tool: 'orbit2/tools/glance.mjs',
      judges: arg('--judges', 'one fresh sub-agent per image (model sonnet), shown brief.txt and that image only'), run: { seed: key.seed, groove: key.groove, pages: key.pages || GLANCE_PAGES, ask, exposure: key.exposure, gamma: key.gamma, scale: key.scale, errors: key.errors },
      brief: arg('--brief-file', null) ? readFileSync(arg('--brief-file'), 'utf8').trimEnd() : briefFor(ask), score: { right: s.right, of: s.of, pass: s.pass, pageRight: s.pageRight, laneRight: s.laneRight, ...(s.stepRight != null && { stepRight: s.stepRight }), byPage: s.byPage },
      trials: s.rows.map(r => { const k = trialOf(r.trial); return { trial: r.trial, page: r.page, lane: r.lane, ...(r.step != null && { step: r.step, turn: r.turn }), said: r.said, ok: r.ok, ...(k?.drawn && { drawn: k.drawn }), ...(k?.restored != null && { restored: k.restored }) }; }) }, null, 1) + '\n');
  } else {
    const pages = String(arg('--pages', GLANCE_PAGES.join(','))).split(',').filter(Boolean);
    if (!pages.length || pages.some(x => !GLANCE_PAGES.includes(x))) throw new Error(`--pages: one or more of ${GLANCE_PAGES.join(', ')}`);
    const out = arg('--out', '/tmp/orbit2-glance'), r = await runGlance({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), path: arg('--path', 'orbit2/index.html'), groove: arg('--groove', 'techno'), trials: +arg('--trials', 20), seed: +arg('--seed', 1), out, exposure: +arg('--exposure', 0.55), gamma: +arg('--gamma', 1.5), scale: +arg('--scale', 0.71), pages });
    console.log(`${r.key.length} trials in ${out} (key.json is the answer key: never show it to a judge; brief.txt is the judge's brief)`);
    if (r.errors.length) { console.error(`page errors: ${r.errors.join(' | ')}`); process.exitCode = 2; }
  }
}

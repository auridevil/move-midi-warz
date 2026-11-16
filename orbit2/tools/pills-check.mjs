// RD-7 pills check (DECISION RD-7 row: each pill announced once and never per bar; 6 pills keep the sheet ≥ 340 px at
// 1280×720; A7 with pills). Muted headless Chrome (cdp.mjs), a fresh profile per run.
//
//   node orbit2/tools/pills-check.mjs                     # everything, a report on stdout
//   node orbit2/tools/pills-check.mjs --assert --json /tmp/x.json --shots /tmp/orbit2-impl/ --only ANNOUNCE,SHEET,KEEP
//   --port 5400 --debug-port 9400   --root /tmp/x (a `git archive`)
//
// ANNOUNCE  1512×860, playing at 180 bpm with record armed (latch), evolve every bar, locked dice, a solo and a jam take
//           recording: a MutationObserver on the status region (#pills, its drop-downs' unannounced hint left out) counts
//           every change over several bars; the decision's number is 0 per bar (the take's arming → recording is the one
//           change, before counting starts). Then the jam pill's words while it records: the same at two beats.
// SHEET     1280×720 (and 1512×860): six pills on (4 drawn + "+2 more"), the sheet open under the last one ≥ 340 px; the
//           rings (scene.geo) identical with no pill, six pills, "+2 more" dropped down and the sheet open (A7).
// KEEP      what must not regress: the jam take (download is a .zip, discard takes the pill away); a pending mute (mute on
//           next bar: the pill says it, the lane mutes on the bar line, then the pill goes); MIDI clock follow (its pill,
//           × = follow off); the quest (hint drop-down, skip → the next quest, show me draws the ghost hand and a key hides
//           it, × hides the quests); welcome back on a returning visit (play from the pill, it goes); Esc closes "+N more".
import { launch } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only', 'ANNOUNCE,SHEET,KEEP').split(','), shots = arg('--shots', null), port = +arg('--port', 5400), debugPort = +arg('--debug-port', 9400), root = arg('--root', undefined);
const PILLS6 = ['rec', 'chain', 'solo', 'evolve', 'welcome', 'quest'];
const out = {}, fails = [];
const check = (sec, ok, what) => { if (!ok) fails.push(`${sec}: ${what}`); };
const ready = async (p) => { for (let i = 0; i < 240; i++) { if (await p.eval('!!window.__poly')) return; await p.sleep(250); } throw new Error('orbit2 did not start'); };
const until = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.eval(expr)) return true; await p.sleep(50); } return false; };
const pillWords = `[...document.querySelectorAll('#pills > .spill:not([hidden])')].map(e => e.dataset.pill + (e.classList.contains('fold') ? '(fold)' : '') + ': ' + e.textContent.replace('×', '').trim())`;

const b = await launch({ port, debugPort, ...(root ? { root } : {}) });
try {
  if (only.includes('ANNOUNCE')) {
    const p = await b.open('orbit2/index.html', { width: 1512, height: 860 }); await ready(p);
    await p.eval(`(() => { const P = __poly; P.applyTempo(180); P.rec.knobs = 'latch'; P.setRec(true); P.evo.every = 1; P.setEvolve(true); P.dice.locked = true; P.toggleSolo(1); P.renderPills(); })()`);
    await p.eval('__poly.toggleJam()');   // arms, and starts the transport
    check('ANNOUNCE', await until(p, `__poly.jam.state === 'rec'`), 'the jam take never started recording');
    await p.sleep(600);
    const jam0 = await p.eval(`document.getElementById('jam-text').textContent`);
    await p.eval(`(() => { const r = document.getElementById('pills'); window.__plMut = []; window.__plObs = new MutationObserver((ms) => { for (const m of ms) { const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (t?.closest('[aria-live=off]')) continue; window.__plMut.push(m.type + ' ' + (t?.id || t?.className || t?.tagName) + (m.attributeName ? ' @' + m.attributeName : '')); } }); window.__plObs.observe(r, { subtree: true, childList: true, characterData: true, attributes: true }); window.__plT0 = __poly.clock().tick; })()`);
    await p.sleep(6000);
    const r = await p.eval(`(() => { window.__plObs.disconnect(); const ticks = __poly.clock().tick - window.__plT0; return { mutations: window.__plMut.slice(0, 20), n: window.__plMut.length, bars: ticks / __poly.bars.len, pills: ${pillWords}, jam: document.getElementById('jam-text').textContent, evolving: __poly.evo.on }; })()`);
    out.announce = { ...r, bars: Math.round(r.bars * 10) / 10, perBar: r.bars ? r.n / r.bars : null, jamBefore: jam0 };
    check('ANNOUNCE', r.bars >= 4, `only ${r.bars.toFixed(1)} bars went by`);
    check('ANNOUNCE', r.n === 0, `${r.n} changes in the status region over ${r.bars.toFixed(1)} bars: ${r.mutations.join(' | ')}`);
    check('ANNOUNCE', jam0 === r.jam && r.jam === '● jam · recording', `the jam pill moved: "${jam0}" → "${r.jam}"`);
    // rec · solo · evolve · dice drawn, the quest and the take folded (+2 more)
    check('ANNOUNCE', r.pills.length === 6 && r.pills[0].startsWith('rec: ● rec armed · latch') && r.pills.filter(s => s.includes('(fold)')).length === 2, `pills: ${r.pills.join(' | ')}`);
    if (shots) await p.shot(join(shots, '1512x860-playing-pills.png'));
    // the take: stop on the bar line, download, discard (KEEP, here while the take exists)
    if (only.includes('KEEP')) {
      await p.eval('__poly.stopJam()'); check('KEEP', await until(p, `__poly.jam.state === 'done'`, 20000), 'the take never closed');
      const done = await p.eval(`({ text: document.getElementById('jam-text').textContent, dl: !document.getElementById('jam-dl').hidden, discard: !document.getElementById('jam-discard').hidden, title: document.getElementById('jam-dl').title })`);
      check('KEEP', /^take ready · \d+ bars?$/.test(done.text) && done.dl && done.discard, `jam done: ${JSON.stringify(done)}`);
      p.captureDownloads(); await p.eval(`document.getElementById('jam-dl').click()`); await p.sleep(2500); const files = await p.downloads();
      const got = files.map(f => [f.name, f.bytes.length]);
      check('KEEP', got.some(([n, len]) => /\.zip$/.test(n) && len > 1000), `jam download: ${JSON.stringify(got)}`);
      await p.eval(`document.getElementById('jam-discard').click()`); await p.sleep(100);
      check('KEEP', await p.eval(`document.getElementById('jam-panel').hidden && __poly.jam.state === 'idle'`), 'discard left the jam pill');
      out.jam = { ...done, files: got };
      // a pending mute: the pill until the bar line, then the lane is muted and the pill gone
      await p.eval(`(() => { const P = __poly; P.setEvolve(false); P.setRec(false); P.toggleSolo(1); P.perf.muteBar = true; })()`);
      const mute = {};
      // wait until the bar line is at least three quarters of a bar away, then queue the mute
      await until(p, `(() => { const t = __poly.clock().tick, B = __poly.bars.len, x = ((t - __poly.bars.at) % B + B) % B; return x < B / 4; })()`, 5000);
      await p.eval(`__poly.toggleMute(2)`); await p.sleep(30);
      mute.queued = await p.eval(`({ pill: document.getElementById('sp-chain-go').textContent, shown: !document.getElementById('sp-chain').hidden, muted: __poly.m.lanes[2].muted })`);
      check('KEEP', mute.queued.shown && mute.queued.pill === '1 mute · next bar' && !mute.queued.muted, `a queued mute: ${JSON.stringify(mute.queued)}`);
      check('KEEP', await until(p, `__poly.m.lanes[2].muted`, 4000), 'the queued mute never landed');
      await p.sleep(150); mute.landed = await p.eval(`!document.getElementById('sp-chain').hidden`);
      check('KEEP', !mute.landed, 'the mute pill stayed after the bar line'); out.mute = mute;
      await p.eval('__poly.toggleMute(2)'); await p.eval(`document.getElementById('btn-play').click()`);
    }
  }
  if (only.includes('SHEET')) {
    out.sheet = {};
    for (const [w, h] of [[1280, 720], [1512, 860]]) {
      const p = await b.open('orbit2/index.html', { width: w, height: h }); await ready(p); await p.sleep(300);
      const rings = () => p.eval(`(() => { const g = __poly.scene.geo(), b = document.getElementById('cv').getBoundingClientRect(); return [Math.round(g.cx + b.left), Math.round(g.cy + b.top), Math.round(g.outer)].join(','); })()`);
      const r0 = await rings();
      await p.eval(`__poly.showPills(${JSON.stringify(PILLS6)}); __poly.setSheet('export', true)`); await p.sleep(300);
      const s = await p.eval(`(() => { const s = document.getElementById('sheet').getBoundingClientRect(), r = document.getElementById('pills').getBoundingClientRect(); return { sheet: Math.round(s.height), sheetTop: Math.round(s.top), pillsBottom: Math.round(r.bottom), drawn: [...document.querySelectorAll('#pills > .spill:not([hidden]):not(.fold)')].length, more: document.getElementById('sp-more').textContent, scroll: document.documentElement.scrollHeight }; })()`);
      const r6 = await rings(); if (shots) await p.shot(join(shots, `${w}x${h}-6-pills.png`));
      await p.eval('__poly.setPillsOpen(true)'); await p.sleep(200); const rOpen = await rings(); if (shots) await p.shot(join(shots, `${w}x${h}-6-pills-open.png`));
      const openSheet = await p.eval(`Math.round(document.getElementById('sheet').getBoundingClientRect().height)`);
      await p.eval('__poly.escapeOnce()'); const esc = await p.eval('__poly.pillsOpen');
      out.sheet[`${w}x${h}`] = { ...s, openSheet, rings: { none: r0, six: r6, open: rOpen } };
      check('SHEET', s.sheet >= 340 && openSheet === s.sheet, `${w}×${h}: the sheet is ${s.sheet} px with 6 pills (${openSheet} with "+2 more" open)`);
      check('SHEET', s.sheetTop >= s.pillsBottom, `${w}×${h}: the sheet (top ${s.sheetTop}) over the pills (to ${s.pillsBottom})`);
      check('SHEET', s.drawn === 4 && s.more === '+2 more ▾', `${w}×${h}: ${s.drawn} drawn, "${s.more}"`);
      check('SHEET', s.scroll <= h, `${w}×${h}: the page scrolls (${s.scroll})`);
      check('SHEET', r0 === r6 && r0 === rOpen, `${w}×${h} A7: rings ${r0} / ${r6} / ${rOpen}`);
      check('KEEP', esc === false, `${w}×${h}: Esc left "+N more" open`);
    }
  }
  if (only.includes('KEEP')) {
    const p = await b.open('orbit2/index.html', { width: 1512, height: 860 }); await ready(p); await p.sleep(300);
    const q = {}; q.first = await p.eval(pillWords);
    check('KEEP', q.first.some(s => /^quest: quest 1 of 5 · /.test(s)), `the quest pill: ${q.first.join(' | ')}`);
    await p.eval(`document.getElementById('quest-go').click()`); q.hint = await p.eval(`({ open: !document.getElementById('quest-more').hidden, hint: document.getElementById('quest-hint').textContent, exp: document.getElementById('quest-go').getAttribute('aria-expanded') })`);
    check('KEEP', q.hint.open && q.hint.hint.length > 20 && q.hint.exp === 'true', `quest hint: ${JSON.stringify(q.hint)}`);
    await p.eval(`document.getElementById('quest-show').click()`); await p.sleep(400); q.ghost = await p.eval('__poly.scene.ghosting');
    if (shots) await p.shot(join(shots, '1512x860-show-me.png'));
    await p.key('Shift'); q.ghostAfterKey = await p.eval('__poly.scene.ghosting');
    check('KEEP', q.ghost && !q.ghostAfterKey, `show me: drawn ${q.ghost}, after a key ${q.ghostAfterKey}`);
    await p.eval(`document.getElementById('quest-go').click()`); await p.eval(`document.getElementById('quest-skip').click()`); q.next = await p.eval(`document.getElementById('quest-n').textContent`);
    check('KEEP', q.next === 'quest 2 of 5', `skip: ${q.next}`);
    await p.eval(`document.getElementById('quest-x').click()`); q.hidden = await p.eval(`document.getElementById('quest').hidden && __poly.quests.hidden`);
    check('KEEP', q.hidden, 'quest × did not hide the quests');
    // clock follow: its pill, × = off
    await p.eval(`(() => { __poly.pmidi.inName = 'Clock in'; __poly.pmidi.setFollow('tempo'); __poly.renderPills(); })()`);
    const ck = { on: await p.eval(`document.getElementById('sp-clock-go').textContent`) };
    await p.eval(`document.getElementById('sp-clock-x').click()`); ck.after = await p.eval(`({ follow: __poly.pmidi.follow, hidden: document.getElementById('sp-clock').hidden })`);
    check('KEEP', ck.on === 'clock · Clock in' && ck.after.follow === 'off' && ck.after.hidden, `clock follow: ${JSON.stringify(ck)}`);
    out.quest = q; out.clock = ck;
    // welcome back: the same profile again = a returning visit
    const p2 = await b.open('orbit2/index.html', { width: 1512, height: 860 }); await ready(p2); await p2.sleep(300);
    const wb = { pills: await p2.eval(pillWords) };
    check('KEEP', wb.pills.some(s => s.startsWith('welcome: welcome back · play')), `returning visit: ${wb.pills.join(' | ')}`);
    await p2.eval(`document.getElementById('wb-keep').click()`); await p2.sleep(300);
    wb.after = await p2.eval(`({ hidden: document.getElementById('welcome').hidden, playing: document.getElementById('btn-play').getAttribute('aria-label') || document.getElementById('btn-play').textContent })`);
    check('KEEP', wb.after.hidden, `welcome after play: ${JSON.stringify(wb.after)}`); out.welcome = wb;
    await p2.eval(`document.getElementById('btn-play').click()`);
    out.errors = [...p.errors, ...p2.errors];
  }
} finally { await b.close(); }

out.fails = fails;
if (arg('--json', null)) { writeFileSync(arg('--json'), JSON.stringify(out, null, 1)); }
console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? `\n${fails.length} failing:\n- ${fails.join('\n- ')}` : '\nall pass');
if (process.argv.includes('--assert') && fails.length) process.exit(1);

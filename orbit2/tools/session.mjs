// RD-1 player-agent sets (DECISION A3, "run by agents"): plays orbit2/index.html?setlog from a seeded performer script,
// as Move MIDI (__poly.move.receive, the Move simulated as connected) or, with --mouse, as clicks, drags and keys,
// with slips injected; then tags every setlog entry as intended or an accident (destructive / harmless / silent).
// Muted headless Chrome (cdp.mjs). Real time by default: a 40-minute set takes 40 minutes.
//
//   node orbit2/tools/session.mjs --persona kai --seed 3 --minutes 40 --out /tmp/kai-1.json
//   node orbit2/tools/session.mjs --persona noor --mouse --slips 0.1 --intents knobs:4,listen:6,evolve:2
//   node orbit2/tools/session.mjs --persona kai --minutes 40 --speed 8 --prove 3   # compress the rests, once a 3-minute
//        prefix gave the same tags at speed 1 and at speed 8 (else it plays the set in real time)
//   --port 5400 --debug-port 9400 (yours)   --groove techno (the set starts from it)   --script plan.json (your own actions)
//   node orbit2/tools/session.mjs --retag set.json [--out new.json]   # today's tagger on a saved set (in place by default)
//
// Output (--out): the page's setlog JSON plus { session: { persona, seed, minutes, mouse, slips, speed, script, runs },
// tags: [per entry: action, intent, intended, class, cause], accidents: { destructive, harmless, silent, byCause } }.
import { launch } from './cdp.mjs';
import { performer, injectSlips, tagAccidents, bytes, trackOf } from './session-core.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SETTLE = 350;   // the setlog diffs a save on the next task; a knob turn folds for 0.7 s, but its entry exists by then

/** The Move as if connected: the page paints its LEDs (movewire caches them in move.ledState), the bytes go nowhere. */
export const SIM_MOVE = '__poly.move.transport = { send: () => {} }; __poly.move.inControl = true;';
/** Open the page as a set starts: ?setlog, the Move simulated as connected (LEDs painted), a groove. */
export async function openSet(b, { path = 'orbit2/index.html', groove = 'techno', width = 1512, height = 860 } = {}) {
  const p = await b.open(`${path}?setlog`, { width, height });
  // a busy machine (six sets at once) can take longer than open()'s 3.5 s to run the page's modules
  for (let i = 0; i < 80 && !(await p.eval('!!window.__poly')); i++) await sleep(250);
  await p.eval(`(async () => { await __poly.wake(); ${SIM_MOVE} __poly.loadGroove(${JSON.stringify(groove)}); __poly.sync(); })()`);
  await sleep(1200);   // past the welcome bar's click guard
  return p;
}

// a control in a closed drawer or another sheet tab: the player opens the tab and the drawer first (as a hand would; that
// click is not what is measured). RD-3: __poly.reveal does both (a page from before the sheet: the drawers only)
const center = (p, sel) => p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; if (__poly.reveal) __poly.reveal(e); else for (let d = e.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) d.open = true; if (!e.checkVisibility()) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const mouse = (p, type, x, y) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

/** Play one action on the page. Returns null, or why it was not played ('not on screen', 'already so'). */
export async function perform(p, a) {
  const send = (b) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(b)}))`);
  // the script is open-loop, the ears are not: a hand that wants a lane muted (or back) and hears it already is doesn't
  // press, so one accident (a double press left the kick muted) is not replayed into every later drop
  const want = a.expect?.length === 1 && /^lane(\d+)\.mute=(true|false)$/.exec(a.expect[0]);
  if (want && (await p.eval(`(() => { const li = ${want[1] - 1}, q = __poly.muteQ; return q.has(li) ? q.target(li) : !!__poly.m.lanes[li]?.muted; })()`)) === (want[2] === 'true')) return 'already so';
  const tap = async (down, up, n = a.slip?.kind === 'double' ? 2 : 1) => { for (let k = 0; k < n; k++) { await send(down); await sleep(70); await send(up); await sleep(90); } };
  switch (a.kind) {
    case 'move.step': return void await tap(bytes.step(a.step, true), bytes.step(a.step, false));
    case 'move.select': return void await tap(bytes.btn(trackOf(a.lane), true), bytes.btn(trackOf(a.lane), false));
    case 'move.play': return void await tap(bytes.btn('play', true), bytes.btn('play', false));
    case 'move.button': return void await tap(bytes.btn(a.button, true), bytes.btn(a.button, false));
    case 'move.hold': await send(bytes.btn(a.button, true)); await sleep(a.hold); return void await send(bytes.btn(a.button, false));
    case 'move.mute': { const row = a.slip?.row ?? a.lane; await send(bytes.btn('mute', true)); await sleep(60); await tap(bytes.pad(row, 0, true), bytes.pad(row, 0, false)); return void await send(bytes.btn('mute', false)); }
    case 'move.knob': {
      if (a.shift) await send(bytes.btn('shift', true));
      await send(bytes.touch(a.knob, true)); await sleep(80);
      for (let k = 0; k < Math.abs(a.turns); k++) { await send(bytes.enc(a.knob, Math.sign(a.turns))); await sleep(45); }
      await sleep(120); await send(bytes.touch(a.knob, false)); if (a.shift) await send(bytes.btn('shift', false)); return null;
    }
    case 'move.slotSave': case 'move.slotRecall': { const hold = a.kind === 'move.slotSave' ? 'duplicate' : 'loop'; await send(bytes.btn(hold, true)); await sleep(80); await tap(bytes.step(a.slot, true), bytes.step(a.slot, false)); await sleep(80); return void await send(bytes.btn(hold, false)); }
    case 'key': { for (let k = 0; k < (a.slip?.kind === 'double' ? 2 : 1); k++) { await p.key(a.key); await sleep(90); } return null; }
    case 'click': case 'hold': case 'drag': {
      const c = await center(p, a.sel); if (!c) return 'not on screen';
      const x = c.x + (a.slip?.dx || 0), y = c.y + (a.slip?.dy || 0);
      if (a.kind === 'click') { for (let k = 0; k < (a.slip?.kind === 'double' ? 2 : 1); k++) { await p.click(x, y); await sleep(90); } return null; }
      await mouse(p, 'mousePressed', x, y);
      if (a.kind === 'hold') await sleep(a.hold); else for (let k = 1; k <= 8; k++) { await mouse(p, 'mouseMoved', x, y + a.dy * k / 8); await sleep(25); }
      return void await mouse(p, 'mouseReleased', x, y + (a.kind === 'drag' ? a.dy : 0));
    }
  }
  return `unknown action ${a.kind}`;
}

/** Run a script on an open set page. speed > 1 compresses the time between actions (the rests), never a hold. */
export async function runScript(p, script, { speed = 1, onAction = null } = {}) {
  const runs = [], start = Date.now(), t00 = await p.eval('__poly.setlog.now()'); let errs = p.errors.length;
  for (const a of script) {
    const wait = start + a.at / speed - Date.now(); if (wait > 0) await sleep(wait);
    const t0 = await p.eval('__poly.setlog.now()'), skipped = await perform(p, a); await sleep(SETTLE);
    // RD-9: a run that page errors came during says how many there are by then (take 1 needed a replay to find them)
    const t1 = await p.eval('__poly.setlog.now()'), e = p.errors.length > errs ? (errs = p.errors.length) : 0;
    runs.push({ id: a.id, t0, t1, ...(skipped && { skipped }), ...(e && { errors: e }) }); onAction?.(a, runs.at(-1));
  }
  await sleep(800);
  const log = JSON.parse(await p.eval('__poly.setlog.file().text'));
  log.entries = log.entries.filter(e => e.t >= t00);   // the set's own: the groove it starts from is not an accident
  return { log, runs };
}

/** One whole set: a fresh browser, the performer's script with slips, the run and its tags. */
export async function playSet({ port = 5400, debugPort = 9400, path, groove, persona = 'noor', seed = 1, minutes = 40, mouse = false, slips = 0.08, speed = 1, intents = null, script = null, verbose = false } = {}) {
  const plan = injectSlips(script || performer({ seed, minutes, persona, mouse, intents }), { rate: slips, seed });
  const b = await launch({ port, debugPort });
  try {
    const p = await openSet(b, { path, groove: groove || (persona === 'kai' ? 'techno' : 'poly345') });
    const { log, runs } = await runScript(p, plan, { speed, onAction: verbose ? (a, r) => console.error(`${(r.t0 / 1000).toFixed(1)} s · ${a.intent} · ${a.kind}${a.slip ? ` · SLIP ${a.slip.kind}` : ''}${r.skipped ? ` · skipped: ${r.skipped}` : ''}`) : null });
    const t = tagAccidents(log.entries, runs, plan);
    return { ...log, session: { tool: 'orbit2/tools/session.mjs', persona, seed, minutes, mouse, slips, speed, groove: groove || null, intents, errors: p.errors, script: plan, runs }, tags: t.entries.map(tagOf), accidents: t.accidents };
  } finally { await b.close(); }
}
const tagOf = (e) => ({ id: e.id, action: e.action, intent: e.intent, intended: e.intended, class: e.class, cause: e.cause, ...(e.emptied && { emptied: true }) });

/** A saved set tagged again by today's tagger. Its plan is made again from its own seed, intents and slips; when that
 *  gives the very same actions, today's expectations apply, else the saved script is kept. The page's log is untouched. */
export function retag(set) {
  if (!set?.session?.script || !Array.isArray(set.entries)) throw new Error('not a set from session.mjs (no session script or setlog entries)');
  const s = set.session, act = (a) => JSON.stringify({ ...a, expect: undefined });
  const plan = s.intents !== undefined && injectSlips(performer({ seed: s.seed, minutes: s.minutes, persona: s.persona, mouse: s.mouse, intents: s.intents }), { rate: s.slips, seed: s.seed });
  const fresh = plan && plan.length === s.script.length && plan.every((a, i) => act(a) === act(s.script[i]));
  const script = fresh ? plan : s.script, t = tagAccidents(set.entries, s.runs, script);
  return { ...set, session: { ...s, script, retagged: { at: new Date().toISOString(), plan: fresh ? 'made again' : 'saved' } }, tags: t.entries.map(tagOf), accidents: t.accidents };
}

/** The accidents of a set as comparable rows (for --prove): what, from which action, of which class and cause. */
export const accidentRows = (set) => set.tags.filter(t => !t.intended).map(t => { const e = set.entries.find(x => x.id === t.id); return `${t.action}:${e.target}:${t.class}:${t.cause}`; }).sort();

export function summarize(set) {
  const a = set.accidents, s = set.session, slipped = s.script.filter(x => x.slip).length;
  const L = [`${s.persona} · seed ${s.seed} · ${s.minutes} min${s.mouse ? ' · mouse only' : ' · Move'} · ${s.script.length} actions, ${slipped} slips · speed ${s.speed}${s.errors.length ? ` · ${s.errors.length} page errors` : ''}`,
    `setlog: ${set.entries.length} entries · accidents: ${a.destructive} destructive, ${a.harmless} harmless audible, ${a.silent} silent`];
  for (const [c, v] of Object.entries(a.byCause)) L.push(`  ${c}: ${v.destructive} destructive, ${v.harmless} harmless, ${v.silent} silent`);
  if (a.emptied && (a.emptied.accident || a.emptied.meant)) L.push(`  lanes emptied (beside A3's classes): ${a.emptied.accident} by accident, ${a.emptied.meant} by a turn the hand meant`);
  const skipped = {}; for (const r of s.runs) if (r.skipped) skipped[r.skipped] = (skipped[r.skipped] || 0) + 1;
  for (const [why, n] of Object.entries(skipped)) L.push(`  ${n} actions not played: ${why === 'already so' ? 'the lane already was as the hand wanted (an earlier accident)' : why}`);
  const by = new Map(s.script.map(x => [x.id, x]));
  for (const r of s.runs.filter(r => r.errors)) { const x = by.get(r.id); L.push(`  page errors (${r.errors} by now) at ${(r.t0 / 1000).toFixed(1)} s, during ${x.intent} · ${x.kind}${x.sel ? ` ${x.sel}` : ''}${x.slip ? ` (slip: ${x.slip.kind})` : ''}`); }
  for (const t of set.tags.filter(t => !t.intended && t.class === 'destructive')) { const e = set.entries.find(x => x.id === t.id); L.push(`  DESTRUCTIVE at ${(e.t / 1000).toFixed(1)} s: ${e.target} ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)} (${t.cause}, intent ${t.intent})`); }
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  if (has('--retag')) {
    const file = arg('--retag'), set = retag(JSON.parse(readFileSync(file, 'utf8')));
    writeFileSync(arg('--out', file), JSON.stringify(set, null, 1)); console.log(`${summarize(set)}\n  (re-tagged, plan ${set.session.retagged.plan})`);
    process.exit(0);
  }
  if (arg('--out', null)) mkdirSync(dirname(arg('--out')), { recursive: true });   // before the set, not after 40 minutes
  const intents = arg('--intents', null) && Object.fromEntries(arg('--intents').split(',').map(s => { const [k, v] = s.split(':'); return [k, +v || 1]; }));
  const opt = { port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), path: arg('--path', 'orbit2/index.html'), groove: arg('--groove', null), persona: arg('--persona', 'noor'), seed: +arg('--seed', 1), minutes: +arg('--minutes', 40), mouse: has('--mouse'), slips: +arg('--slips', 0.08), intents, script: arg('--script', null) && JSON.parse(readFileSync(arg('--script'), 'utf8')), verbose: has('--verbose') };
  let speed = +arg('--speed', 1);
  if (speed > 1 && arg('--prove', null)) {   // the same prefix at both speeds: compress only if the accidents come out the same
    const pre = { ...opt, minutes: +arg('--prove') }, a = await playSet({ ...pre, speed: 1 }), b2 = await playSet({ ...pre, speed });
    const same = JSON.stringify(accidentRows(a)) === JSON.stringify(accidentRows(b2));
    console.error(`prove: a ${pre.minutes}-minute prefix at speed 1 and ${speed}: ${same ? 'the same accidents' : 'DIFFERENT accidents, playing in real time'}`);
    if (!same) speed = 1;
  } else if (speed > 1) console.error('speed without --prove: the rests are compressed unproven (say so with the results)');
  const set = await playSet({ ...opt, speed });
  if (arg('--out', null)) writeFileSync(arg('--out'), JSON.stringify(set, null, 1));
  console.log(summarize(set));
  if (set.session.errors.length) { console.error(`page errors: ${set.session.errors.join(' | ')}`); process.exitCode = 2; }
}

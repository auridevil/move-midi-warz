// RD-12 kit check (DECISION §3 RD-12): the all-lanes kit as one control on the console's lane head, driven in a muted
// headless Chrome (cdp.mjs) by every route the decision names — the select itself, ⌘K, and the Move's Shift + ◀ ▶ as
// MIDI bytes — with the model, the undo history, the setlog and the console-log overlay read back after each.
//
//   node orbit2/tools/kit-check.mjs                      # everything, a report on stdout
//   node orbit2/tools/kit-check.mjs --assert --only FACE,CLICK,CMDK,MOVE,B3,UNDO,PHONE
//   --port 5400 --debug-port 9400 --root /tmp/x (a `git archive`)
//
// FACE   the kit ▾ sits on the lane head right of voice ▾, same row, hairline, named "kit (all lanes)"; the sheet's
//        lane tab opens without a kit entry; the console-log overlay's status line names the kit.
// CLICK  choosing a kit on the select changes every lane's voice and sound to the kit's, the pattern stays, the peek
//        says "kit · name" and clears after its 400 ms, the setlog holds one 'kit' action (before → after), and the
//        select shows the kit it made.
// CMDK   ⌘K "kit", "drum rack" and "one-shots" put the console's kit first (RD-12 moved the whole-name bonus to the
//        words outside the parenthesis, so the export-kit ACTION no longer outranks it), and Enter lands the focus on
//        the control.
// MOVE   Shift + ▶ / ◀ as bytes cycles the kit and the console select follows (no screen look needed: the peek names
//        it); the mapping is the one RD-5 shipped, only the control moved.
// B3     a voice change on one lane shows "custom" at once; picking the old kit back re-applies it ("custom" goes);
//        re-picking the kit the lanes already match is a change event that re-applies and breaks nothing.
// UNDO   one kit change (> 700 ms from the last edit, past the history's coalescing) = exactly one new undo step, and
//        one undo restores every lane's voice and sound and the select's word.
// PHONE  at 390×844 the kit rides with voice ▾ into the sheet's lane drawer (ph-voice, the RD-10 pattern), and opening
//        the lane tab draws it.
import { launch } from './cdp.mjs';
import { bytes } from './session-core.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only', 'FACE,CLICK,CMDK,MOVE,B3,UNDO,PHONE').split(','), port = +arg('--port', 5400), debugPort = +arg('--debug-port', 9400), root = arg('--root', undefined);
const out = {}, fails = [];
const check = (sec, ok, what) => { if (!ok) fails.push(`${sec}: ${what}`); };
const ready = async (p) => { for (let i = 0; i < 240; i++) { if (await p.eval('!!window.__poly')) return; await p.sleep(250); } throw new Error('orbit2 did not start'); };
const SIM = `__poly.move.transport = { send: () => {} }; __poly.move.inControl = true;`;
const fresh = async (b, { setlog = true, width = 1512, height = 860, mobile = false } = {}) => {
  const p = await b.open(`orbit2/index.html${setlog ? '?setlog' : ''}`, { width, height, mobile });
  await ready(p); await p.eval('localStorage.clear()'); await p.send('Page.reload'); await p.sleep(1500); await ready(p);
  await p.eval(SIM);
  return p;
};
const state = (p) => p.eval(`(() => { const m = __poly.m, ks = document.getElementById('kit-select'); return {
  voices: m.lanes.map(l => l.voice).join(','), sounds: JSON.stringify(m.lanes.map(l => l.sound)),
  hits: JSON.stringify(m.lanes.map(l => l.hits)), kitKey: m.kitKey(), value: ks.value,
  customShown: !ks.querySelector('option[value=custom]').hidden, past: __poly.hist.past.length }; })()`);
// the mouse path: the setlog only logs a hand's action, so the synthetic change declares its source first (as the
// Move wrapper does with from('move'))
const pick = (p, key) => p.eval(`(() => { __poly.setlog?.from('pointer'); const ks = document.getElementById('kit-select'); ks.value = ${JSON.stringify(key)}; ks.dispatchEvent(new Event('change')); })()`);
const send = (p, b) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(b)}))`);
const peek = (p) => p.eval(`(() => { const e = document.getElementById('peek'); return { hidden: e.hidden, name: document.getElementById('peek-name').textContent }; })()`);

const b = await launch({ port, debugPort, root });
try {
  if (only.includes('FACE')) {
    const p = await fresh(b);
    out.FACE = await p.eval(`(() => { const ks = document.getElementById('kit-select'), vs = document.getElementById('voice-select');
      const kr = ks.getBoundingClientRect(), vr = vs.getBoundingClientRect();
      __poly.setSheet('lane', true); const pane = document.getElementById('pane-lane');
      const sheet = { open: !pane.hidden, kitInPane: !!pane.querySelector('#kit-select'), gauges: pane.querySelectorAll('.gauge').length };
      __poly.setSheet('lane', false);
      const logOff = document.getElementById('console-log').hidden; window.__setLog = null;
      return { laneHead: !!ks.closest('.lane-head'), rightOfVoice: kr.x > vr.right, sameRow: Math.abs(kr.y - vr.y) < 2,
        hair: ks.className === 'hair', aria: ks.getAttribute('aria-label'), options: ks.options.length, sheet, logOff }; })()`);
    // the console-log overlay names the kit (the backquote toggles it: the handler reads e.code)
    out.FACE.log = await p.eval(`(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '\\u0060', bubbles: true }));
      const t = document.getElementById('console-log'); return { shown: !t.hidden, line: t.textContent.split('\\n')[0] }; })()`);
    check('FACE', out.FACE.laneHead && out.FACE.rightOfVoice && out.FACE.sameRow, `placement ${JSON.stringify(out.FACE)}`);
    check('FACE', out.FACE.hair && out.FACE.aria === 'kit (all lanes)', 'hairline + accessible name');
    check('FACE', out.FACE.options >= 20, 'every kit listed (+ custom)');
    check('FACE', out.FACE.sheet.open && !out.FACE.sheet.kitInPane && out.FACE.sheet.gauges > 0, 'the lane tab works without the kit entry');
    check('FACE', out.FACE.log.shown && /kit /.test(out.FACE.log.line), `the overlay names the kit: "${out.FACE.log.line}"`);
    await p.close();
  }
  if (only.includes('CLICK')) {
    const p = await fresh(b);
    const s0 = await state(p);
    await pick(p, 'space'); const s1 = await state(p), pk = await peek(p);
    await p.sleep(600); const pk2 = await peek(p);
    const slog = await p.eval(`__poly.setlog.log.entries().filter(e => e.target === 'kit').map(e => [e.before, e.after])`).catch(() => null);
    out.CLICK = { before: s0.voices, after: s1.voices, kitKey: s1.kitKey, value: s1.value, peek: pk, peekAfter: pk2, slog };
    check('CLICK', s1.voices === 'sub,bell,blip,gong' && s1.kitKey === 'space' && s1.value === 'space', `all lanes changed ${s1.voices}`);
    check('CLICK', s1.hits === s0.hits, 'the pattern stays');
    check('CLICK', !pk.hidden && pk.name === 'kit · Space', `the peek says kit · Space (got "${pk.name}")`);
    check('CLICK', pk2.hidden, 'the peek clears after its 400 ms');
    check('CLICK', Array.isArray(slog) && slog.length === 1 && slog[0][1] === 'space', `one setlog 'kit' action ${JSON.stringify(slog)}`);
    await p.close();
  }
  if (only.includes('CMDK')) {
    const p = await fresh(b);
    out.CMDK = {};
    for (const q of ['kit', 'drum rack', 'one-shots']) {
      out.CMDK[q] = await p.eval(`(async () => { __poly.openFind(); const inp = document.getElementById('find');
        inp.value = ${JSON.stringify(q)}; inp.dispatchEvent(new Event('input', { bubbles: true }));
        const first = document.getElementById('find-o0')?.textContent || '';
        return first; })()`);
      check('CMDK', String(out.CMDK[q]).startsWith('kit (all lanes)'), `"${q}" → first hit "${out.CMDK[q]}"`);
      await p.eval(`__poly.escapeOnce()`);
    }
    // Enter lands the focus on the console control
    await p.eval(`(() => { __poly.openFind(); const inp = document.getElementById('find'); inp.value = 'kit'; inp.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.key('Enter'); await p.sleep(200);
    out.CMDK.enter = await p.eval(`document.activeElement?.id`);
    check('CMDK', out.CMDK.enter === 'kit-select', `Enter focuses the control (got ${out.CMDK.enter})`);
    await p.close();
  }
  if (only.includes('MOVE')) {
    const p = await fresh(b);
    const s0 = await state(p);
    const cyc = async (dir) => { await send(p, bytes.btn('shift', true)); await send(p, bytes.btn(dir, true)); await send(p, bytes.btn(dir, false)); await send(p, bytes.btn('shift', false)); await p.sleep(80); };
    await cyc('right'); const s1 = await state(p), pk = await peek(p);
    await p.sleep(800); await cyc('right'); const s2 = await state(p);
    await p.sleep(800); await cyc('left'); const s3 = await state(p);
    out.MOVE = { start: s0.kitKey ?? 'custom', one: s1.kitKey, two: s2.kitKey, back: s3.kitKey, follows: [s1, s2, s3].every(s => s.value === s.kitKey), peek: pk.name };
    check('MOVE', s1.kitKey && s2.kitKey && s1.kitKey !== s2.kitKey && s3.kitKey === s1.kitKey, `Shift + ▶ ▶ ◀ cycles ${JSON.stringify(out.MOVE)}`);
    check('MOVE', out.MOVE.follows, 'the console select follows the Move');
    check('MOVE', /^kit · /.test(pk.name), 'the peek names the kit on a Move change too');
    await p.close();
  }
  if (only.includes('B3')) {
    const p = await fresh(b);
    await pick(p, 'latin'); await p.sleep(100);
    const s1 = await state(p);
    await p.eval(`(() => { const vs = document.getElementById('voice-select'); vs.value = 'kick'; vs.dispatchEvent(new Event('change')); })()`);
    const s2 = await state(p);
    await pick(p, 'latin'); const s3 = await state(p);
    await pick(p, 'latin'); const s4 = await state(p);   // re-picking what the lanes already match: re-applies, breaks nothing
    out.B3 = { applied: s1.kitKey, afterVoice: { kitKey: s2.kitKey, value: s2.value, customShown: s2.customShown }, back: s3.kitKey, again: s4.kitKey, errors: p.errors.length };
    check('B3', s1.kitKey === 'latin' && s2.kitKey === null && s2.value === 'custom' && s2.customShown, `custom shows when a lane diverges ${JSON.stringify(out.B3)}`);
    check('B3', s3.kitKey === 'latin' && !s3.customShown && s4.kitKey === 'latin' && !p.errors.length, 're-picking re-applies');
    await p.close();
  }
  if (only.includes('UNDO')) {
    const p = await fresh(b);
    await p.sleep(800);   // past the history's 700 ms coalescing: the kit change is its own step
    const s0 = await state(p);
    await pick(p, 'gabber'); await p.sleep(100); const s1 = await state(p);
    await p.eval(`document.getElementById('btn-undo').click()`); await p.sleep(100); const s2 = await state(p);
    out.UNDO = { past: [s0.past, s1.past, s2.past], before: s0.voices, applied: s1.voices, restored: s2.voices, value: s2.value };
    check('UNDO', s1.past === s0.past + 1, `one undo step per kit change (past ${s0.past} → ${s1.past})`);
    check('UNDO', s2.voices === s0.voices && s2.sounds === s0.sounds && s2.value === s0.value, 'one undo restores voices, sounds and the select\'s word');
    await p.close();
  }
  if (only.includes('PHONE')) {
    const p = await fresh(b, { width: 390, height: 844, mobile: true });
    out.PHONE = await p.eval(`(() => { const ks = document.getElementById('kit-select');
      const home = !!ks.closest('#ph-voice'); __poly.reveal(ks);
      const drawn = !!ks.getClientRects().length, withVoice = !!document.getElementById('voice-select').closest('#ph-voice');
      return { home, withVoice, drawn }; })()`);
    check('PHONE', out.PHONE.home && out.PHONE.withVoice && out.PHONE.drawn, `ph-voice placement ${JSON.stringify(out.PHONE)}`);
    await p.close();
  }
} finally { await b.close(); }

console.log(JSON.stringify(out, null, 1));
if (fails.length) { console.error('\nFAIL\n' + fails.map(f => ' - ' + f).join('\n')); if (process.argv.includes('--assert')) process.exit(1); }
else console.log('\nall checks pass');

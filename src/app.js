import { Midi } from './midi.js';
import { MoveDevice, MODE, MODE_NAME, COLOR, toHex } from 'movewire';
import { PadGrid } from './pads.js';
import { Audio, Metronome } from './audio.js';
import { NOTE_NAMES, SCALES, noteName, noteAtDegree } from './theory.js';
import { MODES } from './trainer.js';

const $ = (id) => document.getElementById(id);
const midi = new Midi();
const move = new MoveDevice({ send: (bytes) => midi.send(bytes) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));
const grid = new PadGrid($('pads'));
const audio = new Audio();
const metronome = new Metronome(audio);
let trainer = null;
const connMode = () => $('conn-mode').value; // 'control' | 'standalone'

// ---- log ----
const log = (s) => { const el = $('log'); el.textContent += s + '\n'; if (el.textContent.length > 20000) el.textContent = el.textContent.slice(-15000); el.scrollTop = el.scrollHeight; };
$('btn-clear').onclick = () => { $('log').textContent = ''; };

// ---- layout ----
NOTE_NAMES.forEach((n, i) => $('root').add(new Option(n, i)));
Object.keys(SCALES).forEach(k => $('scale').add(new Option(k, k)));
function applyLayout() {
  grid.configure({ root: +$('root').value, scale: SCALES[$('scale').value], rowOffset: +$('row-offset').value, baseOctave: +$('base-octave').value });
  $('layout-info').textContent = `${NOTE_NAMES[grid.cfg.root]} ${$('scale').value}, ${noteName(grid.noteFor(0, 0))} → ${noteName(grid.noteFor(3, 7))}`;
  if (trainer) stopTrainer();
}
for (const id of ['root', 'scale', 'row-offset', 'base-octave']) $(id).addEventListener('change', applyLayout);
$('conn-mode').addEventListener('change', () => { $('cal-row').style.display = connMode() === 'standalone' ? '' : 'none'; });
$('cal-row').style.display = 'none';
applyLayout();

// ---- connection ----
function fillInputs(list) {
  const sel = $('midi-input'); sel.innerHTML = '';
  if (!list.length) sel.add(new Option('(no MIDI inputs)', ''));
  for (const p of list) sel.add(new Option(`${p.name}${p.manufacturer ? ' — ' + p.manufacturer : ''}`, p.id));
  const def = midi.pickDefault(list); if (def) sel.value = def.id;
}
function setPill(text, cls) { const el = $('midi-state'); el.textContent = text; el.className = `pill ${cls}`; }

$('btn-connect').onclick = async () => {
  try {
    audio.ensure();
    const { inputs } = await midi.init();
    fillInputs(inputs);
    $('p-sysex').textContent = midi.sysexAllowed ? 'yes' : 'NO — control mode needs SysEx (allow it in the Chrome prompt)';
    const port = inputs.find(p => p.id === $('midi-input').value) || midi.pickDefault(inputs);
    midi.select(port);
    if (!port) return;
    if (connMode() === 'control') {
      if (!midi.sysexAllowed) { setPill('Web MIDI: SysEx denied — use standalone mode', 'pill-warn'); return; }
      setPill(`Handshaking with ${port.name}…`, 'pill-warn');
      grid.leds = (i, c) => move.setPadColor(i, c);
      const { identity: id } = await move.connect();
      grid.syncLEDs();
      move.setButtonColor('play', COLOR.GREEN); move.setButtonColor('layout', COLOR.WHITE);
      setPill(`Move: control mode${id ? ` · fw ${id.major}.${id.minor}.${id.build}` : ' (no identity reply!)'}`, id ? 'pill-on' : 'pill-warn');
    } else {
      setPill(`Web MIDI: ${port.name} (standalone)`, 'pill-on');
    }
    $('btn-disconnect').disabled = false;
  } catch (e) { setPill(`Web MIDI: ${e.message}`, 'pill-off'); log(`! ${e.message}`); }
};
$('btn-disconnect').onclick = () => { stopTrainer(); grid.leds = null; move.disconnect(); audio.allNotesOff(); setPill('Web MIDI: disconnected (Move back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
window.addEventListener('beforeunload', () => { if (move.inControl) move.disconnect(); });
$('midi-input').onchange = () => midi.select(midi.inputs().find(p => p.id === $('midi-input').value) || null);
midi.addEventListener('ports', (e) => { fillInputs(e.detail.inputs); log(`ports: in[${e.detail.inputs.map(p => p.name).join(', ')}] out[${e.detail.outputs.map(p => p.name).join(', ')}]`); });
midi.addEventListener('selected', (e) => log(`in: ${e.detail.input?.name ?? '-'}   out: ${e.detail.output?.name ?? '-'}`));
move.addEventListener('sent', (e) => { if (e.detail.bytes[0] === 0xF0) log(`→ sysex ${toHex(e.detail.bytes)}`); });
midi.addEventListener('sysex', (e) => { log(`← sysex ${e.detail.hex}`); $('p-last').textContent = e.detail.hex; });
let sensed = false; move.addEventListener('activeSensing', () => { if (!sensed) { sensed = true; log('← active sensing (Move is waiting for a handshake)'); } });
midi.addEventListener('beat', (e) => { if (e.detail.bpm) $('bpm').placeholder = `clock ${e.detail.bpm}`; });
midi.addEventListener('transport', (e) => log(`transport ${e.detail.kind}`));
move.addEventListener('identity', (e) => { const d = e.detail; $('p-identity').textContent = `${d.idOk ? '✓ Ableton Move' : '✗ unexpected id'} · XMOS ${d.major}.${d.minor} build ${d.build} · serial ${d.serial} · board ${d.board} · ${d.length} bytes`; });
move.addEventListener('mode', (e) => { $('p-mode').textContent = `${e.detail} (${MODE_NAME[e.detail] ?? '?'})`; });
move.addEventListener('reply', (e) => log(`← move reply cmd ${e.detail.cmd} args [${e.detail.args.join(', ')}]`));

// ---- probe buttons ----
const PROBES = {
  identity: () => move.identify(),
  getmode: () => move.getMode(),
  ctrl: () => { move.setMode(MODE.CONTROL_SURFACE); move.getMode(); },
  standalone: () => { move.setMode(MODE.STANDALONE); move.getMode(); },
  wake: () => move.wakeDisplay(),
  ledtest: () => move.ledTest().then(() => { move.forgetLeds(); grid.syncLEDs(); }),
  clear: () => { move.clearLeds(); move.forgetLeds(); grid.syncLEDs(); },
};
for (const b of document.querySelectorAll('.probe')) b.onclick = () => { try { PROBES[b.dataset.p](); } catch (e) { log(`! ${e.message}`); } };

// ---- incoming events ----
// Control mode: typed events from the MoveDevice. Standalone mode: parsed MIDI where the note IS the musical note.
const held = new Map(); // pad index -> musical note
const inControl = () => connMode() === 'control';
midi.addEventListener('message', (e) => {
  if (inControl()) return;
  const m = e.detail;
  if (m.type === 'noteon' || m.type === 'noteoff') { grid.set(m.note, 'on', m.type === 'noteon'); log(`${m.type.padEnd(7)} ch${m.ch} ${noteName(m.note).padEnd(4)} (${m.note}) vel ${m.velocity}`); }
  else if (m.type === 'polyat') return;
  else log(`${m.type.padEnd(7)} ch${m.ch} ${m.raw.slice(1).join(' ')}`);
  trainer?.onNote?.(m);
});
move.addEventListener('pad', (e) => {
  if (!inControl()) return;
  const p = e.detail;
  const note = p.on ? grid.padNote(p.index) : (held.get(p.index) ?? grid.padNote(p.index));
  if (p.on) { held.set(p.index, note); audio.noteOn(note, p.velocity); } else { held.delete(p.index); audio.noteOff(note); }
  grid.setPad(p.index, 'on', p.on);
  log(`pad ${String(p.index).padStart(2)} ${p.on ? 'on ' : 'off'} → ${noteName(note).padEnd(4)} vel ${p.velocity}`);
  trainer?.onNote?.({ type: p.on ? 'noteon' : 'noteoff', note, velocity: p.velocity, pad: p.index, t: p.t });
});
move.addEventListener('step', (e) => inControl() && log(`step ${e.detail.index + 1} ${e.detail.on ? 'down' : 'up'}`));
move.addEventListener('encoder', (e) => {
  if (!inControl()) return;
  const { index, delta } = e.detail;
  if (index === 0) { $('bpm').value = Math.min(240, Math.max(40, (+$('bpm').value || 90) + delta)); trainer?.setBpm?.(+$('bpm').value); }
  if (index === 7) setVolume((+$('vol').value) + delta * 2);
  log(`knob ${index + 1} ${delta > 0 ? '+' : ''}${delta}`);
});
move.addEventListener('volume', (e) => inControl() && setVolume((+$('vol').value) + e.detail.delta * 2));
move.addEventListener('wheel', (e) => inControl() && log(`wheel ${e.detail.delta > 0 ? '+' : ''}${e.detail.delta}`));
move.addEventListener('button', (e) => {
  if (!inControl()) return;
  const { name, pressed } = e.detail;
  log(`${name} ${pressed ? 'down' : 'up'}`);
  if (!pressed) return;
  if (name === 'play') trainer ? stopTrainer() : startTrainer();
  if (name === 'layout') { const s = $('mode'); s.selectedIndex = (s.selectedIndex + 1) % s.options.length; if (trainer) startTrainer(); }
});
move.addEventListener('unknown', (e) => inControl() && log(`unmapped ${toHex(e.detail.bytes)}`));
function setVolume(v) { v = Math.min(100, Math.max(0, v)); $('vol').value = v; audio.setVolume(v / 100); }
$('vol').oninput = () => audio.setVolume(+$('vol').value / 100);

// ---- trainer ----
const ui = {
  target: (t) => { $('target').textContent = t; },
  feedback: (t, ok) => { const f = $('feedback'); f.textContent = t; f.style.color = ok === true ? 'var(--ok)' : ok === false ? 'var(--bad)' : 'var(--muted)'; },
  stats: (s) => { $('st-hits').textContent = s.hits; $('st-miss').textContent = s.misses; $('st-streak').textContent = s.streak; $('st-avg').textContent = s.avg ?? '—'; },
};
const ctx = { grid, audio, metronome, ui, bpm: () => +$('bpm').value || 90 };
function startTrainer() {
  stopTrainer();
  trainer = new MODES[$('mode').value](ctx); trainer.start();
  $('btn-start').disabled = true; $('btn-stop').disabled = false;
  if (move.inControl) move.setButtonColor('play', COLOR.RED);
}
function stopTrainer() {
  if (trainer) { trainer.stop(); trainer = null; }
  ui.target('—'); ui.feedback('', null); grid.clear('target'); grid.clear('hit'); grid.clear('wrong');
  $('btn-start').disabled = false; $('btn-stop').disabled = true;
  if (move.inControl) move.setButtonColor('play', COLOR.GREEN);
}
$('btn-start').onclick = startTrainer;
$('btn-stop').onclick = stopTrainer;

// ---- calibration (standalone mode: derive layout from 3 pad hits) ----
let cal = null;
const CAL_STEPS = ['hit the BOTTOM-LEFT pad', 'now the pad directly ABOVE it', 'now the pad to the RIGHT of bottom-left'];
$('btn-cal').onclick = () => { stopTrainer(); cal = { notes: [] }; $('cal-msg').textContent = `1/3 — ${CAL_STEPS[0]}`; };
midi.addEventListener('noteon', (e) => {
  if (!cal || connMode() !== 'standalone') return;
  cal.notes.push(e.detail.note);
  if (cal.notes.length < 3) { $('cal-msg').textContent = `${cal.notes.length + 1}/3 — ${CAL_STEPS[cal.notes.length]}`; return; }
  const [base, up, right] = cal.notes; cal = null;
  const scale = SCALES[$('scale').value];
  const degreeFrom = (n) => { for (let d = 0; d < 32; d++) if (noteAtDegree(base, d, scale) === n) return d; return -1; };
  const rowOff = degreeFrom(up), colOff = degreeFrom(right);
  if (rowOff < 0 || colOff !== 1) { $('cal-msg').textContent = `Hmm: base ${noteName(base)}, up +${up - base} st, right +${right - base} st — not consistent with ${$('scale').value}. Pick the scale Move is set to and retry.`; return; }
  $('root').value = base % 12; $('base-octave').value = Math.floor(base / 12) - 1; $('row-offset').value = rowOff; applyLayout();
  $('cal-msg').textContent = `✓ root ${NOTE_NAMES[base % 12]}, bottom-left ${noteName(base)}, row offset ${rowOff} degrees. Mirror updated.`;
});

// ---- keyboard fallback: A..K = bottom row, Q..I = row above, 1..8 = row 3 ----
const KEYS = ['asdfghjk', 'qwertyui', '12345678'];
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const r = KEYS.findIndex(k => k.includes(e.key)); if (r < 0) return;
  const c = KEYS[r].indexOf(e.key);
  const note = connMode() === 'control' ? 68 + r * 8 + c : grid.noteFor(r, c);
  midi.handle({ data: [0x90, note, 100], timeStamp: performance.now() });
  window.addEventListener('keyup', function off(ev) { if (ev.key === e.key) { midi.handle({ data: [0x80, note, 0], timeStamp: performance.now() }); window.removeEventListener('keyup', off); } });
});
log('ready — pick a connection mode and click Connect (Chrome/Edge). Keys A–K / Q–I / 1–8 simulate pads.');

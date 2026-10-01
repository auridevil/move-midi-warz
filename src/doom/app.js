import { Midi } from '../midi.js';
import { MoveDevice, COLOR, padRowCol } from 'movewire';
import { MoveKeymap, DomKeySink, JsDosSink, PRESETS, ROLE_HEX, keyByName } from '../../packages/move-keymap/src/index.js';

const $ = (id) => document.getElementById(id);
const log = (s) => { const el = $('log'); el.textContent += s + '\n'; if (el.textContent.length > 12000) el.textContent = el.textContent.slice(-9000); el.scrollTop = el.scrollHeight; };
const midi = new Midi();
const move = new MoveDevice({ send: (b) => midi.send(b) });
midi.addEventListener('raw', (e) => move.receive(e.detail.bytes, e.detail.t));

// ---- js-dos ----
let ci = null;
const dosEl = $('dos');
const sink = { dom: new DomKeySink(window, { mouseTarget: dosEl }), jsdos: null };
const keymap = new MoveKeymap(move, sink.dom, loadMapping());
const props = window.Dos(dosEl, {
  url: './games/doom/doom-19sw-v4.jsdos', pathPrefix: './games/doom/js-dos/emulators/', opfsRoot: 'midi-warz-doom-v4',
  autoStart: true, kiosk: true, backend: 'dosbox', backendLocked: true, workerThread: true, renderBackend: 'canvas', renderAspect: 'Fit', imageRendering: 'pixelated', theme: 'dark', volume: 0.7,
  onEvent: (event, arg) => {
    log(`js-dos: ${event}`);
    if (event === 'ci-ready') { ci = arg; sink.jsdos = new JsDosSink(ci); keymap.setSink(sink.jsdos); log('keys now go straight into DOSBox'); }
  },
});
$('btn-full').onclick = () => props.setFullScreen(true);
window.addEventListener('beforeunload', () => { keymap.releaseAll(); if (move.inControl) move.disconnect(); });

// ---- mapping UI ----
for (const [k, p] of Object.entries(PRESETS)) $('preset').add(new Option(p.name, k));
$('preset').value = localStorage.getItem('midi-warz.doom.preset') || 'doom';
function loadMapping() {
  const key = localStorage.getItem('midi-warz.doom.preset') || 'doom';
  try { const saved = JSON.parse(localStorage.getItem(`midi-warz.doom.map.${key}`) || 'null'); if (saved && saved.version === PRESETS[key].version) return saved; } catch {}
  return structuredClone(PRESETS[key]);
}
function saveMapping() { try { localStorage.setItem(`midi-warz.doom.map.${$('preset').value}`, JSON.stringify(keymap.mapping)); } catch {} }
$('preset').onchange = () => { localStorage.setItem('midi-warz.doom.preset', $('preset').value); keymap.setMapping(loadMapping()); };
$('btn-reset').onclick = () => { localStorage.removeItem(`midi-warz.doom.map.${$('preset').value}`); keymap.setMapping(structuredClone(PRESETS[$('preset').value])); };
$('btn-export').onclick = () => navigator.clipboard?.writeText(JSON.stringify(keymap.mapping, null, 2)).then(() => { $('learn-msg').textContent = 'mapping copied as JSON'; });

const padCells = new Map();
function renderPadmap() {
  const m = keymap.mapping; const el = $('padmap'); el.innerHTML = ''; padCells.clear();
  $('preset-name').textContent = m.name || '';
  for (let row = 3; row >= 0; row--) for (let col = 0; col < 8; col++) {
    if (col === 4) { const sp = document.createElement('div'); sp.className = 'pm spacer'; el.appendChild(sp); }
    const i = row * 8 + col, a = m.pads[i], d = document.createElement('div');
    d.className = 'pm'; d.dataset.pad = i;
    if (a) { d.style.background = keymap.hexFor(a); d.style.color = ['menu', 'weapon', 'strafe', 'move', 'run'].includes(a.role) ? '#050208' : '#fff'; d.innerHTML = `<b>${a.label || ''}</b><span>${keyName(a.keys)}</span>`; }
    else d.innerHTML = '<span>—</span>';
    d.title = `pad ${i} · row ${row + 1}, col ${col + 1}` + (a ? ` · ${keyName(a.keys)}` : '');
    d.onclick = () => beginLearn({ type: 'pad', id: i });
    el.appendChild(d); padCells.set(i, d);
  }
}
const keyName = (k) => (Array.isArray(k) ? k : [k]).map(x => keyByName(x)?.code?.replace(/^Key|^Digit/, '') || x).join('+');
keymap.addEventListener('change', renderPadmap);
keymap.addEventListener('action', (e) => {
  const { source, pressed, keys } = e.detail; $('last').textContent = `${source} ${pressed ? '↓' : '↑'} ${keys.join('+')}`;
  const pad = /^pad(\d+)$/.exec(source); if (pad) padCells.get(+pad[1])?.classList.toggle('pressed', pressed);
});

// learn: click a pad on screen (or press "Learn" then a pad on the Move), then press a keyboard key
let learnSource = null;
function beginLearn(source) { learnSource = source; keymap.cancelLearn(); $('learn-msg').textContent = `pad ${source.id}: now press the key you want (Esc cancels)`; }
$('btn-learn').onclick = () => { learnSource = null; keymap.startLearn(); $('learn-msg').textContent = 'press a pad, step or button on the Move…'; };
keymap.addEventListener('learn', (e) => { if (e.detail.source) { learnSource = e.detail.source; $('learn-msg').textContent = `${e.detail.source.type} ${e.detail.source.id}: now press the key you want (Esc cancels)`; } });
window.addEventListener('keydown', (e) => {
  if (!learnSource) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') { learnSource = null; keymap.cancelLearn(); $('learn-msg').textContent = 'cancelled'; return; }
  const role = /^Arrow/.test(e.code) ? 'move' : /^Digit/.test(e.code) ? 'weapon' : e.code === 'ControlLeft' ? 'fire' : e.code === 'Space' ? 'use' : e.code === 'ShiftLeft' ? 'run' : ['Enter', 'Escape', 'KeyY', 'KeyN'].includes(e.code) ? 'menu' : 'other';
  keymap.assign(learnSource, { keys: e.code, role, label: e.key.length === 1 ? e.key.toUpperCase() : e.key });
  $('learn-msg').textContent = `${learnSource.type} ${learnSource.id} → ${e.code}`; learnSource = null; keymap.cancelLearn(); saveMapping();
}, true);
$('legend').innerHTML = Object.entries(ROLE_HEX).map(([r, h]) => `<i class="sw" style="background:${h}"></i> ${r}`).join(' ');
renderPadmap();

// ---- Move connection ----
function setPill(t, cls) { const el = $('midi-state'); el.textContent = t; el.className = `pill ${cls}`; }
$('btn-connect').onclick = async () => {
  try {
    const { inputs } = await midi.init();
    const port = midi.pickDefault(inputs); midi.select(port);
    if (!port) { setPill('Move: no MIDI input found', 'pill-off'); return; }
    if (!midi.sysexAllowed) { setPill('Move: SysEx denied — allow it in the Chrome prompt', 'pill-warn'); return; }
    setPill(`Handshaking with ${port.name}…`, 'pill-warn');
    const { identity } = await move.connect();
    keymap.paintLeds();
    setPill(`Move: ready${identity ? ` · fw ${identity.major}.${identity.minor}.${identity.build}` : ''}`, 'pill-on');
    $('btn-disconnect').disabled = false;
  } catch (e) { setPill(`Move: ${e.message}`, 'pill-off'); log(`! ${e.message}`); }
};
$('btn-disconnect').onclick = () => { keymap.releaseAll(); move.disconnect(); setPill('Move: disconnected (back to standalone)', 'pill-off'); $('btn-disconnect').disabled = true; };
move.addEventListener('unknown', (e) => { if (e.detail.bytes[0] === 0xF0) log(`← unknown sysex`); });
log('ready — Connect Move, wait for DOOM to boot, play.');

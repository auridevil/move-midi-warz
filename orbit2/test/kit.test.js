// RD-12 kit on the console: the all-lanes kit is one control on the face (the lane head's kit ▾, id kept from the
// sheet), applied by the same model path the sheet control used (one sync = one undo step, one setlog action), with
// "custom" the moment any lane no longer matches a kit (B3), and found by ⌘K under "kit / drum rack / one-shots".
// The browser half (click, ⌘K, Move Shift + ◀ ▶, the overlay's name, undo) is orbit2/tools/kit-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Machine, DEFAULT_SOUND } from '../src/poly/lanes.js';
import { KITS, KIT_KEYS } from '../src/poly/kits.js';
import { entry, search } from '../src/poly/find.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('RD-12 the console control applies what the sheet control applied: the fixture lane JSON, patterns untouched', () => {
  // the old sheet select and the console select share applyKit → m.applyKit(KITS[key], DEFAULT_SOUND): the lanes a kit
  // leaves behind are pinned here as a fixture, so a change to the apply path (not to kits.js) fails loudly
  const m = new Machine(4); const hits = JSON.stringify(m.lanes.map(l => l.hits));
  m.applyKit(KITS.trap, DEFAULT_SOUND);
  assert.deepEqual(m.lanes.map(l => ({ voice: l.voice, sound: l.sound })), [
    { voice: 'kick808', sound: { ...DEFAULT_SOUND, decay: 0.75, snap: 0.5 } },
    { voice: 'snare808', sound: { ...DEFAULT_SOUND, decay: 0.35, snap: 0.7 } },
    { voice: 'hat', sound: { ...DEFAULT_SOUND, decay: 0.12, tone: 0.95 } },
    { voice: 'snap2', sound: { ...DEFAULT_SOUND, decay: 0.3, send: 0.3 } },
  ]);
  assert.equal(JSON.stringify(m.lanes.map(l => l.hits)), hits, 'a kit changes sounds, never patterns');
  assert.equal(m.kit, 'Trap'); assert.equal(m.kitKey(), 'trap');
  // a 6-lane pattern gets the kit's lanes 5–6 too
  const six = new Machine(6); six.applyKit(KITS.space, DEFAULT_SOUND);
  assert.deepEqual(six.lanes.map(l => l.voice), ['sub', 'bell', 'blip', 'gong', 'kalimba', 'crash']);
});

test('RD-12 B3: "custom" the moment one lane\'s voice (or sound) is changed; re-picking the kit puts it back', () => {
  const m = new Machine(4); m.applyKit(KITS.house909, DEFAULT_SOUND); assert.equal(m.kitKey(), 'house909');
  m.lanes[0].setVoice('kick'); assert.equal(m.kitKey(), null, 'a changed voice = custom');
  m.applyKit(KITS.house909, DEFAULT_SOUND); assert.equal(m.kitKey(), 'house909', 're-applying is a real change back');
  m.lanes[2].setSound('decay', 0.9); assert.equal(m.kitKey(), null, 'a tweaked sound = custom');
});

test('RD-12 ⌘K: "kit", "drum rack" and "one-shots" land on #kit-select on the console', () => {
  // the index entry as buildFindIndex reads it off the console (aria-label + the group round the lane head + options)
  const idx = [
    entry({ key: 'kit-select', name: 'kit (all lanes)', where: 'selected lane', extra: KIT_KEYS.map(k => KITS[k].name).join(' ') }),
    entry({ key: 'voice-select', name: 'voice', where: 'selected lane' }),
    entry({ key: 'exp-kit', name: 'export kit', where: 'export · Export', action: true, extra: 'zip' }),
  ];
  for (const q of ['kit', 'drum rack', 'one-shots', 'oneshots'])
    assert.equal(search(idx, q)[0].key, 'kit-select', `"${q}" → the console's kit`);
  assert.equal(search(idx, '909')[0].key, 'kit-select', 'found by its options too');
});

test('RD-12 static guards: one #kit-select, on the lane head, wired to applyKit; one undo step, one setlog action, the peek', () => {
  assert.equal(html.match(/id="kit-select"/g)?.length, 1, 'exactly one kit select (the sheet duplicate is gone)');
  const laneHead = html.slice(html.indexOf('class="lane-head"'), html.indexOf('id="knobs"'));
  assert.match(laneHead, /id="voice-select"[\s\S]*id="kit-select"/, 'on the lane head, right of voice ▾');
  assert.match(laneHead, /id="kit-select" class="hair" aria-label="kit \(all lanes\)"/, 'hairline, named for ⌘K and readers');
  assert.ok(!html.includes('<label>kit (all lanes)'), 'the sheet\'s labelled duplicate is removed');
  const apply = app.slice(app.indexOf('function applyKit'), app.indexOf('\n', app.indexOf('function applyKit')));
  assert.equal(apply.match(/sync\(\)/g)?.length, 1, 'one sync = one undo entry per kit change');
  assert.match(apply, /slog\?\.act\('kit', was, key, \{ absorb: true \}\)/, 'one setlog action (absorb: the lane diff is the action, not a second line)');
  assert.match(apply, /peekKit\(KITS\[key\]\.name\)/, 'the peek says "kit · name"');
  assert.match(app, /applyKit\(ks\.value\)/, 'the select applies through the one path (Move Shift + ◀ ▶ = cycleKit → applyKit too)');
  assert.match(app, /kit · \$\{peek\.kit\}/, 'paintPeek knows the kit words');
  assert.match(app, /\[\$\('kit-select'\), 'ph-voice'\]/, 'on phones the kit rides with voice into the sheet\'s lane drawer');
});

test('RD-12 A5 stays at 50: the quest\'s × folds into the quest drop-down on wide windows (the share-… precedent)', () => {
  assert.match(html, /id="quest-x" class="sp-x" type="button" data-folded-into="quest-go"/, 'folded, so the RD-1 id gate still finds it');
  assert.match(html, /id="quest-hide"/, 'its job lives in the drop-down (keyboard, mouse and touch)');
  assert.match(css, /@media not all and \(max-width: 1100px\) \{ #quest-x \{ display: none; \} \}/, 'hidden only where the drop-down serves');
  assert.match(app, /\$\('quest-hide'\)\.onclick = hideQuests/, 'wired to the same hide');
});

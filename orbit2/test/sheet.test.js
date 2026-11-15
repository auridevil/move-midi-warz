// RD-3 the sheet: every drawer and the old right column re-hosted (ids kept) in six tabs, as Greta's feature table maps
// them (proposals/greta/proposal.md "Where every feature goes"). The page is read as text: a tab's pane runs from its
// opening tag to the next pane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TABS = ['lane', 'pattern', 'groove', 'perform', 'export', 'setup'];
const sheet = html.slice(html.indexOf('<section id="sheet"'), html.indexOf('</section>'));
const panes = Object.fromEntries(TABS.map((t, i) => { const a = sheet.indexOf(`id="pane-${t}"`), b = i < TABS.length - 1 ? sheet.indexOf(`id="pane-${TABS[i + 1]}"`) : sheet.length; return [t, sheet.slice(a, b)]; }));

test('RD-3 six tabs in order, each a tab with its own pane (only the first shown in the markup)', () => {
  assert.deepEqual([...sheet.matchAll(/role="tab" id="tab-(\w+)" aria-controls="pane-(\w+)"/g)].map(m => [m[1], m[2]]), TABS.map(t => [t, t]));
  for (const t of TABS) assert.match(panes[t], new RegExp(`^id="pane-${t}" class="pane" data-sheet="${t}" aria-labelledby="tab-${t}"${t === 'lane' ? '>' : ' hidden>'}`));
});

test('RD-3 the 13 drawers all live in the sheet, in the tab Greta\'s table gives them', () => {
  const where = {
    lane: ['lane-drawer'], pattern: ['patterns-drawer', 'lib-drawer'], groove: ['Humanize', 'evolve-drawer', 'evo-sub', 'dice-drawer'],
    perform: ['Record'], export: ['export-drawer'], setup: ['settings-drawer', 'midi-drawer', 'keys-pop', 'nerd'],
  };
  const drawers = (s) => [...s.matchAll(/<details class="([^"]*)"(?: id="([\w-]+)")?[^>]*>\s*<summary>([^<]*)/g)].map(m => m[2] || (m[1].includes('evo-sub') ? 'evo-sub' : m[3].trim()));
  assert.equal([...html.matchAll(/<details\b/g)].length, 13, '13 drawers on the page');
  assert.equal(drawers(sheet).length, 13, 'all of them in the sheet');
  for (const t of TABS) assert.deepEqual(drawers(panes[t]), where[t], `tab ${t}`);
});

test('RD-3 the old right column\'s controls: lane chips in lane; init … clear and the grooves in pattern; what is on stays above the sheet', () => {
  assert.match(panes.lane, /id="lane-tabs"/);
  for (const id of ['btn-init', 'btn-save', 'btn-load', 'btn-random', 'btn-wild', 'btn-clear', 'grooves']) assert.match(panes.pattern, new RegExp(`id="${id}"`), id);
  for (const id of ['view-mode', 'stress-meter']) assert.match(panes.setup, new RegExp(`id="${id}"`), id);
  const hud = html.slice(html.indexOf('<div class="hud">'), html.indexOf('<section id="sheet"'));
  for (const id of ['welcome', 'quest', 'jam-panel']) assert.match(hud, new RegExp(`id="${id}"`), `${id} above the sheet`);
  assert.doesNotMatch(html, /id="hud-left"|id="hud-bl"/, 'the old columns are gone');
});

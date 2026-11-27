// RD-14: the "guide" tab of the "?" dialog is generated from docs/GUIDE.md (the one source), at build time: no runtime
// markdown parser, no dependency. Run after editing the guide:  node orbit2/tools/build-guide.mjs
// (test/guide.test.js checks index.html holds exactly this output, like the worklet test). Only the markdown subset the
// guide uses is read: front matter, # / ## headings, paragraphs, numbered and bullet lists, pipe tables, **bold**
// (= an exact control name), *italic*, `code`, [text](#guide-slug), and "(show me: <quest title>)" → a "show me" button.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTS } from '../src/poly/quests.js';

export const GUIDE_BEGIN = '<!-- GUIDE:BEGIN -->';
export const GUIDE_END = '<!-- GUIDE:END -->';
const GUIDE_URL = new URL('../docs/GUIDE.md', import.meta.url), INDEX_URL = new URL('../index.html', import.meta.url);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** "3 vs 4 vs 5" → "3-vs-4-vs-5"; the id of a section is guide-<slug> (its number is not part of it). */
export const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const questId = (title) => QUESTS.find(q => q.title === title)?.id;

/** One line of markdown → HTML. Code first (its text is taken as it is), then the rest of the line. */
export function inline(s) {
  const out = []; let i = 0;
  for (const part of s.split(/(`[^`]*`)/)) {
    if (i++ % 2) { out.push(`<code>${esc(part.slice(1, -1))}</code>`); continue; }
    out.push(esc(part)
      .replace(/\(show me: ([^)]+)\)/g, (_, t) => {
        const id = questId(t); if (!id) throw new Error(`GUIDE.md: "show me: ${t}" is not a quest title`);
        return `<button type="button" class="small guide-show" data-quest="${id}" aria-label="show me: ${t}">show me</button>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\(#(guide-[a-z0-9-]+)\)/g, '<a href="#$2" data-guide="$2">$1</a>'));
  }
  return out.join('');
}

/** The guide as sections: [{ id, title, html }]. The first ("first five minutes") and each numbered use case. */
export function parseGuide(md) {
  const lines = md.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n'), secs = []; let cur = null, i = 0;
  const flush = () => cur && secs.push(cur);
  const blockEnd = (re) => { let j = i; while (j < lines.length && re.test(lines[j])) j++; return j; };
  while (i < lines.length) {
    const l = lines[i];
    if (/^# /.test(l)) { i++; continue; }   // the page title: the tab names the guide
    if (/^## /.test(l)) { flush(); const title = l.slice(3).trim(); cur = { id: 'guide-' + slug(title.replace(/^\d+\.\s*/, '')), title, html: '' }; i++; continue; }
    if (!l.trim()) { i++; continue; }
    if (!cur) { cur = { id: 'guide-intro', title: '', html: '' }; }   // the line under the page title
    if (/^\|/.test(l)) {
      const j = blockEnd(/^\|/), rows = lines.slice(i, j).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      const [head, , ...body] = rows;
      cur.html += `<table class="gtable guide-steps"><thead><tr>${head.map(c => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      i = j; continue;
    }
    if (/^\d+\. /.test(l)) { const j = blockEnd(/^\d+\. /); cur.html += `<ol>${lines.slice(i, j).map(x => `<li>${inline(x.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`; i = j; continue; }
    if (/^- /.test(l)) { const j = blockEnd(/^- /); cur.html += `<ul>${lines.slice(i, j).map(x => `<li>${inline(x.slice(2))}</li>`).join('')}</ul>`; i = j; continue; }
    let j = i; while (j < lines.length && lines[j].trim() && !/^(#|\||- |\d+\. )/.test(lines[j])) j++;
    cur.html += `<p>${inline(lines.slice(i, j).join(' '))}</p>`; i = j;
  }
  flush();
  return secs;
}

/** The HTML that sits between the markers: each section a <details> (the first one open), summary = its title. */
export function renderGuide(md) {
  const secs = parseGuide(md), intro = secs.find(s => s.id === 'guide-intro');
  const body = secs.filter(s => s !== intro).map((s, n) => `<details class="guide-case" id="${s.id}"${n === 0 ? ' open' : ''}><summary>${esc(s.title)}</summary>${s.html}</details>`);
  return [intro ? `<p class="hint guide-intro">${intro.html.replace(/^<p>|<\/p>$/g, '')}</p>` : '', ...body].filter(Boolean).join('\n');
}

/** index.html with the block between the markers replaced by the guide of `md`. */
export function withGuide(html, md) {
  const a = html.indexOf(GUIDE_BEGIN), b = html.indexOf(GUIDE_END);
  if (a < 0 || b < a) throw new Error('index.html: the GUIDE:BEGIN / GUIDE:END markers are missing');
  return html.slice(0, a) + GUIDE_BEGIN + '\n' + renderGuide(md) + '\n' + html.slice(b);
}

// run as a script (a path with a space or a % is still this file: fileURLToPath, not the URL's escaped pathname)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const html = readFileSync(INDEX_URL, 'utf8'), next = withGuide(html, readFileSync(GUIDE_URL, 'utf8'));
  if (next !== html) writeFileSync(INDEX_URL, next);
  console.log(next === html ? 'guide: index.html already in sync' : 'guide: index.html updated');
}

// RD-14: reads the use cases and their rows out of docs/GUIDE.md (shared by tools/guide-check.mjs and test/guide.test.js)
/** The guide's use cases: { n, title, rows: [{ left, right, names: [bold in left], moves: [bold in right] }] } */
export function readGuide(text) {
  const out = []; let cur = null;
  for (const l of text.split('\n')) {
    const h = l.match(/^## (\d+)\. (.*)/); if (h) { cur = { n: +h[1], title: h[2], rows: [] }; out.push(cur); continue; }
    if (/^## /.test(l)) cur = null;
    if (cur && /^\|/.test(l) && !/^\|\s*(Mouse|-)/.test(l)) {
      const [left, right] = l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()), bold = (s) => [...s.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1]);
      cur.rows.push({ left, right, names: bold(left), moves: bold(right) });
    }
  }
  return out;
}


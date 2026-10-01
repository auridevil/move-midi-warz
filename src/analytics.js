// GoatCounter: privacy-friendly page counts, no cookies, no personal data.
// Dashboard: https://supervuoto.goatcounter.com/
// Skipped on localhost so dev sessions never pollute the stats.
if (!['localhost', '127.0.0.1', ''].includes(location.hostname)) {
  window.goatcounter = { endpoint: 'https://supervuoto.goatcounter.com/count' };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = 'https://supervuoto.goatcounter.com/count';
  document.head.appendChild(s);
}

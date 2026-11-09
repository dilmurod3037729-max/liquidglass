// Demo scene image (background + app interface). In a real project this is your own canvas, image or video.
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rr(g, x, y, w, h, r){ g.beginPath(); g.roundRect(x, y, w, h, r); }
export function makeScene(w, h, dpr){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const W = w / dpr, H = h / dpr, r = rng(7);
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1f3d'); bg.addColorStop(.5, '#10163a'); bg.addColorStop(1, '#0b2a33');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++){
    const x = r() * W, ww = 1 + r() * 6, a = 0.02 + r() * 0.08, hue = 185 + r() * 100;
    g.fillStyle = `hsla(${hue},65%,${28 + r() * 24}%,${a})`; g.fillRect(x, 0, ww, H);
  }
  // ilova sarlavhasi va kartalar
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.06)'; rr(g, 40, 28, W - 80, 54, 16); g.fill();
  g.fillStyle = '#eaf6ff'; g.font = '700 22px Segoe UI, sans-serif'; g.fillText('Demo Messenger', 64, 56);
  const chips = [['#00b4d8', 'Chats'], ['#7bd88f', 'Network'], ['#ffb454', 'Keys'], ['#ff7a90', 'Settings']];
  chips.forEach(([col, tx], i) => {
    const x = W - 520 + i * 118, y = 38;
    g.fillStyle = col; rr(g, x, y, 104, 34, 17); g.fill();
    g.fillStyle = '#06222c'; g.font = '600 14px Segoe UI, sans-serif'; g.textAlign = 'center'; g.fillText(tx, x + 52, y + 17); g.textAlign = 'left';
  });
  const names = ['Aziza', 'Bekzod', 'Dilnoza', 'Eldor', 'Farrux', 'Gulnora', 'Hasan', 'Iroda'];
  const cols = ['#00b4d8', '#7bd88f', '#ffb454', '#ff7a90', '#a98bff', '#4ad0b3', '#f2d45c', '#6ea8ff'];
  for (let i = 0; i < 8; i++){
    const cw = Math.min(310, (W - 120) / 3), x = 40 + (i % 3) * (cw + 20), y = 110 + Math.floor(i / 3) * 112;
    g.fillStyle = 'rgba(255,255,255,.07)'; rr(g, x, y, cw, 92, 20); g.fill();
    g.fillStyle = cols[i]; g.beginPath(); g.arc(x + 46, y + 46, 26, 0, 7); g.fill();
    g.fillStyle = '#06222c'; g.font = '700 20px Segoe UI, sans-serif'; g.textAlign = 'center'; g.fillText(names[i][0], x + 46, y + 47); g.textAlign = 'left';
    g.fillStyle = '#f1f8ff'; g.font = '600 17px Segoe UI, sans-serif'; g.fillText(names[i], x + 88, y + 34);
    g.fillStyle = 'rgba(220,238,255,.65)'; g.font = '14px Segoe UI, sans-serif'; g.fillText('Encrypted message ' + (i + 3) + ' minutes ago', x + 88, y + 62);
  }
  // a row of buttons at the bottom: the refraction is easy to see when the glass moves over them
  const by = H - 150, labels = ['Send', 'File', 'Voice', 'Video', 'More'];
  const bcols = ['#00b4d8', '#7bd88f', '#ffb454', '#ff7a90', '#a98bff'];
  labels.forEach((tx, i) => {
    const x = W / 2 - 330 + i * 134;
    g.fillStyle = bcols[i]; rr(g, x, by, 118, 46, 23); g.fill();
    g.fillStyle = '#06222c'; g.font = '700 15px Segoe UI, sans-serif'; g.textAlign = 'center'; g.fillText(tx, x + 59, by + 23); g.textAlign = 'left';
  });
  g.fillStyle = 'rgba(230,244,255,.8)'; g.font = '500 14px Segoe UI, sans-serif';
  for (let i = 0; i < 6; i++) g.fillText('Line ' + (i + 1) + ': check how text bends under liquid glass, letters stretch near the edge', 60, H - 96 + i * 0);
  return c;
}

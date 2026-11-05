// 32 dan ko'p shakl (ma'lumot teksturasi) ishlashini haqiqiy brauzerda tekshiradi: 120 ta kichik shisha tugma qo'shib skrinshot oladi.
// Ishlatish: node tests/many-shapes.mjs [url] [soni] [real]   (server ishlab turishi kerak; 'real' = haqiqiy GPU, aks holda swiftshader)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:5173/demo/';
const count = Number(process.argv[3] || 120);
const real = process.argv[4] === 'real';
const port = 9335;
const args = ['--headless=new', ...(real ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  `--remote-debugging-port=${port}`, '--window-size=1400,800', 'about:blank'];
const p = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', args, { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(3000);
  const added = await evalJs(`(() => {
    const g = window.__glass; if (!g) return -1;
    const cols = [[0.9,0.2,0.2,0.3],[0.2,0.7,0.3,0.3],[0.2,0.4,0.9,0.3],[0,0,0,0]];
    for (let i = 0; i < ${count}; i++) {
      const c = i % 15, r = Math.floor(i / 15);
      g.add({ w: 74, h: 34, radius: 17, draggable: false, tint: cols[i % 4] }, { x: 150 + c * 80, y: 470 + r * 44 });
    }
    g.wake(); return g.scene.count;
  })()`);
  await sleep(2500);
  const t0 = await evalJs('window.__glass.drawn');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL('./many-shapes.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ rejim: real ? 'haqiqiy GPU' : 'swiftshader', shakllar: added, chizilganKadr: t0 }));
} finally { p.kill(); }
process.exit(0);

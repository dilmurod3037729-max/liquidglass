// Shakllar soniga qarab bitta kadrning GPU vaqtini o'lchaydi (haqiqiy GPU, headless Chrome). readPixels bilan sinxron (gl.finish brauzerda GPU'ni kutmaydi).
// Ishlatish: node tests/bench-shapes.mjs   (server ishlab turishi kerak)
import { spawn } from 'node:child_process';

const port = 9336;
const p = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, '--window-size=1400,800', 'about:blank'], { stdio: 'ignore' });
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
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/demo/' });
  await sleep(3000);
  const out = await evalJs(`(async () => {
    const g = window.__glass, gl = g.renderer.gl, res = [], px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // GPU tugashini majburan kutadi
    g.params.merge = 1;   // tugmalar qo'shilmaydi (ilova adapteridagi holat)
    const measure = (label) => {
      for (let i = 0; i < 5; i++) { g.scene.step(1 / 60); g.renderer.render(g.scene, { dpr: g.dpr, light: g.light }); }
      sync();
      const n = 40, t0 = performance.now();
      for (let i = 0; i < n; i++) { g.renderer.render(g.scene, { dpr: g.dpr, light: g.light }); sync(); }
      res.push({ shakllar: g.scene.count, kadr_ms: +((performance.now() - t0) / n).toFixed(2) });
    };
    const target = [0, 45, 123, 251];
    for (const t of target) {
      while (g.scene.count < t + 5) {
        const i = g.scene.count, c = i % 20, r = Math.floor(i / 20);
        g.add({ w: 60, h: 30, radius: 15, draggable: false, tint: i % 3 ? [0,0,0,0] : [0.9,0.2,0.2,0.3] }, { x: 60 + c * 66, y: 60 + r * 38 });
      }
      measure();
    }
    return res;
  })()`);
  console.log(JSON.stringify(out));
} finally { p.kill(); }
process.exit(0);

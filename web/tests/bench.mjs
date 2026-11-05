// GPU/kadr tezligi o'lchovi: haqiqiy GPU'da (headless Chrome, D3D11) kartani 8 soniya doira bo'ylab sudraydi,
// so'ng 4 soniya tinch turadi. nvidia-smi bilan GPU yuklamasini, sahifadan chizilgan kadrlar sonini oladi.
// Ishlatish: node tests/bench.mjs [url]   (server ishlab turishi kerak). GPU > 75% bo'lsa to'xtaydi.
import { spawn, execFileSync } from 'node:child_process';

const url = process.argv[2] || 'http://127.0.0.1:5173/demo/';
const port = 9334;
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const p = spawn(chrome, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, '--window-size=1400,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const gpu = () => { try { return execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits']).toString().trim().split(',').map(Number); } catch { return null; } };
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

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
  const renderer = await evalJs(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'noma\\'lum'; })()`);
  const base = gpu();
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });

  const samples = []; let peak = 0, abort = false;
  const sampler = (async () => { while (!abort) { const g = gpu(); if (g) { samples.push(g[0]); peak = Math.max(peak, g[0]); if (g[0] > 75) abort = true; } await sleep(400); } })();

  const frames0 = await evalJs('(window.__glass?.drawn ?? window.__water?.drawn ?? 0)');
  await mouse('mousePressed', 420, 320);
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && !abort) {
    const a = (Date.now() - t0) / 400;
    await mouse('mouseMoved', 600 + Math.cos(a) * 260, 380 + Math.sin(a) * 160);
    await sleep(16);
  }
  await mouse('mouseReleased', 600, 380);
  const moveSamples = samples.slice();
  await sleep(2500);
  const dA = await evalJs('(window.__glass?.drawn ?? window.__water?.drawn ?? 0)');
  await sleep(2500);
  const dB = await evalJs('(window.__glass?.drawn ?? window.__water?.drawn ?? 0)');
  abort = true; await sampler;
  const idleSamples = samples.slice(moveSamples.length);
  const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 'n/a';
  console.log(JSON.stringify({ url, gpu: renderer, bosGPU_foiz: base && base[0], sudrash_orta_GPU_foiz: avg(moveSamples), sudrash_eng_yuqori: peak, tinch_orta_GPU_foiz: avg(idleSamples), vram_MB: base && base[1] + '/' + base[2], tinch_5s_kadr: dB - dA, toxtatildi_75_dan_oshdi: peak > 75 }, null, 1));
} finally { p.kill(); }
process.exit(0);

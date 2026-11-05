// Haqiqiy brauzerda (headless Chrome + WebGL) kartani tez sudraydi va skrinshot oladi.
// Ishlatish: node tests/drag-probe.mjs  (server ishlab turishi kerak: node scripts/serve.mjs)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const p = spawn(chrome, ['--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, '--window-size=1400,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:5173/demo/' });
  await sleep(2500);
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
  // karta boshlang'ich joyi ~ (W*0.3, H*0.4) = (420, 320). Tez o'ngga tortamiz.
  await mouse('mousePressed', 420, 320);
  for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', 420 + i * 55, 320 + i * 8); await sleep(16); }
  await sleep(90);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL('./' + (process.argv[3] || 'drag-probe') + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  await mouse('mouseReleased', 1080, 416);
  console.log('skrinshot: tests/' + (process.argv[3] || 'drag-probe') + '.png');
} finally { p.kill(); }
process.exit(0);

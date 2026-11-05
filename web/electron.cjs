// Electron main jarayoni uchun adapter: mavjud ilova oynasidagi tugmalarni shisha materialga almashtiradi,
// ilova kodiga TEGMASDAN. Foydalanish (main jarayonda, oyna yaratilgandan keyin):
//
//   const { enable } = require('liquidglass-web/electron');
//   enable(mainWindow, { selector: 'button, .btn', params: { bevel: 20 } });
//
// Sahifa surati main jarayonda webContents.capturePage() bilan olinadi (WebGL DOM'ni o'qiy olmaydi).
// Sahifa o'zgarsa (bo'lim almashdi, ro'yxat yangilandi) surat va shisha ~0.2 s ichida qayta quriladi.
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Electron.BrowserWindow} win
 * @param {{selector?:string, exclude?:string, maxShapes?:number, params?:object, labelContrast?:boolean,
 *          pollMs?:number, beforeCycle?:string, onCycle?:(info:{shapes:number, ms:number})=>void}} opts
 *   beforeCycle — har sikl oldidan sahifada bajariladigan JS (ixtiyoriy, masalan sinov uchun orqa fon)
 * @returns {{ready: Promise<void>, stop(): void}}
 */
function enable(win, opts = {}) {
  const bundle = fs.readFileSync(path.join(__dirname, 'dist', 'liquidglass.js'), 'utf8');
  const { pollMs = 350, beforeCycle, onCycle, ...domOpts } = opts;
  const js = (code) => win.webContents.executeJavaScript(code);
  let stopped = false;
  let readyResolve; const ready = new Promise((r) => { readyResolve = r; });

  async function cycle() {
    const t0 = Date.now();
    await js('window.__lgDom.teardown()');
    if (beforeCycle) { await js(beforeCycle); await sleep(300); }
    const shapes = await js('window.__lgDom.prepare()');
    await sleep(160);   // asl tugmalar yashirilib, sahifa qayta chizilishi uchun
    const image = await win.webContents.capturePage();
    await js(`window.__lgDom.startFromUrl(${JSON.stringify(image.toDataURL())})`);
    if (onCycle) onCycle({ shapes, ms: Date.now() - t0 });
  }

  async function run() {
    // oyna ko'rinib, o'lchami paydo bo'lguncha kutamiz
    for (let i = 0; i < 80 && !win.isDestroyed(); i++) {
      const [w, h] = win.getContentSize();
      if (win.isVisible() && w > 300 && h > 300) break;
      await sleep(250);
    }
    await sleep(1500);
    await js(`${bundle}\n;window.__lgDom = new window.LiquidGlassLib.DomGlass(${JSON.stringify(domOpts)});void 0;`);
    await cycle();
    readyResolve();
    while (!stopped && !win.isDestroyed()) {
      await sleep(pollMs);
      try { if (await js('window.__lgDom.isDirty')) { await sleep(250); await cycle(); } } catch (e) { if (!win.isDestroyed()) console.error('[liquidglass]', e.message); }
    }
  }

  const start = () => run().catch((e) => console.error('[liquidglass]', e));
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', start); else start();
  return { ready, stop() { stopped = true; } };
}

module.exports = { enable };

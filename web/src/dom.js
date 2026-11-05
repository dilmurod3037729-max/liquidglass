import { LiquidGlass } from './glass.js';

const DEFAULTS = {
  selector: 'button, [role="button"]',   // qaysi elementlar shisha bo'lsin
  exclude: '',                           // shu selektorga mos kelganlar o'tkazib yuboriladi
  maxShapes: 32,                         // bir vaqtda (GPU uniform chegarasi: 32)
  minSize: [28, 24],                     // bundan kichik elementlar o'tkazib yuboriladi (px)
  params: {},                            // glass.params ga beriladi (bevel, thick, ...)
  labelContrast: true,                   // yozuv rangi shisha ostidagi fon yorug'ligiga moslashadi
  zIndex: 2147483000,
};

/**
 * Mavjud sahifa/ilovadagi HAQIQIY elementlarni (tugmalarni) shisha materialga almashtiradi, ilova kodiga tegmasdan.
 * Asl element ko'rinmas (opacity 0) lekin bosiladigan qoladi; uning o'rnida shisha va yozuv nusxasi turadi.
 *
 * Ish tartibi: prepare() -> (sahifa surati olinadi, asl elementlar yashirin) -> start(surat). Sahifa o'zgarsa isDirty = true.
 * Suratni kim oladi: Electron'da main jarayon (electron.js), brauzerda `snapshot` funksiyasi (attach).
 */
export class DomGlass {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts, params: { ...DEFAULTS.params, ...(opts.params || {}) } };
    this.items = []; this.hidden = []; this.labels = []; this.rects = [];
    this.glass = null; this.canvas = null;
    this.busy = false; this.dirty = true;
    this._down = null; this._up = null;
    const mine = (n) => n.nodeType !== 1 || n.hasAttribute('data-lg');
    this._mo = new MutationObserver((muts) => {
      if (this.busy) return;
      // O'z tugunlarimiz va yashirilgan asl elementlarning opacity o'zgarishi ilova o'zgarishi EMAS
      const real = muts.some((m) => !(m.target.closest && m.target.closest('[data-lg]')) &&
        !(m.type === 'attributes' && m.attributeName === 'style' && this.items.some((i) => i.el === m.target)) &&
        !(m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(mine)));
      if (real) { this.dirty = true; this._onDirty && this._onDirty(); }
    });
    this._mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    this._resize = () => { this.dirty = true; this._onDirty && this._onDirty(); };
    addEventListener('resize', this._resize);
  }

  get isDirty() { return this.dirty && !this.busy; }

  #collect() {
    const { selector, exclude, maxShapes, minSize } = this.o, out = [];
    for (const el of document.querySelectorAll(selector)) {
      if (exclude && el.matches(exclude)) continue;
      if (el.closest('[data-lg]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < minSize[0] || r.height < minSize[1] || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      out.push({ el, r, rad: Math.min(parseFloat(cs.borderTopLeftRadius) || 12, Math.min(r.width, r.height) / 2) });
      if (out.length >= maxShapes) break;
    }
    return out;
  }

  /** 1-qadam: shisha bo'ladigan elementlarni topib, asl ko'rinishini yashiradi. Qaytaradi: elementlar soni. */
  prepare() {
    this.busy = true;
    this.items = this.#collect();
    this.hidden = this.items.map(({ el }) => { const p = el.style.opacity; el.style.opacity = '0'; return [el, p]; });
    return this.items.length;
  }

  teardown() {
    this.busy = true;
    if (this._down) { document.removeEventListener('pointerdown', this._down, true); document.removeEventListener('pointerup', this._up, true); this._down = this._up = null; }
    if (this.glass) { this.glass.dispose(); this.glass = null; }
    if (this.canvas) { this.canvas.remove(); this.canvas = null; }
    this.labels.forEach((l) => l.remove()); this.labels = [];
    this.hidden.forEach(([el, p]) => { el.style.opacity = p; }); this.hidden = [];
  }

  /** dataURL (yoki URL) dan suratni yuklab, start() ni chaqiradi */
  startFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(this.start(img));
      img.onerror = () => { this.busy = false; reject(new Error('liquidglass: sahifa surati yuklanmadi')); };
      img.src = url;
    });
  }

  /** 2-qadam: surat (canvas/img/ImageBitmap) tayyor, shisha qatlamini quradi. */
  start(source) {
    const o = this.o;
    const cv = document.createElement('canvas');
    cv.setAttribute('data-lg', '1');
    cv.style.cssText = `position:fixed;inset:0;width:100%;height:100%;z-index:${o.zIndex};pointer-events:none;`;
    document.body.appendChild(cv);
    this.canvas = cv;
    const glass = new LiquidGlass(cv, { source });
    glass.params.merge = 1;   // qo'shni tugmalar o'zaro qo'shilmasin
    Object.assign(glass.params, o.params);
    this.glass = glass;

    const probe = document.createElement('canvas'); probe.width = probe.height = 1;
    const pc = probe.getContext('2d', { willReadFrequently: true });
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    const sx = sw / innerWidth, sy = sh / innerHeight;
    const lumAt = (r) => { pc.drawImage(source, r.left * sx, r.top * sy, r.width * sx, r.height * sy, 0, 0, 1, 1); const d = pc.getImageData(0, 0, 1, 1).data; return (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 255; };

    this.rects = [];
    this.items.forEach(({ el, r, rad }) => {
      const lab = el.cloneNode(true);
      lab.setAttribute('data-lg', '1'); lab.removeAttribute('id');
      const dark = o.labelContrast ? lumAt(r) > 0.55 : null;
      const col = dark === null ? '' : `color:${dark ? '#0f172a' : '#fff'} !important;text-shadow:${dark ? 'none' : '0 1px 4px rgba(0,0,0,.5)'};`;
      // asl fon/soya/chekinish olib tashlanadi (margin: aks holda yozuv siljiydi), pointer-events yo'q (bosish asl tugmaga o'tadi)
      lab.style.cssText += `;background:none !important;box-shadow:none !important;border-color:transparent !important;backdrop-filter:none !important;pointer-events:none !important;opacity:1 !important;margin:0 !important;inset:auto;z-index:${o.zIndex + 1};${col}`;
      if (dark !== null) lab.querySelectorAll('*').forEach((c) => c.style.setProperty('color', dark ? '#0f172a' : '#fff', 'important'));
      document.body.appendChild(lab);
      this.labels.push(lab);
      glass.add({ w: r.width, h: r.height, radius: rad, draggable: false }, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, lab);
      this.rects.push(r);
    });

    // asl tugma bosilganda mos shisha "bosilgan" holatga o'tadi
    const find = (e) => this.rects.findIndex((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    this._down = (e) => { const i = find(e); if (i >= 0) { glass.scene.setPressed(i, true); glass.wake(); } };
    this._up = () => { glass.scene.pressed = -1; glass.wake(); };
    document.addEventListener('pointerdown', this._down, true);
    document.addEventListener('pointerup', this._up, true);

    this.busy = false; this.dirty = false;
    return this.items.length;
  }

  /** Brauzer rejimi uchun to'liq sikl: snapshot() — suratni qaytaradigan async funksiya (canvas/img/ImageBitmap) */
  async cycle(snapshot) {
    this.teardown();
    this.prepare();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const src = await snapshot();
    return this.start(src);
  }

  dispose() {
    this.teardown(); this._mo.disconnect(); removeEventListener('resize', this._resize);
    this.busy = false;
  }
}

/**
 * Brauzer/ixtiyoriy muhit uchun qisqa kirish: sahifa o'zgarsa shisha o'zi qayta quriladi.
 *   attach({ selector: 'button, .btn', snapshot: async () => await html2canvas(document.body) })
 * (Electron uchun `electron.js` dagi enable() ishlatiladi.)
 */
export function attach(opts = {}) {
  const d = new DomGlass(opts);
  if (typeof opts.snapshot === 'function') {
    let timer = 0, running = false;
    const run = async () => { if (running) return; running = true; try { await d.cycle(opts.snapshot); } finally { running = false; } };
    d._onDirty = () => { clearTimeout(timer); timer = setTimeout(() => d.isDirty && run(), 250); };
    run();
  }
  return d;
}

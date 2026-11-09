// Erkin suv: 2D zarrachali suyuqlik (grafikasiz yadro). Zarrachalar bir-birini itaradi (siqilmaslik),
// uzoqroqda tortadi (sirt tarangligi), nisbiy tezligi so'nadi (qovushqoqlik), oyna ishqalanishi sekinlatadi.
// Har bir tomchi o'z UI shakliga (to'rtburchak/kapsula) sekin qaytadi ("shakl xotirasi").

/** Sozlamalar: ruxsat etilgan oraliq (min..max) tashqarisidagi qiymat avtomatik qirqiladi — simulyatsiya portlamaydi. */
export const PARAM_SCHEMA = {
  stiffness:     { min: 4000, max: 60000, def: 22000, step: 500,  label: 'Incompressibility (stiffness)' },
  cohesion:      { min: 0,    max: 8000,  def: 1800,  step: 50,   label: 'Cohesion (surface tension)' },
  viscosity:     { min: 0,    max: 80,    def: 30,    step: 1,    label: 'Viscosity' },
  glassFriction: { min: 0,    max: 25,    def: 6,     step: 0.5,  label: 'Glass friction (heaviness)' },
  shapeMemory:   { min: 0,    max: 100,   def: 30,    step: 1,    label: 'Return to UI shape' },
  grabForce:     { min: 20,   max: 400,   def: 140,   step: 5,    label: 'Grab force' },
  grabSize:      { min: 30,   max: 200,   def: 85,    step: 5,    label: 'Grab size (px)' },
  grabBody:      { min: 0,    max: 1,     def: 0.3,   step: 0.05, label: 'Share of whole-body pull' },
  spacing:       { min: 12,   max: 28,    def: 18,    step: 1,    label: 'Particle spacing (px, smaller = sharper/heavier)' },
  maxSpeed:      { min: 400,  max: 4000,  def: 1800,  step: 100,  label: 'Max speed (px/s)' },
};

/** Tayyor materiallar: defaultlardan farqlarigina. */
export const PRESETS = {
  water:   {},
  honey:   { viscosity: 70, glassFriction: 14, cohesion: 3000, shapeMemory: 22, grabForce: 110 },
  mercury: { viscosity: 8, glassFriction: 3, cohesion: 6000, stiffness: 30000, shapeMemory: 6, grabSize: 60 },
};

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const SUB = 3;           // bir kadrdagi ichki qadamlar
const STEP = 1 / 60;
const HANDLE_OMEGA = 10; // sichqoncha izini og'ir (kritik so'nuvchi) kuzatish

function sdRR(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

export class FluidSim {
  constructor(params = {}) {
    this.params = {};
    for (const k of Object.keys(PARAM_SCHEMA)) this.params[k] = PARAM_SCHEMA[k].def;
    this.descs = [];
    this.groups = [];
    this.n = 0;
    this.acc = 0;
    this.grab = null;
    this.handle = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    this.set(params);
  }

  /** Sozlamalarni o'zgartirish (jonli). Noma'lum kalit rad etiladi, qiymat oraliqqa qirqiladi. */
  set(p) {
    let rebuild = false;
    for (const [k, v] of Object.entries(p)) {
      const s = PARAM_SCHEMA[k];
      if (!s) throw new Error(`liquidglass: unknown setting "${k}"`);
      const nv = clamp(Number(v), s.min, s.max);
      if (!Number.isFinite(nv)) continue;
      if (k === 'spacing' && nv !== this.params.spacing) rebuild = true;
      this.params[k] = nv;
    }
    if (rebuild && this.descs.length) this.#build(true);
    return this;
  }

  preset(name) {
    if (!PRESETS[name]) throw new Error(`liquidglass: unknown preset "${name}"`);
    const all = {};
    for (const k of Object.keys(PARAM_SCHEMA)) all[k] = PARAM_SCHEMA[k].def;
    return this.set({ ...all, ...PRESETS[name] });
  }

  get sigma() { return 0.7 * this.params.spacing; }
  /** Maydonning yuza chegarasi (ichki zichlikning yarmi) */
  get threshold() { const H = this.params.spacing, s = this.sigma; return 0.5 * 2 * Math.PI * s * s / (H * H * 0.866); }

  /** @returns tomchi id'si */
  addDrop({ w = 100, h = 60, radius = 30, x = 0, y = 0, draggable = true, anchored = false } = {}) {
    this.descs.push({ w, h, radius, cx: x, cy: y, draggable, anchored, hx: x, hy: y });
    this.#build(false);
    return this.descs.length - 1;
  }

  #build(keepPositions) {
    if (keepPositions) this.groups.forEach((g, i) => { const c = this.com(i); this.descs[i].cx = c.x; this.descs[i].cy = c.y; });
    const H = this.params.spacing, rowH = H * 0.866;
    const X = [], Y = [], RX = [], RY = [], G = [];
    this.groups = this.descs.map((d, gi) => {
      const start = X.length;
      for (let j = 0, y = -d.h / 2 + H * 0.5; y <= d.h / 2 - H * 0.5 + 0.01; j++, y += rowH) {
        for (let x = -d.w / 2 + H * 0.5 + (j % 2 ? H / 2 : 0); x <= d.w / 2 - H * 0.5 + 0.01; x += H) {
          if (sdRR(x, y, d.w / 2, d.h / 2, d.radius) > -H * 0.45) continue;
          X.push(d.cx + x); Y.push(d.cy + y); RX.push(x); RY.push(y); G.push(gi);
        }
      }
      if (X.length === start) { X.push(d.cx); Y.push(d.cy); RX.push(0); RY.push(0); G.push(gi); }
      // Σr = 0 bo'lishi shart: aks holda shakl xotirasi sof kuch beradi va tomchi o'zicha sirpanib ketadi
      let mx = 0, my = 0;
      for (let i = start; i < X.length; i++) { mx += RX[i]; my += RY[i]; }
      mx /= X.length - start; my /= X.length - start;
      for (let i = start; i < X.length; i++) { RX[i] -= mx; RY[i] -= my; X[i] -= mx; Y[i] -= my; }
      return { start, end: X.length, w: d.w, h: d.h, draggable: d.draggable, anchored: d.anchored, hx: d.hx, hy: d.hy };
    });
    const n = X.length;
    this.n = n;
    this.x = Float32Array.from(X); this.y = Float32Array.from(Y);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.rx = Float32Array.from(RX); this.ry = Float32Array.from(RY); this.g = Int32Array.from(G);
    this.ax = new Float32Array(n); this.ay = new Float32Array(n);
    this.pos = new Float32Array(n * 2);
    this.grab = null;
  }

  com(gi) {
    const g = this.groups[gi];
    let sx = 0, sy = 0;
    for (let i = g.start; i < g.end; i++) { sx += this.x[i]; sy += this.y[i]; }
    const k = g.end - g.start;
    return { x: sx / k, y: sy / k };
  }

  /** Ushlash: eng yaqin zarracha tegishli tomchi id'si, yo'q bo'lsa -1 */
  pointerDown(px, py) {
    const H = this.params.spacing;
    let best = -1, bd = (1.45 * H) ** 2;
    for (let i = 0; i < this.n; i++) {
      if (!this.groups[this.g[i]].draggable) continue;
      const d = (this.x[i] - px) ** 2 + (this.y[i] - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return -1;
    const gi = this.g[best], g = this.groups[gi], c = this.com(gi);
    const rgx = px - c.x, rgy = py - c.y, sg = this.params.grabSize, gb = this.params.grabBody;
    const w = new Float32Array(g.end - g.start);
    for (let i = g.start; i < g.end; i++) {
      const e = Math.exp(-((this.rx[i] - rgx) ** 2 + (this.ry[i] - rgy) ** 2) / (2 * sg * sg));
      w[i - g.start] = gb + (1 - gb) * e;
    }
    this.grab = { gi, rgx, rgy, w };
    Object.assign(this.handle, { x: px, y: py, tx: px, ty: py, vx: 0, vy: 0 });
    return gi;
  }
  pointerMove(px, py) { if (this.grab) { this.handle.tx = px; this.handle.ty = py; } }
  pointerUp() { this.grab = null; }

  #substep(dt) {
    const { x, y, vx, vy, ax, ay, n } = this;
    const p = this.params, H = p.spacing;
    const r2max = (1.8 * H) ** 2;
    ax.fill(0); ay.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[i] - x[j], dy = y[i] - y[j], r2 = dx * dx + dy * dy;
        if (r2 >= r2max || r2 < 1e-6) continue;
        const r = Math.sqrt(r2), nx = dx / r, ny = dy / r;
        let f;
        if (r < H) f = p.stiffness * (1 - r / H);
        else { const t = (r - H) / (0.8 * H); f = -p.cohesion * (1 - Math.abs(2 * t - 1)); }
        const wg = Math.max(0, 1 - r / (1.4 * H)) * p.viscosity;
        const dvx = (vx[j] - vx[i]) * wg, dvy = (vy[j] - vy[i]) * wg;
        ax[i] += f * nx + dvx; ay[i] += f * ny + dvy;
        ax[j] -= f * nx + dvx; ay[j] -= f * ny + dvy;
      }
    }
    this.groups.forEach((g, gi) => {
      const c = this.com(gi);
      const gx = g.anchored ? g.hx : c.x, gy = g.anchored ? g.hy : c.y;
      const ks = p.shapeMemory * (g.anchored ? 5 : 1);
      const grabbed = this.grab && this.grab.gi === gi;
      for (let i = g.start; i < g.end; i++) {
        ax[i] += ks * (gx + this.rx[i] - x[i]);
        ay[i] += ks * (gy + this.ry[i] - y[i]);
        if (grabbed) {
          const w = this.grab.w[i - g.start];
          ax[i] += p.grabForce * w * (this.handle.x + this.rx[i] - this.grab.rgx - x[i]);
          ay[i] += p.grabForce * w * (this.handle.y + this.ry[i] - this.grab.rgy - y[i]);
        }
      }
    });
    const damp = Math.exp(-p.glassFriction * dt), vmax = p.maxSpeed;
    for (let i = 0; i < n; i++) {
      let nvx = (vx[i] + ax[i] * dt) * damp, nvy = (vy[i] + ay[i] * dt) * damp;
      const sp = Math.hypot(nvx, nvy);
      if (sp > vmax) { nvx *= vmax / sp; nvy *= vmax / sp; }
      vx[i] = nvx; vy[i] = nvy;
      x[i] += nvx * dt; y[i] += nvy * dt;
    }
  }

  /** dt — soniya. true: hali qimirlayapti (kadr kerak). */
  step(dt) {
    if (!this.n) return false;
    this.acc += dt;
    let guard = 0;
    const h = this.handle;
    while (this.acc >= STEP && guard++ < 6) {
      const w = HANDLE_OMEGA;
      h.vx += (w * w * (h.tx - h.x) - 2 * w * h.vx) * STEP; h.vy += (w * w * (h.ty - h.y) - 2 * w * h.vy) * STEP;
      h.x += h.vx * STEP; h.y += h.vy * STEP;
      for (let k = 0; k < SUB; k++) this.#substep(STEP / SUB);
      this.acc -= STEP;
    }
    if (guard >= 6) this.acc = 0;
    let maxV = 0;
    for (let i = 0; i < this.n; i++) maxV = Math.max(maxV, Math.abs(this.vx[i]) + Math.abs(this.vy[i]));
    return maxV > 0.6 || !!this.grab;
  }

  /** GPU uchun [x0,y0,x1,y1,...] */
  positions() {
    for (let i = 0; i < this.n; i++) { this.pos[i * 2] = this.x[i]; this.pos[i * 2 + 1] = this.y[i]; }
    return this.pos;
  }
}

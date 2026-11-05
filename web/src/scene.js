// core/src/scene.cpp ning JS nusxasi. Konstantalar va formulalar bir xil bo'lishi SHART:
// tests/golden.test.js C++ yadro natijalari bilan solishtiradi.
export const MAX_SHAPES = 256;

const STEP = 1 / 60;
// Og'ir tomchi: kritik so'nuvchi harakat (tebranish yo'q). C++ yadro bilan bir xil bo'lishi shart.
const HEAD_OMEGA = 10, TAIL_OMEGA = 5.5, PRESS_RATE = 0.12, FOCUS_RATE = 0.10, EPS = 0.04;

export const defaultParams = () => ({
  ior: 1.55, thick: 40, bevel: 26, disp: 0.04, blur: 0.35,
  merge: 48, elastic: 1, spec: 1.1, absorb: 0.2,
});

/** Qattiq oyna sozlamalari: ruxsat etilgan oraliq va yorliq (panel va hujjat shundan quriladi). */
export const GLASS_SCHEMA = {
  ior:     { min: 1.1, max: 2,   step: 0.01,  label: 'Sinish ko\'rsatkichi' },
  thick:   { min: 0,   max: 160, step: 1,     label: 'Qalinlik' },
  bevel:   { min: 8,   max: 90,  step: 1,     label: 'Chet kengligi (px)' },
  disp:    { min: 0,   max: 0.15, step: 0.002, label: 'Dispersiya (rang ajralishi)' },
  blur:    { min: 0,   max: 4,   step: 0.05,  label: 'Blur' },
  merge:   { min: 0,   max: 120, step: 1,     label: 'Qo\'shilish radiusi (px)' },
  elastic: { min: 0,   max: 2.5, step: 0.05,  label: 'Suyuq cho\'zilish (0 = qattiq)' },
  spec:    { min: 0,   max: 2,   step: 0.05,  label: 'Yaltirash' },
  absorb:  { min: 0,   max: 2,   step: 0.05,  label: 'Yutilish (tus)' },
};

export function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

export function smoothstep(e0, e1, x) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export class Scene {
  constructor() {
    this.params = defaultParams();
    this.s = [];
    this.focusIdx = -1;
    this.pressed = -1;
    this.acc = 0;
  }

  add({ w = 100, h = 60, radius = 30, draggable = true, tint = [0, 0, 0, 0] } = {}, pos = { x: 0, y: 0 }) {
    if (this.s.length >= MAX_SHAPES) return -1;
    this.s.push({ w, h, radius, draggable, tint, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, ex: pos.x, ey: pos.y, vx: 0, vy: 0, hvx: 0, hvy: 0, press: 0, focus: 1 });
    if (this.focusIdx < 0 && draggable) this.focusIdx = this.s.length - 1;
    return this.s.length - 1;
  }

  get count() { return this.s.length; }
  get focused() { return this.focusIdx; }
  setTarget(id, p) { this.s[id].tx = p.x; this.s[id].ty = p.y; }
  setPressed(id, down) { this.pressed = down ? id : (this.pressed === id ? -1 : this.pressed); }
  focus(id) { if (id >= 0 && id < this.s.length && this.s[id].draggable) this.focusIdx = id; }
  isFront(id) { return !this.s[id].draggable || id === this.focusIdx; }
  position(id) { return { x: this.s[id].x, y: this.s[id].y }; }
  depth(id) { return this.s[id].focus; }
  scale(id) { return this.#grow(this.s[id]); }

  #grow(s) { return (1 + 0.03 * s.press) * (0.955 + 0.045 * s.focus); }
  // Tomchi dumi uzilmaydi va nusxa qoldirmaydi: bosh va dum nuqtasi orasidagi masofa reach() dan oshmaydi
  #reach(s) { return 0.55 * Math.min(s.w, s.h) + 40; }
  reach(id) { return this.#reach(this.s[id]); }
  tailPosition(id) { return { x: this.s[id].ex, y: this.s[id].ey }; }

  // Bitta jism: harakat o'qi bo'ylab uzayadi, eni torayadi (yuza saqlanadi), orqa tomoni uchiga qarab ingichkalashadi.
  // core/src/scene.cpp drop() va shader sdDrop() bilan aynan bir xil.
  #drop(s, p) {
    const g = this.#grow(s), hw = s.w / 2 * g, hh = s.h / 2 * g, L = this.#reach(s);
    const dx = s.x - s.ex, dy = s.y - s.ey, len = Math.hypot(dx, dy);
    const m = Math.min(len / L, 1);
    const ux = len > 1e-3 ? dx / len : 1, uy = len > 1e-3 ? dy / len : 0;
    const qx = p.x - (s.x - ux * 0.30 * len), qy = p.y - (s.y - uy * 0.30 * len);
    const a = qx * ux + qy * uy, b = -qx * uy + qy * ux;
    const hl = Math.max(Math.abs(ux) * hw + Math.abs(uy) * hh, 1);
    const sS = 1 + 0.45 * m;
    const rear = Math.pow(Math.min(Math.max(-a / (hl * 1.2), 0), 1), 1.6);
    const taper = 1 + 1.8 * m * rear;
    const a2 = a / sS, b2 = b * Math.sqrt(sS) * taper;
    const px = a2 * ux - b2 * uy, py = a2 * uy + b2 * ux;
    const rmax = Math.min(hw, hh), mk = Math.min(m * 1.2, 1), rr = Math.min(s.radius * g, rmax) * (1 - mk) + rmax * mk;
    return sdRoundRect(px, py, hw, hh, rr) / (1 + 0.7 * 1.8 * m * rear);
  }

  #stepOnce() {
    let moving = false;
    const E = this.params.elastic;
    this.s.forEach((s, i) => {
      const wf = this.isFront(i) ? 1 : 0;
      s.focus += (wf - s.focus) * FOCUS_RATE;
      if (Math.abs(wf - s.focus) > 0.002) moving = true;
      const wp = this.pressed === i ? 1 : 0;
      s.press += (wp - s.press) * PRESS_RATE;
      if (Math.abs(wp - s.press) > 0.002) moving = true;

      const heavy = 1 / (0.5 + 0.5 * Math.max(E, 0));
      const wh = HEAD_OMEGA * heavy, wt = TAIL_OMEGA * heavy;
      s.hvx += (wh * wh * (s.tx - s.x) - 2 * wh * s.hvx) * STEP;
      s.hvy += (wh * wh * (s.ty - s.y) - 2 * wh * s.hvy) * STEP;
      s.x += s.hvx * STEP; s.y += s.hvy * STEP;
      if (E <= 0.001) { s.ex = s.x; s.ey = s.y; s.vx = s.vy = 0; }
      else {
        s.vx += (wt * wt * (s.x - s.ex) - 2 * wt * s.vx) * STEP;
        s.vy += (wt * wt * (s.y - s.ey) - 2 * wt * s.vy) * STEP;
        s.ex += s.vx * STEP; s.ey += s.vy * STEP;
        const L = this.#reach(s), dx = s.x - s.ex, dy = s.y - s.ey, dd = Math.hypot(dx, dy);
        if (dd > L) { s.ex = s.x - dx * L / dd; s.ey = s.y - dy * L / dd; }
      }
      const m = Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) + Math.abs(s.x - s.ex) + Math.abs(s.y - s.ey) + Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.hvx) + Math.abs(s.hvy);
      if (m > EPS) moving = true;
    });
    return moving;
  }

  /** dt — soniya. true: hali qimirlayapti (kadr kerak). */
  step(dt) {
    this.acc += dt;
    let moving = false, guard = 0;
    while (this.acc >= STEP && guard++ < 8) { moving = this.#stepOnce() || moving; this.acc -= STEP; }
    if (guard >= 8) this.acc = 0;
    return moving || this.pressed >= 0;
  }

  sdf(p, pass) {
    let d = 1e5;
    this.s.forEach((s, i) => {
      if ((pass === 'front') !== this.isFront(i)) return;
      d = smin(d, this.#drop(s, p), Math.max(this.params.merge, 0.5));
    });
    return d;
  }

  hit(p) {
    for (let i = this.s.length - 1; i >= 0; i--) {
      const s = this.s[i];
      if (!s.draggable) continue;
      const g = this.#grow(s);
      if (sdRoundRect(p.x - s.x, p.y - s.y, s.w / 2 * g, s.h / 2 * g, s.radius * g) < 0) return i;
    }
    return -1;
  }

  /**
   * GPU uchun bir o'tishning ma'lumoti. Shakllar RGBA32F teksturaga yoziladi (kenglik 4, balandlik = count):
   * shakl i: [0] rect(4) [1] tail(4) [2] rad, k, act, 0 [3] tint(4) -> data[i*16 + piksel*4 + komponent]
   */
  pack(pass, dpr) {
    const n = this.s.length;
    const u = { count: n, data: new Float32Array(Math.max(n, 1) * 16), merge: this.params.merge * dpr };
    this.s.forEach((s, i) => {
      const g = this.#grow(s);
      const o = i * 16;
      u.data.set([s.x * dpr, s.y * dpr, s.w / 2 * g * dpr, s.h / 2 * g * dpr], o);
      u.data.set([s.ex * dpr, s.ey * dpr, s.w / 2 * g * dpr, s.h / 2 * g * dpr], o + 4);
      u.data[o + 8] = s.radius * g * dpr;
      u.data[o + 9] = this.#reach(s) * dpr;
      u.data[o + 10] = (pass === 'front') === this.isFront(i) ? 1 : 0;
      u.data[o + 11] = Math.hypot(s.x - s.ex, s.y - s.ey) * dpr;   // 0 = qo'zg'almas: shader uzoqda bo'lsa o'tkazib yuboradi
      u.data.set(s.tint, o + 12);
    });
    Object.assign(u, pass === 'back'
      ? { flip: 0, shadowK: 0.30, shadowOff: 7, specMul: 0.5, thickMul: 0.75, extraLod: 0 }
      : { flip: 1, shadowK: 0.55, shadowOff: 26, specMul: 1, thickMul: 1, extraLod: 0.7 });
    return u;
  }
}

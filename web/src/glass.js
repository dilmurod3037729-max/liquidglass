import { Scene } from './scene.js';
import { Renderer } from './renderer.js';

/**
 * High-level API: canvas + glass shapes + dragging + drawing a frame only when needed.
 *
 *   const glass = new LiquidGlass(canvas, { source: sceneCanvasOrImageOrVideo });
 *   glass.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
 *   glass.params.merge = 60;
 *
 * source: the scene the glass refracts (canvas/img/video/ImageBitmap). When it changes: glass.setSource(...) or glass.invalidate().
 * For video or a constantly changing source use { live: true }.
 */
export class LiquidGlass {
  constructor(canvas, { source = null, live = false, maxDpr = 1.5, elastic = 0 } = {}) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.scene.params.elastic = elastic;   // 0 = clean rigid glass; > 0 = liquid stretching
    this.renderer = new Renderer(canvas);
    this.live = live;
    this.maxDpr = maxDpr;
    this.light = { x: 0, y: 0 };
    this.labels = new Map();
    this.source = null;
    this.queued = false;
    this.idle = 0;
    this.last = 0;
    this.drag = null;
    this.drawn = 0;
    this._bind();
    this.resize();
    if (source) this.setSource(source);
  }

  get params() { return this.scene.params; }

  add(desc, pos, labelEl) {
    const id = this.scene.add(desc, pos);
    if (id >= 0 && labelEl) {
      labelEl.style.position = 'fixed';
      labelEl.style.left = '0'; labelEl.style.top = '0';
      labelEl.style.width = desc.w + 'px'; labelEl.style.height = desc.h + 'px';
      labelEl.style.pointerEvents = 'none'; labelEl.style.willChange = 'transform';
      this.labels.set(id, labelEl);
    }
    this.wake();
    return id;
  }

  setSource(src) {
    this.source = src;
    this.renderer.setSource(src, !this.live);
    this.wake();
  }

  invalidate() { if (this.source) this.renderer.setSource(this.source, !this.live); this.wake(); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.dpr = dpr;
    this.renderer.resize(Math.round(innerWidth * dpr), Math.round(innerHeight * dpr));
    this.wake();
  }

  wake() {
    this.idle = 0;
    if (!this.queued) { this.queued = true; requestAnimationFrame(this._frame); }
  }

  dispose() {
    this._off.forEach(f => f());
    this.renderer.dispose();
  }

  _frame = (t) => {
    this.queued = false;
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : 1 / 60;
    this.last = t;
    const moving = this.scene.step(dt);
    if (this.live && this.source) this.renderer.setSource(this.source, false);
    this.renderer.render(this.scene, { dpr: this.dpr, light: this.light });
    this.drawn++;
    this.labels.forEach((el, id) => {
      const p = this.scene.position(id), s = this.scene.scale(id);
      const sh = this.scene.s[id];
      const mx = (p.x + sh.ex) / 2, my = (p.y + sh.ey) / 2;
      el.style.transform = `translate(${mx - sh.w / 2}px,${my - sh.h / 2}px) scale(${s})`;
      el.style.opacity = (0.5 + 0.5 * this.scene.depth(id)).toFixed(3);
    });
    if (moving || this.drag || this.live) this.idle = 0; else this.idle++;
    if (this.idle < 3) { this.queued = true; requestAnimationFrame(this._frame); } else this.last = 0;
  };

  _bind() {
    const c = this.canvas;
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); return () => t.removeEventListener(e, f, o); };
    this._off = [
      on(window, 'resize', () => this.resize()),
      on(c, 'pointerdown', (e) => {
        const id = this.scene.hit({ x: e.clientX, y: e.clientY });
        if (id < 0) return;
        const p = this.scene.position(id);
        this.scene.focus(id);
        this.scene.setPressed(id, true);
        this.drag = { id, dx: e.clientX - p.x, dy: e.clientY - p.y };
        c.setPointerCapture(e.pointerId);
        this.wake();
      }),
      on(c, 'pointermove', (e) => {
        this.light.x = (e.clientX / innerWidth - 0.5) * 2;
        this.light.y = (e.clientY / innerHeight - 0.5) * 2;
        if (this.drag) this.scene.setTarget(this.drag.id, { x: e.clientX - this.drag.dx, y: e.clientY - this.drag.dy });
        this.wake();
      }),
      on(c, 'pointerup', () => this._release()),
      on(c, 'pointercancel', () => this._release()),
    ];
  }

  _release() {
    if (this.drag) this.scene.setPressed(this.drag.id, false);
    this.drag = null;
    this.wake();
  }
}

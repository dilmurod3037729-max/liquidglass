import { VERTEX, FRAGMENT } from './shader.js';
import { FluidSim } from './fluid.js';

const SPLAT_VS = `#version 300 es
in vec2 aPos; uniform vec2 uRes; uniform float uSize;
void main(){ gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0); gl_PointSize = uSize; }`;
const SPLAT_FS = `#version 300 es
precision highp float; uniform float uSigma; uniform float uSize; out vec4 o;
void main(){ vec2 c = (gl_PointCoord - 0.5) * uSize; o = vec4(exp(-dot(c, c) / (2.0 * uSigma * uSigma)), 0.0, 0.0, 1.0); }`;

// Shisha shaderidagi geometrik maydon (sdDrop/sdAll) o'rniga zarrachalar zichligi maydonidan hosil bo'lgan masofa
function glassSource() {
  const a = FRAGMENT.indexOf('// Bitta tomchi: BITTA jism'), b = FRAGMENT.indexOf('vec3 bgAt(');
  if (a < 0 || b < 0) throw new Error('liquidglass: shader markerlari topilmadi (sync-shader ishga tushirilganmi?)');
  const field = `float rho(vec2 p){ return texture(uField, vec2(p.x / uRes.x, 1.0 - p.y / uRes.y)).r; }
float sdAll(vec2 p){
  float e = 2.0;
  float r0 = rho(p);
  vec2 g = vec2(rho(p + vec2(e, 0.0)) - rho(p - vec2(e, 0.0)), rho(p + vec2(0.0, e)) - rho(p - vec2(0.0, e))) / (2.0 * e);
  return clamp((uT - r0) / max(length(g), 1e-3), -80.0, 80.0);
}
`;
  return (FRAGMENT.slice(0, a) + field + FRAGMENT.slice(b)).replace('uniform float uAct[N];', 'uniform float uAct[N];\nuniform sampler2D uField;\nuniform float uT;');
}

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('liquidglass shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('liquidglass link: ' + gl.getProgramInfoLog(p));
  return p;
}
const texParams = (gl, t, mip) => {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
};

export const defaultGlass = () => ({ ior: 1.55, thick: 70, bevel: 44, disp: 0.05, blur: 0.35, spec: 1.1, absorb: 0.5 });

/**
 * Erkin suv + suyuq shisha. Tomchilar zarrachalardan iborat; shisha shu zarrachalar hosil qilgan yuzani sindiradi.
 *
 *   const water = new LiquidWater(canvas, { source: sceneCanvas, preset: 'water' });
 *   water.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
 *   water.fluid.set({ viscosity: 50 });   // jonli sozlash (PARAM_SCHEMA)
 *   water.glass.thick = 90;               // shisha ko'rinishi
 */
export class LiquidWater {
  constructor(canvas, { source = null, preset = 'water', fluid = {}, glass = {} } = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 qo\'llab-quvvatlanmaydi');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('Float render qo\'llab-quvvatlanmaydi');
    this.gl = gl; this.canvas = canvas;
    this.fluid = new FluidSim().preset(preset).set(fluid);
    this.glass = { ...defaultGlass(), ...glass };
    this.light = { x: 0, y: 0 };
    this.labels = new Map();
    this.source = null;
    this.queued = false; this.idle = 0; this.last = 0; this.drawn = 0;
    this.splat = program(gl, SPLAT_VS, SPLAT_FS);
    this.prog = program(gl, VERTEX, glassSource());
    this.sceneTex = gl.createTexture(); this.fieldTex = gl.createTexture(); this.fbo = gl.createFramebuffer();
    this.posBuf = gl.createBuffer();
    this.resize();
    this._off = this._bind();
    if (source) this.setSource(source);
  }

  add(desc, pos, labelEl) {
    const id = this.fluid.addDrop({ ...desc, x: pos.x, y: pos.y });
    if (labelEl) {
      Object.assign(labelEl.style, { position: 'fixed', left: '0', top: '0', width: desc.w + 'px', height: desc.h + 'px', pointerEvents: 'none', willChange: 'transform' });
      this.labels.set(id, labelEl);
    }
    this.wake();
    return id;
  }

  setSource(src) {
    const { gl } = this;
    this.source = src;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    texParams(gl, this.sceneTex, true);
    this.wake();
  }

  resize() {
    const { gl, canvas } = this;
    this.W = canvas.width = innerWidth; this.H = canvas.height = innerHeight;
    this.fw = Math.ceil(this.W / 2); this.fh = Math.ceil(this.H / 2);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.fw, this.fh, 0, gl.RGBA, gl.HALF_FLOAT, null);
    texParams(gl, this.fieldTex, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('liquidglass: maydon FBO\'si to\'liq emas');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.wake();
  }

  wake() { this.idle = 0; if (!this.queued) { this.queued = true; requestAnimationFrame(this._frame); } }

  dispose() { this._off.forEach(f => f()); const { gl } = this; gl.getExtension('WEBGL_lose_context')?.loseContext(); }

  _draw() {
    const { gl, W, H, fw, fh } = this, f = this.fluid, G = this.glass;
    const sigma = f.sigma;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, fw, fh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.splat);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferData(gl.ARRAY_BUFFER, f.positions(), gl.DYNAMIC_DRAW);
    const loc = gl.getAttribLocation(this.splat, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(this.splat, 'uRes'), W, H);
    gl.uniform1f(gl.getUniformLocation(this.splat, 'uSize'), Math.ceil(6 * sigma / 2));
    gl.uniform1f(gl.getUniformLocation(this.splat, 'uSigma'), sigma / 2);
    gl.drawArrays(gl.POINTS, 0, f.n);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    const u = (n) => gl.getUniformLocation(this.prog, n);
    gl.uniform1i(u('uBg'), 0); gl.uniform1i(u('uField'), 1); gl.uniform1f(u('uT'), f.threshold);
    gl.uniform2f(u('uRes'), W, H); gl.uniform1f(u('uDpr'), 1); gl.uniform2f(u('uLight'), this.light.x, this.light.y);
    gl.uniform1f(u('uIOR'), G.ior); gl.uniform1f(u('uThick'), G.thick); gl.uniform1f(u('uBevel'), G.bevel); gl.uniform1f(u('uDisp'), G.disp);
    gl.uniform1f(u('uBlur'), G.blur); gl.uniform1f(u('uSpec'), G.spec); gl.uniform1f(u('uAbs'), G.absorb);
    gl.uniform1f(u('uFlip'), 0); gl.uniform1f(u('uShadowK'), 0.5); gl.uniform1f(u('uShadowOff'), 18);
    gl.uniform1f(u('uSpecMul'), 1); gl.uniform1f(u('uThickMul'), 1); gl.uniform1f(u('uExtraLod'), 0.3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  _frame = (t) => {
    this.queued = false;
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.05) : 1 / 60;
    this.last = t;
    const moving = this.fluid.step(dt);
    this._draw(); this.drawn++;
    this.labels.forEach((el, id) => { const c = this.fluid.com(id), g = this.fluid.groups[id]; el.style.transform = `translate(${c.x - g.w / 2}px,${c.y - g.h / 2}px)`; });
    this.idle = moving ? 0 : this.idle + 1;
    if (this.idle < 3) { this.queued = true; requestAnimationFrame(this._frame); } else this.last = 0;
  };

  _bind() {
    const c = this.canvas, f = this.fluid;
    const on = (t, e, fn) => { t.addEventListener(e, fn); return () => t.removeEventListener(e, fn); };
    const up = () => { f.pointerUp(); this.wake(); };
    return [
      on(c, 'pointerdown', (e) => { if (f.pointerDown(e.clientX, e.clientY) >= 0) { c.setPointerCapture(e.pointerId); this.wake(); } }),
      on(c, 'pointermove', (e) => {
        this.light.x = (e.clientX / this.W - 0.5) * 2; this.light.y = (e.clientY / this.H - 0.5) * 2;
        f.pointerMove(e.clientX, e.clientY); this.wake();
      }),
      on(c, 'pointerup', up), on(c, 'pointercancel', up),
      on(window, 'resize', () => this.resize()),
    ];
  }
}

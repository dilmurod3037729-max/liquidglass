import { VERTEX, FRAGMENT } from './shader.js';

const UNIFORMS = ['uBg', 'uRes', 'uRect', 'uTail', 'uRad', 'uK', 'uAct', 'uDpr', 'uMerge', 'uFlip', 'uShadowK', 'uShadowOff',
  'uSpecMul', 'uThickMul', 'uExtraLod', 'uLight', 'uIOR', 'uThick', 'uBevel', 'uDisp', 'uBlur', 'uSpec', 'uAbs'];

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('liquidglass shader: ' + gl.getShaderInfoLog(s));
  return s;
}

function setupTexture(gl, tex) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** WebGL2 chizuvchi: sahna teksturasi + ikki o'tish (orqa qatlam -> FBO, oldingi qatlam ekranga). */
export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 qo\'llab-quvvatlanmaydi');
    this.gl = gl;
    this.canvas = canvas;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('liquidglass link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.loc = Object.fromEntries(UNIFORMS.map(n => [n, gl.getUniformLocation(prog, n)]));
    this.sceneTex = gl.createTexture();
    this.fbTex = gl.createTexture();
    this.fbo = gl.createFramebuffer();
    setupTexture(gl, this.sceneTex);
    setupTexture(gl, this.fbTex);
    this.hasSource = false;
  }

  resize(width, height) {
    const { gl, canvas } = this;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Sahna manbasini yuklaydi: canvas, img, video yoki ImageBitmap. `mips=false` — jonli video uchun arzonroq. */
  setSource(src, mips = true) {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    this.hasSource = true;
  }

  render(scene, { dpr = 1, light = { x: 0, y: 0 } } = {}) {
    const { gl, loc, canvas } = this;
    const P = scene.params;
    gl.uniform1i(loc.uBg, 0);
    gl.uniform2f(loc.uRes, canvas.width, canvas.height);
    gl.uniform1f(loc.uDpr, dpr);
    gl.uniform2f(loc.uLight, light.x, light.y);
    gl.uniform1f(loc.uIOR, P.ior); gl.uniform1f(loc.uThick, P.thick); gl.uniform1f(loc.uBevel, P.bevel);
    gl.uniform1f(loc.uDisp, P.disp); gl.uniform1f(loc.uBlur, P.blur); gl.uniform1f(loc.uSpec, P.spec); gl.uniform1f(loc.uAbs, P.absorb);

    const pass = (u) => {
      gl.uniform4fv(loc.uRect, u.rect); gl.uniform4fv(loc.uTail, u.tail);
      gl.uniform1fv(loc.uRad, u.rad); gl.uniform1fv(loc.uK, u.k); gl.uniform1fv(loc.uAct, u.act);
      gl.uniform1f(loc.uMerge, u.merge); gl.uniform1f(loc.uFlip, u.flip);
      gl.uniform1f(loc.uShadowK, u.shadowK); gl.uniform1f(loc.uShadowOff, u.shadowOff);
      gl.uniform1f(loc.uSpecMul, u.specMul); gl.uniform1f(loc.uThickMul, u.thickMul); gl.uniform1f(loc.uExtraLod, u.extraLod);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    pass(scene.pack('back', dpr));
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    pass(scene.pack('front', dpr));
  }

  dispose() {
    const { gl } = this;
    gl.deleteTexture(this.sceneTex); gl.deleteTexture(this.fbTex); gl.deleteFramebuffer(this.fbo);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

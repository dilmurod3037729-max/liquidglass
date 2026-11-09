import { VERTEX, FRAGMENT } from './shader.js';
import { buildTiles } from './tiles.js';

const UNIFORMS = ['uBg', 'uShapes', 'uCount', 'uTiles', 'uTileSize', 'uGridW', 'uGridH', 'uRes', 'uDpr', 'uMerge', 'uFlip', 'uShadowK', 'uShadowOff',
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
    if (!gl) throw new Error('WebGL2 is not supported');
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
    this.tilesTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tilesTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shapesTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shapesTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
      // shakllar ma'lumot teksturasida (RGBA32F, kenglik 4, balandlik = shakllar soni), 2-birlikda
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.shapesTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, Math.max(u.count, 1), 0, gl.RGBA, gl.FLOAT, u.data);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(loc.uShapes, 2); gl.uniform1i(loc.uCount, u.count);
      // yaqin shakllar ro'yxati (bo'laklar bo'yicha). Shakl kam bo'lsa foydasi yo'q: bo'laklarsiz (uTileSize = 0)
      if (u.count >= 12) {
        const t = buildTiles(u, canvas.width, canvas.height, dpr);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.tilesTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, t.cap + 1, t.gw * t.gh, 0, gl.RED, gl.FLOAT, t.data);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(loc.uTiles, 3); gl.uniform1f(loc.uTileSize, t.tile); gl.uniform1i(loc.uGridW, t.gw); gl.uniform1i(loc.uGridH, t.gh);
      } else {
        gl.uniform1i(loc.uTiles, 3); gl.uniform1f(loc.uTileSize, 0); gl.uniform1i(loc.uGridW, 1); gl.uniform1i(loc.uGridH, 1);
      }
      gl.uniform1f(loc.uMerge, u.merge); gl.uniform1f(loc.uFlip, u.flip);
      gl.uniform1f(loc.uShadowK, u.shadowK); gl.uniform1f(loc.uShadowOff, u.shadowOff);
      gl.uniform1f(loc.uSpecMul, u.specMul); gl.uniform1f(loc.uThickMul, u.thickMul); gl.uniform1f(loc.uExtraLod, u.extraLod);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const back = scene.pack('back', dpr);
    const front = scene.pack('front', dpr);
    if (back.count === 0) {
      // Orqada shisha yo'q: FBO sahna nusxasi bo'lardi. O'tish va mipmap'ni o'tkazib, sahnaning o'zini sindiramiz.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      front.flip = 0;
      pass(front);
      return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    pass(back);
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    pass(front);
  }

  dispose() {
    const { gl } = this;
    gl.deleteTexture(this.sceneTex); gl.deleteTexture(this.fbTex); gl.deleteTexture(this.shapesTex); gl.deleteTexture(this.tilesTex); gl.deleteFramebuffer(this.fbo);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

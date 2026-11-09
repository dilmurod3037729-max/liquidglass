(function(){
const __lg = {};
{
// AVTOMATIK HOSIL QILINGAN: scripts/sync-shader.mjs. Qo'lda tahrirlamang — core/shaders/liquidglass.frag ni o'zgartiring.
const VERTEX = "#version 300 es\nvoid main(){\n  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}";
const FRAGMENT = "#version 300 es\nprecision highp float;\nuniform sampler2D uBg;\n// Shakllar ma'lumot teksturasida (RGBA32F, kenglik 4, balandlik = shakllar soni). Har shakl 4 ta piksel:\n//   [0] rect: markaz.xy, yarim o'lcham.xy   [1] tail: kechikkan dum markazi.xy + MATERIAL: z = chet kengligi ko'paytiruvchisi, w = qalinlik ko'paytiruvchisi\n//   [2] meta: burchak radiusi, maks. cho'zilish, faol(1/0), joriy cho'zilish (px)   [3] tint: rgb + kuch\nuniform sampler2D uShapes;\nuniform int   uCount;\n// Bo'laklar (tile): ekran uTileSize pikselli bo'laklarga bo'lingan. uTiles (R32F, kenglik cap+1, balandlik = bo'laklar soni):\n// [0] = shu bo'lakka yaqin shakllar soni (-1 = ro'yxat to'lib ketdi, hammasi aylanib chiqiladi), [1..] = shakl indekslari.\nuniform sampler2D uTiles;\nuniform float uTileSize;   // 0 = bo'laklarsiz (hamma shakl)\nuniform int   uGridW, uGridH;\nuniform vec2  uRes;\nuniform float uTransparent;   // 1 = shaffof qatlam (ilova ustida): faqat shisha va soya, premultiplied alpha; 0 = butun sahna\nuniform float uDpr, uMerge, uFlip, uShadowK, uShadowOff, uSpecMul, uThickMul, uExtraLod;\nuniform vec2  uLight;\nuniform float uIOR, uThick, uBevel, uDisp, uBlur, uSpec, uAbs;\nout vec4 outColor;\n\nvec4 shp(int i, int k){ return texelFetch(uShapes, ivec2(k, i), 0); }\n\nfloat sdRR(vec2 p, vec2 b, float r){\n  vec2 q = abs(p) - b + r;\n  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;\n}\nfloat smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }\n\n// Eng yaqin shaklning kichik yarim o'lchami (sdAll yozadi): chet kengligi shundan oshmasligi uchun\nfloat gMin = 1e5;\nvec4  gTint = vec4(0.0);\nvec2  gMat = vec2(1.0);   // eng yaqin shaklning materiali: (chet ko'paytiruvchisi, qalinlik ko'paytiruvchisi)\n// Bitta tomchi: BITTA jism. Bosh va dum nuqtasi orasidagi farq (cho'zilish) jismni harakat o'qi bo'ylab uzaytiradi,\n// yuzani saqlash uchun enini toraytiradi va orqa tomonini uchiga qarab ingichkalashtiradi (tomchi shakli).\n// uK[i] = maksimal cho'zilish (piksel). Nusxa/ikkinchi jism YO'Q.\nfloat sdDrop(vec2 p, int i){\n  vec4 r = shp(i, 0);\n  vec4 mt = shp(i, 2);\n  vec2 d = r.xy - shp(i, 1).xy;\n  float len = length(d);\n  float m = clamp(len / max(mt.y, 1.0), 0.0, 1.0);\n  vec2 u = len > 1e-3 ? d / len : vec2(1.0, 0.0);\n  vec2 q = p - (r.xy - u * (0.30 * len));\n  float a = dot(q, u), b = dot(q, vec2(-u.y, u.x));\n  float hl = max(abs(u.x) * r.z + abs(u.y) * r.w, 1.0);\n  float sS = 1.0 + 0.45 * m;\n  float rear = pow(clamp(-a / (hl * 1.2), 0.0, 1.0), 1.6);\n  float taper = 1.0 + 1.8 * m * rear;\n  float a2 = a / sS, b2 = b * sqrt(sS) * taper;\n  vec2 p2 = vec2(a2 * u.x - b2 * u.y, a2 * u.y + b2 * u.x);\n  float rr = mix(min(mt.x, min(r.z, r.w)), min(r.z, r.w), clamp(m * 1.2, 0.0, 1.0));   // cho'zilganda to'liq yumaloq (kapsula)\n  return sdRR(p2, r.zw, rr) / (1.0 + 0.7 * 1.8 * m * rear);\n}\n// Qatlamdagi barcha tomchilarning umumiy maydoni: yaqinlashganda suyuqdek qo'shiladi.\nfloat sdAll(vec2 p){\n  float d = 1e5, bm = 1e5;\n  vec4 bt = vec4(0.0);\n  vec2 bmat = vec2(1.0);\n  bool all = uTileSize < 1.0;\n  int tid = 0, n = uCount;\n  if (!all) {\n    vec2 tc = clamp(floor(p / uTileSize), vec2(0.0), vec2(float(uGridW - 1), float(uGridH - 1)));\n    tid = int(tc.y) * uGridW + int(tc.x);\n    float cnt = texelFetch(uTiles, ivec2(0, tid), 0).r;\n    if (cnt < -0.5) all = true; else n = int(cnt + 0.5);\n  }\n  for (int k = 0; k < n; k++){\n    int i = all ? k : int(texelFetch(uTiles, ivec2(k + 1, tid), 0).r + 0.5);\n    vec4 mt = shp(i, 2);\n    if (mt.z < 0.5) continue;\n    vec4 r = shp(i, 0);\n    // Uzoqdagi QO'ZG'ALMAS shaklni hisoblamaymiz: silliq birlashma radiusidan tashqarida u natijaga ta'sir qilmaydi\n    if (mt.w < 0.5) {   // qo'zg'almas (cho'zilmagan)\n      float bd = length(max(abs(p - r.xy) - r.zw, 0.0));\n      if (bd > d + max(uMerge, 0.5)) continue;\n    }\n    float di = sdDrop(p, i);\n    if (di < d) { bm = min(r.z, r.w); bt = shp(i, 3); bmat = shp(i, 1).zw; }\n    d = smin(d, di, max(uMerge, 0.5));\n  }\n  gMin = bm;\n  gTint = bt;\n  gMat = bmat;\n  return d;\n}\nvec3 bgAt(vec2 px, float lod){\n  vec2 uv = clamp(px / uRes, vec2(0.001), vec2(0.999));\n  if (uFlip > 0.5) uv.y = 1.0 - uv.y;\n  return textureLod(uBg, uv, lod).rgb;\n}\nvec2 refractOffset(float ior, vec3 Nn, float t, float dist, out float tir){\n  vec3 R = refract(vec3(0.0, 0.0, -1.0), Nn, 1.0 / ior);\n  vec2 inner = R.xy / max(-R.z, 0.08) * t;\n  float s = ior * length(R.xy);\n  tir = step(0.985, s);\n  s = min(s, 0.985);\n  vec3 O = vec3(R.xy * ior, -sqrt(1.0 - s * s));\n  vec2 outer = O.xy / (-O.z) * dist;\n  return inner + outer;\n}\n\nvoid main(){\n  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);\n  vec3 col = bgAt(px, 0.0);\n  // Fon yorug'ligi (0 = qorong'i, 1 = oq): shisha qorong'i va yorug' fonda turlicha ko'rinishi uchun\n  float lum = clamp(dot(bgAt(px, 6.0), vec3(0.299, 0.587, 0.114)), 0.0, 1.0);\n  float d = sdAll(px);\n  float halfMin = gMin;\n  vec4 tint = gTint;\n  vec2 gm = gMat;\n  // Material: bevel < 0 => \"tiniq ichki\" shisha (qirrasi xira va sinadi, markazi tiniq: ichidagi kontent o'qiladi)\n  bool clearIn = gm.x < 0.0;\n  gm.x = abs(gm.x);\n  float shA = 0.0, glassM = 0.0;\n  vec3 glassC = vec3(0.0);\n\n  // Soya va kaustika: sahnaning o'ziga (tagidagi tugma/matnga ham) tushadi. Uzoqda hisoblanmaydi.\n  if (d > 0.0 && d < (90.0 + uShadowOff * 2.0) * uDpr){\n    float ds = sdAll(px - vec2(0.0, uShadowOff * uDpr));\n    float sh = exp(-max(ds, 0.0) / ((10.0 + uShadowOff * 0.5) * uDpr)) * uShadowK * mix(1.0, 0.25, lum);\n    shA = sh;\n    float dc = sdAll(px - vec2(0.0, uShadowOff * 1.9 * uDpr)) + 7.0 * uDpr;\n    float caus = exp(-abs(dc) / (26.0 * uDpr)) * 0.2;\n    col *= 1.0 - sh;\n    col += vec3(0.38, 0.72, 1.0) * caus * (0.35 + sh) * (1.0 - 0.7 * lum);\n  }\n\n  if (d < 1.5 * uDpr){\n    // Chet kengligi jismning yarmidan oshmaydi: markaz DOIM tiniq (linza emas, oyna) qoladi\n    float zR = min(uBevel * gm.x * uDpr, halfMin * 0.5);\n    float depth = max(-d, 0.0);\n    float e = 1.0;\n    vec2 g = vec2(sdAll(px + vec2(e, 0.0)) - sdAll(px - vec2(e, 0.0)),\n                  sdAll(px + vec2(0.0, e)) - sdAll(px - vec2(0.0, e)));\n    g = normalize(g + 1e-6);\n\n    float dd = clamp(depth, 0.0, zR);\n    float h = sqrt(max(dd * (2.0 * zR - dd), 0.0));\n    float dh = dd >= zR ? 0.0 : min((zR - dd) / sqrt(max(dd * (2.0 * zR - dd), 1.0)), 9.0);\n    vec3 Nn = normalize(vec3(g * dh, 1.0));\n\n    float th = uThick * abs(gm.y) * uThickMul;\n    float t = (0.25 * zR + h) * th / max(zR, 1.0) * uDpr;\n    float dist = 1.15 * th * uDpr;\n\n    float tirR, tirG, tirB;\n    vec2 oR = refractOffset(uIOR - uDisp, Nn, t, dist, tirR);\n    vec2 oG = refractOffset(uIOR,         Nn, t, dist, tirG);\n    vec2 oB = refractOffset(uIOR + uDisp, Nn, t, dist, tirB);\n\n    float hz = h / max(zR, 1.0);\n    float lod = clearIn ? uExtraLod * 0.3 + (1.0 - hz) * uBlur * 0.9 : uBlur + uExtraLod + hz * uBlur * 0.6;\n    float k = (0.6 + lod) * uDpr;\n    vec2 pr = px + oR, pg = px + oG, pb = px + oB;\n    vec3 tr = vec3(\n      (bgAt(pr, lod).r * 2.0 + bgAt(pr + vec2(k, 0.0), lod).r + bgAt(pr - vec2(k, 0.0), lod).r + bgAt(pr + vec2(0.0, k), lod).r + bgAt(pr - vec2(0.0, k), lod).r) / 6.0,\n      (bgAt(pg, lod).g * 2.0 + bgAt(pg + vec2(k, 0.0), lod).g + bgAt(pg - vec2(k, 0.0), lod).g + bgAt(pg + vec2(0.0, k), lod).g + bgAt(pg - vec2(0.0, k), lod).g) / 6.0,\n      (bgAt(pb, lod).b * 2.0 + bgAt(pb + vec2(k, 0.0), lod).b + bgAt(pb - vec2(k, 0.0), lod).b + bgAt(pb + vec2(0.0, k), lod).b + bgAt(pb - vec2(0.0, k), lod).b) / 6.0);\n\n    float path = t / max(abs(refract(vec3(0.0, 0.0, -1.0), Nn, 1.0 / uIOR).z), 0.1) / uDpr;\n    tr *= exp(-uAbs * path * vec3(0.0042, 0.0036, 0.0030) * (1.0 - 0.7 * lum));   // deyarli neytral: sovuq ko'k tus yo'q\n    tr = mix(tr, tr * vec3(0.98, 0.99, 1.02), 0.6);\n    tr *= mix(1.0, 0.93, lum);\n    // Rangli shisha: rang qo'shiladi, lekin orqadagi tafsilot (yorug'lik) saqlanadi\n    tr = mix(tr, tint.rgb * (0.5 + 0.5 * dot(tr, vec3(0.3333))), tint.a);\n\n    float cosT = clamp(Nn.z, 0.0, 1.0);\n    float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);\n    vec3 env = mix(vec3(0.05, 0.08, 0.14), vec3(0.78, 0.9, 1.0), clamp(Nn.y * -0.5 + 0.5, 0.0, 1.0));\n    env += vec3(0.10, 0.06, 0.16) * clamp(Nn.x * 0.5 + 0.5, 0.0, 1.0);\n    vec3 refl = env * F * 1.55 * mix(1.0, 0.4, lum);\n\n    float tir = max(max(tirR, tirG), tirB);\n    vec3 tirGlow = vec3(0.75, 0.9, 1.0) * pow(1.0 - cosT, 3.0) * 0.6 * (0.4 + 0.6 * tir) * mix(1.0, 0.35, lum);\n\n    // Yorug'lik kursorga ergashadi (uLight: -1..1)\n    vec3 V = vec3(0.0, 0.0, 1.0);\n    vec3 L1 = normalize(vec3(-0.55 + uLight.x * 0.5, -0.65 + uLight.y * 0.5, 0.75));\n    vec3 L2 = normalize(vec3( 0.60 - uLight.x * 0.3,  0.55 - uLight.y * 0.3, 0.55));\n    float s1 = pow(max(dot(Nn, normalize(L1 + V)), 0.0), 160.0);\n    float s2 = pow(max(dot(Nn, normalize(L2 + V)), 0.0), 110.0) * 0.5;\n    vec3 spec = vec3(1.0) * (s1 + s2) * uSpec * uSpecMul * 1.3;\n\n    vec3 glass = tr * (1.0 - F * 0.9) + refl + tirGlow + spec;\n    // Himoya: NaN/cheksiz qiymat yoki [0,1] dan chiqish (premultiplied alpha bilan qora/oq chiziq bo'ladi) shisha rangini buzmasin\n    if (any(isnan(glass)) || any(isinf(glass))) glass = col;\n    glass = clamp(glass, 0.0, 1.0);\n\n    float edge = smoothstep(2.0 * uDpr, 0.0, depth) * smoothstep(-1.5 * uDpr, 0.0, -d);\n    float topBias = clamp(dot(g, vec2(-0.6, -0.8)) * 0.5 + 0.5, 0.0, 1.0);\n    glass += vec3(max(1.0 - 1.6 * lum, -0.28)) * edge * (0.2 + 0.6 * topBias) * 0.8;\n    glass = clamp(glass, 0.0, 1.0);   // yorug' fonda chet oq emas, qoraroq chiziq\n\n    float m = 1.0 - smoothstep(-0.8 * uDpr, 1.2 * uDpr, d);\n    // \"Ramka\" rejimi (qalinlik ko'paytiruvchisi < 0): panel/jadval markazi shaffof qoladi, faqat qirra shisha bo'ladi\n    float ringA = gm.y < 0.0 ? 1.0 - smoothstep(zR * 0.55, zR * 1.2, depth) : 1.0;\n    m *= ringA;\n    glassC = glass;\n    glassM = m;\n    col = mix(col, glass, m);\n  }\n  if (uTransparent > 0.5) {\n    // Shaffof qatlam: shisha va soya chiziladi, qolgan joyda ilovaning o'zi jonli ko'rinadi (premultiplied alpha)\n    float a = glassM + shA * (1.0 - glassM);\n    outColor = vec4(glassC * glassM, a);\n  } else {\n    outColor = vec4(col, 1.0);\n  }\n}\n";

__lg.VERTEX = VERTEX;
__lg.FRAGMENT = FRAGMENT;
}
{
// core/src/scene.cpp ning JS nusxasi. Konstantalar va formulalar bir xil bo'lishi SHART:
// tests/golden.test.js C++ yadro natijalari bilan solishtiradi.
const MAX_SHAPES = 256;

const STEP = 1 / 60;
// Og'ir tomchi: kritik so'nuvchi harakat (tebranish yo'q). C++ yadro bilan bir xil bo'lishi shart.
const HEAD_OMEGA = 10, TAIL_OMEGA = 5.5, PRESS_RATE = 0.12, HOVER_RATE = 0.18, FOCUS_RATE = 0.10, EPS = 0.04;

const defaultParams = () => ({
  ior: 1.55, thick: 40, bevel: 26, disp: 0.04, blur: 0.35,
  merge: 48, elastic: 1, spec: 1.1, absorb: 0.2,
});

/** Qattiq oyna sozlamalari: ruxsat etilgan oraliq va yorliq (panel va hujjat shundan quriladi). */
const GLASS_SCHEMA = {
  ior:     { min: 1.1, max: 2,   step: 0.01,  label: 'Index of refraction' },
  thick:   { min: 0,   max: 160, step: 1,     label: 'Thickness' },
  bevel:   { min: 8,   max: 90,  step: 1,     label: 'Rim width (px)' },
  disp:    { min: 0,   max: 0.15, step: 0.002, label: 'Dispersion (colour separation)' },
  blur:    { min: 0,   max: 4,   step: 0.05,  label: 'Blur' },
  merge:   { min: 0,   max: 120, step: 1,     label: 'Merge radius (px)' },
  elastic: { min: 0,   max: 2.5, step: 0.05,  label: 'Liquid stretch (0 = rigid)' },
  spec:    { min: 0,   max: 2,   step: 0.05,  label: 'Specular' },
  absorb:  { min: 0,   max: 2,   step: 0.05,  label: 'Absorption (tint)' },
};

function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function smoothstep(e0, e1, x) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

class Scene {
  constructor() {
    this.params = defaultParams();
    this.s = [];
    this.focusIdx = -1;
    this.pressed = -1;
    this.hovered = -1;
    this.acc = 0;
  }

  add({ w = 100, h = 60, radius = 30, draggable = true, tint = [0, 0, 0, 0], bevel = 1, thick = 1 } = {}, pos = { x: 0, y: 0 }) {
    if (this.s.length >= MAX_SHAPES) return -1;
    this.s.push({ w, h, radius, draggable, tint, bevel, thick, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, ex: pos.x, ey: pos.y, vx: 0, vy: 0, hvx: 0, hvy: 0, press: 0, hover: 0, focus: 1 });
    if (this.focusIdx < 0 && draggable) this.focusIdx = this.s.length - 1;
    return this.s.length - 1;
  }

  get count() { return this.s.length; }
  get focused() { return this.focusIdx; }
  setTarget(id, p) { this.s[id].tx = p.x; this.s[id].ty = p.y; }
  /** Shisha rangi: [r, g, b, kuch] (0..1). Kuch 0 = tiniq shisha */
  setTint(id, t) { this.s[id].tint = [t[0], t[1], t[2], t[3]]; }
  /** Material: chet kengligi va qalinlik ko'paytiruvchisi (katta panel uchun ~0.4, tugma uchun 1) */
  setMaterial(id, bevelScale, thickScale) { this.s[id].bevel = bevelScale; this.s[id].thick = thickScale; }
  setHovered(id) { this.hovered = id; }   // kursor ostidagi shakl (-1 = yo'q): biroz kattalashadi
  /** Zudlik bilan joylashtirish (lagsiz): sahifa surilganda asl elementga ergashish uchun */
  teleport(id, x, y) { const s = this.s[id]; s.x = s.tx = s.ex = x; s.y = s.ty = s.ey = y; s.hvx = s.hvy = s.vx = s.vy = 0; }
  setPressed(id, down) { this.pressed = down ? id : (this.pressed === id ? -1 : this.pressed); }
  focus(id) { if (id >= 0 && id < this.s.length && this.s[id].draggable) this.focusIdx = id; }
  isFront(id) { return !this.s[id].draggable || id === this.focusIdx; }
  position(id) { return { x: this.s[id].x, y: this.s[id].y }; }
  depth(id) { return this.s[id].focus; }
  scale(id) { return this.#grow(this.s[id]); }

  #grow(s) { return (1 + 0.03 * s.press + 0.012 * s.hover) * (0.955 + 0.045 * s.focus); }
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
      const wh2 = this.hovered === i ? 1 : 0;
      s.hover += (wh2 - s.hover) * HOVER_RATE;
      if (Math.abs(wh2 - s.hover) > 0.002) moving = true;

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
    // Faqat shu o'tishda chiziladigan shakllar yoziladi (zich): shader nofaol shakllarni aylanib chiqmaydi
    const idx = [];
    this.s.forEach((_, i) => { if ((pass === 'front') === this.isFront(i)) idx.push(i); });
    const u = { count: idx.length, data: new Float32Array(Math.max(idx.length, 1) * 16), merge: this.params.merge * dpr };
    idx.forEach((i, j) => {
      const s = this.s[i], g = this.#grow(s), o = j * 16;
      u.data.set([s.x * dpr, s.y * dpr, s.w / 2 * g * dpr, s.h / 2 * g * dpr], o);
      u.data.set([s.ex * dpr, s.ey * dpr, s.bevel, s.thick], o + 4);   // zw = material (shader o'qiydi)
      u.data[o + 8] = s.radius * g * dpr;
      u.data[o + 9] = this.#reach(s) * dpr;
      u.data[o + 10] = 1;
      u.data[o + 11] = Math.hypot(s.x - s.ex, s.y - s.ey) * dpr;   // 0 = qo'zg'almas: shader uzoqda bo'lsa o'tkazib yuboradi
      u.data.set(s.tint, o + 12);
    });
    Object.assign(u, pass === 'back'
      ? { flip: 0, shadowK: 0.30, shadowOff: 7, specMul: 0.5, thickMul: 0.75, extraLod: 0 }
      : { flip: 1, shadowK: 0.55, shadowOff: 26, specMul: 1, thickMul: 1, extraLod: 0.7 });
    return u;
  }
}

__lg.MAX_SHAPES = MAX_SHAPES;
__lg.defaultParams = defaultParams;
__lg.GLASS_SCHEMA = GLASS_SCHEMA;
__lg.sdRoundRect = sdRoundRect;
__lg.smoothstep = smoothstep;
__lg.smin = smin;
__lg.Scene = Scene;
}
{
// Bo'laklar (tile) bo'yicha yaqin shakllar ro'yxati: shader har pikselda hamma shaklni emas, faqat shu bo'lakka yaqinlarini aylanadi.
// pass = Scene.pack() natijasi (qurilma pikselida). Natija R32F tekstura sifatida yuklanadi (kenglik cap+1, balandlik gw*gh).

/**
 * @param {{count:number, data:Float32Array, merge:number}} pass
 * @param {number} W,H  framebuffer piksel
 * @param {number} dpr
 */
function buildTiles(pass, W, H, dpr, tile = 32, cap = 64) {
  const gw = Math.ceil(W / tile), gh = Math.ceil(H / tile), width = cap + 1;
  const data = new Float32Array(gw * gh * width);
  const counts = new Int32Array(gw * gh);
  // soya va kaustika masofasi + qo'shilish radiusi: shakldan shuncha uzoqdagi bo'lakka u ta'sir qilishi mumkin
  const margin = 80 * dpr + pass.merge;
  for (let j = 0; j < pass.count; j++) {
    const o = j * 16, cx = pass.data[o], cy = pass.data[o + 1], hw = pass.data[o + 2], hh = pass.data[o + 3];
    const reach = pass.data[o + 9], stretch = pass.data[o + 11];
    const ext = margin + (stretch > 0.5 ? reach * 1.3 + 0.5 * Math.max(hw, hh) : 0);
    const x0 = Math.max(0, Math.floor((cx - hw - ext) / tile)), x1 = Math.min(gw - 1, Math.floor((cx + hw + ext) / tile));
    const y0 = Math.max(0, Math.floor((cy - hh - ext) / tile)), y1 = Math.min(gh - 1, Math.floor((cy + hh + ext) / tile));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = ty * gw + tx, n = counts[id];
        if (n < 0) continue;
        if (n >= cap) { counts[id] = -1; continue; }   // to'lib ketdi: shader bu bo'lakda hamma shaklni aylanadi
        data[id * width + 1 + n] = j;
        counts[id] = n + 1;
      }
    }
  }
  for (let id = 0; id < gw * gh; id++) data[id * width] = counts[id];
  return { data, gw, gh, cap, tile };
}

__lg.buildTiles = buildTiles;
}
{
const { VERTEX, FRAGMENT } = __lg;
const { buildTiles } = __lg;
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
class Renderer {
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

__lg.Renderer = Renderer;
}
{
const { Scene } = __lg;
const { Renderer } = __lg;
/**
 * Yuqori darajali API: canvas + shisha shakllar + sudrash + kadrni faqat kerak bo'lganda chizish.
 *
 *   const glass = new LiquidGlass(canvas, { source: sceneCanvasOrImageOrVideo });
 *   glass.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
 *   glass.params.merge = 60;
 *
 * source — shisha sinduradigan sahna (canvas/img/video/ImageBitmap). O'zgarsa: glass.setSource(...) yoki glass.invalidate().
 * Video yoki doimiy o'zgaradigan manba uchun { live: true }.
 */
class LiquidGlass {
  constructor(canvas, { source = null, live = false, maxDpr = 1.5, elastic = 0 } = {}) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.scene.params.elastic = elastic;   // 0 = toza qattiq oyna; > 0 = suyuq cho'zilish
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

__lg.LiquidGlass = LiquidGlass;
}
{
// Erkin suv: 2D zarrachali suyuqlik (grafikasiz yadro). Zarrachalar bir-birini itaradi (siqilmaslik),
// uzoqroqda tortadi (sirt tarangligi), nisbiy tezligi so'nadi (qovushqoqlik), oyna ishqalanishi sekinlatadi.
// Har bir tomchi o'z UI shakliga (to'rtburchak/kapsula) sekin qaytadi ("shakl xotirasi").

/** Sozlamalar: ruxsat etilgan oraliq (min..max) tashqarisidagi qiymat avtomatik qirqiladi — simulyatsiya portlamaydi. */
const PARAM_SCHEMA = {
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
const PRESETS = {
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

class FluidSim {
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

__lg.PARAM_SCHEMA = PARAM_SCHEMA;
__lg.PRESETS = PRESETS;
__lg.FluidSim = FluidSim;
}
{
const { VERTEX, FRAGMENT } = __lg;
const { FluidSim } = __lg;
const SPLAT_VS = `#version 300 es
in vec2 aPos; uniform vec2 uRes; uniform float uSize;
void main(){ gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0); gl_PointSize = uSize; }`;
const SPLAT_FS = `#version 300 es
precision highp float; uniform float uSigma; uniform float uSize; out vec4 o;
void main(){ vec2 c = (gl_PointCoord - 0.5) * uSize; o = vec4(exp(-dot(c, c) / (2.0 * uSigma * uSigma)), 0.0, 0.0, 1.0); }`;

// Shisha shaderidagi geometrik maydon (sdDrop/sdAll) o'rniga zarrachalar zichligi maydonidan hosil bo'lgan masofa
function glassSource() {
  const a = FRAGMENT.indexOf('// Bitta tomchi: BITTA jism'), b = FRAGMENT.indexOf('vec3 bgAt(');
  if (a < 0 || b < 0) throw new Error('liquidglass: shader markers not found (was sync-shader run?)');
  const field = `float rho(vec2 p){ return texture(uField, vec2(p.x / uRes.x, 1.0 - p.y / uRes.y)).r; }
float sdAll(vec2 p){
  float e = 2.0;
  float r0 = rho(p);
  vec2 g = vec2(rho(p + vec2(e, 0.0)) - rho(p - vec2(e, 0.0)), rho(p + vec2(0.0, e)) - rho(p - vec2(0.0, e))) / (2.0 * e);
  return clamp((uT - r0) / max(length(g), 1e-3), -80.0, 80.0);
}
`;
  return (FRAGMENT.slice(0, a) + field + FRAGMENT.slice(b)).replace('uniform sampler2D uBg;', 'uniform sampler2D uBg;\nuniform sampler2D uField;\nuniform float uT;');
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

const defaultGlass = () => ({ ior: 1.55, thick: 70, bevel: 44, disp: 0.05, blur: 0.35, spec: 1.1, absorb: 0.5 });

/**
 * Erkin suv + suyuq shisha. Tomchilar zarrachalardan iborat; shisha shu zarrachalar hosil qilgan yuzani sindiradi.
 *
 *   const water = new LiquidWater(canvas, { source: sceneCanvas, preset: 'water' });
 *   water.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
 *   water.fluid.set({ viscosity: 50 });   // jonli sozlash (PARAM_SCHEMA)
 *   water.glass.thick = 90;               // shisha ko'rinishi
 */
class LiquidWater {
  constructor(canvas, { source = null, preset = 'water', fluid = {}, glass = {} } = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not supported');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('Float render targets are not supported');
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
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('liquidglass: field FBO is incomplete');
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

__lg.defaultGlass = defaultGlass;
__lg.LiquidWater = LiquidWater;
}
{
const { LiquidGlass } = __lg;
const DEFAULTS = {
  selector: 'button, [role="button"]',   // qaysi elementlar shisha bo'lsin
  exclude: '',                           // shu selektorga mos kelganlar o'tkazib yuboriladi
  maxShapes: 128,                        // bir vaqtda (kattaroq = sekinroq; shakllar ma'lumot teksturasida, chegara 256)
  minSize: [28, 24],                     // bundan kichik elementlar o'tkazib yuboriladi (px)
  params: {},                            // glass.params ga beriladi (bevel, thick, ...)
  labelContrast: true,
  tint: true,                            // asl tugma rangi shisha rangiga o'tadi                   // yozuv rangi shisha ostidagi fon yorug'ligiga moslashadi
  zIndex: 2147483000,
};

/**
 * Mavjud sahifa/ilovadagi HAQIQIY elementlarni (tugmalarni) shisha materialga almashtiradi, ilova kodiga tegmasdan.
 * Asl element ko'rinmas (opacity 0) lekin bosiladigan qoladi; uning o'rnida shisha va yozuv nusxasi turadi.
 *
 * Ish tartibi: prepare() -> (sahifa surati olinadi, asl elementlar yashirin) -> start(surat). Sahifa o'zgarsa isDirty = true.
 * Suratni kim oladi: Electron'da main jarayon (electron.js), brauzerda `snapshot` funksiyasi (attach).
 */
class DomGlass {
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
    // Sahifa surilganda shisha asl elementlarga ergashadi (zudlik bilan), surilish tugagach surat qayta olinadi
    let raf = 0, settle = 0;
    this._scroll = () => {
      if (!this.glass || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        this.items.forEach(({ el }, i) => { const r = el.getBoundingClientRect(); this.rects[i] = r; this.glass.scene.teleport(i, r.left + r.width / 2, r.top + r.height / 2); });
        this.glass.wake();
      });
      clearTimeout(settle);
      settle = setTimeout(() => { this.dirty = true; this._onDirty && this._onDirty(); }, 160);
    };
    addEventListener('scroll', this._scroll, true);
  }

  get isDirty() { return this.dirty && !this.busy; }

  // Asl tugmaning fon rangi shisha rangiga aylanadi (qizil "Tozalash" qizil shisha, faol bo'lim moviy shisha va hokazo).
  // Shaffof yoki oq fon = tiniq shisha.
  #tintOf(cs) {
    if (!this.o.tint) return [0, 0, 0, 0];
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    if (a < 0.15 || (r > 225 && g > 225 && b > 225)) {
      // och yoki shaffof fon: rang yozuvdan olinadi (qizil yozuv -> qizil shisha), kulrang/qora yozuv -> tiniq shisha
      const t = cs.color.match(/rgba?\(([^)]+)\)/);
      if (!t) return [0, 0, 0, 0];
      const [tr, tg, tb] = t[1].split(',').map(Number), mx = Math.max(tr, tg, tb), mn = Math.min(tr, tg, tb);
      const lum = (0.299 * tr + 0.587 * tg + 0.114 * tb) / 255;   // to'q (qora-ko'k) yozuv rang emas, shunchaki matn
      if (mx === 0 || lum < 0.28 || (mx - mn) / mx < 0.55) return [0, 0, 0, 0];
      return [tr / 255, tg / 255, tb / 255, 0.3];
    }
    return [r / 255, g / 255, b / 255, Math.min(Math.max(a * 0.85, 0.2), 0.7)];
  }

  #collect() {
    const { selector, exclude, maxShapes, minSize } = this.o, out = [];
    for (const el of document.querySelectorAll(selector)) {
      if (exclude && el.matches(exclude)) continue;
      if (el.closest('[data-lg]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < minSize[0] || r.height < minSize[1] || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      out.push({ el, r, rad: Math.min(parseFloat(cs.borderTopLeftRadius) || 12, Math.min(r.width, r.height) / 2), tint: this.#tintOf(cs) });
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
    if (this._down) {
      document.removeEventListener('pointerdown', this._down, true); document.removeEventListener('pointerup', this._up, true);
      document.removeEventListener('pointermove', this._move, true); document.removeEventListener('mouseout', this._leave, true);
      this._down = this._up = this._move = this._leave = null;
    }
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
    this.items.forEach(({ el, r, rad, tint }) => {
      const lab = el.cloneNode(true);
      lab.setAttribute('data-lg', '1'); lab.removeAttribute('id');
      const tl = 0.299 * tint[0] + 0.587 * tint[1] + 0.114 * tint[2];
      // rangli shishada yozuv rangi shisha rangiga, aks holda fon yorug'ligiga qarab
      const dark = o.labelContrast ? (tint[3] > 0.35 ? tl > 0.6 : lumAt(r) > 0.55) : null;
      const col = dark === null ? '' : `color:${dark ? '#0f172a' : '#fff'} !important;text-shadow:${dark ? 'none' : '0 1px 4px rgba(0,0,0,.5)'};`;
      // asl fon/soya/chekinish olib tashlanadi (margin: aks holda yozuv siljiydi), pointer-events yo'q (bosish asl tugmaga o'tadi)
      lab.style.cssText += `;background:none !important;box-shadow:none !important;border-color:transparent !important;backdrop-filter:none !important;pointer-events:none !important;opacity:1 !important;margin:0 !important;inset:auto;z-index:${o.zIndex + 1};${col}`;
      if (dark !== null) lab.querySelectorAll('*').forEach((c) => c.style.setProperty('color', dark ? '#0f172a' : '#fff', 'important'));
      document.body.appendChild(lab);
      this.labels.push(lab);
      glass.add({ w: r.width, h: r.height, radius: rad, draggable: false, tint }, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, lab);
      this.rects.push(r);
    });

    // asl tugma bosilganda mos shisha "bosilgan" holatga o'tadi
    const find = (e) => this.rects.findIndex((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    this._move = (e) => { glass.scene.setHovered(find(e)); glass.wake(); };
    this._leave = (e) => { if (!e.relatedTarget) { glass.scene.setHovered(-1); glass.wake(); } };
    document.addEventListener('pointermove', this._move, true);
    document.addEventListener('mouseout', this._leave, true);
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
    this.teardown(); this._mo.disconnect(); removeEventListener('resize', this._resize); removeEventListener('scroll', this._scroll, true);
    this.busy = false;
  }
}

/**
 * Brauzer/ixtiyoriy muhit uchun qisqa kirish: sahifa o'zgarsa shisha o'zi qayta quriladi.
 *   attach({ selector: 'button, .btn', snapshot: async () => await html2canvas(document.body) })
 * (Electron uchun `electron.js` dagi enable() ishlatiladi.)
 */
function attach(opts = {}) {
  const d = new DomGlass(opts);
  if (typeof opts.snapshot === 'function') {
    let timer = 0, running = false;
    const run = async () => { if (running) return; running = true; try { await d.cycle(opts.snapshot); } finally { running = false; } };
    d._onDirty = () => { clearTimeout(timer); timer = setTimeout(() => d.isDirty && run(), 250); };
    run();
  }
  return d;
}

__lg.DomGlass = DomGlass;
__lg.attach = attach;
}
{
const { Scene, defaultParams, GLASS_SCHEMA } = __lg;
const { LiquidWater } = __lg;
const { Renderer } = __lg;
const { LiquidGlass } = __lg;

/** Bitta kirish nuqtasi: mode 'glass' (qattiq oyna, standart) yoki 'water' (zarrachali suv). */
function createLiquidGlass(canvas, { mode = 'glass', ...opts } = {}) {
  if (mode === 'water') return new LiquidWater(canvas, opts);
  if (mode === 'glass') return new LiquidGlass(canvas, opts);
  throw new Error(`liquidglass: unknown mode "${mode}" ('glass' | 'water')`);
}


__lg.Scene = Scene;
__lg.defaultParams = defaultParams;
__lg.GLASS_SCHEMA = GLASS_SCHEMA;
__lg.Renderer = Renderer;
__lg.LiquidGlass = LiquidGlass;
__lg.createLiquidGlass = createLiquidGlass;
}
window.LiquidGlassLib = __lg;
})();

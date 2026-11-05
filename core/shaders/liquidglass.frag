// Yagona shader manbasi (GLSL ES 3.0). Veb, Qt va ImGui backendlari shuni ishlatadi.
// Ikki o'tish: orqa qatlam (uFlip=0) -> FBO, oldingi qatlam (uFlip=1) FBO'ni sindiradi.
#version 300 es
precision highp float;
uniform sampler2D uBg;
// Shakllar ma'lumot teksturasida (RGBA32F, kenglik 4, balandlik = shakllar soni). Har shakl 4 ta piksel:
//   [0] rect: markaz.xy, yarim o'lcham.xy   [1] tail: kechikkan dum markazi.xy
//   [2] meta: burchak radiusi, maks. cho'zilish, faol(1/0), joriy cho'zilish (px)   [3] tint: rgb + kuch
uniform sampler2D uShapes;
uniform int   uCount;
uniform vec2  uRes;
uniform float uDpr, uMerge, uFlip, uShadowK, uShadowOff, uSpecMul, uThickMul, uExtraLod;
uniform vec2  uLight;
uniform float uIOR, uThick, uBevel, uDisp, uBlur, uSpec, uAbs;
out vec4 outColor;

vec4 shp(int i, int k){ return texelFetch(uShapes, ivec2(k, i), 0); }

float sdRR(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

// Eng yaqin shaklning kichik yarim o'lchami (sdAll yozadi): chet kengligi shundan oshmasligi uchun
float gMin = 1e5;
vec4  gTint = vec4(0.0);
// Bitta tomchi: BITTA jism. Bosh va dum nuqtasi orasidagi farq (cho'zilish) jismni harakat o'qi bo'ylab uzaytiradi,
// yuzani saqlash uchun enini toraytiradi va orqa tomonini uchiga qarab ingichkalashtiradi (tomchi shakli).
// uK[i] = maksimal cho'zilish (piksel). Nusxa/ikkinchi jism YO'Q.
float sdDrop(vec2 p, int i){
  vec4 r = shp(i, 0);
  vec4 mt = shp(i, 2);
  vec2 d = r.xy - shp(i, 1).xy;
  float len = length(d);
  float m = clamp(len / max(mt.y, 1.0), 0.0, 1.0);
  vec2 u = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 q = p - (r.xy - u * (0.30 * len));
  float a = dot(q, u), b = dot(q, vec2(-u.y, u.x));
  float hl = max(abs(u.x) * r.z + abs(u.y) * r.w, 1.0);
  float sS = 1.0 + 0.45 * m;
  float rear = pow(clamp(-a / (hl * 1.2), 0.0, 1.0), 1.6);
  float taper = 1.0 + 1.8 * m * rear;
  float a2 = a / sS, b2 = b * sqrt(sS) * taper;
  vec2 p2 = vec2(a2 * u.x - b2 * u.y, a2 * u.y + b2 * u.x);
  float rr = mix(min(mt.x, min(r.z, r.w)), min(r.z, r.w), clamp(m * 1.2, 0.0, 1.0));   // cho'zilganda to'liq yumaloq (kapsula)
  return sdRR(p2, r.zw, rr) / (1.0 + 0.7 * 1.8 * m * rear);
}
// Qatlamdagi barcha tomchilarning umumiy maydoni: yaqinlashganda suyuqdek qo'shiladi.
float sdAll(vec2 p){
  float d = 1e5, bm = 1e5;
  vec4 bt = vec4(0.0);
  for (int i = 0; i < uCount; i++){
    vec4 mt = shp(i, 2);
    if (mt.z < 0.5) continue;
    vec4 r = shp(i, 0);
    // Uzoqdagi QO'ZG'ALMAS shaklni hisoblamaymiz: silliq birlashma radiusidan tashqarida u natijaga ta'sir qilmaydi
    if (mt.w < 0.5) {   // qo'zg'almas (cho'zilmagan)
      float bd = length(max(abs(p - r.xy) - r.zw, 0.0));
      if (bd > d + max(uMerge, 0.5)) continue;
    }
    float di = sdDrop(p, i);
    if (di < d) { bm = min(r.z, r.w); bt = shp(i, 3); }
    d = smin(d, di, max(uMerge, 0.5));
  }
  gMin = bm;
  gTint = bt;
  return d;
}
vec3 bgAt(vec2 px, float lod){
  vec2 uv = clamp(px / uRes, vec2(0.001), vec2(0.999));
  if (uFlip > 0.5) uv.y = 1.0 - uv.y;
  return textureLod(uBg, uv, lod).rgb;
}
vec2 refractOffset(float ior, vec3 Nn, float t, float dist, out float tir){
  vec3 R = refract(vec3(0.0, 0.0, -1.0), Nn, 1.0 / ior);
  vec2 inner = R.xy / max(-R.z, 0.08) * t;
  float s = ior * length(R.xy);
  tir = step(0.985, s);
  s = min(s, 0.985);
  vec3 O = vec3(R.xy * ior, -sqrt(1.0 - s * s));
  vec2 outer = O.xy / (-O.z) * dist;
  return inner + outer;
}

void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 col = bgAt(px, 0.0);
  // Fon yorug'ligi (0 = qorong'i, 1 = oq): shisha qorong'i va yorug' fonda turlicha ko'rinishi uchun
  float lum = clamp(dot(bgAt(px, 6.0), vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  float d = sdAll(px);
  float halfMin = gMin;
  vec4 tint = gTint;

  // Soya va kaustika: sahnaning o'ziga (tagidagi tugma/matnga ham) tushadi. Uzoqda hisoblanmaydi.
  if (d > 0.0 && d < (90.0 + uShadowOff * 2.0) * uDpr){
    float ds = sdAll(px - vec2(0.0, uShadowOff * uDpr));
    float sh = exp(-max(ds, 0.0) / ((10.0 + uShadowOff * 0.5) * uDpr)) * uShadowK * mix(1.0, 0.25, lum);
    float dc = sdAll(px - vec2(0.0, uShadowOff * 1.9 * uDpr)) + 7.0 * uDpr;
    float caus = exp(-abs(dc) / (26.0 * uDpr)) * 0.2;
    col *= 1.0 - sh;
    col += vec3(0.38, 0.72, 1.0) * caus * (0.35 + sh) * (1.0 - 0.7 * lum);
  }

  if (d < 1.5 * uDpr){
    // Chet kengligi jismning yarmidan oshmaydi: markaz DOIM tiniq (linza emas, oyna) qoladi
    float zR = min(uBevel * uDpr, halfMin * 0.5);
    float depth = max(-d, 0.0);
    float e = 1.0;
    vec2 g = vec2(sdAll(px + vec2(e, 0.0)) - sdAll(px - vec2(e, 0.0)),
                  sdAll(px + vec2(0.0, e)) - sdAll(px - vec2(0.0, e)));
    g = normalize(g + 1e-6);

    float dd = clamp(depth, 0.0, zR);
    float h = sqrt(max(dd * (2.0 * zR - dd), 0.0));
    float dh = dd >= zR ? 0.0 : min((zR - dd) / sqrt(max(dd * (2.0 * zR - dd), 1.0)), 9.0);
    vec3 Nn = normalize(vec3(g * dh, 1.0));

    float th = uThick * uThickMul;
    float t = (0.25 * zR + h) * th / max(zR, 1.0) * uDpr;
    float dist = 1.15 * th * uDpr;

    float tirR, tirG, tirB;
    vec2 oR = refractOffset(uIOR - uDisp, Nn, t, dist, tirR);
    vec2 oG = refractOffset(uIOR,         Nn, t, dist, tirG);
    vec2 oB = refractOffset(uIOR + uDisp, Nn, t, dist, tirB);

    float lod = uBlur + uExtraLod + (h / max(zR, 1.0)) * uBlur * 0.6;
    float k = (0.6 + lod) * uDpr;
    vec2 pr = px + oR, pg = px + oG, pb = px + oB;
    vec3 tr = vec3(
      (bgAt(pr, lod).r * 2.0 + bgAt(pr + vec2(k, 0.0), lod).r + bgAt(pr - vec2(k, 0.0), lod).r + bgAt(pr + vec2(0.0, k), lod).r + bgAt(pr - vec2(0.0, k), lod).r) / 6.0,
      (bgAt(pg, lod).g * 2.0 + bgAt(pg + vec2(k, 0.0), lod).g + bgAt(pg - vec2(k, 0.0), lod).g + bgAt(pg + vec2(0.0, k), lod).g + bgAt(pg - vec2(0.0, k), lod).g) / 6.0,
      (bgAt(pb, lod).b * 2.0 + bgAt(pb + vec2(k, 0.0), lod).b + bgAt(pb - vec2(k, 0.0), lod).b + bgAt(pb + vec2(0.0, k), lod).b + bgAt(pb - vec2(0.0, k), lod).b) / 6.0);

    float path = t / max(abs(refract(vec3(0.0, 0.0, -1.0), Nn, 1.0 / uIOR).z), 0.1) / uDpr;
    tr *= exp(-uAbs * path * vec3(0.0042, 0.0036, 0.0030) * (1.0 - 0.7 * lum));   // deyarli neytral: sovuq ko'k tus yo'q
    tr = mix(tr, tr * vec3(0.98, 0.99, 1.02), 0.6);
    tr *= mix(1.0, 0.93, lum);
    // Rangli shisha: rang qo'shiladi, lekin orqadagi tafsilot (yorug'lik) saqlanadi
    tr = mix(tr, tint.rgb * (0.5 + 0.5 * dot(tr, vec3(0.3333))), tint.a);

    float cosT = clamp(Nn.z, 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
    vec3 env = mix(vec3(0.05, 0.08, 0.14), vec3(0.78, 0.9, 1.0), clamp(Nn.y * -0.5 + 0.5, 0.0, 1.0));
    env += vec3(0.10, 0.06, 0.16) * clamp(Nn.x * 0.5 + 0.5, 0.0, 1.0);
    vec3 refl = env * F * 1.55 * mix(1.0, 0.4, lum);

    float tir = max(max(tirR, tirG), tirB);
    vec3 tirGlow = vec3(0.75, 0.9, 1.0) * pow(1.0 - cosT, 3.0) * 0.6 * (0.4 + 0.6 * tir) * mix(1.0, 0.35, lum);

    // Yorug'lik kursorga ergashadi (uLight: -1..1)
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L1 = normalize(vec3(-0.55 + uLight.x * 0.5, -0.65 + uLight.y * 0.5, 0.75));
    vec3 L2 = normalize(vec3( 0.60 - uLight.x * 0.3,  0.55 - uLight.y * 0.3, 0.55));
    float s1 = pow(max(dot(Nn, normalize(L1 + V)), 0.0), 160.0);
    float s2 = pow(max(dot(Nn, normalize(L2 + V)), 0.0), 110.0) * 0.5;
    vec3 spec = vec3(1.0) * (s1 + s2) * uSpec * uSpecMul * 1.3;

    vec3 glass = tr * (1.0 - F * 0.9) + refl + tirGlow + spec;

    float edge = smoothstep(2.0 * uDpr, 0.0, depth) * smoothstep(-1.5 * uDpr, 0.0, -d);
    float topBias = clamp(dot(g, vec2(-0.6, -0.8)) * 0.5 + 0.5, 0.0, 1.0);
    glass += vec3(1.0 - 1.6 * lum) * edge * (0.2 + 0.6 * topBias) * 0.8;   // yorug' fonda chet oq emas, qoraroq chiziq

    float m = 1.0 - smoothstep(-0.8 * uDpr, 1.2 * uDpr, d);
    col = mix(col, glass, m);
  }
  outColor = vec4(col, 1.0);
}

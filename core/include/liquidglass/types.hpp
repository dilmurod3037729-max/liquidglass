#pragma once

namespace lg {

constexpr int kMaxShapes = 256;   // shaders/liquidglass.frag dagi `#define N` bilan bir xil

struct Vec2 { float x = 0, y = 0; };

struct ShapeDesc {
    float w = 100, h = 60, radius = 30;   // mantiqiy piksel
    bool  draggable = true;                // false: doim oldingi qatlamda (panel, tugma)
    float tint[4] = {0, 0, 0, 0};          // rgb (0..1) + kuch: rangli shisha, 0 = tiniq
    float bevel = 1, thick = 1;            // material: chet kengligi va qalinlik ko'paytiruvchisi (panel: 0.4, tugma: 1)
};

// Shisha materiali (web demo bilan bir xil ma'no va standart qiymatlar)
struct Params {
    float ior = 1.55f, thick = 40, bevel = 26, disp = 0.04f, blur = 0.35f;
    float merge = 48;      // shakllar qo'shilish radiusi (px)
    float elastic = 1;     // prujina yumshoqligi, 0 = o'chiq
    float spec = 1.1f, absorb = 0.2f;
};

enum class Pass { Back, Front };

// Bir o'tish uchun GPU'ga yuboriladigan ma'lumot. Shakllar RGBA32F teksturaga yoziladi (kenglik 4, balandlik = count):
//   shape i: [0] rect(4) [1] tail(4) [2] rad, k, act, cho'zilish [3] tint(4)   -> shapes[i*16 + piksel*4 + komponent]
struct PassUniforms {
    int   count;
    float shapes[kMaxShapes * 16];
    float merge, flip, shadowK, shadowOff, specMul, thickMul, extraLod;

    // qulaylik uchun o'qish funksiyalari (testlar va backendlar)
    const float* rect(int i) const { return shapes + i * 16; }
    const float* tail(int i) const { return shapes + i * 16 + 4; }
    float rad(int i) const { return shapes[i * 16 + 8]; }
    float k(int i) const { return shapes[i * 16 + 9]; }
    float act(int i) const { return shapes[i * 16 + 10]; }
    const float* tint(int i) const { return shapes + i * 16 + 12; }
};

}  // namespace lg

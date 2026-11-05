#pragma once

namespace lg {

constexpr int kMaxShapes = 32;   // shaders/liquidglass.frag dagi `#define N` bilan bir xil

struct Vec2 { float x = 0, y = 0; };

struct ShapeDesc {
    float w = 100, h = 60, radius = 30;   // mantiqiy piksel
    bool  draggable = true;                // false: doim oldingi qatlamda (panel, tugma)
    float tint[4] = {0, 0, 0, 0};          // rgb (0..1) + kuch: rangli shisha, 0 = tiniq
};

// Shisha materiali (web demo bilan bir xil ma'no va standart qiymatlar)
struct Params {
    float ior = 1.55f, thick = 40, bevel = 26, disp = 0.04f, blur = 0.35f;
    float merge = 48;      // shakllar qo'shilish radiusi (px)
    float elastic = 1;     // prujina yumshoqligi, 0 = o'chiq
    float spec = 1.1f, absorb = 0.2f;
};

enum class Pass { Back, Front };

// Bir o'tish uchun GPU'ga yuboriladigan massivlar (nomlar shaderdagi uniform'larga mos)
struct PassUniforms {
    float rect[kMaxShapes * 4];   // markaz.xy, yarim o'lcham.xy (qurilma pikseli)
    float tail[kMaxShapes * 4];   // kechikkan "dum"
    float rad[kMaxShapes];
    float k[kMaxShapes];          // dum bilan birlashish radiusi
    float act[kMaxShapes];        // 1 = shu o'tishda chiziladi
    float tint[kMaxShapes * 4];   // rgb + kuch
    float merge, flip, shadowK, shadowOff, specMul, thickMul, extraLod;
};

}  // namespace lg

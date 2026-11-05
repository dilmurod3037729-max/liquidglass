#pragma once
// Namuna sahna rasmi (veb demo'dagi kabi): gradient fon, vertikal tolalar, kartalar va rangli tugmalar. Matnsiz.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace art {

struct Img { int w, h; std::vector<uint8_t> px; };   // RGBA, tepa qatordan

inline float sdRR(float x, float y, float cx, float cy, float hw, float hh, float r) {
    const float qx = std::fabs(x - cx) - hw + r, qy = std::fabs(y - cy) - hh + r;
    return std::min(std::max(qx, qy), 0.0f) + std::hypot(std::max(qx, 0.0f), std::max(qy, 0.0f)) - r;
}

inline void blend(Img& im, int x, int y, float r, float g, float b, float a) {
    uint8_t* p = &im.px[(size_t(y) * im.w + x) * 4];
    p[0] = uint8_t(p[0] + (r - p[0]) * a); p[1] = uint8_t(p[1] + (g - p[1]) * a); p[2] = uint8_t(p[2] + (b - p[2]) * a);
}

inline void fillRR(Img& im, float cx, float cy, float w, float h, float rad, float r, float g, float b, float alpha) {
    const int x0 = std::max(0, int(cx - w / 2 - 2)), x1 = std::min(im.w - 1, int(cx + w / 2 + 2));
    const int y0 = std::max(0, int(cy - h / 2 - 2)), y1 = std::min(im.h - 1, int(cy + h / 2 + 2));
    for (int y = y0; y <= y1; y++)
        for (int x = x0; x <= x1; x++) {
            const float d = sdRR(x + 0.5f, y + 0.5f, cx, cy, w / 2, h / 2, rad);
            const float cov = std::min(std::max(0.5f - d, 0.0f), 1.0f);
            if (cov > 0) blend(im, x, y, r, g, b, cov * alpha);
        }
}

inline Img make(int w, int h, float dpr) {
    Img im{w, h, std::vector<uint8_t>(size_t(w) * h * 4, 255)};
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            const float t = (float(x) / w + float(y) / h) * 0.5f;
            const float r = t < 0.5f ? 11 + (16 - 11) * t * 2 : 16 + (11 - 16) * (t - 0.5f) * 2;
            const float g = t < 0.5f ? 31 + (22 - 31) * t * 2 : 22 + (42 - 22) * (t - 0.5f) * 2;
            const float b = t < 0.5f ? 61 + (58 - 61) * t * 2 : 58 + (51 - 58) * (t - 0.5f) * 2;
            uint8_t* p = &im.px[(size_t(y) * w + x) * 4];
            p[0] = uint8_t(r); p[1] = uint8_t(g); p[2] = uint8_t(b);
        }
    uint32_t s = 7;   // deterministik tasodifiy tolalar
    auto rnd = [&s]() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s & 0xFFFFFF) / float(0x1000000); };
    for (int i = 0; i < 700; i++) {
        const int x = int(rnd() * w), ww = 1 + int(rnd() * 6 * dpr);
        const float hue = rnd(), a = 0.05f + rnd() * 0.09f;
        const float r = 40 + 60 * hue, g = 110 + 90 * (1 - hue), b = 180 + 70 * hue;
        for (int dx = 0; dx < ww && x + dx < w; dx++)
            for (int y = 0; y < h; y++) blend(im, x + dx, y, r, g, b, a);
    }
    const float u = dpr;
    fillRR(im, w / 2.0f, 55 * u, w - 80 * u, 54 * u, 16 * u, 255, 255, 255, 0.07f);
    const float chipC[4][3] = {{0, 180, 216}, {123, 216, 143}, {255, 180, 84}, {255, 122, 144}};
    for (int i = 0; i < 4; i++) fillRR(im, w - (460 - i * 118) * u, 55 * u, 104 * u, 34 * u, 17 * u, chipC[i][0], chipC[i][1], chipC[i][2], 1.0f);
    const float cols[8][3] = {{0, 180, 216}, {123, 216, 143}, {255, 180, 84}, {255, 122, 144}, {169, 139, 255}, {74, 208, 179}, {242, 212, 92}, {110, 168, 255}};
    const float cw = std::min(310.0f * u, (w - 120 * u) / 3);
    for (int i = 0; i < 8; i++) {
        const float x = 40 * u + (i % 3) * (cw + 20 * u), y = 110 * u + (i / 3) * 112 * u;
        fillRR(im, x + cw / 2, y + 46 * u, cw, 92 * u, 20 * u, 255, 255, 255, 0.07f);
        fillRR(im, x + 46 * u, y + 46 * u, 52 * u, 52 * u, 26 * u, cols[i][0], cols[i][1], cols[i][2], 1.0f);
        fillRR(im, x + 88 * u + 60 * u, y + 34 * u, 120 * u, 10 * u, 5 * u, 240, 248, 255, 0.85f);
        fillRR(im, x + 88 * u + 90 * u, y + 62 * u, 180 * u, 8 * u, 4 * u, 220, 238, 255, 0.45f);
    }
    const float by = h - 127 * u, bc[5][3] = {{0, 180, 216}, {123, 216, 143}, {255, 180, 84}, {255, 122, 144}, {169, 139, 255}};
    for (int i = 0; i < 5; i++) fillRR(im, w / 2.0f - 330 * u + i * 134 * u + 59 * u, by + 23 * u, 118 * u, 46 * u, 23 * u, bc[i][0], bc[i][1], bc[i][2], 1.0f);
    return im;
}

}  // namespace art

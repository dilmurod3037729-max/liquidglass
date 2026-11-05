#include "liquidglass/scene.hpp"
#include "liquidglass/sdf.hpp"
#include <algorithm>
#include <cmath>

namespace lg {

namespace {
constexpr float kStep = 1.0f / 60.0f;
// "Og'ir tomchi": ikkala harakat ham kritik so'nuvchi (tebranish YO'Q). Bosh sichqonchaga sust ergashadi,
// dum undan ham sust; farq cho'zilgan suyuq ip hosil qiladi. omega katta = yengil, kichik = og'ir.
constexpr float kHeadOmega = 10.0f, kTailOmega = 5.5f;
constexpr float kPressRate = 0.12f, kHoverRate = 0.18f, kFocusRate = 0.10f;
constexpr float kEps = 0.04f;
}  // namespace

int Scene::add(const ShapeDesc& d, Vec2 pos) {
    if (int(s_.size()) >= kMaxShapes) return -1;
    Shape s;
    s.d = d;
    s.x = s.tx = s.ex = pos.x;
    s.y = s.ty = s.ey = pos.y;
    s_.push_back(s);
    if (focus_ < 0 && d.draggable) focus_ = int(s_.size()) - 1;
    return int(s_.size()) - 1;
}

void Scene::setTarget(int id, Vec2 p) { s_[id].tx = p.x; s_[id].ty = p.y; }
void Scene::teleport(int id, Vec2 p) {
    Shape& s = s_[id];
    s.x = s.tx = s.ex = p.x;
    s.y = s.ty = s.ey = p.y;
    s.hvx = s.hvy = s.vx = s.vy = 0;
}
void Scene::setPressed(int id, bool down) { pressed_ = down ? id : (pressed_ == id ? -1 : pressed_); }
void Scene::focus(int id) { if (id >= 0 && id < count() && s_[id].d.draggable) focus_ = id; }

bool Scene::isFront(int id) const { return !s_[id].d.draggable || id == focus_; }

float Scene::grow(const Shape& s) const { return (1.0f + 0.03f * s.press + 0.012f * s.hover) * (0.955f + 0.045f * s.focus); }
float Scene::scale(int id) const { return grow(s_[id]); }

// Tomchi dumi uzilmaydi va nusxa qoldirmaydi: bosh va dum nuqtasi orasidagi masofa reach() dan oshmaydi
float Scene::reach(int id) const { return 0.55f * std::min(s_[id].d.w, s_[id].d.h) + 40.0f; }

// Bitta jism: harakat o'qi bo'ylab uzayadi, eni torayadi (yuza saqlanadi), orqa tomoni uchiga qarab ingichkalashadi.
// shaders/liquidglass.frag dagi sdDrop() bilan aynan bir xil.
float Scene::drop(const Shape& s, Vec2 p) const {
    const float g = grow(s), hw = s.d.w / 2 * g, hh = s.d.h / 2 * g;
    const float L = 0.55f * std::min(s.d.w, s.d.h) + 40.0f;
    const float dx = s.x - s.ex, dy = s.y - s.ey, len = std::hypot(dx, dy);
    const float m = std::min(len / L, 1.0f);
    const float ux = len > 1e-3f ? dx / len : 1.0f, uy = len > 1e-3f ? dy / len : 0.0f;
    const float qx = p.x - (s.x - ux * 0.30f * len), qy = p.y - (s.y - uy * 0.30f * len);
    const float a = qx * ux + qy * uy, b = -qx * uy + qy * ux;
    const float hl = std::max(std::fabs(ux) * hw + std::fabs(uy) * hh, 1.0f);
    const float sS = 1.0f + 0.45f * m;
    const float rear = std::pow(std::min(std::max(-a / (hl * 1.2f), 0.0f), 1.0f), 1.6f);
    const float taper = 1.0f + 1.8f * m * rear;
    const float a2 = a / sS, b2 = b * std::sqrt(sS) * taper;
    const float px = a2 * ux - b2 * uy, py = a2 * uy + b2 * ux;
    const float rmax = std::min(hw, hh);
    const float rr = std::min(s.d.radius * g, rmax) * (1.0f - std::min(m * 1.2f, 1.0f)) + rmax * std::min(m * 1.2f, 1.0f);
    return sdRoundRect(px, py, hw, hh, rr) / (1.0f + 0.7f * 1.8f * m * rear);
}

bool Scene::stepOnce() {
    bool moving = false;
    const float E = params.elastic;
    for (int i = 0; i < count(); i++) {
        Shape& s = s_[i];
        const float wf = isFront(i) ? 1.0f : 0.0f;
        s.focus += (wf - s.focus) * kFocusRate;
        if (std::fabs(wf - s.focus) > 0.002f) moving = true;
        const float wp = (pressed_ == i) ? 1.0f : 0.0f;
        s.press += (wp - s.press) * kPressRate;
        if (std::fabs(wp - s.press) > 0.002f) moving = true;
        const float wh2 = (hovered_ == i) ? 1.0f : 0.0f;
        s.hover += (wh2 - s.hover) * kHoverRate;
        if (std::fabs(wh2 - s.hover) > 0.002f) moving = true;

        const float heavy = 1.0f / (0.5f + 0.5f * std::max(E, 0.0f));   // elastic = "qovushqoqlik": katta = og'irroq
        const float wh = kHeadOmega * heavy, wt = kTailOmega * heavy;
        s.hvx += (wh * wh * (s.tx - s.x) - 2 * wh * s.hvx) * kStep;
        s.hvy += (wh * wh * (s.ty - s.y) - 2 * wh * s.hvy) * kStep;
        s.x += s.hvx * kStep;
        s.y += s.hvy * kStep;
        if (E <= 0.001f) {
            s.ex = s.x; s.ey = s.y; s.vx = s.vy = 0;
        } else {
            s.vx += (wt * wt * (s.x - s.ex) - 2 * wt * s.vx) * kStep;
            s.vy += (wt * wt * (s.y - s.ey) - 2 * wt * s.vy) * kStep;
            s.ex += s.vx * kStep;
            s.ey += s.vy * kStep;
            // Sirt taranglik: ip ma'lum uzunlikdan keyin uziladi (dum boshga yaqinlashtiriladi)
            const float L = 0.55f * std::min(s.d.w, s.d.h) + 40.0f;
            const float dx = s.x - s.ex, dy = s.y - s.ey, dd = std::hypot(dx, dy);
            if (dd > L) { s.ex = s.x - dx * L / dd; s.ey = s.y - dy * L / dd; }
        }
        const float m = std::fabs(s.tx - s.x) + std::fabs(s.ty - s.y) + std::fabs(s.x - s.ex) +
                        std::fabs(s.y - s.ey) + std::fabs(s.vx) + std::fabs(s.vy) + std::fabs(s.hvx) + std::fabs(s.hvy);
        if (m > kEps) moving = true;
    }
    return moving;
}

bool Scene::step(float dt) {
    acc_ += dt;
    bool moving = false;
    int guard = 0;
    while (acc_ >= kStep && guard++ < 8) { moving |= stepOnce(); acc_ -= kStep; }
    if (guard >= 8) acc_ = 0;   // uzoq pauzadan keyin "otilib ketmaslik"
    return moving || pressed_ >= 0;
}

float Scene::sdf(Vec2 p, Pass pass) const {
    float d = 1e5f;
    for (int i = 0; i < count(); i++) {
        if ((pass == Pass::Front) != isFront(i)) continue;
        const Shape& s = s_[i];
        d = smin(d, drop(s, p), std::max(params.merge, 0.5f));
    }
    return d;
}

int Scene::hit(Vec2 p) const {
    for (int i = count() - 1; i >= 0; i--) {
        const Shape& s = s_[i];
        if (!s.d.draggable) continue;
        const float g = grow(s);
        if (sdRoundRect(p.x - s.x, p.y - s.y, s.d.w / 2 * g, s.d.h / 2 * g, s.d.radius * g) < 0) return i;
    }
    return -1;
}

PassUniforms Scene::pack(Pass pass, float dpr) const {
    // Faqat shu o'tishda chiziladigan shakllar yoziladi (zich): shader nofaol shakllarni aylanib chiqmaydi
    PassUniforms u{};
    int j = 0;
    for (int i = 0; i < count(); i++) {
        if ((pass == Pass::Front) != isFront(i)) continue;
        const Shape& s = s_[i];
        const float g = grow(s);
        const float r[4] = {s.x * dpr, s.y * dpr, s.d.w / 2 * g * dpr, s.d.h / 2 * g * dpr};
        const float t[4] = {s.ex * dpr, s.ey * dpr, r[2], r[3]};
        float* o = u.shapes + j * 16;
        std::copy(r, r + 4, o);
        std::copy(t, t + 4, o + 4);
        o[8] = s.d.radius * g * dpr;
        o[9] = reach(i) * dpr;
        o[10] = 1.0f;
        o[11] = std::hypot(s.x - s.ex, s.y - s.ey) * dpr;   // 0 = qo'zg'almas: shader uzoqda bo'lsa o'tkazib yuboradi
        std::copy(s.d.tint, s.d.tint + 4, o + 12);
        j++;
    }
    u.count = j;
    u.merge = params.merge * dpr;
    if (pass == Pass::Back) { u.flip = 0; u.shadowK = 0.30f; u.shadowOff = 7;  u.specMul = 0.5f; u.thickMul = 0.75f; u.extraLod = 0; }
    else                    { u.flip = 1; u.shadowK = 0.55f; u.shadowOff = 26; u.specMul = 1.0f; u.thickMul = 1.0f;  u.extraLod = 0.7f; }
    return u;
}

}  // namespace lg

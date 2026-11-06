#pragma once
#include "types.hpp"
#include <vector>

namespace lg {

// Shisha sahnasi: shakllar, ularning prujinali harakati, fokus (qatlam) va GPU uniformlari.
// Grafika API'ga bog'liq emas: backend (WebGL, Qt RHI, ImGui) faqat pack() natijasini yuboradi.
class Scene {
public:
    Params params;

    int  add(const ShapeDesc& d, Vec2 pos);          // shakl id'sini qaytaradi, joy yo'q bo'lsa -1
    int  count() const { return int(s_.size()); }

    void setTarget(int id, Vec2 p);                   // sudrash nishoni
    void setPressed(int id, bool down);               // bosilgan: biroz kattalashadi
    void setHovered(int id) { hovered_ = id; }        // kursor ostidagi shakl (-1 = yo'q): biroz kattalashadi
    void teleport(int id, Vec2 p);                    // zudlik bilan (lagsiz) joylashtirish
    void setTint(int id, float r, float g, float b, float a);   // shisha rangi (rgb 0..1, a = kuch; 0 = tiniq)
    const float* tint(int id) const { return s_[id].d.tint; }
    void setMaterial(int id, float bevelScale, float thickScale) { s_[id].d.bevel = bevelScale; s_[id].d.thick = thickScale; }
    void focus(int id);                               // shu shakl oldinga, qolgan sudraladiganlar orqaga
    int  focused() const { return focus_; }
    bool isFront(int id) const;

    // dt — soniya. Doimiy 60 Hz qadamlar bilan integrallanadi (kadr tezligiga bog'liq emas).
    // true: hali qimirlayapti (kadr kerak). false: tinch holat, chizish shart emas.
    bool step(float dt);

    Vec2  position(int id) const { return {s_[id].x, s_[id].y}; }
    Vec2  tailPosition(int id) const { return {s_[id].ex, s_[id].ey}; }
    float reach(int id) const;                        // dum boshdan eng ko'pi bilan shuncha uzoqlasha oladi
    float scale(int id) const;                        // bosilish va chuqurlikdan hosil bo'lgan kattalik
    float depth(int id) const { return s_[id].focus; }   // 0 = uzoqda, 1 = yaqinda (matn xiraligi uchun)

    // Qatlamdagi barcha shakllarning umumiy imzolangan masofa maydoni (qo'shilish bilan)
    float sdf(Vec2 p, Pass pass) const;
    int   hit(Vec2 p) const;                          // sudraladigan shakl id'si yoki -1

    PassUniforms pack(Pass pass, float dpr) const;

private:
    struct Shape {
        ShapeDesc d;
        float x = 0, y = 0, tx = 0, ty = 0, ex = 0, ey = 0, vx = 0, vy = 0, hvx = 0, hvy = 0;
        float press = 0, hover = 0, focus = 1;
    };
    std::vector<Shape> s_;
    int   focus_ = -1;
    int   pressed_ = -1;
    int   hovered_ = -1;
    float acc_ = 0;

    bool  stepOnce();
    float grow(const Shape& s) const;
    float drop(const Shape& s, Vec2 p) const;   // bitta tomchining deformatsiyalangan SDF'i
};

}  // namespace lg

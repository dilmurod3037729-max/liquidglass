#include "liquidglass/scene.hpp"
#include <cmath>
#include <cstdio>

static int fails = 0;
#define CHECK(c) do { if (!(c)) { std::printf("XATO %s:%d  %s\n", __FILE__, __LINE__, #c); fails++; } } while (0)

using namespace lg;

int main() {
    Scene sc;
    const int card = sc.add({280, 170, 40, true}, {300, 300});
    const int cap  = sc.add({220, 58, 29, true},  {700, 300});
    const int btn  = sc.add({150, 52, 26, false}, {500, 600});

    // Fokus: boshida birinchi sudraladigan shakl oldinda; qo'zg'almas shakl doim oldinda
    CHECK(sc.focused() == card);
    CHECK(sc.isFront(card) && !sc.isFront(cap) && sc.isFront(btn));
    sc.focus(cap);
    CHECK(sc.isFront(cap) && !sc.isFront(card));
    sc.focus(btn);   // qo'zg'almas shaklga fokus berilmaydi
    CHECK(sc.focused() == cap);

    // Prujina: nishon o'zgarsa harakat, keyin tinchlanadi
    sc.setTarget(cap, {900, 400});
    CHECK(sc.step(1.0f / 60.0f));
    int frames = 0;
    while (sc.step(1.0f / 60.0f) && frames < 2000) frames++;
    CHECK(frames < 2000);
    CHECK(std::fabs(sc.position(cap).x - 900) < 0.5f && std::fabs(sc.position(cap).y - 400) < 0.5f);

    // Og'ir tomchi: nishondan O'TIB KETMAYDI (jelatin tebranishi yo'q)
    Scene o;
    o.add({200, 60, 30, true}, {0, 0});
    o.setTarget(0, {400, 0});
    float maxX = 0;
    for (int i = 0; i < 600; i++) { o.step(1.0f / 60.0f); maxX = std::fmax(maxX, o.position(0).x); }
    CHECK(maxX <= 400.5f);

    // Tez sudrash: dum boshdan reach() dan uzoqlashmaydi va ingichkalashadi (to'liq nusxa qolmaydi)
    Scene f2;
    f2.add({280, 170, 40, true}, {0, 0});
    f2.setTarget(0, {3000, 0});
    const Scene rest = [] { Scene r; r.add({280, 170, 40, true}, {0, 0}); return r; }();
    auto area = [](const Scene& sc2) {
        const Vec2 h = sc2.position(0);
        float a = 0;
        for (float yy = -300; yy < 300; yy += 8) for (float xx = -300; xx < 300; xx += 8)
            if (sc2.sdf({h.x + xx, h.y + yy}, Pass::Front) < 0) a += 64;
        return a;
    };
    const float restA = area(rest);
    float maxGap = 0, minA = 1e9f, maxA = 0;
    for (int i = 0; i < 120; i++) {
        f2.step(1.0f / 60.0f);
        const Vec2 h = f2.position(0), t = f2.tailPosition(0);
        maxGap = std::fmax(maxGap, std::hypot(h.x - t.x, h.y - t.y));
        const float ar = area(f2);
        minA = std::fmin(minA, ar); maxA = std::fmax(maxA, ar);
        CHECK(f2.sdf({h.x - 330, h.y}, Pass::Front) > 0);   // orqada nusxa/ikkinchi jism YO'Q
    }
    CHECK(maxGap <= f2.reach(0) + 0.01f);
    CHECK(minA > 0.7f * restA && maxA < 1.4f * restA);   // tomchi hajmi (yuzasi) saqlanadi

    // Kadr tezligidan mustaqillik: bir xil vaqt, boshqa dt -> bir xil natija
    Scene a, b;
    for (Scene* s : {&a, &b}) { s->add({200, 60, 30, true}, {0, 0}); s->setTarget(0, {300, 100}); }
    for (int i = 0; i < 30; i++) a.step(1.0f / 60.0f);
    for (int i = 0; i < 60; i++) b.step(1.0f / 120.0f);
    CHECK(std::fabs(a.position(0).x - b.position(0).x) < 0.01f);

    // Qo'shilish: ikki yaqin shakl orasidagi umumiy maydon, merge kamaysa ko'prik ham kamayadi
    Scene m;
    m.add({100, 60, 30, false}, {100, 100});
    m.add({100, 60, 30, false}, {200, 100});
    const float joined = m.sdf({150, 100}, Pass::Front);
    m.params.merge = 0.5f;
    const float apart = m.sdf({150, 100}, Pass::Front);
    CHECK(joined < apart);

    // Orqa qatlam bo'sh bo'lsa maydon "cheksiz"
    Scene e;
    e.add({100, 60, 30, false}, {0, 0});
    CHECK(e.sdf({0, 0}, Pass::Back) > 1e4f);

    // Hit-test va pack
    CHECK(sc.hit(sc.position(cap)) == cap);
    CHECK(sc.hit({5000, 5000}) == -1);
    const PassUniforms f = sc.pack(Pass::Front, 2.0f), bk = sc.pack(Pass::Back, 2.0f);
    CHECK(f.act(cap) == 1.0f && f.act(card) == 0.0f && bk.act(card) == 1.0f && bk.act(cap) == 0.0f);
    CHECK(std::fabs(f.rect(cap)[0] - sc.position(cap).x * 2) < 1e-3f);
    CHECK(f.flip == 1.0f && bk.flip == 0.0f && f.shadowOff > bk.shadowOff);

    // Bosilish kattalashtiradi, qo'yib yuborilsa qaytadi
    const float base = sc.scale(cap);
    sc.setPressed(cap, true);
    for (int i = 0; i < 60; i++) sc.step(1.0f / 60.0f);
    CHECK(sc.scale(cap) > base + 0.02f);
    sc.setPressed(cap, false);
    for (int i = 0; i < 120; i++) sc.step(1.0f / 60.0f);
    CHECK(std::fabs(sc.scale(cap) - base) < 0.005f);

    // Hover: kursor ostida biroz kattalashadi, ketsa qaytadi; teleport lagsiz
    Scene hv;
    hv.add({100, 40, 20, false}, {0, 0});
    const float hbase = hv.scale(0);
    hv.setHovered(0);
    for (int i = 0; i < 90; i++) hv.step(1.0f / 60.0f);
    CHECK(hv.scale(0) > hbase + 0.008f && hv.scale(0) < hbase + 0.02f);
    hv.setHovered(-1);
    for (int i = 0; i < 120; i++) hv.step(1.0f / 60.0f);
    CHECK(std::fabs(hv.scale(0) - hbase) < 0.002f);
    hv.teleport(0, {300, 200});
    CHECK(std::fabs(hv.position(0).x - 300) < 1e-4f && std::fabs(hv.tailPosition(0).y - 200) < 1e-4f);

    std::printf(fails ? "%d xato\n" : "hammasi o'tdi\n", fails);
    return fails ? 1 : 0;
}

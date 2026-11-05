# liquidglass (core)

Fizikaga asoslangan "suyuq shisha" kutubxonasining yadrosi. Grafika API'ga bog'liq emas.

- `include/liquidglass/` — `Scene` (shakllar, prujina, fokus/qatlam, uniform paketlash), SDF yordamchilari
- `shaders/liquidglass.frag` — yagona shader manbasi (GLSL ES 3.0): sinish, dispersiya, Fresnel, to'liq ichki qaytish, yutilish, soya/kaustika
- `tests/` — yadro testlari (prujina, fokus, qo'shilish, kadr tezligidan mustaqillik)

## Ikki o'tishli chizish

1. **Orqa o'tish:** sahna teksturasi + orqadagi shakllar -> FBO (`PassUniforms` = `Scene::pack(Pass::Back)`, `uFlip=0`)
2. **Oldingi o'tish:** FBO + oldingi shakllar ekranga (`Pass::Front`, `uFlip=1`). Oldingi shisha orqadagini sindiradi.

Backend har kadrda: `scene.step(dt)` -> `true` bo'lsa chiz, `false` bo'lsa kadrni to'xtat.

## Yig'ish

    cmake -S . -B build -G "Visual Studio 17 2022" -A x64
    cmake --build build --config Release
    build\Release\test_scene.exe

Namuna (vizual): `..\qbit-liquid-glass\liquid-glass-webgl\proto2.html`

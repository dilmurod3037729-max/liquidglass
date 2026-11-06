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

## Native backend (OpenGL 3.3 + GLFW + Dear ImGui)

`native/` ichida veb bilan bir xil shader va `lg::Scene` yadro ustida ishlaydigan OpenGL chizuvchi (`GlRenderer`) va namuna dastur.
Birinchi yig'ishda GLFW va ImGui GitHub'dan avtomatik yuklanadi (internet kerak).

    cmake -S . -B build-native -G "Visual Studio 17 2022" -A x64 -DLG_BUILD_NATIVE=ON
    cmake --build build-native --config Release --target native_demo
    build-native\native\Release\native_demo.exe              # interaktiv: shakllarni sudrang, panelda sozlang
    build-native\native\Release\native_demo.exe --shot a.png # oynasiz skrinshot (skriptlangan sudrash)

![native](native/docs/native.png)

Chizuvchini o'z ilovangizga ulash: `lg::gl::load()` (GLFW kontekstidan keyin), `GlRenderer::init(fragPath)`, `resize()`, `setSource(rgba, w, h)`,
har kadrda `scene.step(dt)` va `renderer.render(scene, dpr, light)`.
Cheklov: sahna (sindiriladigan rasm) siz tomondan RGBA piksel sifatida beriladi; OpenGL 3.3 core kerak.

## Qt 6 backend (QOpenGLWidget)

`qt/` ichida `GlassWidget` (QOpenGLWidget): bir xil `GlRenderer`, shader va `lg::Scene` yadro. Namuna dastur Qt slayderlari paneli bilan.

    cmake -S . -B build-qt -G Ninja -DLG_BUILD_QT=ON -DCMAKE_PREFIX_PATH=<Qt>/6.x/<kit>
    cmake --build build-qt
    build-qt\qt\qt_demo.exe              # interaktiv
    build-qt\qt\qt_demo.exe --shot a.png # oynasiz skrinshot (skriptlangan sudrash)

![qt](qt/docs/qt.png)

O'z Qt ilovangizga ulash: `GlassWidget` yarating, `scene()` orqali shakllar qo'shing (`add`, `setTint`), `setSource(QImage)` bilan sindiriladigan sahnani bering.
Sinalgan kit: Qt 6.11 MinGW 13.1 (Windows). OpenGL 3.3 core talab qilinadi.

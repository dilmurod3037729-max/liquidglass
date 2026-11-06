// Qt 6 namuna: QOpenGLWidget ichida suyuq shisha + Qt slayderlari paneli.
//   qt_demo                  interaktiv
//   qt_demo --shot out.png   oynasiz skriptlangan sudrash, so'ng skrinshot (test uchun)
#include "glass_widget.hpp"

#include <QApplication>
#include <QHBoxLayout>
#include <QLabel>
#include <QSlider>
#include <QSurfaceFormat>
#include <QTimer>
#include <QVBoxLayout>
#include <cstdio>
#include <cstring>

#ifndef LG_SHADER_PATH
#define LG_SHADER_PATH "liquidglass.frag"
#endif

namespace {

QSlider* addSlider(QVBoxLayout* col, const QString& name, float lo, float hi, float* value) {
    auto* label = new QLabel(name);
    auto* s = new QSlider(Qt::Horizontal);
    s->setRange(0, 1000);
    s->setValue(int((*value - lo) / (hi - lo) * 1000));
    QObject::connect(s, &QSlider::valueChanged, [=](int v) { *value = lo + (hi - lo) * float(v) / 1000.0f; });
    col->addWidget(label);
    col->addWidget(s);
    return s;
}

}  // namespace

int main(int argc, char** argv) {
    QSurfaceFormat fmt;
    fmt.setVersion(3, 3);
    fmt.setProfile(QSurfaceFormat::CoreProfile);
    QSurfaceFormat::setDefaultFormat(fmt);

    QApplication app(argc, argv);
    QString shot;
    for (int i = 1; i + 1 < argc; i++) if (!std::strcmp(argv[i], "--shot")) shot = argv[i + 1];

    QWidget window;
    window.setWindowTitle("liquidglass: Qt backend");
    window.resize(1280, 800);
    auto* row = new QHBoxLayout(&window);
    row->setContentsMargins(0, 0, 0, 0);

    auto* glass = new GlassWidget(LG_SHADER_PATH);
    row->addWidget(glass, 1);

    const float W = 1280 - 240.0f, H = 800.0f;   // panel kengligi hisobga olingan
    lg::Scene& sc = glass->scene();
    const int card = sc.add({280, 170, 40, true}, {W * 0.30f, H * 0.40f});
    sc.add({220, 58, 29, true}, {W * 0.62f, H * 0.30f});
    sc.add({64, 64, 32, true}, {W * 0.80f, H * 0.62f});
    const int ok = sc.add({150, 52, 26, false}, {W / 2 - 100, H - 127});
    const int cancel = sc.add({150, 52, 26, false}, {W / 2 + 100, H - 127});
    sc.setTint(ok, 0.15f, 0.65f, 0.35f, 0.4f);
    sc.setTint(cancel, 0.85f, 0.2f, 0.25f, 0.4f);

    auto* panel = new QWidget;
    panel->setFixedWidth(240);
    auto* col = new QVBoxLayout(panel);
    lg::Params& p = sc.params;
    addSlider(col, "Sinish (IOR)", 1.1f, 2.0f, &p.ior);
    addSlider(col, "Qalinlik", 0, 160, &p.thick);
    addSlider(col, "Chet kengligi", 8, 90, &p.bevel);
    addSlider(col, "Dispersiya", 0, 0.15f, &p.disp);
    addSlider(col, "Blur", 0, 4, &p.blur);
    addSlider(col, "Qo'shilish", 0, 120, &p.merge);
    addSlider(col, "Yaltirash", 0, 2, &p.spec);
    addSlider(col, "Yutilish", 0, 2, &p.absorb);
    col->addStretch(1);
    row->addWidget(panel);
    for (QSlider* s : panel->findChildren<QSlider*>()) QObject::connect(s, &QSlider::valueChanged, glass, [glass] { glass->update(); });

    window.show();

    if (!shot.isEmpty()) {   // skriptlangan sudrash: kartani o'ngga tez tortamiz, so'ng suratga olamiz
        auto* t = new QTimer(&app);
        int frame = 0;
        QObject::connect(t, &QTimer::timeout, [&, t] {
            frame++;
            if (frame == 5) { sc.focus(card); sc.setPressed(card, true); }
            if (frame >= 5 && frame <= 45) sc.setTarget(card, {W * 0.30f + (frame - 5) * 12.0f, H * 0.40f + (frame - 5) * 2.0f});
            if (frame == 46) sc.setPressed(card, false);
            glass->update();
            if (frame == 80) {
                glass->grabFramebuffer().save(shot);
                std::printf("skrinshot: %s\n", shot.toStdString().c_str());
                t->stop();
                app.quit();
            }
        });
        t->start(16);
    }
    return app.exec();
}

#include "glass_widget.hpp"
#include "gl_loader.hpp"
#include "example/scene_art.hpp"

#include <QMouseEvent>
#include <QOpenGLContext>
#include <QTimer>

GlassWidget::GlassWidget(const QString& shaderPath, QWidget* parent) : QOpenGLWidget(parent), shaderPath_(shaderPath) {
    setMouseTracking(true);
    scene_.params.elastic = 0;   // toza qattiq oyna
    clock_.start();
}

void GlassWidget::setSource(const QImage& img) {
    source_ = img.convertToFormat(QImage::Format_RGBA8888);
    userSource_ = true;
    if (isValid()) { makeCurrent(); renderer_.setSource(source_.constBits(), source_.width(), source_.height()); doneCurrent(); }
    update();
}

void GlassWidget::initializeGL() {
    const bool ok = lg::gl::load([](const char* n) { return reinterpret_cast<void*>(QOpenGLContext::currentContext()->getProcAddress(n)); });
    std::string err;
    if (!ok || !renderer_.init(shaderPath_.toStdString(), err)) qFatal("liquidglass: %s", ok ? err.c_str() : "OpenGL funksiyalari yuklanmadi");
}

void GlassWidget::rebuildSource() {
    const float dpr = float(devicePixelRatioF());
    const int fw = int(width() * dpr), fh = int(height() * dpr);
    if (userSource_) { renderer_.setSource(source_.constBits(), source_.width(), source_.height()); return; }
    const art::Img im = art::make(fw, fh, dpr);
    renderer_.setSource(im.px.data(), im.w, im.h);
}

void GlassWidget::resizeGL(int w, int h) {
    const float dpr = float(devicePixelRatioF());
    renderer_.resize(int(w * dpr), int(h * dpr));
    rebuildSource();
}

void GlassWidget::paintGL() {
    const float dt = float(clock_.restart()) / 1000.0f;
    const bool moving = scene_.step(dt > 0.1f ? 0.1f : dt);
    renderer_.render(scene_, float(devicePixelRatioF()), light_, defaultFramebufferObject());
    if (moving) update();   // kadr faqat qimirlayotgan paytda; tinch holatda chizilmaydi
}

void GlassWidget::mousePressEvent(QMouseEvent* e) {
    if (e->button() != Qt::LeftButton) return;
    const lg::Vec2 p{float(e->position().x()), float(e->position().y())};
    const int id = scene_.hit(p);
    if (id < 0) return;
    const lg::Vec2 c = scene_.position(id);
    scene_.focus(id);
    scene_.setPressed(id, true);
    dragId_ = id; dx_ = p.x - c.x; dy_ = p.y - c.y;
    update();
}

void GlassWidget::mouseMoveEvent(QMouseEvent* e) {
    const float x = float(e->position().x()), y = float(e->position().y());
    light_ = {(x / float(width()) - 0.5f) * 2, (y / float(height()) - 0.5f) * 2};
    if (dragId_ >= 0) scene_.setTarget(dragId_, {x - dx_, y - dy_});
    update();
}

void GlassWidget::mouseReleaseEvent(QMouseEvent*) {
    if (dragId_ >= 0) scene_.setPressed(dragId_, false);
    dragId_ = -1;
    update();
}

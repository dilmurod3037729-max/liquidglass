#pragma once
// Qt 6 backend: QOpenGLWidget ichida bir xil GlRenderer va lg::Scene yadro (veb va GLFW versiyalari bilan bir xil shader).
// Ulash: GlassWidget yarating, scene() orqali shakllar qo'shing, setSource() bilan sahna (sindiriladigan rasm) bering.
#include "liquidglass/scene.hpp"
#include "gl_renderer.hpp"

#include <QElapsedTimer>
#include <QImage>
#include <QOpenGLWidget>
#include <QString>

class GlassWidget : public QOpenGLWidget {
    Q_OBJECT
public:
    explicit GlassWidget(const QString& shaderPath, QWidget* parent = nullptr);

    lg::Scene& scene() { return scene_; }
    // Sahna: widget o'lchamida (qurilma pikselida) RGBA rasm. null bo'lsa o'zimiz namuna sahna chizamiz.
    void setSource(const QImage& img);

protected:
    void initializeGL() override;
    void resizeGL(int w, int h) override;
    void paintGL() override;
    void mousePressEvent(QMouseEvent* e) override;
    void mouseMoveEvent(QMouseEvent* e) override;
    void mouseReleaseEvent(QMouseEvent* e) override;

private:
    void rebuildSource();

    lg::Scene scene_;
    lg::GlRenderer renderer_;
    QString shaderPath_;
    QImage source_;
    bool userSource_ = false;
    QElapsedTimer clock_;
    lg::Vec2 light_;
    int dragId_ = -1;
    float dx_ = 0, dy_ = 0;
};

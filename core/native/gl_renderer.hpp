#pragma once
#include "liquidglass/scene.hpp"
#include <string>

namespace lg {

// OpenGL 3.3 chizuvchi: veb versiya (renderer.js) bilan bir xil ikki o'tish va bir xil shader (core/shaders/liquidglass.frag).
// Orqa qatlam -> FBO, oldingi qatlam FBO'ni sindirib ekranga (yoki joriy FBO'ga) chiziladi.
class GlRenderer {
public:
    ~GlRenderer();

    // fragPath: liquidglass.frag yo'li. lg::gl::load() oldindan chaqirilgan bo'lishi kerak.
    bool init(const std::string& fragPath, std::string& err);
    void resize(int fbW, int fbH);                                   // framebuffer pikselda
    void setSource(const unsigned char* rgba, int w, int h);          // sindiriladigan sahna (tepa qatordan boshlab)
    // dpr: framebuffer / mantiqiy piksel. light: -1..1 (kursor holati). target: chiziladigan FBO (0 = ekran)
    void render(const Scene& scene, float dpr, Vec2 light, unsigned target = 0);

private:
    void setPass(const PassUniforms& u);

    unsigned prog_ = 0, vao_ = 0, sceneTex_ = 0, fbTex_ = 0, fbo_ = 0;
    int w_ = 0, h_ = 0;
    int loc_[40] = {};
};

}  // namespace lg

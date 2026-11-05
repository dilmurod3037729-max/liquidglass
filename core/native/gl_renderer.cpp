#include "gl_renderer.hpp"
#include "gl_loader.hpp"
#include <fstream>
#include <sstream>
#include <vector>

namespace lg {

namespace {

// shader'dagi uniform nomlari (tartib U enum bilan mos)
enum U { Bg, Shapes, Count_, Res, Dpr, Merge, Flip, ShadowK, ShadowOff, SpecMul, ThickMul, ExtraLod, Light,
         IOR, Thick, Bevel, Disp, Blur, Spec, Abs, Count };
const char* kNames[Count] = {"uBg", "uShapes", "uCount", "uRes", "uDpr", "uMerge", "uFlip",
                             "uShadowK", "uShadowOff", "uSpecMul", "uThickMul", "uExtraLod", "uLight",
                             "uIOR", "uThick", "uBevel", "uDisp", "uBlur", "uSpec", "uAbs"};

const char* kVertex = R"(#version 330 core
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
})";

std::string readFile(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

unsigned compile(unsigned type, const std::string& src, std::string& err) {
    const unsigned s = gl::CreateShader(type);
    const char* p = src.c_str();
    gl::ShaderSource(s, 1, &p, nullptr);
    gl::CompileShader(s);
    int ok = 0;
    gl::GetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        int n = 0;
        gl::GetShaderiv(s, GL_INFO_LOG_LENGTH, &n);
        std::vector<char> log(n > 1 ? n : 1);
        gl::GetShaderInfoLog(s, n, nullptr, log.data());
        err = std::string("shader: ") + log.data();
        return 0;
    }
    return s;
}

void texParams(unsigned tex, bool mip) {
    glBindTexture(GL_TEXTURE_2D, tex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, mip ? GL_LINEAR_MIPMAP_LINEAR : GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

}  // namespace

GlRenderer::~GlRenderer() {
    if (fbo_) gl::DeleteFramebuffers(1, &fbo_);
    if (prog_) gl::DeleteProgram(prog_);
    if (sceneTex_) glDeleteTextures(1, &sceneTex_);
    if (fbTex_) glDeleteTextures(1, &fbTex_);
    if (shapesTex_) glDeleteTextures(1, &shapesTex_);
}

bool GlRenderer::init(const std::string& fragPath, std::string& err) {
    std::string fs = readFile(fragPath);
    if (fs.empty()) { err = "shader fayli o'qilmadi: " + fragPath; return false; }
    // Veb (GLSL ES 3.0) manbasi ish stoli 3.3 core uchun: faqat versiya qatori farq qiladi
    const std::string es = "#version 300 es";
    const size_t at = fs.find(es);
    if (at == std::string::npos) { err = "shader: #version 300 es topilmadi"; return false; }
    fs.replace(at, es.size(), "#version 330 core");

    const unsigned v = compile(GL_VERTEX_SHADER, kVertex, err);
    const unsigned f = v ? compile(GL_FRAGMENT_SHADER, fs, err) : 0;
    if (!v || !f) return false;
    prog_ = gl::CreateProgram();
    gl::AttachShader(prog_, v);
    gl::AttachShader(prog_, f);
    gl::LinkProgram(prog_);
    int ok = 0;
    gl::GetProgramiv(prog_, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[1024] = {};
        gl::GetProgramInfoLog(prog_, 1023, nullptr, log);
        err = std::string("link: ") + log;
        return false;
    }
    gl::DeleteShader(v);
    gl::DeleteShader(f);
    for (int i = 0; i < Count; i++) loc_[i] = gl::GetUniformLocation(prog_, kNames[i]);

    gl::GenVertexArrays(1, &vao_);
    glGenTextures(1, &sceneTex_);
    glGenTextures(1, &fbTex_);
    glGenTextures(1, &shapesTex_);
    glBindTexture(GL_TEXTURE_2D, shapesTex_);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    gl::GenFramebuffers(1, &fbo_);
    texParams(sceneTex_, true);
    texParams(fbTex_, true);
    return true;
}

void GlRenderer::resize(int fbW, int fbH) {
    w_ = fbW;
    h_ = fbH;
    glBindTexture(GL_TEXTURE_2D, fbTex_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w_, h_, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    gl::BindFramebuffer(GL_FRAMEBUFFER, fbo_);
    gl::FramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, fbTex_, 0);
    gl::BindFramebuffer(GL_FRAMEBUFFER, 0);
}

void GlRenderer::setSource(const unsigned char* rgba, int w, int h) {
    glBindTexture(GL_TEXTURE_2D, sceneTex_);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
    gl::GenerateMipmap(GL_TEXTURE_2D);
}

void GlRenderer::setPass(const PassUniforms& u) {
    // shakllar: RGBA32F tekstura (4 x count), 2-birlikda
    gl::ActiveTexture(GL_TEXTURE0 + 2);
    glBindTexture(GL_TEXTURE_2D, shapesTex_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA32F, 4, u.count > 0 ? u.count : 1, 0, GL_RGBA, GL_FLOAT, u.shapes);
    gl::ActiveTexture(GL_TEXTURE0);
    gl::Uniform1i(loc_[Shapes], 2);
    gl::Uniform1i(loc_[Count_], u.count);
    gl::Uniform1f(loc_[Merge], u.merge);
    gl::Uniform1f(loc_[Flip], u.flip);
    gl::Uniform1f(loc_[ShadowK], u.shadowK);
    gl::Uniform1f(loc_[ShadowOff], u.shadowOff);
    gl::Uniform1f(loc_[SpecMul], u.specMul);
    gl::Uniform1f(loc_[ThickMul], u.thickMul);
    gl::Uniform1f(loc_[ExtraLod], u.extraLod);
    glDrawArrays(GL_TRIANGLES, 0, 3);
}

void GlRenderer::render(const Scene& scene, float dpr, Vec2 light, unsigned target) {
    const Params& p = scene.params;
    glDisable(GL_BLEND);
    glDisable(GL_DEPTH_TEST);
    glViewport(0, 0, w_, h_);
    gl::UseProgram(prog_);
    gl::BindVertexArray(vao_);
    gl::Uniform1i(loc_[Bg], 0);
    gl::Uniform2f(loc_[Res], float(w_), float(h_));
    gl::Uniform1f(loc_[Dpr], dpr);
    gl::Uniform2f(loc_[Light], light.x, light.y);
    gl::Uniform1f(loc_[IOR], p.ior);
    gl::Uniform1f(loc_[Thick], p.thick);
    gl::Uniform1f(loc_[Bevel], p.bevel);
    gl::Uniform1f(loc_[Disp], p.disp);
    gl::Uniform1f(loc_[Blur], p.blur);
    gl::Uniform1f(loc_[Spec], p.spec);
    gl::Uniform1f(loc_[Abs], p.absorb);

    // 1-o'tish: sahna + orqadagi shakllar -> FBO
    gl::BindFramebuffer(GL_FRAMEBUFFER, fbo_);
    gl::ActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, sceneTex_);
    setPass(scene.pack(Pass::Back, dpr));
    glBindTexture(GL_TEXTURE_2D, fbTex_);
    gl::GenerateMipmap(GL_TEXTURE_2D);
    // 2-o'tish: FBO + oldingi shisha -> maqsad
    gl::BindFramebuffer(GL_FRAMEBUFFER, target);
    setPass(scene.pack(Pass::Front, dpr));
}

}  // namespace lg

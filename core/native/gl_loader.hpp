#pragma once
// Minimal OpenGL 3.3 yuklovchi (glad kerak emas): faqat chizuvchiga kerak bo'lgan funksiyalar.
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif
#include <GL/gl.h>

#ifndef APIENTRY
#define APIENTRY
#endif
// Konstantalar alohida-alohida (Qt/GLFW sarlavhalari ba'zilarini o'zi aniqlagan bo'lishi mumkin)
#ifndef GL_FRAMEBUFFER
#define GL_FRAMEBUFFER 0x8D40
#endif
#ifndef GL_COLOR_ATTACHMENT0
#define GL_COLOR_ATTACHMENT0 0x8CE0
#endif
#ifndef GL_FRAMEBUFFER_COMPLETE
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
#endif
#ifndef GL_TEXTURE0
#define GL_TEXTURE0 0x84C0
#endif
#ifndef GL_FRAGMENT_SHADER
#define GL_FRAGMENT_SHADER 0x8B30
#endif
#ifndef GL_VERTEX_SHADER
#define GL_VERTEX_SHADER 0x8B31
#endif
#ifndef GL_COMPILE_STATUS
#define GL_COMPILE_STATUS 0x8B81
#endif
#ifndef GL_LINK_STATUS
#define GL_LINK_STATUS 0x8B82
#endif
#ifndef GL_INFO_LOG_LENGTH
#define GL_INFO_LOG_LENGTH 0x8B84
#endif
#ifndef GL_CLAMP_TO_EDGE
#define GL_CLAMP_TO_EDGE 0x812F
#endif
#ifndef GL_RGBA8
#define GL_RGBA8 0x8058
#endif
#ifndef GL_RGBA32F
#define GL_RGBA32F 0x8814
#endif
#ifndef GL_R32F
#define GL_R32F 0x822E
#endif
#ifndef GL_RED
#define GL_RED 0x1903
#endif
#ifndef GL_VERSION_2_0
typedef char GLchar;
#endif

namespace lg::gl {

#define LG_GL_FUNCS(X)                                                  \
    X(GLuint, CreateShader, (GLenum))                                   \
    X(void, ShaderSource, (GLuint, GLsizei, const GLchar* const*, const GLint*)) \
    X(void, CompileShader, (GLuint))                                    \
    X(void, GetShaderiv, (GLuint, GLenum, GLint*))                      \
    X(void, GetShaderInfoLog, (GLuint, GLsizei, GLsizei*, GLchar*))     \
    X(GLuint, CreateProgram, ())                                        \
    X(void, AttachShader, (GLuint, GLuint))                             \
    X(void, LinkProgram, (GLuint))                                      \
    X(void, GetProgramiv, (GLuint, GLenum, GLint*))                     \
    X(void, GetProgramInfoLog, (GLuint, GLsizei, GLsizei*, GLchar*))    \
    X(void, UseProgram, (GLuint))                                       \
    X(GLint, GetUniformLocation, (GLuint, const GLchar*))               \
    X(void, Uniform1i, (GLint, GLint))                                  \
    X(void, Uniform1f, (GLint, GLfloat))                                \
    X(void, Uniform2f, (GLint, GLfloat, GLfloat))                       \
    X(void, Uniform1fv, (GLint, GLsizei, const GLfloat*))               \
    X(void, Uniform4fv, (GLint, GLsizei, const GLfloat*))               \
    X(void, GenVertexArrays, (GLsizei, GLuint*))                        \
    X(void, BindVertexArray, (GLuint))                                  \
    X(void, GenFramebuffers, (GLsizei, GLuint*))                        \
    X(void, BindFramebuffer, (GLenum, GLuint))                          \
    X(void, FramebufferTexture2D, (GLenum, GLenum, GLenum, GLuint, GLint)) \
    X(GLenum, CheckFramebufferStatus, (GLenum))                         \
    X(void, GenerateMipmap, (GLenum))                                   \
    X(void, ActiveTexture, (GLenum))                                    \
    X(void, DeleteFramebuffers, (GLsizei, const GLuint*))               \
    X(void, DeleteProgram, (GLuint))                                    \
    X(void, DeleteShader, (GLuint))

#define LG_DECL(R, N, A) inline R(APIENTRY* N) A = nullptr;
LG_GL_FUNCS(LG_DECL)
#undef LG_DECL

// getProc: kontekstdan funksiya manzilini oluvchi funksiya (glfwGetProcAddress, QOpenGLContext::getProcAddress, ...).
using GetProc = void* (*)(const char*);

inline bool load(GetProc get) {
    bool ok = true;
#define LG_LOAD(R, N, A)                                                       \
    N = reinterpret_cast<R(APIENTRY*) A>(get("gl" #N));                        \
    ok = ok && N != nullptr;
    LG_GL_FUNCS(LG_LOAD)
#undef LG_LOAD
    return ok;
}

}  // namespace lg::gl

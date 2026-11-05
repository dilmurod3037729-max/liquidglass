#pragma once
// Minimal OpenGL 3.3 yuklovchi (glad kerak emas): faqat chizuvchiga kerak bo'lgan funksiyalar.
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif
#ifndef GLFW_INCLUDE_NONE
#define GLFW_INCLUDE_NONE
#endif
#include <GLFW/glfw3.h>
#include <GL/gl.h>

#ifndef APIENTRY
#define APIENTRY
#endif
#ifndef GL_FRAMEBUFFER
#define GL_FRAMEBUFFER 0x8D40
#define GL_COLOR_ATTACHMENT0 0x8CE0
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
#define GL_TEXTURE0 0x84C0
#define GL_FRAGMENT_SHADER 0x8B30
#define GL_VERTEX_SHADER 0x8B31
#define GL_COMPILE_STATUS 0x8B81
#define GL_LINK_STATUS 0x8B82
#define GL_INFO_LOG_LENGTH 0x8B84
#define GL_CLAMP_TO_EDGE 0x812F
#define GL_RGBA8 0x8058
#define GL_RGBA32F 0x8814
#define GL_R32F 0x822E
#define GL_RED 0x1903
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

inline bool load() {
    bool ok = true;
#define LG_LOAD(R, N, A)                                                       \
    N = reinterpret_cast<R(APIENTRY*) A>(glfwGetProcAddress("gl" #N));         \
    ok = ok && N != nullptr;
    LG_GL_FUNCS(LG_LOAD)
#undef LG_LOAD
    return ok;
}

}  // namespace lg::gl

// Native namuna: GLFW oyna + OpenGL 3.3 chizuvchi + Dear ImGui sozlash paneli. Yadro (lg::Scene) va shader veb bilan bir xil.
//   native_demo                    interaktiv (shakllarni sudrang, panelda sozlang)
//   native_demo --shot out.png     oynasiz: skriptlangan sudrash, so'ng skrinshot (test uchun)
#include "../gl_loader.hpp"
#ifndef GLFW_INCLUDE_NONE
#define GLFW_INCLUDE_NONE
#endif
#include <GLFW/glfw3.h>
#include "../gl_renderer.hpp"
#include "png_write.hpp"
#include "scene_art.hpp"

#include "backends/imgui_impl_glfw.h"
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#ifndef LG_SHADER_PATH
#define LG_SHADER_PATH "liquidglass.frag"
#endif

namespace {

struct App {
    lg::Scene scene;
    lg::Vec2 light;
    int dragId = -1;
    float dx = 0, dy = 0;
    int card = 0;
} app;

void mouseButton(GLFWwindow* w, int button, int action, int) {
    if (ImGui::GetIO().WantCaptureMouse || button != GLFW_MOUSE_BUTTON_LEFT) return;
    double x, y;
    glfwGetCursorPos(w, &x, &y);
    if (action == GLFW_PRESS) {
        const int id = app.scene.hit({float(x), float(y)});
        if (id < 0) return;
        const lg::Vec2 p = app.scene.position(id);
        app.scene.focus(id);
        app.scene.setPressed(id, true);
        app.dragId = id;
        app.dx = float(x) - p.x;
        app.dy = float(y) - p.y;
    } else if (app.dragId >= 0) {
        app.scene.setPressed(app.dragId, false);
        app.dragId = -1;
    }
}

void cursorPos(GLFWwindow* w, double x, double y) {
    int ww, wh;
    glfwGetWindowSize(w, &ww, &wh);
    app.light = {float(x / ww - 0.5) * 2, float(y / wh - 0.5) * 2};
    if (app.dragId >= 0) app.scene.setTarget(app.dragId, {float(x) - app.dx, float(y) - app.dy});
}

void buildScene(int ww, int wh) {
    app.scene = lg::Scene();
    app.scene.params.elastic = 0;   // toza qattiq oyna (veb demo bilan bir xil)
    const float by = wh - 127.0f;
    app.card = app.scene.add({280, 170, 40, true}, {ww * 0.30f, wh * 0.40f});
    app.scene.add({220, 58, 29, true}, {ww * 0.62f, wh * 0.30f});
    app.scene.add({64, 64, 32, true}, {ww * 0.82f, wh * 0.62f});
    const int ok = app.scene.add({150, 52, 26, false}, {ww / 2.0f - 100, by});
    const int cancel = app.scene.add({150, 52, 26, false}, {ww / 2.0f + 100, by});
    app.scene.setTint(ok, 0.15f, 0.65f, 0.35f, 0.4f);      // yashil "Tayyor"
    app.scene.setTint(cancel, 0.85f, 0.2f, 0.25f, 0.4f);   // qizil "Bekor"
}

void panel(float fps) {
    ImGui::SetNextWindowPos(ImVec2(float(ImGui::GetIO().DisplaySize.x) - 290, 12), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(278, 0), ImGuiCond_Always);
    ImGui::Begin("Oyna sozlamalari", nullptr, ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove);
    lg::Params& p = app.scene.params;
    ImGui::SliderFloat("Sinish (IOR)", &p.ior, 1.1f, 2.0f);
    ImGui::SliderFloat("Qalinlik", &p.thick, 0, 160);
    ImGui::SliderFloat("Chet kengligi", &p.bevel, 8, 90);
    ImGui::SliderFloat("Dispersiya", &p.disp, 0, 0.15f);
    ImGui::SliderFloat("Blur", &p.blur, 0, 4);
    ImGui::SliderFloat("Qo'shilish", &p.merge, 0, 120);
    ImGui::SliderFloat("Cho'zilish", &p.elastic, 0, 2.5f);
    ImGui::SliderFloat("Yaltirash", &p.spec, 0, 2);
    ImGui::SliderFloat("Yutilish", &p.absorb, 0, 2);
    if (ImGui::Button("Boshlang'ich")) { p = lg::Params(); p.elastic = 0; }
    ImGui::Separator();
    ImGui::Text("Shakllar: rang (a = kuch) va qatlam");
    static const char* kNames[] = {"Karta", "Kapsula", "Nuqta", "Tayyor", "Bekor"};
    for (int i = 0; i < app.scene.count() && i < 5; i++) {
        ImGui::PushID(i);
        float c[4];
        std::memcpy(c, app.scene.tint(i), sizeof c);
        if (ImGui::ColorEdit4(kNames[i], c, ImGuiColorEditFlags_NoInputs | ImGuiColorEditFlags_AlphaBar | ImGuiColorEditFlags_AlphaPreview))
            app.scene.setTint(i, c[0], c[1], c[2], c[3]);
        if (i < 3) { ImGui::SameLine(); if (ImGui::SmallButton("Oldinga")) app.scene.focus(i); }
        ImGui::PopID();
    }
    ImGui::Text("%.0f FPS", fps);
    ImGui::End();
}

}  // namespace

int main(int argc, char** argv) {
    std::string shot;
    for (int i = 1; i + 1 < argc; i++) if (!std::strcmp(argv[i], "--shot")) shot = argv[i + 1];

    if (!glfwInit()) { std::fprintf(stderr, "glfw init xato\n"); return 1; }
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    glfwWindowHint(GLFW_VISIBLE, shot.empty() ? GLFW_TRUE : GLFW_FALSE);
    GLFWwindow* win = glfwCreateWindow(1280, 800, "liquidglass native", nullptr, nullptr);
    if (!win) { std::fprintf(stderr, "oyna yaratilmadi (OpenGL 3.3 kerak)\n"); return 1; }
    glfwMakeContextCurrent(win);
    glfwSwapInterval(1);
    if (!lg::gl::load([](const char* n) { return reinterpret_cast<void*>(glfwGetProcAddress(n)); })) { std::fprintf(stderr, "OpenGL funksiyalari yuklanmadi\n"); return 1; }
    std::printf("GL: %s | %s\n", glGetString(GL_RENDERER), glGetString(GL_VERSION));

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGui::StyleColorsDark();
    ImGui_ImplGlfw_InitForOpenGL(win, true);
    ImGui_ImplOpenGL3_Init("#version 330");
    glfwSetMouseButtonCallback(win, [](GLFWwindow* w, int b, int a, int m) { ImGui_ImplGlfw_MouseButtonCallback(w, b, a, m); mouseButton(w, b, a, m); });
    glfwSetCursorPosCallback(win, [](GLFWwindow* w, double x, double y) { ImGui_ImplGlfw_CursorPosCallback(w, x, y); cursorPos(w, x, y); });

    lg::GlRenderer renderer;
    std::string err;
    if (!renderer.init(LG_SHADER_PATH, err)) { std::fprintf(stderr, "chizuvchi: %s\n", err.c_str()); return 1; }

    int ww, wh, fw = 0, fh = 0;
    glfwGetWindowSize(win, &ww, &wh);
    buildScene(ww, wh);

    double last = glfwGetTime(), fpsT = last;
    int frames = 0, frame = 0;
    float fps = 0;
    while (!glfwWindowShouldClose(win)) {
        glfwPollEvents();
        const double now = glfwGetTime();
        const float dt = float(now - last);
        last = now;

        int nfw, nfh;
        glfwGetFramebufferSize(win, &nfw, &nfh);
        glfwGetWindowSize(win, &ww, &wh);
        if (nfw != fw || nfh != fh) {
            fw = nfw; fh = nfh;
            renderer.resize(fw, fh);
            const art::Img im = art::make(fw, fh, float(fw) / float(ww));
            renderer.setSource(im.px.data(), im.w, im.h);
        }

        if (!shot.empty()) {   // skriptlangan sudrash: kartani o'ngga tez tortamiz
            if (frame == 5) { app.scene.focus(app.card); app.scene.setPressed(app.card, true); }
            if (frame >= 5 && frame <= 45) app.scene.setTarget(app.card, {ww * 0.30f + (frame - 5) * 14.0f, wh * 0.40f + (frame - 5) * 2.0f});
            if (frame == 46) app.scene.setPressed(app.card, false);
        }
        app.scene.step(shot.empty() ? dt : 1.0f / 60.0f);
        renderer.render(app.scene, float(fw) / float(ww), app.light);

        ImGui_ImplOpenGL3_NewFrame();
        ImGui_ImplGlfw_NewFrame();
        ImGui::NewFrame();
        panel(fps);
        ImGui::Render();
        ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());

        if (!shot.empty() && frame == 60) {
            std::vector<unsigned char> px(size_t(fw) * fh * 4), flipped(px.size());
            glReadPixels(0, 0, fw, fh, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
            for (int y = 0; y < fh; y++) std::memcpy(&flipped[size_t(y) * fw * 4], &px[size_t(fh - 1 - y) * fw * 4], size_t(fw) * 4);
            for (size_t i = 3; i < flipped.size(); i += 4) flipped[i] = 255;
            std::printf(pngw::write(shot.c_str(), flipped.data(), fw, fh) ? "skrinshot: %s (%dx%d)\n" : "yozilmadi: %s\n", shot.c_str(), fw, fh);
            break;
        }
        glfwSwapBuffers(win);
        frame++; frames++;
        if (now - fpsT >= 0.5) { fps = float(frames / (now - fpsT)); frames = 0; fpsT = now; }
    }

    ImGui_ImplOpenGL3_Shutdown();
    ImGui_ImplGlfw_Shutdown();
    ImGui::DestroyContext();
    glfwDestroyWindow(win);
    glfwTerminate();
    return 0;
}

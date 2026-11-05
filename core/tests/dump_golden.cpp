// Oltin test: C++ yadro natijalarini JSON qilib chiqaradi. web/tests/golden.test.js shuni JS bilan solishtiradi.
#include "liquidglass/scene.hpp"
#include <cstdio>

using namespace lg;

int main() {
    Scene s;
    const int a = s.add({280, 170, 40, true}, {300, 300});
    const int b = s.add({220, 58, 29, true}, {700, 300});
    s.add({150, 52, 26, false}, {500, 600});
    s.setTarget(a, {420, 380});
    s.setPressed(a, true);
    std::printf("[");
    for (int f = 0; f < 90; f++) {
        if (f == 20) s.setTarget(b, {520, 330});
        if (f == 40) { s.setPressed(a, false); s.focus(b); }
        s.step(1.0f / 60.0f);
        if (f % 10 == 9) {
            const PassUniforms u = s.pack(Pass::Front, 1.0f);
            std::printf("%s{\"f\":%d,\"ax\":%.6f,\"ay\":%.6f,\"bx\":%.6f,\"by\":%.6f,\"sa\":%.6f,\"sb\":%.6f,\"da\":%.6f,\"sdf\":%.6f,\"rect1\":%.6f,\"tail1\":%.6f,\"k1\":%.6f}",
                        f == 9 ? "" : ",", f, s.position(a).x, s.position(a).y, s.position(b).x, s.position(b).y,
                        s.scale(a), s.scale(b), s.depth(a), s.sdf({480, 340}, Pass::Front), u.rect(1)[0], u.tail(1)[0], u.k(1));
        }
    }
    std::printf("]\n");
    return 0;
}

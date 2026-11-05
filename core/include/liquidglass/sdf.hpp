#pragma once
#include <algorithm>
#include <cmath>

namespace lg {

inline float sdRoundRect(float px, float py, float hw, float hh, float r) {
    const float qx = std::fabs(px) - hw + r, qy = std::fabs(py) - hh + r;
    return std::min(std::max(qx, qy), 0.0f) + std::hypot(std::max(qx, 0.0f), std::max(qy, 0.0f)) - r;
}

// Polinomial silliq minimum — shaderdagi smin bilan bir xil (suyuqdek qo'shilish)
inline float smin(float a, float b, float k) {
    const float h = std::max(k - std::fabs(a - b), 0.0f) / k;
    return std::min(a, b) - h * h * k * 0.25f;
}

inline float smoothstep(float e0, float e1, float x) {
    const float t = std::min(std::max((x - e0) / (e1 - e0), 0.0f), 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

}  // namespace lg

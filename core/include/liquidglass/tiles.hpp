#pragma once
#include "types.hpp"
#include <algorithm>
#include <cmath>
#include <vector>

namespace lg {

// Bo'laklar (tile) bo'yicha yaqin shakllar ro'yxati (web/src/tiles.js bilan bir xil algoritm).
// data: gw*gh qator, har qator cap+1 float: [0] = shakllar soni (-1 = to'lib ketdi), [1..] = shakl indekslari.
struct TileGrid {
    int gw = 0, gh = 0, cap = 64, tile = 32;
    std::vector<float> data;
};

inline TileGrid buildTiles(const PassUniforms& pass, int W, int H, float dpr, int tile = 32, int cap = 64) {
    TileGrid g;
    g.tile = tile; g.cap = cap;
    g.gw = (W + tile - 1) / tile; g.gh = (H + tile - 1) / tile;
    const int width = cap + 1;
    g.data.assign(size_t(g.gw) * g.gh * width, 0.0f);
    std::vector<int> counts(size_t(g.gw) * g.gh, 0);
    const float margin = 80.0f * dpr + pass.merge;   // soya, kaustika va qo'shilish masofasi
    for (int j = 0; j < pass.count; j++) {
        const float* o = pass.shapes + j * 16;
        const float reach = o[9], stretch = o[11];
        const float ext = margin + (stretch > 0.5f ? reach * 1.3f + 0.5f * std::max(o[2], o[3]) : 0.0f);
        const int x0 = std::max(0, int(std::floor((o[0] - o[2] - ext) / tile))), x1 = std::min(g.gw - 1, int(std::floor((o[0] + o[2] + ext) / tile)));
        const int y0 = std::max(0, int(std::floor((o[1] - o[3] - ext) / tile))), y1 = std::min(g.gh - 1, int(std::floor((o[1] + o[3] + ext) / tile)));
        for (int ty = y0; ty <= y1; ty++)
            for (int tx = x0; tx <= x1; tx++) {
                const int id = ty * g.gw + tx;
                int& n = counts[id];
                if (n < 0) continue;
                if (n >= cap) { n = -1; continue; }
                g.data[size_t(id) * width + 1 + n] = float(j);
                n++;
            }
    }
    for (int id = 0; id < g.gw * g.gh; id++) g.data[size_t(id) * width] = float(counts[id]);
    return g;
}

}  // namespace lg

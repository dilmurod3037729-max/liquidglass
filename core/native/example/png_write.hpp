#pragma once
// Kutubxonasiz minimal PNG yozuvchi (siqishsiz "stored" bloklar): skrinshot uchun yetarli.
#include <cstdint>
#include <cstdio>
#include <vector>

namespace pngw {

inline uint32_t crc32(const uint8_t* d, size_t n, uint32_t crc = 0xFFFFFFFFu) {
    static uint32_t table[256];
    static bool init = false;
    if (!init) {
        for (uint32_t i = 0; i < 256; i++) { uint32_t c = i; for (int k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320u ^ (c >> 1) : c >> 1; table[i] = c; }
        init = true;
    }
    for (size_t i = 0; i < n; i++) crc = table[(crc ^ d[i]) & 0xFF] ^ (crc >> 8);
    return crc;
}

inline void be32(std::vector<uint8_t>& v, uint32_t x) { v.push_back(x >> 24); v.push_back(x >> 16); v.push_back(x >> 8); v.push_back(x); }

inline void chunk(FILE* f, const char* type, const std::vector<uint8_t>& data) {
    std::vector<uint8_t> b;
    be32(b, uint32_t(data.size()));
    b.insert(b.end(), type, type + 4);
    b.insert(b.end(), data.begin(), data.end());
    const uint32_t c = ~crc32(b.data() + 4, b.size() - 4);
    be32(b, c);
    fwrite(b.data(), 1, b.size(), f);
}

// rgba: tepa qatordan boshlab, w*h*4 bayt
inline bool write(const char* path, const uint8_t* rgba, int w, int h) {
    FILE* f = fopen(path, "wb");
    if (!f) return false;
    const uint8_t sig[8] = {0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    fwrite(sig, 1, 8, f);
    std::vector<uint8_t> ihdr;
    be32(ihdr, w); be32(ihdr, h);
    ihdr.insert(ihdr.end(), {8, 6, 0, 0, 0});
    chunk(f, "IHDR", ihdr);

    std::vector<uint8_t> raw;   // har qator oldida filtr bayti 0
    raw.reserve(size_t(h) * (size_t(w) * 4 + 1));
    for (int y = 0; y < h; y++) { raw.push_back(0); raw.insert(raw.end(), rgba + size_t(y) * w * 4, rgba + size_t(y + 1) * w * 4); }

    std::vector<uint8_t> z = {0x78, 0x01};
    uint32_t a = 1, b = 0;
    for (uint8_t c : raw) { a = (a + c) % 65521; b = (b + a) % 65521; }
    for (size_t pos = 0; pos < raw.size();) {
        const size_t n = raw.size() - pos < 65535 ? raw.size() - pos : 65535;
        z.push_back(pos + n >= raw.size() ? 1 : 0);
        z.push_back(n & 0xFF); z.push_back(n >> 8); z.push_back(~n & 0xFF); z.push_back((~n >> 8) & 0xFF);
        z.insert(z.end(), raw.begin() + pos, raw.begin() + pos + n);
        pos += n;
    }
    be32(z, (b << 16) | a);
    chunk(f, "IDAT", z);
    chunk(f, "IEND", {});
    fclose(f);
    return true;
}

}  // namespace pngw

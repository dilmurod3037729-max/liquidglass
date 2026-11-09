// lgwin.h: a live liquid glass layer (Windows 10/11, GPU). C API for any language or window toolkit (Win32, Qt, WPF, WinForms, Electron...).
// Link with lgwin.lib; lgwin.dll must sit next to your executable at run time.
#pragma once
#include <windows.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifdef LGWIN_BUILD
#define LGWIN_API __declspec(dllexport)
#else
#define LGWIN_API __declspec(dllimport)
#endif

// Shape: coordinates are measured from the start of the window's client area, in REAL pixels (logical pixels * DPI scale).
typedef struct LGShape {
    float cx, cy;          // centre
    float hw, hh;          // half width / half height
    float radius;          // corner radius (pixels)
    float bevel;           // rim width multiplier (1 = default). NEGATIVE = "clear inside": the rim is a lens, the centre is clear
    float thick;           // thickness multiplier (1 = default). NEGATIVE = "frame": the centre is transparent, only the rim is glass
    float reserved;        // keep 0
    float r, g, b, a;      // tint (0..1) and strength: a = 0 clear glass, a > 0 tinted glass
} LGShape;

// Global parameters (in logical pixels; the glass multiplies by the DPI scale itself, except merge).
typedef struct LGParams {
    float ior;             // index of refraction (1.55)
    float thick;           // glass thickness (40)
    float bevel;           // rim width (26)
    float dispersion;      // colour separation (0.04)
    float blur;            // haze (0.35)
    float specular;        // specular strength (1.1)
    float absorb;          // absorption (0.2)
    float merge;           // radius within which shapes merge like liquid, REAL pixels (1 * dpr)
    float shadow;          // shadow strength (0.45)
    float shadowOffset;    // shadow offset (26)
    float extraLod;        // extra blur (0.7)
    float dpr;             // DPI scale (1.0, 1.5, 2.0...)
} LGParams;

// target: the HWND of the window the glass layer is attached to.
// under = 0: the glass is OVER the window (choose this if the window is opaque; mouse and keyboard pass through to what is underneath).
// under = 1: the glass is UNDER the window. The window must be almost invisible (setWindowOpacity ~0.02); text and buttons are supplied with lg_set_content.
// visible = 1 (default): the window is not hidden from screenshots; the centre is transparent and only the refracting rim is drawn. visible = 0: the old way (hidden from capture).
LGWIN_API void* lg_create3(HWND target, int under, int visible);
LGWIN_API void* lg_create2(HWND target, int under);
LGWIN_API void* lg_create(HWND target);   // = lg_create2(target, 0)
LGWIN_API void  lg_destroy(void* h);

// Replaces all shapes (calling it again is cheap, so it can be called every frame when needed). At most 256 shapes.
LGWIN_API void  lg_set(void* h, const float* params12, int nparams, const float* shapes, int count);
LGWIN_API void  lg_light(void* h, float x, float y);   // light direction, -1..1 (for example following the cursor)

// Diagnostics
LGWIN_API int   lg_dump(void* h, const wchar_t* bmpPath);                 // writes the glass layer to a .bmp (a screenshot does not show it)
LGWIN_API void  lg_info(void* h, long* frames, long* updates, int* lastFrameMicroseconds);
LGWIN_API void  lg_error(void* h, int* stage, long* hresult);              // stage 0 = no error
LGWIN_API int   lg_set_content_rect(void* h, const uint8_t* bgra, int x, int y, int w, int hgt, int stride);   // updates part of the content (lg_set_content must have been called first); returns 0 = upload everything
LGWIN_API unsigned long long lg_beat();   // render-thread liveness counter (for watchdogs)

#ifdef __cplusplus
}

inline LGParams lgDefaultParams(float dpr = 1.0f) {
    return LGParams{ 1.55f, 40.f, 26.f, 0.04f, 0.35f, 1.1f, 0.2f, 1.0f * dpr, 0.45f, 26.f, 0.7f, dpr };
}
inline LGShape lgRect(float x, float y, float w, float h, float radius, float dpr = 1.0f) {   // logical pixels -> real pixels
    return LGShape{ (x + w / 2) * dpr, (y + h / 2) * dpr, w / 2 * dpr, h / 2 * dpr, radius * dpr, 1.f, 1.f, 0.f, 0.f, 0.f, 0.f, 0.f };
}
inline void lgSet(void* h, const LGParams& p, const LGShape* shapes, int n) {
    lg_set(h, reinterpret_cast<const float*>(&p), 12, reinterpret_cast<const float*>(shapes), n);
}
#endif

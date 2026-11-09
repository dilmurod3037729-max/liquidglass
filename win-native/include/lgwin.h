// lgwin.h: suyuq shisha qatlami (Windows 10/11, GPU). C API: istalgan til va oyna kutubxonasi (Win32, Qt, WPF, WinForms, Electron...) uchun.
// Ulash: lgwin.lib bilan bog'lang, ishga tushirishda lgwin.dll yoningizda turishi kerak.
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

// Shakl: koordinatalar oyna ICHKI maydoni (client area) boshidan, HAQIQIY piksellarda (mantiqiy piksel * DPI masshtabi).
typedef struct LGShape {
    float cx, cy;          // markaz
    float hw, hh;          // yarim kenglik/balandlik
    float radius;          // burchak radiusi (piksel)
    float bevel;           // chet kengligi ko'paytiruvchisi (1 = standart). MANFIY = "tiniq ichki": qirrasi linza, markazi tiniq
    float thick;           // qalinlik ko'paytiruvchisi (1 = standart). MANFIY = "ramka": markazi shaffof, faqat qirra shisha
    float reserved;        // 0 bo'lsin
    float r, g, b, a;      // rang (0..1) va kuch: a = 0 tiniq shisha, a > 0 rangli shisha
} LGShape;

// Umumiy sozlamalar (mantiqiy piksellarda; shisha DPI'ga o'zi ko'paytiradi, merge bundan mustasno).
typedef struct LGParams {
    float ior;             // sinish ko'rsatkichi (1.55)
    float thick;           // shisha qalinligi (40)
    float bevel;           // chet kengligi (26)
    float dispersion;      // rang ajralishi (0.04)
    float blur;            // xiralik (0.35)
    float specular;        // yaltirash kuchi (1.1)
    float absorb;          // yutilish (0.2)
    float merge;           // shakllar suyuqdek qo'shilish radiusi, HAQIQIY piksel (1 * dpr)
    float shadow;          // soya kuchi (0.45)
    float shadowOffset;    // soya siljishi (26)
    float extraLod;        // qo'shimcha xiralik (0.7)
    float dpr;             // DPI masshtabi (1.0, 1.5, 2.0...)
} LGParams;

// target: shisha qatlami bog'lanadigan oynaning HWND'i.
// under = 0: shisha oyna USTIDA (oyna noshaffof bo'lsa shuni tanlang; sichqoncha va klaviatura ostiga o'tadi).
// under = 1: shisha oyna OSTIDA. Oyna deyarli ko'rinmas (setWindowOpacity ~0.02) bo'lishi kerak, matn va tugmalar lg_set_content bilan beriladi.
// visible = 1 (standart): oyna ekran suratidan yashirilmaydi; markazi shaffof, faqat sinadigan qirra chiziladi. visible = 0: eski usul (suratdan yashiriladi).
LGWIN_API void* lg_create3(HWND target, int under, int visible);
LGWIN_API void* lg_create2(HWND target, int under);
LGWIN_API void* lg_create(HWND target);   // = lg_create2(target, 0)
LGWIN_API void  lg_destroy(void* h);

// Barcha shakllarni almashtiradi (qayta chaqirish qimmat emas, kerak bo'lganda har kadr chaqirsa bo'ladi). Eng ko'pi 256 shakl.
LGWIN_API void  lg_set(void* h, const float* params12, int nparams, const float* shapes, int count);
LGWIN_API void  lg_light(void* h, float x, float y);   // yorug'lik yo'nalishi, -1..1 (masalan kursorga qarab)

// Diagnostika
LGWIN_API int   lg_dump(void* h, const wchar_t* bmpPath);                 // shisha qatlamini .bmp qilib yozadi (ekran surati uni ko'rsatmaydi)
LGWIN_API void  lg_info(void* h, long* frames, long* updates, int* lastFrameMicroseconds);
LGWIN_API void  lg_error(void* h, int* stage, long* hresult);              // stage 0 = xato yo'q
LGWIN_API int   lg_set_content_rect(void* h, const uint8_t* bgra, int x, int y, int w, int hgt, int stride);   // kontentning bir qismini yangilaydi (avval lg_set_content kerak); 0 = to'liq yuklang
LGWIN_API unsigned long long lg_beat();   // render oqimi tirikligi hisoblagichi (watchdog uchun)

#ifdef __cplusplus
}

inline LGParams lgDefaultParams(float dpr = 1.0f) {
    return LGParams{ 1.55f, 40.f, 26.f, 0.04f, 0.35f, 1.1f, 0.2f, 1.0f * dpr, 0.45f, 26.f, 0.7f, dpr };
}
inline LGShape lgRect(float x, float y, float w, float h, float radius, float dpr = 1.0f) {   // mantiqiy piksel -> haqiqiy piksel
    return LGShape{ (x + w / 2) * dpr, (y + h / 2) * dpr, w / 2 * dpr, h / 2 * dpr, radius * dpr, 1.f, 1.f, 0.f, 0.f, 0.f, 0.f, 0.f };
}
inline void lgSet(void* h, const LGParams& p, const LGShape* shapes, int n) {
    lg_set(h, reinterpret_cast<const float*>(&p), 12, reinterpret_cast<const float*>(shapes), n);
}
#endif

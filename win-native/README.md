# lgwin: Windows uchun native suyuq shisha (GPU)

Istalgan oynaning (HWND) ustiga yoki ostiga jonli suyuq shisha qatlami qo'yadi: orqadagi hamma narsa (boshqa oynalar, ish stoli, video)
shisha qirrasida sinadi, 60 fps. Til va oyna kutubxonasidan qat'i nazar: Win32, Qt, WPF, WinForms, Electron, Delphi, Rust.

- Orqa fon: DXGI Desktop Duplication, GPU teksturasi sifatida (CPU'ga tushmaydi, ekran o'zgarmasa kadr kelmaydi).
- Shisha: D3D11 pixel shader (`../core/shaders/liquidglass.frag` ning HLSL porti, `hlsl.inc`). Bir kadr ~0.05 ms (RTX 2080 SUPER).
- Chiqish: DirectComposition shaffof oyna, sichqoncha va klaviatura ostidagi ilovaga o'tadi.
- Talab: Windows 10 2004+ / Windows 11, Direct3D 11 GPU. Ko'p monitor bor, ammo bitta GPU.

## 10 daqiqada ulash

### C++
```cpp
#include "lgwin.h"                       // include/ ; lgwin.lib bilan bog'lang, lgwin.dll yoningizda
void* glass = lg_create2(hwnd, 0);       // 0: shisha oyna ustida
LGShape s[] = { lgRect(40, 40, 360, 220, 16, dpr), lgRect(60, 300, 130, 44, 14, dpr) };
s[0].bevel = -0.45f; s[0].thick = 0.3f;  // karta: qirrasi shisha, markazi tiniq
lgSet(glass, lgDefaultParams(dpr), s, 2);
// ... oyna yopilganda: lg_destroy(glass);
```
To'liq namuna: `samples/cpp/sample.cpp` (`build_sample.bat`).

### C# (WinForms / WPF)
```csharp
var glass = new GlassLayer(form.Handle) { Dpr = form.DeviceDpi / 96f };      // WPF: new WindowInteropHelper(win).Handle
glass.SetShapes(new[] { Shape.FromRect(40, 40, 360, 220, 16, glass.Dpr, bevel: -0.45f, thick: 0.3f) });
```
`dotnet/LiquidGlass.cs` ni loyihaga qo'shing. To'liq namuna: `samples/csharp` (`dotnet build`).

### Python / Qt
`python/liquidglass_qt.py`: `attach(window)` tugma, karta va jadvallarni o'zi topib shisha qiladi.

## Rejimlar

`lg_create3(hwnd, under, visible)` (`lg_create2` va `lg_create` `visible = 0` bilan ochadi):

| | `visible = 1` (Python standart) | `visible = 0` |
|---|---|---|
| Oyna ekran suratiga / yozuvga | **tushadi** (Windows'ning o'z oynalari kabi, hech narsa yashirilmaydi) | tushmaydi (`WDA_EXCLUDEFROMCAPTURE`) |
| Shisha ko'rinishi | markazi shaffof (tagi jonli), sinadigan qirra; `under = 1` da markaz Gauss xira (frost) ham bo'ladi | to'liq shisha |
| Orqa fon | shisha qirrasi egallagan joy nusxada yangilanmaydi (o'zini suratga olib buzmaslik uchun) | butun orqa fon jonli |

- `under = 0`: shisha oyna USTIDA. `under = 1`: shisha oyna OSTIDA, Qt/Win32 oynasi deyarli ko'rinmas (2% shaffoflik) kirish vositasi bo'lib, matn va tugmalar
  `lg_set_content` orqali shisha oynasida chiziladi.
- Oyna ichidagi ichma-ich shakllarda kichigi ustun. `bevel < 0` = «tiniq ichki», `thick < 0` = «ramka».
- Qt'ning per-pixel shaffof oynasi (`WA_TranslucentBackground`) Desktop Duplication'da qora chiqadi: `setWindowOpacity` ishlating.
- Ekran o'zgarmasa DLL kadr chizmaydi (0 kadr/s), o'zining chizgani "aks-sado" deb sanaladi va qayta chizilmaydi.

## API

`include/lgwin.h`: `lg_create3`, `lg_create2`, `lg_create`, `lg_destroy`, `lg_set`, `lg_light`, `lg_dump`, `lg_info`, `lg_error`.
Qo'shimcha (Python tomoni ishlatadi): `lg_set_content`, `lg_set_hold`, `lg_set_frost`, `lg_set_edge`, `lg_luma`, `lg_kill_chrome`, `lg_capture_visible`, `lg_dump2`.
Shakllar koordinatalari oynaning ichki maydoni boshidan, HAQIQIY piksellarda (mantiqiy piksel × DPI). Eng ko'pi 256 shakl.

## Yig'ish

`build_dll.bat` (MSVC 2022): `lgwin.dll` va `lgwin.lib` hosil bo'ladi.

## Cheklovlar va bilib qo'yish kerak

- Ko'rinadigan oyna tagidagi JONLI tasvirni faqat `visible = 0` ko'ra oladi. `visible = 1` da shisha qirrasi tagi eski nusxada qoladi.
- Popup ichki qismi (`under = 1`, `hold`) orqa fonning muzlatilgan nusxasini ishlatadi.
- Bir jarayonda bitta monitorni bir marta takrorlash mumkin: kutubxona buni ichkarida bo'lishadi (bitta render oqimi, har oynaga bitta swapchain).
- Boshqa GPU'dagi monitor (hybrid noutbuk) hozircha qo'llab-quvvatlanmaydi (`lg_error` stage 9).
- Asosiy sampler `MaxLOD = 0`: `blur`/`lod` parametrlari refraksiyada deyarli ta'sir qilmaydi (standart qiymatlar shunga moslab tanlangan). Orqa fon yorqinligi uchun alohida to'g'ri sampler ishlatiladi.

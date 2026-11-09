# lgwin: native liquid glass for Windows (GPU)

Puts a live liquid glass layer over or under any window (HWND): everything behind it (other windows, the desktop, video) bends at the
glass edge, at 60 fps. It works with any language or window toolkit: Win32, Qt, WPF, WinForms, Electron, Delphi, Rust.

- Backdrop: captured as a GPU texture (it never goes to the CPU; no frame arrives when the screen does not change). The `lg_set_backend`
  call selects between per-window Windows Graphics Capture and full-screen DXGI Desktop Duplication.
- Glass: a D3D11 pixel shader (an HLSL port of `../core/shaders/liquidglass.frag`, in `hlsl.inc`). One frame takes about 0.05 ms (RTX 2080 SUPER).
- Output: a transparent DirectComposition window; mouse and keyboard pass through to the application underneath.
- Requirements: Windows 11 (tested) or Windows 10 (untested), a Direct3D 11 GPU. Several monitors work, but only on one GPU.

## Up and running in 10 minutes

### C++
```cpp
#include "lgwin.h"                       // include/ ; link with lgwin.lib, keep lgwin.dll next to your exe
void* glass = lg_create2(hwnd, 0);       // 0: glass over the window
LGShape s[] = { lgRect(40, 40, 360, 220, 16, dpr), lgRect(60, 300, 130, 44, 14, dpr) };
s[0].bevel = -0.45f; s[0].thick = 0.3f;  // card: glass rim, clear centre
lgSet(glass, lgDefaultParams(dpr), s, 2);
// ... when the window closes: lg_destroy(glass);
```
Full sample: `samples/cpp/sample.cpp` (`build_sample.bat`).

### C# (WinForms / WPF)
```csharp
var glass = new GlassLayer(form.Handle) { Dpr = form.DeviceDpi / 96f };      // WPF: new WindowInteropHelper(win).Handle
glass.SetShapes(new[] { Shape.FromRect(40, 40, 360, 220, 16, glass.Dpr, bevel: -0.45f, thick: 0.3f) });
```
Add `dotnet/LiquidGlass.cs` to your project. Full sample: `samples/csharp` (`dotnet build`).

### Python / Qt
`python/liquidglass_qt.py`: `attach(window)` finds buttons, cards and tables and turns them into glass.

## Modes

`lg_create3(hwnd, under, visible)` (`lg_create2` and `lg_create` open with `visible = 0`):

| | `visible = 1` (Python default) | `visible = 0` |
|---|---|---|
| The window in screenshots and recordings | **appears** (like any Windows window, nothing is hidden) | does not appear (`WDA_EXCLUDEFROMCAPTURE`) |
| Glass look | transparent centre (live content below), refracting rim; with `under = 1` the centre also gets a Gaussian frost | full glass |
| Backdrop | the area covered by the glass rim is not updated in the copy (so the glass never captures itself) | the whole backdrop is live |

- `under = 0`: the glass is OVER the window. `under = 1`: the glass is UNDER the window, and the Qt/Win32 window is almost invisible
  (2 % opacity) and serves only as the input surface; text and buttons are drawn in the glass window through `lg_set_content`.
- For nested shapes inside a window the smaller one wins. `bevel < 0` = "clear inside", `thick < 0` = "frame".
- A Qt per-pixel transparent window (`WA_TranslucentBackground`) comes out black in Desktop Duplication: use `setWindowOpacity`.
- When the screen does not change the DLL draws no frames (0 frames/s); its own output is counted as an "echo" and is not redrawn.

## API

`include/lgwin.h`: `lg_create3`, `lg_create2`, `lg_create`, `lg_destroy`, `lg_set`, `lg_light`, `lg_dump`, `lg_info`, `lg_error`,
`lg_set_content_rect`, `lg_beat`.
Additional calls (used by the Python side, declared in the Python bindings): `lg_set_content`, `lg_set_hold`, `lg_set_frost`,
`lg_set_edge`, `lg_luma`, `lg_kill_chrome`, `lg_capture_visible`, `lg_dump2`.
Shape coordinates are measured from the start of the window's client area, in REAL pixels (logical pixels x DPI). At most 256 shapes.

## Build

`build_dll.bat` (Visual Studio 2019 or 2022 with the C++ workload and a Windows SDK): produces `lgwin.dll` and `lgwin.lib`.

## Limitations and things to know

- Only `visible = 0` can see the LIVE image under a visible window. With `visible = 1` the area under the glass rim keeps an older copy.
- The inside of a popup (`under = 1`, `hold`) uses a frozen copy of the backdrop.
- One process can duplicate one monitor once: the library shares it internally (one render thread, one swap chain per window).
- A monitor on a different GPU (hybrid laptops) is not supported yet (`lg_error` stage 9).
- The main sampler has `MaxLOD = 0`: the `blur` and `lod` parameters have almost no effect on refraction (the defaults were chosen with
  that in mind). A separate correct sampler is used for backdrop brightness.

# liquidglass

![rigid glass](web/docs/glass.png)

Physically based "liquid glass" UI: refraction, dispersion, Fresnel, total internal reflection, fluid merging of shapes,
and depth by focus. Plus an optional particle-based water mode.

**Live demo:** https://dilmurod3037729-max.github.io/liquidglass/web/demo/ (rigid glass, live tuning panel)
and https://dilmurod3037729-max.github.io/liquidglass/web/demo/water.html (water).

- [`web/`](web/) is the dependency-free WebGL2 library (ES modules). Start with [`web/README.md`](web/README.md) (documentation is in Uzbek).
- [`core/`](core/) is the C++17 core (shapes, physics, shader source of truth) used to verify the JS port with golden tests.
  A native OpenGL 3.3 backend with a GLFW + Dear ImGui demo lives in [`core/native`](core/native) and a Qt 6 backend (QOpenGLWidget) in [`core/qt`](core/qt).
- [`python/`](python/) is a PySide6 module that turns the real buttons of an existing Qt Widgets app into glass without touching its code.

## Native Windows backend

![glass panel over a colourful scene](docs/native/hero.png)

![dragging the glass: the scene behind stays still](docs/native/drag.gif)

A real-time glass panel for any Qt (PySide6) window on Windows: everything behind it, including other applications, bends
at the edge like a thick lens, with dispersion, frost and a rim highlight. The picture above is a synthetic scene;
in the GIF the background stays perfectly still while the glass moves over it.

- **Per-window backdrop.** Each window under the popup is captured separately with Windows.Graphics.Capture, so the glass never
  sees itself (no feedback loop, no stale or frozen backdrop) and nothing needs administrator rights or injection.
- **Fixed overlay.** The overlay window never moves; the glass is drawn inside its swap chain. Moving a window and updating its
  image used to land on different frames, so the backdrop jumped while dragging. Measured with a screen-capture test
  (hue ramp behind a popup dragged at about 2000 px/s): 9-14 of 34 frames were visibly wrong before, 0 in three runs after.
- **Cheap when idle.** Only changes under the popup trigger a redraw (WGC dirty regions). One popup, idle, on one Windows 11
  machine with an NVIDIA GPU: about 3.5% of one CPU core, popup's own GPU use under 1% (GPU busy-time rose from 8% to about 13%).

### Demo: a terminal built on it

![GlassTerm: a terminal rendered as thick liquid glass](docs/native/terminal.png)

![dragging the glass terminal over a scene](docs/native/terminal.gif)

A proof that the backend is usable for real work: a small terminal (PySide6, ConPTY, `pyte`) whose whole window is glass. The text
is drawn by the app and sits on top of the glass; its colour adapts to what is behind it, and the glass refracts whatever lies under it,
including other glass windows. The pictures use a synthetic scene and a throwaway demo folder. The terminal's source is not part of this
repository yet.

Try it (needs Visual Studio 2022 with the C++ workload and the Windows SDK; paths in `win-native/build_dll.bat` are for
the author's machine, adjust them):

```
win-native\build_dll.bat
python python\popup_demo.py
```

Limitations, honestly: Windows only (tested on Windows 11; Windows 10 is untested and may show the yellow capture border),
protected windows (DRM video) are not visible behind the glass, window shadows are not part of the backdrop, and each popup
has a full-desktop transparent overlay, so several popups cost proportionally more (not measured). The glass needs a hardware
D3D11 GPU.

```js
import { createLiquidGlass } from './web/src/index.js';

const glass = createLiquidGlass(canvas, { mode: 'glass', source: sceneCanvas });
glass.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
glass.params.bevel = 18;
```

Install: `npm install @dilmurod3037729/liquidglass-web` (or load from jsDelivr, see [`web/README.md`](web/README.md)).

Run locally: `node web/scripts/serve.mjs`, then open `http://localhost:5173/demo/`.
Tests: `cd web && npm test` (JS core matches the C++ core; water simulation stays stable at extreme settings).

Limitations: WebGL cannot read the page DOM, so the glass refracts a `source` (canvas / image / video) you provide.
See the limitations section in [`web/README.md`](web/README.md).

MIT license.

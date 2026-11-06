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

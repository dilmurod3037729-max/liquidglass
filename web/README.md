# liquidglass-web

![rigid glass](https://raw.githubusercontent.com/dilmurod3037729-max/liquidglass/main/web/docs/glass.png)
![water mode](https://raw.githubusercontent.com/dilmurod3037729-max/liquidglass/main/web/docs/water.png)

Physically based "liquid glass" for the web (WebGL2), a dependency-free ES module. Two modes:

- **`glass`** (default): clean rigid glass. The centre is clear and refraction happens only in a thin rim. Snell refraction,
  dispersion, Fresnel, total internal reflection, absorption, shadow and caustic, shapes that **merge** like liquid, and **depth** by
  focus (the front glass refracts the glass behind it).
- **`water`** (optional): free particle-based water. It sticks together, is incompressible and slides heavily on the glass.

## Install (npm)

```
npm install @dilmurod3037729/liquidglass-web
```

```js
import { createLiquidGlass } from '@dilmurod3037729/liquidglass-web';
```

## Quick use from a CDN (no install)

```js
import { createLiquidGlass } from 'https://cdn.jsdelivr.net/gh/dilmurod3037729-max/liquidglass@main/web/src/index.js';
```

## Getting started

    node scripts/serve.mjs      # http://localhost:5173/demo/             (rigid glass, live tuning panel)
                                # http://localhost:5173/demo/water.html   (water)

```js
import { createLiquidGlass } from './src/index.js';

const glass = createLiquidGlass(canvas, { mode: 'glass', source: sceneCanvas });   // canvas | img | video | ImageBitmap
glass.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
glass.add({ w: 150, h: 52, radius: 26, draggable: false }, { x: 500, y: 600 });   // a fixed panel or button
```

## Tuning (rigid glass)

Everything changes live through `glass.params`. Each setting is clamped to the range in `GLASS_SCHEMA`.

| Setting | What it does | Default |
|---|---|---|
| `ior` | index of refraction (higher = stronger bending) | 1.55 |
| `thick` | glass thickness (displacement strength) | 40 |
| `bevel` | rim width in px. Never more than half the body, the centre stays clear | 26 |
| `disp` | dispersion: colour separation at the rim | 0.04 |
| `blur` | scattering (haze) | 0.35 |
| `merge` | radius in px within which nearby shapes merge | 48 |
| `elastic` | liquid stretching. 0 = rigid glass, higher = heavier drop | 0 |
| `spec` | specular highlight | 1.1 |
| `absorb` | absorption (darker tint where the glass is thick) | 0.5 |

```js
glass.params.bevel = 18;
glass.params.elastic = 1;   // liquid stretching instead of rigid glass
```

The live panel is `demo/index.html`. It is built automatically from `GLASS_SCHEMA`; use the same schema for your own UI.

## How it works

- The glass refracts a **scene texture** (`source`), so buttons and text under the glass bend too.
- Shapes are combined into one shared field with `smin`: when they come close they join like drops.
- Two passes: the shapes behind are rendered to an FBO and the front glass refracts that. The shape pressed last comes to the front.
- A frame is drawn only when something moves (an idle page costs no GPU). Use `{ live: true }` for live video.

## Free water (particle fluid)

A drop with no skeleton: water made of many small particles. It sticks together (surface tension), is incompressible (it swells when
stopped) and slides heavily on the glass. The glass refracts the surface these particles form. Drops that touch merge on their own.

```js
const water = createLiquidGlass(canvas, { mode: 'water', source: sceneCanvas, preset: 'water' });   // 'water' | 'honey' | 'mercury'
water.add({ w: 220, h: 58, radius: 29 }, { x: 300, y: 200 }, labelElement);
water.add({ w: 150, h: 52, radius: 26, draggable: false, anchored: true }, { x: 500, y: 600 }, btnLabel);   // a button that stays in place

water.fluid.set({ viscosity: 50, cohesion: 3000 });   // live tuning
water.fluid.preset('honey');
water.glass.thick = 90;                               // glass look
```

| Setting | What it does |
|---|---|
| `stiffness` | how incompressible the particles are (higher = stiffer) |
| `cohesion` | stickiness / surface tension (higher = tends to gather into a ball) |
| `viscosity` | how fast velocity differences inside a drop die out |
| `glassFriction` | friction on the glass: higher = heavier and slower |
| `shapeMemory` | pull back toward the UI shape (capsule, rectangle) when released |
| `grabForce`, `grabSize`, `grabBody` | pull strength, size of the grabbed area, share of the whole body that is pulled |
| `spacing` | particle spacing in px: smaller = more precise but heavier |
| `maxSpeed` | particle speed limit |

Every setting has an allowed range (`PARAM_SCHEMA`); values outside it are clamped, so the simulation cannot blow up.
The `mercury` preset has low `shapeMemory`: drops become balls (the UI shape is not kept). This is intentional.

## Attach to an existing app (without touching its code)

The glass can replace the REAL buttons of a page with a material: elements are found, their original look is hidden (`opacity: 0`,
they stay clickable), and glass plus a copy of the label is drawn in their place. The label colour adapts to the brightness of the
background under the glass.

**Electron** (in the main process, after the window is created):

```js
const { enable } = require('@dilmurod3037729/liquidglass-web/electron');
enable(mainWindow, { selector: 'button, .btn', params: { bevel: 20 } });
```

The page image is taken in the main process with `webContents.capturePage()` (WebGL cannot read the DOM). When the page changes
(a section switches, a list updates) the image and the glass are rebuilt within about 0.2 s. Run `npm run build` first
(it produces `dist/liquidglass.js`).

**Browser or other hosts:** pass your own function that returns an image of the page (for example html2canvas):

```js
import { attach } from './src/index.js';
attach({ selector: 'button, .btn', snapshot: async () => await html2canvas(document.body) });
```

The glass grows slightly on hover and more when pressed. While the page scrolls, the glass follows the real elements immediately and
the image is retaken when scrolling stops.

Options: `selector`, `exclude`, `maxShapes` (default 128, maximum 256), `minSize`, `params` (the `glass.params`), `labelContrast`.
It does not work on native (non-HTML) windows. Limit: up to 256 elements at a time (default 128); the page image is retaken on
every change (about 100 ms).

## Limitations (honest)

- **It does not refract the DOM.** WebGL cannot read ordinary HTML on the page. What gets refracted must be given as `source`
  (canvas, image, video). The label on top of the glass (`labelElement`) is ordinary HTML.
- `glass` mode has at most 256 shapes (stored in a data texture), all rounded rectangles. Lower `params.merge` if nearby shapes should
  not join.
- Water mode has no front/back glass layers yet.
- The glass is drawn through a full-screen canvas (currently `fixed`, screen sized).

## Single source of truth and tests

`src/shader.js` is generated: `core/shaders/liquidglass.frag` -> `npm run sync-shader`.
`src/scene.js` is a copy of the C++ core (`core/src/scene.cpp`); `npm test` checks that both give the same result (golden test) and
that the water simulation stays stable (even at extreme settings).

## License

MIT, see `LICENSE`.

## Performance (measured)

`node tests/bench.mjs` drags a card for 8 seconds on a real GPU (headless Chrome, D3D11) and measures the load with nvidia-smi.
One sample (RTX 2080 SUPER, 1400x800, `glass` mode): while dragging the GPU averages about 19-22 %, peaking at 35-37 %; at rest
the page draws **0 frames**. The idle GPU percentage includes the browser, the compositor and other applications, so the main number
is "frames drawn in 5 idle seconds". The numbers depend on the machine, run it on your own.

### Frame time by number of shapes

`node tests/bench-shapes.mjs` waits for the GPU to finish each frame with `readPixels` (RTX 2080 SUPER, 1400x800, dpr 1, static shapes):

| Shapes | 5 | 50 | 128 | 256 |
|---|---|---|---|---|
| Frame time | ~1.9 ms | ~3.0 ms | ~3.5 ms | ~2.6 ms |

The screen is split into 32-pixel tiles and each tile gets only the list of shapes near it (an R32F texture), so the cost barely
grows with the number of shapes (without tiles, 256 shapes took about 16 ms). If there is no glass behind (an app adapter), the back
pass is skipped entirely. A frame is drawn only when something changes.

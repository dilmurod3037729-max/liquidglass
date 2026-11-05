import { Scene, defaultParams, GLASS_SCHEMA } from './scene.js';
import { LiquidWater } from './water.js';
import { Renderer } from './renderer.js';
import { LiquidGlass } from './glass.js';

export { Scene, defaultParams, GLASS_SCHEMA, Renderer, LiquidGlass };
export { DomGlass, attach } from './dom.js';
export { FluidSim, PARAM_SCHEMA, PRESETS } from './fluid.js';
export { LiquidWater, defaultGlass } from './water.js';

/** Bitta kirish nuqtasi: mode 'glass' (qattiq oyna, standart) yoki 'water' (zarrachali suv). */
export function createLiquidGlass(canvas, { mode = 'glass', ...opts } = {}) {
  if (mode === 'water') return new LiquidWater(canvas, opts);
  if (mode === 'glass') return new LiquidGlass(canvas, opts);
  throw new Error(`liquidglass: noma'lum mode "${mode}" ('glass' | 'water')`);
}


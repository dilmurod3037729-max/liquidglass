export type Source = HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | HTMLVideoElement | ImageBitmap;

export interface ShapeDesc {
  w: number;
  h: number;
  radius: number;
  draggable?: boolean;
  anchored?: boolean;
}

export interface Point { x: number; y: number }

export interface GlassParams {
  ior: number;
  thick: number;
  bevel: number;
  disp: number;
  blur: number;
  merge: number;
  elastic: number;
  spec: number;
  absorb: number;
}

export interface SchemaEntry { min: number; max: number; step: number; label: string; def?: number }

export const GLASS_SCHEMA: Record<keyof GlassParams, SchemaEntry>;
export const PARAM_SCHEMA: Record<string, SchemaEntry>;
export const PRESETS: Record<string, Record<string, number>>;
export function defaultParams(): GlassParams;
export function defaultGlass(): Omit<GlassParams, 'merge' | 'elastic'>;

export interface GlassOptions {
  source?: Source | null;
  /** Re-upload the source every frame (live video). */
  live?: boolean;
  maxDpr?: number;
  elastic?: number;
}

export class LiquidGlass {
  constructor(canvas: HTMLCanvasElement, options?: GlassOptions);
  params: GlassParams;
  /** Number of frames drawn so far. */
  drawn: number;
  /** Consecutive idle frames; 3 or more means nothing is being drawn. */
  idle: number;
  /** Adds a shape and returns its id (negative when the shape limit is reached). */
  add(desc: ShapeDesc, pos: Point, labelEl?: HTMLElement): number;
  setSource(src: Source): void;
  invalidate(): void;
  resize(): void;
  wake(): void;
  dispose(): void;
}

export interface FluidParams {
  stiffness: number;
  cohesion: number;
  viscosity: number;
  glassFriction: number;
  shapeMemory: number;
  grabForce: number;
  grabSize: number;
  grabBody: number;
  spacing: number;
  maxSpeed: number;
}

export class FluidSim {
  params: FluidParams;
  /** Number of particles. */
  n: number;
  set(params: Partial<FluidParams>): this;
  preset(name: 'water' | 'honey' | 'mercury' | string): this;
}

export interface WaterOptions {
  source?: Source | null;
  preset?: 'water' | 'honey' | 'mercury' | string;
  fluid?: Partial<FluidParams>;
  glass?: Partial<Omit<GlassParams, 'merge' | 'elastic'>>;
}

export class LiquidWater {
  constructor(canvas: HTMLCanvasElement, options?: WaterOptions);
  fluid: FluidSim;
  glass: Omit<GlassParams, 'merge' | 'elastic'>;
  drawn: number;
  idle: number;
  add(desc: ShapeDesc, pos: Point, labelEl?: HTMLElement): number;
  setSource(src: Source): void;
  resize(): void;
  wake(): void;
  dispose(): void;
}

export function createLiquidGlass(canvas: HTMLCanvasElement, options: { mode: 'water' } & WaterOptions): LiquidWater;
export function createLiquidGlass(canvas: HTMLCanvasElement, options?: { mode?: 'glass' } & GlassOptions): LiquidGlass;

export interface AttachOptions {
  selector?: string;
  exclude?: string;
  maxShapes?: number;
  minSize?: number;
  params?: Partial<GlassParams>;
  labelContrast?: number;
  /** Returns an image of the page (for example html2canvas). */
  snapshot?: () => Promise<Source>;
}

export class DomGlass {
  constructor(options?: AttachOptions);
  dispose(): void;
}

export function attach(options?: AttachOptions): DomGlass;

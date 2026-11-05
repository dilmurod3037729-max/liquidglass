import test from 'node:test';
import assert from 'node:assert/strict';
import { FluidSim, PARAM_SCHEMA, PRESETS } from '../src/fluid.js';

const frames = (sim, sec, dt = 1 / 60) => { let m = true; for (let i = 0; i < sec / dt; i++) m = sim.step(dt); return m; };
const finite = (sim) => [...sim.x, ...sim.y, ...sim.vx, ...sim.vy].every(Number.isFinite);

function scene(params) {
  const sim = new FluidSim(params);
  sim.addDrop({ w: 280, h: 170, radius: 40, x: 300, y: 300 });
  sim.addDrop({ w: 150, h: 52, radius: 26, x: 700, y: 600, draggable: false, anchored: true });
  return sim;
}

test('sozlamalar oraliqqa qirqiladi, noma\'lum kalit rad etiladi', () => {
  const s = new FluidSim();
  s.set({ stiffness: 1e12, viscosity: -5 });
  assert.equal(s.params.stiffness, PARAM_SCHEMA.stiffness.max);
  assert.equal(s.params.viscosity, PARAM_SCHEMA.viscosity.min);
  assert.throws(() => s.set({ nomalum: 1 }));
});

test('hamma preset to\'g\'ri oraliqda va barqaror', () => {
  for (const name of Object.keys(PRESETS)) {
    const sim = scene().preset(name);
    for (const [k, v] of Object.entries(sim.params)) assert.ok(v >= PARAM_SCHEMA[k].min && v <= PARAM_SCHEMA[k].max, `${name}.${k}`);
    sim.pointerDown(300, 300);
    sim.pointerMove(800, 400);
    frames(sim, 1.5);
    sim.pointerUp();
    frames(sim, 3);
    assert.ok(finite(sim), `${name}: NaN/Infinity`);
  }
});

test('eng chekka sozlamalarda ham portlamaydi', () => {
  for (const extreme of [{ stiffness: 60000, grabForce: 400, viscosity: 0, glassFriction: 0 }, { stiffness: 4000, cohesion: 8000, shapeMemory: 100 }]) {
    const sim = scene(extreme);
    sim.pointerDown(300, 300);
    sim.pointerMove(1200, 100);
    frames(sim, 2);
    assert.ok(finite(sim));
    assert.ok(Math.max(...sim.x) < 6000 && Math.min(...sim.x) > -3000, 'zarrachalar uchib ketdi');
  }
});

test('tortish tomchini siljitadi, qo\'yib yuborilsa tinchlanadi', () => {
  const sim = scene();
  const g = sim.pointerDown(300, 300);
  assert.equal(g, 0);
  sim.pointerMove(700, 300);
  frames(sim, 2);
  assert.ok(sim.com(0).x > 550, 'tomchi nishon tomon siljimadi: ' + sim.com(0).x);
  sim.pointerUp();
  assert.equal(frames(sim, 8), false, 'tinchlanmadi');
});

test('tomchi bo\'laklarga bo\'linib ketmaydi (tez tortishda ham bitta jism)', () => {
  const sim = scene();
  sim.pointerDown(300, 300);
  sim.pointerMove(900, 380);
  frames(sim, 0.45);   // eng tez payt
  const H = sim.params.spacing, g = sim.groups[0];
  // ulanish grafi: qo'shni zarrachalar (<1.5H) bog'langan komponentlar soni
  const seen = new Set(); let comps = 0;
  for (let i = g.start; i < g.end; i++) {
    if (seen.has(i)) continue;
    comps++; const st = [i]; seen.add(i);
    while (st.length) { const a = st.pop(); for (let j = g.start; j < g.end; j++) if (!seen.has(j) && Math.hypot(sim.x[a] - sim.x[j], sim.y[a] - sim.y[j]) < 1.5 * H) { seen.add(j); st.push(j); } }
  }
  assert.equal(comps, 1, `tomchi ${comps} bo'lakka bo'linib ketdi`);
});

test('anchored tugma itarilsa joyiga qaytadi', () => {
  const sim = scene();
  const before = sim.com(1);
  for (let i = sim.groups[1].start; i < sim.groups[1].end; i++) sim.x[i] += 40;
  frames(sim, 6);
  const after = sim.com(1);
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 3, 'joyiga qaytmadi');
});

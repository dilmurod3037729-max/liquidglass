// JS yadro (src/scene.js) C++ yadro bilan bir xil natija beradimi: tests/golden.json (core/tests/dump_golden.cpp dan)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from '../src/scene.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));

test('JS yadro C++ yadro bilan mos (oltin test)', () => {
  const s = new Scene();
  const a = s.add({ w: 280, h: 170, radius: 40, draggable: true }, { x: 300, y: 300 });
  const b = s.add({ w: 220, h: 58, radius: 29, draggable: true }, { x: 700, y: 300 });
  s.add({ w: 150, h: 52, radius: 26, draggable: false }, { x: 500, y: 600 });
  s.setTarget(a, { x: 420, y: 380 });
  s.setPressed(a, true);
  const rows = [];
  for (let f = 0; f < 90; f++) {
    if (f === 20) s.setTarget(b, { x: 520, y: 330 });
    if (f === 40) { s.setPressed(a, false); s.focus(b); }
    s.step(1 / 60);
    if (f % 10 === 9) {
      const u = s.pack('front', 1);
      rows.push({ f, ax: s.position(a).x, ay: s.position(a).y, bx: s.position(b).x, by: s.position(b).y, sa: s.scale(a), sb: s.scale(b),
        da: s.depth(a), sdf: s.sdf({ x: 480, y: 340 }, 'front'), rect1: u.data[16], tail1: u.data[20], k1: u.data[25] });
    }
  }
  assert.equal(rows.length, golden.length);
  const tol = 2e-3;   // float32 (C++) va float64 (JS) farqi
  rows.forEach((r, i) => {
    for (const key of Object.keys(golden[i])) {
      assert.ok(Math.abs(r[key] - golden[i][key]) < tol, `kadr ${r.f}, ${key}: JS ${r[key]} != C++ ${golden[i][key]}`);
    }
  });
});

test('pack: shakl soni va qatlam ajratish', () => {
  const s = new Scene();
  s.add({ w: 100, h: 60, radius: 30 }, { x: 0, y: 0 });
  s.add({ w: 100, h: 60, radius: 30 }, { x: 200, y: 0 });
  const f = s.pack('front', 1), b = s.pack('back', 1);
  assert.equal(f.count, 1); assert.equal(b.count, 1);   // har o'tishda faqat o'z shakllari
  assert.equal(f.data[0], 0); assert.equal(b.data[0], 200);   // oldingi: 0-shakl (x=0), orqadagi: 1-shakl (x=200)
});

test('setTint: rang paketga tushadi', () => {
  const s = new Scene();
  s.add({ w: 100, h: 60, radius: 30, draggable: false }, { x: 0, y: 0 });
  s.setTint(0, [0.9, 0.2, 0.1, 0.35]);
  const f = s.pack('front', 1);
  assert.ok(Math.abs(f.data[12] - 0.9) < 1e-6 && Math.abs(f.data[15] - 0.35) < 1e-6);
});

test('material: chet/qalinlik ko\'paytiruvchisi dum zw da', () => {
  const s = new Scene();
  s.add({ w: 100, h: 60, radius: 30, draggable: false, bevel: 0.4, thick: 0.7 }, { x: 0, y: 0 });
  const f = s.pack('front', 1);
  assert.ok(Math.abs(f.data[6] - 0.4) < 1e-6 && Math.abs(f.data[7] - 0.7) < 1e-6);
});

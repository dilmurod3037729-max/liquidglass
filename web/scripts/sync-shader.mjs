// core/shaders/liquidglass.frag (yagona manba) -> src/shader.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, '..', 'core', 'shaders', 'liquidglass.frag'), 'utf8');
const body = src.slice(src.indexOf('#version'));
const VS = '#version 300 es\nvoid main(){\n  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}';
writeFileSync(join(root, 'src', 'shader.js'),
  `// AVTOMATIK HOSIL QILINGAN: scripts/sync-shader.mjs. Qo'lda tahrirlamang — core/shaders/liquidglass.frag ni o'zgartiring.\n` +
  `export const VERTEX = ${JSON.stringify(VS)};\nexport const FRAGMENT = ${JSON.stringify(body)};\n`);
console.log('shader.js yangilandi');

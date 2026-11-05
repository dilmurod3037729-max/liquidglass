// src/ modullarini bitta oddiy skriptga (IIFE, window.LiquidGlassLib) aylantiradi: <script> yoki
// Electron'da executeJavaScript bilan yuklash uchun. Bog'liqliksiz. Natija: dist/liquidglass.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const order = ['shader.js', 'scene.js', 'tiles.js', 'renderer.js', 'glass.js', 'fluid.js', 'water.js', 'dom.js', 'index.js'];
let out = '(function(){\nconst __lg = {};\n';
for (const f of order) {
  let s = readFileSync(join(root, 'src', f), 'utf8');
  const names = [];
  s = s.replace(/^import\s+\{([^}]+)\}\s+from\s+'[^']+';?\s*$/gm, (_, list) => `const {${list}} = __lg;`);
  s = s.replace(/^export\s+\{([^}]+)\}\s+from\s+'[^']+';?\s*$/gm, '');
  s = s.replace(/^export\s+\{([^}]+)\};?\s*$/gm, (_, list) => { list.split(',').forEach((n) => names.push(n.trim())); return ''; });
  s = s.replace(/^export\s+(const|let|function|class)\s+([A-Za-z0-9_]+)/gm, (_, kw, name) => { names.push(name); return `${kw} ${name}`; });
  out += `{\n${s}\n${names.map((n) => `__lg.${n} = ${n};`).join('\n')}\n}\n`;
}
out += 'window.LiquidGlassLib = __lg;\n})();\n';
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'liquidglass.js'), out);
console.log('dist/liquidglass.js', out.length, 'bayt');

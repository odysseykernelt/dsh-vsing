// 静态自检：client.js 里用到的每个 t('key') 必须在 DICT.zh 和 DICT.en 里都存在；
// 顺便列出所有 ctx.* 调用，方便人工对照宿主 API。
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

// 取出 DICT 字面量并求值
const start = src.indexOf('const DICT = {');
const end = src.indexOf('\n};', start);
const dictSrc = src.slice(start + 'const DICT = '.length, end + 4);
const DICT = eval('(' + dictSrc.replace(/;\s*$/, '') + ')');

const keysUsed = new Set();
for (const m of src.matchAll(/\bt\((['"])([A-Za-z0-9_.]+)\1/g)) keysUsed.add(m[2]);
for (const m of src.matchAll(/\bt\(`([A-Za-z0-9_.]+)`/g)) keysUsed.add(m[1]);

const missing = [];
for (const key of keysUsed) {
  for (const lang of ['zh', 'en']) {
    if (!DICT[lang] || !(key in DICT[lang])) missing.push(`${lang}.${key}`);
  }
}
const unused = [];
for (const lang of ['zh', 'en']) {
  for (const key of Object.keys(DICT[lang] || {})) if (!keysUsed.has(key)) unused.push(`${lang}.${key}`);
}

const ctxCalls = [...new Set([...src.matchAll(/ctx\.([A-Za-z0-9_.]+)/g)].map((m) => m[1]))];

console.log('dict keys:', Object.keys(DICT.zh || {}).length, '/', Object.keys(DICT.en || {}).length);
console.log('t() keys used:', keysUsed.size);
console.log('missing:', missing.length ? missing.join(', ') : 'none');
console.log('unused:', unused.length ? unused.join(', ') : 'none');
console.log('ctx calls:', ctxCalls.join(', ') || 'none');

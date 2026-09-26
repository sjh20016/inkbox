#!/usr/bin/env node
// inkbox 模块图**静态**导入检查（不需要浏览器，也不执行任何模块）
//
// 为什么要有它：本项目真撞过一次，而所有工具都没响 ——
//   · `io/save.js` 先 `import { generateUpperWorld } from '../world/worldgenUpper.js'`，
//     而那个文件**当时还不存在** → 运行期模块解析失败 → **整个沙盒打不开**
//     （不是「上界视界不能用」这种局部故障）；
//   · `main.js` 从 `worldgenUpper.js` 具名导入 `recomputeUpperQi`，
//     而对方导出的是 `recomputeUpperAll` → 同样是运行期才炸。
//
// `node --check` 对这两种**全部通过**：它只做语法检查，不解析 import 目标。
// `module-import-smoke.mjs` 也抓不到 —— 它列的 27 个模块**全是主线的**，
// 一个 inkbox 模块都没有。
//
// 所以这里做两件纯静态的事（不执行任何模块，所以 `main.js` 这种依赖 DOM 的也能查）：
//   1. **目标文件存在吗**：把每个 `from '...'` 的裸相对路径解析成绝对路径，`existsSync` 一下；
//   2. **具名导入在对面真的导出了吗**：扫目标文件的导出名，逐个核对。
//
// ⚠️ 局限（故意写清楚，免得它被当成万能）：
//   · 用正则扫，不建 AST。所以**动态 `import()`、`import.meta`、计算属性导出**都不管；
//   · 遇到 `export * from` 就把该目标标成「有星号导出」，**跳过**对它的具名核对
//     （宁可漏报也不误报：会撒谎的工具比没有工具更坏）；
//   · 只查相对路径（`./` `../`）。裸包名（如 `three`）不查。
//
// 用法：
//   node scripts/inkbox-import-check.mjs
//   node scripts/inkbox-import-check.mjs --all      # 连 src/ 主线一起查
//
// 退出码：0 = 全部解析成功；1 = 有缺失目标或对不上的具名导入。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkAll = process.argv.includes('--all');
const scanRoots = checkAll ? [path.join(root, 'src')] : [path.join(root, 'src', 'inkbox')];

function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return jsFilesUnder(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

/** 把一个模块说明符解析成磁盘上的真实文件（补 `.js`、补 `/index.js`）。 */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return { external: true };
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: c };
  return { missing: true, tried: candidates.map((c) => path.relative(root, c).replaceAll('\\', '/')) };
}

const IMPORT_RE = /(?:^|[\s;{(])import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;

/** 解析一个文件里的所有 import：`{ spec, names|null }`。names 为 null 表示「整包 / 副作用导入」。 */
function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const clause = (m[1] || '').trim();
    const spec = m[2];
    let names = null;
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      names = braces[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
    }
    out.push({ spec, names });
  }
  return out;
}

/** 目标文件导出了哪些名字；`star: true` 表示它 `export * from` 过（具名核对要跳过）。 */
function exportsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  let star = false;

  // export * from '...'
  if (/^\s*export\s+\*\s+from\s+['"]/m.test(src)) star = true;

  // export function|const|let|var|class|async function NAME
  //
  // ⚠️ 前缀 `(?:^|\*\/)` 是**承重的**，不是随手写的宽松：本仓库允许
  // 「文档注释与 `export` 写在同一行」——`sim/artifacts.js:388` 就是
  // `/** 把一件法宝放回地上（无主） */export function toGround(...)`。
  // 原来的写法是 `^\s*export`（**要求 `export` 出现在行首**），于是那个
  // `toGround` 扫不出来，`sim/rifts.js` 具名导入它时报了一条**假阳性**
  // 「对面没有这个导出」——而这条文案与「真的漏了导出」**逐字相同**，
  // 运行期后果却完全相反（一个会炸，一个不会）。
  // 这正是本文件头部那句「宁可漏报也不误报：**会撒谎的工具比没有工具更坏**」
  // 要防的东西：人一旦学会忽略它，这个检查器就废了。
  // 这个盲区一直存在，只是 `toGround` 以前从没被跨文件具名导入过，所以没响过。
  const declRe = /(?:^|\*\/)\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = declRe.exec(src)) !== null) names.add(m[1]);

  // export { a, b as c } [from '...']
  const listRe = /^\s*export\s*\{([^}]*)\}/gm;
  while ((m = listRe.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const asMatch = seg.match(/\s+as\s+([A-Za-z_$][\w$]*)$/);
      names.add(asMatch ? asMatch[1] : seg);
    }
  }

  if (/^\s*export\s+default\b/m.test(src)) names.add('default');
  return { names, star };
}

// ── 扫描 ──────────────────────────────────────────────────────────

const files = scanRoots.flatMap(jsFilesUnder);
const exportCache = new Map();
const cachedExports = (file) => {
  if (!exportCache.has(file)) exportCache.set(file, exportsOf(file));
  return exportCache.get(file);
};

const missingFiles = [];
const missingNames = [];
const skippedStar = [];
let edgeCount = 0;

for (const file of files) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  for (const { spec, names } of importsOf(file)) {
    const resolved = resolveSpecifier(file, spec);
    if (resolved.external) continue;
    edgeCount += 1;
    if (resolved.missing) {
      missingFiles.push({ from: rel, spec, tried: resolved.tried });
      continue;
    }
    if (!names || names.length === 0) continue;
    const target = path.relative(root, resolved.file).replaceAll('\\', '/');
    const { names: have, star } = cachedExports(resolved.file);
    if (star) { skippedStar.push({ from: rel, target }); continue; }
    for (const name of names) {
      if (!have.has(name)) missingNames.push({ from: rel, target, name });
    }
  }
}

// ── 报告 ──────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════════════');
console.log(`inkbox 模块图静态导入检查 · 扫描 ${files.length} 个文件 / ${edgeCount} 条相对导入边`);
console.log(`范围：${scanRoots.map((d) => path.relative(root, d).replaceAll('\\', '/')).join(' , ')}`);
console.log('══════════════════════════════════════════════════════════════');

if (missingFiles.length) {
  console.log(`\n✗ 目标文件不存在（${missingFiles.length} 处）—— 运行期会「整个沙盒打不开」：`);
  for (const hit of missingFiles) {
    console.log(`  · ${hit.from}`);
    console.log(`      import '${hit.spec}'  →  找不到；试过：${hit.tried.join('  ')}`);
  }
}

if (missingNames.length) {
  console.log(`\n✗ 具名导入在对面没有对应导出（${missingNames.length} 处）—— 运行期才炸：`);
  for (const hit of missingNames) {
    console.log(`  · ${hit.from}  导入 { ${hit.name} }  ←  ${hit.target} 没有这个导出`);
  }
}

if (skippedStar.length) {
  const uniq = [...new Set(skippedStar.map((s) => s.target))];
  console.log(`\n· 跳过具名核对（目标有 export *，无法静态枚举）：${uniq.join(' , ')}`);
}

const bad = missingFiles.length + missingNames.length;
if (bad === 0) {
  console.log(`\n✓ ${files.length} 个文件、${edgeCount} 条相对导入边，全部解析成功。`);
} else {
  console.log(`\n共 ${bad} 处问题。`);
}
console.log('══════════════════════════════════════════════════════════════');
process.exit(bad === 0 ? 0 : 1);

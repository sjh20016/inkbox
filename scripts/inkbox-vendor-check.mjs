#!/usr/bin/env node
// Inkbox · vendor/three 体检（M1.1D D6.6）
//
// ───────────────────────────────────────────────────────────────────────
// 这个脚本要证明什么
// ───────────────────────────────────────────────────────────────────────
//
// 浏览器侧的 Three.js 运行时住在 `vendor/three/`（克隆即可跑、不必 `npm install`）。
// 这份目录最容易出的三种毛病，**都不会报错**：
//
//   ① **文件少一个**：`three.module.js` 内部 `import './three.core.js'`——
//      少了它，线上 3D 模式白屏，控制台只有一句 404；
//   ② **importmap 还指着 `node_modules/`**：本地开发「看起来正常」（因为装了依赖），
//      但克隆到干净机器上就 404——**最阴的一种**；
//   ③ **vendor 与 npm 依赖版本不一致**：node 测试跑的是 3.0，浏览器跑的是 3.1，
//      两边的行为静默分叉。
//
// 运行：`node scripts/inkbox-vendor-check.mjs`（退出码 0 = 全绿）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor', 'three');
const NPM = path.join(ROOT, 'node_modules', 'three');

let passed = 0;
const failures = [];
function check(label, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${label}`); }
  catch (error) { failures.push(label); console.log(`  ✗ ${label}\n      ${error.message}`); }
}
function section(title) { console.log(`\n${title}`); }
const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');
const read = (p) => fs.readFileSync(p, 'utf8');

/** vendor 必须有的**精确**清单（D6.1）。 */
const REQUIRED = [
  'package.json',
  'LICENSE',
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
];

console.log('══════════════════════════════════════════════════════════════');
console.log('inkbox vendor/three 体检（M1.1D D6.6）');
console.log('══════════════════════════════════════════════════════════════');

section('G1 · 文件齐全（少一个 = 线上白屏）');
check('Three 核心、控制器和 GLB 加载依赖全部存在且非空', () => {
  for (const relative of REQUIRED) {
    const file = path.join(VENDOR, relative);
    assert(fs.existsSync(file), `缺 ${rel(file)}`);
    assert(fs.statSync(file).size > 0, `${rel(file)} 是空文件`);
  }
});
check('没有第二份 Three.js 运行时（不许 vendor 与 node_modules 双份都进包）', () => {
  const stray = fs.existsSync(path.join(ROOT, 'vendor', 'three-0.186.1'));
  assert(!stray, 'D6.1 明令「目录版本」与「vendor/three」二选一，不许同时存在');
});
check('LICENSE 跟着走（D6 验收：vendor 目录里必须有许可证）', () => {
  const text = read(path.join(VENDOR, 'LICENSE'));
  assert(/MIT License/i.test(text), 'LICENSE 里应当能找到 MIT 声明');
});
check('three.core.js 真的被 three.module.js 相对引用（少了它必 404）', () => {
  const module_ = read(path.join(VENDOR, 'build', 'three.module.js'));
  assert(/from '\.\/three\.core\.js'/.test(module_), 'three.module.js 必须相对 import three.core.js');
  assert(fs.existsSync(path.join(VENDOR, 'build', 'three.core.js')));
});

section('G2 · importmap 指向 vendor（不是 node_modules）');
check('inkbox.html 的 importmap 两条都指向 ./vendor/three/', () => {
  const html = read(path.join(ROOT, 'inkbox.html'));
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert(match, 'inkbox.html 里找不到 importmap');
  const map = JSON.parse(match[1]);
  assert.equal(map.imports.three, './vendor/three/build/three.module.js');
  assert.equal(map.imports['three/addons/'], './vendor/three/examples/jsm/');
});
check('全仓不再有指向 node_modules/three 的运行时引用', () => {
  const roots = ['inkbox.html', 'index.html', 'game.html', 'src', 'scripts'];
  const hits = [];
  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      if (!/\.(html|js|mjs)$/.test(target)) return;
      const text = read(target);
      // 两个脚本**故意**提到 `node_modules/three`：生成器（源路径本来就该是它）
      // 与本体检脚本自己（它就是靠这条字面量去找别人的）。其余一律不许出现。
      if (['inkbox-vendor.mjs', 'inkbox-vendor-check.mjs'].includes(path.basename(target))) return;
      if (text.includes('node_modules/three')) hits.push(rel(target));
      return;
    }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) walk(path.join(target, entry.name));
  };
  for (const target of roots) walk(path.join(ROOT, target));
  assert.deepEqual(hits, [], `这些文件还在引用 node_modules/three：${hits.join(', ')}`);
});
check('OrbitControls 从裸说明符 `three` import（靠 importmap 解析，不是相对路径）', () => {
  const text = read(path.join(VENDOR, 'examples', 'jsm', 'controls', 'OrbitControls.js'));
  assert(/from 'three';/.test(text), 'OrbitControls 必须用裸说明符 three，否则 importmap 白配');
});

section('G3 · 与 npm 依赖一致（防两边版本静默分叉）');
check('vendor 版本号 === package.json 的 three 依赖', () => {
  const wanted = JSON.parse(read(path.join(ROOT, 'package.json'))).dependencies.three;
  const vendored = JSON.parse(read(path.join(VENDOR, 'package.json'))).version;
  assert.equal(vendored, wanted, `vendor 是 ${vendored}，package.json 要 ${wanted}`);
});
check('npm 依赖仍然保留（D6.3：node 测试还要从裸说明符 three 导入）', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert(pkg.dependencies?.three, 'package.json 的 three 依赖不许删');
  const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/three'].version, pkg.dependencies.three, 'lock 与依赖版本不一致');
});
check('vendor 与 node_modules 逐字节相同（装了依赖时才有意义）', () => {
  if (!fs.existsSync(path.join(NPM, 'package.json'))) {
    console.log('      （node_modules/three 不存在 ⇒ 跳过逐字节比对；干净克隆是正常情况）');
    return;
  }
  for (const relative of REQUIRED) {
    const a = fs.readFileSync(path.join(VENDOR, relative));
    const b = fs.readFileSync(path.join(NPM, relative));
    assert(a.equals(b), `${relative} 与 node_modules 里那份不一致——跑 npm run vendor:sync 重新生成`);
  }
});
check('node_modules 仍然被 .gitignore 挡住（D6.5：不许改成「所有 node_modules 都可跟踪」）', () => {
  const ignore = read(path.join(ROOT, '.gitignore'));
  assert(/^node_modules\/$/m.test(ignore), '.gitignore 必须保留 `node_modules/`');
  assert(!/^!node_modules/m.test(ignore), '不许加 `!node_modules` 之类的反忽略');
  assert(!/^vendor\/?$/m.test(ignore), 'vendor/ 不能被忽略——它就是要入库的运行时');
});

section('G4 · 打包清单');
check('打包脚本用 DIRECTORIES 递归收录 vendor/three', () => {
  const text = read(path.join(ROOT, 'scripts', 'inkbox-package.mjs'));
  // ⚠️ 这里原本是**逐字正则** `/DIRECTORIES = \['src\/inkbox', 'vendor\/three'\]/`。
  //    2026-09-29 把 `剧情文案素材/` 补进数组后它会**假红**——数组内容变了，契约没变。
  //    按纪律换成**解析数组判成员**：只要 `vendor/three` 还在就绿，丢了照样红。
  const m = text.match(/DIRECTORIES\s*=\s*\[([^\]]*)\]/);
  assert(m, '打包脚本里找不到 DIRECTORIES 声明');
  const entries = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert(entries.includes('vendor/three'), `DIRECTORIES 必须含 vendor/three，实得 [${entries.join(', ')}]`);
  assert(!text.includes("'node_modules/three/"), 'FILES 里不许再逐个列 node_modules/three 文件');
});
check('package.json 有 vendor:sync 与 test:vendor 两个入口', () => {
  const scripts = JSON.parse(read(path.join(ROOT, 'package.json'))).scripts;
  assert(scripts['vendor:sync'], '缺 vendor:sync');
  assert(scripts['test:vendor'], '缺 test:vendor');
});

console.log('\n══════════════════════════════════════════════════════════════');
if (failures.length) {
  console.log(`✗ ${failures.length} 项失败 / 共 ${passed + failures.length} 项`);
  for (const label of failures) console.log(`   · ${label}`);
  process.exitCode = 1;
} else {
  console.log(`全部通过 · ${passed} 项断言`);
}
console.log('══════════════════════════════════════════════════════════════');

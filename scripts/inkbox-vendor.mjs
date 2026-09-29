#!/usr/bin/env node
// Inkbox · 把 Three.js 运行时同步进 `vendor/`（M1.1D D6）
//
// ───────────────────────────────────────────────────────────────────────
// 为什么要有这个脚本
// ───────────────────────────────────────────────────────────────────────
//
// 浏览器侧要「**克隆即可运行、不必 `npm install`**」，就得把 Three.js 的运行时文件
// **放进仓库**。M0/M1 当时是把 `node_modules/three/*` 用 `git add -f` 硬塞进 Git——
// 功能对，但语义很脏：`node_modules` 是**包的安装产物**，不是源码；
// 而且 `.gitignore` 里那句 `node_modules/` 会让 `git add -A` **静默跳过**它们
// （已踩过一次：push 成功、远端却缺文件、线上 3D 直接加载失败）。
//
// 现在改成明确的 **vendor runtime**：
//
//     vendor/three/package.json
//     vendor/three/LICENSE
//     vendor/three/build/three.module.js
//     vendor/three/build/three.core.js
//     vendor/three/examples/jsm/controls/OrbitControls.js
//
// 本脚本负责**从 npm 依赖重新生成**这份 vendor 目录 —— 所以它永远是可审计、
// 可复现的（D6.3：`package.json` 里的 `three` 依赖**不删**，node 测试仍从它 import）。
//
// ⚠️ **只复制这 5 个文件**：Three.js 整包有几十 MB（`three.webgpu.js` 单文件就 2.2 MB），
//    而本项目只用「核心 + OrbitControls」。
//
// 用法：`node scripts/inkbox-vendor.mjs`（或 `npm run vendor:sync`）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FROM = path.join(ROOT, 'node_modules', 'three');
const TO = path.join(ROOT, 'vendor', 'three');

/** 精确清单：多一个不拷，少一个报错。 */
export const VENDOR_FILES = [
  'package.json',
  'LICENSE',
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const expected = pkg.dependencies?.three;
if (!expected) {
  console.error('package.json 里没有 three 依赖——D6.3 明确要求保留它（node 测试要用）。');
  process.exitCode = 1;
} else if (!fs.existsSync(path.join(FROM, 'package.json'))) {
  console.error(`找不到 ${path.relative(ROOT, FROM)}，先跑 npm ci / npm install。`);
  process.exitCode = 1;
} else {
  const installed = JSON.parse(fs.readFileSync(path.join(FROM, 'package.json'), 'utf8')).version;
  if (installed !== expected) {
    console.error(`版本不一致：package.json 要 ${expected}，node_modules 里是 ${installed}。`);
    process.exitCode = 1;
  } else {
    for (const relative of VENDOR_FILES) {
      const from = path.join(FROM, relative);
      if (!fs.existsSync(from)) { console.error(`源文件缺失：node_modules/three/${relative}`); process.exitCode = 1; continue; }
      const to = path.join(TO, relative);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
    if (!process.exitCode) {
      const bytes = VENDOR_FILES.reduce((sum, relative) => sum + fs.statSync(path.join(TO, relative)).size, 0);
      console.log(`vendor/three 已同步 · three ${installed} · ${VENDOR_FILES.length} 个文件 · ${(bytes / 1024 / 1024).toFixed(2)} MB`);
      for (const relative of VENDOR_FILES) console.log(`  vendor/three/${relative}`);
    }
  }
}

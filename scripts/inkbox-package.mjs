#!/usr/bin/env node
// Build a clean, standalone Inkbox package without the frozen V3/V4 tree or research probes.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP } from '../src/inkbox/core/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PACKAGE_NAME = `zuotian-guan-jing-inkbox-${APP.version}`;
const OUTPUT_DIR = path.join(DIST, PACKAGE_NAME);
const OUTPUT_ZIP = path.join(DIST, `${PACKAGE_NAME}.zip`);
fs.mkdirSync(DIST, { recursive: true });
// Keep staging beside the archive so tar receives only relative paths on Windows.
const STAGE = fs.mkdtempSync(path.join(DIST, '.inkbox-package-'));

const FILES = [
  '.gitignore',
  'README.md',
  // 交接单（D7-G）：**极短**，新模型默认读 README → HANDOFF → THREE_REALMS → 本包源码，
  // 不再先吞 8 万字的 STATUS。必须随包出货。
  'HANDOFF.md',
  'STATUS.md',
  'BACKLOG.md',
  // 三界规则表（D6-2 工程包 A）。**必须随包出货**：它是「代码必须遵守的三界规则」
  // 的唯一成文处，也是不同模型轮换开发时的长期记忆锚——干净包缺了它，
  // 下一个接手的人只能从代码里重新反推一遍规则。
  'THREE_REALMS.md',
  'PLAYER_GUIDE.md',
  '版权说明.md',
  'package.json',
  'package-lock.json',
  'inkbox.html',
  'index.html',
  'game.html',
  '启动游戏.bat',
  '启动水墨沙盒.bat',
  '快速自测.bat',
  '.github/workflows/ci.yml',
  'scripts/inkbox-server.mjs',
  'scripts/inkbox-package.mjs',
  'scripts/inkbox-import-check.mjs',
  'scripts/inkbox-core-check.mjs',
  'scripts/inkbox-startup-check.mjs',
  'scripts/inkbox-runtime-events.mjs',
  'scripts/inkbox-intervention-regression.mjs',
  'scripts/inkbox-save-equiv.mjs',
  'scripts/inkbox-playtest.mjs',
  'scripts/inkbox-smoke.mjs',
  'scripts/inkbox-longrun.mjs',
  'scripts/inkbox-three-realms.mjs',
  'scripts/inkbox-presentation.mjs',
  'scripts/inkbox-render3d.mjs',
  'scripts/inkbox-render3d-browser.mjs',
  'RENDER3D_M0.md',
  'node_modules/three/package.json',
  'node_modules/three/LICENSE',
  'node_modules/three/build/three.module.js',
  'node_modules/three/build/three.core.js',
  'node_modules/three/examples/jsm/controls/OrbitControls.js',
  'tests/README.md',
];
const DIRECTORIES = ['src/inkbox'];

function copyRelative(relative) {
  const from = path.join(ROOT, relative);
  if (!fs.existsSync(from)) throw new Error(`打包文件不存在：${relative}`);
  const to = path.join(STAGE, relative);
  copyPath(from, to);
}

function copyPath(from, to) {
  const stat = fs.statSync(from);
  if (!stat.isDirectory()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyPath(path.join(from, entry.name), path.join(to, entry.name));
    else if (entry.isFile()) copyPath(path.join(from, entry.name), path.join(to, entry.name));
  }
}

try {
  for (const relative of FILES) copyRelative(relative);
  for (const relative of DIRECTORIES) copyRelative(relative);

  const packageJson = JSON.parse(fs.readFileSync(path.join(STAGE, 'package.json'), 'utf8'));
  if (packageJson.version !== APP.version || packageJson.scripts?.build !== 'node scripts/inkbox-package.mjs') {
    throw new Error('打包包身份或 build 脚本与 Inkbox 主线不一致');
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  copyPath(STAGE, OUTPUT_DIR);
  fs.rmSync(OUTPUT_ZIP, { force: true });

  if (process.platform === 'win32') {
    const stageFromDist = path.relative(DIST, STAGE).replaceAll('\\', '/');
    const result = spawnSync('tar.exe', [
      '-a', '-c', '-f', path.basename(OUTPUT_ZIP), '-C', stageFromDist, '.',
    ], {
      cwd: DIST,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'tar.exe 打包失败');
  } else {
    const result = spawnSync('zip', ['-qr', OUTPUT_ZIP, '.'], { cwd: STAGE, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'zip 打包失败');
  }

  const fileCount = FILES.length + DIRECTORIES.reduce((n, relative) => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
      const full = path.join(dir, entry.name);
      return sum + (entry.isDirectory() ? walk(full) : 1);
    }, 0);
    return n + walk(path.join(STAGE, relative));
  }, 0);
  console.log(`Inkbox package built · v${APP.version} · ${fileCount} files`);
  console.log(path.relative(ROOT, OUTPUT_DIR).replaceAll('\\', '/'));
  console.log(path.relative(ROOT, OUTPUT_ZIP).replaceAll('\\', '/'));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(STAGE, { recursive: true, force: true });
}

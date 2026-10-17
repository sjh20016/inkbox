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

// Explicit runtime/developer package entry points. Historical reports live in Git history.
const FILES = [
  '.gitignore',
  '.gitattributes',
  'README.md',
  'HANDOFF.md',
  'BACKLOG.md',
  'ROADMAP.md',
  'ARCHITECTURE.md',
  'THREE_REALMS.md',
  'VIEW_CONTRACT.md',
  'PLAYER_GUIDE.md',
  '版权说明.md',
  'package.json',
  'package-lock.json',
  'inkbox.html',
  'cultivator-lab.html',
  'index.html',
  'game.html',
  '启动游戏.bat',
  '启动水墨沙盒.bat',
  '启动3D立体沙盘.bat',
  '快速自测.bat',
  'scripts/inkbox-launch.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/c2c-browser.yml',
  '.github/workflows/nightly.yml',
  'scripts/inkbox-server.mjs',
  'scripts/inkbox-package.mjs',
  'scripts/inkbox-package-audit.mjs',
  'scripts/inkbox-import-check.mjs',
  'scripts/inkbox-core-check.mjs',
  'scripts/inkbox-startup-check.mjs',
  'scripts/inkbox-runtime-events.mjs',
  'scripts/inkbox-intervention-regression.mjs',
  'scripts/inkbox-save-equiv.mjs',
  'scripts/inkbox-playtest.mjs',
  'scripts/inkbox-browser-smoke.mjs',
  'scripts/inkbox-browser-steady-view.mjs',
  'scripts/inkbox-smoke.mjs',
  'scripts/inkbox-longrun.mjs',
  'scripts/inkbox-three-realms.mjs',
  'scripts/inkbox-presentation.mjs',
  'scripts/inkbox-view.mjs',
  'scripts/inkbox-qol-check.mjs',
  'scripts/inkbox-g1-runtime.mjs',
  'scripts/inkbox-g1-host.mjs',
  'scripts/inkbox-g1-map.mjs',
  'scripts/inkbox-g1-longrun.mjs',
  'scripts/inkbox-g1-fixtures.mjs',
  'scripts/inkbox-g1-browser.mjs',
  'scripts/inkbox-g1-web-check.mjs',
  'scripts/inkbox-g1-integration.mjs',
  'scripts/inkbox-render3d.mjs',
  'scripts/inkbox-render3d-browser.mjs',
  'scripts/inkbox-render3d-m1.mjs',
  'scripts/inkbox-render3d-bridge.mjs',
  'scripts/inkbox-render3d-perf.mjs',
  'scripts/inkbox-render3d-m2a.mjs',
  'scripts/inkbox-render3d-m2a-browser.mjs',
  'scripts/inkbox-render3d-m2a-verify.mjs',
  'scripts/inkbox-render3d-m2b.mjs',
  'scripts/inkbox-render3d-m2b-browser.mjs',
  'scripts/inkbox-render3d-m2c.mjs',
  'scripts/inkbox-render3d-pilots.mjs',
  'scripts/inkbox-render3d-m2c-browser.mjs',
  'scripts/inkbox-render3d-m2c-soak.mjs',
  'scripts/inkbox-render3d-m2c2a.mjs',
  'scripts/inkbox-render3d-m2c2a-audit.mjs',
  'scripts/inkbox-render3d-m2c2a-browser.mjs',
  'scripts/inkbox-render3d-m2c2a-soak.mjs',
  'scripts/inkbox-render3d-m2c2a1-hlod.mjs',
  'scripts/inkbox-render3d-m2c2a1-hlod-browser.mjs',
  'scripts/inkbox-render3d-m2c2a1-forest.mjs',
  'scripts/inkbox-render3d-m2c2b0.mjs',
  'scripts/inkbox-render3d-m2c2b0-browser.mjs',
  'scripts/inkbox-render3d-m2c2b0-soak.mjs',
  'scripts/inkbox-environment-glb-reader.mjs',
  'scripts/inkbox-render3d-m2c2b-sample.mjs',
  'scripts/inkbox-render3d-m2c2b-sample-browser.mjs',
  'scripts/inkbox-realm-style-proof.mjs',
  'scripts/inkbox-realm-plane-proof.mjs',
  'scripts/inkbox-realm-cross-proof.mjs',
  'scripts/inkbox-realm-performance.mjs',
  'scripts/inkbox-png-diagnostics.mjs',
  'scripts/inkbox-m2c-image-metrics.py',
  'VISUAL_SCENARIO_SPEC.md',
  'ARTPASS_PROFILE.md',
  'ENTITY_PRESENTATION_CONTRACT.md',
  'ASSET_PRODUCTION_SPEC.md',
  'M2C2C_WORLD_SEMANTIC_MAP.md',
  'scripts/inkbox-render3d-m2c2b1.mjs',
  'scripts/inkbox-render3d-m2c2c-sites.mjs',
  'scripts/inkbox-render3d-m2c2c.mjs',
  'scripts/inkbox-render3d-m2c2c-leylines.mjs',
  'scripts/inkbox-render3d-m2c2c-fields.mjs',
  'scripts/inkbox-render3d-m2c2c-rifts.mjs',
  'scripts/inkbox-render3d-m2c2c-rift-wounds.mjs',
  'scripts/inkbox-render3d-m2c2c-purity.mjs',
  'scripts/inkbox-render3d-m2c2c-browser.mjs',
  'scripts/inkbox-render3d-m2c2c-soak.mjs',
  'scripts/inkbox-upper-qi-spatial-proof.mjs',
  'scripts/inkbox-c2c-test-utils.mjs',
  'scripts/inkbox-render3d-m2c2c-pilot-browser.mjs',
  'scripts/inkbox-c2c-browser-fixtures.mjs',
  'scripts/inkbox-render3d-m2c2d.mjs',
  'scripts/inkbox-render3d-m2c2d-browser.mjs',
  'scripts/inkbox-render3d-m2c2d-metrics.mjs',
  'scripts/inkbox-render3d-m2c2d1.mjs',
  'scripts/inkbox-render3d-m2c2d1-browser.mjs',
  'scripts/inkbox-render3d-m2c2d1-decomposition.mjs',
  'scripts/inkbox-render3d-m2c2d1-diagnostics.mjs',
  'scripts/inkbox-render3d-m2c2d1-framebuffer.mjs',
  'scripts/inkbox-render3d-m2c2d1-comparison.mjs',
  'scripts/inkbox-render3d-m2c2e-geometry.mjs',
  'scripts/inkbox-m2c2e-creation.mjs',
  'scripts/inkbox-m2c2e-generation.mjs',
  'scripts/inkbox-m2c2e-sculpt.mjs',
  'scripts/inkbox-m2c2e-expansion.mjs',
  'scripts/inkbox-render3d-m2c2e-browser.mjs',
  'scripts/inkbox-render3d-m2c2e-soak.mjs',
  '美术素材/参考资产索引.md',
  'scripts/cdp.mjs',
  'scripts/inkbox-vendor.mjs',
  'scripts/inkbox-vendor-check.mjs',
  'scripts/build-cultivator-assets.py',
  'scripts/character-blender-runtime.mjs',
  'scripts/inkbox-characters-check.mjs',
  'scripts/inkbox-characters-browser.mjs',
  'tests/README.md',
  'REALM_STYLE_PROFILE_SPEC.md',
  'M2C2B_SEMANTIC_ASSET_BINDING.md',
  'scripts/inkbox-render3d-m2c2b-content.mjs',
  'scripts/inkbox-render3d-m2c2b-content-browser.mjs',
  'scripts/inkbox-render3d-m2c2b-decorations.mjs',
  'scripts/inkbox-render3d-m2c2b-decorations-browser.mjs',
  'scripts/inkbox-render3d-m2c2b-artifacts.mjs',
  'scripts/inkbox-product-frame-timing.mjs',
  'scripts/inkbox-render3d-m2c2b-matrix.mjs',
  'scripts/inkbox-render3d-m2c2b-browser.mjs',
  'scripts/inkbox-render3d-m2c2b-purity.mjs',
  'scripts/inkbox-render3d-m2c2b-soak.mjs',
  '美术素材/三界视觉风格规划_美术方向文档_v1.md',
  'AGENTS.md',
  'LONG_TERM_DIRECTION.md',
];
// ⚠️ Three.js 运行时走**仓库内的 `vendor/three/`**（M1.1D D6），不再从 `node_modules/`
//    里硬塞文件——那是**包的安装产物**，不是源码，而且会被 `.gitignore` 静默挡住。
//    `vendor/` 由 `scripts/inkbox-vendor.mjs` 从 npm 依赖重新生成（5 个文件 · ~2 MB），
//    所以它永远可审计、可复现；`package.json` 里的 `three` 依赖**保留**给 node 测试用。
//    ⚠️ 用 DIRECTORIES 递归收录 ⇒ 以后往 vendor 里加文件**不必改这份清单**。
//    `剧情文案素材/`（2026-09-29 补齐）：`00_文案使用说明（AI与开发者必读）.md` 是
//    `HANDOFF.md` §4 列为**有约束力**的文档（UI 禁令 / 考古定名不得擅改 / 机制缺口→停走设计流程），
//    且 `core/lore.js`、`sim/reincarnation.js`、`world/World.js`、`scripts/inkbox-smoke.mjs`
//    共 5 处注释引用它的行号作为**定名出处** ⇒ 不入包则接手者读不到规则、代码注释悬空。
const DIRECTORIES = [
  'src/inkbox',
  'vendor/three',
  '剧情文案素材',
  'assets/characters/cultivator/mesh',
  'assets/characters/cultivator/data',
  'assets/characters/cultivator/materials',
  'assets/characters/cultivator/docs',
  'assets/environment/mesh',
  'assets/environment/data',
  'assets/environment/materials',
  'assets/environment/docs',
];
// Historical release evidence is kept in Git history, not in the runtime ZIP.
const RELEASE_SUMMARIES = [];

function copyRelative(relative) {
  const from = path.join(ROOT, relative);
  if (!fs.existsSync(from)) throw new Error(`打包文件不存在：${relative}`);
  const to = path.join(STAGE, relative);
  copyPath(from, to);
}

function rewritePackageDocumentation() {
  const excluded = new Map();
  const markdownFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) markdownFiles.push(full);
    }
  };
  walk(STAGE);

  for (const file of markdownFiles) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/(!?)\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\s*\)/g,
      (whole, imagePrefix, label, rawTarget) => {
        const target = rawTarget.startsWith('<') && rawTarget.endsWith('>')
          ? rawTarget.slice(1, -1) : rawTarget;
        if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) return whole;
        const pathname = target.split(/[?#]/, 1)[0];
        if (!pathname) return whole;
        let decoded = pathname;
        try { decoded = decodeURIComponent(pathname); } catch { /* Keep literal path for diagnostics. */ }
        const resolved = path.resolve(path.dirname(file), decoded);
        if (resolved === STAGE || resolved.startsWith(`${STAGE}${path.sep}`)) {
          if (fs.existsSync(resolved)) return whole;
        }
        const relativeSource = path.relative(STAGE, file).replaceAll('\\', '/');
        const key = `${relativeSource} → ${decoded}`;
        excluded.set(key, { source: relativeSource, target: decoded, label: label || decoded });
        return `开发资料，运行包不附带：${label || decoded}（\`${decoded}\`）`;
      });
    fs.writeFileSync(file, content);
  }

  // This link was present in the source README before its destination was corrected.
  // Retain an explicit trail in the package even after the README points to CHARACTER_SPEC.
  excluded.set('README.md → assets/characters/cultivator/docs/COMPLETION_REPORT.md', {
    source: 'README.md',
    target: 'assets/characters/cultivator/docs/COMPLETION_REPORT.md',
    label: 'COMPLETION_REPORT.md（源工作区历史链接；当前README已改为CHARACTER_SPEC.md）',
  });

  const rows = [...excluded.values()].sort((a, b) => `${a.source} ${a.target}`.localeCompare(`${b.source} ${b.target}`));
  const lines = [
    '# 开发资料清单',
    '',
    '以下资料只用于开发、制作或历史记录，运行包不附带。正文中的对应引用已在打包时替换为明确说明。',
    '',
    '| 引用文档 | 开发资料路径 |',
    '| --- | --- |',
    ...rows.map(row => `| \`${row.source}\` | \`${row.target}\` |`),
    '',
  ];
  fs.writeFileSync(path.join(STAGE, '开发资料清单.md'), lines.join('\n'));
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

function countFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const full = path.join(dir, entry.name);
    return sum + (entry.isDirectory() ? countFiles(full) : entry.isFile() ? 1 : 0);
  }, 0);
}

function removeOutputDirectory() {
  const absoluteDist = path.resolve(DIST);
  const absoluteOutput = path.resolve(OUTPUT_DIR);
  if (!absoluteOutput.startsWith(`${absoluteDist}${path.sep}`)) {
    throw new Error(`拒绝清理发布目录范围外路径：${OUTPUT_DIR}`);
  }
  fs.rmSync(absoluteOutput, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (fs.existsSync(absoluteOutput) && process.platform === 'win32') {
    const script = [
      "$target = [System.IO.Path]::GetFullPath($env:INKBOX_PACKAGE_OUTPUT)",
      "$dist = [System.IO.Path]::GetFullPath($env:INKBOX_PACKAGE_DIST) + [System.IO.Path]::DirectorySeparatorChar",
      'if (-not $target.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove outside dist: $target" }',
      'Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop',
    ].join('; ');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, INKBOX_PACKAGE_OUTPUT: absoluteOutput, INKBOX_PACKAGE_DIST: absoluteDist },
    });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || '无法清理旧发布目录');
  }
  if (fs.existsSync(absoluteOutput)) throw new Error(`旧发布目录未能移除：${absoluteOutput}`);
}

function removeStageDirectory() {
  const absoluteDist = path.resolve(DIST);
  const absoluteStage = path.resolve(STAGE);
  if (!absoluteStage.startsWith(`${absoluteDist}${path.sep}`)) {
    throw new Error(`拒绝清理发布目录范围外路径：${STAGE}`);
  }

  let removalError = null;
  try {
    fs.rmSync(absoluteStage, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    removalError = error;
  }

  // Windows may transiently retain copied files (for example, while an indexer
  // has them open). Use the same guarded PowerShell fallback as the release dir.
  if (fs.existsSync(absoluteStage) && process.platform === 'win32') {
    const script = [
      "$target = [System.IO.Path]::GetFullPath($env:INKBOX_PACKAGE_STAGE)",
      "$dist = [System.IO.Path]::GetFullPath($env:INKBOX_PACKAGE_DIST) + [System.IO.Path]::DirectorySeparatorChar",
      'if (-not $target.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove outside dist: $target" }',
      'Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop',
    ].join('; ');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, INKBOX_PACKAGE_STAGE: absoluteStage, INKBOX_PACKAGE_DIST: absoluteDist },
    });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || removalError?.message || '无法清理打包暂存目录');
  }
  if (fs.existsSync(absoluteStage)) {
    throw new Error(`打包暂存目录未能移除：${absoluteStage}${removalError ? ` (${removalError.message})` : ''}`);
  }
}

try {
  for (const relative of FILES) copyRelative(relative);
  for (const relative of DIRECTORIES) copyRelative(relative);
  for (const relative of RELEASE_SUMMARIES) copyRelative(relative);

  // Source production acceptance needs the editable Blender master; the runtime package
  // intentionally contains only mesh/data/materials. Keep the full check in the repo.
  const packageJsonPath = path.join(STAGE, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.scripts['test:characters'] = `${packageJson.scripts['test:characters']} --runtime-only`;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  rewritePackageDocumentation();

  if (packageJson.version !== APP.version || packageJson.scripts?.build !== 'node scripts/inkbox-package.mjs') {
    throw new Error('打包包身份或 build 脚本与 Inkbox 主线不一致');
  }

  const audit = spawnSync(process.execPath, ['scripts/inkbox-package-audit.mjs', STAGE], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (audit.status !== 0) throw new Error(audit.error?.message || audit.stderr || audit.stdout || 'Inkbox package audit failed');
  if (audit.stdout) process.stdout.write(audit.stdout);

  removeOutputDirectory();
  copyPath(STAGE, OUTPUT_DIR);

  const outputAudit = spawnSync(process.execPath, ['scripts/inkbox-package-audit.mjs', OUTPUT_DIR], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (outputAudit.status !== 0) throw new Error(outputAudit.error?.message || outputAudit.stderr || outputAudit.stdout || 'Copied package audit failed');
  if (outputAudit.stdout) process.stdout.write(outputAudit.stdout);

  fs.rmSync(OUTPUT_ZIP, { force: true });

  if (process.platform === 'win32') {
    const stageFromDist = path.relative(DIST, STAGE).replaceAll('\\', '/');
    const result = spawnSync('tar.exe', [
      '-a', '-c', '--options', 'zip:hdrcharset=UTF-8',
      '-f', path.basename(OUTPUT_ZIP), '-C', stageFromDist, '.',
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

  const fileCount = countFiles(STAGE);
  console.log(`Inkbox package built · v${APP.version} · ${fileCount} files`);
  console.log(path.relative(ROOT, OUTPUT_DIR).replaceAll('\\', '/'));
  console.log(path.relative(ROOT, OUTPUT_ZIP).replaceAll('\\', '/'));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  removeStageDirectory();
}

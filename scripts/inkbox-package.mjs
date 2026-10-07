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
  // 行尾策略（M1.1D D6）：钉住 `vendor/three/**` 为 LF，否则 `core.autocrlf=true` 的机器
  // 克隆后 vendored 运行时会被转成 CRLF，`test:vendor` 的逐字节断言会假红。必须随包出货。
  '.gitattributes',
  'README.md',
  // 交接单（D7-G）：**极短**，新模型默认读 README → HANDOFF → THREE_REALMS → 本包源码，
  // 不再先吞 8 万字的 STATUS。必须随包出货。
  'HANDOFF.md',
  'STATUS.md',
  'BACKLOG.md',
  // 路线图（M1.1D D7）：**极短**，让下一个接手的人 30 秒知道项目在哪一步。
  'ROADMAP.md',
  'ARCHITECTURE.md',
  // 三界规则表（D6-2 工程包 A）。**必须随包出货**：它是「代码必须遵守的三界规则」
  // 的唯一成文处，也是不同模型轮换开发时的长期记忆锚——干净包缺了它，
  // 下一个接手的人只能从代码里重新反推一遍规则。
  'THREE_REALMS.md',
  // 视界契约（D8-A）：**必须随包出货**。它是「视界是什么 / 什么不许做」的唯一成文处
  // （一个时刻只一扇窗 / 不进存档 / 观察不改目标位面 / 划开仍开缝 / D8 不调裂隙数值…），
  // 与 THREE_REALMS.md 分工：那份管**三界规则**，这份管**观察层契约**。
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
  // 玩家启动器（M2-B）：模式 → URL 的映射 / 就绪轮询 / 复用已在跑的服务器都在这里，
  // `.bat` 只是它的薄壳。**必须随包出货**，否则三个 .bat 全都点不动。
  'scripts/inkbox-launch.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/c2c-browser.yml',
  // 长测（smoke + 800 年长跑）**不进** ci.yml，单独按天跑（M1.1D D3.5）。
  // 必须随包出货：接手的人要知道「慢测去哪了」，否则会以为项目没有长测。
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
  'scripts/inkbox-render3d.mjs',
  'scripts/inkbox-render3d-browser.mjs',
  // ⚠️ 这个脚本用外部 Playwright（`INKBOX_PLAYWRIGHT`），本机默认装不到 ⇒ 它是**可选** QA。
  //    真正的性能基线走下面的 `inkbox-render3d-perf.mjs`（零依赖 CDP）。
  // Render3D M1（3D 世界实体可见化）的自动测试。**必须随包出货**：
  // M0 的脚本在上面，M1 的漏了就是「发布了功能却不发布它的测试」——
  // 下一个接手的人跑 `npm run test:render3d:m1` 会直接找不到文件。
  'scripts/inkbox-render3d-m1.mjs',
  // M1.1D 新增：dirty 分类回归 + 零依赖性能基线。
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
  'M2C2A_BASELINE.md',
  'M2C2A_LOD_REPORT.md',
  'M2C2A_PERFORMANCE_REPORT.md',
  'M2C2A_VISUAL_ACCEPTANCE.md',
  '《坐天观井 Inkbox · M2-C2A 实体 LODHLOD 与密度预算封板》.md',
  'scripts/inkbox-m2c-image-metrics.py',
  'M2C_EXPRESSIVE_INK_REPORT.md',
  'BASELINE_TEST_COUNTS.md',
  'VISUAL_SCENARIO_SPEC.md',
  'ARTPASS_PROFILE.md',
  'ENTITY_PRESENTATION_CONTRACT.md',
  'ASSET_PRODUCTION_SPEC.md',
  'M2C2C_WORLD_SEMANTIC_MAP.md',
  'M2C2C_MEANINGFUL_GEOGRAPHY_REPORT.md',
  'M2C2C_PERFORMANCE_REPORT.md',
  'M2C2C_VISUAL_ACCEPTANCE.md',
  'M2C2C_READINESS.md',
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
  // M2-C2D 近景绘画化与界缘统一（2026-10-07）：三条验收入口 + 四份交付报告。
  // 与 C2C 同理——不随包出货，接手者在包里就看不到本阶段的固定镜头配方与
  // 视觉/性能裁决依据（`package.json` 的 `test:render3d:m2c2d*` 会指向空文件）。
  'scripts/inkbox-render3d-m2c2d.mjs',
  'scripts/inkbox-render3d-m2c2d-browser.mjs',
  'scripts/inkbox-render3d-m2c2d-metrics.mjs',
  'scripts/inkbox-render3d-m2c2d1.mjs',
  'scripts/inkbox-render3d-m2c2d1-browser.mjs',
  'scripts/inkbox-render3d-m2c2d1-decomposition.mjs',
  'scripts/inkbox-render3d-m2c2d1-diagnostics.mjs',
  'scripts/inkbox-render3d-m2c2d1-framebuffer.mjs',
  'scripts/inkbox-render3d-m2c2d1-comparison.mjs',
  'M2C2D1_BASELINE.md',
  'M2C2D1_FOLLOWUPS.md',
  'M2C2D1_PERFORMANCE_REPORT.md',
  'M2C2D1_READINESS.md',
  'M2C2D1_VISUAL_ACCEPTANCE.md',
  'M2C2D_BASELINE.md',
  'M2C2D_VISUAL_ACCEPTANCE.md',
  'M2C2D_PERFORMANCE_REPORT.md',
  'M2C2D_READINESS.md',
  'PERFORMANCE_REPORT.md',
  'VISUAL_ACCEPTANCE.md',
  '美术素材/参考资产索引.md',
  '美术素材/《坐天观井》M2-C：写意渲染基线与可扩展实体试装.md',
  // 零依赖 CDP 胶水层：性能基线复用本机 Edge/Chrome 靠它。**必须随包出货**，
  // 否则 `npm run test:render3d:perf` 会以「找不到模块」开场。
  'scripts/cdp.mjs',
  // vendor 目录的生成器与体检（M1.1D D6）。
  'scripts/inkbox-vendor.mjs',
  'scripts/inkbox-vendor-check.mjs',
  'scripts/build-cultivator-assets.py',
  'scripts/character-blender-runtime.mjs',
  'scripts/inkbox-characters-check.mjs',
  'scripts/inkbox-characters-browser.mjs',
  'RENDER3D_M0.md',
  'Render3D M1 工程报告.md',
  // M1.1D 的委托书与工程报告：接手的人要能看到「这一阶段到底做了什么、为什么」。
  'Render3D M1.1D 工程任务清单.md',
  'Render3D M1.1D 工程报告.md',
  '坐天观井 · Render3D M2-A 架构原型工程委托书.md',
  'Render3D M2-A 架构原型工程报告.md',
  // M2-B 的委托书与工程报告（2026-10-01）。同一类**悬空引用**风险：
  // ROADMAP 指向 M2-B 工程报告，报告又引用 M2-B 委托书；不随包出货，
  // 接手的人在包里就看不到「这一阶段的范围与裁决依据」。
  '坐天观井 · Render3D M2-B 完整视界与界缘工程委托书.md',
  'Render3D M2-B 工程报告.md',
  // 被包内文档引用、但此前只在开发工作区存在的开发文档（2026-09-29 补齐）。
  // ⚠️ 不补就是**悬空引用**：`STATUS.md` 写着「规划见 D7 / D8 …」，`STATUS.md` 与
  //    `Render3D M1 工程报告.md` 又引用 M1 的委托书——接手的人在包里找不到这些文件。
  //    注意 M1.1D 的委托书（`Render3D M1.1D 工程任务清单.md`）本来就在包里，
  //    M1 的委托书却不在，这本身就是不一致。
  '坐天观井 · 下一阶段工程委托书.md',
  'D7「观察与表现层」早期规划已完成.md',
  'D8视界 2.0 · 穿透式跨界观察早期规划完成至F部分.md',
  'Inkbox M0 · 立体沙盘迁移技术原型.md',
  'tests/README.md',
  'M2C2A1_PACKAGE_REPORT.md',
  'M2C2A1_BASELINE.md',
  'M2C2A1_HLOD_REPORT.md',
  'M2C2A1_FOREST_REPORT.md',
  'M2C2A1_CLOSEOUT_REPORT.md',
  'REALM_STYLE_PROFILE_SPEC.md',
  'M2C2B0_VISUAL_REPORT.md',
  'M2C2B0_PERFORMANCE_REPORT.md',
  'M2C2B0_VISUAL_ACCEPTANCE.md',
  'M2C2B0_READINESS.md',
  'M2C2B_SEMANTIC_ASSET_BINDING.md',
  'M2C2B_ASSET_PRODUCTION_REPORT.md',
  'M2C2B_REALM_CONTENT_REPORT.md',
  'M2C2B_PERFORMANCE_REPORT.md',
  'M2C2B_VISUAL_ACCEPTANCE.md',
  'M2C2B_READINESS.md',
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
  '美术素材/Inkbox_M2-C2A.1_M2-C2B0_三界视觉基线工程委托书_v1.md',
  '美术素材/三界视觉风格规划_美术方向文档_v1.md',
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
const RELEASE_SUMMARIES = [
  'reports/release/render3d-m2c2d/summary/acceptance-summary.json',
  'reports/release/render3d-m2c2d1/summary/acceptance-summary.json',
  'reports/release/render3d-m2c2c/summary/acceptance-summary.json',
  'reports/release/render3d-m2a/performance.json',
  'reports/release/render3d-m2c2a/acceptance-summary.json',
  'reports/release/render3d-m2c2a/tree-gate.json',
  'reports/release/render3d-m2c2b-pass1/b0-summary.json',
  'reports/release/render3d-m2c2b-pass1/sample-summary.json',
  'reports/release/render3d-m2c2b-pass1/family-summary.json',
  'reports/release/render3d-m2c2b-pass1/hall-summary.json',
  'reports/release/render3d-m2c2b-pass1/content-summary.json',
  'reports/release/render3d-m2c2b-pass1/decorations-summary.json',
  'reports/release/render3d-m2c2b-pass1/artifacts-summary.json',
  'reports/release/render3d-m2c2b-pass1/matrix-summary.json',
  'reports/release/render3d-m2c2b-pass1/durability-summary.json',
  'reports/release/render3d-m2c2b-pass1/acceptance-summary.json',
];

function copyRelative(relative) {
  let from = path.join(ROOT, relative);
  // The editable checkout may archive historical root documents. Preserve the
  // package's established document paths so historical links still resolve.
  if (!fs.existsSync(from) && !relative.includes('/') && relative.endsWith('.md')) {
    const archived = path.join(ROOT, '历史委托书', relative);
    if (fs.existsSync(archived)) from = archived;
  }
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

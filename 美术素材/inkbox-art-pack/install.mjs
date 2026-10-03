#!/usr/bin/env node
// 墨界美术包 · 安装器（只依赖 Node ≥ 18，无 npm 依赖）
//
//   node install.mjs <inkbox 仓库根目录>            安装
//   node install.mjs <inkbox 仓库根目录> --check     只检查，不写任何文件
//   node install.mjs <inkbox 仓库根目录> --revert    按备份回滚
//
// 做三件事：
//   1. 把 files/ 下的新增文件原样复制进仓库（已存在且内容不同 ⇒ 先备份）；
//   2. 对 patches.json 里的 N 处"锚点替换"逐条执行：锚点必须在目标文件中**恰好出现一次**，
//      否则整次安装中止、**一个文件都不改**（先全量校验，再写入）；自动适配 CRLF / LF；
//   3. 把改动过的文件原版存进 <仓库>/.art-pack-backup/，--revert 靠它还原；新增文件则删除。
// 幂等：重复安装会发现"已安装"并直接退出。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const repo = args.find((a) => !a.startsWith('--'));
const flags = new Set(args.filter((a) => a.startsWith('--')));
if (!repo) { console.error('用法：node install.mjs <inkbox 仓库根目录> [--check|--revert]'); process.exit(2); }
const ROOT = path.resolve(repo);
const BACKUP = path.join(ROOT, '.art-pack-backup');
const MARK = path.join(BACKUP, 'INSTALLED.json');

const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };
if (!fs.existsSync(path.join(ROOT, 'src/inkbox/render3d/Render3DHost.js'))) die(`这不像 inkbox 仓库根目录（找不到 src/inkbox/render3d/Render3DHost.js）：${ROOT}`);

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full, base) : [path.relative(base, full)];
});

// ── 回滚 ────────────────────────────────────────────────────────
if (flags.has('--revert')) {
  if (!fs.existsSync(MARK)) die('没有找到安装记录（.art-pack-backup/INSTALLED.json），无需回滚。');
  const rec = JSON.parse(fs.readFileSync(MARK, 'utf8'));
  for (const rel of rec.modified) fs.copyFileSync(path.join(BACKUP, 'orig', rel), path.join(ROOT, rel));
  for (const rel of rec.added) fs.rmSync(path.join(ROOT, rel), { force: true });
  for (const dir of rec.addedDirs.sort((a, b) => b.length - a.length)) { try { fs.rmdirSync(path.join(ROOT, dir)); } catch { /* 非空则保留 */ } }
  fs.rmSync(BACKUP, { recursive: true, force: true });
  console.log(`✓ 已回滚：还原 ${rec.modified.length} 个文件，移除 ${rec.added.length} 个新增文件。`);
  process.exit(0);
}

if (fs.existsSync(MARK)) { console.log('已安装过（.art-pack-backup/INSTALLED.json 存在）。如需重装请先 --revert。'); process.exit(0); }

// ── 校验阶段：不写任何东西 ───────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'patches.json'), 'utf8'));
const byFile = new Map();
for (const e of manifest.edits) { if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); }

const plan = [];
const problems = [];
for (const [rel, edits] of byFile) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { problems.push(`缺文件：${rel}`); continue; }
  const original = fs.readFileSync(full, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let text = original;
  edits.forEach((e, i) => {
    const o = e.old.replaceAll('\n', eol), n = e.new.replaceAll('\n', eol);
    const count = text.split(o).length - 1;
    if (count !== 1) { problems.push(`${rel} 第 ${i + 1} 处锚点出现 ${count} 次（应为 1）：${JSON.stringify(e.old.slice(0, 60))}`); return; }
    text = text.replace(o, () => n);
  });
  plan.push({ rel, original, text });
}
const overlay = walk(path.join(HERE, 'files'));
const overwrites = overlay.filter((rel) => fs.existsSync(path.join(ROOT, rel)));

if (problems.length) {
  console.error(`✗ 校验失败，未改动任何文件。仓库与本包所基于的版本（M2-A final cleanup）不一致：`);
  for (const p of problems) console.error('  - ' + p);
  console.error('  → 把这份输出连同 AI_EXECUTION_PLAN.md 交给 AI，让它按"意图"而不是按锚点手工接入。');
  process.exit(1);
}
console.log(`校验通过：${manifest.edits.length} 处补丁（${plan.length} 个文件）+ ${overlay.length} 个新增文件` + (overwrites.length ? `（其中 ${overwrites.length} 个会覆盖同名文件，已备份）` : ''));
if (flags.has('--check')) process.exit(0);

// ── 写入阶段 ────────────────────────────────────────────────────
fs.mkdirSync(path.join(BACKUP, 'orig'), { recursive: true });
const modified = [];
for (const { rel, original, text } of plan) {
  const dest = path.join(BACKUP, 'orig', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, original);
  fs.writeFileSync(path.join(ROOT, rel), text);
  modified.push(rel);
}
const added = [], addedDirs = new Set();
for (const rel of overlay) {
  const dest = path.join(ROOT, rel);
  if (fs.existsSync(dest)) {
    const b = path.join(BACKUP, 'orig', rel);
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(dest, b); modified.push(rel);
  } else {
    added.push(rel);
    for (let d = path.dirname(rel); d && d !== '.'; d = path.dirname(d)) if (!fs.existsSync(path.join(ROOT, d))) addedDirs.add(d);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(HERE, 'files', rel), dest);
}
fs.writeFileSync(MARK, JSON.stringify({ version: manifest.version, at: new Date().toISOString(), modified, added, addedDirs: [...addedDirs] }, null, 1));
console.log(`✓ 安装完成：改动 ${plan.length} 个文件，新增 ${added.length} 个。`);
console.log('  启动：npm run dev  →  打开 inkbox.html?renderer=3d&art=ink');
console.log('  回滚：node install.mjs <仓库> --revert');

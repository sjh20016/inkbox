// A1 QA · 命令门禁串行执行器（阶段 B）
//
// 目的：按 A1_TEAM.md §4 清单串行跑 npm 命令，逐项记录：
//   命令、退出码、耗时、输出尾部（tail）、是否超时、完整日志文件路径。
// 不修改产品代码、不 npm install；只跑 package.json 里已定义的脚本（未定义则 SKIP 并记录）。
//
// 输出：reports/a1/gates/gates.json + reports/a1/gates/<序号>-<id>.log
//
// 运行：node scripts/inkbox-a1-gates.mjs
//   A1_GATES_TIMEOUT_MS=900000   单条命令硬超时（默认 15min；超时 kill 进程树并记 timeout）
//   A1_GATES_ONLY=a,b            只跑指定 id（逗号分隔，便于失败后复跑单条）
//   A1_GATES_SKIP=a,b            跳过指定 id
//   A1_GATES_INCLUDE_OPTIONAL=0  不跑可选补充命令（默认跑）
//
// 注意：test:characters:browser / test:creatures / test:busanzi 会启动真实 Edge（GPU 串行），
//       本脚本必须在本机没有其他 QA/开发浏览器实例时单独运行。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/a1/gates'));
const TIMEOUT_MS = Math.max(60000, Number(process.env.A1_GATES_TIMEOUT_MS || 900000));
const ONLY = String(process.env.A1_GATES_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const SKIP = new Set(String(process.env.A1_GATES_SKIP || '').split(',').map(s => s.trim()).filter(Boolean));
const INCLUDE_OPTIONAL = process.env.A1_GATES_INCLUDE_OPTIONAL !== '0';

// 顺序即执行顺序：CPU 门禁在前，浏览器门禁居中，build/test:package 最后（test:package 依赖 build 产物）。
const COMMANDS = [
  { id: 'npm-test', label: 'npm test（core）', command: 'npm test', required: true },
  { id: 'test-characters', label: 'npm run test:characters（修士资产结构）', command: 'npm run test:characters', required: true },
  { id: 'test-characters-browser', label: 'npm run test:characters:browser（真实浏览器修士）', command: 'npm run test:characters:browser', required: true, browser: true },
  { id: 'test-creatures', label: 'npm run test:creatures（异兽资产/浏览器）', command: 'npm run test:creatures', required: true, browser: true },
  { id: 'test-busanzi', label: 'npm run test:busanzi（卜算子资产/浏览器）', command: 'npm run test:busanzi', required: true, browser: true },
  { id: 'check-ui', label: 'npm run check:ui（G1 Web / QoL / 视界 / 表现）', command: 'npm run check:ui', required: true },
  { id: 'test-render3d', label: 'npm run test:render3d', command: 'npm run test:render3d', required: true },
  { id: 'test-g2', label: 'npm run test:g2（G2 回归）', command: 'npm run test:g2', required: true },
  { id: 'build', label: 'npm run build', command: 'npm run build', required: true },
  { id: 'test-package', label: 'npm run test:package', command: 'npm run test:package', required: true },
  { id: 'test-g1-web', label: 'npm run test:g1:web（补充）', command: 'npm run test:g1:web', required: false },
  { id: 'test-qol', label: 'npm run test:qol（补充）', command: 'npm run test:qol', required: false },
  { id: 'test-view', label: 'npm run test:view（补充）', command: 'npm run test:view', required: false },
  { id: 'test-presentation', label: 'npm run test:presentation（补充）', command: 'npm run test:presentation', required: false },
];

const report = {
  startedAt: new Date().toISOString(),
  timeoutMs: TIMEOUT_MS,
  git: null,
  commands: [],
  pass: false,
};
fs.mkdirSync(OUT, { recursive: true });

const npmScripts = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return Object.keys(pkg.scripts || {});
  } catch (error) {
    return { error: error.message };
  }
})();
report.availableScripts = npmScripts;

report.git = (() => {
  try {
    return {
      head: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
      branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
      status: execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(Boolean),
    };
  } catch (error) { return { error: error.message }; }
})();

function scriptExistsFor(command) {
  const match = /^npm run ([\w:.-]+)$/.exec(command);
  if (!match) return true;
  if (Array.isArray(npmScripts)) return npmScripts.includes(match[1]);
  return true;
}

function persist() {
  try {
    fs.writeFileSync(path.join(OUT, 'gates.json.tmp'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.renameSync(path.join(OUT, 'gates.json.tmp'), path.join(OUT, 'gates.json'));
  } catch (error) {
    console.error('persist failed:', error.message);
  }
}

function runCommand(entry, logFile) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    const tail = [];
    const pushTail = (chunk) => {
      const text = String(chunk);
      logStream.write(text);
      tail.push(text);
      while (tail.join('').length > 20000) tail.shift();
    };
    logStream.write(`$ ${entry.command}\n# cwd: ${ROOT}\n# started: ${new Date().toISOString()}\n\n`);
    // Windows 上 npm 是 .cmd；用 shell 执行最稳（命令来自本文件的静态清单，无外部输入）。
    const child = spawn(entry.command, {
      cwd: ROOT, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    const timer = setTimeout(() => {
      entry.timedOut = true;
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* already exited */ }
      try { child.kill(); } catch { /* already exited */ }
    }, TIMEOUT_MS);
    child.stdout.on('data', pushTail);
    child.stderr.on('data', pushTail);
    child.on('error', (error) => {
      clearTimeout(timer);
      entry.error = error.message;
      logStream.end();
      entry.exitCode = null;
      entry.durationMs = Date.now() - startedAt;
      resolve(entry);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      entry.exitCode = code;
      entry.durationMs = Date.now() - startedAt;
      entry.tail = tail.join('').split('\n').slice(-40).join('\n');
      logStream.end();
      // 进程已退出后确保没有遗留进程树（npm 子进程理论上已被 close 覆盖）
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* exited */ }
      resolve(entry);
    });
  });
}

try {
  const selected = COMMANDS.filter(item => (ONLY.length ? ONLY.includes(item.id) : true)
    && !SKIP.has(item.id)
    && (item.required || INCLUDE_OPTIONAL));
  console.log(`A1 gates: ${selected.length}/${COMMANDS.length} commands · timeout/command=${TIMEOUT_MS}ms · log dir=${path.relative(ROOT, OUT)}`);
  persist();
  let index = 0;
  for (const item of selected) {
    index += 1;
    const entry = {
      id: item.id, label: item.label, command: item.command,
      required: item.required, browser: Boolean(item.browser), exitCode: null, durationMs: 0, timedOut: false,
    };
    if (!scriptExistsFor(item.command)) {
      entry.skipped = true;
      entry.skipReason = `package.json 未定义脚本：${item.command}（Lead 待接线）`;
      console.log(`SKIP ${item.id} — ${entry.skipReason}`);
      report.commands.push(entry);
      persist();
      continue;
    }
    const logFile = path.join(OUT, `${String(index).padStart(2, '0')}-${item.id}.log`);
    entry.log = path.relative(ROOT, logFile).replace(/\\/g, '/');
    console.log(`\n[${index}/${selected.length}] ${item.label} ...`);
    await runCommand(entry, logFile);
    if (entry.timedOut) entry.error = `命令超时 ${TIMEOUT_MS}ms，已强制结束进程树`;
    entry.pass = entry.exitCode === 0 && !entry.timedOut;
    console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${item.id} exit=${entry.exitCode} ${Math.round(entry.durationMs / 1000)}s · ${entry.log}`);
    report.commands.push(entry);
    persist();
  }
  const failed = report.commands.filter(c => !c.pass && !c.skipped);
  const skipped = report.commands.filter(c => c.skipped);
  report.pass = failed.length === 0;
  report.finishedAt = new Date().toISOString();
  persist();
  console.log('\n================ A1 GATES SUMMARY ================');
  console.log(`PASS=${report.commands.filter(c => c.pass).length} FAIL=${failed.length} SKIP=${skipped.length} · ${path.relative(ROOT, path.join(OUT, 'gates.json'))}`);
  for (const entry of report.commands) {
    console.log(`${entry.skipped ? 'SKIP' : entry.pass ? 'PASS' : 'FAIL'} ${entry.id} exit=${entry.exitCode} ${Math.round(entry.durationMs / 1000)}s${entry.error ? ` :: ${entry.error}` : ''}${entry.skipReason ? ` :: ${entry.skipReason}` : ''}`);
  }
  if (failed.length > 0) process.exitCode = 1;
} catch (error) {
  report.crash = String(error.stack || error);
  report.finishedAt = new Date().toISOString();
  persist();
  console.error(error.stack || error);
  process.exitCode = 2;
}

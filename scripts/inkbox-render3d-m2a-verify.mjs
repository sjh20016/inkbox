#!/usr/bin/env node
// Reproducible M2-A release gates; each command keeps its actual output and exit code.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'reports', 'release', 'render3d-m2a');
fs.mkdirSync(output, { recursive: true });
const suites = [
  ['core', ['inkbox-import-check', 'inkbox-core-check', 'inkbox-startup-check', 'inkbox-runtime-events']],
  ['view', ['inkbox-view']], ['presentation', ['inkbox-presentation']],
  ['render3d', ['inkbox-render3d']], ['render3d-m1', ['inkbox-render3d-m1']],
  ['render3d-bridge', ['inkbox-render3d-bridge']], ['vendor', ['inkbox-vendor-check']],
  ['render3d-m2a', ['inkbox-render3d-m2a']],
  ['regression', ['inkbox-intervention-regression']], ['three-realms', ['inkbox-three-realms']],
  ['save-equivalence', ['inkbox-save-equiv']], ['build', ['inkbox-package']],
];
const report = { generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, suites: [] };
for (const [name, scripts] of suites) {
  const commands = [];
  let transcript = '';
  for (const script of scripts) {
    const start = performance.now(), relative = `scripts/${script}.mjs`;
    const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const text = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`;
    commands.push({ command: `node ${relative}`, exitCode: result.status, durationMs: performance.now() - start });
    transcript += `$ node ${relative}\n${text}\n`;
  }
  const passed = commands.every(command => command.exitCode === 0);
  fs.writeFileSync(path.join(output, `${name}.log`), transcript);
  report.suites.push({ name, status: passed ? 'passed' : 'failed', commands,
    outputSummary: transcript.trim().split(/\r?\n/).filter(line => /全部通过|全绿|passed|\.zip|core OK|startup OK|解析成功|断言|equivalence|✓.*cases/i.test(line)).slice(-8) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (${commands.reduce((sum, command) => sum + command.durationMs, 0).toFixed(0)} ms)`);
}
report.status = report.suites.every(suite => suite.status === 'passed') ? 'passed' : 'failed';
fs.writeFileSync(path.join(output, 'regression-results.json'), JSON.stringify(report, null, 2) + '\n');
if (report.status !== 'passed') process.exitCode = 1;

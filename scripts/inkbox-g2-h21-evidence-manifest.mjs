import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'reports/analysis/g2-h2/raw');
const OUT = path.join(ROOT, 'reports/analysis/g2-h21-local-evidence');
const EXPECTED_CASES = ['H2-E1', 'H2-E2', 'H2-E3', 'H2-E4'];
const EXPECTED_IDS = EXPECTED_CASES.flatMap(id => [
  `${id}-low-perturbation-r1`, `${id}-detailed-r1`, `${id}-detailed-r2`,
]);
const sha256 = data => createHash('sha256').update(data).digest('hex');

if (!fs.existsSync(RAW)) throw new Error(`Required raw evidence directory is missing: ${RAW}`);
const files = fs.readdirSync(RAW).filter(name => name.endsWith('.json')).sort();
const entries = files.map(file => {
  const fullPath = path.join(RAW, file);
  const bytes = fs.readFileSync(fullPath);
  const run = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(run.frames) || run.frames.length !== 300) {
    throw new Error(`${run.runId ?? file} does not contain the expected 300 measured frames`);
  }
  const sourceFiles = Object.entries(run.source?.sourceHashes || {}).map(([sourcePath, recordedSha256]) => {
    const currentPath = path.join(ROOT, sourcePath);
    const currentSha256 = fs.existsSync(currentPath) ? sha256(fs.readFileSync(currentPath)) : null;
    return { path: sourcePath, recordedSha256, currentSha256, matchesCurrent: currentSha256 === recordedSha256 };
  });
  const viewport = run.environment?.viewportAfterDprRestore || run.environment?.viewport || {};
  return {
    file,
    sha256: sha256(bytes),
    bytes: bytes.length,
    runId: run.runId,
    scenario: run.scenario,
    mode: run.mode,
    repeat: run.repeat,
    measuredFrames: run.frames.length,
    browser: { version: run.browser?.version, executable: run.browser?.executable, gpuInfo: run.browser?.gpuInfo },
    gpu: run.environment?.webgl?.renderer ?? run.environment?.gpuDeviceNames ?? null,
    viewport: { width: viewport.innerWidth ?? viewport.width ?? null, height: viewport.innerHeight ?? viewport.height ?? null,
      dpr: viewport.devicePixelRatio ?? run.environment?.measuredDevicePixelRatio ?? null },
    sourceFiles,
  };
});
const ids = entries.map(entry => entry.runId);
const missing = EXPECTED_IDS.filter(id => !ids.includes(id));
const unexpected = ids.filter(id => !EXPECTED_IDS.includes(id));
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (missing.length || unexpected.length || duplicates.length || entries.length !== EXPECTED_IDS.length) {
  throw new Error(`Expected 12 unique raw runs; missing=${missing.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}; duplicates=${duplicates.join(',') || 'none'}; found=${entries.length}`);
}

const identityCounts = new Map();
for (const entry of entries) for (const source of entry.sourceFiles) {
  if (source.matchesCurrent) continue;
  const current = identityCounts.get(source.path) || { recordedSha256: source.recordedSha256, currentSha256: source.currentSha256, runs: 0 };
  current.runs += 1;
  identityCounts.set(source.path, current);
}
fs.mkdirSync(OUT, { recursive: true });
const manifest = {
  task: 'G2-PERF-H2.1 evidence closure',
  rawStatus: 'COMPLETE',
  expectedRuns: EXPECTED_IDS.length,
  capturedRuns: entries.length,
  measuredFramesPerRun: 300,
  generatedAt: new Date().toISOString(),
  rawFiles: entries,
  currentSourceIdentityMismatches: [...identityCounts.entries()].map(([file, value]) => ({ file, ...value })),
  publication: 'Local-only. Raw browser records, source identities, and this manifest are intentionally excluded from repository upload.',
};
const output = path.join(OUT, 'manifest.json');
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: output, rawFiles: entries.length, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), mismatches: manifest.currentSourceIdentityMismatches }, null, 2));

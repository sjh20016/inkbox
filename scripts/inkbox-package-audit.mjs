#!/usr/bin/env node
// Verify a built Inkbox runtime package without changing it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_RELEASE_JSON = new Set([
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
]);
const problems = [];
const checks = [];

function fail(message) { problems.push(message); }
function pass(message) { checks.push(message); }

function walk(root, relative = '') {
  const dir = path.join(root, relative);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    return entry.isDirectory() ? walk(root, child) : entry.isFile() ? [child] : [];
  });
}

function readGlb(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('invalid GLB magic or truncated header');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('GLB must use version 2');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared length does not match file size');
  let offset = 12;
  let json;
  let binBytes = 0;
  let chunkIndex = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0 || offset + length > bytes.length) throw new Error('invalid GLB chunk length');
    if (chunkIndex === 0 && type !== 0x4e4f534a) throw new Error('first GLB chunk must be JSON');
    if (type === 0x4e4f534a && json === undefined) {
      json = JSON.parse(bytes.toString('utf8', offset, offset + length).replace(/\u0000+$/g, '').trim());
    } else if (type === 0x004e4942) {
      binBytes += length;
    } else if (type !== 0x4e4f534a) {
      throw new Error(`unknown GLB chunk type 0x${type.toString(16)}`);
    }
    offset += length;
    chunkIndex += 1;
  }
  if (!json || chunkIndex < 1) throw new Error('GLB has no JSON chunk');
  if (!Array.isArray(json.buffers) || json.buffers.some(buffer => buffer.uri)) throw new Error('GLB must contain embedded buffers');
  const requiredBin = json.buffers.reduce((size, buffer) => size + (buffer.byteLength || 0), 0);
  if (requiredBin > binBytes) throw new Error(`embedded binary data is short (${binBytes} < ${requiredBin})`);
  return json;
}

function auditManifest(packageRoot, files) {
  const packagePath = path.join(packageRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (!manifest.scripts || typeof manifest.scripts !== 'object') fail('package.json has no scripts object');
  const localScripts = new Set();
  for (const [name, command] of Object.entries(manifest.scripts || {})) {
    for (const match of command.matchAll(/\b(?:node|python3?|py)\s+([\w./\\-]+\.(?:mjs|cjs|js|py))\b/g)) {
      localScripts.add(match[1].replaceAll('\\', '/'));
    }
    for (const match of command.matchAll(/\bnpm\s+run\s+([\w:-]+)/g)) {
      if (!manifest.scripts[match[1]]) fail(`package.json script ${name} calls missing npm script ${match[1]}`);
    }
  }
  for (const script of localScripts) {
    if (!files.includes(script)) fail(`package.json local script is missing: ${script}`);
  }
  if (!manifest.scripts?.build || manifest.scripts.build !== 'node scripts/inkbox-package.mjs') {
    fail('package.json build script is missing or changed');
  }
  if (localScripts.size) pass(`package.json local script targets: ${localScripts.size}`);
}

function auditMarkdown(packageRoot, files) {
  const markdown = files.filter(file => file.toLowerCase().endsWith('.md'));
  const linkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\s*\)/g;
  for (const file of markdown) {
    const source = fs.readFileSync(path.join(packageRoot, file), 'utf8');
    for (const match of source.matchAll(linkPattern)) {
      const raw = match[1];
      const target = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
      const pathname = target.split(/[?#]/, 1)[0];
      if (!pathname) continue;
      let decoded = pathname;
      try { decoded = decodeURIComponent(pathname); } catch { /* Retain literal path. */ }
      const resolved = path.resolve(path.dirname(path.join(packageRoot, file)), decoded);
      if (resolved !== packageRoot && !resolved.startsWith(`${packageRoot}${path.sep}`)) {
        fail(`Markdown link escapes package: ${file} -> ${target}`);
      } else if (!fs.existsSync(resolved)) {
        fail(`Markdown link is unresolved: ${file} -> ${target}`);
      }
    }
  }
  pass(`Markdown local links checked: ${markdown.length} documents`);
}

function audit(packageRoot) {
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) throw new Error(`package directory does not exist: ${packageRoot}`);
  const files = walk(packageRoot);
  const normalized = files.map(file => file.replaceAll('\\', '/'));
  for (const file of normalized) {
    const lower = file.toLowerCase();
    if (/\.(?:blend|blend1)$/i.test(file)) fail(`source Blender file included: ${file}`);
    if (/\.(?:obj|mtl)$/i.test(file)) fail(`authoring mesh included: ${file}`);
    if (/^assets\/environment\/source\//i.test(file) || /^美术素材\/实验建筑资产\//.test(file)) fail(`environment source included: ${file}`);
    if (/(^|\/)preview(\/|$)/i.test(file)) fail(`preview directory included: ${file}`);
    if (/\.log$/i.test(file)) fail(`local log included: ${file}`);
    if (/(^|\/)reports(\/|$)/i.test(file)) {
      if (!ALLOWED_RELEASE_JSON.has(file)) fail(`non-summary report included: ${file}`);
      if (file === 'reports/release/render3d-m2c2c/summary/acceptance-summary.json') {
        const summaryPath = path.join(packageRoot, file);
        if (fs.statSync(summaryPath).size > 256 * 1024) fail('C2C acceptance summary exceeds 256 KiB');
        try { JSON.parse(fs.readFileSync(summaryPath, 'utf8')); }
        catch { fail('C2C acceptance summary is not valid JSON'); }
      }
    }
    if (/^reports\/release\//i.test(file) && /\.(?:png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file)) {
      fail(`release image included: ${file}`);
    }
  }
  pass('forbidden source, preview, local report, log, and release image checks');

  const glbs = normalized.filter(file => file.toLowerCase().endsWith('.glb'));
  if (!glbs.length) fail('no runtime GLB found');
  for (const glb of glbs) {
    try {
      readGlb(path.join(packageRoot, glb));
    } catch (error) {
      fail(`invalid GLB ${glb}: ${error.message}`);
    }
  }
  if (glbs.length) pass(`GLB files structurally loaded: ${glbs.length}`);

  const environmentRoot = path.join(packageRoot, 'assets/environment');
  const environmentManifest = path.join(environmentRoot, 'data/environment_manifest.json');
  if (!fs.existsSync(environmentManifest)) fail('environment runtime manifest is missing');
  else {
    const manifest = JSON.parse(fs.readFileSync(environmentManifest, 'utf8'));
    for (const key of ['asset', 'atlas', 'paletteSlots']) {
      const target = path.resolve(environmentRoot, manifest[key] || '');
      if (!target.startsWith(environmentRoot + path.sep) || !fs.existsSync(target)) fail(`environment manifest reference invalid: ${key}`);
    }
    const environmentGlbs = glbs.filter(file => file.startsWith('assets/environment/'));
    if (environmentGlbs.length !== 1 || environmentGlbs[0] !== 'assets/environment/mesh/environment_library.glb') fail('environment must ship one shared runtime GLB');
    for (const glb of environmentGlbs) {
      const json = readGlb(path.join(packageRoot, glb));
      if (json.materials?.length !== 1 || json.images?.length !== 1 || json.images[0].uri !== '../materials/EntityAtlas.png') fail('environment GLB shared material/atlas contract changed');
      else if (!fs.existsSync(path.resolve(path.dirname(path.join(packageRoot, glb)), json.images[0].uri))) fail('environment GLB atlas is missing');
    }
    pass('environment runtime asset references and shared GLB/atlas checked');
  }

  const manifestPath = path.join(packageRoot, 'assets/characters/cultivator/data/cultivator_manifest.json');
  const meshPath = path.join(packageRoot, 'assets/characters/cultivator/mesh/cultivator_library.glb');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(meshPath)) fail('cultivator runtime manifest or GLB is missing');
  else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.glb && !fs.existsSync(path.resolve(path.dirname(manifestPath), manifest.glb))) {
      fail(`cultivator manifest references missing GLB: ${manifest.glb}`);
    }
    pass('cultivator runtime asset references resolve');
  }

  auditManifest(packageRoot, normalized);
  auditMarkdown(packageRoot, normalized);
  const buildExists = normalized.includes('scripts/inkbox-package.mjs')
    && normalized.includes('package-lock.json')
    && normalized.includes('README.md');
  if (!buildExists) fail('clean-clone build inputs are incomplete');
  else pass('clean-clone build inputs are present (package-lock, npm build, local scripts)');

  if (problems.length) {
    console.error(`Inkbox package audit failed (${problems.length} issue${problems.length === 1 ? '' : 's'}):`);
    for (const issue of problems) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Inkbox package audit passed · ${files.length} files · ${checks.join(' · ')}`);
}

const requested = process.argv[2];
let target = requested ? path.resolve(requested) : SCRIPT_ROOT;
if (!requested && fs.existsSync(path.join(SCRIPT_ROOT, 'src/inkbox'))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, 'package.json'), 'utf8'));
  const output = path.join(SCRIPT_ROOT, 'dist', `${manifest.name}-${manifest.version}`);
  target = fs.existsSync(output) ? output : SCRIPT_ROOT;
}
try {
  audit(target);
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}

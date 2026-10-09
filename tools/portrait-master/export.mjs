import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readPsd, initializeCanvas } from 'ag-psd';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { SLOT_ORDER, VARIANTS, PORTRAIT_CANVAS } from '../../src/inkbox/ui/g2/portraits/v2/portraitSchema.js';
import { validatePortraitManifest } from '../../src/inkbox/ui/g2/portraits/v2/portraitAssetRegistry.js';

initializeCanvas((width, height) => createCanvas(width, height), (width, height) => new ImageData(width, height));

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const mapPath = resolve(HERE, 'export-map.v1.json');
const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
function safeRelative(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.\-/]+\.png$/.test(value) &&
    !value.startsWith('/') && !value.includes('..') && !value.includes('\\') && !value.includes(':');
}
function assertSafeOutput(root, relpath) {
  const target = resolve(ROOT, root, relpath);
  const prefix = resolve(ROOT, root) + sep;
  if (!target.startsWith(prefix)) throw new Error(`Refusing to write outside example output root: ${relpath}`);
  return target;
}
function relativeToPack(file, allowRoot = false) {
  const pack = resolve(ROOT, 'assets/portraits/inkbox-face-v1');
  const path = relative(pack, file);
  if (!path && allowRoot) return '';
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`Output escaped the portrait pack: ${file}`);
  }
  return path.split(sep).join('/');
}
function toRaw(layer, width, height) {
  const source = layer.imageData?.data ?? layer.canvas?.getContext?.('2d')?.getImageData(0, 0, layer.canvas.width, layer.canvas.height)?.data;
  if (!source) throw new Error(`Layer "${layer.name}" has no readable raster pixels.`);
  const actualWidth = layer.imageData?.width ?? layer.canvas?.width;
  const actualHeight = layer.imageData?.height ?? layer.canvas?.height;
  const x = layer.left ?? 0;
  const y = layer.top ?? 0;
  if (actualWidth !== width || actualHeight !== height || x !== 0 || y !== 0) {
    throw new Error(`Layer "${layer.name}" is ${actualWidth}x${actualHeight} at ${x},${y}; expected the full ${width}x${height} canvas.`);
  }
  const channels = source.length / (width * height);
  if (channels !== 4) throw new Error(`Layer "${layer.name}" has ${channels} channels; RGBA is required.`);
  return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
}

async function rasterizeNode(node, width, height, forceVisible = false) {
  if (node.hidden && !forceVisible) return null;
  const opacity = Number.isFinite(node.opacity) ? Math.max(0, Math.min(1, node.opacity)) : 1;
  if (node.children) {
    const overlays = [];
    for (const child of node.children) {
      const image = await rasterizeNode(child, width, height);
      if (image) overlays.push({ input: image });
    }
    if (!overlays.length) return null;
    let rendered = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(overlays).raw().toBuffer();
    if (opacity < 1) {
      const pixels = new Uint8Array(rendered);
      for (let index = 3; index < pixels.length; index += 4) pixels[index] = Math.round(pixels[index] * opacity);
      rendered = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    }
    return sharp(rendered, { raw: { width, height, channels: 4 } }).png().toBuffer();
  }
  const raw = toRaw(node, width, height);
  let pixels = raw;
  if (opacity < 1) {
    const copy = new Uint8Array(raw);
    for (let index = 3; index < copy.length; index += 4) copy[index] = Math.round(copy[index] * opacity);
    pixels = Buffer.from(copy.buffer, copy.byteOffset, copy.byteLength);
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function findPath(root, names) {
  let node = root;
  if (!node) throw new Error(`Missing PSD root group: ${names[0]}`);
  for (const name of names) {
    if (!node.children) throw new Error(`"${node.name}" is not a group while looking for ${names.join('/')}.`);
    node = node.children.find(child => child.name === name);
    if (!node) throw new Error(`Missing PSD layer group: ${names.join('/')}`);
  }
  return node;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node tools/portrait-master/export.mjs [--publish] [--include slot.id] [--replace-existing]');
    console.log('Default: write the isolated example package. --publish merges paths into the existing Manifest v1 and writes only under assets/portraits/inkbox-face-v1/.');
    console.log('--replace-existing updates only an asset path already mapped to the same slot.id.');
    return;
  }
  const config = JSON.parse(await readFile(arg('--map', mapPath), 'utf8'));
  if (config.schemaVersion !== 1 || !Array.isArray(config.exports) || !Array.isArray(config.slotsBottomToTop)) {
    throw new Error('Invalid export-map.v1.json.');
  }
  if (config.slotsBottomToTop.join('|') !== SLOT_ORDER.join('|')) {
    throw new Error('The export map does not match the engine SLOT_ORDER.');
  }
  const publishing = args.includes('--publish');
  const replaceExisting = args.includes('--replace-existing');
  const included = args.flatMap((value, index) => value === '--include' && args[index + 1] ? [args[index + 1]] : []);
  const exports = included.length ? config.exports.filter(entry => included.includes(`${entry.slot}.${entry.id}`)) : config.exports;
  if (included.length && exports.length !== included.length) {
    const found = new Set(exports.map(entry => `${entry.slot}.${entry.id}`));
    throw new Error(`Unknown export key(s): ${included.filter(key => !found.has(key)).join(', ')}`);
  }
  const master = resolve(ROOT, arg('--master', config.master));
  const packRoot = 'assets/portraits/inkbox-face-v1';
  const outputRoot = publishing ? packRoot : arg('--output-root', config.outputRoot);
  const manifestPath = resolve(ROOT, publishing ? `${packRoot}/manifest.json` : arg('--manifest-output', config.manifestOutput));
  const relativeOutputRoot = relative(ROOT, resolve(ROOT, outputRoot));
  if (!relativeOutputRoot || relativeOutputRoot.startsWith(`..${sep}`) || isAbsolute(relativeOutputRoot) || (!publishing && !relativeOutputRoot.includes(`${sep}examples${sep}`))) {
    throw new Error(publishing ? 'Published assets must remain inside the portrait pack.' : 'Example exports must remain inside a portraits examples directory.');
  }
  relativeToPack(resolve(ROOT, outputRoot), publishing);
  relativeToPack(manifestPath);
  const buffer = await readFile(master);
  if (buffer.toString('ascii', 0, 4) !== '8BPS') throw new Error(`${master} is not a PSD file.`);
  const psd = readPsd(buffer, { useImageData: true, skipThumbnail: true, skipCompositeImageData: true });
  if (psd.width !== 1024 || psd.height !== 1024 || psd.bitsPerChannel !== 8 || psd.colorMode !== 3) {
    throw new Error(`Expected 1024x1024 RGB/8 PSD; read ${psd.width}x${psd.height}, mode=${psd.colorMode}, depth=${psd.bitsPerChannel}.`);
  }
  const roots = psd.children ?? [];
  const byName = new Map(roots.map(node => [node.name, node]));
  const expectedRoots = config.slotsBottomToTop.map((slot, index) => `${String(index).padStart(2, '0')}_${slot}`);
  if (roots.length !== expectedRoots.length || roots.some((node, index) => node.name !== expectedRoots[index])) {
    throw new Error(`PSD layer records must follow runtime bottom-to-top order: ${expectedRoots.join(', ')}.`);
  }

  let manifest = { id: 'inkbox-face-master-demo-v1', schemaVersion: 1, canvas: { master: 1024, export: 512, viewBox: '0 0 100 100' }, slots: {} };
  if (publishing) {
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const current = validatePortraitManifest(manifest);
    if (!current.ok) throw new Error(`Existing Manifest v1 is invalid: ${current.reason}`);
  }
  const prepared = [];
  const seenKeys = new Set();
  for (const entry of exports) {
    if (!SLOT_ORDER.includes(entry.slot) || typeof entry.id !== 'string' || !entry.id || !Array.isArray(entry.source) || !safeRelative(entry.path)) {
      throw new Error(`Invalid export entry: ${JSON.stringify(entry)}`);
    }
    const key = `${entry.slot}.${entry.id}`;
    if (seenKeys.has(key)) throw new Error(`Duplicate export-map key: ${key}`);
    seenKeys.add(key);
    if (!['skinMarks', 'effects', 'frame', 'background', 'cheeks', 'neck', 'ears'].includes(entry.slot) && !VARIANTS[entry.slot]?.includes(entry.id)) {
      throw new Error(`Unknown stable ${entry.slot} variant ID: ${entry.id}`);
    }
    const source = findPath(byName.get(entry.source[0]), entry.source.slice(1));
    const rendered = await rasterizeNode(source, psd.width, psd.height, true);
    if (!rendered) throw new Error(`The source group ${entry.source.join('/')} contains no visible pixels.`);
    const png = await sharp(rendered).resize(PORTRAIT_CANVAS.exportSize, PORTRAIT_CANVAS.exportSize, {
      fit: 'fill', kernel: 'lanczos3'
    }).withIccProfile('srgb').png().toBuffer();
    const metadata = await sharp(png).metadata();
    if (metadata.width !== 512 || metadata.height !== 512 || !metadata.hasAlpha) {
      throw new Error(`${entry.path} failed the 512x512 RGBA export contract.`);
    }
    const relativeAssetPath = publishing ? entry.path.replace(/^examples\/master-demo\//, '') : entry.path;
    if (publishing && relativeAssetPath === entry.path && entry.path.startsWith('examples/')) throw new Error(`Cannot publish example-only path ${entry.path}`);
    const target = assertSafeOutput(outputRoot, relativeAssetPath);
    const oldPath = manifest.slots[entry.slot]?.[entry.id];
    if (publishing && oldPath && oldPath !== relativeAssetPath) {
      throw new Error(`Refusing to change stable manifest ID ${entry.slot}.${entry.id} from ${oldPath} to ${relativeAssetPath}.`);
    }
    let oldBytes = null;
    try { oldBytes = await readFile(target); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (publishing && oldBytes && (!oldPath || oldPath !== relativeAssetPath)) {
      throw new Error(`Refusing to replace an existing unmapped file: ${relativeAssetPath}`);
    }
    if (publishing && oldBytes && !oldBytes.equals(png) && !replaceExisting) {
      throw new Error(`Refusing to overwrite ${entry.slot}.${entry.id}; use --replace-existing after reviewing the stable-ID update.`);
    }
    prepared.push({ entry, png, target, relativeAssetPath, oldBytes });
    manifest.slots[entry.slot] ??= {};
    const pathFromPack = relativeToPack(target);
    if (!manifest.slots[entry.slot][entry.id]) manifest.slots[entry.slot][entry.id] = pathFromPack;
  }

  const validation = validatePortraitManifest(manifest);
  if (!validation.ok) throw new Error(`Generated Manifest v1 is invalid: ${validation.reason}`);
  for (const item of prepared) {
    await mkdir(dirname(item.target), { recursive: true });
    await writeFile(item.target, item.png);
    const pathFromPack = relativeToPack(item.target);
    console.log(`${item.entry.slot}.${item.entry.id} -> ${pathFromPack} (${item.png.length} bytes)`);
  }
  await mkdir(dirname(manifestPath), { recursive: true });
  const manifestTemp = `${manifestPath}.tmp`;
  await writeFile(manifestTemp, `${JSON.stringify(manifest, null, 2)}\n`);
  const { rename } = await import('node:fs/promises');
  await rename(manifestTemp, manifestPath);
  console.log(`Wrote ${manifestPath}`);
  console.log(`${prepared.length} transparent 512x512 PNGs exported; original PSD canvas and layer origins were preserved.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });

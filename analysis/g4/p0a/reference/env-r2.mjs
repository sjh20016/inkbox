// Environment loader: every experiment imports product modules ONLY through here.
// Required: INKBOX_ROOT = checkout of the commit under test (default target: main e1e5503).
// Optional: INKBOX_FIXTURE = path to archipelago fixture source
//   (obtain via: git -C $INKBOX_ROOT show bfabe00:scripts/inkbox-g2-h3-archipelago-world.mjs > fixture.mjs)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = process.env.INKBOX_ROOT;
if (!ROOT || !fs.existsSync(path.join(ROOT, 'src/inkbox/sim/hydrology.js'))) { console.error('INKBOX_ROOT missing or not an Inkbox checkout'); process.exit(2); }
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
export const M = {
  worldgen: await imp('src/inkbox/world/worldgen.js'), config: await imp('src/inkbox/core/config.js'),
  H: await imp('src/inkbox/sim/hydrology.js'), T: await imp('src/inkbox/world/terrain.js'),
  P: await imp('src/inkbox/sim/powers.js'), noise: await imp('src/inkbox/core/noise.js'),
};
let fixture = null;
const fx = process.env.INKBOX_FIXTURE;
if (fx && fs.existsSync(fx)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.join(here, '..', '.cache', 'fixture-rooted.mjs');
  const src = fs.readFileSync(fx, 'utf8').replaceAll("'../src/inkbox/", `'${pathToFileURL(path.join(ROOT, 'src/inkbox')).href}/`);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, src);
  fixture = (await import(pathToFileURL(out).href)).applyArchipelagoFixture;
}
export const SEA_LEVEL = M.config.SEA_LEVEL;
export function provenance() {
  let rev = 'not-a-git-checkout'; try { rev = execSync(`git -C "${ROOT}" rev-parse HEAD`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  const h = (rel) => { const p = path.join(ROOT, rel); return fs.existsSync(p) ? crypto.createHash('sha1').update(`blob ${fs.statSync(p).size}\0`).update(fs.readFileSync(p)).digest('hex').slice(0, 10) : 'missing'; };
  return { root: ROOT, rev, node: process.version, blobs: { hydrology: h('src/inkbox/sim/hydrology.js'), terrain: h('src/inkbox/world/terrain.js'), powers: h('src/inkbox/sim/powers.js'), PlaneStage: h('src/inkbox/render3d/stage/PlaneStage.js'), WorldRenderBridge: h('src/inkbox/render3d/WorldRenderBridge.js') }, fixture: fx && fixture ? fx : null };
}
export const SEED = +(process.env.SEED || 673231);
export function makeWorld(map = 'standard') {
  const w = M.worldgen.generateWorld({ preset: M.config.WORLD_PRESETS.expanse, seed: SEED, scatter: true, generationVersion: 2, terrainPreset: 'standard' });
  if (map === 'archipelago') { if (!fixture) throw new Error('archipelago requires INKBOX_FIXTURE'); fixture(w); }
  return w;
}
export const hasFixture = () => !!fixture;

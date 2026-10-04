#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { launch, findBrowser, sleep } from './cdp.mjs';
const baseline = process.argv.includes('--baseline');
const probeOnly = process.argv.includes('--probe-only');
const phase = baseline ? 'baseline' : 'after';
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || (baseline ? 'reports/m2c/baseline' : 'reports/release/render3d-m2c'));
fs.mkdirSync(OUT, { recursive: true });
const edge = findBrowser(['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']);
if (!edge) throw new Error('Microsoft Edge is required');
let commit; try { commit = execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim(); } catch { commit = 'no-git-head'; }
const evidence = { generatedAt: new Date().toISOString(), phase, commit, screenshots: [], performance: [], errors: [] };
evidence.sourceHashes = Object.fromEntries(['src/inkbox/world/worldgen.js','src/inkbox/world/worldgenUpper.js','src/inkbox/world/worldgenNether.js'].map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
function sourceFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(path.join(directory,entry.name)):entry.name.endsWith('.js')?[path.join(directory,entry.name)]:[]);}
evidence.renderSourceHashes=Object.fromEntries(sourceFiles('src/inkbox/render3d').sort().map(file=>[file.replaceAll('\\','/'),createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
evidence.renderSourceDigest=createHash('sha256').update(JSON.stringify(evidence.renderSourceHashes)).digest('hex');
const session = await launch({ url: `${process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html'}?renderer=3d`, browser: edge, width: 1500, height: 940, gpu: true });
const js = (expression, options) => session.js(`return (async()=>{${expression}})();`, options);
try {
  if (!await session.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 })) {
    evidence.errors=session.errors();await session.screenshot(path.join(OUT,'failure-startup.png'));
    throw new Error('renderer not ready: '+evidence.errors.join(' | '));
  }
  evidence.environment = await js(`const r=window.inkbox.render3d.renderer,gl=r.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'); return {browser:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl:gl.getParameter(gl.VERSION),dpr:devicePixelRatio,rendererDpr:r.gpu.getPixelRatio(),viewport:[innerWidth,innerHeight]};`);
  await js(`window.__m2cHarness=await import('./src/inkbox/render3d/art/VisualScenarios.js'); return true;`);
  const matrix = [
    ['01_mortal_overview','GOLDEN_A','WORLD_OVERVIEW'],['02_mortal_mountain','TERRAIN_STRESS','REGIONAL'],
    ['03_pilot_entity_medium','GOLDEN_A','ENTITY_MEDIUM'],['04_pilot_entity_close','GOLDEN_A','ENTITY_CLOSE'],
    ['05_building_tree_character','DENSITY_A','SETTLEMENT'],['06_upper_boundary','GOLDEN_A','REALM_BOUNDARY','upper'],
    ['07_nether_boundary','GOLDEN_A','REALM_BOUNDARY','nether'],['08_dense_test','DENSITY_A','WORLD_OVERVIEW']];
  const profiles = baseline ? ['baseline'] : ['baseline','pigment','ink','pilot'];
  for (const [name, scenario, camera, realm] of probeOnly ? [] : matrix) {
    const world = await js(`const result=window.__m2cHarness.applyScenario(window.inkbox,'${scenario}');result.snapshotDigest=await window.__m2cHarness.snapshotDigest(window.inkbox);return result;`);
    await sleep(500);
    const view = await js(`const s=window.inkbox,r=s.render3d.renderer; if('${realm || ''}'){ const w=s.world, path=[[w.w*.22,w.h*.22],[w.w*.78,w.h*.22],[w.w*.78,w.h*.78],[w.w*.22,w.h*.78]]; s.selectTool('${realm === 'upper' ? 'viewUpper' : 'viewNether'}'); s.selection={path,x0:w.w*.22,y0:w.h*.22,x1:w.w*.78,y1:w.h*.78,area:w.w*w.h*.56*.56}; r.setBoundaryMode('strata'); r.setRealmViewState(s.getRealmViewState()); } return window.__m2cHarness.applyVisibleCamera(r,'${camera}');`);
    for (const profile of profiles) {
      const available = await js(`const r=window.inkbox.render3d.renderer;if(r.art?.setProfile){r.art.setProfile('${profile}');return true;}if(r.setArtProfile){r.setArtProfile('${profile}');return true;}return ${baseline};`);
      if (!available) throw new Error('Art profile API missing');
      await sleep(180);
      const file = `${name}__${profile}.png`;
      await session.screenshot(path.join(OUT,file));
      const manifest = await js(`return window.__m2cHarness.screenshotManifest(window.inkbox,${JSON.stringify({ ...world, ...view, viewRealm: realm || 'mortal', artProfile: profile, commit, renderSourceDigest:evidence.renderSourceDigest,worldGenSourceHashes:evidence.sourceHashes, viewport: [1500,940], file })});`);
      evidence.screenshots.push(manifest);
      fs.writeFileSync(path.join(OUT,`${file}.json`),JSON.stringify(manifest,null,2));
      console.log(`${phase} ${file}`);
      if (name==='01_mortal_overview') evidence.performance.push(await js(`return window.__m2cHarness.measureRenderer(window.inkbox.render3d.renderer,'${profile}');`));
    }
  }
  if(!baseline&&!probeOnly) evidence.lifecycle=await js(`return window.__m2cHarness.validateCameraAndLifecycle(window.inkbox);`, { timeoutMs: 180000 });
  if(!baseline) evidence.renderTargetProbe=await js(`return window.__m2cHarness.probeRenderTargets(window.inkbox.render3d.renderer);`, { timeoutMs: 120000 });
  evidence.errors=[...session.errors(),...session.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description||'').join(' '))];
} catch(error) {
  evidence.failure=String(error.stack||error);
  throw error;
} finally {
  fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));
  // Close this isolated browser profile gracefully, including its subprocesses.
  try {await session.cdp.send('Browser.close',{},2000);}catch{}
  await session.close();
}
if(evidence.errors.length) throw new Error(evidence.errors.join('\n'));
if(evidence.renderTargetProbe&&!evidence.renderTargetProbe.gate)throw new Error('RenderTarget technical gate failed; inspect evidence.json');
if(evidence.lifecycle&&(!evidence.lifecycle.resourcesStable||!evidence.lifecycle.worldFactsUnchanged||Object.values(evidence.lifecycle.picking).some(p=>p.visibleMismatch)))throw new Error('Lifecycle/picking gate failed; inspect evidence.json');

// Re-measure the integrated local baseline before changing production LOD code.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { launch, findBrowser, sleep } from './cdp.mjs';
const treeGate = process.argv.includes('--tree-gate');
const out = path.resolve(process.env.INKBOX_REPORT_DIR || (treeGate ? 'reports/m2c2a/tree-gate' : 'reports/m2c2a/baseline'));
fs.mkdirSync(out, { recursive: true });
const browser = findBrowser();
if (!browser) throw new Error('Edge/Chrome required');
const session = await launch({ url: `${process.env.INKBOX_URL || 'http://127.0.0.1:4180/inkbox.html'}?renderer=3d`, browser, width: 1500, height: 940, gpu: true });
const js = body => session.js(`return (async()=>{${body}})();`);
const evidence = { capturedAt: new Date().toISOString(), samples: [], errors: [] };
try {
  if (!await session.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size', { timeoutMs: 60000 })) throw new Error('Renderer unavailable');
  await js(`const r=window.inkbox.render3d.renderer;await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;window.__audit=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  evidence.environment = await js(`const r=window.inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {browser:navigator.userAgent,gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],dpr:r.gpu.getPixelRatio()};`);
  for (const scenario of ['GOLDEN_A', 'DENSITY_A']) {
    const spec = await js(`return window.__audit.applyScenario(window.inkbox,'${scenario}');`);
    await sleep(300);
    await js(`window.__audit.applyCamera(window.inkbox.render3d.renderer,'WORLD_OVERVIEW');return true;`);
    const before = await js(`return window.__audit.snapshotDigest(window.inkbox);`);
    const variants = treeGate ? [['pilot-no-lod','pilot',false],['pilot-lod','pilot',true]] : [['baseline','baseline',false],['pilot','pilot',false]];
    for (const [name, profile, lod] of variants) {
      await js(`const r=window.inkbox.render3d.renderer;r.setArtProfile('${profile}');r.setLODEnabled?.(${lod});return true;`);
      await sleep(250);
      const sample = await js(`const r=window.inkbox.render3d.renderer,s=r.stages.get('mortal');const triangles=m=>m.count*((m.geometry.index?.count??m.geometry.attributes.position.count)/3);const sum=root=>{let n=0;root.traverse(m=>{if(m.isInstancedMesh&&m.visible)n+=triangles(m);});return n;};return {measurement:await window.__audit.measureRenderer(r,'${name}',{samples:120}),trees:s.vegetation.stats,characters:s.entities.stats,buildings:s.settlements.stats,categoryTriangles:{trees:sum(s.vegetation.group||s.vegetation.mesh),characters:sum(s.entities.group),buildings:sum(s.settlements.group)},characterLibrary:!!r.characterLibrary,visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),resources:{...r.gpu.info.memory,programs:r.gpu.info.programs.length},glError:r.gpu.getContext().getError()};`);
      evidence.samples.push({ scenario, profile: name, lod, spec, before, ...sample });
      await session.screenshot(path.join(out, `${scenario}-${name}.png`));
      console.log(JSON.stringify({ scenario, profile: name, calls: sample.measurement.calls, triangles: sample.measurement.triangles, categoryTriangles: sample.categoryTriangles }));
    }
    const after = await js(`return window.__audit.snapshotDigest(window.inkbox);`);
    if (before.value !== after.value) throw new Error('Audit profile switch changed World');
  }
  evidence.errors = session.errors();
  if (evidence.errors.length || evidence.samples.some(s=>s.glError)) throw new Error('Audit runtime/GL errors');
  if (treeGate) for (const scenario of ['GOLDEN_A', 'DENSITY_A']) {
    const off=evidence.samples.find(s=>s.scenario===scenario&&!s.lod),on=evidence.samples.find(s=>s.scenario===scenario&&s.lod);
    if (on.trees.trees!==off.trees.trees || on.categoryTriangles.trees>=off.categoryTriangles.trees*.65 || on.measurement.calls>20) throw new Error('Tree LOD gate failed');
  }
} catch (error) { evidence.failure = String(error.stack || error); throw error; }
finally { fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(evidence, null, 2)); await session.close(); }

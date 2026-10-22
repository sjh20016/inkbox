// S0 bounded browser evidence. Uses the repository's isolated Edge/CDP driver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const url = process.env.INKBOX_URL || 'http://127.0.0.1:4198/inkbox.html?renderer=3d';
const label = process.env.INKBOX_S0_LABEL || 'candidate';
const output = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/s0');
fs.mkdirSync(output, { recursive: true });
const report = { url, label, viewport: [1366, 768], samples: [], checks: [], pass: false };
let browser;
try {
  browser = await launch({ url, width: 1366, height: 768, gpu: true });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.world', { timeoutMs: 45000 }));
  report.environment = await browser.js(`const r=inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,dpr:devicePixelRatio,gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),title:document.title};`);
  assert.match(report.environment.title, /坐天观井/);
  await browser.js('inkbox.creationMenu.close();inkbox.setSpeed(0);return true;');
  for (const preset of ['medium', 'expanse']) {
    await browser.js(`inkbox.newWorld('${preset}',20261018);inkbox.setSpeed(0);return true;`);
    assert(await browser.waitFor('return inkbox.render3d.renderer.world===inkbox.world', { timeoutMs: 30000 }));
    await browser.js('return new Promise(resolve=>setTimeout(()=>resolve(true),2000));');
    const paused = await browser.js(`const r=inkbox.render3d.renderer,m=r.render();return {preset:inkbox.presetKey,state:'paused',day:inkbox.world.day,calls:m.drawCalls,triangles:m.triangles,trees:m.treeInstances,lod:m.lod,atmosphere:{...r.shanhai.stats}};`);
    report.samples.push(paused);
    console.log(label, preset, paused.calls, 'draws', paused.triangles, 'triangles');
    await browser.screenshot(path.join(output, `${label}-${preset}.png`));
    if (preset === 'expanse') {
      report.samples.push(await browser.js(`return (async()=>{
        const s=inkbox,r=s.render3d.renderer,frames=[],updates=[],rafs=[];
        const oldUpdate=s.update,oldRender=r.render,day=s.world.day;
        s.update=function(...args){const t=performance.now();const v=oldUpdate.apply(this,args);updates.push(performance.now()-t);return v;};
        r.render=function(){const m=oldRender.call(this);frames.push({...m});return m;};
        let running=true,last=performance.now();const tick=t=>{if(!running)return;rafs.push(t-last);last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
        s.setSpeed(2);
        try { await new Promise(resolve=>setTimeout(resolve,15000)); }
        finally { running=false;s.setSpeed(0);s.update=oldUpdate;r.render=oldRender; }
        const q=(xs,p)=>xs.sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)]??null;
        return {preset:'expanse',state:'x2',durationMs:15000,days:s.world.day-day,frames:frames.length,
          rafP95:q(rafs,.95),updateP50:q(updates,.5),updateP95:q(updates,.95),
          renderSubmitP95:q(frames.map(x=>x.renderMs),.95),bridgeP95:q(frames.map(x=>x.bridgeScanMs),.95),long50:rafs.filter(x=>x>50).length};
      })();`, { timeoutMs: 30000 }));
      assert(report.samples.at(-1).frames > 30, 'sample must contain actual rendered frames');
    }
  }
  report.errors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map(e => e.params.args.map(a => a.value || a.description).join(' '));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  if (browser) report.cleanup = await browser.close();
  fs.writeFileSync(path.join(output, `${label}-browser.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

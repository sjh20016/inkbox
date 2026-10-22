import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const url = process.env.INKBOX_URL || 'http://127.0.0.1:4198/inkbox.html?renderer=3d';
const output = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/s0');
fs.mkdirSync(output, { recursive: true });
const report = { url, viewport: [1366, 768], checks: [], screenshots: [], pass: false };
let browser;
const check = (name, evidence) => { report.checks.push({ name, pass: true, evidence }); console.log('PASS', name); };
try {
  browser = await launch({ url, width: 1366, height: 768, gpu: true });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.world', { timeoutMs: 45000 }), '3D renderer did not initialize');
  report.environment = await browser.js(`const r=inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,dpr:devicePixelRatio,gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),title:document.title};`);
  assert.match(report.environment.title, /坐天观井/);
  await browser.js(`inkbox.creationMenu.close();inkbox.newWorld('medium',20261018);inkbox.setSpeed(0);return true;`);
  assert(await browser.waitFor('return inkbox.render3d.renderer.world===inkbox.world', { timeoutMs: 30000 }));
  await browser.js('return new Promise(resolve=>setTimeout(()=>resolve(true),1200));');

  const canvasEdits = await browser.js(`
    const s=inkbox,w=s.world,candidates=[[w.w>>1,w.h>>1],[w.w>>1,Math.floor(w.h*.45)],[Math.floor(w.w*.55),Math.floor(w.h*.55)]];
    const center=candidates.find(([x,y])=>w.inside(x,y)&&x>8&&y>8&&x<w.w-8&&y<w.h-8);
    const cell=(x,y)=>{const i=y*w.w+x;return {i,height:w.height[i],water:w.water[i],veg:w.veg[i],fire:w.fire[i],overlay:w.over[i]};};
    const run=(id, point=center, radius=4)=>{s.selectTool(id);s.history.begin();s.applyTool(true,{point:{x:point[0],y:point[1]},radius});const label=s.history.end(id);s.qol.syncUndoState();return label;};
    const before=cell(...center);
    run('water'); const watered=cell(...center);
    run('drain'); const drained=cell(...center);
    run('raise'); const raised=cell(...center);
    run('lower'); const lowered=cell(...center);
    run('forest'); const forested=cell(...center);
    run('burn'); const burned=cell(...center);
    run('lightning'); const struck=cell(...center);
    run('flood'); const flooded=cell(...center);
    return {center,before,watered,drained,raised,lowered,forested,burned,struck,flooded,
      nature:{events:w.nature?.events?.length||0,dueDays:w.nature?.events?.map(e=>e.dueDay).filter(Number.isFinite).sort((a,b)=>a-b).filter((v,i,a)=>!i||v!==a[i-1])||[],fires:w.nature?.fires?.size||0,floods:w.nature?.floods?.size||0},
      history:s.history?.stack?.length ?? s.history?.undo?.length ?? null};`);
  report.canvas = canvasEdits;
  assert(canvasEdits.watered.water > canvasEdits.before.water, 'Canvas water tool did not add water');
  assert(canvasEdits.drained.water < canvasEdits.watered.water, 'Canvas drain tool did not reduce water');
  assert(canvasEdits.raised.height > canvasEdits.before.height, 'Canvas raise tool did not raise terrain');
  assert(canvasEdits.lowered.height < canvasEdits.raised.height, 'Canvas lower tool did not lower terrain');
  assert(canvasEdits.forested.veg > canvasEdits.before.veg, 'Canvas forest tool did not plant vegetation');
  assert(canvasEdits.burned.fire > 0 && canvasEdits.struck.fire > canvasEdits.burned.fire, 'burn/lightning did not leave active fire');
  assert(canvasEdits.flooded.water > canvasEdits.drained.water, 'flood tool did not add temporary water');
  assert(canvasEdits.nature.events > 0, 'nature tool actions did not persist events');
  assert(canvasEdits.nature.dueDays.includes(7) && canvasEdits.nature.dueDays.includes(30), 'fire/flood absolute expiry days were not recorded');
  check('Canvas water, drain, raise, lower, forest, burn, lightning, flood through formal applyTool/history path', {
    waterDelta: canvasEdits.watered.water-canvasEdits.before.water,
    drainDelta: canvasEdits.drained.water-canvasEdits.watered.water,
    raiseDelta: canvasEdits.raised.height-canvasEdits.before.height,
    lowerDelta: canvasEdits.lowered.height-canvasEdits.raised.height,
    vegetation: [canvasEdits.before.veg,canvasEdits.forested.veg], events:canvasEdits.nature.events,
  });

  const pausedDay = await browser.js('return inkbox.world.day;');
  await sleep(450);
  const stillPausedDay = await browser.js('return inkbox.world.day;');
  assert.equal(stillPausedDay, pausedDay, 'day advanced while speed=0');
  await browser.js('inkbox.setSpeed(1);return true;');
  await sleep(1400);
  const resumedDay = await browser.js('return inkbox.world.day;');
  await browser.js('inkbox.setSpeed(0);return true;');
  assert(resumedDay > pausedDay, `day did not advance after resume (${pausedDay} -> ${resumedDay})`);
  check('pause and resume', { pausedDay, stillPausedDay, resumedDay });

  await browser.js(`document.getElementById('inkSlotSelect').value='auto';document.getElementById('inkSlotSelect').dispatchEvent(new Event('change',{bubbles:true}));return true;`);
  const saveBefore = await browser.js('window.__s0SavedWorld=inkbox.world;return {seed:inkbox.world.seed,height:inkbox.world.height[(inkbox.world.h>>1)*inkbox.world.w+(inkbox.world.w>>1)],water:inkbox.world.water[(inkbox.world.h>>1)*inkbox.world.w+(inkbox.world.w>>1)],natureEvents:inkbox.world.nature?.events?.length||0};');
  const saveBtn = await browser.js(`const r=document.getElementById('inkBtnSave').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await browser.click(saveBtn.x,saveBtn.y, 'left', 450);
  assert(await browser.waitFor(`return document.getElementById('inkBtnSave')?.disabled===false`, { timeoutMs: 5000 }));
  const savedCount = await browser.js('return inkbox.listSlots?.().length ?? document.getElementById("inkSlotSelect").options.length;');
  assert(savedCount > 0, 'save slot list empty after clicking formal save button');
  const loadBtn = await browser.js(`const r=document.getElementById('inkBtnLoad').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:document.getElementById('inkBtnLoad').disabled};`);
  if (loadBtn.disabled) throw new Error('formal load button remained disabled after save');
  await browser.click(loadBtn.x,loadBtn.y,'left',250);
  const confirm = await browser.js(`return {ids:[...document.querySelectorAll('[id]')].filter(x=>/confirm|discard/i.test(x.id)).map(x=>({id:x.id,hidden:x.hidden,text:x.textContent.trim().slice(0,60)})),dialogs:[...document.querySelectorAll('[role=dialog]')].map(x=>x.textContent.trim().slice(0,80))};`);
  report.loadConfirm = confirm;
  if (await browser.js('return !!document.getElementById("inkConfirmOk") && !document.getElementById("inkConfirmOk").hidden;')) {
    const ok = await browser.js(`const r=document.getElementById('inkConfirmOk').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    await browser.click(ok.x,ok.y,'left',450);
  } else await sleep(450);
  assert(await browser.waitFor('return inkbox.world!==window.__s0SavedWorld && inkbox.world.seed===20261018 && !document.getElementById("inkBtnLoad").disabled', { timeoutMs: 10000 }), 'formal load did not complete');
  const loaded = await browser.js('const w=inkbox.world,i=(w.h>>1)*w.w+(w.w>>1);return {seed:w.seed,height:w.height[i],water:w.water[i],day:w.day,natureVersion:w.nature?.version,natureEvents:w.nature?.events?.length||0};');
  assert.equal(loaded.seed, saveBefore.seed, 'loaded world seed differs');
  assert(Math.abs(loaded.height-saveBefore.height) <= 2/65535, 'saved height drift exceeded save quantization');
  assert(Math.abs(loaded.water-saveBefore.water) <= 2/65535, 'saved water drift exceeded save quantization');
  assert.equal(loaded.natureVersion,2,'nature event schema version was not restored');
  assert(loaded.natureEvents>0,'saved finite nature events were not restored');
  check('formal save/load buttons round trip edited mortal world', { savedCount, saveBefore, loaded });

  await browser.js(`inkbox.newWorld('medium',20261018);inkbox.setSpeed(0);return true;`);
  assert(await browser.waitFor('return inkbox.render3d.renderer.world===inkbox.world', { timeoutMs: 30000 }));
  await browser.js('return new Promise(resolve=>setTimeout(()=>resolve(true),700));');

  const panel = '#inkRender3DTools';
  // Pick a projected mortal terrain pixel from the visible 3D viewport, then send actual CDP mouse events.
  const pick = await browser.js(`const a=inkbox.render3d,r=a.renderer,w=inkbox.world,c=document.getElementById('inkCanvas3D'),b=c.getBoundingClientRect();
    a.setActive(true);r.cameraRig.fit();r.render();
    let hit=null;for(let yy=.20;yy<.90&&!hit;yy+=.035)for(let xx=.12;xx<.92&&!hit;xx+=.025){const x=b.width*xx,y=b.height*yy,h=r.pickPlane(x,y,'mortal');if(h?.world&&h.x>12&&h.y>12&&h.x<w.w-12&&h.y<w.h-12&&Number.isFinite(h.world.x)&&Number.isFinite(h.world.y))hit={x:b.left+x,y:b.top+y,world:h.world,cell:{x:h.x,y:h.y,plane:h.plane}};}
    return {hit,rect:{x:b.x,y:b.y,width:b.width,height:b.height},active:a.active};`);
  report.pick = pick;
  assert(pick.hit, 'could not find an interior, pickable mortal terrain pixel for real 3D mouse input');
  await browser.js(`const e=document.querySelector('${panel} select[aria-label="沙盘工具"]');e.value='raise';e.dispatchEvent(new Event('change',{bubbles:true}));const s=document.querySelector('${panel} [aria-label="笔刷强度"]');s.value='0.12';s.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
  const before3d = await browser.js(`const w=inkbox.world,i=${pick.hit.cell.y}*inkbox.world.w+${pick.hit.cell.x};return {height:w.height[i],index:i,cell:${JSON.stringify(pick.hit.cell)}};`);
  await browser.mouseMove(pick.hit.x,pick.hit.y);
  await browser.mouseDown(pick.hit.x,pick.hit.y);
  await browser.mouseMove(pick.hit.x+12,pick.hit.y+3);
  await browser.mouseUp(pick.hit.x+12,pick.hit.y+3);
  await sleep(350);
  const after3d = await browser.js(`const w=inkbox.world,r=inkbox.render3d.renderer,a=inkbox.render3d.adapter||inkbox.render3d;return {height:w.height[${before3d.index}],undo:a.undoStack?.length||0};`);
  assert(after3d.height > before3d.height, `real 3D mouse stroke did not raise terrain (${before3d.height} -> ${after3d.height})`);
  assert(after3d.undo > 0, 'real 3D mouse stroke did not produce undo entry');
  const terrainRack = await browser.js(`const e=document.querySelector('#r1ThreeRack [data-r1-group="terrain"]');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,exists:!!e};`);
  assert(terrainRack.exists, 'visible 3D terrain tool rack unavailable');
  await browser.click(terrainRack.x,terrainRack.y,'left',250);
  const undoAction = await browser.js(`const e=document.querySelector('${panel} [data-action="undo"]'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};`);
  assert(undoAction.w>0&&undoAction.h>0,'3D undo button is not visible after opening the terrain arts sheet');
  report.undoAction = await browser.js(`const r=document.querySelector('${panel} [data-action="undo"]').getBoundingClientRect();return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},target:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,180)};`);
  await browser.click(undoAction.x,undoAction.y,'left',300);
  const undone = await browser.js(`return inkbox.world.height[${before3d.index}];`);
  report.threeD = { before3d, after3d, undone, afterUndo: await browser.js(`const a=inkbox.render3d;return {adapterUndo:a.undoStack?.length,adapterRedo:a.redoStack?.length,rendererUndo:a.adapter?.undoStack?.length,rendererRedo:a.adapter?.redoStack?.length,buttonDisabled:document.querySelector('${panel} [data-action="undo"]').disabled,redoDisabled:document.querySelector('${panel} [data-action="redo"]').disabled,notice:a.historyNotice};`) };
  assert.equal(undone,before3d.height,'3D undo failed to restore terrain');
  const redoAction = await browser.js(`const r=document.querySelector('${panel} [data-action="redo"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await browser.click(redoAction.x,redoAction.y,'left',300);
  const redone = await browser.js(`return inkbox.world.height[${before3d.index}];`);
  assert.equal(redone,after3d.height,'3D redo failed to restore sculpt');
  check('real CDP pointer 3D sculpt and UI undo/redo', { before3d, after3d, undone, redone });

  const cameraBefore = await browser.js(`const a=inkbox.render3d,r=a.renderer;return {rotation:r.cameraRig.camera.rotation.toArray(),position:r.cameraRig.camera.position.toArray(),plane:r.activePlane};`);
  await browser.mouseMove(pick.hit.x,pick.hit.y); await browser.key('e'); await sleep(300);
  const cameraAfter = await browser.js(`const r=inkbox.render3d.renderer;return {rotation:r.cameraRig.camera.rotation.toArray(),position:r.cameraRig.camera.position.toArray(),plane:r.activePlane};`);
  assert.notDeepEqual(cameraAfter.position,cameraBefore.position,'camera rotation key did not change camera view');
  check('3D camera rotate key', { cameraBefore, cameraAfter });
  await browser.screenshot(path.join(output,'interactions-mortal-3d.png')); report.screenshots.push('interactions-mortal-3d.png');

  await browser.js('inkbox.render3d.setActive(false);inkbox.selectTool("water");return true;');
  assert(await browser.waitFor('return !inkbox.render3d.active && inkbox.canvas.style.visibility!=="hidden"'));
  const canvasPick=await browser.js(`const s=inkbox,c=s.canvas,b=c.getBoundingClientRect(),w=s.world;let hit=null;
    for(let yy=.3;yy<.8&&!hit;yy+=.04)for(let xx=.3;xx<.8&&!hit;xx+=.04){const x=b.width*xx,y=b.height*yy,p=s.camera.pick(x,y,w);if(w.inside(p.x,p.y)&&document.elementFromPoint(b.left+x,b.top+y)===c)hit={x:b.left+x,y:b.top+y,cell:p};}
    return {hit,rect:{x:b.x,y:b.y,width:b.width,height:b.height}};`);
  assert(canvasPick.hit,'could not find visible Canvas terrain for actual pointer test');
  const canvasBefore=await browser.js(`const w=inkbox.world,p=${JSON.stringify(canvasPick.hit.cell)},i=p.y*w.w+p.x;return {water:w.water[i],cell:p,index:i};`);
  await browser.click(canvasPick.hit.x,canvasPick.hit.y,'left',180);
  const canvasAfter=await browser.js(`return inkbox.world.water[${canvasBefore.index}];`);
  assert(canvasAfter>canvasBefore.water,`real Canvas pointer did not add water (${canvasBefore.water} -> ${canvasAfter})`);
  check('real CDP Canvas water click after switching from active 3D', { before:canvasBefore,after:canvasAfter });
  await browser.screenshot(path.join(output,'interactions-canvas-water.png'));report.screenshots.push('interactions-canvas-water.png');
  await browser.js('inkbox.render3d.setActive(true);return true;');
  assert(await browser.waitFor('return inkbox.render3d.active'));

  for (const [plane, label] of [['upper','upper'],['nether','nether']]) {
    const planeSelect=await browser.js(`const e=document.querySelector('${panel} select[aria-label="调试位面"]');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,exists:!!e};`);
    assert(planeSelect.exists, '3D debug plane selector is unavailable');
    await browser.js(`const e=document.querySelector('${panel} select[aria-label="调试位面"]');e.value='${plane}';e.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
    await browser.js('inkbox.render3d.renderer.render();return true;');
    const state=await browser.js(`const r=inkbox.render3d.renderer;return {plane:r.activePlane,stage:!!r.stages.get('${plane}')?.world,world:r.stages.get('${plane}')?.world?.plane,drawCalls:r.stats?.drawCalls??null};`);
    assert.equal(state.plane,plane,`${label} plane selection was not applied`);
    assert(state.stage,`${label} realm stage missing`);
    check(`${label} realm view`,state);
    await browser.screenshot(path.join(output,`interactions-${label}-3d.png`)); report.screenshots.push(`interactions-${label}-3d.png`);
  }
  report.errors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '));
  assert.deepEqual(report.errors,[],'uncaught browser/page errors');
  assert.deepEqual(report.consoleErrors,[],'console.error was emitted');
  report.pass=true;
} catch(error) {
  report.failure=error.stack;
  process.exitCode=1;
} finally {
  if(browser) report.cleanup=await browser.close();
  fs.writeFileSync(path.join(output,'interactions-browser.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:report.pass,checks:report.checks,failure:report.failure,environment:report.environment,threeD:report.threeD,cleanup:report.cleanup,screenshots:report.screenshots},null,2));
}

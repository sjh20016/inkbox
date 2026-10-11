// Formal G1 gameplay shell: real Canvas/PlanePicker input, four-tab card and commands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4197);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/local/g1/browser'));
const url = new URL('inkbox.html', base.endsWith('/') ? base : base + '/');
const report = { startedAt: new Date().toISOString(), purpose: 'formal G1 gameplay shell integration',
  gpuPerformanceClaim: false, checks: [], screenshots: [], pass: false };
let server, browser;
const page = body => browser.js(`return (async () => { ${body} })();`, { timeoutMs: 45000 });
const check = async (name, fn) => {
  report.phase = name; const evidence = await fn();
  report.checks.push({ name, pass: true, evidence }); console.log('PASS ' + name);
};
async function startServer() {
  if (process.env.INKBOX_URL) return;
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)],
    { cwd: root, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + server.exitCode);
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(150);
  }
  throw new Error('Server did not become ready');
}
async function clickControl(selector) {
  const point = await page(`const el=document.querySelector(${JSON.stringify(selector)});
    if(!el||el.disabled)throw Error('Missing/enabled control '+${JSON.stringify(selector)});
    // Scroll only the owning side rail or card page; absolute overlays must not scroll the playfield.
    if(el.closest('.rail,.g1-character__body'))el.scrollIntoView({block:'nearest'});
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};`);
  await browser.click(point.x, point.y);
}
async function screenshot(name) {
  const file = await browser.screenshot(path.join(output, name + '.png'), { timeoutMs: 30000 });
  report.screenshots.push(file);
  return file;
}
const projectedCanvas = `const k=window.inkbox,e=window.__g1Entity,w=k.world,
  {UnitsLayer}=await import('./src/inkbox/render/unitsLayer.js');
  const p=UnitsLayer.project(k.camera,e.x,e.y,w.height[w.idx(Math.floor(e.x),Math.floor(e.y))]||0),
  rect=k.canvas.getBoundingClientRect();return {x:rect.left+p[0],y:rect.top+p[1],id:e.id};`;
async function geometryPoint(plane, id) {
  return page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get(${JSON.stringify(plane)}),
    e=s.world.entities.find(e=>e.id===${id}),THREE=await import('./vendor/three/build/three.module.js'),
    rect=k.render3d.canvas.getBoundingClientRect();
    r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
    const points=[],diag={meshes:0,instances:0,samples:0,offscreen:0,hits:{}};
    // Sample actual submitted instance geometry, including asset-specific anchors and scales.
    s.entities.group.traverse(mesh=>{
      if(!mesh.isInstancedMesh||!mesh.visible||!mesh.count)return;
      for(let parent=mesh.parent;parent;parent=parent.parent)if(!parent.visible)return;
      const records=mesh.userData.renderEntities||[];diag.meshes++;
      for(let index=0;index<mesh.count;index++) {
        if(records[index]?.id!==e.id)continue;diag.instances++;
        mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,matrix=new THREE.Matrix4();
        mesh.getMatrixAt(index,matrix);
        for(const fx of [.25,.5,.75])for(const fy of [.2,.5,.8])for(const fz of [.25,.5,.75]) {
          const point=new THREE.Vector3(box.min.x+(box.max.x-box.min.x)*fx,
            box.min.y+(box.max.y-box.min.y)*fy,box.min.z+(box.max.z-box.min.z)*fz);
          points.push(mesh.localToWorld(point.applyMatrix4(matrix)).project(r.cameraRig.camera));
        }
      }
    });
    for(const v of points)for(const dx of [0,-2,2])for(const dy of [0,-2,2]) {
      const x=(v.x+1)*rect.width/2+dx,y=(1-v.y)*rect.height/2+dy;
      if(x<12||x>rect.width-12||y<80||y>rect.height-30){diag.offscreen++;continue;}
      const hit=r.pick(x,y);diag.samples++;
      const kind=hit?.plane+':'+hit?.kind;diag.hits[kind]=(diag.hits[kind]||0)+1;
      if(hit?.kind==='entity'&&hit.plane===${JSON.stringify(plane)}&&hit.entityId===e.id)
        return {x:rect.left+x,y:rect.top+y,id:e.id,plane:hit.plane,kind:hit.kind,diag};
    }
    window.__g1GeometryDiagnostic=diag;return null;`);
}
try {
  fs.mkdirSync(output, { recursive: true });
  await startServer();
  browser = await launch({ url: url.toString(), browser: findEdge(), width: 1440, height: 1000, gpu: process.env.INKBOX_GPU !== '0' });
  report.browser = browser.meta;
  assert(await browser.waitFor('return !!window.inkbox?.g1', { timeoutMs: 30000 }));
  await check('Canvas pointer chooses real overlapping people by ID', async () => {
    const setup = await page(`const k=window.inkbox;k.setSpeed(0);
      k.newWorld('small',0,{progressive:false,terrainPreset:'standard'});k.selectTool('inspect');
      // Initial scatter need not contain cultivators; use the formal spawn path for this fixture.
      let people=k.world.entities.filter(e=>e.sp==='cultivator'&&e.hp>0);
      const tiles=Array.from({length:k.world.size},(_,i)=>i).filter(i=>k.world.isWalkable(i)&&!k.world.struct[i])
        .sort((a,b)=>Math.hypot(a%k.world.w-k.world.w/2,Math.floor(a/k.world.w)-k.world.h/2)
          -Math.hypot(b%k.world.w-k.world.w/2,Math.floor(b/k.world.w)-k.world.h/2));
      for(const i of tiles) {
        if(people.length>=2)break;
        k.life.spawn(i%k.world.w,Math.floor(i/k.world.w),'cultivator',2-people.length);
        people=k.world.entities.filter(e=>e.sp==='cultivator'&&e.hp>0);
      }
      if(people.length<2)throw Error('Formal Life.spawn did not supply fixture participants');
      const e=people[0],other=people[1];other.x=e.x;other.y=e.y;other.name=e.name;
      e.level=4;e.exp=0;e.fortune=60;e.mind=60;window.__g1Entity=e;window.__g1Other=other;
      const h=k.world.height[k.world.idx(Math.floor(e.x),Math.floor(e.y))]||0;
      k.camera.focusOn(e.x,e.y-(k.camera.relief?h*k.camera.reliefScale:0),{zoom:20,duration:0});
      k.dirty=true;return {seed:k.world.seed,id:e.id,otherId:other.id,name:e.name};`);
    const point = await page(projectedCanvas); await browser.click(point.x, point.y);
    const options = await page(`return [...document.querySelector('#inkG1Candidates').options].map(o=>({value:o.value,text:o.text}));`);
    assert(options.some(o => o.text.includes('#' + setup.id)));
    assert(options.some(o => o.text.includes('#' + setup.otherId)));
    const chosen = options.find(o => o.text.endsWith('#' + setup.id));
    await page(`document.querySelector('#inkG1Candidates').value=${JSON.stringify(chosen.value)};return true;`);
    await clickControl('#inkG1OpenCandidate');
    const actual = await page(`const svg=document.querySelector('#inkPersonDetail .g1-character__portrait .g2-portrait-v2__svg');
      return {identity:window.inkbox.g1.current()?.identity,
      key:document.querySelector('#inkPersonDetail').dataset.characterKey,
      choicesOpen:document.querySelector('#inkInspect').classList.contains('on'),
      portrait:svg?{viewBox:svg.getAttribute('viewBox'),slots:[...svg.querySelectorAll('g[data-slot]')]
        .map(node=>({slot:node.dataset.slot,variant:node.dataset.variant})),images:svg.querySelectorAll('image').length}:null};`);
    assert.equal(actual.identity.id, setup.id); assert.equal(actual.key, 'mortal:' + setup.id);
    assert.equal(actual.choicesOpen, false);
    assert.equal(actual.portrait?.viewBox, '0 0 100 100');
    assert(actual.portrait.slots.some(item => item.slot === 'face'));
    assert(actual.portrait.slots.some(item => item.slot === 'eyes'));
    assert.equal(actual.portrait.images, 0, 'empty formal PNG pack must use procedural assets');
    const firstPortrait = JSON.stringify(actual.portrait.slots);
    const switchResult = await page(`const k=window.inkbox,old=document.querySelector('#inkPersonDetail .g2-portrait-v2__svg');
      k.g1.open('mortal:'+window.__g1Other.id);
      const next=document.querySelector('#inkPersonDetail .g2-portrait-v2__svg');
      const other=JSON.stringify([...next.querySelectorAll('g[data-slot]')]
        .map(node=>({slot:node.dataset.slot,variant:node.dataset.variant})));
      const disconnected=!old.isConnected;
      k.g1.open('mortal:'+window.__g1Entity.id);
      const repeated=[...document.querySelectorAll('#inkPersonDetail .g2-portrait-v2__svg g[data-slot]')]
        .map(node=>({slot:node.dataset.slot,variant:node.dataset.variant}));
      return {different:other!==${JSON.stringify(firstPortrait)},disconnected,
        stable:JSON.stringify(repeated)===${JSON.stringify(firstPortrait)}};`);
    assert(switchResult.different, 'different character identities should usually resolve a different face');
    assert(switchResult.disconnected, 'switching characters must detach the old portrait DOM');
    assert(switchResult.stable, 'reopening the same character must preserve its portrait');
    const closeResult = await page(`const k=window.inkbox,old=document.querySelector('#inkPersonDetail .g2-portrait-v2__svg');
      k.g1.close();return {detached:!old.isConnected,cleared:!document.querySelector('#inkPersonDetail .g1-character')};`);
    assert(closeResult.detached && closeResult.cleared, 'closing the G1 window must destroy its portrait DOM');
    await page(`window.inkbox.g1.open('mortal:'+window.__g1Entity.id);return true;`);
    await screenshot('canvas-person');
    return { ...setup, options, actual, switchResult, closeResult };
  });
  await check('Visible edict/watch buttons modify the current World and mark unsaved state', async () => {
    await page(`window.inkbox.qol.markPersisted();return true;`);
    await clickControl('[data-g1-action="watch"]');
    await clickControl('[data-g1-action="tab"][data-tab="fate"]');
    for (const id of ['cultivation', 'fortune', 'mind']) await clickControl('[data-g1-action="edict"][data-edict-id="' + id + '"]');
    const actual = await page(`const k=window.inkbox,e=window.__g1Entity,
      {expToNext}=await import('./src/inkbox/core/cultivation.js');
      window.__g1OldButton=document.querySelector('[data-g1-action="edict"][data-edict-id="mind"]');
      return {exp:e.exp,required:expToNext(e.level),fortune:e.fortune,mind:e.mind,
        watched:k.world.watch.some(w=>w.key==='mortal:'+e.id),dirty:k.qol.isDirty(),
        ledger:k.world.chronicle.filter(r=>r.kind==='intervention').slice(-3),
        model:k.g1.current()};`);
    assert.equal(actual.exp, actual.required * .25);
    assert.equal(actual.fortune, 68); assert.equal(actual.mind, 68);
    assert(actual.watched && actual.dirty); assert.equal(actual.ledger.length, 3);
    assert(actual.ledger.every(row => row.text.includes('天道敕令')));
    assert.equal(actual.model.cultivation.exp, actual.exp);
    await screenshot('canvas-edicts');
    return { exp:actual.exp, required:actual.required, fortune:actual.fortune, mind:actual.mind,
      watched:actual.watched, dirty:actual.dirty, ledger:actual.ledger };
  });
  await check('Four formal tabs show real cultivation, retained history, relationships and biography', async () => {
    const initial=await page(`const k=window.inkbox;
      return {tabs:[...document.querySelectorAll('#inkPersonDetail [role="tab"]')].map(el=>el.textContent),
        percent:document.querySelector('#inkPersonDetail [role="progressbar"]').getAttribute('aria-valuenow'),
        cardCount:document.querySelectorAll('#inkPersonDetail .g1-character').length};`);
    assert.deepEqual(initial.tabs,['命簿','修行','改命','生平']);assert.equal(initial.cardCount,1);
    assert.equal(Number(initial.percent),25);
    await clickControl('[data-g1-action="tab"][data-tab="cultivation"]');
    const cultivation=await page(`const k=window.inkbox;
      return {text:document.querySelector('#inkPersonDetail [role="tabpanel"]:not([hidden])').textContent,
        rate:k.g1.current().cultivation.rateText};`);
    assert(cultivation.text.includes(cultivation.rate));
    await clickControl('[data-g1-action="tab"][data-tab="history"]');
    const history=await page(`return document.querySelector('#inkPersonDetail [role="tabpanel"]:not([hidden])').textContent;`);
    assert(/残卷|部分|不能视为完整/.test(history));
    assert(history.includes('天道敕令'));
    await clickControl('[data-g1-action="show-relations"]');
    assert(await page(`return document.querySelector('#inkPersonDetail [data-tab="history"]').getAttribute('aria-selected') === 'true';`));
    await page(`const k=window.inkbox;k.g1.open('mortal:'+window.__g1Entity.id);
      window.__g1Exports=[];const original=k.downloadText;
      k.downloadText=function(filename,text){window.__g1Exports.push({filename,text});return original.call(this,filename,text);};
      return true;`);
    await browser.cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(output,'downloads')});
    await clickControl('[data-g1-action="export"]');
    const exports=await page(`return window.__g1Exports;`);assert.equal(exports.length,1);
    assert(exports[0].text.length>100);
    return { ...initial,cultivation,historyCoverage:true,relationsOpened:true,
      exportFilename:exports[0].filename,exportBytes:exports[0].text.length };
  });
  await check('Product save/load restores real edits and rejects the pre-load DOM action', async () => {
    await page(`const svg=document.querySelector('#inkPersonDetail .g2-portrait-v2__svg');
      window.__g1PortraitBeforeSave=JSON.stringify([...svg.querySelectorAll('g[data-slot]')]
        .map(node=>({slot:node.dataset.slot,variant:node.dataset.variant})));return true;`);
    await page(`window.__g1BeforeLoad=window.inkbox.world;return true;`);
    await clickControl('#inkBtnSave');
    assert(await browser.waitFor('return !window.inkbox.qol.isDirty()', { timeoutMs: 15000 }));
    await clickControl('#inkBtnLoad');
    assert(await browser.waitFor('return window.inkbox.world!==window.__g1BeforeLoad', { timeoutMs: 15000 }));
    const result = await page(`const k=window.inkbox,w=k.world,io=await import('./src/inkbox/io/save.js'),
      key='mortal:'+window.__g1Entity.id,e=w.entities.find(e=>e.id===window.__g1Entity.id),
      before=JSON.stringify(io.serializeWorld(w));window.__g1OldButton.click();
      const unchanged=before===JSON.stringify(io.serializeWorld(w)),cleared=k.g1.current()===null,
        portraitCleared=!document.querySelector('#inkPersonDetail .g2-portrait-v2__svg');
      const opened=k.g1.open(key).ok;return {unchanged,cleared,opened,exp:e.exp,fortune:e.fortune,mind:e.mind,
        portraitCleared,watched:w.watch.some(row=>row.key===key)};`);
    assert(result.unchanged && result.cleared && result.opened && result.portraitCleared && result.watched);
    assert.equal(result.fortune, 68); assert.equal(result.mind, 68);
    const portraitAfterLoad=await page(`const svg=document.querySelector('#inkPersonDetail .g2-portrait-v2__svg');
      return JSON.stringify([...svg.querySelectorAll('g[data-slot]')]
        .map(node=>({slot:node.dataset.slot,variant:node.dataset.variant})));`);
    assert.equal(portraitAfterLoad, await page(`return window.__g1PortraitBeforeSave;`),
      'loading the same saved world must regenerate the same face');
    return {...result, portraitStableAfterLoad:true};
  });
  await check('Canvas nether-window pointer reaches the ghost instead of the mortal at the same cell', async () => {
    const setup = await page(`const k=window.inkbox,w=k.world,e=w.entities.find(e=>e.id===window.__g1Entity.id),
      {spawnNetherGhost}=await import('./src/inkbox/sim/netherLife.js');
      const ghost=spawnNetherGhost(w.nether,{kind:'ghost'});if(!ghost)throw Error('No ghost');
      ghost.x=e.x;ghost.y=e.y;window.__g1Ghost=ghost;window.__g1Entity=e;
      k.g1.close();k.selectTool('viewNether');
      const x=e.x,y=e.y;k.selection={x0:x-6,y0:y-6,x1:x+6,y1:y+6,area:144,
        path:[[x-6,y-6],[x+6,y-6],[x+6,y+6],[x-6,y+6]]};
      k.camera.relief=false;k.camera.focusOn(x,y,{zoom:20,duration:0});k.dirty=true;
      return {id:ghost.id,mortalId:e.id};`);
    const point = await page(projectedCanvas); await browser.click(point.x, point.y);
    const actual = await page(`return window.inkbox.g1.current()?.identity;`);
    assert.equal(actual?.plane, 'nether'); assert.equal(actual.id, setup.id);
    const facts=await page(`return {realm:window.inkbox.g1.current().header.realm,
      text:document.querySelector('#inkPersonDetail').textContent};`);
    assert.equal(facts.realm,'普通鬼魂');assert(!/炼气|Lv1|散修/.test(facts.text));
    await screenshot('canvas-nether');
    return { ...setup, actual, realm:facts.realm, noInventedCultivation:true };
  });

  await check('Seed zero, real map-progress adapter, unsaved guard and help close/reopen', async () => {
    await page(`const k=window.inkbox;k.qol.markPersisted();
      document.querySelector('#inkPresetSelect').value='small';
      document.querySelector('#inkTerrainSelect').value='mountains';
      document.querySelector('#inkSeedInput').value='0';
      document.querySelector('#inkProgressive').checked=true;return true;`);
    await clickControl('#inkBtnRegen');
    assert(await browser.waitFor('return window.inkbox.world.seed===0&&window.inkbox.world.mapProgress?.stage===0'));
    const initial=await page(`const k=window.inkbox;return {seed:k.world.seed,w:k.world.w,h:k.world.h,
      terrain:k.world.generation.terrainPreset,stage:k.world.mapProgress.stage,
      creation:document.querySelector('#inkG1WorldCreationInfo').textContent,
      percent:document.querySelector('#inkG1WorldProgress [role="progressbar"]').getAttribute('aria-valuenow'),
      cardClosed:k.g1.current()===null};`);
    assert.equal(initial.terrain,'mountains');assert.equal(Number(initial.percent),40);
    assert(initial.creation.includes('0')&&initial.creation.includes('200 × 128')&&initial.cardClosed);
    await clickControl('#inkG1WorldDetails summary');
    await clickControl('#inkG1WorldProgress button');
    const expanded=await page(`return {stage:window.inkbox.world.mapProgress.stage,
      percent:document.querySelector('#inkG1WorldProgress [role="progressbar"]').getAttribute('aria-valuenow'),
      dirty:window.inkbox.qol.isDirty()};`);
    assert.equal(expanded.stage,1);assert.equal(Number(expanded.percent),60);assert(expanded.dirty);
    await clickControl('#inkBtnRegen');
    assert(await page(`return !document.querySelector('#inkConfirm').hidden;`));
    await clickControl('#inkConfirmCancel');
    assert.equal(await page(`return window.inkbox.world.mapProgress.stage;`),1);
    await clickControl('#inkBusanziToggle');
    assert(await page(`return document.querySelector('#inkBusanzi').classList.contains('is-collapsed');`));
    await clickControl('#inkBusanziToggle');
    assert(await page(`return !document.querySelector('#inkBusanzi').classList.contains('is-collapsed');`));
    await clickControl('#inkBusanziToggle');
    await clickControl('#inkBtnHelp');assert(await page(`return !document.querySelector('#inkHelp').hidden;`));
    await clickControl('#inkHelpClose');assert(await page(`return document.querySelector('#inkHelp').hidden;`));
    await clickControl('#inkBtnHelp');assert(await page(`return !document.querySelector('#inkHelp').hidden;`));
    await browser.key('escape');assert(await page(`return document.querySelector('#inkHelp').hidden;`));
    await screenshot('canvas-world-progress');
    return {initial,expanded,unsavedGuard:true,helpReopened:true};
  });

  url.searchParams.set('renderer', '3d'); url.searchParams.set('assets', 'on');
  await browser.cdp.send('Page.navigate', { url: url.toString() });
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.active', { timeoutMs: 45000 }));
  await page(`const k=window.inkbox;k.setSpeed(0);k.newWorld('small',0,{progressive:false,terrainPreset:'standard'});
    if(!k.world.entities.some(e=>e.sp==='cultivator'&&e.hp>0)) {
      const tiles=Array.from({length:k.world.size},(_,i)=>i).filter(i=>k.world.isWalkable(i)&&!k.world.struct[i])
        .sort((a,b)=>Math.hypot(a%k.world.w-k.world.w/2,Math.floor(a/k.world.w)-k.world.h/2)
          -Math.hypot(b%k.world.w-k.world.w/2,Math.floor(b/k.world.w)-k.world.h/2));
      k.life.spawn(tiles[0]%k.world.w,Math.floor(tiles[0]/k.world.w),'cultivator',2);
    }
    await k.render3d.renderer.characterLoadPromise;await k.render3d.renderer.environmentLoadPromise;
    await k.render3d.renderer.art.comparisonReady;return true;`);
  assert(await browser.waitFor('return window.inkbox.render3d.renderer.world===window.inkbox.world', { timeoutMs: 30000 }));
  await check('3D visible PlanePicker hit and actual mouse route call main.inspectPlaneSubject', async () => {
    const targets = await page(`const k=window.inkbox,original=k.inspectPlaneSubject;
      window.__g1Inspections=[];k.inspectPlaneSubject=function(plane,ref){
        window.__g1Inspections.push({plane,id:ref.entityId,kind:ref.kind});return original.call(this,plane,ref);};
      return k.world.entities.filter(e=>e.sp==='cultivator'&&e.hp>0).slice(0,12).map(e=>e.id);`);
    let point = null;
    for (const id of targets) {
      await page(`const k=window.inkbox,r=k.render3d.renderer,e=k.world.entities.find(e=>e.id===${id});
        const p=r.coordinates.worldToRender(e.x,e.y,r.stages.get('mortal').elevation.at(e.x,e.y)),rig=r.cameraRig;
        rig.cancelFocus();rig.controls.target.set(p.x,p.y,p.z);rig.camera.position.set(p.x,p.y+220,p.z+65);
        rig.camera.zoom=6;rig.camera.updateProjectionMatrix();rig.controls.update();
        r.focusOn(e.x,e.y,{duration:.05},'mortal');
        for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);return true;`);
      point = await geometryPoint('mortal', id);
      if (point) break;
    }
    assert(point, 'No actual visible cultivar geometry found: '+JSON.stringify(await page('return window.__g1GeometryDiagnostic;')));
    await browser.click(point.x, point.y);
    const actual = await page(`const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext(),
      ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {identity:k.g1.current()?.identity,inspections:window.__g1Inspections,
        portrait:!!document.querySelector('#inkPersonDetail .g1-character__portrait .g2-portrait-v2__svg'),
        webglRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};`);
    assert.equal(actual.identity?.plane, 'mortal'); assert.equal(actual.identity.id, point.id);
    assert(actual.portrait, '3D-selected people must open the same portrait-enabled G1 card');
    assert(actual.inspections.some(row => row.id === point.id && row.kind === 'entity' && row.plane === 'mortal'));
    report.webglRenderer = actual.webglRenderer;
    await screenshot('3d-person');
    return { point, actual };
  });
  await check('3D nether-window visible ghost retains its plane through the main host', async () => {
    const id = await page(`const k=window.inkbox,w=k.world,e=w.entities.find(e=>e.id===k.g1.current().identity.id),
      {spawnNetherGhost}=await import('./src/inkbox/sim/netherLife.js'),g=spawnNetherGhost(w.nether,{kind:'ghost'});
      g.x=e.x;g.y=e.y;k.g1.close();k.selectTool('viewNether');
      const x=e.x,y=e.y;k.selection={x0:x-7,y0:y-7,x1:x+7,y1:y+7,area:196,
        path:[[x-7,y-7],[x+7,y-7],[x+7,y+7],[x-7,y+7]]};
      k.render3d.renderer.focusOn(x,y,{duration:.05},'nether');
      for(let i=0;i<15;i++)await new Promise(requestAnimationFrame);return g.id;`);
    const point = await geometryPoint('nether', id);
    assert(point, 'Ghost must have a real submitted and visible geometry hit: '+JSON.stringify(await page('return window.__g1GeometryDiagnostic;')));
    await browser.click(point.x, point.y);
    const actual = await page(`return {identity:window.inkbox.g1.current()?.identity,
      inspections:window.__g1Inspections.slice(-1)};`);
    assert.equal(actual.identity?.plane, 'nether'); assert.equal(actual.identity.id, id);
    assert.equal(actual.inspections[0]?.plane, 'nether');
    const facts=await page(`return {realm:window.inkbox.g1.current().header.realm,
      text:document.querySelector('#inkPersonDetail').textContent};`);
    assert.equal(facts.realm,'普通鬼魂');assert(!/炼气|Lv1|散修/.test(facts.text));
    actual.realm=facts.realm;actual.noInventedCultivation=true;
    await screenshot('3d-nether');
    return { point, actual };
  });
  await check('Actual file import clears stale card and Canvas/3D toggles retain fresh identity', async () => {
    const save=await page(`const k=window.inkbox,io=await import('./src/inkbox/io/save.js');
      k.g1.open('mortal:'+k.world.entities.find(e=>e.sp==='cultivator'&&e.hp>0).id);
      window.__g1ImportWorld=k.world;window.__g1ImportButton=document.querySelector('[data-g1-action="watch"]');
      k.qol.markPersisted();return io.serializeWorld(k.world);`);
    const importFile=path.join(output,'import-fixture.json');fs.writeFileSync(importFile,JSON.stringify(save));
    const dom=await browser.cdp.send('DOM.getDocument',{depth:0});
    const input=await browser.cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#inkImportFile'});
    await browser.cdp.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[importFile]});
    assert(await browser.waitFor('return window.inkbox.world!==window.__g1ImportWorld',{timeoutMs:20000}));
    const result=await page(`const k=window.inkbox,io=await import('./src/inkbox/io/save.js'),
      before=JSON.stringify(io.serializeWorld(k.world));window.__g1ImportButton.click();
      return {seed:k.world.seed,cleared:k.g1.current()===null,dirty:k.qol.isDirty(),
        unchanged:before===JSON.stringify(io.serializeWorld(k.world))};`);
    assert(result.cleared&&result.unchanged&&!result.dirty);assert.equal(result.seed,save.seed);
    await page(`const k=window.inkbox;k.closeRealmView();k.g1.open('mortal:'+k.world.entities.find(e=>e.sp==='cultivator'&&e.hp>0).id);
      window.__g1ToggleKey=k.g1.current().identity.key;return true;`);
    await clickControl('#inkRender3DTools [data-action="toggle"]');
    assert(await page(`return !window.inkbox.render3d.active&&window.inkbox.g1.current().identity.key===window.__g1ToggleKey;`));
    await clickControl('#inkRender3DTools [data-action="toggle"]');
    assert(await page(`return window.inkbox.render3d.active&&window.inkbox.g1.current().identity.key===window.__g1ToggleKey;`));
    return {...result,actualFileInput:true,rendererToggles:2};
  });
  report.runtimeErrors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled'
    && e.params.type === 'error').map(e => e.params.args.map(a => a.value || a.description || '').join(' '));
  assert.deepEqual(report.runtimeErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
} catch (error) {
  report.error = error.stack;
  console.error(error);
  if (browser) { try { await screenshot('failure'); } catch {} }
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'g1-browser.json'), JSON.stringify(report, null, 2) + '\n');
  if (browser) await browser.close();
  if (server) server.kill();
}
console.log('G1 browser host: ' + report.checks.length + ' checks; pass=' + report.pass);

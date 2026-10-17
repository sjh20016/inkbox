// Real Edge player loop, separate from all performance measurements.
// One World per renderer, real UI creation/picking/watch/burn/save/load; controlled simulation, no performance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {launch,findEdge,sleep} from './cdp.mjs';
import {collectBrowserErrors} from './inkbox-browser-errors.mjs';
import {combatFixtureExpression} from './inkbox-g2-fixtures.mjs';
import {launchOwnedServer} from './inkbox-owned-server.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=Number(process.env.INKBOX_PORT||0);
let BASE=process.env.INKBOX_URL;
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(ROOT,'reports/local/p1/loop'));
const selectedRenderer=process.env.INKBOX_P1_RENDERER;
assert(selectedRenderer===undefined||['canvas','3d'].includes(selectedRenderer),'Unknown P1 diagnostic renderer');
const renderers=selectedRenderer?[selectedRenderer]:['canvas','3d'];
const sources=['scripts/inkbox-p1-loop-browser.mjs','scripts/cdp.mjs','scripts/inkbox-g2-fixtures.mjs','scripts/inkbox-browser-errors.mjs','src/inkbox/main.js','src/inkbox/render3d/Render3DAdapter.js','src/inkbox/g2/combatObservationRuntime.js','src/inkbox/g2/environmentObservationRuntime.js','src/inkbox/sim/life.js','src/inkbox/ui/playerExperienceNav.js'];
const report={startedAt:new Date().toISOString(),pass:false,performanceClaim:false,renderer:'canvas',gpuRequested:true,scope:'Single real World per renderer (Canvas and hardware Three); controlled advanceDays schedule; setup only uses official Life.spawn fixture with full initial HP. No emitted fake events or direct attack calls.',head:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim(),sourceHashes:Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')])),checks:[]};
let server,browser,renderer='canvas';
report.runs=[];report.screenshots=[];report.selectedRenderers=renderers;report.completeRendererCoverage=renderers.length===2;
const page=body=>browser.js(`return(async()=>{${body}})()`,{timeoutMs:60000});
const frames=()=>page('await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return true;');
async function check(name,fn,{continueOnFailure=false}={}){
 report.phase=name;
 try{const evidence=await fn();report.checks.push({name,renderer,pass:true,evidence});console.log('PASS '+name);}
 catch(error){
   report.checks.push({name,renderer,pass:false,error:String(error.stack||error)});
   if(!continueOnFailure)throw error;
   console.error('FAIL '+name+': '+error.message);
   await shot('failed-person-pick');
 }
}
async function shot(name){const file=await browser.screenshot(path.join(OUT,renderer+'-'+name+'.png'));report.screenshots.push(file);return file;}
async function wait(expr,label){assert(await browser.waitFor(expr,{timeoutMs:60000}),label);}
async function click(selector){const p=await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||e.hidden)throw Error('Missing usable '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!r.width||!r.height||!(e===hit||e.contains(hit)))throw Error('Intercepted '+${JSON.stringify(selector)});return{x,y};`);await browser.click(p.x,p.y);await frames();}
async function key(key,vk,modifiers=0){for(const type of ['keyDown','keyUp'])await browser.cdp.send('Input.dispatchKeyEvent',{type,key,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers});}
async function choose(selector,value){const index=await page(`const s=document.querySelector(${JSON.stringify(selector)}),n=[...s.options].findIndex(o=>o.value===${JSON.stringify(value)});if(n<0)throw Error('Option missing');return n;`);await click(selector);await key('Home',36);for(let i=0;i<index;i++)await key('ArrowDown',40);await key('Enter',13);assert.equal(await page(`return document.querySelector(${JSON.stringify(selector)}).value;`),value);}
async function seed(value){await click('#inkSeedInput');await key('a',65,2);await browser.cdp.send('Input.insertText',{text:String(value)});assert.equal(await page('return document.querySelector("#inkSeedInput").value;'),String(value));}
async function confirm(){if(await page('const e=document.querySelector("#inkConfirm");return !!e&&!e.hidden;'))await click('#inkConfirmOk');}
async function regen(value){await seed(value);await click('#inkBtnRegen');await confirm();await wait(`return window.inkbox.world.seed===${value}`,'UI creation did not install requested seed');await frames();}
async function tool(id){if(renderer==='3d'){await choose('#inkRender3DTools select[aria-label="沙盘工具"]',id);return;}if(!await page(`return !!document.querySelector('[data-tool="${id}"]');`))await click(`#inkGroups [data-group="${id==='burn'?'nature':'view'}"]`);await click(`[data-tool="${id}"]`);assert.equal(await page('return window.inkbox.toolId;'),id);}
async function focus(x,y,zoom=8){await page(`const k=window.inkbox;if(${JSON.stringify(renderer)}==='3d'){const r=k.render3d.renderer;r.focusOn(${x},${y},{duration:0},'mortal');r.cameraRig.camera.zoom=${zoom};r.cameraRig.camera.updateProjectionMatrix();}else k.camera.focusOn(${x},${y},{zoom:${zoom},duration:0});k.dirty=true;return true;`);await frames();}
async function worldClick(x,y){const p=await page(`const k=window.inkbox,x=${x},y=${y};if(${JSON.stringify(renderer)}==='3d'){const r=k.render3d.renderer,s=r.stages.get('mortal'),THREE=await import('./vendor/three/build/three.module.js'),rect=k.render3d.canvas.getBoundingClientRect();r.cameraRig.camera.updateMatrixWorld();const p=r.coordinates.worldToRender(x,y,s.elevation.at(x,y)),v=new THREE.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),px=(v.x+1)*rect.width/2,py=(1-v.y)*rect.height/2;const hit=r.pickPlane(px,py,'mortal');return{x:rect.left+px,y:rect.top+py,hit:hit?{x:hit.x,y:hit.y,plane:hit.plane}:null};}const i=k.world.idx(Math.floor(x),Math.floor(y)),a=k.camera.tileScreen(x,y,k.world.height[i]),r=k.canvas.getBoundingClientRect(),hit=k.camera.pick(a[0],a[1],k.world);return{x:r.left+a[0],y:r.top+a[1],hit};`);assert(p.hit&&Math.hypot(p.hit.x-x,p.hit.y-y)<1.5,JSON.stringify(p));await browser.click(p.x,p.y);await frames();return p;}
async function same(){assert(await page('return window.inkbox.world===window.__p1LoopWorld;'),'Unexpected World replacement within loop');}
async function geometryPoint(plane, id) {
  return page(`const k=window.inkbox,r=k.render3d.renderer,s=r.stages.get(${JSON.stringify(plane)}),
    e=s.world.entities.find(e=>e.id===${id}),THREE=await import('./vendor/three/build/three.module.js'),
    rect=k.render3d.canvas.getBoundingClientRect();
    r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
    const points=[],ray=new THREE.Raycaster(),diag={meshes:0,instances:0,triangleSamples:0,samples:0,offscreen:0,hits:{},depthSamples:[],
      target:{id:e.id,x:e.x,y:e.y,height:s.elevation.at(e.x,e.y),struct:s.world.struct[s.world.idx(Math.floor(e.x),Math.floor(e.y))]}};
    // Sample actual submitted instance geometry, including asset-specific anchors and scales.
    s.entities.group.traverse(mesh=>{
      if(!mesh.isInstancedMesh||!mesh.visible||!mesh.count)return;
      for(let parent=mesh.parent;parent;parent=parent.parent)if(!parent.visible)return;
      const records=mesh.userData.renderEntities||[];diag.meshes++;
      for(let index=0;index<mesh.count;index++) {
        if(records[index]?.id!==e.id)continue;diag.instances++;
        mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,matrix=new THREE.Matrix4();
        mesh.getMatrixAt(index,matrix);
        // A bounding-box grid can miss a thin silhouette entirely. Project actual
        // submitted triangle centres before the original grid; the production
        // depth-aware picker must still resolve this exact surviving person.
        const position=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index;
        const start=mesh.geometry.drawRange.start,end=Math.min(indices?.count??position.count,
          start+mesh.geometry.drawRange.count);
        for(let face=start;face+2<end;face+=3){
          const point=new THREE.Vector3();
          for(let corner=0;corner<3;corner++)point.add(new THREE.Vector3().fromBufferAttribute(position,
            indices?indices.getX(face+corner):face+corner));
          points.push({v:mesh.localToWorld(point.multiplyScalar(1/3).applyMatrix4(matrix)).project(r.cameraRig.camera),mesh,index});
          diag.triangleSamples++;
        }
        for(const fx of [.25,.5,.75])for(const fy of [.2,.5,.8])for(const fz of [.25,.5,.75]) {
          const point=new THREE.Vector3(box.min.x+(box.max.x-box.min.x)*fx,
            box.min.y+(box.max.y-box.min.y)*fy,box.min.z+(box.max.z-box.min.z)*fz);
          points.push({v:mesh.localToWorld(point.applyMatrix4(matrix)).project(r.cameraRig.camera),mesh,index});
        }
      }
    });
    for(const {v,mesh,index} of points)for(const dx of [0,-2,2])for(const dy of [0,-2,2]) {
      const x=(v.x+1)*rect.width/2+dx,y=(1-v.y)*rect.height/2+dy;
      if(x<12||x>rect.width-12||y<80||y>rect.height-30){diag.offscreen++;continue;}
      const hit=r.pick(x,y);diag.samples++;
      if(dx===0&&dy===0&&diag.depthSamples.length<5){
        ray.setFromCamera(new THREE.Vector2(x/rect.width*2-1,1-y/rect.height*2),r.cameraRig.camera);
        const own=ray.intersectObject(mesh,false).find(h=>h.instanceId===index);
        if(own)diag.depthSamples.push({mesh:mesh.name,ownDistance:own.distance,nearest:hit?{
          kind:hit.kind,plane:hit.plane,entityId:hit.entityId,distance:hit.distance,x:hit.x,y:hit.y}:null});
      }
      const kind=hit?.plane+':'+hit?.kind;diag.hits[kind]=(diag.hits[kind]||0)+1;
      if(hit?.kind==='entity'&&hit.plane===${JSON.stringify(plane)}&&hit.entityId===e.id)
        return {x:rect.left+x,y:rect.top+y,id:e.id,plane:hit.plane,kind:hit.kind,diag};
    }
    window.__g1GeometryDiagnostic=diag;return null;`);
}
async function selectMapPerson(id){
   await tool('inspect');
   let p=await page(`const k=window.inkbox,e=k.world.entities.find(e=>e.id===${id});if(!e||e.hp<=0)throw Error('Battle survivor unavailable');const h=k.world.height[k.world.idx(Math.floor(e.x),Math.floor(e.y))]||0;k.camera.focusOn(e.x,e.y-(k.camera.relief?h*k.camera.reliefScale:0),{zoom:20,duration:0});k.dirty=true;await new Promise(requestAnimationFrame);const {UnitsLayer}=await import('./src/inkbox/render/unitsLayer.js'),a=UnitsLayer.project(k.camera,e.x,e.y,h),r=k.canvas.getBoundingClientRect();return{x:r.left+a[0],y:r.top+a[1]};`);
   if(renderer==='3d'){
     report.personCameraAttempts=[];p=null;
     for(const view of [{x:0,z:65,zoom:6},{x:0,z:.1,zoom:12},{x:65,z:0,zoom:12},{x:-65,z:0,zoom:12}]){
       const camera=await page(`const k=window.inkbox,r=k.render3d.renderer,e=k.world.entities.find(e=>e.id===${id}),p=r.coordinates.worldToRender(e.x,e.y,r.stages.get('mortal').elevation.at(e.x,e.y)),rig=r.cameraRig;
         rig.cancelFocus();rig.controls.target.set(p.x,p.y,p.z);rig.camera.position.set(p.x+${view.x},p.y+220,p.z+${view.z});rig.camera.zoom=${view.zoom};rig.camera.updateProjectionMatrix();rig.controls.update();
         r.focusOn(e.x,e.y,{duration:.05},'mortal');await new Promise(resolve=>setTimeout(resolve,400));await new Promise(requestAnimationFrame);
         return{target:{id:e.id,x:e.x,y:e.y},position:rig.camera.position.toArray(),zoom:rig.camera.zoom,method:'Normal camera views; real submitted geometry and depth-aware picker unchanged'};`);
       p=await geometryPoint('mortal',id);report.personCameraAttempts.push({camera,pick:p||await page('return window.__g1GeometryDiagnostic;')});
       if(p)break;
     }
     report.personPick=p||report.personCameraAttempts.at(-1).pick;
     assert(p,'No real submitted character pick: '+JSON.stringify(report.personCameraAttempts));
   }
   await browser.click(p.x,p.y);await frames();
   if(await page('return !!document.querySelector("#inkG1Candidates");')){const value=await page(`return [...document.querySelector('#inkG1Candidates').options].find(o=>o.textContent.endsWith('#'+${id}))?.value;`);assert.notEqual(value,undefined);await choose('#inkG1Candidates',value);await click('#inkG1OpenCandidate');}
   assert.equal(await page('return window.inkbox.g1.current()?.identity.id;'),id);
   return page('const k=window.inkbox;return{id:k.g1.current().identity.id,hp:k.g1.current().health.hp,day:k.world.day};');
}
try{
 fs.mkdirSync(OUT,{recursive:true});
 if(!BASE){const owned=await launchOwnedServer({root:ROOT,port:PORT});server=owned.child;BASE=owned.url;report.serverIdentity=owned.identity;}
 else report.serverIdentity={owned:false,url:BASE,reason:'External server source identity unverified'};
 browser=await launch({url:BASE+'/inkbox.html',browser:findEdge(),width:1500,height:940,gpu:true});report.browser=browser.meta;
 for(renderer of renderers){
 report.renderer=renderer;
 await browser.cdp.send('Page.navigate',{url:BASE+'/inkbox.html'+(renderer==='3d'?'?renderer=3d&assets=on':'')});
 await wait('return !!window.inkbox?.g1&&!!document.querySelector("[data-experience-target]")','P1 product missing');
 await page('window.inkbox.setSpeed(0);return true;');
 if(renderer==='3d'){await wait('return !!window.inkbox.render3d?.active&&!!window.inkbox.render3d.renderer?.stages.get("mortal")','Three not active');await page('const r=window.inkbox.render3d.renderer;await r.characterLoadPromise;await r.environmentLoadPromise;await r.art.comparisonReady;return true;');report.hardware=await page(`const gl=window.inkbox.render3d.renderer.gpu.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:gl.getParameter(e?e.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};`);assert(!/swiftshader|llvmpipe|software|basic render|warp/i.test(report.hardware.renderer),'Hardware required: '+JSON.stringify(report.hardware));}
 await check('Real creation controls establish one World',async()=>{await choose('#inkPresetSelect','small');if(await page('return document.querySelector("#inkProgressive").checked;'))await click('#inkProgressive');await regen(673231);return page('window.__p1LoopWorld=window.inkbox.world;return{seed:window.inkbox.world.seed,size:[window.inkbox.world.w,window.inkbox.world.h],day:window.inkbox.world.day};');});
 await check('Formal full-HP fixture reaches real battle injury and natural rest',async()=>{
   report.fixture=await browser.js(combatFixtureExpression({count:2}));assert(report.fixture.originalEntitiesRetained);assert(report.fixture.actors.every(e=>e.hp===e.maxHp));
   // Select the real visible fighter before normal simulation can build an opaque sect over the resting person.
   report.preCombatPick=await selectMapPerson(report.fixture.actors[1].id);
   await page(`const k=window.inkbox,original=k.life.attack;window.__p1Battle={hits:[],rest:null,steps:0,observationProof:null};k.life.attack=function(e,target,...args){const before={hp:target.hp,restUntil:target.restUntil,day:k.world.day};const result=original.call(this,e,target,...args);if(window.__g2CombatActors.includes(e.id)&&window.__g2CombatActors.includes(target.id)){const row={attacker:e.id,target:target.id,before,after:{hp:target.hp,maxHp:target.maxHp,restUntil:target.restUntil,day:k.world.day}};if(target.hp<before.hp)window.__p1Battle.hits.push(row);if(target.hp>0&&target.hp<before.hp&&!(before.restUntil>before.day)&&target.restUntil>k.world.day)window.__p1Battle.rest=row;}return result;};window.__p1RestoreAttack=()=>{k.life.attack=original};return true;`);
   try{for(let i=0;i<600;i++){const done=await page('const k=window.inkbox;k.advanceDays(.2);window.__p1Battle.steps++;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);k.combatObservation.refresh();const vm=k.combatObservation.current(),items=k.stage.snapshotPlane("mortal")?.items||[],pair=items.filter(e=>e.kind==="combat"&&window.__g2CombatActors.includes(e.subjectId)&&window.__g2CombatActors.includes(e.targetId));const matches=pair.flatMap(item=>{const actor=k.world.entities.find(e=>e.id===item.subjectId),target=k.world.entities.find(e=>e.id===item.targetId);const event=vm.events.find(row=>row.plane===item.plane&&row.day===item.day&&row.actor===(actor?.name||("人物 #"+item.subjectId))&&row.target===(target?.name||("人物 #"+item.targetId))&&row.x===target?.x&&row.y===target?.y&&row.canObserve===true);return event?[{stage:item,event,actorId:item.subjectId,targetId:item.targetId}]:[];});if(matches.length&&!window.__p1Battle.observationProof)window.__p1Battle.observationProof={day:k.world.day,matches};return !!window.__p1Battle.rest;');if(done)break;}}finally{report.battle=await page('window.__p1RestoreAttack();return {...window.__p1Battle,schedule:{stepDays:.2,maxSteps:600,maxDays:120,clock:"controlled simulation"}};');}
   assert(report.battle.hits.length>0,'No real attack damage in bounded schedule');assert(report.battle.rest,'No natural rest transition; full bounded evidence retained');assert(report.battle.observationProof,'Real pair hit did not reach Stage and G22 observation');await same();return report.battle;
 });
 await check('Selected real person displays natural injury and watch command',async()=>{
   const id=report.battle.rest.target;
   assert.equal(report.preCombatPick.id,id,'Natural rest target must be the person selected before combat');
   assert.equal(await page('return window.inkbox.g1.current()?.identity.id;'),id);
   const health=await page('window.inkbox.g1.refresh();return window.inkbox.g1.current()?.health;');assert.equal(health?.state,'recovering','G1 must explain real rest');
   await click('[data-g1-action="watch"]');const result=await page(`const k=window.inkbox;return{identity:k.g1.current().identity,health:k.g1.current().health,watched:k.world.watch.some(e=>e.key==='mortal:'+${id}),dirty:k.qol.isDirty()};`);assert(result.watched&&result.dirty);await shot('real-injury-watched');await click('[data-g1-action="close"]');await same();return result;
 },{continueOnFailure:true});
 await check('Real burn brush, extinction and ecology recovery',async()=>{
   report.land=await page(`const k=window.inkbox,w=k.world;let best=null;for(let y=10;y<w.h-10;y+=2)for(let x=10;x<w.w-10;x+=2){let v=0,water=0,n=0;for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){if(dx*dx+dy*dy>25)continue;const i=w.idx(x+dx,y+dy);v+=w.veg[i];water+=w.water[i];n++;}const score=v/n-water/n*2;if(!best||score>best.score)best={x,y,score,veg:v/n,water:water/n};}if(!best||best.veg<.22||best.water>.01)throw Error('No live dry forest');k.camera.focusOn(best.x,best.y,{zoom:8,duration:0});return best;`);
   await focus(report.land.x,report.land.y,8);await tool('burn');report.burnPointer=await worldClick(report.land.x,report.land.y);await tool('inspect');await worldClick(report.land.x,report.land.y);
   const initial=await page('const k=window.inkbox;k.environmentObservation.refresh();return k.environmentObservation.current();');assert(initial.observation?.environment.activeFireCells>0,'Official brush produced no observed fire');if(await page('return !!document.querySelector("#inkInspect.on #inkInspectClose");'))await click('#inkInspectClose');
   await shot('real-burn-observation');await click('#inkEnvironmentObserver [data-environment-action="record-baseline"]');
   report.ecology=await page(`const k=window.inkbox,samples=[];for(let i=0;i<150;i++){k.advanceDays(.8);k.environmentObservation.refresh();const e=k.environmentObservation.current().observation.environment;samples.push({day:k.world.day,fire:e.activeFireCells,veg:e.vegetationMean});if(!e.activeFireCells)break;if(i%10===0)await new Promise(requestAnimationFrame);}const afterFire=k.environmentObservation.current().observation.environment;for(let i=0;i<30;i++){k.advanceDays(5);if(i%5===0)await new Promise(requestAnimationFrame);}k.environmentObservation.refresh();return{samples,afterFire,final:k.environmentObservation.current()};`);
   assert.equal(report.ecology.afterFire.activeFireCells,0);const a=report.ecology.afterFire,b=report.ecology.final.observation.environment;assert(b.vegetationMean>a.vegetationMean||b.scorchedCells<a.scorchedCells||b.ashCells>a.ashCells,'No natural aftermath recovery');assert(report.ecology.final.comparison?.ok);await same();return report.ecology;
 });
 await check('UI save, UI replacement World, UI load restore facts and invalidate old observation',async()=>{
   await choose('#inkSlotSelect','slot8');await click('#inkBtnSave');await wait('return !window.inkbox.qol.isDirty()&&!document.querySelector("#inkBtnSave").disabled','UI save failed');
   report.saved=await page(`const k=window.inkbox,id=${report.battle.rest.target},e=k.world.entities.find(e=>e.id===id),o=k.environmentObservation.current();window.__p1OldContext=o.contextId;window.__p1OldObservation=o.observationId;return{seed:k.world.seed,day:k.world.day,watch:k.world.watch.map(e=>e.key),person:{id:e.id,hp:e.hp,restUntil:e.restUntil},location:o.observation.location};`);
   await regen(673232);assert(await page('return window.inkbox.world!==window.__p1LoopWorld;'));
   report.stale=await page('return window.inkbox.environmentObservation.handleAction({type:"read-area",contextId:window.__p1OldContext,observationId:window.__p1OldObservation});');assert.equal(report.stale.ok,false);assert.equal(report.stale.reason,'stale-context');
   await page('window.__p1ReplacementWorld=window.inkbox.world;return true;');await click('#inkBtnLoad');await confirm();await wait('return window.inkbox.world!==window.__p1ReplacementWorld&&window.inkbox.world.seed===673231','UI load failed');
   report.loaded=await page(`const k=window.inkbox,e=k.world.entities.find(e=>e.id===${report.saved.person.id});return{seed:k.world.seed,day:k.world.day,watch:k.world.watch.map(e=>e.key),person:{id:e.id,hp:e.hp,restUntil:e.restUntil},observation:k.environmentObservation.current().observation,g1:k.g1.current()};`);
   assert.equal(report.loaded.seed,report.saved.seed);assert.equal(report.loaded.day,report.saved.day);assert.deepEqual(report.loaded.person,report.saved.person);assert.deepEqual(report.loaded.watch,report.saved.watch);assert.equal(report.loaded.observation,null);assert.equal(report.loaded.g1,null);await shot('loaded-world');return{saved:report.saved,loaded:report.loaded,stale:report.stale};
 });
 report.runs.push({renderer,preCombatPick:report.preCombatPick,personCameraAttempts:report.personCameraAttempts,hardware:renderer==='3d'?report.hardware:null,fixture:report.fixture,battle:report.battle,land:report.land,ecology:report.ecology,saved:report.saved,loaded:report.loaded});
 }
 report.browserErrors=collectBrowserErrors(browser);assert.equal(report.browserErrors.length,0,JSON.stringify(report.browserErrors));
 report.targetedPass=report.checks.every(check=>check.pass);
 report.pass=report.targetedPass&&report.completeRendererCoverage&&report.serverIdentity?.owned===true;
 if(!report.pass){report.error=report.targetedPass?'Partial or externally served diagnostics do not establish full P1 acceptance':'Player-loop check failed; independent remaining checks retained';process.exitCode=1;}
}catch(error){report.error=String(error.stack||error);report.pass=false;process.exitCode=1;if(browser){try{report.failureScreenshot=await browser.screenshot(path.join(OUT,'loop-failure.png'));report.failureFacts=await page('const k=window.inkbox;return{day:k?.world?.day,battle:window.__p1Battle,observation:k?.environmentObservation?.current(),g1:k?.g1?.current(),geometryDiagnostic:window.__g1GeometryDiagnostic};');}catch(e){report.failureEvidenceError=String(e);}}}
finally{
 if(browser){try{report.authoritativeCleanup=await browser.close();}catch(e){report.cleanupError=String(e.stack||e);}report.browserErrors=collectBrowserErrors(browser);if(!report.authoritativeCleanup?.complete||report.browserErrors.length){report.pass=false;process.exitCode=1;}}
 if(server){if(server.exitCode!==null||server.signalCode!==null){report.pass=false;process.exitCode=1;report.serverPrematureExit=true;}server.kill();for(let n=0;n<50&&server.exitCode===null&&server.signalCode===null;n++)await sleep(100);if(server.exitCode===null&&server.signalCode===null){report.pass=false;process.exitCode=1;report.serverCleanupFailed=true;}}
 report.actualExitCode=process.exitCode||0;report.finishedAt=new Date().toISOString();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'p1-loop-browser.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('P1 loop: '+report.checks.length+' checks; pass='+report.pass);

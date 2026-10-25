// Native product controls over a clearly labelled, production-serialized fixture.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launch,findEdge} from './cdp.mjs';
import {writeWanlingScene} from './fixtures/wanling-scene.mjs';
const base=process.env.INKBOX_URL||'http://127.0.0.1:4233/inkbox.html';
const out=path.resolve(process.env.INKBOX_REPORT_DIR||`reports/local/w01/browser/${new Date().toISOString().replaceAll(':','-')}`);
fs.mkdirSync(out,{recursive:true});
const fixture=writeWanlingScene({outputDir:path.join(out,'fixture')});
const report={started:new Date().toISOString(),url:base,fixture:fixture.metadata,checks:[],actions:[],screenshots:[],
  source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()};
let b;const js=body=>b.js(`return(async()=>{${body}})();`,{timeoutMs:45000});
function check(name,value,evidence){report.checks.push({name,pass:!!value,evidence});if(!value)throw Error(name);}
async function click(selector){const p=await js(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)throw Error('No visible '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>setTimeout(r,160));await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);if(h!==e&&!e.contains(h))throw Error('Occluded '+${JSON.stringify(selector)}+' by '+h?.outerHTML.slice(0,150));return{x,y};`);await b.click(p.x,p.y);report.actions.push({selector,...p});}
async function value(selector,v,event='change'){await js(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');e.value=${JSON.stringify(v)};if(e.value!==${JSON.stringify(v)})throw Error('Missing option');e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));return true;`);}
async function shot(name){const file=await b.screenshot(path.join(out,`${name}.png`));report.screenshots.push(file);}
async function facts(){return js(`const w=inkbox.world;return {day:w.day,people:w.entities.length,villages:w.villages.map(v=>({id:v.id,pop:v.pop,food:v.food,hp:v.hp})),units:structuredClone(w.wanling?.units||[]),state:structuredClone(w.wanling||null),three:!!inkbox.render3d?.active,actorJobs:w.wanling?.jobs?.map(j=>({...j})),wraiths:w.wraiths?.length,biyi:(await import('./src/inkbox/render/wanlingLayer.js')).readBiyiPairs(w)};`);}
async function advance(days){await js(`for(let n=0;n<${days};n++)inkbox.advanceDays(1);inkbox.updateHud();inkbox.refreshFolds();inkbox.wanlingCodex.refresh(true);await new Promise(requestAnimationFrame);return true;`);}
async function screen(x,y){return js(`const x=${x},y=${y};if(inkbox.render3d?.active){const h=inkbox.render3d.renderer,s=h.stages.get('mortal'),p=h.coordinates.worldToRender(x,y,s.elevation.at(x,y)),v=h.cameraRig.camera.position.clone().set(p.x,p.y,p.z).project(h.cameraRig.camera),r=inkbox.render3d.canvas.getBoundingClientRect();return{x:(v.x+1)*r.width/2+r.x,y:(1-v.y)*r.height/2+r.y};}const w=inkbox.world,r=inkbox.canvas.getBoundingClientRect(),p=inkbox.camera.tileScreen(x,y,w.height[w.idx(Math.floor(x),Math.floor(y))]);return{x:p[0]+r.x,y:p[1]+r.y};`);}
async function put(form,x,y){await value('#inkWanlingForm',form);await click('#inkWanlingPlace');check(`native tool selection ${form}`,await js(`return inkbox.wanlingForm===${JSON.stringify(form)}&&inkbox.toolId==='beast';`));await js(`inkbox.camera.focusOn(${x},${y},{zoom:7,duration:0});return true;`);await new Promise(r=>setTimeout(r,120));const p=await screen(x,y);await b.click(p.x,p.y);const s=await facts(),u=s.units.find(u=>u.form===form&&Math.hypot(u.x-x,u.y-y)<3);check(`native placement ${form}`,u,{point:p,unit:u,toast:await js('return inkbox.toast;')});return u;}
async function threeTool(tool){await value('#inkRender3DTools select[aria-label="沙盘工具"]',tool);}
async function stroke(tool,x,y){await threeTool(tool);await js(`inkbox.camera.focusOn(${x},${y},{zoom:7,duration:0});return true;`);await new Promise(r=>setTimeout(r,150));const p=await screen(x,y);await b.mouseMove(p.x,p.y);await b.mouseDown(p.x,p.y);await new Promise(r=>setTimeout(r,160));await b.mouseUp(p.x,p.y);report.actions.push({power:tool,x,y,screen:p});}
try{
 b=await launch({url:base,browser:findEdge(),width:1366,height:768,gpu:true});
 check('normal product boots',await b.waitFor('return !!window.inkbox?.world&&!!inkbox.wanlingCodex;',{timeoutMs:45000}));
 await b.key('escape');await js('inkbox.setSpeed(0);return true;');
 check('catalog has 13 assets and 5 ecology entries',await js('return document.querySelector("#inkWanlingForm").options.length===18;'));
 await click('#inkBtnImport');const doc=await b.cdp.send('DOM.getDocument'),input=await b.cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#inkImportFile'});
 await b.cdp.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fixture.savePath]});
 check('native production save import',await b.waitFor('return (()=>{if(inkbox.world.w===200&&inkbox.world.entities.length===77&&inkbox.world.villages.length===2&&!inkbox.qol.isBusy("inkBtnImport")){inkbox.setSpeed(0);return true;}return false;})();',{timeoutMs:30000}));
 await click('#inkWanling summary');const initial=await facts();report.initial=initial;
 check('biyi comes from a real living lover pair',initial.biyi.length===1,initial.biyi);
 const dang=await put('dangkang',48,64),dog=await put('tiangou',52,64);
 await put('lushu',42,64);await put('xuangui',84,64);await put('chiru',95,60);await put('jingwei',84,70);await put('jiuweihu',48,60);await put('zheng',145,30);await put('dijiang',80,25);await put('qiongqi',70,76);await put('fei',63,64);await put('kaiming',44,66);
 const deer=await put('deer',36,36),wolf=await put('wolf',36,36),wood=await put('wood',30,30),water=await put('water',100,62),stone=await put('stone',148,30);
 const placed=await facts();check('17 forms use ecology capacity without consuming people',placed.units.length===17&&placed.people===initial.people,placed);
 const influence=await js('return(await import("./src/inkbox/world/wanlingInfluence.js")).wanlingVillageInfluence(inkbox.world,inkbox.world.villages[0]);');
 check('dangkang reaches the real village yield input',influence.yieldScale>1&&influence.sources.some(s=>s.id===dang.id),influence);
 await click(`[data-wanling-id="${dang.id}"]`);await click(`[data-wanling-remove="${dang.id}"]`);
 const removed=await js('return(await import("./src/inkbox/world/wanlingInfluence.js")).wanlingVillageInfluence(inkbox.world,inkbox.world.villages[0]);');check('native withdrawal immediately removes harvest influence',removed.yieldScale===1,removed);
 await put('dangkang',48,64);await click(`[data-wanling-id="${deer.id}"]`);await shot('01-canvas-real-herds');
 await value('#inkWanlingForm','jingwei');await click('#inkWanlingPreview');check('one real model preview loads on demand',await b.waitFor('return !!document.querySelector(".wanling-model canvas");',{timeoutMs:30000}));await shot('02-native-catalog-model');await click('dialog.wanling-preview > button');
 const beforeView=JSON.stringify((await facts()).state);
 await click('#r1CanvasView button[title="进入立体沙盘，保留当前世界"]');check('Three enters same product world',await b.waitFor('return inkbox.render3d?.active;',{timeoutMs:45000}));
 check('all 13 encountered creature models load',await b.waitFor('return inkbox.render3d?.renderer.creatureLibrary?.ids?.length===13;',{timeoutMs:45000}));
 check('renderer switch has no simulation side effect',JSON.stringify((await facts()).state)===beforeView);
 await click('#r1VolumeTab-yi');await shot('03a-three-entry');
 await click(`[data-wanling-id="${dog.id}"]`);await shot('03-three-real-village-guard');
 await click(`[data-wanling-id="${water.id}"]`);await threeTool('inspect');
 const p=await js(`await new Promise(r=>setTimeout(r,750));const host=inkbox.render3d.renderer,stage=host.stages.get('mortal'),T=await import('three');let point=null;stage.root.traverse(mesh=>{if(point||!mesh.isInstancedMesh||!mesh.visible)return;const records=mesh.userData.renderEntities||[],index=records.findIndex(r=>r?.identityContainer==='wanling'&&r.id===${water.id});if(index<0)return;mesh.geometry.computeBoundingSphere();const v=mesh.geometry.boundingSphere.center.clone(),m=new T.Matrix4();mesh.getMatrixAt(index,m);v.applyMatrix4(m).applyMatrix4(mesh.matrixWorld).project(host.cameraRig.camera);const sx=(v.x*.5+.5)*host.width,sy=(-v.y*.5+.5)*host.height;for(const dy of [0,-2,2,-5,5])for(const dx of [0,-2,2,-5,5]){const h=host.pick(sx+dx,sy+dy);if(h?.kind==='entity'&&h.entityContainer==='wanling'&&h.entityId===${water.id}){const r=inkbox.render3d.canvas.getBoundingClientRect();point={x:sx+dx+r.x,y:sy+dy+r.y};return;}}});return point;`);
 check('real Three instance carries exact spirit identity',p,p);await b.click(p.x,p.y);
 report.threePick=await js('return document.querySelector("#inkInspect").textContent;');check('native Three inspect resolves the actual spirit',report.threePick.includes('水精'),report.threePick);
 await advance(30);let moved=await facts();
 check('real predator reduces aggregate deer quantity',moved.units.find(u=>u.id===deer.id)?.count<deer.count,{before:deer,after:moved.units.find(u=>u.id===deer.id),wolf:moved.units.find(u=>u.id===wolf.id)});
 check('first predation has a visible causal event',moved.state.events.some(e=>e.id===deer.id&&e.text.includes('数量')),moved.state.events.filter(e=>e.id===deer.id));
 check('real dao goals exist without creating people',moved.actorJobs?.length>0&&moved.people<=initial.people+8,moved.actorJobs);
 await click(`[data-wanling-id="${deer.id}"]`);await shot('04-real-predation-and-dao');
 const slot='#inkSlotSelect';await value(slot,'slot1');await click('#inkBtnSave');if(await js('return inkbox.qol.confirmOpen();'))await click('#inkConfirmOk');
 check('native compressed save finishes',await b.waitFor('return !inkbox.qol.isBusy("inkBtnSave")&&/已存档/.test(inkbox.toast);',{timeoutMs:20000}));const saved=await facts();
 await click('#inkBtnLoad');if(await js('return inkbox.qol.confirmOpen();'))await click('#inkConfirmOk');
 check('native compressed load finishes',await b.waitFor('return !inkbox.qol.isBusy("inkBtnLoad")&&/已读取/.test(inkbox.toast);',{timeoutMs:20000}));
 check('species groups anchors and dao cooldowns survive reload',JSON.stringify((await facts()).state)===JSON.stringify(saved.state));
 const interventionBefore=await facts();await stroke('burn',wood.x,wood.y);
 // Drain the connected local basin: a small brush is replenished by the existing
 // event-driven shore response. Change the real UI radius, not world.water.
 await value('#inkRender3DTools [aria-label="笔刷半径"]','32','input');
 for(let n=0;n<8;n++){const depth=await js(`return inkbox.world.water[inkbox.world.idx(${Math.floor(water.x)},${Math.floor(water.y)})];`);if(depth<.008)break;await stroke('drain',water.x,water.y);}
 await value('#inkRender3DTools [aria-label="笔刷半径"]','6','input');
 for(let n=0;n<6;n++){const h=await js(`return inkbox.world.height[inkbox.world.idx(${Math.floor(stone.x)},${Math.floor(stone.y)})];`);if(h<.58)break;await stroke('lower',stone.x,stone.y);}
 const edits=await js(`const w=inkbox.world;return {fire:w.fire[w.idx(${Math.floor(wood.x)},${Math.floor(wood.y)})],water:w.water[w.idx(${Math.floor(water.x)},${Math.floor(water.y)})],height:w.height[w.idx(${Math.floor(stone.x)},${Math.floor(stone.y)})]};`);
 check('native Three interventions change actual terrain',edits.fire>0&&edits.water<.008&&edits.height<.58,edits);
 await advance(30);const reacted=await facts();
 for(const u of [wood,water,stone]){const after=reacted.units.find(a=>a.id===u.id);check(`terrain spirit ${u.form} reacts`,!after||after.state==='migrating'||after.hp<u.hp||Math.hypot(after.x-u.x,after.y-u.y)>0,{before:u,after});}
 check('terrain loss has visible spirit events',[wood,water,stone].every(u=>reacted.state.events.some(e=>e.id===u.id&&e.text.includes('栖地'))),reacted.state.events.filter(e=>[wood.id,water.id,stone.id].includes(e.id)));
 await shot('05-three-terrain-spirit-response');
 const struck=await put('dangkang',185,115);await stroke('lightning',struck.x,struck.y);const afterStrike=await facts();
 check('native Three thunder destroys an actual new unit',!afterStrike.units.some(u=>u.id===struck.id)&&afterStrike.state.events.some(e=>e.id===struck.id&&e.text.includes('雷击')),{target:struck,events:afterStrike.state.events.filter(e=>e.id===struck.id)});
 await shot('07-three-real-calamity');
 await click('#inkRender3DTools [data-action="toggle"]');check('Canvas returns without changing facts',!(await facts()).three&&JSON.stringify((await facts()).state)===JSON.stringify(afterStrike.state));
 await b.cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await shot('06-canvas-reloaded-world-1280');
 report.final=await facts();report.environment=await js('const gl=inkbox.render3d.renderer.gpu.getContext(),ext=gl.getExtension("WEBGL_debug_renderer_info");return{ua:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError(),dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],map:[inkbox.world.w,inkbox.world.h]};');
 report.errors={js:b.errors(),console:b.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description))};check('no browser or GPU errors',!report.errors.js.length&&!report.errors.console.length&&report.environment.glError===0,report.errors);report.pass=true;
}catch(error){report.failure=error.stack;report.browserErrors=b?.errors?.();if(b)try{await shot('failure');}catch{}process.exitCode=1;}
finally{if(b)report.cleanup=await b.close();if(report.cleanup&&!report.cleanup.complete){report.pass=false;process.exitCode=1;}report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:!!report.pass,checks:report.checks.length,failure:report.failure,cleanup:report.cleanup,out}));}

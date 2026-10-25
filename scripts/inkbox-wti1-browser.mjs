// Native controls and map pointers over ordinary creation and an explicitly imported joint fixture.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, findEdge } from './cdp.mjs';
import { writeWti1Scene } from './fixtures/wti1-scene.mjs';
import { createWanlingScene, populateWanlingFixture } from './fixtures/wanling-scene.mjs';
import { serializeWorld } from '../src/inkbox/io/save.js';

const url=process.env.INKBOX_URL||'http://127.0.0.1:4235/inkbox.html';
const out=path.resolve(process.env.INKBOX_REPORT_DIR||`reports/local/wti1/browser/${new Date().toISOString().replaceAll(':','-')}`);
fs.mkdirSync(out,{recursive:true});
const fixture=writeWti1Scene(path.join(out,'fixture'));
const full=createWanlingScene({w:512,h:320});populateWanlingFixture(full.world,{perForm:8});
const fullFile=path.join(out,'capacity.save.json');fs.writeFileSync(fullFile,JSON.stringify(serializeWorld(full.world)));
const badFiles={};for(const block of ['wanling','transit']){const p=JSON.parse(fs.readFileSync(fixture.savePath,'utf8'));p[block]||={};p[block].v=99;const file=path.join(out,`bad-${block}.json`);fs.writeFileSync(file,JSON.stringify(p));badFiles[block]=file;}
const report={url,started:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),fixture:fixture.metadata,checks:[],actions:[],screenshots:[]};
let b;const js=body=>b.js(`return(async()=>{${body}})();`,{timeoutMs:45000});
function check(name,condition,evidence){report.checks.push({name,pass:!!condition,evidence});if(!condition)throw Error(name);}
async function click(selector){const p=await js(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)throw Error('No visible '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>setTimeout(r,110));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);if(h!==e&&!e.contains(h))throw Error('Occluded '+${JSON.stringify(selector)}+' by '+h?.outerHTML.slice(0,140));return{x,y};`);await b.click(p.x,p.y);report.actions.push({selector,...p});}
async function value(selector,v,event='change'){await js(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');if(e.disabled)throw Error('Disabled input');e.value=${JSON.stringify(String(v))};if(e.value!==${JSON.stringify(String(v))})throw Error('No option');e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));return true;`);}
async function shot(name){report.screenshots.push(await b.screenshot(path.join(out,`${name}.png`)));}
async function confirm(){if(await js('return inkbox.qol.confirmOpen();'))await click('#inkConfirmOk');}
async function advance(days){await js(`for(let n=0;n<${days};n++)inkbox.advanceDays(1);inkbox.updateHud();inkbox.transitPanel.refresh(true);inkbox.wanlingCodex.refresh(true);await new Promise(requestAnimationFrame);return true;`);}
async function facts(){return js(`const w=inkbox.world;return{day:w.day,seed:w.seed,size:[w.w,w.h],units:structuredClone(w.wanling?.units||[]),wanling:structuredClone(w.wanling||null),transit:(await import('./src/inkbox/world/transitState.js')).snapshotTransit(w),people:w.entities.map(e=>({id:e.id,sp:e.sp,name:e.name,hp:e.hp,maxHp:e.maxHp,x:e.x,y:e.y,village:e.village,age:e.age})),choice:inkbox.wanlingForm,tool:inkbox.toolId,three:!!inkbox.render3d?.active};`);}
async function group(){await click(await js('return inkbox.render3d?.active;')?'#r1ThreeRack [data-r1-group="life"]':'#inkGroups [data-group="life"]');}
async function choose(form){await group();await click(await js('return inkbox.render3d?.active;')?'[data-native-mode="beast"]':'#inkTools [data-tool="beast"]');await value('#inkWanlingCategory','');await value('#inkWanlingQuickForm',form);const s=await facts();check(`shared left choice ${form}`,s.choice===form&&s.tool==='beast'&&await js(`return document.querySelector('#inkWanlingForm').value===${JSON.stringify(form)};`));}
async function screen(x,y){return js(`const x=${x},y=${y};if(inkbox.render3d?.active){const h=inkbox.render3d.renderer,s=h.stages.get('mortal'),p=h.coordinates.worldToRender(x,y,s.elevation.at(x,y)),v=h.cameraRig.camera.position.clone().set(p.x,p.y,p.z).project(h.cameraRig.camera),r=inkbox.render3d.canvas.getBoundingClientRect();return{x:(v.x+1)*r.width/2+r.x,y:(1-v.y)*r.height/2+r.y};}const w=inkbox.world,r=inkbox.canvas.getBoundingClientRect(),p=inkbox.camera.tileScreen(x,y,w.height[w.idx(Math.floor(x),Math.floor(y))]);return{x:p[0]+r.x,y:p[1]+r.y};`);}
async function mapClick(x,y){await js(`inkbox.camera.focusOn(${x},${y},{zoom:7,duration:0});return true;`);await new Promise(r=>setTimeout(r,150));const p=await screen(x,y),target=await js(`const e=document.elementFromPoint(${p.x},${p.y});return e&&e.id;`);check('map pointer reaches actual canvas',target==='inkCanvas'||target==='inkCanvas3D',{point:p,target});await b.click(p.x,p.y);return p;}
async function put(form,x,y){await choose(form);const before=(await facts()).units.length;await click('#inkWanlingReady');await mapClick(x,y);const s=await facts(),u=s.units.at(-1);check(`one real placement ${form}`,s.units.length===before+1&&u.form===form&&Math.hypot(u.x-x,u.y-y)<3&&await js(`return inkbox.toast.includes('真实 ID ${u?.id}');`),{unit:u,toast:await js('return inkbox.toast;')});return u;}
async function importFile(file,expected){await click('#inkBtnImport');const doc=await b.cdp.send('DOM.getDocument'),input=await b.cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#inkImportFile'});await b.cdp.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});await new Promise(r=>setTimeout(r,200));await confirm();check('native import settles',await b.waitFor(`return !inkbox.qol.isBusy('inkBtnImport')&&(${expected});`,{timeoutMs:30000}));await js('inkbox.setSpeed(0);return true;');}
async function persistence(action){const selector=action==='save'?'#inkBtnSave':'#inkBtnLoad';if(!await js(`return document.querySelector(${JSON.stringify(selector)}).getClientRects().length>0;`))await click('[aria-controls="r1Settings"]');await click(selector);await confirm();check(`native ${action} completes`,await b.waitFor(`return !inkbox.qol.isBusy('${selector.slice(1)}')&&inkbox.toast.includes('${action==='save'?'已存档':'已读取'}');`,{timeoutMs:30000}));if(await js('return !document.querySelector("#r1Settings").hidden;'))await click('#r1Settings header button');}
async function rightOpen(){if(await js('return innerWidth<=1080;'))await click('#inkExperienceOpen');await click('#r1VolumeTab-yi');await new Promise(r=>setTimeout(r,400));if(!await js('return document.querySelector("#inkWanling details").open;'))await click('#inkWanling summary');}
async function closeInspect(){if(await js('return document.querySelector("#inkInspect").classList.contains("on");'))await click('#inkInspectClose');}
try {
  b=await launch({url,browser:findEdge(),width:1366,height:768,gpu:true});
  check('ordinary product boots',await b.waitFor('return !!window.inkbox?.world&&!!inkbox.wanlingSelection;',{timeoutMs:45000}));
  await click('#inkCreationMenu [data-action="open-create"]');await value('#inkCreationMenu input[aria-label="世界种子"]',673231,'input');await click('#inkCreationMenu form button[type="submit"]');await confirm();await js('inkbox.setSpeed(0);return true;');
  check('native ordinary creation uses worldgen',await js('return inkbox.world.seed===673231&&!document.querySelector("#inkCreationMenu").classList.contains("on");'));
  await click('.r1-shelf-head button');
  const land=await js(`const w=inkbox.world,{accessBounds}=await import('./src/inkbox/core/mapAccess.js'),r=accessBounds(w);let best=null,bd=Infinity;for(let y=r.y0+10;y<r.y1-10;y++)for(let x=r.x0+10;x<r.x1-28;x++){if(![0,6,12,18].every(dx=>w.isWalkable(w.idx(x+dx,y))&&w.water[w.idx(x+dx,y)]<.0015&&w.veg[w.idx(x+dx,y)]>.3))continue;const d=(x-w.w/2)**2+(y-w.h/2)**2;if(d<bd){bd=d;best={x,y};}}return best;`);
  check('ordinary world has legal grassland',land,land);
  const deer=await put('deer',land.x,land.y),wolf=await put('wolf',land.x,land.y);
  check('right codex never opened for first deer and wolf',await js('return !document.querySelector("#inkWanling details").open;'));
  await group();await value('#inkWanlingCategory','herd');await value('#inkWanlingQuickForm','deer');
  await js('document.querySelector("#inkWanlingQuickForm").focus();return true;');await b.key('arrowDown');
  check('keyboard changes species without spawning',(await facts()).choice==='wolf'&&(await facts()).units.length===2);
  await b.key('escape');check('Escape closes quick selection',await js('return document.body.dataset.r1Arts==="closed";'));
  await advance(30);const hunted=await facts();check('ordinary-world predation changes actual group count',hunted.units.find(u=>u.id===deer.id)?.count<deer.count,{before:deer,after:hunted.units.find(u=>u.id===deer.id),wolf:hunted.units.find(u=>u.id===wolf.id)});
  await put('dangkang',land.x+6,land.y);await put('tiangou',land.x+12,land.y);
  await group();await shot('01-left-native-multiform');await click('#inkWanlingReady');
  const beforeThree=await facts();await click('#r1CanvasView button[title="进入立体沙盘，保留当前世界"]');check('Three enters',await b.waitFor('return inkbox.render3d?.active;',{timeoutMs:45000}));
  check('renderer switch preserves choice and all ecology',JSON.stringify((await facts()).wanling)===JSON.stringify(beforeThree.wanling)&&(await facts()).choice==='tiangou');
  check('first Three entry uses the actual selected tool intent',await js('return inkbox.render3d.mode===inkbox.toolId&&inkbox.toolId==="beast";'));
  await put('lushu',land.x+18,land.y);check('Three loads the different real models',await b.waitFor('return ["dangkang","tiangou","lushu"].every(k=>inkbox.render3d.renderer.creatureLibrary.ids.includes(k));',{timeoutMs:45000}));
  await rightOpen();await value('#inkWanlingForm','xuangui');check('codex and left choice synchronize without spawning',(await facts()).choice==='xuangui'&&(await facts()).units.length===beforeThree.units.length+1);await click('#inkWanlingPlace');check('codex prepares the same left tool',await js('return inkbox.toolId==="beast"&&document.querySelector("#inkWanlingQuickForm").value==="xuangui";'));
  await click('#inkWanlingReady');
  await click('#inkRender3DTools [data-action="toggle"]');check('Canvas returns without defaulting to Dang Kang',(await facts()).choice==='xuangui'&&!(await facts()).three);
  check('returned Canvas selector is truly enabled',await js('return !document.querySelector("#inkWanlingQuickForm").disabled&&!document.querySelector("#inkWanlingCategory").disabled;'));
  await choose('water');await click('#inkWanlingReady');const count=(await facts()).units.length;await mapClick(land.x,land.y);check('illegal habitat gives real failure without a phantom',(await facts()).units.length===count&&await js('return inkbox.toast.includes("栖地不符");'));
  for(const [width,height]of [[1280,720],[1024,720]]) {
    await b.cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await choose('deer');const layout=await js(`const q=document.querySelector('#inkWanlingQuickForm'),r=q.getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,rect:r.toJSON(),focus:q===document.activeElement};`);
    check(`usable left selector at ${width}`,layout.scroll<=width&&layout.rect.x>=0&&layout.rect.right<=width&&layout.rect.width>60,layout);await shot(`02-left-${width}`);await click('#inkWanlingReady');
  }
  await b.cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  const jointUrl=new URL(url);jointUrl.searchParams.set('scenario','t0');report.actions.push({navigation:jointUrl.href,reason:'Existing labelled T0 native terrain experiment controls over the same production simulation'});
  await b.cdp.send('Page.navigate',{url:jointUrl.href});check('labelled T0 joint scene boots',await b.waitFor('return !!window.inkbox?.world&&!!document.querySelector("[data-transit-edit=\\"cut\\"]");',{timeoutMs:45000}));await b.key('escape');await js('inkbox.setSpeed(0);return true;');await choose('deer');await click('#inkWanlingReady');
  await importFile(fixture.savePath,'inkbox.world.entities.some(e=>e.name==="两度丹修")');
  check('import attaches selector to new world and keeps choice',(await facts()).choice==='deer'&&(await facts()).units.length===0);
  const placed={};for(const [form,p]of Object.entries(fixture.metadata.placement))placed[form]=await put(form,p.x,p.y);
  const influence=await js(`return(await import('./src/inkbox/world/wanlingInfluence.js')).wanlingVillageInfluence(inkbox.world,inkbox.world.villages[0]);`);
  check('actual auspicious units influence real village',influence.yieldScale>1&&influence.sources.some(s=>s.id===placed.dangkang.id),influence);
  await rightOpen();for(const form of ['deer','wolf','tiangou']){await click(`[data-wanling-id="${placed[form].id}"]`);check(`codex inspects real ${form}`,await js(`return document.querySelector('.wanling-card').innerText.includes('ID ${placed[form].id}');`));}
  await click(`[data-wanling-id="${placed.dangkang.id}"]`);await click(`[data-wanling-remove="${placed.dangkang.id}"]`);check('codex withdrawal removes actual influence',!await js(`return inkbox.world.wanling.units.some(u=>u.id===${placed.dangkang.id});`));
  await click('#inkTransitPanel summary');await click('[data-transit-edit="cut"]');
  await value('#inkTransitPanel form[data-kind="cargo"] [name="fromVillageId"]',1);await value('#inkTransitPanel form[data-kind="cargo"] [name="toVillageId"]',2);await click('#inkTransitPanel form[data-kind="cargo"] button[type="submit"]');
  await value('#inkTransitPanel form[data-kind="person"] [name="actorId"]',fixture.metadata.actors.flier);await value('#inkTransitPanel form[data-kind="person"] [name="toVillageId"]',2);await click('#inkTransitPanel form[data-kind="person"] button[type="submit"]');
  const dispatched=await facts();check('native dispatch reserves actual food and cancels old DAO job',dispatched.transit.journeys.length===2&&dispatched.transit.ledger.loaded===24&&dispatched.wanling.jobs.some(j=>j.actorId===fixture.metadata.actors.flier&&j.stage==='done'&&j.summary.includes('山海通衢')),dispatched.transit);
  for(let i=0;i<22;i++){const s=await facts();if(s.transit.journeys[0].legMode==='water')break;await advance(1);}
  const atSea=await facts();check('same payload contains a laden ship and active real flight',atSea.transit.journeys[0].legMode==='water'&&atSea.transit.journeys[0].cargo.food===24&&atSea.transit.journeys[1].status==='active'&&atSea.transit.journeys[1].legMode==='air',atSea.transit);
  await click('#r1CanvasView button[title="进入立体沙盘，保留当前世界"]');check('Three joint view keeps the same people and cargos',await b.waitFor('return inkbox.render3d?.active;',{timeoutMs:45000})&&JSON.stringify((await facts()).transit)===JSON.stringify(atSea.transit));
  await choose('tiangou');check('spatial tool has pointer priority over transit badges',await js('return [...document.querySelectorAll(".transit-map-mark:not([hidden])")].every(e=>getComputedStyle(e).pointerEvents==="none");'));await click('#inkWanlingReady');
  await rightOpen();await shot('03-three-joint-world');
  for(const plane of ['upper','nether','mortal']){await click(`[data-realm-plane="${plane}"]`);await choose('tiangou');check(`placement notice in ${plane}`,await js(`return document.querySelector('#inkWanlingQuickStatus').innerText.${plane==='mortal'?'includes("单击")':'includes("凡界")'};`));}
  await click('#inkWanlingReady');await click('[data-transit-edit="dam"]');await advance(1);
  const blocked=await facts();check('real dam blocks loaded ship',blocked.transit.journeys[0].status==='blocked'&&blocked.transit.journeys[0].cargo.food===24&&blocked.transit.ledger.delivered===0,blocked.transit);
  await persistence('save');const saved=await facts();await persistence('load');const loaded=await facts();
  check('compressed joint reload retains both exact versioned blocks',JSON.stringify(saved.wanling)===JSON.stringify(loaded.wanling)&&JSON.stringify(saved.transit)===JSON.stringify(loaded.transit)&&saved.people.map(e=>e.id).join()===loaded.people.map(e=>e.id).join());
  await shot('04-joint-save-blocked');
  await click('#inkSpeedBar [data-speed="5"]');await new Promise(r=>setTimeout(r,700));await click('#inkSpeedBar [data-speed="0"]');
  const fast=await facts();check('native x20 advances real time while loaded ship remains blocked',fast.day>loaded.day+10&&fast.transit.journeys[0].status==='blocked'&&fast.transit.journeys[0].cargo.food===24&&fast.transit.ledger.delivered===0,{startDay:loaded.day,endDay:fast.day,ship:fast.transit.journeys[0]});
  await click('[data-transit-edit="reopen"]');for(let i=0;i<180&&(await facts()).transit.journeys[0].status!=='arrived';i++)await advance(1);
  const arrived=await facts();check('original ship and flight arrive with one actual delivery',arrived.transit.journeys[0].status==='arrived'&&arrived.transit.journeys[1].status==='arrived'&&arrived.transit.ledger.delivered===24&&arrived.transit.journeys[0].cargo.food===0,arrived.transit);
  await advance(Math.max(0,220-Math.floor(arrived.day)));const repeated=await facts();report.repeatedActions=repeated.wanling.jobs.filter(j=>[fixture.metadata.actors.healer,fixture.metadata.actors.talisman].includes(j.actorId));
  for(const [kind,id,word]of [['alchemy',fixture.metadata.actors.healer,'疗伤'],['talisman',fixture.metadata.actors.talisman,'护村符']])check(`same ${kind} actually completes twice`,repeated.wanling.jobs.filter(j=>j.actorId===id&&j.stage==='done'&&j.summary.includes(word)).length>=2,report.repeatedActions);
  await click('#inkWanling summary');await click('#inkWanling summary');if(!await js('return document.querySelector(".wanling-paths").open;'))await click('.wanling-paths > summary');await js('document.querySelector(".wanling-paths").scrollIntoView({block:"center",behavior:"instant"});return true;');await shot('05-repeated-real-actions');
  for(const block of ['wanling','transit']){await importFile(badFiles[block],'inkbox.toast.includes("导入失败")');check(`bad ${block} protects current live world`,JSON.stringify((await facts()).wanling)===JSON.stringify(repeated.wanling)&&JSON.stringify((await facts()).transit)===JSON.stringify(repeated.transit));}
  await importFile(fullFile,'inkbox.world.w===512&&inkbox.world.wanling?.units.length===96');await choose('deer');check('96/96 capacity is clear and not presented as placeable',await js('return document.querySelector("#inkWanlingQuickStatus").innerText.includes("96/96")&&document.querySelector("#inkWanlingReady").disabled;'));await b.key('escape');const cap=(await facts()).units.length;await mapClick(45,65);check('full map request adds no ghost unit',(await facts()).units.length===cap&&await js('return inkbox.toast.includes("名额已满");'));
  report.final=await facts();report.environment=await js(`const gl=inkbox.render3d.renderer.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{ua:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio};`);
  report.errors={js:b.errors(),console:b.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description))};check('no runtime console or WebGL errors',!report.errors.js.length&&!report.errors.console.length&&report.environment.glError===0,report.errors);report.pass=true;
} catch(error){report.failure=error.stack;process.exitCode=1;if(b){report.browserErrors=b.errors();try{await shot('failure');}catch{}}}
finally{if(b)report.cleanup=await b.close();if(report.cleanup&&!report.cleanup.complete){report.pass=false;process.exitCode=1;}report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:!!report.pass,checks:report.checks.length,failure:report.failure,cleanup:report.cleanup,out}));}

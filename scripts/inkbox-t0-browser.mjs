// Real GPU Edge/CDP acceptance in the product page. The explicit T0 fixture
// only supplies initial conditions; requests/edit/save/load use native controls.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, findEdge } from './cdp.mjs';
const url=new URL(process.env.INKBOX_URL||'http://127.0.0.1:4231/inkbox.html');
url.searchParams.set('scenario','t0');url.searchParams.delete('renderer');
const out=path.resolve(process.env.INKBOX_REPORT_DIR||`reports/local/t0/browser/${new Date().toISOString().replaceAll(':','-')}`);
fs.mkdirSync(out,{recursive:true});
const report={url:url.href,started:new Date().toISOString(),checks:[],actions:[],screenshots:[],
  source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()};
let browser;
const js=body=>browser.js(`return(async()=>{${body}})();`,{timeoutMs:45000});
function check(name,condition,evidence){report.checks.push({name,pass:!!condition,evidence});if(!condition)throw Error(name);}
async function click(selector){
 const p=await js(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&!e.hidden;});if(!e)throw Error('No visible '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);if(h!==e&&!e.contains(h))throw Error('Occluded '+${JSON.stringify(selector)}+' by '+h?.outerHTML.slice(0,120));return {x,y};`);
 await browser.click(p.x,p.y);report.actions.push({selector,...p});
}
async function values(fields){await js(`${Object.entries(fields).map(([s,v])=>`{const e=document.querySelector(${JSON.stringify(s)});if(!e)throw Error('Missing input');e.value=${JSON.stringify(String(v))};if(e.value!==${JSON.stringify(String(v))})throw Error('Missing option');e.dispatchEvent(new Event('change',{bubbles:true}));}`).join('')}return true;`);}
async function shot(name){const file=await browser.screenshot(path.join(out,`${name}.png`));report.screenshots.push(file);}
async function facts(){return js(`const w=inkbox.world,s=w.transit;return {day:w.day,seed:w.seed,plane:inkbox.render3d?.renderer?.activePlane,three:!!inkbox.render3d?.active,journeys:(await import('./src/inkbox/world/transitState.js')).readTransitJourneys(w),ledger:s&&{...s.ledger},villages:w.villages.map(v=>({id:v.id,name:v.name,food:v.food,pop:v.pop})),people:w.entities.filter(e=>[1,2,3,13].includes(e.id)).map(e=>({id:e.id,age:e.age,lifespan:e.lifespan,village:e.village,faction:e.faction,x:e.x,y:e.y,hp:e.hp})),geo:(await import('./src/inkbox/world/transitGeography.js')).transitGeographyStats(w)};`);}
async function advance(days){return js(`let left=${Number(days)};while(left>1e-9){const d=Math.min(1,left);inkbox.advanceDays(d);left-=d;}inkbox.updateHud();inkbox.refreshFolds();inkbox.transitPanel.refresh(true);inkbox.observeEcho.refresh(true);await new Promise(requestAnimationFrame);return true;`);}
try{
 browser=await launch({url:url.href,browser:findEdge(),width:1366,height:768,gpu:true});
 check('world boots',await browser.waitFor('return !!window.inkbox?.world&&!!inkbox.transitPanel;',{timeoutMs:45000}));
 await browser.key('escape');
 await js('inkbox.setSpeed(0);return true;');
 const initial=await facts();check('controlled real villages and cultivator',initial.villages.length===2&&initial.people.some(e=>e.id===13),initial);
 const routesBefore=await js(`const m=await import('./src/inkbox/world/transitGeography.js'),a=inkbox.world.villages[0],b=inkbox.world.villages[1];return {land:m.planTransitRoute(inkbox.world,a,b).ok,water:m.planTransitRoute(inkbox.world,a,b,{mode:'water'}).ok};`);
 check('initial editable land bridge',routesBefore.land,routesBefore);
 await click('#inkTransitPanel summary');await shot('01-canvas-real-start');
 await click('[data-transit-edit="cut"]');
 const cut=await js(`const m=await import('./src/inkbox/world/transitGeography.js'),w=inkbox.world;return {land:m.planTransitRoute(w,w.villages[0],w.villages[1]).ok,water:m.planTransitRoute(w,w.villages[0],w.villages[1],{mode:'water'}).ok};`);
 check('native power cuts land but preserves water passage',!cut.land&&cut.water,cut);
 await values({'#inkTransitPanel form[data-kind="cargo"] [name="fromVillageId"]':1,'#inkTransitPanel form[data-kind="cargo"] [name="toVillageId"]':2});
 await click('#inkTransitPanel form[data-kind="cargo"] button[type="submit"]');
 check('one native cargo dispatch',await browser.waitFor('return inkbox.world.transit?.journeys?.some(j=>j.kind==="cargo");',{timeoutMs:10000}));
 const loaded=await facts(),ship=loaded.journeys.find(j=>j.kind==='cargo');
 check('food debited once and held in journey',loaded.villages[0].food===initial.villages[0].food-24&&loaded.villages[1].food===initial.villages[1].food&&ship.cargo.food===24,loaded);
 report.shipId=ship.id;report.sailorId=ship.actorId;
 await values({'#inkTransitPanel form[data-kind="person"] [name="actorId"]':13,'#inkTransitPanel form[data-kind="person"] [name="toVillageId"]':2});
 await click('#inkTransitPanel form[data-kind="person"] button[type="submit"]');
 check('one native flight dispatch',await browser.waitFor('return inkbox.world.transit.journeys.some(j=>j.kind==="person");',{timeoutMs:10000}));
  await advance(6);
  const airborne=await facts(),airborneJourney=airborne.journeys.find(j=>j.kind==='person');
  check('real cultivator is observed in flight before arrival',airborneJourney.status==='active'&&airborneJourney.legMode==='air'&&airborneJourney.progress>5,airborne);
  await shot('02a-canvas-real-flight');
  await click('#r1CanvasView button[title="进入立体沙盘，保留当前世界"]');
  check('Three flight observation enters',await browser.waitFor('return inkbox.render3d?.active;',{timeoutMs:45000}));
  const flightMarker=await js(`await new Promise(requestAnimationFrame);const e=document.querySelector('.transit-map-mark[data-id="${airborneJourney.id}"]');return e&&{hidden:e.hidden,text:e.textContent};`);
  check('same real flying cultivator visible in Three',flightMarker&&!flightMarker.hidden,flightMarker);
  check('flight observation does not move or settle the journey',JSON.stringify((await facts()).journeys)===JSON.stringify(airborne.journeys));
  await shot('02b-three-real-flight');
  await click('#inkRender3DTools [data-action="toggle"]');
 let sailing=await facts();for(let n=0;n<24&&sailing.journeys.find(j=>j.id===ship.id).legMode!=='water';n++){await advance(1);sailing=await facts();}
 check('actual sailor and cargo enter navigable water',sailing.journeys.find(j=>j.id===ship.id).legMode==='water',sailing);
 await shot('02-canvas-same-real-voyage');
 const beforeSwitch=JSON.stringify(sailing.journeys);
 await click('#r1CanvasView button[title="进入立体沙盘，保留当前世界"]');
 check('Three enters without replacing voyage',await browser.waitFor('return inkbox.render3d?.active;',{timeoutMs:45000}));
 const three=await facts();check('renderer switch preserves all voyage facts',JSON.stringify(three.journeys)===beforeSwitch,three);
 const marker=await js(`const e=document.querySelector('.transit-map-mark[data-id="${ship.id}"]');return e&&{hidden:e.hidden,text:e.textContent,rect:e.getBoundingClientRect().toJSON()};`);
 check('real ship visible in Three',marker&&!marker.hidden,marker);await shot('03-three-same-real-voyage');
 for(const plane of ['upper','nether','mortal']){
  await click(`[data-realm-plane="${plane}"]`);
  const state=await js(`await new Promise(requestAnimationFrame);return {plane:inkbox.render3d.renderer.activePlane,ui:document.body.dataset.r1Realm,shipHidden:document.querySelector('.transit-map-mark[data-id="${ship.id}"]')?.hidden};`);
  check(`direct ${plane} with correct transit visibility`,state.plane===plane&&state.ui===plane&&(plane==='mortal'||state.shipHidden),state);
 }
 check('realm switches do not settle journeys',JSON.stringify((await facts()).journeys)===beforeSwitch);
 await click('[data-transit-edit="dam"]');await advance(1);
 let blocked=await facts();const held=blocked.journeys.find(j=>j.id===ship.id);
 check('real sea dam blocks the same ship without delivering',held.status==='blocked'&&held.cargo.food===24&&blocked.ledger.delivered===0,blocked);
 await shot('04-blocked-sea-and-held-food');
 await values({'#inkSlotSelect':'slot1'});await click('#inkBtnSave');
 if(await js('return inkbox.qol.confirmOpen();'))await click('#inkConfirmOk');
 check('native save completes',await browser.waitFor('return !inkbox.qol.isBusy("inkBtnSave")&&/已存档/.test(inkbox.toast);',{timeoutMs:20000}));
 const saved=await facts();await click('#inkBtnLoad');
 if(await js('return inkbox.qol.confirmOpen();'))await click('#inkConfirmOk');
 check('native load completes',await browser.waitFor('return !inkbox.qol.isBusy("inkBtnLoad")&&/已读取/.test(inkbox.toast);',{timeoutMs:20000}));
 const reloaded=await facts();check('blocked voyage cargo and identity survive real compressed reload',JSON.stringify(reloaded.journeys)===JSON.stringify(saved.journeys)&&JSON.stringify(reloaded.ledger)===JSON.stringify(saved.ledger),reloaded);
 await advance(3);blocked=await facts();const still=blocked.journeys.find(j=>j.id===ship.id);
 check('blocked time does not move ship or duplicate food',still.status==='blocked'&&JSON.stringify(still.position)===JSON.stringify(held.position)&&still.cargo.food===24&&blocked.ledger.delivered===0,blocked);
 await click('[data-transit-edit="reopen"]');await advance(1);
 let resumed=await facts();check('same loaded voyage resumes after real recut',resumed.journeys.find(j=>j.id===ship.id).status==='active'&&resumed.journeys.find(j=>j.id===ship.id).cargo.food===24,resumed);
 await shot('05-reopened-same-ship');
 for(let n=0;n<180&&resumed.journeys.find(j=>j.id===ship.id).status==='active';n++){await advance(1);resumed=await facts();}
 const arrived=resumed.journeys.find(j=>j.id===ship.id),air=resumed.journeys.find(j=>j.kind==='person');
 check('one cargo delivery and real flight arrive',arrived.status==='arrived'&&arrived.cargo.food===0&&resumed.ledger.delivered===24&&air.status==='arrived',resumed);
 const sailorBefore=loaded.people.find(e=>e.id===ship.actorId),sailorAfter=resumed.people.find(e=>e.id===ship.actorId),flier=resumed.people.find(e=>e.id===13);
 check('same people age and keep social identity',sailorAfter&&sailorAfter.age>sailorBefore.age&&sailorAfter.village===sailorBefore.village&&flier&&flier.village===1, {sailorBefore,sailorAfter,flier});
 await shot('06-delivered-once-real-people');
 await browser.cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await shot('07-transit-panel-1280');
 await click('#inkRender3DTools [data-action="toggle"]');
 check('Canvas returns to the completed same world',!(await facts()).three&&(await facts()).ledger.delivered===24);
 await shot('08-canvas-after-reload-and-arrival');
 report.final=await facts();
 report.environment=await js(`const gl=inkbox.render3d.renderer.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,map:[inkbox.world.w,inkbox.world.h],speedIndex:inkbox.speedIndex};`);
 report.errors={js:browser.errors(),console:browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '))};
 check('no GPU or browser errors',report.environment.glError===0&&!report.errors.js.length&&!report.errors.console.length,report.errors);
 report.pass=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{
 if(browser)report.cleanup=await browser.close();
 if(report.cleanup&&!report.cleanup.complete){report.pass=false;process.exitCode=1;}
 report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({pass:!!report.pass,checks:report.checks.length,failure:report.failure,cleanup:report.cleanup,out}));
}

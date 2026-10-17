// Formal UI proof: official Life.spawn + normal advanceDays, no injected hit/VM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';
import { combatFixtureExpression } from './inkbox-g2-fixtures.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=Number(process.env.INKBOX_PORT||4218),BASE=process.env.INKBOX_URL||`http://127.0.0.1:${PORT}`;
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(ROOT,'reports/local/g22/browser'));
const report={startedAt:new Date().toISOString(),pass:false,backend:'Repository-owned Microsoft Edge/CDP',fallbackReason:'Tabbit could not connect in this task; formal repository Edge regressions used',sourceFlow:'Life.spawn -> normal advanceDays -> Life.attack -> shared Stage -> observation',performanceClaim:false,checks:[],screenshots:[]};
let server,browser;
const page=code=>browser.js(`return (async()=>{${code}})()`,{timeoutMs:45000});
async function check(name,fn){const evidence=await fn();report.checks.push({name,pass:true,evidence});console.log('PASS '+name);}
async function frames(n=2){await page(`for(let n=0;n<${n};n++)await new Promise(requestAnimationFrame);return true;`);}
async function shot(name){const file=await browser.screenshot(path.join(OUT,name+'.png'),{timeoutMs:30000});report.screenshots.push(file);return file;}
async function click(selector){
  const p=await page(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing enabled control '+${JSON.stringify(selector)});if(e.closest('.rail,.g1-character__body'))e.scrollIntoView({block:'nearest',behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(hit!==e&&!e.contains(hit))throw Error('Control is clipped or intercepted '+${JSON.stringify(selector)});return{x,y,hit:hit?.outerHTML,key:e.dataset.combatKey};`);
  report.lastClick=p;
  await browser.click(p.x,p.y);
}
async function release(){await page('window.__g22Release?.();return true;');await frames();}
async function freshHit(renderer){
  await release();
  await page(`const k=window.inkbox;k.newWorld('small',673231);k.setSpeed(0);k.selectTool('inspect');return true;`);await frames(3);
  const fixture=await page(combatFixtureExpression({count:6}));
  assert(fixture.originalEntitiesRetained);assert.equal(fixture.count,6);
  await page(`const k=window.inkbox;k.advanceDays(.2);const original=k.frame;let painted=false,done;const paintedOnce=new Promise(resolve=>done=resolve);k.frame=function(ts){if(!painted){painted=true;original.call(this,ts);done();return;}requestAnimationFrame(t=>this.frame(t));};window.__g22Release=()=>{k.frame=original;window.__g22Release=null;};await paintedOnce;k.combatObservation.refresh();const event=k.combatObservation.current().events[0];if(!event)throw Error('No real sampled visible hit');window.__g22Event=event;return true;`);
  // Match the observation row through its verified opaque ID and host focus effect.
  const actual=await page(`const k=window.inkbox,event=window.__g22Event;let effect;const camera=k.render3d?.active?k.render3d.renderer:k.camera,original=camera.focusOn;camera.focusOn=function(...args){effect=args;return original.apply(this,args);};try{k.combatObservation.handleAction({type:'locate-combat',eventId:event.id});}finally{camera.focusOn=original;}if(!effect)throw Error('Fresh hit failed authoritative focus');const target=k.world.entities.find(e=>e.hp>0&&e.x===effect[0]&&e.y===effect[1]);if(!target)throw Error('Focus did not match real target');window.__g22Target=target;k.g1.open({plane:'mortal',entityId:target.id});k.g1.refresh();k.combatObservation.refresh();k.render(k.lastTime);return{renderer:${JSON.stringify(renderer)},day:k.world.day,event,identity:k.g1.current().identity,health:k.g1.current().health,hp:target.hp,maxHp:target.maxHp,card:document.querySelector('#inkPersonDetail').textContent,news:document.querySelector('#inkCombatObserver').textContent,queue:(await import('./src/inkbox/core/runtimeEvents.js')).runtimeEventStats(k.world),source:(await import('./src/inkbox/sim/presentation.js')).combatPresentationStats(k.world)};`);
  assert(actual.source.hits>0);assert(actual.hp<actual.maxHp);assert.equal(actual.health.hp,actual.hp);assert.equal(actual.health.maxHp,actual.maxHp);assert(actual.card.includes('气血'));assert(actual.news.includes('则近讯'));assert(!actual.news.includes('正在交战'));assert.equal(actual.queue.combatQueued,0);
  return {fixture,actual};
}
async function focusByButton(){
  await page(`const k=window.inkbox,camera=k.render3d?.active?k.render3d.renderer:k.camera,original=camera.focusOn,action=k.combatObservation.handleAction;window.__g22Focus=[];window.__g22Actions=[];window.__g22UndoFocus=()=>{camera.focusOn=original;k.combatObservation.handleAction=action;};camera.focusOn=function(...args){window.__g22Focus.push(args);return original.apply(this,args);};k.combatObservation.handleAction=function(...args){const result=action.apply(this,args);window.__g22Actions.push({args,result});return result;};return true;`);
  await click('#inkCombatObserver [data-combat-key]');
  const result=await page(`window.__g22UndoFocus();return{calls:window.__g22Focus,actions:window.__g22Actions,target:{x:window.__g22Target.x,y:window.__g22Target.y},event:window.__g22Event.id,items:window.inkbox.stage.snapshotPlane('mortal').items.map(i=>({age:i.age,ttl:i.ttl,day:i.day}))};`);
  assert.equal(result.calls.length,1,JSON.stringify({result,click:report.lastClick}));assert.equal(result.calls[0][0],result.target.x);assert.equal(result.calls[0][1],result.target.y);return result;
}
try{
  fs.mkdirSync(OUT,{recursive:true});
  if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(PORT)],{cwd:ROOT,stdio:'ignore',windowsHide:true});let ready=false;for(let n=0;n<80;n++){try{if((await fetch(BASE+'/inkbox.html')).ok){ready=true;break;}}catch{}await sleep(150);}assert(ready,'Server not ready');}
  browser=await launch({url:BASE+'/inkbox.html?renderer=3d',browser:findEdge(),width:1440,height:1000,gpu:process.env.INKBOX_GPU!=='0'});report.edge=browser.meta;
  assert(await browser.waitFor('return !!window.inkbox?.combatObservation && !!window.inkbox?.world',{timeoutMs:30000}),'Formal app not ready');
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.active && !!window.inkbox.render3d.renderer?.stages?.get("mortal")',{timeoutMs:60000}),'Three bootstrap not ready');
  await page('const r=window.inkbox.render3d.renderer;await Promise.all([r.characterLoadPromise,r.environmentLoadPromise,r.art.comparisonReady]);return true;');
  await click('#inkRender3DTools [data-action="toggle"]');assert(await page('return !window.inkbox.render3d.active;'));
  await check('Canvas real AI hit shows fact-only health and near news',async()=>{
    const evidence=await freshHit('canvas');await page(`const e=document.querySelector('#inkCombatObserver');e.scrollIntoView({block:'nearest'});return true;`);evidence.screenshot=await shot('canvas-health-news');return evidence;
  });
  await check('Canvas semantic locate button routes fresh coordinates exactly once',focusByButton);
  await check('FX off retains current health and formal history; expired callback fails',async()=>{
    const before=await page(`return{hp:window.__g22Target.hp,log:JSON.stringify(window.__g22Target.log),id:window.__g22Event.id};`);await click('#inkCombatFx');
    const after=await page(`const k=window.inkbox;k.g1.refresh();k.combatObservation.refresh();return{enabled:k.stage.combatEnabled,events:k.combatObservation.current().events,health:k.g1.current().health,log:JSON.stringify(window.__g22Target.log),old:k.combatObservation.handleAction({type:'locate-combat',eventId:${JSON.stringify(before.id)}})};`);
    assert.equal(after.enabled,false);assert.deepEqual(after.events,[]);assert.equal(after.health.hp,before.hp);assert.equal(after.log,before.log);assert.equal(after.old.ok,false);await click('#inkCombatFx');return{before,after};
  });
  await check('Normal AI mercy produces real healing deadline and retained duel history',async()=>{
    const actual=await page(`const k=window.inkbox,e=window.__g22Target;e.hp=1;e.restUntil=k.world.day;k.advanceDays(.1);k.update(0);k.g1.refresh();k.combatObservation.refresh();return{day:k.world.day,hp:e.hp,maxHp:e.maxHp,restUntil:e.restUntil,health:k.g1.current()?.health,duel:(e.log||[]).filter(row=>row.kind==='duel'),card:document.querySelector('#inkPersonDetail').textContent};`);
    assert(actual.hp>0);assert(actual.restUntil>actual.day);assert.equal(actual.health.state,'recovering');assert.equal(actual.health.restRemaining,actual.restUntil-actual.day);assert(actual.duel.length>0);assert(actual.card.includes('养伤中'));actual.screenshot=await shot('canvas-recovering');return actual;
  });
  await check('Renderer switch preserves observation runtime and formal selected identity',async()=>{
    await release();const prior=await page('window.__g22Runtime=window.inkbox.combatObservation;return window.inkbox.g1.current().identity.key;');await click('#inkRender3DTools [data-action="toggle"]');
    assert(await browser.waitFor('return !!(window.inkbox.render3d?.active && window.inkbox.render3d?.renderer?.stages?.get("mortal"))',{timeoutMs:30000}),'Three did not activate');
    const actual=await page(`const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{same:k.combatObservation===window.__g22Runtime,key:k.g1.current()?.identity.key,webgl:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};`);assert(actual.same);assert.equal(actual.key,prior);if(process.env.INKBOX_GPU!=='0')assert(!/swiftshader|software|basic render/i.test(actual.webgl));report.webgl=actual.webgl;return actual;
  });
  await check('Three real AI hit, health card and semantic locate button',async()=>{
    const evidence=await freshHit('3d');evidence.focus=await focusByButton();await page(`document.querySelector('#inkCombatObserver').scrollIntoView({block:'nearest'});return true;`);evidence.screenshot=await shot('three-health-news');return evidence;
  });
  await check('Real-time expiry clears short news without manufacturing history',async()=>{
    const before=await page('return{day:window.inkbox.world.day,log:JSON.stringify(window.__g22Target.log),hp:window.__g22Target.hp,id:window.__g22Event.id};');await release();
    assert(await browser.waitFor('return window.inkbox.combatObservation.current().events.length===0',{timeoutMs:5000}),'Short news did not expire');
    const after=await page(`return{day:window.inkbox.world.day,log:JSON.stringify(window.__g22Target.log),hp:window.inkbox.g1.current().health.hp,old:window.inkbox.combatObservation.handleAction({type:'locate-combat',eventId:${JSON.stringify(before.id)}})};`);assert.equal(after.day,before.day);assert.equal(after.hp,before.hp);assert.equal(after.log,before.log);assert.equal(after.old.ok,false);return{before,after};
  });
  await check('Formal save/load and ID reuse reject stale news across repeated refreshes',async()=>{
    await freshHit('3d');const evidence=await page(`const k=window.inkbox,event=window.__g22Event,target=window.__g22Target,{serializeWorld}=await import('./src/inkbox/io/save.js');const save=serializeWorld(k.world),i=k.world.entities.indexOf(target);k.world.entities[i]={...target};k.combatObservation.refresh();const first=k.combatObservation.current().events;k.combatObservation.refresh();const second=k.combatObservation.current().events;const stale=k.combatObservation.handleAction({type:'locate-combat',eventId:event.id});return{targetId:target.id,event,first,second,stale,saveFields:Object.keys(save)};`);
    assert.equal(evidence.stale.ok,false);for(const rows of [evidence.first,evidence.second])assert(!rows.some(e=>e.day===evidence.event.day&&e.actor===evidence.event.actor&&e.target===evidence.event.target),'Old hit rebound to the replacement');
    // The actual Load button replaces World and invokes the production reset path.
    await release();await page('window.__g22BeforeLoad=window.inkbox.world;return true;');await click('#inkBtnSave');
    assert(await browser.waitFor('return !window.inkbox.qol.isDirty()&&!document.querySelector("#inkBtnSave").disabled',{timeoutMs:15000}),'Save did not finish');
    await click('#inkBtnLoad');assert(await browser.waitFor('return window.inkbox.world!==window.__g22BeforeLoad',{timeoutMs:15000}),'Load did not replace World');await frames(3);
    const loaded=await page(`const k=window.inkbox;return{worldChanged:k.world!==window.__g22BeforeLoad,restoredHp:k.world.entities.find(e=>e.id===${evidence.targetId})?.hp,old:k.combatObservation.handleAction({type:'locate-combat',eventId:window.__g22Event.id}),events:k.combatObservation.current().events,health:k.g1.current()?.health};`);assert(loaded.worldChanged);assert.equal(loaded.old.ok,false);assert.deepEqual(loaded.events,[]);assert(!evidence.saveFields.includes('combatObservation'));return{evidence,loaded};
  });
  report.runtimeErrors=browser.errors();report.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(x=>x.value||x.description||'').join(' '));
  assert.equal(report.runtimeErrors.length,0);assert.equal(report.consoleErrors.length,0);report.pass=true;
}catch(error){report.error=String(error.stack||error);console.error(error);if(browser)try{await shot('failure');}catch{}process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server){server.kill();for(let n=0;n<50&&server.exitCode===null&&server.signalCode===null;n++)await sleep(100);}
  report.cleanup={edgeExited:!browser||browser.child.exitCode!==null||browser.child.signalCode!==null,profileRemoved:!browser||!fs.existsSync(browser.userDataDir),serverExited:!server||server.exitCode!==null||server.signalCode!==null};
  if(Object.values(report.cleanup).some(v=>!v)){report.pass=false;process.exitCode=1;}report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(OUT,'g22-browser.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`G22 browser: ${report.checks.length} checks; pass=${report.pass}`);

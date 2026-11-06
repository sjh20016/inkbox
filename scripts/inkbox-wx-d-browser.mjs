import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {launch,findEdge,sleep} from './cdp.mjs';
import {launchOwnedServer} from './inkbox-owned-server.mjs';
const out='reports/local/wanxiang-d/browser';fs.mkdirSync(out,{recursive:true});
const matureFile=path.resolve(process.env.INKBOX_WX_D_SAVE||'reports/local/wanxiang-d/profile/20260914-100y-save.json');
const matureRelative=path.relative(process.cwd(),matureFile);
if(matureRelative.startsWith('..')||path.isAbsolute(matureRelative))throw Error('Mature browser save must be served from the task checkout');
if(!fs.existsSync(matureFile))throw Error('Run profile:wanxiang:d first, or set INKBOX_WX_D_SAVE to a real native checkpoint');
const matureUrl='/'+matureRelative.split(path.sep).map(encodeURIComponent).join('/');
const report={checks:[],pass:false,viewportRuns:[],browserPath:'repository isolated Edge/CDP',fallback:'repository isolated Edge/CDP regression',scope:'controlled UI flow; software WebGL, not GPU performance'};let b,server;
report.source={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scriptSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()};
const page=code=>b.js(`return (async()=>{${code}})();`,{timeoutMs:60000});
async function click(sel){const p=await page(`const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled)throw Error('missing/disabled '+${JSON.stringify(sel)});e.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,text:e.innerText};`);await b.click(p.x,p.y);return p;}
async function clickText(text){const p=await page(`const e=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(text)});if(!e||e.disabled)throw Error('missing/disabled button '+${JSON.stringify(text)});e.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await b.click(p.x,p.y);}
try {
 server=await launchOwnedServer({root:process.cwd(),port:0});report.server=server.identity;
 for(const [w,h,label,renderer] of [[1366,768,'canvas-desktop','canvas'],[390,844,'canvas-mobile','canvas'],[1366,768,'three-desktop','3d']]){
  b=await launch({browser:findEdge(),url:server.url+'/inkbox.html'+(renderer==='3d'?'?renderer=3d':''),width:w,height:h,gpu:false});
  await b.waitFor('return !!window.inkbox?.creationMenu',{timeoutMs:45000});
  const snap=await page(`return {title:document.title,view:[innerWidth,innerHeight],body:document.body.innerText.slice(0,2000),buttons:[...document.querySelectorAll('button')].map(x=>[x.id,x.innerText]).filter(x=>x[1]).slice(0,60),canvases:[...document.querySelectorAll('canvas')].map(x=>({id:x.id,rect:(()=>{let r=x.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()}))};`);
  report.viewportRuns.push({label,snapshot:snap});
  await b.screenshot(path.join(out,label+'-initial.png'));
  await click('[data-action="open-create"]');
  await page(`const frame=document.querySelector('.g2-creation');const seed=frame?.querySelector('input[aria-label="世界种子"]');const preset=frame?.querySelector('select');if(!seed||!preset)throw Error('Creation form controls missing');seed.value='20261029';preset.value='small';`);
  await click('.g2-creation__page:not([hidden]) button[type="submit"]');await sleep(1000);
  const created=await page(`return {world:!!inkbox.world,seed:inkbox.world?.seed,dimensions:[inkbox.world?.w,inkbox.world?.h],err:!!document.querySelector('vite-error-overlay'),text:document.body.innerText.slice(0,1200)};`);
  report.checks.push({name:label+' creation',evidence:created,pass:created.world&&!created.err});
  if(renderer==='3d'){
   if(!await b.waitFor('return !!inkbox.render3d?.active && inkbox.render3d.renderer?.world===inkbox.world && !!inkbox.render3d.renderer?.stages?.get("mortal")',{timeoutMs:60000}))throw Error('Actual Three renderer unavailable');
   const actual=await page(`const r=inkbox.render3d.renderer,g=r.gpu.getContext();return {active:inkbox.render3d.active,synced:r.world===inkbox.world,webgl:g.getParameter(g.VERSION),calls:r.gpu.info.render.calls};`);
   report.checks.push({name:label+' actual Three renderer',evidence:actual,pass:actual.active&&actual.synced&&actual.calls>0});
  }
  await click('#inkBtnPause');
  const real=await page(`const e=inkbox.world.entities.find(e=>e.sp==='human'&&e.hp>0);if(!e)throw Error('No living real mortal');const r=inkbox.g1.open('mortal:'+e.id);if(!r.ok)throw Error('Formal selection failed '+r.reason);return {id:e.id,name:e.name,key:r.viewModel.identity.key};`);
  await click('#inkPersonDetail [data-g1-action="expand"]');
  for(const tab of ['fate','practice','bonds','history','edit']){
    await click('.g1-mingpu__tabs [role="tab"]:nth-child('+({fate:1,practice:2,bonds:3,history:4,edit:5}[tab])+')');
    const visible=await page(`return [...document.querySelectorAll('.g1-mingpu__body [role="tabpanel"]')].find(x=>!x.hidden)?.getAttribute('aria-label');`);
    if(!visible)throw Error('No visible Mingpu page '+tab);
    await b.screenshot(path.join(out,label+'-mingpu-'+tab+'.png'));
  }
  await click('.g1-mingpu__tabs [role="tab"]:nth-child(5)');
  await clickText('启用万象塑命 Alpha');await sleep(400);
  await clickText('读取 / 刷新草稿');await sleep(400);
  const form=await page(`return {buttons:[...document.querySelectorAll('.g1-mingpu__body [role="tabpanel"][aria-label="改命"] button')].map(x=>({t:x.innerText,disabled:x.disabled})).slice(0,18),selects:[...document.querySelectorAll('.g1-mingpu__body [role="tabpanel"][aria-label="改命"] select')].map(x=>[...x.options].map(o=>o.value))};`);
  const editEvidence=await page(`const root=document.querySelector('.g1-mingpu__body [role="tabpanel"][aria-label="改命"]');const cats=root.querySelector('select');if(!cats)throw Error('Mingpu edit category control missing');cats.value='physique';cats.dispatchEvent(new Event('change',{bubbles:true}));const arts=[...root.querySelectorAll('.g1-mingpu__library article')];const card=arts.find(a=>!a.querySelector('button')?.disabled);if(!card)throw Error('No editable physique catalog entry');window.__wxBefore=JSON.stringify(inkbox.world.entities.find(e=>e.id===${real.id})?.wanxiang);const before=JSON.stringify(inkbox.world.entities.find(e=>e.id===${real.id})?.wanxiang);return {cardIndex:arts.indexOf(card)+1,selected:card.querySelector('strong').innerText,previewButtons:[...root.querySelectorAll('.g1-mingpu__actions button')].map(x=>({t:x.innerText,disabled:x.disabled})),unchanged:before===window.__wxBefore};`);
  await click('.g1-mingpu__library article:nth-child('+editEvidence.cardIndex+') button');
  await clickText('预览并校验');
  await sleep(300);
  const preview=await page(`const root=document.querySelector('.g1-mingpu__body [role="tabpanel"][aria-label="改命"]');return {notice:document.querySelector('.g1-mingpu__notice').innerText,diff:root.querySelector('.g1-mingpu__diff')?.innerText,commit:root.querySelector('.g1-mingpu__actions button:last-child')?.disabled};`);
  if(!editEvidence.unchanged||preview.commit)throw Error('Edit preview did not preserve world or enable commit');
  await page(`document.querySelector('.g1-mingpu__diff').scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);return true;`);
  await b.screenshot(path.join(out,label+'-mingpu-preview.png'));
  const unrelated=await page(`const {emitCommittedFact}=await import('./src/inkbox/wanxiang/experiences.js');const e=inkbox.world.entities.find(e=>e.id===${real.id});const id='wx-c-browser-escape:'+e.id+':'+inkbox.world.day;emitCommittedFact(inkbox.world,e,{id,type:'escaped'});window.__wxCConcurrentFact=id;return {controlled:true,id,retained:e.wanxiang.experienceLedger.records.some(r=>r.id===id)};`);
  await click('.g1-mingpu__body [role="tabpanel"][aria-label="改命"] .g1-mingpu__actions button:last-child');
  await sleep(500);
  const committed=await page(`return {notice:document.querySelector('.g1-mingpu__notice').innerText,profile:inkbox.world.entities.find(e=>e.id===${real.id}).wanxiang,overlay:!!document.querySelector('vite-error-overlay')};`);
  report.checks.push({name:label+' five volumes and controller edit',evidence:{real,form,editEvidence,preview,committed},pass:!committed.overlay&&committed.profile?.history?.some(x=>x.source==='玩家改命')&&committed.profile?.experienceLedger?.records?.some(x=>x.id===unrelated.id)});
  await b.screenshot(path.join(out,label+'-mingpu-committed.png'));
  await clickText('读取 / 刷新草稿');await sleep(200);
  const beforeDecree=await page(`const e=inkbox.world.entities.find(e=>e.id===${real.id});return {facts:e.wanxiang.experienceLedger?.records?.length||0,history:e.wanxiang.history.length};`);
  await clickText('敕赐初阶血脉');await clickText('预览并校验');await sleep(200);
  await b.screenshot(path.join(out,label+'-07-decree-preview.png'));
  await clickText('提交改命');await sleep(300);
  const decree=await page(`const e=inkbox.world.entities.find(e=>e.id===${real.id});return {last:e.wanxiang.history.at(-1),facts:e.wanxiang.experienceLedger?.records?.length||0,notice:document.querySelector('.g1-mingpu__notice').innerText};`);
  report.checks.push({name:label+' explicit decree preserves natural facts',pass:decree.last?.mode==='decree'&&decree.last?.source==='天道敕改'&&decree.facts===beforeDecree.facts,evidence:{beforeDecree,decree}});
  await click('.g1-mingpu__tabs [role="tab"]:nth-child(4)');
  const historyLabels=await page(`const text=document.querySelector('.g1-mingpu__body [aria-label="经历"]').innerText;return {natural:text.includes('真实脱战'),fate:text.includes('常规改命'),decree:text.includes('天道敕改')};`);
  report.checks.push({name:label+' natural and heaven history distinction',pass:historyLabels.natural&&historyLabels.fate&&historyLabels.decree,evidence:historyLabels});
  await b.screenshot(path.join(out,label+'-08-decree-history.png'));

  await click('.g1-mingpu__tabs [role="tab"]:nth-child(1)');
  await page(`document.querySelector('.g1-mingpu__mechanism')?.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);return true;`);
  await b.screenshot(path.join(out,label+'-mingpu-explanations.png'));
  const explanation=await page(`return {mechanisms:document.querySelectorAll('.g1-mingpu__mechanism').length,source:document.querySelector('.g1-mingpu__body').innerText.includes('来源')};`);
  report.checks.push({name:label+' mechanism explanations',pass:explanation.mechanisms>0,evidence:explanation});
  await click('.g1-mingpu header button');
  await click('#inkPersonDetail [data-g1-action="expand"]');
  await click('.g1-mingpu header button');
  await click('#inkPersonDetail [data-g1-action="close"]');
  await page(`inkbox.setSpeed(0);document.querySelector('#inkSlotSelect').value='slot1';inkbox.refreshSlots();return true;`);
  await click('#inkBtnSave');await sleep(1500);
  const saved=await page(`return {value:document.querySelector('#inkSlotSelect').value,slots:document.querySelector('#inkSlotSelect').innerText,physique:inkbox.world.entities.find(e=>e.id===${real.id}).wanxiang?.physique,profile:inkbox.world.entities.find(e=>e.id===${real.id}).wanxiang?.history?.at(-1)?.source};`);
  await page(`inkbox.world.entities.find(e=>e.id===${real.id}).wanxiang.physique=null;return true;`);
  await click('#inkBtnLoad');await sleep(1500);
  const loaded=await page(`return {person:!!inkbox.world.entities.find(e=>e.id===${real.id}),physique:inkbox.world.entities.find(e=>e.id===${real.id})?.wanxiang?.physique,profile:inkbox.world.entities.find(e=>e.id===${real.id})?.wanxiang?.history?.at(-1)?.source,toast:inkbox.toast};`);
  report.checks.push({name:label+' real save and load',evidence:{saved,loaded},pass:loaded.profile==='天道敕改'&&!!saved.physique&&JSON.stringify(loaded.physique)===JSON.stringify(saved.physique)});
  const revisit=await page(`const result=inkbox.g1.open('mortal:${real.id}');return {ok:result.ok,key:result.viewModel?.identity.key,physique:result.viewModel?.mingpu?.profile?.physique};`);
  report.checks.push({name:label+' restored person revisit',pass:revisit.ok&&revisit.key===`mortal:${real.id}`&&JSON.stringify(revisit.physique)===JSON.stringify(saved.physique),evidence:revisit});
  await click('#inkPersonDetail [data-g1-action="close"]');
  const site=await page(`let site=inkbox.world.sites.find(s=>Number.isFinite(s.id));let source='existing world site';if(!site){const {spawnSecretRealm}=await import('./src/inkbox/sim/sites.js');const {mulberry32}=await import('./src/inkbox/core/noise.js');site=spawnSecretRealm(inkbox.world,mulberry32(20261106));source='controlled native spawnSecretRealm for UI revisit';}if(!site)throw Error('Native site placement failed');inkbox.inspectPlaneSubject('mortal',{kind:'site',siteId:site.id});return {id:site.id,name:site.name,source,panelId:document.querySelector('#inkInspect').dataset.subjectId,text:document.querySelector('#inkInspect').innerText};`);
  await click('#inkInspectClose');
  const siteAgain=await page(`inkbox.inspectPlaneSubject('mortal',{kind:'site',siteId:${site.id}});return {id:document.querySelector('#inkInspect').dataset.subjectId,text:document.querySelector('#inkInspect').innerText};`);
  report.checks.push({name:label+' real site revisit',pass:site.panelId===String(site.id)&&siteAgain.id===String(site.id)&&site.text===siteAgain.text,evidence:{site,siteAgain}});
  await b.screenshot(path.join(out,label+'-site-revisit.png'));
  await click('#inkInspectClose');
  // Import a genuine natural-world checkpoint through the same codec/storage
  // and visible Load control. No outcome is added for a screenshot.
  const mature=await page(`const data=await (await fetch(${JSON.stringify(matureUrl)})).json();const {deserializeWorld,saveToStorage}=await import('./src/inkbox/io/save.js');const w=deserializeWorld(data);let runtime=data.runtime,adapted=false;
    if(!runtime.upperLife){
      // The comparative observer is deliberately mortal-only. Reattach freshly
      // generated control realms for the product's three-plane load contract;
      // keep the observed mortal people, outcomes and restored RNG untouched.
      delete w.upper;delete w.nether;
      const [{Life},{UpperLife},{rngStream},{createAdvanceState},{captureRuntimeState,restoreRuntimeState},{generateUpperWorld},{generateNetherWorld}]=await Promise.all(['sim/life.js','sim/upperLife.js','core/noise.js','sim/advance.js','sim/runtimeState.js','world/worldgenUpper.js','world/worldgenNether.js'].map(p=>import('./src/inkbox/'+p)));
      const life=new Life(w,rngStream(w.seed^0xa5a5a5a5)),advanceState=createAdvanceState(),playerRng=rngStream(w.seed^0x504c4159);
      restoreRuntimeState(runtime,{world:w,life,advanceState,playerRng});
      const preset={w:w.w,h:w.h};w.upper=generateUpperWorld({preset,seed:w.seed});w.nether=generateNetherWorld({preset,seed:w.seed});
      for(const p of [w.upper,w.nether]){p.day=w.day;p.year=w.year;}
      runtime=captureRuntimeState({world:w,life,upperLife:new UpperLife(w.upper),advanceState,playerRng});adapted=true;
    }
    const saved=await saveToStorage(w,'slot2',{source:'WX-D natural mortal profile; fresh control realms for UI'},runtime);if(!saved.ok)throw Error(saved.error);inkbox.refreshSlots();document.querySelector('#inkSlotSelect').value='slot2';return {seed:data.seed,day:data.day,adapted};`);
  report.viewportRuns.at(-1).matureSource={file:matureRelative,...mature,note:'Mortal facts are natural. Additional control realms, when required, are newly generated for the browser contract and are not a natural three-realm long run.'};
  await click('#inkBtnLoad');
  if(!await b.waitFor(`return inkbox.world.seed===${mature.seed}&&inkbox.world.day>=${mature.day}`,{timeoutMs:15000}))throw Error('Natural mature checkpoint did not load');
  await page(`inkbox.setSpeed(0);return true;`);
  const dEvidence=await page(`const w=inkbox.world;const actor=w.entities.find(e=>e.wanxiang?.history?.some(h=>h.kind==='natural-choice'&&h.targetKey&&h.cost!=null&&h.result));const event=actor?.wanxiang.history.findLast(h=>h.kind==='natural-choice'&&h.targetKey&&h.cost!=null&&h.result);const {siteHasContent}=await import('./src/inkbox/sim/sites.js');const dormant=w.sites.find(s=>s.kind==='cave'&&!siteHasContent(s,w));return {actor:actor&&{id:actor.id,event},dormant:dormant&&{id:dormant.id}};`);
  if(dEvidence.actor){
   const social=await page(`const r=inkbox.g1.open('mortal:${dEvidence.actor.id}');return {ok:r.ok,profile:r.viewModel?.mingpu?.profile};`);
   await click('#inkPersonDetail [data-g1-action="expand"]');await clickText('因缘');
   const text=await page(`return document.querySelector('.g1-mingpu__body [aria-label="因缘"]').innerText;`);
   report.checks.push({name:label+' committed paid social receipt',pass:social.ok&&text.includes('最近一次有代价互动')&&text.includes(dEvidence.actor.event.result),evidence:{event:dEvidence.actor.event,text}});
   await page(`const h=[...document.querySelectorAll('.g1-mingpu__body h3')].find(e=>e.innerText==='最近一次有代价互动');h?.scrollIntoView({block:'center'});return true;`);
   await b.screenshot(path.join(out,label+'-d-natural-bonds.png'));
   await clickText('经历');
   await page(`const h=[...document.querySelectorAll('.g1-mingpu__body [aria-label="经历"] article')].find(e=>e.innerText.includes(${JSON.stringify(dEvidence.actor.event.result)}));h?.scrollIntoView({block:'center'});return true;`);
   await b.screenshot(path.join(out,label+'-d-natural-history.png'));
   await click('.g1-mingpu header button');await click('#inkPersonDetail [data-g1-action="close"]');
  }else report.checks.push({name:label+' committed paid social receipt',pass:false,skipped:'No committed paid social event in this world'});
  if(dEvidence.dormant){
   const text=await page(`inkbox.inspectPlaneSubject('mortal',{kind:'site',siteId:${dEvidence.dormant.id}});return document.querySelector('#inkInspect').innerText;`);
   report.checks.push({name:label+' dormant cave',pass:text.includes('旧址沉寂'),evidence:{id:dEvidence.dormant.id,text}});await b.screenshot(path.join(out,label+'-d-dormant-site.png'));await click('#inkInspectClose');
  }else report.checks.push({name:label+' dormant cave',pass:false,skipped:'No dormant cave in this world'});
  // Close the real person overlay and map tool panel using visible native controls.
  if(await page(`return !!document.querySelector('#inkPersonDetail.on')`))await click('#inkPersonDetail [data-g1-action="close"]');
  // Inspect reachable UI and use a real map point if a person exists.
  const state=await page(`const w=inkbox.world;return {entities:w.entities?.filter(e=>e.sp==='human'&&e.hp>0).length,people:w.entities?.filter(e=>e.sp==='human'&&e.hp>0).slice(0,3).map(e=>({id:e.id,x:e.x,y:e.y})),canvas:[...document.querySelectorAll('canvas')].map(c=>{let r=c.getBoundingClientRect();return {id:c.id,x:r.x,y:r.y,w:r.width,h:r.height}}),buttons:[...document.querySelectorAll('button')].map(x=>[x.id,x.innerText]).filter(x=>x[1]).slice(0,80)};`);
  report.viewportRuns.at(-1).postCreate=state;
  await b.screenshot(path.join(out,label+'-created.png'));
  report.viewportRuns.at(-1).consoleErrors=b.errors();report.viewportRuns.at(-1).renderer=renderer;
  await b.close();b=null;
 }
 report.pass=report.checks.every(x=>x.pass)&&report.viewportRuns.every(x=>x.consoleErrors?.length===0);
} catch(e){report.error=e.stack;if(b){report.browserErrors=b.errors();report.failureDom=await page(`return {notice:[...document.querySelectorAll('.g1-mingpu__notice,[role="status"]')].map(x=>x.innerText).filter(Boolean),text:document.querySelector('.g1-mingpu__body [role="tabpanel"][aria-label="改命"]')?.innerText,form:(()=>{const x=document.querySelector('.g1-mingpu__body [role="tabpanel"][aria-label="改命"]');return x?{html:x.innerHTML.slice(0,5000),buttons:[...x.querySelectorAll('button')].map(b=>({text:b.innerText,disabled:b.disabled})),selects:[...x.querySelectorAll('select')].map(s=>({aria:s.getAttribute('aria-label'),options:[...s.options].map(o=>o.value)}))}:null})()};`).catch(err=>({diagnosticError:err.message}));await b.screenshot(path.join(out,'failure.png')).catch(()=>{});await b.close();b=null;}process.exitCode=1;}
finally {if(server?.child&&server.child.exitCode===null)server.child.kill();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,error:report.error,output:out}));}



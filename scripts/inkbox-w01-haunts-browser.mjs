// Native browser proof that Buddhist and soul cultivators complete real ghost jobs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findEdge, launch } from './cdp.mjs';
import { writeDaoHauntScene } from './fixtures/wanling-scene.mjs';

const base = process.env.INKBOX_URL || 'http://127.0.0.1:4233/inkbox.html';
const out = path.resolve(process.env.INKBOX_REPORT_DIR || `reports/local/w01/haunts/${new Date().toISOString().replaceAll(':', '-')}`);
fs.mkdirSync(out, { recursive: true });
const fixture = writeDaoHauntScene({ outputDir: path.join(out, 'fixture') });
const report = { started: new Date().toISOString(), url: base, fixture: fixture.metadata,
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [], screenshots: [] };
let browser;
const js = body => browser.js(`return(async()=>{${body}})();`, { timeoutMs: 45000 });
function check(name, actual, evidence) {
  const pass = typeof actual === 'boolean' ? actual : !!actual;
  report.checks.push({ name, pass, evidence });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(evidence)}`);
}
async function click(selector) {
  const point = await js(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.getClientRects().length);
    if(!e)throw Error('No visible '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});
    const body=e.closest('.wanling-body');if(body)body.scrollTop=body.scrollHeight;
    for(let n=e.parentElement;n;n=n.parentElement){if(n.scrollHeight<=n.clientHeight)continue;const p=n.getBoundingClientRect(),r=e.getBoundingClientRect();
      if(r.bottom>p.bottom-12)n.scrollTop+=r.bottom-p.bottom+24;else if(r.top<p.top+12)n.scrollTop-=p.top-r.top+24;}
    e.scrollIntoView({block:'nearest',inline:'nearest'});
    await new Promise(r=>setTimeout(r,160));await new Promise(requestAnimationFrame);
    const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,h=document.elementFromPoint(x,y);
    if(!h||h!==e&&!e.contains(h))throw Error('Not clickable '+${JSON.stringify(selector)}+JSON.stringify({x,y,width:innerWidth,height:innerHeight,
      rect:{x:b.x,y:b.y,width:b.width,height:b.height},hit:h?.outerHTML.slice(0,120),ancestors:(()=>{const a=[];for(let n=e;n&&a.length<8;n=n.parentElement){const r=n.getBoundingClientRect();a.push({tag:n.tagName,id:n.id,cls:String(n.className).slice(0,50),y:r.y,h:r.height,top:n.scrollTop,sh:n.scrollHeight,ch:n.clientHeight,overflow:getComputedStyle(n).overflowY});}return a;})()}));return{x,y};`);
  await browser.click(point.x, point.y);
}
async function facts() {
  return js(`const w=inkbox.world, ids=${JSON.stringify(fixture.metadata.actors)};
    const jobs=w.wanling?.jobs||[], actors=Object.values(ids.focusedDao).map(id=>w.entities.find(e=>e.id===id));
    const targets=ids.wraithStart.map(start=>{const live=w.wraiths.find(g=>g.id===start.id);return{...start,live:!!live,hpAfter:live?.hp};});
    return{day:w.day,people:w.entities.length,counts:{human:w.entities.filter(e=>e.sp==='human').length,
      cultivator:w.entities.filter(e=>e.sp==='cultivator').length,beast:w.entities.filter(e=>e.sp==='beast').length},
      entityIds:w.entities.map(e=>e.id),entitySummary:w.entities.map(e=>({id:e.id,sp:e.sp,name:e.name,village:e.village,dao:e.dao?.path?.key||null})),
      peopleById:actors.map(e=>e?.id),actors:actors.map(e=>({id:e.id,name:e.name,path:e.dao?.path?.key,hp:e.hp,pollution:e.pollution})),
      targets,jobs:jobs.filter(j=>actors.some(e=>e.id===j.actorId)).map(j=>({...j})),wraithLog:structuredClone(w.wraithLog||null)};`);
}
async function screenshot(name) {
  report.screenshots.push(await browser.screenshot(path.join(out, `${name}.png`)));
}

try {
  browser = await launch({ url: base, browser: findEdge(), width: 1366, height: 768, gpu: true });
  check('normal game boots', await browser.waitFor('return !!window.inkbox?.world&&!!inkbox.wanlingCodex;', { timeoutMs: 45000 }));
  await browser.key('escape');
  await js('inkbox.setSpeed(0);return true;');
  await click('#inkBtnImport');
  const doc = await browser.cdp.send('DOM.getDocument');
  const input = await browser.cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#inkImportFile' });
  await browser.cdp.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [fixture.savePath] });
  check('controlled production save imports without changing actor count', await browser.waitFor(
    `return inkbox.world.entities.length===${fixture.metadata.villages.reduce((n, v) => n + v.pop, 0) + 13} && inkbox.world.wraiths.length===2 && !inkbox.qol.isBusy("inkBtnImport");`,
    { timeoutMs: 30000 }));
  const before = await facts();
  report.before = before;
  check('two actual jobs target separate live ghosts', before.jobs.length === 2
    && before.jobs.every(j => j.stage === 'travel' && before.targets.some(g => g.id === j.targetId && g.live)),
  { jobs: before.jobs, targets: before.targets });
  const populationBefore = before.people;
  await js('inkbox.advanceDays(1);inkbox.setSpeed(0);inkbox.updateHud();inkbox.wanlingCodex.refresh(true);await new Promise(requestAnimationFrame);return true;');
  const after = await facts();
  report.after = after;
  const buddha = after.actors.find(e => e.path === 'buddha');
  const soul = after.actors.find(e => e.path === 'soul');
  const soulBefore = before.actors.find(e => e.path === 'soul');
  const buddhistJob = after.jobs.find(j => j.path === 'buddha');
  const soulJob = after.jobs.find(j => j.path === 'soul');
  const buddhaTarget = before.targets.find(g => g.id === buddhistJob?.targetId);
  const soulTarget = before.targets.find(g => g.id === soulJob?.targetId);
  check('Buddhist completes real exorcism and records the dissolved ghost', buddhistJob?.stage === 'done'
    && buddhistJob.summary.includes('超度') && !after.targets.find(g => g.id === buddhaTarget?.id)?.live
    && (after.wraithLog?.dissolved || 0) === (before.wraithLog?.dissolved || 0) + 1,
  { job: buddhistJob, targetBefore: buddhaTarget, targetsAfter: after.targets, logBefore: before.wraithLog, logAfter: after.wraithLog });
  check('Soul cultivator changes the actual ghost and completes its paid action', soulJob?.stage === 'done'
    && soulTarget?.soulKind === 'ghostCultivator'
    && soulJob.summary.includes('净化')
    && (soulJob.targetId < 0 ? false : (before.targets.find(g => g.id === soulJob.targetId)?.hp || 0)
      > (after.targets.find(g => g.id === soulJob.targetId)?.hpAfter || 0))
    && Number.isFinite(soul.pollution) && soul.hp < soulBefore.hp,
  { job: soulJob, targetBefore: soulTarget, targetsAfter: after.targets, actorBefore: soulBefore, actorAfter: soul,
    note: 'soul action spends the cultivator’s actual health when this fixture has no sect treasury' });
  const newWorldEntities=after.entitySummary.filter(e=>!before.entityIds.includes(e.id));
  const newHumans=newWorldEntities.filter(e=>e.sp==='human');
  const newCultivators=newWorldEntities.filter(e=>e.sp==='cultivator');
  const naturalBeasts=newWorldEntities.filter(e=>e.sp==='beast');
  const focusedActorCounts=after.peopleById.map(id=>after.entityIds.filter(candidate=>candidate===id).length);
  report.populationDelta={before:before.counts,after:after.counts,newHumans,newCultivators,naturalBeasts};
  check('native activities preserve human and cultivator counts and identity; natural beasts are recorded separately',
    after.counts.human===before.counts.human&&after.counts.cultivator===before.counts.cultivator
      &&focusedActorCounts.every(count=>count===1)&&newHumans.length===0&&newCultivators.length===0,
    { importedPeople:populationBefore,afterFormalDay:after.people,before:before.counts,after:after.counts,
      focusedActorIdsBefore:before.peopleById,focusedActorIdsAfter:after.peopleById,focusedActorCounts,newHumans,newCultivators,naturalBeasts });

  await click('#inkWanling summary');
  await click('#inkWanling .wanling-paths>summary');
  const daoRowSelector = `[data-dao-actor="${buddha.id}"]`;
  const daoRow = await js(`const e=document.querySelector(${JSON.stringify(daoRowSelector)});
    if(!e)throw Error('Missing exact Buddha dao row');e.scrollIntoView({block:'center',behavior:'instant'});
    for(let n=e.parentElement;n;n=n.parentElement){if(n.scrollHeight<=n.clientHeight)continue;const p=n.getBoundingClientRect(),r=e.getBoundingClientRect();
      if(r.bottom>p.bottom-12)n.scrollTop+=r.bottom-p.bottom+24;else if(r.top<p.top+12)n.scrollTop-=p.top-r.top+24;}
    e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(r=>setTimeout(r,160));
    e.focus({preventScroll:true});return{actorId:e.dataset.daoActor,text:e.innerText,focused:document.activeElement===e};`);
  check('exact Buddhist row is focused for native selection', Number(daoRow.actorId)===buddha.id
    && daoRow.focused && (daoRow.text.includes('佛') || daoRow.text.includes('渡')),
    { row: daoRow, expectedActorId: buddha.id });
  // Keep the two completed activity results visible together. Opening the modal
  // character book would cover this evidence; its controls have their own G1 QA.
  report.activityUi = await js(`const a=document.querySelector('[data-dao-actor="${buddha.id}"]'),b=document.querySelector('[data-dao-actor="${soul.id}"]');
    a.scrollIntoView({block:'start',behavior:'instant'});return{buddha:{id:Number(a.dataset.daoActor),text:a.innerText},soul:{id:Number(b.dataset.daoActor),text:b.innerText}};`);
  check('formal activity list shows both named cultivators and their completed consequences',
    report.activityUi.buddha.id===buddha.id&&report.activityUi.buddha.text.includes('超度')
      &&report.activityUi.soul.id===soul.id&&report.activityUi.soul.text.includes('净化'),report.activityUi);
  await screenshot('01-real-buddha-and-soul-paths');
  report.environment = await js(`const c=document.createElement('canvas'),gl=c.getContext('webgl2',{preserveDrawingBuffer:false})||c.getContext('webgl',{preserveDrawingBuffer:false});
    const ext=gl?.getExtension('WEBGL_debug_renderer_info'),gpu=ext&&gl?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,glError=gl?.getError()??null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();return{ua:navigator.userAgent,gpu,glError,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]};`);
  report.errors = { js: browser.errors(), console: browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map(e => e.params.args.map(a => a.value || a.description)) };
  check('no browser runtime or WebGL errors', report.errors.js.length === 0 && report.errors.console.length === 0
    && report.environment.glError === 0, { errors: report.errors, environment: report.environment });
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  report.browserErrors = browser?.errors?.();
  if (browser) try { await screenshot('failure'); } catch { /* preserve original failure */ }
  process.exitCode = 1;
} finally {
  if (browser) report.cleanup = await browser.close();
  if (report.cleanup && !report.cleanup.complete) { report.pass = false; process.exitCode = 1; }
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: !!report.pass, checks: report.checks, failure: report.failure,
    cleanup: report.cleanup, out }));
}

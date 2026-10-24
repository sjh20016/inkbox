// P0 player-path acceptance. Start the product server separately. This script
// owns only an isolated Edge profile and sends real CDP mouse/key input for
// every power. Page scripts prepare worlds and read facts; they never cast.
// Examples: node scripts/inkbox-p0-browser.mjs --section=c,d
//           INKBOX_WIDTH=1280 INKBOX_HEIGHT=720 node scripts/inkbox-p0-browser.mjs --section=b
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findEdge, launch, input, sleep } from './cdp.mjs';

const args = new Map(process.argv.slice(2).filter(s => s.startsWith('--')).map(s => {
  const [key, ...value] = s.slice(2).split('='); return [key, value.join('=') || true];
}));
const sections = String(args.get('section') || 'c,d').split(',').map(s => s.trim().toLowerCase());
const requested = sections.includes('all') ? ['a', 'b', 'c', 'd'] : sections;
for (const name of requested) if (!['a', 'b', 'c', 'd'].includes(name)) throw Error(`Unknown section ${name}`);
const width = Number(process.env.INKBOX_WIDTH || 1366), height = Number(process.env.INKBOX_HEIGHT || 768);
assert(Number.isInteger(width) && Number.isInteger(height) && width >= 960 && height >= 650);
const out = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/p0-three/browser', `${width}x${height}`);
fs.mkdirSync(out, { recursive: true });
const report = { sections: requested, viewport: [width, height], checks: [], screenshots: [], steps: [], failures: [], pass: false,
  setup: 'C/D: fresh medium world via Sandbox.newWorld(seed 20261024). B: explicit local fixture on a new world; all powers through CDP Input.' };
let browser;
const js = body => browser.js(`return (async()=>{${body}})();`, { timeoutMs: 60000 });
const check = (name, pass, detail = null) => {
  report.checks.push({ name, pass: !!pass, detail });
  if (!pass) throw Error(`${name}${detail ? ': '+JSON.stringify(detail) : ''}`);
};
async function shot(name) {
  const file = path.join(out, `${name}.png`);
  report.screenshots.push(await browser.screenshot(file));
}
async function visiblePoint(selector) {
  return js(`const selector=${JSON.stringify(selector)};const e=[...document.querySelectorAll(selector)]
    .find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.hidden&&getComputedStyle(e).visibility!=='hidden'});
    if(!e)throw Error('Missing visible control '+selector);e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
    await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
    if(hit!==e&&!e.contains(hit))throw Error('Control is occluded '+selector+' by '+hit?.tagName);return {x,y};`);
}
async function click(selector) { const p=await visiblePoint(selector); await browser.click(p.x,p.y); }
async function tool(group, id) {
  await click(`[data-r1-group="${group}"]`);
  await click(`[data-native-mode="${id}"]`);
  await click('#r1NativeArts .r1-arts-close');
  check(`${id} is selected and stays in Three`, await js(`return inkbox.render3d.active&&inkbox.render3d.renderer.activePlane==='mortal'&&inkbox.render3d.mode===${JSON.stringify(id)}&&inkbox.toolId===${JSON.stringify(id)};`));
}
async function freshWorld(seed = 20261024) {
  await js(`inkbox.newWorld('medium',${seed});inkbox.setSpeed(0);return true;`);
  check(`fresh medium world ${seed}`, await browser.waitFor(`return inkbox.world?.seed===${seed}&&inkbox.render3d?.renderer?.world===inkbox.world`, { timeoutMs: 45000 }));
  await browser.key('escape');
}
async function state() { return js(`const a=inkbox.render3d;return {active:a.active,plane:a.renderer.activePlane,
    target:a.renderer.cameraRig.controls.target.toArray(),held:[...a.heldCameraKeys],focus:document.activeElement?.tagName};`); }
async function move(key='w') {
  const before=await state(), spec={key,code:`Key${key.toUpperCase()}`,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)};
  await browser.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',...spec});
  await sleep(350);
  await browser.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',...spec});
  const after=await state();
  return {before,after,distance:Math.hypot(...after.target.map((v,i)=>v-before.target[i]))};
}
async function visibleTerrain({minVeg=0,maxVeg=1,maxWater=.0015,nearVillage=false}={}) {
  return js(`const a=inkbox.render3d,r=a.renderer,w=inkbox.world;
    ${nearVillage ? `const village=w.villages.find(v=>v.hp>0);if(village){r.focusOn(village.x,village.y,{duration:.01},'mortal');await new Promise(resolve=>setTimeout(resolve,450));}` : ''}
    const rect=a.canvas.getBoundingClientRect();let selected=null;
    for(let py=Math.max(120,Math.floor(r.height*.25));py<Math.min(r.height-80,Math.floor(r.height*.78))&&!selected;py+=18)
      for(let px=Math.floor(r.width*.22);px<Math.floor(r.width*.78);px+=18){
        if(document.elementFromPoint(px+rect.left,py+rect.top)!==a.canvas)continue;
        const h=r.pick(px,py);if(h?.plane!=='mortal'||h.kind!=='terrain')continue;
        const i=w.idx(h.x,h.y);if(w.height[i]>.93||w.water[i]>${maxWater}||w.veg[i]<${minVeg}||w.veg[i]>${maxVeg})continue;
        ${nearVillage ? 'if(!w.villages.some(v=>v.hp>0&&Math.hypot(v.x-h.x,v.y-h.y)<12))continue;' : ''}
        selected={x:px+rect.left,y:py+rect.top,cell:[h.x,h.y],veg:w.veg[i],water:w.water[i],
          villageDistance:w.villages.length?Math.min(...w.villages.map(v=>Math.hypot(v.x-h.x,v.y-h.y))):null};break;
      }
    if(!selected)throw Error('No unobstructed mortal terrain matching requested real state');
    r.focusOn(selected.cell[0]+.5,selected.cell[1]+.5,{duration:.01},'mortal');r.cameraRig.camera.zoom=6;r.cameraRig.camera.updateProjectionMatrix();
    for(let frame=0;frame<8;frame++)await new Promise(requestAnimationFrame);
    const T=await import('three'),stage=r.stages.get('mortal'),q=r.coordinates.worldToRender(selected.cell[0]+.5,selected.cell[1]+.5,stage.elevation.at(selected.cell[0]+.5,selected.cell[1]+.5));
    const v=new T.Vector3(q.x,q.y,q.z).project(r.cameraRig.camera),sx=(v.x+1)*r.width/2,sy=(1-v.y)*r.height/2;
    for(let dy=-18;dy<=18;dy+=3)for(let dx=-18;dx<=18;dx+=3){const px=sx+dx,py=sy+dy;
      if(document.elementFromPoint(px+rect.left,py+rect.top)!==a.canvas)continue;const hit=r.pick(px,py);if(hit?.plane!=='mortal'||hit.kind!=='terrain')continue;
      const i=w.idx(hit.x,hit.y);if(w.height[i]>.93||Math.hypot(hit.x-selected.cell[0],hit.y-selected.cell[1])>2||w.water[i]>${maxWater}||w.veg[i]<${minVeg}||w.veg[i]>${maxVeg})continue;
      return {x:px+rect.left,y:py+rect.top,cell:[hit.x,hit.y],veg:w.veg[i],water:w.water[i]};}
    throw Error('Selected terrain is occluded after close focus; no through-scenery cast performed');`);
}
async function snapshotAt(point) {
  return js(`const w=inkbox.world,cx=${point.cell[0]},cy=${point.cell[1]},fields=['height','water','veg','over','fire','struct'];
    const cells=[];for(let y=Math.max(0,cy-12);y<=Math.min(w.h-1,cy+12);y++)for(let x=Math.max(0,cx-12);x<=Math.min(w.w-1,cx+12);x++){
      const i=w.idx(x,y);cells.push(fields.map(k=>w[k][i]));}
    window.__p0Before={cells,entities:new Map(w.entities.map(e=>[e.id,{hp:e.hp,level:e.level,lifespan:e.lifespan}])),
      villages:new Map(w.villages.map(v=>[v.id,{hp:v.hp,food:v.food}])),leylines:w.leylines.length,
      chronicle:w.chronicle.length,milestones:w.milestones.length,day:w.day};
    return {cell:[cx,cy],veg:w.veg[w.idx(cx,cy)],water:w.water[w.idx(cx,cy)],day:w.day};`);
}
async function diffAt(point) {
  return js(`const w=inkbox.world,b=window.__p0Before,cx=${point.cell[0]},cy=${point.cell[1]},fields=['height','water','veg','over','fire','struct'];
    const count=Object.fromEntries(fields.map(k=>[k,0]));let n=0;
    for(let y=Math.max(0,cy-12);y<=Math.min(w.h-1,cy+12);y++)for(let x=Math.max(0,cx-12);x<=Math.min(w.w-1,cx+12);x++){
      const i=w.idx(x,y);for(let k=0;k<fields.length;k++)if(w[fields[k]][i]!==b.cells[n][k])count[fields[k]]++;n++;}
    let people=0,damaged=0,killed=0;for(const e of w.entities){const old=b.entities.get(e.id);
      if(!old||old.hp!==e.hp||old.level!==e.level||old.lifespan!==e.lifespan)people++;
      if(old&&e.hp<old.hp)damaged++;if(old&&old.hp>0&&e.hp<=0)killed++;}
    let villages=0;for(const v of w.villages){const old=b.villages.get(v.id);if(!old||v.hp!==old.hp||v.food!==old.food)villages++;}
    return {count,people,damaged,killed,villages,leylines:w.leylines.length-b.leylines,
      chronicle:w.chronicle.length-b.chronicle,milestones:w.milestones.length-b.milestones,
      water:w.water[w.idx(cx,cy)],day:w.day};`);
}
async function powerStats() { return js(`const r=inkbox.render3d.renderer,p=r.stages.get('mortal')?.fxProbe.power;
  return {active:p?.stats.active||0,drawCalls:p?.stats.drawCalls||0,instances:{...p?.stats.instances},
    items:inkbox.stage?.snapshotPlane?.('mortal')?.items?.filter(i=>i.kind==='power').map(i=>({tool:i.data?.tool,phase:i.data?.phase,age:i.age,ttl:i.ttl}))||[]};`); }
async function cast(group,id,point,{drag=false}={}) {
  await tool(group,id);
  const before=await snapshotAt(point);
  await shot(`c-${id}-before`);
  await browser.mouseMove(point.x,point.y);
  if(drag){await browser.mouseDown(point.x,point.y);await sleep(110);await browser.mouseUp(point.x,point.y);}
  else await browser.click(point.x,point.y, 'left', 30);
  await js('for(let frame=0;frame<3;frame++)await new Promise(requestAnimationFrame);return true;');
  await browser.mouseMove(width-25,12);
  const immediate=await diffAt(point);
  const fxImmediate=await powerStats();
  await shot(`c-${id}-release`);
  await sleep(600);
  const fxMid=await powerStats();
  await shot(`c-${id}-mid`);
  await sleep(2800);
  const fxLate=await powerStats();
  await shot(`c-${id}-after`);
  report.steps.push({section:'c',tool:id,point,before,after:immediate,fx:{immediate:fxImmediate,mid:fxMid,late:fxLate}});
  const direct=Object.values(immediate.count).some(n=>n>0)||immediate.people>0||immediate.villages>0||immediate.leylines>0;
  check(`${id} changed real world data`,direct,immediate);
  const eventTool=id==='flood'?'water-response':id;
  check(`${id} visible 3D power instances`,fxImmediate.active>0&&fxImmediate.drawCalls>0
    &&fxImmediate.items.some(i=>i.tool===eventTool),fxImmediate);
  check(`${id} has a timed phase`,fxMid.items.some(i=>i.tool===eventTool)
    &&!fxLate.items.some(i=>i.tool===eventTool),{mid:fxMid,late:fxLate});
}
async function sectionC() {
  await freshWorld();
  // A generated empty landscape can be populated through the player's actual
  // creation tool. Never manufacture entities or villages in the evidence.
  if (await js('return inkbox.world.entities.length===0;')) {
    const point=await visibleTerrain();await tool('life','human');
    for(let i=0;i<3;i++)await browser.click(point.x,point.y);
    await js('for(let day=0;day<180;day++)inkbox.advanceDays(1);inkbox.syncWorldInfo();inkbox.dirty=true;return true;');
    check('real player-created people survive in the new world',await js('return inkbox.world.entities.some(e=>e.hp>0);'));
    report.steps.push({section:'setup',kind:'formal human tool + 180 official days',counts:await js('return {people:inkbox.world.entities.length,villages:inkbox.world.villages.length};')});
  }
  for(const [group,id,filter,drag] of [
    ['nature','forest',{maxVeg:.7},true],['nature','fertile',{maxVeg:.8},true],
    ['water','rain',{maxVeg:.8},true],['nature','burn',{minVeg:.3},true],
    ['dao','leyline',{},false],['disaster','lightning',{minVeg:.3},false],
    ['disaster','meteor',{},false],['disaster','quake',{nearVillage:true},false],
    ['disaster','flood',{},false],
  ]){
    try {const point=await visibleTerrain(filter);await cast(group,id,point,{drag});}
    catch(error){report.failures.push({section:'c',tool:id,error:error.stack});try{await shot(`c-${id}-failure`);}catch{}}
  }
}
async function sectionD() {
  if(!report.steps.some(s=>s.section==='c'))await freshWorld();
  if(await js('return inkbox.world.entities.length===0;')){
    const point=await visibleTerrain();await tool('life','human');for(let i=0;i<3;i++)await browser.click(point.x,point.y);
    await js('for(let day=0;day<180;day++)inkbox.advanceDays(1);inkbox.dirty=true;return true;');
  }
  const start=await move();check('WASD moves before panels',start.distance>3,start);
  await click('#inkBusanziNext');
  check('Busanzi next shows actual advice',await js('return inkbox.busanziShowNext&& !document.getElementById("inkBusanziAdvice").hidden;'));
  await shot('d-busanzi-next');
  await click('#inkBusanziAcknowledge');
  check('Busanzi acknowledge commits UI state',await js('return !!inkbox.busanziAcknowledged&&!inkbox.busanziShowNext;'));
  await click('#inkBusanziLater');
  check('Busanzi later collapses panel',await js('return inkbox.busanziCollapsed&&document.getElementById("inkBusanzi").classList.contains("is-collapsed");'));
  await click('#inkBusanziToggle');
  check('Busanzi expands again',await js('return !inkbox.busanziCollapsed;'));
  await click('#inkBtnHelp');check('help opens',await js('return !document.getElementById("inkHelp").hidden;'));
  await click('#inkHelpClose');check('WASD resumes after help',(await move('d')).distance>3);
  await click('[data-r1-group="nature"]');await click('#r1NativeArts .r1-arts-close');
  check('WASD resumes after tool sheet',(await move('w')).distance>3);
  const person=await js('const e=inkbox.world.entities.find(e=>e.hp>0);if(!e)throw Error("No real person in world");inkbox.showPersonCard(e.id);return {id:e.id,open:document.getElementById("inkPersonDetail").classList.contains("on")};');
  check('real person card opens',person.open,person);await shot('d-person-card');
  await js('inkbox.hidePersonCard();return true;');
  check('WASD resumes after person card',(await move('a')).distance>3);
  const undoUI=await js(`const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'};
    return [...document.querySelectorAll('button,[role="button"]')].filter(visible)
      .filter(e=>/撤销|重做|undo|redo/i.test([e.innerText,e.title,e.getAttribute('aria-label')].join(' ')))
      .map(e=>e.outerHTML.slice(0,220));`);
  check('no visible undo or redo entry',undoUI.length===0,undoUI);
  const point=await visibleTerrain();await tool('terrain','raise');
  const beforeRaise=await js(`const w=inkbox.world;return w.height[w.idx(${point.cell[0]},${point.cell[1]})];`);
  await browser.click(point.x,point.y);
  const beforeUndo=await js(`const w=inkbox.world,i=w.idx(${point.cell[0]},${point.cell[1]});return {height:w.height[i],water:w.water[i],chronicle:w.chronicle.length};`);
  check('3D terrain stroke was actually submitted',beforeUndo.height!==beforeRaise,{beforeRaise,beforeUndo});
  await browser.key('z',input.CTRL);
  const afterUndo=await js(`const w=inkbox.world,i=w.idx(${point.cell[0]},${point.cell[1]});return {height:w.height[i],water:w.water[i],chronicle:w.chronicle.length};`);
  check('Ctrl+Z does not reverse submitted terrain/water',beforeUndo.height===afterUndo.height&&beforeUndo.water===afterUndo.water,
    {beforeUndo,afterUndo});
  await shot('d-no-undo');report.steps.push({section:'d',person,undoUI,beforeUndo,afterUndo});
  const crisisPoint=await visibleTerrain({nearVillage:true});await tool('disaster','crisis');
  const nextCrisisId=await js('return inkbox.life.events.nextEventId;');
  await browser.click(crisisPoint.x,crisisPoint.y);await browser.click(crisisPoint.x,crisisPoint.y);
  const crises=await js(`return inkbox.life.events.activeCrises.filter(e=>e.id>=${nextCrisisId}).map(e=>({id:e.id,villageId:e.villageId,startedDay:e.startedDay,durationDays:e.durationDays}));`);
  const crisisDiagnostic=await js(`const a=inkbox.render3d,r=a.renderer,rect=a.canvas.getBoundingClientRect(),h=r.pick(${crisisPoint.x}-rect.left,${crisisPoint.y}-rect.top);return {next:inkbox.life.events.nextEventId,active:inkbox.life.events.activeCrises,history:inkbox.life.events.history.slice(-2),tool:inkbox.toolId,mode:a.mode,toast:inkbox.toast,pick:h&&{world:h.world,x:h.x,y:h.y,plane:h.plane,kind:h.kind},reason:a.editReason(h),progress:inkbox.world.mapProgress};`);
  check('two player crisis clicks create independent real event identities',crises.length===2&&crises[0].id!==crises[1].id&&crises.every(e=>e.villageId>0),{crises,crisisPoint,diagnostic:crisisDiagnostic});
  const activeRows=await js(`inkbox.refreshMilestones();const ids=${JSON.stringify(crises.map(e=>e.id))};return ids.map(id=>({id,rows:[...document.querySelectorAll('#inkMilestones .ink-log')].filter(e=>e.innerText.includes('事件 #'+id+'「')).length}));`);
  check('each active crisis is shown once in the actual book',activeRows.every(e=>e.rows===1),activeRows);
  await shot('d-crisis-active');
  await js(`const due=Math.max(...${JSON.stringify(crises)}.map(e=>e.startedDay+e.durationDays));inkbox.advanceDays(Math.ceil(due-inkbox.world.day)+1);inkbox.refreshMilestones();inkbox.refreshChronicle();return true;`);
  const resolvedRows=await js(`const ids=${JSON.stringify(crises.map(e=>e.id))},w=inkbox.world;return ids.map(id=>({id,active:inkbox.life.events.activeCrises.filter(e=>e.id===id).length,history:inkbox.life.events.history.filter(e=>e.id===id).map(e=>({status:e.status,outcome:e.outcome})),rows:w.milestones.filter(e=>e.crisisEventId===id).map(e=>({text:e.text,outcome:e.outcome})),chronicle:w.chronicle.filter(e=>e.kind==='crisis'&&e.text.startsWith('事件 #'+id+'：')).length}));`);
  check('resolved crises keep one milestone with opening and outcome per real ID',resolvedRows.every(e=>e.active===0&&e.history.length===1&&e.rows.length===1&&e.rows[0].outcome&&e.rows[0].text.includes(e.rows[0].outcome)),resolvedRows);
  await shot('d-crisis-resolved');report.steps.push({section:'d-crisis',crisisPoint,crises,activeRows,resolvedRows});
}
async function sectionA() {
  await freshWorld();
  check('Three camera moves with W',(await move()).distance>3);
  for(const plane of ['upper','nether','mortal']){
    await click(`[data-realm-plane="${plane}"]`);
    check(`direct ${plane} plane`,(await state()).plane===plane);
    await shot(`a-${plane}`);
  }
  await click('[data-realm-plane="upper"]');
  await click('[data-r1-group="nature"]');await click('[data-native-mode="forest"]');await click('#r1NativeArts .r1-arts-close');
  const upperPoint=await js(`const a=inkbox.render3d,r=a.renderer,rect=a.canvas.getBoundingClientRect();
    for(let n=0;n<8;n++)await new Promise(requestAnimationFrame);
    window.__p0DeniedWorld=JSON.stringify((await import('./src/inkbox/io/save.js')).serializeWorld(inkbox.world));
    for(let y=120;y<r.height-80;y+=24)for(let x=120;x<r.width-120;x+=24){if(document.elementFromPoint(x+rect.left,y+rect.top)!==a.canvas)continue;
      const hit=r.pick(x,y);if(hit?.plane==='upper'&&hit.kind==='terrain')return {x:x+rect.left,y:y+rect.top};}throw Error('No visible upper terrain');`);
  await browser.click(upperPoint.x,upperPoint.y);
  const denied=await js(`const e=document.getElementById('inkHint'),r=e.getBoundingClientRect();return {text:e.textContent,visible:getComputedStyle(e).visibility!=='hidden'&&r.width>0&&r.height>0,
    unchanged:window.__p0DeniedWorld===JSON.stringify((await import('./src/inkbox/io/save.js')).serializeWorld(inkbox.world)),active:inkbox.render3d.active,plane:inkbox.render3d.renderer.activePlane};`);
  check('unsupported realm power is visibly rejected without World mutation',denied.visible&&/凡间|凡界/.test(denied.text)&&denied.unchanged&&denied.active&&denied.plane==='upper',denied);
  await shot('a-visible-rejection');
  await click('#inkBtnSave');if(await js('return !document.getElementById("inkConfirm").hidden;'))await click('#inkConfirmOk');
  check('Three save result is visible to the player',await browser.waitFor('const e=document.getElementById("inkHint");return /已存档/.test(e.textContent)&&getComputedStyle(e).visibility!=="hidden"&&!document.getElementById("inkBtnSave").disabled;',{timeoutMs:15000}));
  await shot('a-visible-save');
  const feedbackEnded=await browser.waitFor('return !inkbox.render3d.readout.hidden&&getComputedStyle(document.getElementById("inkHint")).visibility==="hidden";',{timeoutMs:12000});
  check('Three readout returns after the temporary feedback',feedbackEnded,await js('return {timer:inkbox.toastTimer,text:inkbox.toast,readoutHidden:inkbox.render3d.readout.hidden};'));
  await click('[data-realm-plane="mortal"]');report.steps.push({section:'a-feedback',denied});
}
async function sectionB() {
  // Controlled fixture changes only initial terrain and source identity. All
  // subsequent water edits below are player pointer actions via formal tools.
  await freshWorld(20261025);
  const fixture=await js(`const s=inkbox,w=s.world,cx=Math.floor(w.w/2),cy=Math.floor(w.h/2);
    const {recomputeAll}=await import('./src/inkbox/world/terrain.js');
    for(let y=cy-45;y<=cy+45;y++)for(let x=cx-45;x<=cx+45;x++){
      const i=w.idx(x,y);w.height[i]=.68;w.water[i]=0;w.riverBase[i]=0;w.veg[i]=0;w.fire[i]=0;
    }
    for(let y=cy-5;y<=cy+5;y++)for(let x=cx-20;x<=cx-11;x++){
      const i=w.idx(x,y);w.height[i]=.48;w.water[i]=.12;
    }
    for(let y=cy-5;y<=cy+5;y++)for(let x=cx+11;x<=cx+20;x++)w.height[w.idx(x,y)]=.75;
    recomputeAll(w);s.dirty=true;s.render3d.renderer.markTerrainDirty({x0:cx-46,y0:cy-46,x1:cx+46,y1:cy+46});
    return {cx,cy,source:[cx-12,cy],connected:[cx-10,cy],dry:[cx,cy+14],slope:[cx+15,cy]};`);
  report.fixture=fixture;
  async function pickCell(cell) {
    return js(`const a=inkbox.render3d,r=a.renderer,cell=${JSON.stringify(cell)};
      r.focusOn(cell[0]+.5,cell[1]+.5,{duration:.01},'mortal');
      r.cameraRig.camera.zoom=6;r.cameraRig.camera.updateProjectionMatrix();
      for(let frame=0;frame<8;frame++)await new Promise(requestAnimationFrame);
      const target=r.cameraRig.controls.target;r.cameraRig.camera.position.set(target.x+15,target.y+300,target.z+20);r.cameraRig.controls.update();
      for(let frame=0;frame<4;frame++)await new Promise(requestAnimationFrame);
      const s=r.stages.get('mortal'),p=r.coordinates.worldToRender(cell[0]+.5,cell[1]+.5,s.elevation.at(cell[0]+.5,cell[1]+.5));
      const v=new (await import('three')).Vector3(p.x,p.y,p.z).project(r.cameraRig.camera),rect=a.canvas.getBoundingClientRect();
      const x=(v.x+1)*r.width/2,y=(1-v.y)*r.height/2;
      for(let dy=-18;dy<=18;dy+=6)for(let dx=-18;dx<=18;dx+=6){const px=x+dx,py=y+dy;
        if(document.elementFromPoint(px+rect.left,py+rect.top)!==a.canvas)continue;
        const h=r.pick(px,py);if(h?.plane==='mortal'&&h.kind==='terrain'&&Math.abs(h.x-cell[0])<=2&&Math.abs(h.y-cell[1])<=2)
          return {x:px+rect.left,y:py+rect.top,cell:[h.x,h.y]};}
      throw Error('Controlled fixture terrain cannot be pointer-picked');`);
  }
  const connected=await pickCell(fixture.connected);await tool('terrain','lower');
  await js('const e=document.querySelector(\'[aria-label="笔刷强度"]\');e.value="0.12";e.dispatchEvent(new Event("input",{bubbles:true}));return true;');
  await shot('b-connected-before');await browser.mouseMove(connected.x,connected.y);await browser.mouseDown(connected.x,connected.y);await sleep(140);await browser.mouseUp(connected.x,connected.y);
  await sleep(500);await shot('b-connected-after');
  const wet=await js(`const w=inkbox.world,i=w.idx(${connected.cell[0]},${connected.cell[1]});return {height:w.height[i],water:w.water[i]};`);
  check('connected excavation receives finite source water',wet.water>0,wet);
  const dry=await pickCell(fixture.dry);await shot('b-dry-before');
  await browser.mouseMove(dry.x,dry.y);await browser.mouseDown(dry.x,dry.y);await sleep(140);await browser.mouseUp(dry.x,dry.y);
  await sleep(500);await shot('b-dry-after');
  const dryWater=await js(`const w=inkbox.world;return w.water[w.idx(${dry.cell[0]},${dry.cell[1]})];`);
  check('isolated excavation stays dry',dryWater<.001,{dryWater});
  const slope=await pickCell(fixture.slope);await tool('water','water');await shot('b-slope-before');
  await js('window.__waterBeforeSlope=inkbox.world.water.slice();return true;');
  await browser.mouseMove(slope.x,slope.y);await browser.mouseDown(slope.x,slope.y);await sleep(130);await browser.mouseUp(slope.x,slope.y);
  await sleep(500);await shot('b-slope-after');
  const water=await js(`const w=inkbox.world;let added=0,outside=0,peak=0;for(let y=${fixture.cy}-12;y<=${fixture.cy}+12;y++)for(let x=${fixture.cx}+6;x<=${fixture.cx}+26;x++){const i=w.idx(x,y),delta=w.water[i]-window.__waterBeforeSlope[i];added+=delta;peak=Math.max(peak,w.water[i]);if(delta>1e-6&&Math.hypot(x-${slope.cell[0]},y-${slope.cell[1]})>6.5)outside++;}return {center:w.water[w.idx(${slope.cell[0]},${slope.cell[1]})],added,outside,peak};`);
  check('slope water spreads outside brush without a persistent column',water.added>0&&water.outside>0&&water.peak<.021,water);
  let floodPoint=await pickCell(fixture.dry);await tool('disaster','flood');
  await browser.click(floodPoint.x,floodPoint.y);await shot('b-flood-rise');
  const flood=await js(`const w=inkbox.world;return {day:w.day,water:w.water[w.idx(${floodPoint.cell[0]},${floodPoint.cell[1]})],events:w.nature?.events.filter(e=>e.kind==='flood').map(e=>({id:e.id,dueDay:e.dueDay}))};`);
  check('flood creates real water',flood.water>dryWater,flood);
  await js('window.__p0WetWorld=inkbox.world;window.__p0WetLayer=inkbox.world.water.slice();window.__p0FloodDates=inkbox.world.nature.events.filter(e=>e.kind==="flood").map(e=>[e.id,e.dueDay]);return true;');
  await click('#inkBtnSave');if(await js('return !document.getElementById("inkConfirm").hidden;'))await click('#inkConfirmOk');
  check('active flood is saved',await browser.waitFor('return /已存档/.test(inkbox.toast)&&!document.getElementById("inkBtnSave").disabled',{timeoutMs:15000}));
  const diskFlood=await js('const {loadFromStorage}=await import("./src/inkbox/io/save.js");const saved=await loadFromStorage(document.getElementById("inkSlotSelect").value||"auto");return {day:saved?.day,dates:saved?.nature.events.filter(e=>e.kind==="flood").map(e=>[e.id,e.dueDay])};');
  check('active flood is present in persisted slot',diskFlood.day===flood.day&&JSON.stringify(diskFlood.dates)===JSON.stringify(await js('return window.__p0FloodDates;')),diskFlood);
  await click('#inkBtnLoad');if(await js('return !document.getElementById("inkConfirm").hidden;'))await click('#inkConfirmOk');
  check('active flood save is actually reloaded',await browser.waitFor('return inkbox.world!==window.__p0WetWorld',{timeoutMs:15000}));
  const wetLoad=await js('let error=0;for(let i=0;i<inkbox.world.size;i++)error=Math.max(error,Math.abs(inkbox.world.water[i]-window.__p0WetLayer[i]));return {error,dates:inkbox.world.nature.events.filter(e=>e.kind==="flood").map(e=>[e.id,e.dueDay]),expected:window.__p0FloodDates};');
  check('all saved water cells and true flood dates survive load',wetLoad.error<=1/65535+1e-7&&JSON.stringify(wetLoad.dates)===JSON.stringify(wetLoad.expected),wetLoad);
  await js('window.__p0RendererWorld=inkbox.world;window.__p0RendererWater=inkbox.world.water.slice();return true;');
  await click('[data-action="toggle"]');
  check('Canvas uses the same loaded World',await js('return !inkbox.render3d.active&&inkbox.world===window.__p0RendererWorld&&inkbox.terrain.world===inkbox.world;'));
  await js(`inkbox.camera.focusOn(${fixture.dry[0]},${fixture.dry[1]},{zoom:8,duration:.01});inkbox.dirty=true;return true;`);
  await sleep(300);await shot('b-active-flood-canvas');
  await click('#r1CanvasView .r1-jue');
  check('Three reuses the same World without changing any water cell',await js('return inkbox.render3d.active&&inkbox.render3d.renderer.world===window.__p0RendererWorld&&inkbox.world.water.every((v,i)=>v===window.__p0RendererWater[i]);'));
  floodPoint=await pickCell(fixture.dry);
  await shot('b-active-flood-three');
  await tool('water','drain');await browser.mouseMove(floodPoint.x,floodPoint.y);
  await browser.mouseDown(floodPoint.x,floodPoint.y);await sleep(130);await browser.mouseUp(floodPoint.x,floodPoint.y);
  const drained=await js(`const w=inkbox.world;return w.water[w.idx(${floodPoint.cell[0]},${floodPoint.cell[1]})];`);
  check('player drain removes part of active flood',drained<flood.water,{flood,drained});
  await shot('b-flood-player-drain');
  await js('inkbox.advanceDays(29);return true;');await shot('b-flood-hold-day29');
  check('flood remains active before its true day 30 expiry',await js('return inkbox.world.day===29&&inkbox.world.nature.events.some(e=>e.kind==="flood"&&e.dueDay===30);'));
  await js('inkbox.advanceDays(1);for(let n=0;n<3;n++)await new Promise(requestAnimationFrame);return true;');
  const recedeFx=await powerStats();
  check('day 30 expiry has a real timed Three recede presentation',recedeFx.active>0&&recedeFx.items.some(i=>i.tool==='water-response'&&i.phase==='recede'),recedeFx);
  check('the true expired flood event is removed',await js('return inkbox.world.day===30&&!inkbox.world.nature.events.some(e=>e.kind==="flood");'));
  await browser.mouseMove(width-25,12);await shot('b-flood-recede');await sleep(300);await shot('b-flood-recede-mid');
  await sleep(1500);await shot('b-flood-receded');
  const receded=await js(`const w=inkbox.world;return {day:w.day,water:w.water[w.idx(${floodPoint.cell[0]},${floodPoint.cell[1]})]};`);
  check('expired flood does not revive player-drained water',receded.water<=drained+.0001,{flood,drained,receded});
  report.steps.push({section:'b',fixture,connected,wet,dry,dryWater,slope,water,flood,wetLoad,drained,receded,recedeFx});
  // Save/load through the visible product controls, then compare actual layer.
  await click('#inkBtnSave');if(await js('return !document.getElementById("inkConfirm").hidden;'))await click('#inkConfirmOk');
  check('save completed',await browser.waitFor('return /已存档/.test(inkbox.toast)&&!document.getElementById("inkBtnSave").disabled',{timeoutMs:15000}));
  const prior=await js(`window.__p0PriorWorld=inkbox.world;window.__p0RecededWater=inkbox.world.water.slice();const w=inkbox.world;
    return {day:w.day,water:w.water[w.idx(${floodPoint.cell[0]},${floodPoint.cell[1]})]};`);
  await click('#inkBtnLoad');if(await js('return !document.getElementById("inkConfirm").hidden;'))await click('#inkConfirmOk');
  check('load replaces world',await browser.waitFor('return inkbox.world!==window.__p0PriorWorld',{timeoutMs:15000}));
  const loaded=await js(`const w=inkbox.world;let error=0;for(let i=0;i<w.size;i++)error=Math.max(error,Math.abs(w.water[i]-window.__p0RecededWater[i]));return {day:w.day,water:w.water[w.idx(${floodPoint.cell[0]},${floodPoint.cell[1]})],error,activeFloods:w.nature.events.filter(e=>e.kind==='flood').length};`);
  // The official save format quantizes water to Uint16 at scale 1/65535.
  check('all receded water cells and day survive save/load within official codec precision',loaded.day===prior.day&&loaded.error<=1/65535+1e-7&&loaded.activeFloods===0,{loaded,receded});
}

try {
  const edge=findEdge();assert(edge,'P0 acceptance requires a real Edge executable');
  browser=await launch({url:process.env.INKBOX_URL||'http://127.0.0.1:4223/inkbox.html?renderer=3d',width,height,gpu:true,browser:edge});
  check('actual Edge Three boot',await browser.waitFor('return !!inkbox.render3d?.renderer?.world',{timeoutMs:45000}));
  if(await js('return !!document.querySelector(\'[data-action="continue"]\')?.getBoundingClientRect().width;'))await click('[data-action="continue"]');
  report.environment=await js('return {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],seed:inkbox.world.seed};');
  for(const section of requested) {
    try {if(section==='a')await sectionA();if(section==='b')await sectionB();if(section==='c')await sectionC();if(section==='d')await sectionD();}
    catch(error){report.failures.push({section,error:error.stack});try{await shot(`${section}-failure`);}catch{}}
  }
  report.errors=browser.errors();
  report.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error')
    .map(e=>e.params.args.map(a=>a.value||a.description).join(' '));
  report.pass=report.failures.length===0&&report.errors.length===0&&report.consoleErrors.length===0;
  if(!report.pass)process.exitCode=1;
} catch(error) {
  report.failures.push({section:'boot',error:error.stack});report.errors=browser?.errors()||[];process.exitCode=1;
} finally {
  if(browser)report.cleanup=await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,failures:report.failures,errors:report.errors,consoleErrors:report.consoleErrors,out}));
}

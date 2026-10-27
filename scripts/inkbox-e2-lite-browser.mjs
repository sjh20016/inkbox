#!/usr/bin/env node
// Product controls and real Edge pointer input. Time alone is accelerated through
// Sandbox.advanceDays; no people, villages, outcomes or journal records are forged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launch, findEdge, sleep } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4243);
const base = process.env.INKBOX_URL || 'http://127.0.0.1:' + port;
const out = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/local/e2-lite/browser'));
const report = { checks: [], pass: false, browserPath: 'Browser plugin not available; existing repository Edge/CDP workflow',
  limitations: ['Functional software rasterization; no GPU performance claim.',
    'Elapsed years use the unchanged formal advanceDays path; elapsed wall-clock waiting is accelerated.'] };
let server, browser;
const page = code => browser.js('return (async()=>{' + code + '})();', { timeoutMs: 90000 });
async function click(selector) {
  const p = await page('let e=document.querySelector(' + JSON.stringify(selector) + ');if(!e||e.disabled)throw Error("Unavailable control: "+' + JSON.stringify(selector) + ');e.scrollIntoView({block:"nearest"});await new Promise(requestAnimationFrame);e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)throw Error("Control changed: "+' + JSON.stringify(selector) + ');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};');
  assert(p.w > 0 && p.h > 0, 'visible control ' + selector);
  await browser.click(p.x, p.y);
}
async function openDetails(selector) {
  if (!await page('return document.querySelector(' + JSON.stringify(selector) + ').open;')) await click(selector + ' > summary');
  assert(await browser.waitFor('return !!document.querySelector(' + JSON.stringify(selector) + ')?.open;'), 'opened detail ' + selector);
}
async function check(name, run) {
  report.phase = name; const evidence = await run();
  report.checks.push({ name, pass: true, evidence }); console.log('PASS ' + name);
}
async function tool(id, group, three) {
  if (three) {
    await page('const e=document.querySelector(\'#inkRender3DTools select[aria-label="沙盘工具"]\');e.value=' + JSON.stringify(id) + ';e.dispatchEvent(new Event("change",{bubbles:true}));if(inkbox.render3d.mode!==' + JSON.stringify(id) + ')throw Error("Tool selection failed: "+inkbox.render3d.mode);return true;');
  } else {
    await click('[data-group="' + group + '"]'); await click('[data-tool="' + id + '"]');
  }
}
async function focusPoint(expression, three) {
  await page('const k=inkbox,p=' + expression + ';k.camera.focusOn(p.x,p.y,{zoom:9,duration:.1});return true;');
  await sleep(600);
  return page('const k=inkbox,p=' + expression + ';if(' + three + '){const v=k.render3d.projectSettlementAnchor(p),r=k.render3d.canvas.parentElement.getBoundingClientRect();if(!v.visible)throw Error("Target outside camera");return {x:r.x+v.x,y:r.y+v.y};}const i=k.world.idx(Math.floor(p.x),Math.floor(p.y)),v=k.camera.tileScreen(p.x,p.y,k.world.height[i]),r=k.canvas.getBoundingClientRect();return {x:r.x+v[0],y:r.y+v[1]};');
}
async function closeCards() {
  for (const selector of ['#inkInspectClose', '#inkPersonDetail [data-g1-action="close"]']) {
    if (await page('const e=document.querySelector(' + JSON.stringify(selector) + ');return !!e&&e.getClientRects().length>0;')) await click(selector);
  }
}
try {
  fs.mkdirSync(out, { recursive: true });
  if (!process.env.INKBOX_URL) {
    server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let n = 0; n < 80; n++) {
      if (server.exitCode !== null) throw Error('Owned server exited ' + server.exitCode);
      try { if ((await fetch(base + '/inkbox.html')).ok) { ready = true; break; } } catch {}
      await sleep(150);
    }
    assert(ready, 'owned server ready');
  }
  const modes = process.env.INKBOX_RENDERER === '3d' ? [true] : process.env.INKBOX_RENDERER === 'canvas' ? [false] : [false, true];
  for (const three of modes) {
    const label = three ? 'Three 1280×720' : 'Canvas 1366×768';
    browser = await launch({ browser: findEdge(), url: base + '/inkbox.html' + (three ? '?renderer=3d' : ''),
      width: three ? 1280 : 1366, height: three ? 720 : 768, gpu: false });
    assert(await browser.waitFor('return !!window.inkbox?.creationMenu && !!window.inkbox?.journal', { timeoutMs: 45000 }));
    if (three) assert(await browser.waitFor('return !!inkbox.render3d?.active', { timeoutMs: 45000 }));
    await check(label + ' first screen and native creation', async () => {
      await click('[data-action="open-create"]');
      await page('const f=document.querySelector(".g2-creation__page:not([hidden]) form");f.querySelector(\'input[aria-label="世界种子"]\').value="20260914";const s=f.querySelectorAll("select");s[0].value="small";s[1].value="standard";f.querySelector(\'input[type="checkbox"]\').checked=false;return true;');
      await click('.g2-creation__page:not([hidden]) button[type="submit"]');
      if (await page('return inkbox.qol.confirmOpen();')) await click('#inkConfirmOk');
      assert(await browser.waitFor('return inkbox.world.seed===20260914 && inkbox.world.w===200'));
      await click('#inkSpeedBar [data-speed="0"]');
      assert(await page('return inkbox.speedIndex===0;'), 'native pause is effective');
      return page('return {url:location.href,title:document.title,viewport:[innerWidth,innerHeight],seed:inkbox.world.seed,content:document.body.innerText.length,overlay:!!document.querySelector("vite-error-overlay"),journal:!!document.querySelector("#inkJournalTitle")};');
    });
    await check(label + ' natural village, native watch and settlement vow', async () => {
      const initial = await page('const k=inkbox;for(let i=0;i<3600&&!k.world.villages.some(v=>v.pop>0&&v.hp>0);i++)k.advanceDays(3);const v=k.world.villages.find(v=>v.pop>0&&v.hp>0);if(!v)throw Error("No natural village in thirty years");window.__e2Village=v.id;k.updateHud();k.observeEcho.refresh();return {id:v.id,name:v.name,day:k.world.day,pop:v.pop};');
      await openDetails('#inkJournal'); await openDetails('#inkJournalEchoDetail');
      await openDetails('#inkObserveEcho details');
      await click('#inkObserveEcho [data-e0-action="locate"][data-id="' + initial.id + '"]');
      await click('#inkInspect [data-e0-action="watch"]');
      assert(await browser.waitFor('return inkbox.world.observeEcho?.focus?.settlementId===' + initial.id));
      await click('#inkInspect .journal-card-actions button');
      assert(await browser.waitFor('return inkbox.world.journal?.vows.active.length===1;'), 'settlement vow click committed');
      const vows = await page('return inkbox.world.journal.vows.active;');
      assert.equal(vows.length, 1); assert.equal(vows[0].ref.id, initial.id);
      await closeCards();
      return { initial, vow: vows[0] };
    });
    await check(label + ' native root, actual subject revisit and person vow', async () => {
      await tool('root', 'dao', three);
      const target = await page('const e=inkbox.world.entities.find(e=>e.sp==="human"&&!e.level&&e.hp>0&&e.age>=18*360)||inkbox.world.entities.find(e=>e.sp==="human"&&!e.level&&e.hp>0);if(!e)throw Error("No eligible real mortal");window.__e2RootTarget=e.id;return {id:e.id,x:e.x,y:e.y};');
      let p = await focusPoint('inkbox.world.entities.find(e=>e.id===window.__e2RootTarget)', three);
      if (three) {
        const canvas = await page('const c=inkbox.render3d.canvas,r=c.getBoundingClientRect();for(const [fx,fy] of [[.5,.2],[.85,.2],[.7,.35]]){const x=r.x+r.width*fx,y=r.y+r.height*fy;if(document.elementFromPoint(x,y)===c)return {x,y};}throw Error("No unobstructed zoom point");');
        for (let i = 0; i < 3; i++) await browser.wheel(canvas.x, canvas.y, -600);
        p = await page('const a=inkbox.render3d,e=inkbox.world.entities.find(e=>e.id===window.__e2RootTarget),p=a.projectSettlementAnchor(e),r=a.canvas.parentElement.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};');
        await tool('root', 'dao', true);
        await sleep(1200);
        const picked = await page('const k=inkbox,a=k.render3d,host=a.renderer,camera=host.cameraRig.camera,rect=a.canvas.getBoundingClientRect(),meshes=[];host.stages.get("mortal").entities.group.traverse(m=>{if(m.isInstancedMesh&&m.visible&&m.userData.renderEntities?.length)meshes.push(m);});let probes=0;for(const mesh of meshes){mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;for(let i=0;i<Math.min(mesh.count,mesh.userData.renderEntities.length);i++){const item=mesh.userData.renderEntities[i],e=k.world.entities.find(e=>e.id===item?.id&&e.sp==="human"&&!e.level&&e.hp>0);if(!e)continue;const matrix=mesh.matrixWorld.clone();mesh.getMatrixAt(i,matrix);for(const fraction of [.5,.25,.75]){const p=box.getCenter(camera.position.clone());p.y=box.min.y+(box.max.y-box.min.y)*fraction;p.applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld).project(camera);if(p.z< -1||p.z>1)continue;const x=rect.x+(p.x+1)*rect.width/2,y=rect.y+(1-p.y)*rect.height/2;if(document.elementFromPoint(x,y)!==a.canvas)continue;const h=a.hit({clientX:x,clientY:y});probes++;if(h?.kind==="entity"&&h.entityId===e.id){window.__e2RootTarget=e.id;return {point:{x,y},hit:{kind:h.kind,id:h.entityId},probeCount:probes,mode:a.mode,tool:k.toolId};}}}}return {point:null,probeCount:probes,meshes:meshes.length,mode:a.mode,tool:k.toolId};');
        report.rootPick = picked;
        assert(picked.point, 'real Three entity ray hit: ' + JSON.stringify(picked));
        p = picked.point;
      }
      await browser.mouseMove(p.x, p.y); await sleep(300); await browser.click(p.x, p.y);
      const receipt = await page('const k=inkbox,r=k.world.journal.receipts.filter(r=>r.kind==="root").at(-1);if(!r)throw Error("Root click did not create a real receipt: "+JSON.stringify({mode:k.render3d?.mode,tool:k.toolId,impact:k.lastToolImpact,message:document.querySelector("#inkToast")?.textContent,selected:k.render3d?.selectedCell}));window.__e2RootReceipt=r.id;return r;');
      assert(receipt.changedPeople > 0); await openDetails('#inkJournal');
      await openDetails('#inkJournalContent [data-journal-detail="receipt-' + receipt.id + '"]');
      await click('#inkJournalContent [data-journal-detail="receipt-' + receipt.id + '"] [data-journal-action="target"][data-id="' + receipt.id + ':1"]');
      await click('#inkPersonDetail .journal-card-actions button');
      if (await page('const e=document.querySelector(\'#inkPersonDetail [data-g1-action="watch"]\');return !!e&&!e.disabled;')) await click('#inkPersonDetail [data-g1-action="watch"]');
      const active = await page('return inkbox.world.journal.vows.active;');
      assert.equal(active.length, 2); assert(active.some(v => v.kind === 'breakthrough'));
      await closeCards(); return { target, receipt, active };
    });
    await check(label + ' native crisis and exactly one burn receipt for a whole drag', async () => {
      await tool('crisis', 'disaster', three);
      let p = await focusPoint('inkbox.world.villageById(window.__e2Village)', three);
      if (three) {
        await tool('crisis', 'disaster', true); await sleep(800);
        p = await page('const k=inkbox,a=k.render3d,v=k.world.villageById(window.__e2Village),p=a.projectSettlementAnchor(v),r=a.canvas.parentElement.getBoundingClientRect();for(const dy of [30,45,60,-40,0])for(const dx of [0,25,-25,45,-45]){const x=r.x+p.x+dx,y=r.y+p.y+dy;if(document.elementFromPoint(x,y)!==a.canvas)continue;const h=a.hit({clientX:x,clientY:y});if(h?.plane==="mortal"&&h.world&&Math.hypot(h.world.x-v.x,h.world.y-v.y)<12&&!a.editReason(h))return {x,y};}throw Error("No unoccluded crisis ground near the original village");');
      }
      await browser.click(p.x, p.y);
      const crisis = await page('const r=inkbox.world.journal.receipts.find(r=>r.kind==="crisis");if(!r)throw Error("No real crisis receipt");return r;');
      await tool('burn', 'nature', three);
      await page('const w=inkbox.world,v=w.villageById(window.__e2Village);let point;for(let y=Math.max(3,Math.floor(v.y)-20);y<Math.min(w.h-4,v.y+20)&&!point;y++)for(let x=Math.max(3,Math.floor(v.x)-20);x<Math.min(w.w-4,v.x+20);x++){if(w.veg[w.idx(x,y)]>.6&&w.height[w.idx(x,y)]>.3){point={x,y};break;}}if(!point)throw Error("No actual forest nearby");window.__e2Forest=point;return true;');
      p = await focusPoint('window.__e2Forest', three);
      if (three) await tool('burn', 'nature', true);
      const before = await page('return inkbox.world.journal.receipts.length;');
      await browser.mouseMove(p.x, p.y); await browser.mouseDown(p.x, p.y);
      for (let i = 1; i <= 6; i++) { await browser.mouseMove(p.x + i * 4, p.y + i); await sleep(90); }
      await browser.mouseUp(p.x + 24, p.y + 6); await sleep(250);
      const r = await page('return inkbox.world.journal.receipts.at(-1);');
      assert.equal(await page('return inkbox.world.journal.receipts.length;'), before + 1);
      assert.equal(r.kind, 'burn'); assert(r.changedCells > 0);
      await openDetails('#inkJournalContent [data-journal-detail="receipt-' + r.id + '"]');
      if (!three) await browser.screenshot(path.join(out, 'receipt-canvas-1366.png'));
      return { crisis, burn: r };
    });
    await check(label + ' real decade, event outcome and native persistence', async () => {
      const outcome = await page('const k=inkbox,v=k.world.journal.vows.active.find(v=>v.kind==="settlement"),due=v.dueDay;while(k.world.day<due+3)k.advanceDays(Math.min(3,due+3-k.world.day));k.syncWorldInfo();k.refreshNotables();k.refreshMilestones();k.journal.refresh();return {day:k.world.day,journal:k.world.journal,crises:k.world.worldEventState.history.filter(e=>e.byPlayer)};');
      assert(outcome.journal.vows.archive.some(v => v.kind === 'settlement' && v.status !== 'active'));
      assert(outcome.crises.length > 0, 'formal crisis has an actual outcome');
      await page('const e=document.querySelector("#inkSlotSelect");e.value="slot1";e.dispatchEvent(new Event("change",{bubbles:true}));return true;');
      const expected = await page('return JSON.stringify(inkbox.world.journal);');
      await click('#inkBtnSave');
      assert(await browser.waitFor('return !inkbox.qol.isBusy("inkBtnSave")', { timeoutMs: 15000 }));
      await page('inkbox.qol.resetDirty();window.__e2BeforeLoad=inkbox.world;return true;');
      await click('#inkBtnLoad');
      assert(await browser.waitFor('return !inkbox.qol.isBusy("inkBtnLoad")&&inkbox.world!==window.__e2BeforeLoad', { timeoutMs: 15000 }));
      assert.equal(await page('return JSON.stringify(inkbox.world.journal);'), expected);
      await page('await inkbox.autoSave();const io=await import("./src/inkbox/io/save.js"),w=await io.loadFromStorage("auto");return JSON.stringify(w.journal);').then(value => assert.equal(value, expected));
      await openDetails('#inkJournal'); await openDetails('#inkJournalContent [data-journal-detail="archive"]');
      if (three) await browser.screenshot(path.join(out, 'vows-three-1280.png'));
      const endedVow = outcome.journal.vows.archive.find(v => v.kind === 'settlement');
      await click('#inkJournalContent [data-journal-action="vow-locate"][data-id="' + endedVow.id + '"]');
      assert(await page('return document.querySelector("#inkInspect").classList.contains("on");'), 'archived vow returns to the original settlement or ruin');
      await closeCards();
      return outcome;
    });
    await check(label + ' invalid journal import preserves current session; closed panel and world reset', async () => {
      const result = await page('const k=inkbox,io=await import("./src/inkbox/io/save.js"),bad=io.serializeWorld(k.world);bad.journal.v=99;window.__e2BeforeBad=k.world;k.qol.resetDirty();const input=document.querySelector("#inkImportFile"),dt=new DataTransfer();dt.items.add(new File([JSON.stringify(bad)],"bad-journal.json",{type:"application/json"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));return true;');
      assert(result); assert(await browser.waitFor('return !inkbox.qol.isBusy("inkBtnImport")'));
      assert(await page('return inkbox.world===window.__e2BeforeBad;'));
      if (await page('return document.querySelector("#inkJournal").open;')) await click('#inkJournalTitle');
      assert(await page('const html=document.querySelector("#inkJournalContent").innerHTML;inkbox.advanceDays(3);inkbox.journal.refresh(false);return html===document.querySelector("#inkJournalContent").innerHTML;'));
      await page('inkbox.newWorld("small",62028,{progressive:false});inkbox.setSpeed(0);return true;');
      await openDetails('#inkJournal');
      const final = await page('return {empty:!inkbox.world.journal,text:document.querySelector("#inkJournalContent").innerText,overflow:document.documentElement.scrollWidth>innerWidth+1,overlay:!!document.querySelector("vite-error-overlay")};');
      assert(final.empty && final.text.includes('尚无笔录') && !final.overflow && !final.overlay);
      return final;
    });
    const errors = browser.errors(); report.checks.push({ name: label + ' console', pass: errors.length === 0, errors });
    assert.deepEqual(errors, []); report[label] = browser.meta; await browser.close(); browser = null;
  }
  report.pass = true;
} catch (error) { report.error = error.stack; if (browser) await browser.screenshot(path.join(out, 'failure.png')).catch(() => {}); process.exitCode = 1; }
finally {
  if (browser) { report.errors = browser.errors(); await browser.close(); report.cleanup = browser.meta; }
  server?.kill(); report.finishedAt = new Date().toISOString();
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, process.env.INKBOX_RENDERER ? 'acceptance-' + process.env.INKBOX_RENDERER + '.json' : 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, phase: report.phase, error: report.error, output: out }));
}

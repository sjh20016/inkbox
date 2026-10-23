// Optional C1 gameplay acceptance. Start npm run dev separately; this script
// owns only an isolated Edge profile and advances the real simulation clocks.
// Prepare the paired saves with profile:c1 -- --supply-only first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const out = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/c1/browser');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pass: false, limitations: [
  'Accelerated life uses official advanceWorld in <=3-day increments, not wall-clock waiting for eighteen years.',
  'The targeted root blessing calls the formal divine function; this is not a pointer-precision test.',
] };
let browser;
const check = (name, value) => { report.checks.push({ name, passed: !!value }); assert.ok(value, name); };
async function click(selector) {
  const r = await browser.js(`const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('missing control');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};`);
  assert.ok(r.w > 0 && r.h > 0, `visible control: ${selector}`);
  await browser.click(r.x, r.y);
}
async function card() {
  return browser.js(`inkbox.showPersonCard(window.__c1ChildId);inkbox.dirty=true;return {text:document.querySelector('.g1-character')?.innerText,person:(()=>{const e=inkbox.world.entities.find(e=>e.id===window.__c1ChildId);return e?{id:e.id,name:e.name,age:e.age,lifespan:e.lifespan,level:e.level,village:e.village,parentA:e.parentA,parentB:e.parentB,birthOrigin:e.birthOrigin}:null;})()};`);
}
try {
  browser = await launch({ url: process.env.INKBOX_URL || 'http://127.0.0.1:4207/inkbox.html', width: 1366, height: 768, gpu: true });
  check('game boots in actual Edge', await browser.waitFor('return !!window.inkbox?.world', { timeoutMs: 45000 }));
  report.environment = await browser.js('return {userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]};');
  await click('[data-action="open-create"]');
  await browser.js(`const form=document.querySelector('.g2-creation__page:not([hidden]) form');
    form.querySelector('input[aria-label="世界种子"]').value='61001';
    const selects=form.querySelectorAll('select');selects[0].value='small';selects[1].value='standard';
    form.querySelector('input[type="checkbox"]').checked=false;return true;`);
  await click('.g2-creation__page:not([hidden]) button[type="submit"]');
  if (await browser.js('return inkbox.qol.confirmOpen();')) await click('#inkConfirmOk');
  check('creation UI opens requested real small world', await browser.waitFor('return inkbox.world.seed===61001 && inkbox.world.w===200'));
  await browser.js(`return (async()=>{inkbox.setSpeed(0);window.__c1Advance=await import('./src/inkbox/sim/advance.js');return true;})();`);
  report.birth = await browser.js(`const s=inkbox;const step=days=>window.__c1Advance.advanceWorld(s.world,days,{life:s.life,upperLife:s.upperLife,state:s.advanceState});
    let child;for(let i=0;i<1200&&!child;i++){step(3);child=s.world.entities.find(e=>e.birthOrigin?.kind==='village'&&e.level===0&&e.age===0);}
    if(!child)throw Error('no natural newborn in ten years');window.__c1ChildId=child.id;
    s.syncWorldInfo();s.refreshFolds();s.dirty=true;return {day:s.world.day,id:child.id,age:child.age,level:child.level,lifespan:child.lifespan,origin:child.birthOrigin,parentA:child.parentA,parentB:child.parentB};`, { timeoutMs: 60000 });
  check('natural newborn has real parents, age zero and mortal lifespan', report.birth.age === 0 && report.birth.level === 0
    && report.birth.parentA && report.birth.parentB && report.birth.lifespan >= 60 * 360 && report.birth.lifespan <= 65 * 360);
  report.newbornCard = await card();
  await browser.screenshot(path.join(out, 'natural-newborn.png'));
  report.boundary = await browser.js(`return (async()=>{const s=inkbox;const target=18*360-1;
    while(true){const e=s.world.entities.find(e=>e.id===window.__c1ChildId);if(!e)throw Error('tracked newborn died before adulthood');if(e.age>=target)break;
      window.__c1Advance.advanceWorld(s.world,Math.min(3,target-e.age),{life:s.life,upperLife:s.upperLife,state:s.advanceState});}
    const d=await import('./src/inkbox/core/demographics.js');const e=s.world.entities.find(e=>e.id===window.__c1ChildId);
    const before={age:e.age,adult:d.isAdult(e),lifespan:e.lifespan,level:e.level};
    window.__c1Advance.advanceWorld(s.world,1,{life:s.life,upperLife:s.upperLife,state:s.advanceState});
    s.syncWorldInfo();s.dirty=true;return {before,after:{age:e.age,adult:d.isAdult(e),lifespan:e.lifespan,level:e.level}};})();`, { timeoutMs: 60000 });
  check('same naturally born person becomes adult exactly at eighteen', report.boundary.before.age === 18 * 360 - 1
    && !report.boundary.before.adult && report.boundary.after.age === 18 * 360 && report.boundary.after.adult);
  report.adultCard = await card();
  check('actual character card shows adulthood and current longevity', /成年（满十八岁）/.test(report.adultCard.text) && /寿元上限/.test(report.adultCard.text));
  await browser.screenshot(path.join(out, 'natural-eighteen.png'));
  report.blessing = await browser.js(`return (async()=>{const s=inkbox,e=s.world.entities.find(e=>e.id===window.__c1ChildId);const before={age:e.age,lifespan:e.lifespan,level:e.level};
    const {grantRoot}=await import('./src/inkbox/sim/divine.js');const text=grantRoot(s.world,e.x,e.y,0.001,s.rng);s.dirty=true;
    return {before,text,after:{id:e.id,age:e.age,lifespan:e.lifespan,level:e.level}};})();`);
  check('real root blessing trains the same person and extends life without resetting age', report.blessing.after.level === 1
    && report.blessing.after.id === report.birth.id && report.blessing.after.age === report.blessing.before.age
    && report.blessing.after.lifespan > report.blessing.before.lifespan);
  report.trainedCard = await card();
  await browser.screenshot(path.join(out, 'real-entry-longevity.png'));
  await browser.js(`inkbox.hidePersonCard();const select=document.getElementById('inkSlotSelect');select.value='1';select.dispatchEvent(new Event('change'));return true;`);
  await click('#inkBtnSave');
  check('actual storage button writes a save', await browser.waitFor(`return localStorage.getItem('inkbox_sandbox_v1_1')!==null || /已存档/.test(document.body.innerText);`, { timeoutMs: 15000 }));
  await click('#inkBtnLoad');
  if (await browser.js('return inkbox.qol.confirmOpen();')) await click('#inkConfirmOk');
  check('actual load button replaces the world and finishes', await browser.waitFor('return /已读取/.test(document.body.innerText)', { timeoutMs: 15000 }));
  report.loadedCard = await card();
  assert.deepEqual(report.loadedCard.person, report.trainedCard.person);
  check('age, lifespan, level, parents and origin survive browser save/load', report.loadedCard.person.id === report.birth.id);
  await browser.screenshot(path.join(out, 'loaded-character.png'));
  report.supplyCases = {};
  for (const key of ['worked', 'noLabor']) {
    const file = path.resolve(process.env.INKBOX_PROFILE_DIR || 'reports/local/c1/profile-final', `supply-${key}-final-world.json`);
    assert.ok(fs.existsSync(file), 'prepare --supply-only profile before browser acceptance');
    await browser.js(`inkbox.hidePersonCard();inkbox.setSpeed(0);window.__c1PriorWorld=inkbox.world;return true;`);
    const doc = await browser.cdp.send('DOM.getDocument', { depth: 0 });
    const input = await browser.cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#inkImportFile' });
    await browser.cdp.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
    check(`real ${key} experiment imports via game file input`, await browser.waitFor('return inkbox.world!==window.__c1PriorWorld && inkbox.world.seed===61005 && inkbox.world.day===5400'));
    report.supplyCases[key] = await browser.js(`const s=inkbox;s.setSpeed(0);s.updateHud();
      const v=s.world.villages[0];if(v)s.inspectPlaneSubject('mortal',{kind:'settlement',settlementId:v.id});
      const sect=s.world.factions[0];return {villageText:document.getElementById('inkInspect').innerText,
        sectText:document.querySelector('.faction[data-faction-id="'+sect.id+'"]')?.innerText,
        members:s.world.entities.filter(e=>e.faction===sect.id&&e.level>0&&e.hp>0).length,
        provisions:sect.resources.provisions,economy:sect.economy};`);
    check(`${key} sect UI reflects real practitioners and current food ledger`,
      report.supplyCases[key].sectText.includes(`${report.supplyCases[key].members} 修士`)
      && /粮草\/日 入/.test(report.supplyCases[key].sectText)
      && (key === 'worked' ? /地方可供养后继/.test(report.supplyCases[key].sectText) : /地方断供/.test(report.supplyCases[key].sectText)));
    if (key === 'worked') check('real village card separates mortals, practitioners and adult labor', /凡人/.test(report.supplyCases[key].villageText)
      && /成年劳力/.test(report.supplyCases[key].villageText) && /粮食余缺/.test(report.supplyCases[key].villageText));
    await click('#r1VolumeTab-shi');
    await browser.screenshot(path.join(out, `supply-${key}-canvas.png`));
  }
  const rendererButton = await browser.js(`const e=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='立体沙盘'&&e.getBoundingClientRect().width);if(!e)throw Error('3D toggle absent');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await browser.click(rendererButton.x, rendererButton.y);
  check('same cutoff world renders in Three', await browser.waitFor('return inkbox.render3d?.renderer?.world===inkbox.world', { timeoutMs: 45000 }));
  report.gpu = await browser.js(`const r=inkbox.render3d.renderer,g=r.gpu.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);`);
  await browser.screenshot(path.join(out, 'supply-cutoff-three.png'));
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 800, deviceScaleFactor: 1, mobile: false });
  check('cutoff facts remain available at narrow viewport', await browser.waitFor(`return innerWidth===720 && [...document.querySelectorAll('.faction')].some(e=>/地方断供/.test(e.innerText));`));
  await browser.screenshot(path.join(out, 'supply-cutoff-three-narrow.png'));
  report.errors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map(e => e.params.args.map(a => a.value || a.description).join(' '));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  if (browser) report.cleanup = await browser.close();
  if (report.failure) fs.writeFileSync(path.join(out, `failed-${Date.now()}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, 'gameplay.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, checks: report.checks, failure: report.failure, out }));
}

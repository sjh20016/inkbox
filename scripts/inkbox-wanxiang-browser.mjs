#!/usr/bin/env node
// 万象拾趣 V0.1 · 玩家验收（真实游戏入口 + 真实导入 + 真实点击检视）
//
// 流程：
//   1. Node 侧用正式模拟（generateWorld → advanceWorld）无干预推进一个自然世界，
//      直到「地上确有无主法宝」且「确有孤立遗址」（≤ 240 年），把事实坐标与
//      年份记录下来，并经真实 serializeWorld 写出导入档。
//   2. 起正式服务器（scripts/inkbox-server.mjs），开真实 inkbox.html，
//      走页面自己的 #inkImportFile 导入这条玩家路径载入存档。
//   3. 用真实 CDP 鼠标点击画布上的遗物格 / 遗址格，断言检视卡里读得到
//      「无主之物 + 遗落线索」与「遗址 + 原归属宗门（+ 同宗故城链）」，
//      并做一次再次回访。全程截图存 reports/local/wanxiang/browser。
//
// 运行：node scripts/inkbox-wanxiang-browser.mjs（本机 Edge/Chrome，无 GPU 依赖）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld } from '../src/inkbox/io/save.js';
import { canAccess } from '../src/inkbox/core/mapAccess.js';
import { ownerLine, GROUND_DECAY_YEARS } from '../src/inkbox/sim/artifacts.js';
import { lostEntries } from '../src/inkbox/sim/relicRumors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INKBOX_PORT || 4209);
const base = `http://127.0.0.1:${port}`;
const output = path.join(root, 'reports/local/wanxiang/browser');
fs.mkdirSync(output, { recursive: true });
const url = new URL('inkbox.html', base + '/');
const report = { startedAt: new Date().toISOString(), purpose: 'wanxiang v0.1 player acceptance',
  gpuPerformanceClaim: false, checks: [], screenshots: [], pass: false };
let server;
let browser;
const page = body => browser.js(`return (async () => { ${body} })();`, { timeoutMs: 45000 });
const check = async (name, fn) => {
  report.phase = name;
  const evidence = await fn();
  report.checks.push({ name, pass: true, evidence });
  console.log('PASS ' + name);
  return evidence;
};
async function screenshot(name) {
  const file = await browser.screenshot(path.join(output, name + '.png'), { timeoutMs: 30000 });
  report.screenshots.push(file);
  return file;
}

// ── 1. 自然世界与导入档 ─────────────────────────────────────
function buildNaturalWorld() {
  const world = generateWorld({ preset: WORLD_PRESETS.small, seed: 90125, scatter: true });
  const life = new Life(world, mulberry32(world.seed ^ 0x99));
  const state = createAdvanceState();
  const maxYears = 240;
  const pick = () => {
    // 空格判据：附近没有活人——点在人身上会优先开人物卡（g1 拾取半径 19px，
    // 留 2.5 格余量），这是应用本来的优先级，不是缺陷；目标格必须真是空的。
    const emptyAt = (x, y) => !world.entities.some(e => e && e.hp > 0
      && Math.hypot(e.x - x, e.y - y) < 2.5);
    // 地上带「遗落」履历的无主法宝；必须落在已开放的空格内（否则检视会拒绝）
    const grounded = (world.artifacts || []).filter(a => a.lostDay >= 0
      && Array.isArray(a.history) && a.history.some(h => h[1] === 'lost')
      && canAccess(world, Math.floor(a.x), Math.floor(a.y))
      && emptyAt(a.x, a.y));
    // 孤立遗址：4 格内没有活村（否则检视优先给活村卡），已开放且格上无人
    const ruins = (world.settlementRuins || []).filter(r => Number.isFinite(r.x) && Number.isFinite(r.y)
      && canAccess(world, Math.floor(r.x), Math.floor(r.y))
      && !world.villages.some(v => Math.hypot(v.x - r.x, v.y - r.y) < 4)
      && emptyAt(r.x, r.y));
    return { grounded, ruins };
  };
  let sample = pick();
  while ((!sample.grounded.length || !sample.ruins.length) && world.day < maxYears * 360) {
    for (let m = 0; m < 12; m += 1) {
      advanceWorld(world, 30, { life, state, riftActive: false, nether: false });
    }
    sample = pick();
  }
  const artifact = sample.grounded[0] || null;
  const ruin = sample.ruins[0] || null;
  // 仙历年份 1 起算（与游戏面板 / 检视卡同口径）
  return { world, artifact, ruin, years: Math.floor(world.day / 360) + 1 };
}

try {
  const { world, artifact, ruin, years } = buildNaturalWorld();
  assert.ok(artifact, '自然世界必须有无主法宝（含遗落履历）——样本期 ' + years + ' 年内为 0，请如实报告');
  assert.ok(ruin, '自然世界必须有孤立遗址——样本期 ' + years + ' 年内为 0，请如实报告');
  const facts = {
    seed: world.seed,
    years,
    day: Math.floor(world.day),
    artifact: {
      id: artifact.id, name: artifact.name, x: Math.floor(artifact.x), y: Math.floor(artifact.y),
      lostYear: Math.floor(artifact.lostDay / 360) + 1,
      owners: ownerLine(artifact).count,
      nearDecay: (world.day - artifact.lostDay) >= GROUND_DECAY_YEARS * 360 * 0.7,
    },
    ruin: {
      id: ruin.id, name: ruin.name, x: Math.floor(ruin.x), y: Math.floor(ruin.y),
      faction: ruin.lastFactionName || null, destroyedYear: Math.floor((ruin.destroyedDay || 0) / 360) + 1,
      sameSectSiblings: (world.settlementRuins || []).filter(r => r.id !== ruin.id
        && r.lastFactionId && r.lastFactionId === ruin.lastFactionId).length,
    },
  };
  report.naturalFacts = facts;
  console.log(`自然样本：seed ${facts.seed} · ${years} 年 · 法宝「${facts.artifact.name}」@(${facts.artifact.x},${facts.artifact.y}) 遗落于第${facts.artifact.lostYear}年 · 遗址「${facts.ruin.name}」@(${facts.ruin.x},${facts.ruin.y})`);

  const savePath = path.join(output, 'wanxiang-natural-save.json');
  fs.writeFileSync(savePath, JSON.stringify(serializeWorld(world)));

  // ── 2. 起服务器、开页面、走真实导入 ───────────────────────
  server = spawn(process.execPath, ['scripts/inkbox-server.mjs', '--port', String(port)],
    { cwd: root, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 80; i += 1) {
    if (server.exitCode !== null) throw new Error('Server exited: ' + server.exitCode);
    try { if ((await fetch(url)).ok) break; } catch {}
    await sleep(150);
  }
  browser = await launch({ url: url.href, headless: true, gpu: false });
  await browser.waitFor('return Boolean(window.inkbox && window.inkbox.world)', { timeoutMs: 30000 });

  await check('玩家路径导入：走页面自己的 #inkImportFile 载入自然存档', async () => {
    // 先停表：验收只看一张静态世界的卡面，不让模拟在背后把法宝捡走
    await page('window.inkbox.setSpeed(0); window.inkbox.qol.markPersisted(); return true;');
    const dom = await browser.cdp.send('DOM.getDocument', { depth: 0 });
    const input = await browser.cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#inkImportFile' });
    await browser.cdp.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [savePath] });
    try {
      await browser.waitFor(`return window.inkbox.world && window.inkbox.world.seed === ${facts.seed}`, { timeoutMs: 15000 });
    } catch {
      // 个别环境 change 事件偶发丢失：按玩家同样路径（导入按钮 → 文件输入）再试一次
      await page(`document.getElementById('inkBtnImport').click(); return true;`);
      await sleep(400);
      const dom2 = await browser.cdp.send('DOM.getDocument', { depth: 0 });
      const input2 = await browser.cdp.send('DOM.querySelector', { nodeId: dom2.root.nodeId, selector: '#inkImportFile' });
      await browser.cdp.send('DOM.setFileInputFiles', { nodeId: input2.nodeId, files: [savePath] });
      await browser.waitFor(`return window.inkbox.world && window.inkbox.world.seed === ${facts.seed}`, { timeoutMs: 15000 });
    }
    // 玩家从创世菜单点「继续游戏」回到山河。
    // ⚠️ 菜单的 close() 会恢复它打开时的档位（开机默认 ×2）——
    // 所以关掉之后要再停一次表，别让模拟把法宝捡走。
    await page(`const btn=[...document.querySelectorAll('#inkCreationMenu button')]
      .find(b => b.textContent.includes('继续游戏')); if (btn) btn.click();
      window.inkbox.setSpeed(0);
      return {closed: document.getElementById('inkCreationMenu').classList.contains('on') === false,
        speed: window.inkbox.speedIndex};`);
    await sleep(300);
    const now = await page(`return {day: Math.floor(window.inkbox.world.day/360)+1,
      ruins: (window.inkbox.world.settlementRuins||[]).length,
      ground: (window.inkbox.world.artifacts||[]).length,
      speed: window.inkbox.speedIndex};`);
    assert.equal(now.day, facts.years, '导入后的世界年份应与自然样本一致');
    assert.ok(now.ground >= 1, `导入后地上应有法宝（实测 ${now.ground}）`);
    await screenshot('01-imported-world');
    return { importedSeed: facts.seed, ...now };
  });

  const clickTile = async (tx, ty) => {
    // 上一张检视卡若还开着会挡住点击点——玩家也会先把它关掉
    await page(`const x=document.querySelector('#inkInspectClose'); if (x) x.click(); return true;`);
    // 先把镜头移到目标格（玩家也会这么做），等两帧让投影跟上，再点它的屏幕位置。
    // ⚠️ `camera.pick` 用 Math.round 取整：点格心 (tx+0.5) 会被进位到 tx+1，
    // 所以落点取 tx+0.38——四舍五入后仍是本格。
    await page(`const k=window.inkbox;
      k.camera.focusOn(${tx} + 0.38, ${ty} + 0.38, {zoom: Math.max(k.camera.zoom, 7), duration: 0});
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {zoom: k.camera.zoom};`);
    const point = await page(`const k=window.inkbox,
      {UnitsLayer}=await import('./src/inkbox/render/unitsLayer.js'),
      i=k.world.idx(${tx},${ty}),
      p=UnitsLayer.project(k.camera, ${tx} + 0.38, ${ty} + 0.38, k.world.height[i]||0),
      rect=k.canvas.getBoundingClientRect();
      return {x: rect.left + p[0], y: rect.top + p[1]};`);
    await browser.click(point.x, point.y);
    await sleep(250);
    return point;
  };
  const panelText = () => page(`const el=document.querySelector('#inkInspect');
    return {on: el.classList.contains('on'), text: el.textContent};`);

  await check('P1 遗物线索：点开无主之物，读得到遗落之年与地点', async () => {
    await clickTile(facts.artifact.x, facts.artifact.y);
    const panel = await panelText();
    assert.ok(panel.on, '检视卡应打开');
    assert.ok(panel.text.includes('无主之物'), `应有「无主之物」行：${panel.text.slice(0, 200)}`);
    assert.ok(panel.text.includes('遗落于'), `应有「遗落于」线索：${panel.text.slice(0, 300)}`);
    assert.ok(panel.text.includes(`第${facts.artifact.lostYear}年`), `线索应带真实遗落年份（第${facts.artifact.lostYear}年）`);
    await screenshot('02-ground-artifact-clue');
    return { head: panel.text.slice(0, 80), lostYear: facts.artifact.lostYear };
  });

  await check('P1 再次回访：同一格再点一次，线索稳定复现（不漂移）', async () => {
    const first = (await panelText()).text;
    await clickTile(facts.artifact.x, facts.artifact.y);
    const second = (await panelText()).text;
    assert.equal(first, second, '两次检视的卡面应逐字一致（纯派生，无随机）');
    await screenshot('03-revisit-artifact');
    return { stable: true };
  });

  await check('P2 故城旧事：点开遗址，读得到从何而来、曾属何宗', async () => {
    await clickTile(facts.ruin.x, facts.ruin.y);
    const panel = await panelText();
    assert.ok(panel.on, '检视卡应打开');
    assert.ok(panel.text.includes('遗址'), `应为遗址卡：${panel.text.slice(0, 120)}`);
    assert.ok(panel.text.includes('原归属宗门'), `应见「原归属宗门」：${panel.text.slice(0, 200)}`);
    if (facts.ruin.faction) assert.ok(panel.text.includes(facts.ruin.faction), `应点名旧主 ${facts.ruin.faction}`);
    await screenshot('04-ruin-card');
    return { ruin: facts.ruin.name, faction: facts.ruin.faction };
  });

  await check('P2 同宗故城链：旧址按钮可点，走完一跳再回原址', async () => {
    const link = await page(`const btns=[...document.querySelectorAll('[data-inspect-ruin]')];
      return {count: btns.length, label: btns[0] ? btns[0].textContent : null};`);
    report.sameSectSiblings = facts.ruin.sameSectSiblings;
    if (!link.count) {
      console.log(`     该遗址没有同宗故城（样本事实：同宗废墟 ${facts.ruin.sameSectSiblings} 处）——只验原址卡，不编链`);
      return { skipped: true, siblings: facts.ruin.sameSectSiblings };
    }
    await page(`document.querySelector('[data-inspect-ruin]').click();return true;`);
    await sleep(200);
    const next = await panelText();
    assert.ok(next.on && next.text.includes('遗址'), `应跳到下一座故城：${next.text.slice(0, 120)}`);
    await screenshot('05-ruin-chain-hop');
    // 回访：点回原遗址
    await clickTile(facts.ruin.x, facts.ruin.y);
    const back = await panelText();
    assert.ok(back.text.includes(facts.ruin.name), `应回到原遗址 ${facts.ruin.name}：${back.text.slice(0, 120)}`);
    await screenshot('06-ruin-revisit');
    return { hopped: link.label, back: true };
  });

  report.runtimeErrors = browser.errors();
  report.consoleErrors = browser.cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled'
    && e.params.type === 'error').map(e => e.params.args.map(a => a.value || a.description || '').join(' '));
  assert.deepEqual(report.runtimeErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
  console.log('万象拾趣 V0.1 玩家验收：全部通过');
} catch (error) {
  report.pass = false;
  report.error = String(error && error.stack ? error.stack : error);
  console.error('FAIL', report.error);
} finally {
  try { if (browser) await browser.close(); } catch {}
  if (server && server.exitCode === null) server.kill();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
process.exit(report.pass ? 0 : 1);

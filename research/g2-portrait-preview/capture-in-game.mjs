#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer as createHttpServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch, sleep} from '../../scripts/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'inkbox-face-in-game.png');
let serverProcess = null;
let browser = null;

async function unusedPort() {
  const probe = createHttpServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const {port} = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* wait for the local static server */ }
    await sleep(150);
  }
  throw new Error(`游戏静态服务器未启动：${url}`);
}

try {
  const port = await unusedPort();
  serverProcess = spawn(process.execPath, ['scripts/inkbox-server.mjs', `--port=${port}`], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true,
  });
  const url = `http://127.0.0.1:${port}/inkbox.html`;
  await waitForServer(url);
  browser = await launch({url, width: 1600, height: 1000});
  assert.ok(await browser.waitFor('return !!(window.inkbox?.world && window.inkbox?.life)', {timeoutMs: 30000}),
    '游戏必须启动并挂载真实沙盒');

  const sample = await browser.js(`
    const game = window.inkbox;
    game.newWorld('small', 20261009);
    game.setSpeed(0);
    const world = game.world;
    let spot = null;
    for (let y = 0; y < world.h && !spot; y += 1) {
      for (let x = 0; x < world.w; x += 1) {
        if (world.isWalkable(y * world.w + x)) { spot = [x, y]; break; }
      }
    }
    if (!spot || !game.life.spawn(spot[0] + .5, spot[1] + .5, 'cultivator', 1, 0)) {
      throw new Error('无法在截图用小世界里放置修士');
    }
    const person = [...world.entities].reverse().find((entity) => entity.sp === 'cultivator');
    if (!person) throw new Error('测试修士没有生成');
    game.showPersonCard(person.id);
    return {id: person.id, name: person.name, seed: world.seed};
  `);
  assert.ok(sample?.id != null, '游戏中的修士人物卡必须可以打开');
  assert.ok(await browser.waitFor(`return !!document.querySelector('#inkPersonDetail .g2-portrait-v2__svg g[data-slot="eyes"]')`,
    {timeoutMs: 10000}), '人物卡应显示新版 G2-P 面相图层');
  await sleep(1300);

  const rendered = await browser.js(`
    const card = document.getElementById('inkPersonDetail');
    const svg = card.querySelector('.g2-portrait-v2__svg');
    const portrait = card.querySelector('.person-portrait-mount');
    return {
      visible: card.classList.contains('on'),
      label: card.querySelector('.inspect-head')?.textContent?.trim(),
      portraitSize: Math.round(portrait.getBoundingClientRect().width),
      svgViewBox: svg.getAttribute('viewBox'),
      slots: [...svg.querySelectorAll('g[data-slot]')].map((node) => node.dataset.slot),
      portraitAlt: svg.getAttribute('aria-label'),
    };
  `);
  assert.ok(rendered.visible, '人物卡必须在游戏界面中可见');
  assert.equal(rendered.svgViewBox, '0 0 100 100', 'G2-P 正方逻辑坐标必须保持');
  for (const slot of ['face', 'eyes', 'brows', 'nose', 'mouth', 'frontHair', 'backHair', 'robe']) {
    assert.ok(rendered.slots.includes(slot), `游戏中缺少面相槽位 ${slot}`);
  }
  assert.equal(rendered.portraitSize, 104, '实际卡片面相显示尺寸应为 104 px');
  await browser.screenshot(OUTPUT);
  const errors = browser.errors();
  assert.deepEqual(errors, [], `游戏页面不得有运行时错误：${errors.join('\n')}`);
  console.log(JSON.stringify({screenshot: OUTPUT, sample, rendered}, null, 2));
} finally {
  if (browser) await browser.close();
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
}

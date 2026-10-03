// 查看器端到端实测：无头 Edge 加载 viewer.html，等全部 GLB 就绪后截图并抓报错。
// 用法： node build/shot_viewer.mjs [port]
import { launch, sleep } from '../../../scripts/cdp.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);                       // 实验建筑资产/
const port = process.argv[2] || '8765';

// 期望件数从 manifest 派生，不手抄数字 —— 资产一多手写的常量必然漂移
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets_manifest.json'), 'utf8'));
const expected = manifest.total_assets;
const url = `http://127.0.0.1:${port}/` + encodeURI('美术素材/实验建筑资产/viewer.html');

const session = await launch({ url, width: 1600, height: 1000 });
try {
  await session.waitFor('return window.__ready === true', { timeoutMs: 40000 });
  await sleep(1500);                                   // 等纹理上传 + 首帧稳定

  const hint = await session.js('return document.getElementById("hint").textContent;');
  const stats = await session.js(`
    let meshes = 0, tris = 0;
    window.__scene.traverse(o => {
      // 只统计资产网格：带图集材质（地面平面只有纯色，无 map）
      if (o.isMesh && o.geometry && o.material && o.material.map) {
        meshes++;
        const g = o.geometry;
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      }
    });
    return { meshes, tris };
  `);

  console.log('hint   :', hint);
  console.log('assets :', stats.meshes, '件 /', stats.tris, '三角形');

  await session.screenshot(path.join(root, '预览', 'viewer_browser.png'));

  // favicon.ico 的 404 是浏览器自动请求，与资产无关，过滤掉
  const errs = session.errors().filter(e => !/favicon/i.test(e));
  console.log('errors :', errs.length ? JSON.stringify(errs, null, 2) : '（无）');
  if (stats.meshes !== expected) {
    console.error('!! manifest 期望 %d 件，实际加载 %d 件', expected, stats.meshes);
    process.exitCode = 1;
  }
  if (errs.length) process.exitCode = 1;
} finally {
  await session.close();
}

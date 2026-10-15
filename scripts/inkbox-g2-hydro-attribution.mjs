#!/usr/bin/env node
// G2-P0.3 阶段 A · 水文与植被归因取证（v2，修正版）。
//
// 与上一版（H1）的三处**实质差别** —— 委托书 §5/§A1/§4 分别点名要求：
//
//  ① 不再自己写简化场景。`setup()` 与 `measure()` 从正式门禁
//     `scripts/inkbox-g2-performance.mjs` 的**文件文本里原样抽取**再求值使用。
//     抽取版与原文逐字节相同（并登记 SHA-256），因此不存在「复制版静默分叉」。
//     （不能直接 import 该文件：它顶层有副作用，import 会跑完整个 12 场景矩阵。）
//  ② 战斗 fixture 走正式 `combatFixtureExpression()` + `scenarioSetup()`，
//     并严格按正式仪器的执行顺序：setup → fixture → scenarioSetup → measure。
//  ③ 水文计数改为**直接存取器拦截 + 算术推导双路**（见 inkbox-g2-hydro-counter.mjs），
//     两路不一致即整次运行 INVALID。
//
// 时间口径按 §4 分离：rawRafIntervalMs（浏览器真实回调间隔，
// 由 `frame(timestamp)` 的原始时间戳取得）· simulationDtMs（真正传入 update 的
// 已截断 dt，`main.js:1923` 截到 0.12）· updateCpuMs · renderCpuMs · frameCpuMs。
// **不得**把 16.7ms 的固定模拟步长当成帧率，也不得把 CPU 耗时叫 GPU 耗时。
//
// 用法：
//   node scripts/inkbox-g2-hydro-attribution.mjs --mode=gate --cases=6            # 门禁环境（Native）
//   node scripts/inkbox-g2-hydro-attribution.mjs --mode=gate --cases=6 --clock=controlled
//   node scripts/inkbox-g2-hydro-attribution.mjs --mode=aa   --cases=6 --arms=off,off,off,off
//   node scripts/inkbox-g2-hydro-attribution.mjs --mode=live --loops=2

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, sleep, findBrowser } from './cdp.mjs';
import { combatFixtureExpression, findCombatRoots } from './inkbox-g2-fixtures.mjs';
import { selectCases, diagnosticCases, scenarioSetup, collectBrowserErrors } from './inkbox-g2pf-config.mjs';
import { readPerformanceSurface, readForegroundEvidence, foregroundEvidenceValid } from './inkbox-g2p0-environment.mjs';
import { inferHydroSteps, crossCheckHydro, hydroAccessorSource, HYDRO_PERIOD_S, HYDRO_MAX_STEPS, HYDRO_EPS } from './inkbox-g2-hydro-counter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reports', 'analysis', 'g2-p03');
const PORT = Number(process.env.INKBOX_H1_PORT || 4241);
const arg = (n, d) => { const hit = process.argv.find(t => t.startsWith(`--${n}=`)); return hit ? hit.slice(n.length + 3) : d; };
const MODE = arg('mode', 'gate');
const CLOCK = arg('clock', 'native');
const CASES = arg('cases', '6').split(',').map(Number);
const LIVE_CASES = arg('live', 'L1,L2').split(',');
const LIVE_ROUNDS = Number(arg('rounds', '2'));
const LIVE_WARM = Number(arg('warm', '120'));
const LIVE_FRAMES = Number(arg('frames', '180'));
const ARMS = arg('arms', MODE === 'aa' ? 'off,off,off,off' : 'off').split(',');
const SURFACE = arg('surface', 'headless');

// ── ① 从正式门禁原样抽取 setup / measure / canonicalStringify 与常数 ──────────
const GATE_FILE = 'scripts/inkbox-g2-performance.mjs';
const gateText = fs.readFileSync(path.join(ROOT, GATE_FILE), 'utf8');
const gateLines = gateText.split(/\r?\n/);

function extractLine(prefix) {
  const line = gateLines.find(l => l.startsWith(prefix));
  if (!line) throw new Error(`无法从 ${GATE_FILE} 抽取以「${prefix}」开头的定义 —— 门禁可能已改动，必须人工复核后同步`);
  return line;
}
function extractBlock(startPrefix, endLine) {
  const start = gateLines.findIndex(l => l.startsWith(startPrefix));
  if (start < 0) throw new Error(`无法从 ${GATE_FILE} 定位「${startPrefix}」`);
  const end = gateLines.indexOf(endLine, start);
  if (end < 0) throw new Error(`无法从 ${GATE_FILE} 定位「${startPrefix}」的结束行`);
  return gateLines.slice(start, end + 1).join('\n');
}

const canonicalSrc = extractLine('function canonicalStringify(');
const setupSrc = extractLine('function setup(c){');
const measureSrc = extractBlock('function measure(enabled,c){return `', '`;}');
const constLine = extractLine('const FRAMES=');
const num = name => { const m = constLine.match(new RegExp(`${name}=([0-9.]+)`)); if (!m) throw new Error(`门禁常数行缺少 ${name}`); return Number(m[1]); };
const GATE_CONST = { FRAMES: num('FRAMES'), WARM: num('WARM'), STEP: num('STEP'), SEED: num('SEED') };

// 求值得到与门禁**逐字节相同**的字符串生成器。
// ⚠️ 不要一个一个往参数表里补标识符（先踩了 SEED 再踩了 DIAGNOSTIC）：
//    把门禁自己的全大写常量行原样取来，用 with(scope) 在同等作用域下求值，
//    这样 `FRAMES/CLOCK/SURFACE/TRACE/DIAGNOSTIC/OUT…` 的值与门禁完全一致。
// 排除含 import.meta 的行（new Function 里不可用）；ROOT 等由 scope 提供
const constLines = gateLines.filter(l => /^const [A-Z][A-Z0-9_]*[=,]/.test(l) && !l.includes('import.meta'));
process.env.INKBOX_PERF_CLOCK = CLOCK;
if (!process.env.INKBOX_PERF_SURFACE) process.env.INKBOX_PERF_SURFACE = SURFACE;
const scope = {
  process, path, fs, vm, crypto, assert, console, performance, URL, JSON, Math, Date, ROOT,
  createHash, execFileSync, fileURLToPath, spawn,
  findCombatRoots, combatFixtureExpression, scenarioSetup,
  selectCases, diagnosticCases, collectBrowserErrors,
  readPerformanceSurface, readForegroundEvidence, foregroundEvidenceValid,
};
const build = new Function('__scope',
  `with(__scope){${constLines.join('\n')}\n${canonicalSrc}\n${setupSrc}\n${measureSrc}\nreturn { setup, measure };}`);
const { setup, measure } = build(scope);
const extractHash = crypto.createHash('sha256').update(canonicalSrc + setupSrc + measureSrc + constLines.join('\n')).digest('hex');

const CASES_SPEC = {
  5: { caseIndex: 5, preset: 'large', renderer: 'canvas', view: 'nether', count: 2 },
  6: { caseIndex: 6, preset: 'expanse', renderer: '3d', view: 'full', count: 2 },
  8: { caseIndex: 8, preset: 'expanse', renderer: '3d', view: 'full', count: 100 },
};
// A7：非暂停场景。preset 非 large ⇒ 512×320（与门禁同一判据）
const LIVE_SPECS = {
  L1: { caseIndex: 'L1', preset: 'expanse', renderer: 'canvas', view: 'full', count: 0 },
  L2: { caseIndex: 'L2', preset: 'expanse', renderer: '3d', view: 'full', count: 0 },
};

// ── ② 探针：只读观测。注入源码里**不能有顶层 return**（普通脚本求值） ─────────
const PROBE = `
window.__h1={frames:[],veg:[],hydro:{stepCalls:0,accumulateWrites:0,otherWrites:[]},errors:[],installed:false,_lastStepCalls:0};
window.__h1.install=function(k){
  if(window.__h1.installed)return;window.__h1.installed=true;
  // ⚠️ 注入的函数引用了模块级常量，**必须一并注入**。gate 模式 paused 恒真、
  //    函数走 early-return 碰不到它们，所以这个 bug 只会在**非暂停**路径炸出来
  //    —— 这正是「必须做正对照」的原因（A7 首次跑就抓到了）。
  const HYDRO_PERIOD_S=${HYDRO_PERIOD_S},HYDRO_MAX_STEPS=${HYDRO_MAX_STEPS},HYDRO_EPS=${HYDRO_EPS};
  const inferHydro=(${inferHydroSteps.toString()});
  window.__h1._acc={before:null,after:null,dt:null,rawInterval:null,lastTs:null,lastRawTs:null};
  try{ ${hydroAccessorSource('k')} }catch(e){window.__h1.errors.push('accessor:'+e.message);}
  const origFrame=k.frame.bind(k);
  k.frame=function(ts){
    const t0=performance.now();
    const rec=window.__h1._rec||{};
    if(window.__h1._frameOpen){ // 上一帧未完（不应发生）
      window.__h1.errors.push('frame-not-closed');
    }
    window.__h1._rec={ts,rawIntervalMs:(window.__h1._lastRawTs===null||window.__h1._lastRawTs===undefined)?null:(ts-window.__h1._lastRawTs)};
    window.__h1._lastRawTs=ts;
    window.__h1._frameOpen=true;
    window.__h1._frameStart=t0;
    // A6：逐帧重置「本帧发生了什么」的直接证据
    window.__h1._lifeStepped=false;window.__h1._fired=null;window.__h1._bridgeLatest=null;
    window.__h1._glFrameBase={calls:window.__h1._glUploads||0,bytes:window.__h1._glBytes||0};
    const out=origFrame(ts);
    window.__h1._frameOpen=false;
    const probe=k.__hydroProbe||window.__h1.__probe;
    const hydro=probe||{stepCalls:0};
    window.__h1.hydro=hydro;
    const before=window.__h1._acc.before, after=window.__h1._acc.after, dt=window.__h1._acc.dt;
    // ⚠️ 注入的函数表达式必须加括号再调用：函数声明后直接跟调用括号不会执行
    const inferred=(before===null||after===null||dt===null)?{steps:null,consistent:false,reason:'no-update'}
      :inferHydro({paused:window.__h1._acc.paused,accumBefore:before,accumAfter:after,dt});
    const directDelta=hydro.stepCalls-(window.__h1._lastStepCalls||0);
    window.__h1._lastStepCalls=hydro.stepCalls;
    const rec2=window.__h1._rec;
    window.__h1.frames.push({
      frameId:rec2.frameNo=(window.__h1._frameNo=(window.__h1._frameNo||0)+1),
      phase:window.__g2PerfPhase||null,
      rawRafIntervalMs:rec2.rawIntervalMs,
      simulationDtMs:dt===null?null:dt*1000,
      paused:window.__h1._acc.paused===undefined?null:window.__h1._acc.paused,
      speedIndex:window.__h1._acc.speedIndex,
      hydroAccumBefore:before,hydroAccumAfter:after,
      hydroDirectCalls:directDelta,
      hydroInferredCalls:inferred.steps,
      hydroCounterConsistent:inferred.consistent&&directDelta===inferred.steps,
      hydroCounterReason:inferred.reason,
      updateCpuMs:window.__h1._acc.updateCpuMs,renderCpuMs:window.__h1._acc.renderCpuMs,
      frameCpuMs:performance.now()-t0,
      worldDay:window.__h1._acc.day,worldRevision:window.__h1._acc.revision,
      vegTrees:window.__h1._vegTrees===undefined?null:window.__h1._vegTrees,
      // ── A6 直接触发证据（非时间相关性）─────────────────────────
      bridge:window.__h1._bridgeLatest,
      lifeStepped:window.__h1._lifeStepped===true,
      fired:window.__h1._fired,
      glUploads:(window.__h1._glUploads||0)-(window.__h1._glFrameBase?window.__h1._glFrameBase.calls:0),
      glBytes:(window.__h1._glBytes||0)-(window.__h1._glFrameBase?window.__h1._glFrameBase.bytes:0),
      vegetationPending:window.__h1._vegPending===true,
      treeClock:window.__h1._treeClock===undefined?null:window.__h1._treeClock,
    });
    return out;
  };
  const origUpdate=k.update.bind(k);
  k.update=function(dt){
    const a=window.__h1._acc;
    a.before=k.hydroAccum;a.paused=(k.speedIndex===0)||!!(k.render3d&&k.render3d.stroke);a.speedIndex=k.speedIndex;
    a.day=k.world?k.world.day:null;a.revision=k.world?k.world.revision:null;
    if(window.__h1.__probe||k.__hydroProbe){(window.__h1.__probe||k.__hydroProbe).lastDt=dt;}
    a.dt=dt;window.__h1._rawDt=dt;
    const t0=performance.now();
    const out=origUpdate(dt);
    a.updateCpuMs=performance.now()-t0;a.after=k.hydroAccum;
    const rr=k.render3d&&k.render3d.renderer,st=rr&&rr.stages?(rr.stages.get(rr.activePlane)||rr.stages.get('mortal')):null;
    window.__h1._vegPending=st?st.vegetationPending:null;
    window.__h1._treeClock=st?st.treeClock:null;
    return out;
  };
  const origRender=k.render.bind(k);
  k.render=function(now){
    const t0=performance.now();
    const out=origRender(now,...Array.prototype.slice.call(arguments,1));
    window.__h1._acc.renderCpuMs=performance.now()-t0;
    return out;
  };
  window.__h1.armA6=function(){
    const out={bridge:false,life:false,gl:false,advance:false};
    // ① 脏通道：WorldRenderBridge.changes() 的返回值即「本帧哪些 TypedArray 真的变了」
    out.bridge=import('./src/inkbox/render3d/WorldRenderBridge.js').then(function(mod){
      const proto=mod.WorldRenderBridge.prototype;
      if(proto.__h1Bridge)return false;proto.__h1Bridge=true;
      const orig=proto.changes;
      proto.changes=function(){
        const res=orig.apply(this,arguments);
        const box=function(r){return r?{x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1,area:(r.x1-r.x0+1)*(r.y1-r.y0+1)}:null;};
        window.__h1._bridgeLatest=res?{height:box(res.height),type:box(res.type),veg:box(res.veg),water:box(res.water)}:null;
        return res;
      };
      return true;
    }).catch(function(e){window.__h1.errors.push('bridge:'+e.message);return false;});
    // ② 生灵进食：Life.prototype.step 是类方法，可安全注入（不碰产品文件）
    out.life=import('./src/inkbox/sim/life.js').then(function(mod){
      const proto=mod.Life.prototype;
      if(proto.__h1Life)return false;proto.__h1Life=true;
      const orig=proto.step;
      proto.step=function(){window.__h1._lifeStepped=true;return orig.apply(this,arguments);};
      return true;
    }).catch(function(e){window.__h1.errors.push('life:'+e.message);return false;});
    // ③ 真正的 GPU 数据提交：拦截 WebGL 缓冲上传，拿真实次数与字节数
    out.gl=(function(){
      const kinds=typeof WebGL2RenderingContext!=='undefined'?[WebGL2RenderingContext]:[];
      if(typeof WebGLRenderingContext!=='undefined')kinds.push(WebGLRenderingContext);
      let patched=false;
      for(const Ctor of kinds){
        if(!Ctor||!Ctor.prototype)continue;
        for(const name of ['bufferSubData','bufferData']){
          const proto=Ctor.prototype;
          if(proto['__h1Gl_'+name])continue;
          try{Object.defineProperty(proto,'__h1Gl_'+name,{value:true,configurable:true});}catch(e){}
          const orig=proto[name];
          if(typeof orig!=='function')continue;
          proto[name]=function(){
            // bufferSubData(target, offset, srcData) → 变体多，逐个判：
            //  · 参数里有 TypedArray/ArrayBufferView ⇒ 用它的 byteLength
            //  · bufferData(target, size, usage) 的 size 是**数字** ⇒ 直接就是字节数
            let bytes=0;
            for(let i=0;i<arguments.length;i++){
              const a=arguments[i];
              if(a&&typeof a.byteLength==='number'){bytes=a.byteLength;break;}
              if(typeof a==='number'&&i>0&&name==='bufferData'){bytes=a;}
            }
            window.__h1._glUploads=(window.__h1._glUploads||0)+1;
            window.__h1._glBytes=(window.__h1._glBytes||0)+bytes;
            window.__h1._glByKind=window.__h1._glByKind||{};
            window.__h1._glByKind[name]=(window.__h1._glByKind[name]||0)+bytes;
            return orig.apply(this,arguments);
          };
          patched=true;
        }
      }
      return patched;
    })();
    // ④ 生态/火势：advanceDays() 的返回值 fired 是产品**自己**的证据
    out.advance=(function(){
      const orig=k.advanceDays.bind(k);
      k.advanceDays=function(){
        const fired=orig.apply(null,arguments);
        if(fired)window.__h1._fired={eco:!!fired.eco,fire:!!fired.fire,upper:!!fired.upper,nether:!!fired.nether,rift:!!fired.rift,wraith:!!fired.wraith,mapProgress:!!fired.mapProgress};
        return fired;
      };
      return true;
    })();
    return Promise.all([out.bridge,out.life]).then(function(){return out;});
  };
  window.__h1.armVeg=function(){
    return import('./src/inkbox/render3d/vegetation/VegetationLayer.js').then(function(mod){
      const proto=mod.VegetationLayer.prototype;
      if(proto.__h1Patched)return false;
      proto.__h1Patched=true;
      const orig=proto.update;
      proto.update=function(){
        const meshes=(this.lodMeshes&&this.lodMeshes.length)?this.lodMeshes:(this.mesh?[this.mesh]:[]);
        const before=meshes.map(function(m){return m&&m.instanceMatrix?m.instanceMatrix.version:null;});
        const out=orig.apply(this,arguments);
        const after=meshes.map(function(m){return m&&m.instanceMatrix?m.instanceMatrix.version:null;});
        const trees=this.trees||[];
        let sig=2166136261;
        for(let i=0;i<trees.length;i++){const t=trees[i];const s=(t.cellIndex!==undefined?t.cellIndex:t.i)+'|'+t.x+'|'+t.y+'|'+t.size+'|'+(t.rotation||t.rot||0);
          for(let j=0;j<s.length;j++){sig^=s.charCodeAt(j);sig=Math.imul(sig,16777619);}}
        window.__h1.veg.push({frameId:window.__h1._frameNo||null,treeCount:trees.length,treeSignature:(sig>>>0),
          versionBefore:before,versionAfter:after,uploaded:before.some(function(v,i){return v!==after[i];}),lodCount:meshes.length});
        window.__h1._vegTrees=trees.length;
        return out;
      };
      return true;
    });
  };
};
return true;`;

// ── ③ 采集 ─────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const EDGE = findBrowser([
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean));
if (!EDGE) { console.error('需要本机 Edge'); process.exit(2); }

const report = {
  generatedAt: new Date().toISOString(), mode: MODE, clock: CLOCK, surface: SURFACE,
  sourceHead: null, productSourceDirty: null,
  gateSourceIdentity: { file: GATE_FILE, extractedSha256: extractHash, constants: GATE_CONST },
  environment: {}, cases: [], invalid: [],
};
const server = spawn(process.execPath, ['scripts/inkbox-server.mjs', `--port=${PORT}`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
await sleep(900);
const browser = await launch({ url: `http://127.0.0.1:${PORT}/inkbox.html`, browser: EDGE, width: 1500, height: 940, gpu: true });
const page = (body, timeoutMs = 300000) => browser.js(`return (async()=>{${body}})();`, { timeoutMs });

/** 建页 → setup → 正式战斗 fixture → scenarioSetup。门禁与 live 共用同一段，避免两套分叉。 */
async function prepare(spec) {
  const url = new URL(`http://127.0.0.1:${PORT}/inkbox.html`);
  if (spec.renderer === '3d') url.searchParams.set('renderer', '3d');
  await browser.cdp.send('Page.navigate', { url: url.toString() });
  await browser.waitFor('return !!window.inkbox?.world');
  if (spec.renderer === '3d') await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.gpu');
  const dimensions = await page(setup(spec));
  const roots = findCombatRoots();
  const fixture = spec.count > 0
    ? await browser.js(combatFixtureExpression({ count: spec.count, roots, seed: GATE_CONST.SEED }), { timeoutMs: 180000 })
    : await page(`window.__g2CombatActors=[];return {count:0,originalEntitiesRetained:true,originalEntityCount:window.inkbox.world.entities.length,seed:window.inkbox.world.seed};`);
  const scenario = await page(scenarioSetup(spec));
  await page('await window.__h1.armA6();await window.__h1.armVeg();window.__h1.frames=[];window.__h1.veg=[];window.__h1._glUploads=0;window.__h1._glBytes=0;window.__h1.__probe=window.inkbox.__hydroProbe;window.inkbox.__hydroProbe.enabled=true;return true;');
  return { dimensions, fixture, scenario };
}

/** 等到探针记录满 count 帧（轮询 CDP，开销远低于逐帧回调）。 */
async function waitFrames(count) {
  for (let i = 0; i < 2400; i += 1) {
    const n = await page('return window.__h1.frames.length;');
    if (n >= count) return n;
    await sleep(100);
  }
  throw new Error(`waitFrames 超时（目标 ${count} 帧）`);
}

/**
 * A7：**非暂停**真实速度。用正式公开入口 setSpeed(2)，**不注入 advanceDays**
 * （委托书明令：不得同时手工注入额外 advanceDays，否则会双倍推进部分模拟系统）。
 */
async function runLive(spec, round, warmFrames, measureFrames) {
  const prep = await prepare(spec);
  const arm = await page(`const k=window.inkbox;k.setSpeed(2);window.__g2PerfPhase='live-warm';window.__h1.frames=[];window.__h1.veg=[];window.__h1._glUploads=0;window.__h1._glBytes=0;if(k.__hydroProbe)k.__hydroProbe.stepMs=[];return {speedIndex:k.speedIndex,paused:k.speedIndex===0};`);
  const warmed = await waitFrames(warmFrames);
  await page(`window.__g2PerfPhase='live-measure';window.__h1.frames=[];window.__h1.veg=[];window.__h1._glUploads=0;window.__h1._glBytes=0;if(window.inkbox.__hydroProbe)window.inkbox.__hydroProbe.stepMs=[];return true;`);
  const measured = await waitFrames(measureFrames);
  const frames = await page('return window.__h1.frames;');
  const veg = await page('return window.__h1.veg;');
  const probe = await page('const p=window.inkbox.__hydroProbe;return {stepCalls:p.stepCalls,accumulateWrites:p.accumulateWrites,otherCount:p.otherWrites.length,stepMs:p.stepMs.slice(),errors:window.__h1.errors.slice(0,10)};');
  await page('window.inkbox.setSpeed(0);return window.inkbox.speedIndex;');
  return { case: spec, arm: 'live', round, warmFrames: warmed, measureFrames: measured, ...prep, frames, veg, probe };
}

async function runCase(spec, arm) {
  // 正式顺序：setup → fixture → scenarioSetup → measure（与 live 共用 prepare，避免两套分叉）
  const { dimensions, fixture, scenario } = await prepare(spec);
  if (!report.environment.gpu) report.environment.gpu = await page(`const k=window.inkbox;const r=k&&k.render3d&&k.render3d.renderer;const gl=r&&r.gpu?r.gpu.getContext():null;if(!gl)return {renderer:'(no-webgl)'};const e=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio};`);
  const metrics = await page(measure(arm === 'on', spec));
  const frames = await page('return window.__h1.frames;');
  const veg = await page('return window.__h1.veg;');
  const probe = await page('const p=window.inkbox.__hydroProbe;return {stepCalls:p.stepCalls,accumulateWrites:p.accumulateWrites,otherWrites:p.otherWrites.slice(0,20),otherCount:p.otherWrites.length,errors:window.__h1.errors.slice(0,10)};');
  return { case: spec, arm, dimensions, fixture, scenario, metrics, frames, veg, probe };
}

/** 逐帧双路复算 + 登记。门禁与 live 共用，保证结论口径一致。 */
function finalizeRun(run, label) {
  const rows = run.frames.map(f => {
    const inferred = inferHydroSteps({
      paused: f.paused === true,
      accumBefore: f.hydroAccumBefore,
      accumAfter: f.hydroAccumAfter,
      dt: f.simulationDtMs === null ? NaN : f.simulationDtMs / 1000,
    });
    return { ...f, inferredRecalc: inferred, crossOk: crossCheckHydro({ directSteps: f.hydroDirectCalls, inferred }).ok };
  });
  const inconsistent = rows.filter(r => !r.crossOk);
  run.recalc = {
    frames: rows.length,
    inconsistentFrames: inconsistent.length,
    firstInconsistent: inconsistent[0] || null,
    hydroDirectTotal: rows.reduce((a, r) => a + (r.hydroDirectCalls || 0), 0),
    hydroInferredTotal: rows.reduce((a, r) => a + (r.inferredRecalc.steps || 0), 0),
    probeOtherWrites: run.probe.otherCount,
    pausedFrames: rows.filter(r => r.paused === true).length,
  };
  delete run.frames; run.rows = rows;
  report.cases.push(run);
  if (inconsistent.length) report.invalid.push({ label, reason: 'hydro-counter-inconsistent', frames: inconsistent.length });
  console.log(`${label}: frames=${rows.length} hydroDirect=${run.recalc.hydroDirectTotal} hydroInferred=${run.recalc.hydroInferredTotal} inconsistent=${inconsistent.length} vegUpdates=${(run.veg || []).length}`);
  return run;
}

try {
  const { execFileSync } = await import('node:child_process');
  report.sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  report.productSourceDirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'inkbox.html'], { cwd: ROOT, encoding: 'utf8' }).trim();
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 2, mobile: false });
  await browser.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(window,'inkbox',{configurable:true,set(k){Object.defineProperty(window,'inkbox',{configurable:true,writable:true,value:k});k.speedIndex=0;try{window.__h1.install(k);}catch(e){window.__h1.errors.push('install:'+e.message);}}});" + PROBE.replace(/\nreturn true;$/, ''),
  });
  if (MODE === 'live') {
    for (const name of LIVE_CASES) {
      const spec = LIVE_SPECS[name];
      if (!spec) { console.error(`未知 live 场景 ${name}`); continue; }
      for (let round = 0; round < LIVE_ROUNDS; round += 1) {
        finalizeRun(await runLive(spec, round, LIVE_WARM, LIVE_FRAMES), `${name} round${round}`);
      }
    }
  } else {
    for (const index of CASES) {
      const spec = CASES_SPEC[index];
      if (!spec) { console.error(`未知 case ${index}`); continue; }
      for (const arm of ARMS) finalizeRun(await runCase(spec, arm), `case ${index} arm=${arm}`);
    }
  }
  report.summary = { ok: report.invalid.length === 0, invalid: report.invalid.length };
} catch (error) {
  report.summary = { ok: false, error: String(error), browserErrors: browser.errors().slice(0, 8) };
  console.error(error);
} finally {
  const file = MODE === 'live'
    ? `attribution-live-${LIVE_CASES.join('-')}-${CLOCK}.json`
    : `attribution-${MODE}-cases${CASES.join('-')}-${CLOCK}.json`;
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(report, null, 2) + '\n');
  console.log(`written reports/analysis/g2-p03/${file}`);
  await browser.close().catch(() => {});
  server.kill();
}
if (!report.summary?.ok) process.exitCode = 1;

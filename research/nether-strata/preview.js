import { World } from '/src/inkbox/world/World.js';
import { WORLD_PRESETS } from '/src/inkbox/core/config.js';
import { generateNetherLandscape } from '/src/inkbox/world/netherLandscape.js';
import { generateNetherStrataCandidate, getNetherStrataMetadata, NETHER_STRATA_VERSION } from '/src/inkbox/world/netherStrataCandidate.js';
import { Render3DHost } from '/src/inkbox/render3d/Render3DHost.js';
import { SHANHAI_OPTIONS } from '/src/inkbox/render3d/shanhai/ShanhaiStyle.js';
import { MOUSE } from 'three';

const $ = id => document.getElementById(id), canvas = $('scene');
const state = { world: null, host: null, frames: [], revision: 0, landmark: 'whole', distance: 'whole', disposed: false };
const query = new URLSearchParams(location.search);
for (const [param, id] of [['seed','seed'],['size','size'],['version','version'],['ink','inkStyle']]) {
  if (query.has(param)) $(id).value = query.get(param);
}
if (query.get('cliffs') === 'off') $('cliffs').checked = false;
const looks={
  legacy:{tone:'legacy',soulfire:'off',cliffInk:'off',lowMist:false},
  tone:{tone:'inkflame',soulfire:'off',cliffInk:'off',lowMist:false},
  static:{tone:'inkflame',soulfire:'static',cliffInk:'off',lowMist:true},
  inkflame:{tone:'inkflame',soulfire:'flow',cliffInk:'full',lowMist:true},
};
let last = 0, hudAt = 0, raf;
const status = text => { $('status').textContent = text; };
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  state.host?.resize(Math.max(1, r.width), Math.max(1, r.height));
}
const observer = new ResizeObserver(resize); observer.observe(canvas.parentElement);

function applyToggles() {
  const stage = state.host?.stages.get('nether'); if (!stage) return;
  SHANHAI_OPTIONS.nether = $('inkStyle').value; SHANHAI_OPTIONS.lines = 'on';
  state.host.setArtProfile('shanhai-v1');
  state.host.setSceneryEnabled($('ecology').checked);
  stage.setNetherStrataEnabled($('cliffs').checked);
  const options={tone:$('tone').value,soulfire:$('soulfire').value,cliffInk:$('cliffInk').value,lowMist:$('lowMist').checked};
  stage.setNetherInkflame(options);
  const foot=stage.netherInkflame?.field.foot;
  if(foot)state.points=[...state.points.filter(p=>p.kind!=='foot'),foot];
  state.look=Object.keys(looks).find(k=>JSON.stringify(looks[k])===JSON.stringify(options))||'custom';
  document.querySelectorAll('[data-look]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.look===state.look)));
  $('toneLegend').textContent=options.tone==='inkflame'?'上层浓墨 / 中层灰断 / 下层白焰':'骨白台面 / 灰墨断崖 / 深渊积墨';
  state.frames = [];
}
function applyLook(look) {
  const options=looks[look];if(!options)return;
  for(const id of ['tone','soulfire','cliffInk'])$(id).value=options[id];
  $('lowMist').checked=options.lowMist;
  applyToggles();
}
function regenerate({ preserveCamera = false } = {}) {
  const seed = Number($('seed').value), preset = WORLD_PRESETS[$('size').value];
  if (!$('seed').value.trim() || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !preset) {
    status('请输入 0 至 4294967295 的整数种子，并选择画幅。'); return false;
  }
  const candidate = $('version').value === 'strata';
  const world = (candidate ? generateNetherStrataCandidate : generateNetherLandscape)({ preset, seed });
  const oldRig = state.host?.cameraRig;
  const camera = preserveCamera && oldRig ? { position: oldRig.camera.position.clone(), target: oldRig.controls.target.clone(), zoom: oldRig.camera.zoom } : null;
  state.host?.dispose();
  // Same Host/Stage and realm ownership as the D-N1 lab; no second renderer or simulation.
  const root = new World(world.w, world.h, seed); root.plane = 'mortal'; root.nether = world;
  state.world = world; state.metadata = candidate ? getNetherStrataMetadata(world) : null;
  state.host = new Render3DHost(canvas, root, { artProfile: 'shanhai-v1', characters: false, creatures: false, decorations: false,
    productionAssets: true, geography: true, lodEnabled: true });
  state.host.setActivePlane('nether'); state.revision++; state.frames = [];
  // The product delegates right-drag to its controller; this read-only lab
  // uses the existing OrbitControls pan instead of that editing controller.
  state.host.cameraRig.controls.mouseButtons.RIGHT = MOUSE.PAN;
  state.points = [...(state.metadata?.landmarks || baselinePoints(world))];
  const abyss=state.points.find(p=>p.kind==='abyss');
  state.points.push({kind:'foot',x:abyss.x,y:Math.min(world.h-8,abyss.y+12),label:'崖脚阴焰'});
  resize(); applyToggles(); view('whole');
  if (camera) {
    const rig = state.host.cameraRig; rig.cancelFocus(); rig.camera.position.copy(camera.position);
    rig.controls.target.copy(camera.target); rig.camera.zoom = camera.zoom;
    rig.camera.updateProjectionMatrix(); rig.controls.update();
  }
  $('sceneLabel').textContent = candidate ? '十八重墨骨地脉' : 'D-N1 · 墨骨山河';
  const familyLabels = { 'fault-cross': '断崖横列', 'rift-long': '裂谷纵贯', 'staggered': '台地错落' };
  $('composition').textContent = `${preset.label} / 种子 ${seed} / ${candidate ? familyLabels[state.metadata?.family] || state.metadata?.family || NETHER_STRATA_VERSION : 'dn1-candidate-1'}`;
  status(`${candidate ? '叠狱候选' : 'D-N1 对照'}已展开。三处巡境取自本卷真实地形。`);
  return true;
}
function baselinePoints(world) {
  const result = {}, scores = {};
  for (let y = 6; y < world.h - 6; y += 2) for (let x = 6; x < world.w - 6; x += 2) {
    const i = y * world.w + x;
    const slope = Math.abs(world.height[i+1]-world.height[i-1]) + Math.abs(world.height[i+world.w]-world.height[i-world.w]);
    const values = { plateau: world.height[i] - slope, cliff: slope, abyss: -world.height[i] + (world.water[i] > .0015 ? .1 : 0) };
    for (const kind of Object.keys(values)) if (!(kind in scores) || values[kind] > scores[kind]) {
      scores[kind] = values[kind]; result[kind] = { kind, x, y, label: { plateau:'高地对照',cliff:'陡坡对照',abyss:'河谷对照' }[kind] };
    }
  }
  return Object.values(result);
}
function setDistance(distance) {
  state.distance = distance;
  const rig = state.host.cameraRig;
  const zoom = { whole: 1.18, middle: 2.8, close: 5.7 }[distance] || 1.18;
  rig.scenic(distance === 'whole' ? 0 : distance === 'middle' ? 1 : 2);
  if (state.landmark === 'abyss' && distance !== 'whole') {
    const offset = rig.camera.position.clone().sub(rig.controls.target), length = offset.length();
    const yaw = Math.atan2(offset.x,offset.z), polar = .50;
    rig.camera.position.set(rig.controls.target.x+Math.sin(yaw)*Math.sin(polar)*length,
      rig.controls.target.y+Math.cos(polar)*length,rig.controls.target.z+Math.cos(yaw)*Math.sin(polar)*length);
    rig.controls.update();
  }
  rig.camera.zoom = state.landmark === 'abyss' && distance === 'close' ? 4.0 : zoom;
  rig.camera.updateProjectionMatrix();
  if (state.landmark !== 'whole') {
    const p = state.points.find(p => p.kind === state.landmark);
    if (p) state.host.focusOn(p.x, p.y, { duration: .18 }, 'nether');
  }
  document.querySelectorAll('[data-distance]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.distance === distance)));
}
function view(kind) {
  state.landmark = kind;
  if (kind === 'whole') { state.host.cameraRig.fit(); setDistance('whole'); return; }
  const p = state.points.find(p => p.kind === kind);
  if (!p) { status('此卷未找到该地貌样点。'); return; }
  setDistance('middle');
  status(`${p.label} · 格 ${p.x}, ${p.y}。可选近察，或中键旋转观察断面。`);
}
const percentile = (a, p) => [...a].sort((x,y) => x-y)[Math.min(a.length-1,Math.floor(a.length*p))] || 0;
function metrics() {
  const host = state.host; if (!host) return { disposed: state.disposed };
  const stage = host.stages.get('nether'), info = host.gpu.info;
  return { seed: Number($('seed').value), worldSeed: state.world.seed, version: $('version').value, candidateVersion: NETHER_STRATA_VERSION,
    family: state.metadata?.family || 'dn1', size: [state.world.w,state.world.h], day: state.world.day,
    style: $('inkStyle').value, cliffsEnabled: $('cliffs').checked, frames: state.frames.length,
    updateP95: percentile(state.frames.map(f=>f.update),.95), submitP95: percentile(state.frames.map(f=>f.submit),.95),
    rafP95: percentile(state.frames.map(f=>f.raf),.95), over50: state.frames.filter(f=>f.raf>50).length,
    draws: info.render.calls, triangles: info.render.triangles, memory: {...info.memory},
    cliffs: stage.netherCliffs?.stats || null, lines: stage.terrainLines?.stats, river: stage.netherRiver?.stats,
    look:state.look,inkflame:stage.inkflameOptions,soulfire:stage.netherInkflame?.stats||null,
    camera: { zoom:host.cameraRig.camera.zoom, position:host.cameraRig.camera.position.toArray(), target:host.cameraRig.controls.target.toArray() } };
}
function frame(now) {
  if (state.disposed) return;
  const interval = last ? now-last : 0, dt = state.renderDtOverride ?? (last ? Math.min(.1,interval/1000) : .016); last = now;
  const host = state.host;
  if (host) {
    const start = performance.now(); host.update(dt);
    host.stages.get('nether').setNetherInkflameTime(state.effectTimeOverride??host.shanhai.time);
    const updated = performance.now(); host.render();
    state.frames.push({raf:interval,update:updated-start,submit:performance.now()-updated});
    if (state.frames.length>300) state.frames.shift();
    if (now-hudAt>500) {
      hudAt = now; const m = metrics();
      $('stats').textContent = `${m.size.join('×')} · 第 ${m.day} 日（未推进）\n更新 CPU P95 ${m.updateP95.toFixed(2)} ms\n提交 CPU P95 ${m.submitP95.toFixed(2)} ms\nRAF P95 ${m.rafP95.toFixed(1)} ms\n${m.draws} draws / ${m.triangles} 三角形\n崖壁 ${m.cliffs?.triangles || 0} 三角形\n魂焰 ${m.soulfire?.instances||0} / 24 薄片\n几何 ${m.memory.geometries} / 纹理 ${m.memory.textures}\n>50ms 间隔 ${m.over50}`;
    }
  }
  raf = requestAnimationFrame(frame);
}
function dispose() {
  if (state.disposed) return;
  state.disposed = true; cancelAnimationFrame(raf); observer.disconnect(); state.host?.dispose(); state.host = null;
}
$('generate').addEventListener('submit',e=>{e.preventDefault();regenerate();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
document.querySelectorAll('[data-distance]').forEach(b=>b.addEventListener('click',()=>setDistance(b.dataset.distance)));
for (const id of ['inkStyle','cliffs','ecology']) $(id).addEventListener('change',applyToggles);
for(const id of ['tone','soulfire','cliffInk','lowMist'])$(id).addEventListener('change',applyToggles);
document.querySelectorAll('[data-look]').forEach(b=>b.addEventListener('click',()=>applyLook(b.dataset.look)));
canvas.addEventListener('webglcontextlost',()=>status('绘图上下文已中断，恢复后可重新展开地脉。'));
window.addEventListener('pagehide',dispose,{once:true});
window.netherStrataLab = {state,regenerate,applyToggles,applyLook,view,setDistance,metrics,dispose};
applyLook(query.get('look')||'inkflame');
try { regenerate(); raf = requestAnimationFrame(frame); }
catch (error) { status(`展开失败：${error.message}`); console.error(error); }

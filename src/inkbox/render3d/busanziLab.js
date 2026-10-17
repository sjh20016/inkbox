// 卜算子资产看板：真实 three.js + 真实 GLB，Idle / Walk / Wind 三动画可切换。
//
// 这个页面的职责是「资产验收」，不是游戏 UI：
//   · 用与游戏内 `BusanziLibrary.js` **同一份**加载器/材质；
//   · `window.busanziLab` 暴露稳定 API 给 `scripts/inkbox-busanzi-browser.mjs`；
//   · `capturePortrait()` 用同一具模型离线渲染出游戏内面板用的肖像 PNG（透明底）。
//
// 资产规格与来源见 `assets/characters/busanzi/data/busanzi_manifest.json`。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUSANZI_CLIP_NAMES, loadBusanziLibrary } from './busanzi/BusanziLibrary.js';

const canvas = document.querySelector('#busanzi');
const status = document.querySelector('#status');
const clipBar = document.querySelector('#clips');
const paletteBar = document.querySelector('#palette');
const errors = [];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor('#d9d2c2');

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#fff6e6', '#6a6455', 2.2));
const keyLight = new THREE.DirectionalLight('#fff1dc', 2.1);
keyLight.position.set(-4, 7, 6); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight('#9fb4c8', 0.85);
rimLight.position.set(5, 3, -6); scene.add(rimLight);
const ground = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshLambertMaterial({ color: '#cbc3b2' }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.012; scene.add(ground);
const grid = new THREE.GridHelper(8, 16, '#b0a894', '#b8b0a0');
grid.position.y = -0.008; scene.add(grid);

const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.enablePan = false;
controls.minDistance = 1.1;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI / 2.02;

let library = null;
let mixer = null;
let actions = new Map();
let activeClip = null;
let disposed = false;
let frames = 0;
const clock = new THREE.Clock();
let portraitScene = null;
let portraitCamera = null;
const portraitLights = [];

function setStatus(extra = '') {
  const snapshot = metrics();
  const lines = [
    `${snapshot.activeClip || '—'} · ${snapshot.clips.map((clip) => `${clip.name} ${clip.duration.toFixed(3)}s`).join(' / ')}`,
    `${snapshot.triangles} 三角面 · ${snapshot.meshes} 网格 · ${snapshot.bones} 骨 · ${snapshot.materialCount} 材质 · 调色板 ${snapshot.palette.count} 色（最近邻）`,
    `渲染器 ${snapshot.renderer} · ${frames} 帧`,
    extra,
  ].filter(Boolean);
  if (status) status.textContent = lines.join('\n');
}

function frameCamera() {
  const bounds = library.getBounds();
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const fitHeight = Math.max(size.y * 1.34, 1.6);
  const distance = fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  camera.position.set(center.x + size.y * 0.42, center.y + size.y * 0.12, center.z + distance);
  controls.target.set(center.x, center.y * 0.94, center.z);
  camera.lookAt(controls.target);
  controls.update();
}

function resize() {
  const box = canvas.parentElement.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
  camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
  camera.updateProjectionMatrix();
}

function play(name) {
  if (!mixer) throw new Error('Busanzi lab is not loaded yet');
  if (!BUSANZI_CLIP_NAMES.includes(name)) throw new Error(`Unknown busanzi clip: ${name}`);
  const next = actions.get(name);
  const previous = activeClip ? actions.get(activeClip) : null;
  next.reset();
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();
  if (previous && previous !== next) previous.crossFadeTo(next, 0.22, false);
  activeClip = name;
  window.busanziLab.activeClip = name;
  for (const button of clipBar.querySelectorAll('[data-clip]')) button.setAttribute('aria-pressed', String(button.dataset.clip === name));
  setStatus();
  return name;
}

function metrics() {
  if (!library) return { ready: false, errors, clips: [] };
  const clipMetrics = library.metrics().clips;
  return {
    ready: window.busanziLab.ready,
    clips: clipMetrics,
    meshes: library.meshes.size,
    triangles: library.triangles,
    bones: library.skeleton.bones.length,
    baseJoints: library.baseJoints.length,
    materialCount: new Set([...library.meshes.values()].map((mesh) => mesh.material)).size,
    material: library.material.type,
    textures: library.texture ? 1 : 0,
    palette: library.metrics().palette,
    activeClip,
    mixerTime: mixer?.time ?? 0,
    mixerRunning: Boolean(mixer) && [...actions.values()].some((action) => action.isRunning()),
    geometries: renderer.info.memory.geometries,
    renderer: (() => {
      const gl = renderer.getContext();
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })(),
    frames,
    errors: errors.slice(),
  };
}

/** 指定骨骼的世界四元数/位置（浏览器验收用来证明 Wind 真的让符纸/头发/衣摆动了）。 */
function probe(names = []) {
  if (!library) throw new Error('Busanzi lab is not loaded yet');
  library.scene.updateMatrixWorld(true);
  const output = {};
  for (const name of names) {
    const bone = library.skeleton.bones.find((item) => item.name === name);
    if (!bone) throw new Error(`Unknown busanzi bone: ${name}`);
    const quaternion = bone.getWorldQuaternion(new THREE.Quaternion());
    const position = bone.getWorldPosition(new THREE.Vector3());
    output[name] = { quaternion: quaternion.toArray(), position: position.toArray() };
  }
  return output;
}

/**
 * 从真实模型离线渲染一张透明底 PNG（dataURL）。
 * 游戏内卜算子面板的肖像入口就用它生成——不是画出来的立绘，是模型本身。
 */
function capturePortrait({ width = 456, height = 576, clip = 'Idle', time = 0.5, framing = 'bust' } = {}) {
  if (!library || disposed) throw new Error('Busanzi lab is not loaded yet');
  const previousClip = activeClip;
  const previousTime = mixer?.time ?? 0;
  mixer.stopAllAction();
  const action = actions.get(clip);
  if (!action) throw new Error(`Unknown busanzi clip: ${clip}`);
  action.reset(); action.setEffectiveWeight(1); action.play();
  if (mixer) mixer.setTime(time);
  library.scene.updateMatrixWorld(true);

  if (!portraitScene) {
    portraitScene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight('#fff6e6', '#6a6455', 2.2); portraitScene.add(hemi);
    const key = new THREE.DirectionalLight('#fff1dc', 2.15); key.position.set(-2.6, 4.2, 3.4); portraitScene.add(key);
    const fill = new THREE.DirectionalLight('#a9bccf', 0.8); fill.position.set(3, 2.2, 2.4); portraitScene.add(fill);
    const rim = new THREE.DirectionalLight('#ffe2b0', 0.65); rim.position.set(0.5, 3, -4); portraitScene.add(rim);
    portraitLights.push(hemi, key, fill, rim);
  }
  portraitCamera = new THREE.PerspectiveCamera(34, width / height, 0.05, 100);
  const bounds = library.getBounds();
  const center = bounds.getCenter(new THREE.Vector3());
  if (framing === 'full') {
    const size = bounds.getSize(new THREE.Vector3());
    const distance = (Math.max(size.y * 1.3, 1.6) / 2) / Math.tan(THREE.MathUtils.degToRad(portraitCamera.fov / 2));
    portraitCamera.position.set(center.x + size.y * 0.4, center.y + 0.05, center.z + distance);
    portraitCamera.lookAt(center.x, center.y * 0.96, center.z);
  } else {
    // 半身：从胸口到头顶之上（含发顶与符纸上沿），镜头略偏右，避开正对称的呆板构图。
    // 取景按**模型实测包围盒**的比例算，不写死世界坐标——资产重导出后不会跑偏。
    const size = bounds.getSize(new THREE.Vector3());
    const top = bounds.min.y + size.y * 1.05;
    const bottom = bounds.min.y + size.y * 0.35;
    const targetY = (top + bottom) / 2;
    const visibleHeight = Math.max(top - bottom, 0.4);
    const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(portraitCamera.fov / 2)));
    portraitCamera.position.set(size.y * 0.3, targetY + visibleHeight * 0.05, distance);
    portraitCamera.lookAt(size.y * 0.04, targetY - visibleHeight * 0.03, 0);
  }

  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = width; targetCanvas.height = height;
  const portraitRenderer = new THREE.WebGLRenderer({ canvas: targetCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  portraitRenderer.setPixelRatio(1);
  portraitRenderer.setSize(width, height, false);
  portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
  portraitRenderer.setClearColor(0x000000, 0);
  const parent = library.scene.parent;
  parent?.remove(library.scene);
  portraitScene.add(library.scene);
  portraitLights.forEach((light) => { light.visible = true; });
  portraitRenderer.render(portraitScene, portraitCamera);
  const dataUrl = targetCanvas.toDataURL('image/png');
  portraitScene.remove(library.scene);
  parent?.add(library.scene);
  portraitRenderer.dispose();
  portraitRenderer.forceContextLoss();

  // 把看板恢复成截图前的动画状态，别让「生成肖像」把正在预览的动画搅乱。
  mixer.stopAllAction();
  if (previousClip) {
    const restore = actions.get(previousClip);
    restore.reset(); restore.play();
    if (mixer) mixer.setTime(previousTime);
    activeClip = previousClip;
  }
  library.scene.updateMatrixWorld(true);
  return dataUrl;
}

function bindButtons() {
  for (const name of BUSANZI_CLIP_NAMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.clip = name;
    button.textContent = name;
    button.setAttribute('aria-pressed', String(name === 'Idle'));
    button.addEventListener('click', () => play(name));
    clipBar.append(button);
  }
}

function buildPaletteStrip() {
  for (const entry of library.manifest.palette.colors) {
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.hex;
    swatch.title = `${entry.index} · ${entry.name} · ${entry.hex}`;
    paletteBar.append(swatch);
  }
}

function tick() {
  if (disposed) return;
  requestAnimationFrame(tick);
  const delta = Math.min(clock.getDelta(), 0.1);
  mixer?.update(delta);
  renderer.render(scene, camera);
  frames += 1;
  if (frames % 20 === 0) setStatus();
}

window.busanziLab = {
  ready: false,
  errors,
  clips: [...BUSANZI_CLIP_NAMES],
  play,
  metrics,
  probe,
  capturePortrait,
  library: null,
  mixer: null,
  actions: null,
  activeClip: null,
  scene, camera, renderer, controls,
};

try {
  library = await loadBusanziLibrary();
  window.busanziLab.library = library;
  scene.add(library.scene);
  mixer = new THREE.AnimationMixer(library.scene);
  for (const name of BUSANZI_CLIP_NAMES) actions.set(name, mixer.clipAction(library.clip(name)));
  window.busanziLab.mixer = mixer;
  window.busanziLab.actions = actions;
  bindButtons();
  buildPaletteStrip();
  resize();
  frameCamera();
  play('Idle');
  controls.addEventListener('change', () => renderer.render(scene, camera));
  window.addEventListener('resize', () => { resize(); renderer.render(scene, camera); });
  window.busanziLab.ready = true;
  setStatus();
  clock.start();
  requestAnimationFrame(tick);
} catch (error) {
  errors.push(error.message);
  if (status) status.textContent = `卜算子资产加载失败：${error.message}`;
  console.error(error);
}

window.addEventListener('pagehide', () => {
  if (disposed) return;
  disposed = true;
  mixer?.stopAllAction();
  actions.clear();
  controls.dispose();
  library?.dispose?.();
  ground.geometry.dispose(); ground.material.dispose();
  grid.geometry.dispose(); grid.material.dispose();
  portraitScene?.clear?.();
  portraitScene = null; portraitCamera = null;
  renderer.dispose();
});

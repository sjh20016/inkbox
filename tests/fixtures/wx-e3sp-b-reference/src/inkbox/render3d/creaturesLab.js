// 山海异兽资产库 · 真实 Three.js 展示场景
//
// 13 只 GLB 统一加载（同一套 loader / 同一张 16×1 调色板材质），列表可切换，
// 每只都有独立的 AnimationMixer 播放 8 套同名 clip。
// 本页面只做资产验收，不接入世界模拟；世界试装见 src/inkbox/render3d/entities/EntityLayer.js。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURE_CLIPS, loadCreatureLibrary } from './creatures/CreatureLibrary.js';

const canvas = document.querySelector('#creatures');
const status = document.querySelector('#status');
const info = document.querySelector('#info');
const nav = document.querySelector('#speciesNav');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor('#d5d8dc');
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#84909d', 2.3));
const light = new THREE.DirectionalLight('#fff4e4', 2.1);
light.position.set(-7, 14, 9); scene.add(light);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshLambertMaterial({ color: '#c9ccd0' }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.01; scene.add(ground);
const grid = new THREE.GridHelper(320, 80, '#b4bbc3', '#b9c0c8');
grid.position.y = -.005; scene.add(grid);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 800);
camera.position.set(8, 6, 12);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false; controls.maxPolarAngle = Math.PI / 2.05;
const clock = new THREE.Clock();
const lineup = new THREE.Group(); lineup.name = 'CreatureLineup'; scene.add(lineup);
const debugExtension = renderer.getContext().getExtension('WEBGL_debug_renderer_info');

let library = null;
let disposed = false;
let selected = 'all';
let currentClip = 'rest';
const errors = [];
const rigs = new Map();   // id → { id, species, root(gltf.scene wrapper), scene, mixer, restPose }
const speciesList = [];

function layoutLineup() {
  const gap = 2.6;
  const perRow = 4;
  const rows = [];
  for (let i = 0; i < speciesList.length; i += perRow) rows.push(speciesList.slice(i, i + perRow));
  let z = 0;
  for (const row of rows) {
    const widths = row.map(species => Math.max(species.size[0], species.size[2], 1.4) + gap);
    const rowWidth = widths.reduce((a, b) => a + b, 0);
    let x = -rowWidth / 2;
    let depth = 0;
    for (let i = 0; i < row.length; i += 1) {
      const species = row[i];
      const rig = rigs.get(species.id);
      rig.home.set(x + widths[i] / 2, 0, z);
      rig.scene.position.copy(rig.home);
      x += widths[i];
      depth = Math.max(depth, Math.max(species.size[2], 1.2) + gap);
    }
    z += depth;
  }
  lineup.updateMatrixWorld(true);
  frameBox(new THREE.Box3().setFromObject(lineup));
}

function frameBox(box) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.5);
  const fov = camera.fov * Math.PI / 180;
  const distance = radius / Math.sin(fov / 2) * 1.05;
  const direction = new THREE.Vector3(1.1, 0.8, 1.4).normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(0.02, distance / 400); camera.far = Math.max(50, distance * 8);
  camera.updateProjectionMatrix(); controls.update();
}

function applyRestPose(rig) {
  rig.mixer.stopAllAction();
  for (const [node, pose] of rig.restPose) {
    node.position.copy(pose.position);
    node.quaternion.copy(pose.quaternion);
    node.scale.copy(pose.scale);
  }
  rig.scene.updateMatrixWorld(true);
}

function activeRigs() {
  return selected === 'all' ? [...rigs.values()].filter(rig => rig.scene.visible) : [rigs.get(selected)].filter(Boolean);
}

function layoutVisibility() {
  for (const [id, rig] of rigs) rig.scene.visible = selected === 'all' || id === selected;
}

function renderStatus() {
  const speciesCount = speciesList.length;
  const active = selected === 'all' ? '全部 13 只列队' : `${rigs.get(selected)?.species.name_zh || selected} · 单选`;
  status.textContent = `${speciesCount} 种异兽已加载 · ${active}\n共享材质 1（16×1 调色板）· 每只 8 套 clip · 与修士同一单位制\n${currentClip === 'rest' ? '默认姿态（rest pose）' : `正在播放 ${currentClip}`}`;
  if (!info) return;
  const rig = rigs.get(selected);
  if (!rig) {
    info.innerHTML = '<b>全部 · 13 种</b><br>点击物种查看体型、出处与动画<br>金色边框 = 默认世界试装 4 种';
    return;
  }
  const speciesInfo = rig.species;
  info.innerHTML = `<b>${speciesInfo.name_zh} · ${speciesInfo.id}</b><br>出处：${speciesInfo.source || '—'}<br>`
    + `体型：${speciesInfo.size_class || '—'} · 高 ${speciesInfo.height.toFixed(2)}（${(speciesInfo.height / 2.125).toFixed(2)} 修士）<br>`
    + `包围盒：${speciesInfo.size.map(v => v.toFixed(2)).join(' × ')}<br>`
    + `三角形：${speciesInfo.triangles} · 部件：${speciesInfo.parts}<br>`
    + `动画：${speciesInfo.clips.length} 套 · 材质：共享调色板`;
}

function updateNavPressed() {
  for (const button of nav.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String((button.dataset.id || 'all') === selected));
  }
  for (const button of document.querySelectorAll('footer [data-clip],footer [data-action="rest"]')) {
    const value = button.dataset.clip || 'rest';
    button.setAttribute('aria-pressed', String(value === currentClip));
  }
}

function select(id = 'all') {
  if (id !== 'all' && !rigs.has(id)) throw new Error(`Unknown creature: ${id}`);
  selected = id;
  currentClip = 'rest';
  layoutVisibility();
  if (id === 'all') {
    for (const rig of rigs.values()) applyRestPose(rig);
    lineup.updateMatrixWorld(true);
    frameBox(new THREE.Box3().setFromObject(lineup));
  } else {
    const rig = rigs.get(id);
    applyRestPose(rig);
    rig.scene.updateMatrixWorld(true);
    // Frame the selected species at its lineup home position.
    const box = new THREE.Box3().setFromObject(rig.scene);
    frameBox(box);
  }
  renderStatus(); updateNavPressed();
  return { selected, species: speciesList.length };
}

function play(clip = 'idle') {
  if (clip !== 'rest' && !CREATURE_CLIPS.includes(clip)) throw new Error(`Unknown creature clip: ${clip}`);
  currentClip = clip;
  const targets = activeRigs();
  for (const rig of targets) {
    rig.mixer.stopAllAction();
    if (clip === 'rest') { applyRestPose(rig); continue; }
    // AnimationMixer.clipAction(string) 只查 root.animations；GLTFLoader 把 clip 放在
    // gltf.animations 上，所以这里显式传 clip 对象。
    const clipObject = rig.animations.find(candidate => candidate.name === clip);
    if (!clipObject) throw new Error(`Rig ${rig.id} has no clip ${clip}`);
    const action = rig.mixer.clipAction(clipObject);
    action.reset(); action.enabled = true; action.play();
  }
  renderStatus(); updateNavPressed();
  return { clip, rigs: targets.length };
}

function metrics() {
  const previousGround = ground.visible, previousGrid = grid.visible;
  ground.visible = false; grid.visible = false;
  renderer.render(scene, camera);
  const drawCalls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  ground.visible = previousGround; grid.visible = previousGrid;
  renderer.render(scene, camera);
  const materials = new Set(), textures = new Set();
  let meshCount = 0;
  for (const rig of rigs.values()) rig.scene.traverse(node => {
    if (!node.isMesh) return;
    meshCount += 1;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  const gl = renderer.getContext();
  return {
    species: speciesList.length,
    rigs: rigs.size,
    selected,
    currentClip,
    drawCalls,
    triangles,
    meshCount,
    materialCount: materials.size,
    textureCount: textures.size,
    clips: [...CREATURE_CLIPS],
    clipsPerRig: [...rigs.values()].map(rig => rig.animations.length === 0 ? 0
      : rig.animations.map(clip => clip.name).filter(name => CREATURE_CLIPS.includes(name)).length),
    allClipsMatch: [...rigs.values()].every(rig => {
      const names = rig.animations.map(clip => clip.name);
      return names.length === CREATURE_CLIPS.length && names.every((name, i) => name === CREATURE_CLIPS[i]);
    }),
    mixerCount: [...rigs.values()].filter(rig => rig.mixer).length,
    viewport: [canvas.clientWidth, canvas.clientHeight],
    dpr: renderer.getPixelRatio(),
    renderer: debugExtension ? gl.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
}

function render() {
  if (disposed) return;
  const dt = Math.min(0.05, clock.getDelta());
  for (const rig of rigs.values()) rig.mixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function resize() {
  const { width, height } = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  camera.aspect = Math.max(1e-3, width / Math.max(1, height));
  camera.updateProjectionMatrix();
}

window.creatureLab = {
  ready: false, errors, species: speciesList, rigs, renderer, scene, camera,
  select, play, metrics,
  library: null,
};

try {
  library = await loadCreatureLibrary({ ids: null, keepRigs: true });
  window.creatureLab.library = library;
  const byId = new Map(library.manifest?.creatures?.map(entry => [entry.id, entry]) || []);
  for (const [id, species] of library.species) {
    const rig = library.rigs.get(id);
    if (!rig) throw new Error(`Rig missing for ${id}`);
    const restPose = new Map();
    rig.scene.traverse(node => {
      restPose.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
    });
    const root = new THREE.Group();
    root.name = `Rig:${id}`;
    root.add(rig.scene);
    lineup.add(root);
    const entry = byId.get(id);
    const record = {
      id, name_zh: species.name_zh,
      size_class: species.size_class,
      source: species.source,
      quote: species.quote || entry?.quote || null,
      height: species.height,
      height_vs_cultivator: species.height_vs_cultivator,
      size: [...species.size],
      triangles: species.triangles,
      parts: species.parts,
      nodes: [...species.nodes],
      clips: [...species.clips],
      worldTrial: !!species.worldTrial,
    };
    speciesList.push(record);
    rigs.set(id, { id, species: record, scene: root, gltfScene: rig.scene,
      animations: rig.animations, mixer: new THREE.AnimationMixer(rig.scene),
      restPose, home: new THREE.Vector3() });
  }
  nav.replaceChildren();
  const allButton = document.createElement('button');
  allButton.textContent = '全部 13 只'; allButton.dataset.id = 'all';
  allButton.addEventListener('click', () => select('all'));
  nav.append(allButton);
  for (const species of speciesList) {
    const button = document.createElement('button');
    button.textContent = `${species.name_zh} · ${species.height.toFixed(2)}`;
    button.dataset.id = species.id;
    button.dataset.trial = String(species.worldTrial);
    button.title = `${species.source || ''} · ${species.triangles} 三角形`;
    button.addEventListener('click', () => select(species.id));
    nav.append(button);
  }
  for (const button of document.querySelectorAll('footer [data-clip]')) {
    button.addEventListener('click', () => play(button.dataset.clip));
  }
  document.querySelector('footer [data-action="rest"]').addEventListener('click', () => play('rest'));
  selected = 'all'; currentClip = 'rest';
  layoutLineup(); layoutVisibility(); resize(); renderStatus(); updateNavPressed();
  window.creatureLab.ready = true;
  requestAnimationFrame(render);
} catch (error) {
  errors.push(error?.stack || String(error));
  status.textContent = `异兽资产加载失败：${error?.message || error}`;
  console.error(error);
  window.creatureLab.errors = errors;
}

window.addEventListener('resize', () => { resize(); });
controls.addEventListener('change', () => { if (window.creatureLab.ready) renderer.render(scene, camera); });
window.addEventListener('pagehide', () => {
  if (disposed) return; disposed = true;
  for (const rig of rigs.values()) rig.mixer?.stopAllAction();
  controls.dispose();
  library?.dispose?.();
  ground.geometry.dispose(); ground.material.dispose(); grid.geometry.dispose(); grid.material.dispose();
  renderer.dispose();
});

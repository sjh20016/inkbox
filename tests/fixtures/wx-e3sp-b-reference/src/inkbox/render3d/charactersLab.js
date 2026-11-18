// Asset QA scene: the same GLB loader, palette material and instance batches as Render3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCharacterLibrary } from './characters/CharacterLibrary.js';
import { CharacterBatch } from './characters/CharacterBatch.js';

const canvas = document.querySelector('#characters');
const status = document.querySelector('#status');
const labels = document.querySelector('#labels');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor('#d5d8dc');
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#84909d', 2.4));
const light = new THREE.DirectionalLight('#fff4e4', 2.0);
light.position.set(-6, 14, 9); scene.add(light);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ color: '#c9ccd0' }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.01; scene.add(ground);
const grid = new THREE.GridHelper(240, 80, '#b4bbc3', '#b9c0c8');
grid.position.y = -.005; scene.add(grid);
const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, .1, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false; controls.maxPolarAngle = Math.PI / 2.1;
const ROLES = ['basic', 'sect_disciple', 'wanderer', 'elder', 'ghost', 'alchemist'];
const NAMES = ['普通修士', '宗门弟子', '游修', '高阶修士 / 长老', '鬼修', '丹修'];
let library, batch, records = [], count = 6, halfWidth = 9.8;
let characterDraws = 0, characterTriangles = 0, disposed = false;
const errors = [];

function layout(n) {
  count = n; records = []; labels.replaceChildren();
  const columns = n === 6 ? 6 : n === 20 ? 5 : n === 50 ? 10 : 20;
  const rows = Math.ceil(n / columns);
  const spacing = n === 6 ? 2.6 : 3.1;
  for (let i = 0; i < n; i += 1) {
    const role = ROLES[i % 6];
    const x = ((i % columns) - (columns - 1) / 2) * spacing;
    const z = (Math.floor(i / columns) - (rows - 1) / 2) * spacing;
    records.push({ id: i + 1, role, x, y: 0, z, scale: 1, rotation: 0, source: { id: i + 1, role } });
    if (n === 6) {
      const label = document.createElement('span'); label.className = 'role';
      label.textContent = `${String(i + 1).padStart(2, '0')} ${NAMES[i]}`;
      label.dataset.index = i; labels.append(label);
    }
  }
  batch.write(records);
  // Fixed distances: growing crowd occupies a smaller part of the viewport.
  halfWidth = n === 6 ? 9.8 : n === 20 ? 15 : n === 50 ? 24 : 40;
  camera.position.set(n === 6 ? -7.5 : n === 20 ? -12 : -20, n === 6 ? 7 : n === 20 ? 16 : 32, n === 6 ? 18 : n === 20 ? 25 : 48);
  controls.target.set(0, n === 6 ? 1.1 : 0, 0); controls.update();
  for (const button of document.querySelectorAll('[data-count]')) button.setAttribute('aria-pressed', String(Number(button.dataset.count) === n));
  resize(); render();
}

function resize() {
  const { width, height } = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(width, height, false);
  const halfHeight = halfWidth * height / width;
  camera.left = -halfWidth; camera.right = halfWidth;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function render() {
  renderer.render(scene, camera);
  const allCalls = renderer.info.render.calls;
  const allTriangles = renderer.info.render.triangles;
  // Keep ground/grid separate from the measured character cost.
  ground.visible = false; grid.visible = false;
  renderer.render(scene, camera);
  characterDraws = renderer.info.render.calls;
  characterTriangles = renderer.info.render.triangles;
  ground.visible = true; grid.visible = true;
  renderer.render(scene, camera);
  for (const label of labels.children) {
    const record = records[Number(label.dataset.index)];
    const p = new THREE.Vector3(record.x, -.2, record.z).project(camera);
    label.style.left = `${(p.x + 1) * canvas.clientWidth / 2}px`;
    label.style.top = `${(1 - p.y) * canvas.clientHeight / 2 + 8}px`;
  }
  status.textContent = `${count === 6 ? '近景' : count === 20 ? '中景' : count === 50 ? '远景' : '压力测试'} · ${count} 个角色\n角色 ${characterDraws} 次绘制 · ${characterTriangles.toLocaleString()} 三角面\n共享材质 1 · 共享调色图 1`;
  return { count, characterDraws, characterTriangles, allCalls, allTriangles };
}

const debugExtension = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
window.cultivatorLab = {
  ready: false, errors, renderer, scene, camera,
  setCount(n) { if (![6, 20, 50, 300].includes(n)) throw new Error('Unsupported scale'); layout(n); return this.metrics(); },
  metrics() {
    const gl = renderer.getContext();
    return { ...render(), materialCount: new Set(Object.values(batch.meshes).map(mesh => mesh.material)).size,
      renderer: debugExtension ? gl.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      viewport: [canvas.clientWidth, canvas.clientHeight], dpr: renderer.getPixelRatio() };
  },
  async sample(frames = 90) {
    const times = [], writeTimes = []; let previous;
    await new Promise(resolve => {
      const tick = time => {
        if (previous !== undefined) times.push(time - previous);
        previous = time;
        const begin = performance.now(); batch.write(records); writeTimes.push(performance.now() - begin);
        renderer.render(scene, camera);
        if (times.length < frames) requestAnimationFrame(tick); else resolve();
      }; requestAnimationFrame(tick);
    });
    const summary = values => { const sorted = [...values].sort((a, b) => a - b); return { mean: values.reduce((a, b) => a + b, 0) / values.length, p95: sorted[Math.floor(sorted.length * .95)] }; };
    return { ...this.metrics(), frameMs: summary(times), batchWriteMs: summary(writeTimes), frames };
  },
};

try {
  library = await loadCharacterLibrary();
  batch = new CharacterBatch(library, 300); scene.add(batch.group);
  window.cultivatorLab.library = library; window.cultivatorLab.batch = batch;
  layout(6); window.cultivatorLab.ready = true;
  for (const button of document.querySelectorAll('[data-count]')) button.addEventListener('click', () => layout(Number(button.dataset.count)));
  controls.addEventListener('change', render);
  window.addEventListener('resize', () => { resize(); render(); });
} catch (error) {
  errors.push(error.message); status.textContent = `角色资产加载失败：${error.message}`; console.error(error);
}
window.addEventListener('pagehide', () => {
  if (disposed) return; disposed = true;
  batch?.dispose(); library?.dispose?.(); controls.dispose();
  ground.geometry.dispose(); ground.material.dispose(); grid.geometry.dispose(); grid.material.dispose(); renderer.dispose();
});

import * as THREE from '../../../vendor/three/build/three.module.js';

export const MODES = [
  { id: 'solo', label: '单体观察', icon: '◉', hint: '一构一境，察其形骨。' },
  { id: 'game', label: '游戏比例', icon: '◇', hint: '人物高 1.7m，树高 4m，屋脊高 3.6m。' },
  { id: 'distant', label: '远景观察', icon: '△', hint: '拉远视距，观察主要剪影与负空间。' },
  { id: 'stress', label: '批量压力', icon: '▦', hint: '共享几何与材质；静态实例只在设置变化时更新。' },
];

export function instanceMatrices(count, spacing = 15) {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => new THREE.Matrix4().makeTranslation(
    (i % columns - (columns - 1) / 2) * spacing, 0, (Math.floor(i / columns) - (rows - 1) / 2) * spacing,
  ));
}

// All dimensions are metres, using the same Y-up / ground-centre contract as the assets.
export function createReferences() {
  const group = new THREE.Group();
  const materials = [new THREE.MeshLambertMaterial({ color: '#b8b6a3' }), new THREE.MeshLambertMaterial({ color: '#64746a' }), new THREE.MeshLambertMaterial({ color: '#8a7766' }), new THREE.MeshLambertMaterial({ color: '#a54c36' })];
  const geometries = [];
  function mesh(geometry, material, x, y, z) {
    geometries.push(geometry);
    const object = new THREE.Mesh(geometry, materials[material]); object.position.set(x, y, z); group.add(object); return object;
  }
  mesh(new THREE.BoxGeometry(32, .14, 24), 0, 0, -.13, 0);
  for (const [x, z] of [[-6, 4], [5, 5], [7, -5]]) {
    mesh(new THREE.CylinderGeometry(.14, .18, 2, 5), 2, x, 1, z);
    mesh(new THREE.ConeGeometry(1.25, 3, 5), 1, x, 2.5, z);
  }
  mesh(new THREE.BoxGeometry(3.6, 2.4, 3), 0, -9, 1.2, -4);
  const roof = mesh(new THREE.CylinderGeometry(0, 2.6, 1.2, 4), 1, -9, 3, -4); roof.rotation.y = Math.PI / 4;
  for (const [x, z] of [[-3.8, 4], [3.5, 5.5]]) {
    mesh(new THREE.CylinderGeometry(.2, .28, 1.25, 5), 3, x, .625, z);
    mesh(new THREE.IcosahedronGeometry(.225, 0), 2, x, 1.475, z);
  }
  group.userData.dispose = () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); };
  return group;
}

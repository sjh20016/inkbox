import * as THREE from '../../../vendor/three/build/three.module.js';
import { buildGeometry } from './geometry.js';
import { makeMaterial } from './materials.js';

export const ASSETS = Object.freeze([
  { id: 'shanhai.sect.gate', name: '云阙山门', subtitle: '仙门 · 悬瓦剑碑', description: '窄高石门托起悬挑青瓦，孤立剑碑立于侧。推荐未来绑定真实宗门入口；当前只作视觉样例。', states: [{ id: 'weathered', label: '经年' }], defaultRealm: 'mortal' },
  { id: 'shanhai.settlement.ruin', name: '故里断垣', subtitle: '聚落 · 残梁旧基', description: '缺失的屋顶、断壁与倾倒木梁留下曾经的房屋形制。未来损毁程度须读取真实建筑事实。', states: [{ id: 'broken', label: '残破' }, { id: 'abandoned', label: '荒废' }], defaultRealm: 'mortal' },
  { id: 'shanhai.leyline.altar', name: '九隙古坛', subtitle: '地脉 · 断环放射', description: '缺环石阵围拢低矮中台，放射刻痕指向空缺。装饰候选，不声明灵脉、增益或阵法事实。', states: [{ id: 'dormant', label: '遗存' }, { id: 'depleted', label: '枯竭' }], defaultRealm: 'upper' },
  { id: 'shanhai.nether.remnant', name: '无归之隙', subtitle: '幽冥 · 错断虚门', description: '高低错断的石柱与悬缺横石围出虚空，少量浅色实体线刻记录无言年代。幽冥装饰候选。', states: [{ id: 'silent', label: '无言' }], defaultRealm: 'nether' },
]);

export function createRuinsLibrary() {
  const geometries = new Map(), materials = new Map(), edges = new Map(), batches = new Set();
  let disposed = false, lineMaterial = null;
  const live = () => { if (disposed) throw new Error('Ruins library is disposed'); };
  const resolve = (id, lod, state) => {
    live(); const asset = ASSETS.find(a => a.id === id);
    if (!asset) throw new Error(`Unknown ruins asset: ${id}`);
    if (!Number.isInteger(lod) || lod < 0 || lod > 2) throw new Error(`Invalid ruins LOD: ${lod}`);
    state ??= asset.states[0].id;
    if (!asset.states.some(s => s.id === state)) throw new Error(`Invalid ${id} state: ${state}`);
    return { state, key: `${id}:${lod}:${state}` };
  };
  function geometryFor(id, lod = 0, state) {
    const resolved = resolve(id, lod, state);
    if (!geometries.has(resolved.key)) geometries.set(resolved.key, buildGeometry(id, lod, resolved.state));
    return geometries.get(resolved.key);
  }
  function materialFor(realm = 'mortal', style = 'toon', light = 0) {
    live(); const key = `${realm}:${style}:${light}`;
    if (!materials.has(key)) materials.set(key, makeMaterial(realm, style, light));
    return materials.get(key);
  }
  function statsFor(id, lod = 0, state) {
    const g = geometryFor(id, lod, state);
    return { triangles: g.getAttribute('position').count / 3, bounds: { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() }, geometryBytes: bytes(g) };
  }
  function createBatch({ id, lod = 0, state, realm = 'mortal', style = 'toon', light = 0, matrices = [new THREE.Matrix4()], outline = false } = {}) {
    live();
    if (!Array.isArray(matrices) || !matrices.every(m => m?.isMatrix4 && m.elements.every(Number.isFinite) && Math.abs(m.determinant()) > 1e-10)) throw new Error('Batch matrices must be finite, invertible Matrix4[]');
    const g = geometryFor(id, lod, state), material = materialFor(realm, style, light), group = new THREE.Group();
    group.name = `${id}:batch`;
    let mesh = new THREE.InstancedMesh(g, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
    let lineGeometry = null;
    if (outline && matrices.length) {
      const key = g.uuid;
      if (!edges.has(key)) edges.set(key, new THREE.EdgesGeometry(g, 27));
      const source = edges.get(key).getAttribute('position'), positions = new Float32Array(source.count * 3 * matrices.length), v = new THREE.Vector3();
      matrices.forEach((m, index) => {
        for (let i = 0; i < source.count; i++) { v.fromBufferAttribute(source, i).applyMatrix4(m); v.toArray(positions, (index * source.count + i) * 3); }
      });
      lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      lineMaterial ||= new THREE.LineBasicMaterial({ color: '#283c32', transparent: true, opacity: .56, depthWrite: false });
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial); lines.raycast = () => {}; lines.renderOrder = 1; group.add(lines);
    }
    let batchDisposed = false;
    group.userData = { assetId: id, lod, instances: matrices.length, dispose() {
      if (batchDisposed) return; batchDisposed = true;
      mesh.dispose(); mesh = null; lineGeometry?.dispose(); lineGeometry = null;
      group.removeFromParent(); group.clear(); batches.delete(group);
      group.userData.disposed = true;
    } };
    batches.add(group); return group;
  }
  function stats() {
    const cacheGeometryBytes = [...geometries.values(), ...edges.values()].reduce((n, g) => n + bytes(g), 0);
    let batchGeometryBytes = 0, instanceMatrixBytes = 0;
    for (const batch of batches) for (const node of batch.children) {
      if (node.isInstancedMesh) instanceMatrixBytes += node.instanceMatrix.array.byteLength;
      else if (node.geometry) batchGeometryBytes += bytes(node.geometry);
    }
    return { geometries: geometries.size, materials: materials.size + Number(!!lineMaterial), textures: 0,
      geometryBytes: cacheGeometryBytes + batchGeometryBytes + instanceMatrixBytes,
      cacheGeometryBytes, batchGeometryBytes, instanceMatrixBytes, batches: batches.size, disposed };
  }
  function dispose() {
    if (disposed) return;
    for (const batch of [...batches]) batch.userData.dispose();
    for (const g of [...geometries.values(), ...edges.values()]) g.dispose();
    for (const m of materials.values()) m.dispose(); lineMaterial?.dispose();
    lineMaterial = null; geometries.clear(); materials.clear(); edges.clear(); disposed = true;
  }
  return { geometryFor, materialFor, createBatch, statsFor, stats, dispose };
}
function bytes(g) { return Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (g.index?.array.byteLength || 0); }

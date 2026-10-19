import * as THREE from 'three';

/**
 * V1 · 山海入画 — 人物 / 异兽的墨线外轮廓（inverted hull）。
 * 兄弟 InstancedMesh 共享源几何与 instanceMatrix；raycast 为空操作，
 * 因而 PlanePicker 的 `renderEntities` 映射与拾取结果完全不变。
 */
const materials = new Map();
function inkMaterial(color, width) {
  const key = `${color}|${width}`;
  if (materials.has(key)) return materials.get(key);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  material.name = 'ShanhaiInkOutline';
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n  transformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  material.customProgramCacheKey = () => `ink-outline-${width.toFixed(4)}`;
  materials.set(key, material);
  return material;
}

export function attachInkOutline(mesh, { color = '#211F1C', ratio = 0.035 } = {}) {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const width = Math.max(0.004, (geometry.boundingSphere?.radius || 1) * ratio);
  const ink = new THREE.InstancedMesh(geometry, inkMaterial(color, width), mesh.instanceMatrix.count);
  ink.instanceMatrix = mesh.instanceMatrix;
  ink.name = `${mesh.name}:ink`; ink.frustumCulled = false; ink.count = 0; ink.visible = false;
  ink.renderOrder = mesh.renderOrder; ink.raycast = () => {};
  ink.userData.presentationOnly = true; ink.userData.inkOutline = true;
  mesh.userData.inkOutline = ink;
  return ink;
}

export function syncInkOutline(mesh, enabled) {
  const ink = mesh.userData.inkOutline; if (!ink) return;
  ink.count = mesh.count; ink.visible = !!enabled && mesh.visible && mesh.count > 0;
}

export function disposeInkOutline(mesh) {
  const ink = mesh.userData.inkOutline; if (!ink) return;
  ink.removeFromParent(); ink.dispose(); mesh.userData.inkOutline = null;
}

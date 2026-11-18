import * as THREE from 'three';

/**
 * V1 · 山海入画 — 人物 / 异兽的墨线外轮廓（inverted hull）。
 * 兄弟 InstancedMesh 共享源几何与 instanceMatrix；raycast 为空操作，
 * 因而 PlanePicker 的 `renderEntities` 映射与拾取结果完全不变。
 */
const materials = new Map();
function inkMaterial(color, width, cy = 0, ratioHint = 0.03) {
  const key = `${color}|${width}|${cy.toFixed(3)}`;
  if (materials.has(key)) return materials.get(key);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  material.name = 'ShanhaiInkOutline';
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
  // V1.2：按屏幕尺寸收线——远景小人不再变成一个个墨点。
  float inkPx = 1.0;
  #ifdef USE_INSTANCING
    vec4 inkC = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0, ${cy.toFixed(4)}, 0.0, 1.0);
    inkPx = abs(projectionMatrix[1][1]) * 450.0 * length(instanceMatrix[1].xyz) * ${(width / ratioHint).toFixed(4)} / max(abs(inkC.w), 1e-4);
  #endif
  transformed += normalize(normalize(normal) * 0.4 + normalize(position - vec3(0.0, ${cy.toFixed(4)}, 0.0) + vec3(1e-4))) * ${width.toFixed(4)} * smoothstep(7.0, 20.0, inkPx);`);
  };
  material.customProgramCacheKey = () => `ink-outline-${width.toFixed(4)}-${cy.toFixed(3)}`;
  materials.set(key, material);
  return material;
}

export function attachInkOutline(mesh, { color = '#211F1C', ratio = 0.035 } = {}) {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const width = Math.max(0.004, (geometry.boundingSphere?.radius || 1) * ratio);
  const ink = new THREE.InstancedMesh(geometry, inkMaterial(color, width, geometry.boundingSphere?.center?.y || 0), mesh.instanceMatrix.count);
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

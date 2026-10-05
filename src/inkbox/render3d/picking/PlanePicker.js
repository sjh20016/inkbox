import * as THREE from 'three';
import { visibleRift } from '../readers/riftViewModel.js';

function visiblySubmitted(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

// Raycast the geometry actually submitted to the GPU, including its mask index.
// Depth wins at oblique angles; selecting an invisible plane behind a hill is wrong.
export class PlanePicker {
  constructor(host) { this.host = host; this.raycaster = new THREE.Raycaster(); this.timeMs = 0; this.lastRaycastMs = 0; }
  /**
   * @param {number} x 画布像素 X
   * @param {number} y 画布像素 Y
   * @param {number} width
   * @param {number} height
   * @param {string|null} [onlyPlane] 只拾某一个位面。M2-B §52：**划窗时只 raycast 凡间**——
   *   否则鼠标经过已经开着的目标界时，会把路径点写到 Upper / Nether 坐标上去。
   */
  pick(x, y, width, height, onlyPlane = null) {
    const start = performance.now(), host = this.host, camera = host.cameraRig.camera;
    camera.updateMatrixWorld(); host.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    let nearest = null;
    for (const stage of host.stages.values()) {
      if (!stage.visible || !stage.terrain?.mesh.visible) continue;
      if (onlyPlane && stage.plane !== onlyPlane) continue;
      const objects = [stage.terrain.mesh];
      // Entity silhouettes are pickable too: a tall ghost must not inspect the
      // mortal terrain visible behind it. Instanced hits resolve via stage data.
      if (!onlyPlane && stage.entities?.group.visible) stage.entities.group.traverse(object => {
        if (object.isInstancedMesh && visiblySubmitted(object) && object.count) objects.push(object);
      });
      // Production houses resolve to original coordinates and the real village.
      // A far aggregate retains settlement identity, without claiming a house.
      if (!onlyPlane) stage.settlements?.group.traverse(object => {
        if (object.isInstancedMesh && visiblySubmitted(object) && object.count
          && (object.userData.renderSettlements?.length
            || (stage.productionAssetsEnabled && stage.environmentLibrary && object.userData.renderBuildings?.length))) objects.push(object);
      });
      if (!onlyPlane) stage.markers?.group.traverse(object => {
        if (object.isInstancedMesh && visiblySubmitted(object) && object.count
          && (object.userData.renderArtifacts?.length || object.userData.renderSites?.length || object.userData.renderLeylines?.length || object.userData.renderRifts?.length)) objects.push(object);
      });
      if (!onlyPlane) stage.realmArtifacts?.group.traverse(object => {
        if(object.isInstancedMesh&&visiblySubmitted(object)&&object.count&&object.userData.renderArtifacts?.length)objects.push(object);
      });
      // Submitted opaque stone/tree geometry also wins depth. Alpha-cutout
      // billboard rectangles cannot be treated as opaque CPU occluders.
      if (!onlyPlane) for (const layer of [stage.decorations, stage.vegetation]) layer?.group.traverse(object => {
        const material = object.material;
        if (object.isInstancedMesh && visiblySubmitted(object) && object.count && material
          && !Array.isArray(material) && !material.transparent && !(material.alphaTest > 0)
          && !objects.includes(object)) objects.push(object);
      });
      // A procedural center/capital still occludes geometry behind it. It carries
      // no house identity, so inspect its visible coordinate instead of skipping it.
      const hit = this.raycaster.intersectObjects(objects, false).find(candidate => {
        if(candidate.instanceId == null) return true;
        for(const [field,collection] of [['renderSites','sites'],['renderLeylines','leylines'],['renderRifts','rifts']]) {
          const record = candidate.object.userData[field]?.[candidate.instanceId];
          if(record && !stage.world[collection]?.some(item => item && item.id === record.id && item.x === record.x && item.y === record.y && (field!=='renderRifts'||visibleRift(item)))) return false;
        }
        return true;
      });
      if (!hit || (nearest && nearest.distance <= hit.distance)) continue;
      const entity = hit.instanceId == null ? null : hit.object.userData.renderEntities?.[hit.instanceId];
      const settlement = hit.instanceId == null ? null : hit.object.userData.renderSettlements?.[hit.instanceId];
      const buildingRecord = hit.instanceId == null ? null : hit.object.userData.renderBuildings?.[hit.instanceId];
      const building = buildingRecord?.houseKey ? buildingRecord : null;
      const artifact = hit.instanceId == null ? null : hit.object.userData.renderArtifacts?.[hit.instanceId];
      const site = hit.instanceId == null ? null : hit.object.userData.renderSites?.[hit.instanceId];
      const leyline = hit.instanceId == null ? null : hit.object.userData.renderLeylines?.[hit.instanceId];
      const rift = hit.instanceId == null ? null : hit.object.userData.renderRifts?.[hit.instanceId];
      const record = entity || settlement || building || artifact || site || leyline || rift;
      const world = record ? { x: record.x, y: record.y } : stage.coordinates.renderToWorld(hit.point.x, hit.point.z);
      const cell = record ? { x: Math.max(0, Math.min(stage.world.w - 1, Math.floor(record.x))), y: Math.max(0, Math.min(stage.world.h - 1, Math.floor(record.y))) }
        : stage.coordinates.renderPointToCell(hit.point);
      nearest = { ...cell, plane: stage.plane, entityId: entity?.id,
        entityContainer: entity?.identityContainer,
        settlementId: settlement?.settlementId ?? building?.settlementId,
        houseKey: building?.houseKey, houseX: building?.houseX, houseY: building?.houseY,
        artifactId: artifact?.id,
        siteId: site?.id, leylineId: leyline?.id, riftId:rift?.id,
        kind: entity ? 'entity' : settlement ? 'settlement' : building ? 'house' : artifact ? 'artifact' : site ? 'site' : leyline ? 'leyline' : rift ? 'rift' : 'terrain',
        point: hit.point, worldPoint: hit.point, world, stage, distance: hit.distance };
    }
    // M2-B B4（§62）：界缘断面也可以被命中——它同样是**提交给 GPU 的可见几何**，
    // 所以按 §61「visible geometry wins」参与同一场深度比较。
    // ⚠️ 划窗采样时（onlyPlane 非空）不参与：那时只认凡间地形（§52）。
    const boundary = host.boundary;
    if (!onlyPlane && boundary?.mesh.visible && boundary.edges) {
      const hit = this.raycaster.intersectObject(boundary.mesh, false)[0];
      if (hit && (!nearest || hit.distance < nearest.distance)) {
        nearest = {
          ...boundary.edgeAtTriangle(hit.faceIndex),
          plane: null, entityId: null,
          point: hit.point, worldPoint: hit.point,
          world: { x: hit.point.x, y: hit.point.z }, stage: null, distance: hit.distance,
        };
      }
    }
    this.timeMs = performance.now() - start; this.lastRaycastMs = this.timeMs;
    return nearest;
  }
}

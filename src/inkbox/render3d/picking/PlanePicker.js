import * as THREE from 'three';
import { canAccess } from '../../world/mapProgress.js';
import { visibleRift } from '../readers/riftViewModel.js';

function visiblySubmitted(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

function collectObjects(stage, onlyPlane) {
  const staticObjects = [stage.terrain.mesh], dynamicObjects = [];
  if (onlyPlane) return { staticObjects, dynamicObjects };
  if (stage.terrainSides?.mesh.visible) staticObjects.push(stage.terrainSides.mesh);
  stage.entities?.group.traverse(object => {
    if (object.isInstancedMesh && visiblySubmitted(object) && object.count) dynamicObjects.push(object);
  });
  stage.settlements?.group.traverse(object => {
    if (object.isInstancedMesh && visiblySubmitted(object) && object.count
      && (object.userData.renderSettlements?.length
        || (stage.productionAssetsEnabled && stage.environmentLibrary && object.userData.renderBuildings?.length))) staticObjects.push(object);
  });
  stage.markers?.group.traverse(object => {
    if (object.isInstancedMesh && visiblySubmitted(object) && object.count
      && (object.userData.renderArtifacts?.length || object.userData.renderSites?.length
        || object.userData.renderLeylines?.length || object.userData.renderRifts?.length)) staticObjects.push(object);
  });
  stage.realmArtifacts?.group.traverse(object => {
    if (object.isInstancedMesh && visiblySubmitted(object) && object.count && object.userData.renderArtifacts?.length) staticObjects.push(object);
  });
  // Opaque stone/tree geometry wins depth; alpha billboard rectangles do not.
  for (const layer of [stage.decorations, stage.vegetation]) layer?.group.traverse(object => {
    const material = object.material;
    if (object.isInstancedMesh && visiblySubmitted(object) && object.count && material
      && !Array.isArray(material) && !material.transparent && !(material.alphaTest > 0)
      && !staticObjects.includes(object)) staticObjects.push(object);
  });
  return { staticObjects, dynamicObjects };
}

function currentRecord(hit, stage) {
  if (hit.instanceId == null) return true;
  for (const [field,collection] of [['renderSites','sites'],['renderLeylines','leylines'],['renderRifts','rifts'],['renderArtifacts','artifacts']]) {
    const record = hit.object.userData[field]?.[hit.instanceId];
    if (record && !stage.world[collection]?.some(item => item && item.id === record.id
      && item.x === record.x && item.y === record.y && (field !== 'renderRifts' || visibleRift(item)))) return false;
  }
  return true;
}

// Raycast geometry actually submitted to the GPU, including mask indices.
// Hover may reuse static intersections; click and drag always take fresh ones.
export class PlanePicker {
  constructor(host) {
    this.host = host; this.raycaster = new THREE.Raycaster(); this.timeMs = 0; this.lastRaycastMs = 0;
    this.hoverStatic = null;
    this.stats = { staticRaycasts: 0, staticCacheHits: 0, dynamicQueries: 0 };
  }
  clearHoverCache() { this.hoverStatic = null; }
  /** onlyPlane samples that plane's terrain for drag paths; options are hover-only. */
  pick(x, y, width, height, onlyPlane = null, { reuseStatic = false, staticKey = null } = {}) {
    const start = performance.now(), host = this.host, camera = host.cameraRig.camera;
    camera.updateMatrixWorld(); host.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const reuse = reuseStatic && !onlyPlane && typeof staticKey === 'string';
    const cached = reuse && this.hoverStatic?.key === staticKey ? this.hoverStatic.entries : null;
    const staticEntries = cached || [];
    if (cached) this.stats.staticCacheHits++;
    const dynamicEntries = [];
    for (const stage of host.stages.values()) {
      if (!stage.visible || !stage.terrain?.mesh.visible || onlyPlane && stage.plane !== onlyPlane) continue;
      const { staticObjects, dynamicObjects } = collectObjects(stage, onlyPlane);
      if (!cached) {
        this.stats.staticRaycasts++;
        for (const hit of this.raycaster.intersectObjects(staticObjects, false)) staticEntries.push({ hit, stage });
      }
      if (dynamicObjects.length) {
        this.stats.dynamicQueries++;
        for (const hit of this.raycaster.intersectObjects(dynamicObjects, false)) dynamicEntries.push({ hit, stage });
      }
    }
    if (!cached && !onlyPlane && host.boundary?.mesh.visible && host.boundary.edges) {
      this.stats.staticRaycasts++;
      for (const hit of this.raycaster.intersectObject(host.boundary.mesh, false)) staticEntries.push({ hit, stage: null });
    }
    if (reuse && !cached) this.hoverStatic = { key: staticKey, entries: staticEntries };
    const ordered = [...staticEntries, ...dynamicEntries].sort((a,b) => a.hit.distance - b.hit.distance);
    let nearest = null;
    const inaccessibleStages = new Set();
    for (const { hit, stage } of ordered) {
      if (!stage) {
        const boundary = host.boundary, cell = host.coordinates.renderToWorld(hit.point.x, hit.point.z);
        if (host.world?.mapProgress && !canAccess(host.world, cell.x, cell.y)) continue;
        nearest = { ...boundary.edgeAtTriangle(hit.faceIndex), plane: null, entityId: null,
          point: hit.point, worldPoint: hit.point, world: { x: hit.point.x, y: hit.point.z },
          stage: null, distance: hit.distance };
        break;
      }
      if (inaccessibleStages.has(stage)) continue;
      if (!currentRecord(hit, stage)) continue;
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
      if (host.world?.mapProgress && !canAccess(host.world, world.x, world.y)) {
        inaccessibleStages.add(stage); continue;
      }
      const cell = record ? { x: Math.max(0, Math.min(stage.world.w - 1, Math.floor(record.x))),
        y: Math.max(0, Math.min(stage.world.h - 1, Math.floor(record.y))) }
        : stage.coordinates.renderPointToCell(hit.point);
      nearest = { ...cell, plane: stage.plane, entityId: entity?.id,
        entityContainer: entity?.identityContainer,
        settlementId: settlement?.settlementId ?? building?.settlementId,
        houseKey: building?.houseKey, houseX: building?.houseX, houseY: building?.houseY,
        artifactId: artifact?.id, siteId: site?.id, leylineId: leyline?.id, riftId: rift?.id,
        kind: hit.object === stage.terrainSides?.mesh ? 'world-edge' : entity ? 'entity' : settlement ? 'settlement'
          : building ? 'house' : artifact ? 'artifact' : site ? 'site' : leyline ? 'leyline' : rift ? 'rift' : 'terrain',
        point: hit.point, worldPoint: hit.point, world, stage, distance: hit.distance };
      break;
    }
    this.timeMs = performance.now() - start; this.lastRaycastMs = this.timeMs;
    return nearest;
  }
}

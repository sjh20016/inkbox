import * as THREE from 'three';

// Raycast the geometry actually submitted to the GPU, including its mask index.
// Depth wins at oblique angles; selecting an invisible plane behind a hill is wrong.
export class PlanePicker {
  constructor(host) { this.host = host; this.raycaster = new THREE.Raycaster(); this.timeMs = 0; this.lastRaycastMs = 0; }
  pick(x, y, width, height) {
    const start = performance.now(), host = this.host, camera = host.cameraRig.camera;
    camera.updateMatrixWorld(); host.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    let nearest = null;
    for (const stage of host.stages.values()) {
      if (!stage.visible || !stage.terrain?.mesh.visible) continue;
      const objects = [stage.terrain.mesh];
      // Entity silhouettes are pickable too: a tall ghost must not inspect the
      // mortal terrain visible behind it. Instanced hits resolve via stage data.
      if (stage.entities?.group.visible) stage.entities.group.traverse(object => {
        if (object.isInstancedMesh && object.visible && object.count) objects.push(object);
      });
      const hit = this.raycaster.intersectObjects(objects, false)[0];
      if (!hit || (nearest && nearest.distance <= hit.distance)) continue;
      const entity = hit.instanceId == null ? null : hit.object.userData.renderEntities?.[hit.instanceId];
      const world = entity ? { x: entity.x, y: entity.y } : stage.coordinates.renderToWorld(hit.point.x, hit.point.z);
      const cell = entity ? { x: Math.max(0, Math.min(stage.world.w - 1, Math.floor(entity.x))), y: Math.max(0, Math.min(stage.world.h - 1, Math.floor(entity.y))) }
        : stage.coordinates.renderPointToCell(hit.point);
      nearest = { ...cell, plane: stage.plane, entityId: entity?.id,
        point: hit.point, worldPoint: hit.point, world, stage, distance: hit.distance };
    }
    this.timeMs = performance.now() - start; this.lastRaycastMs = this.timeMs;
    return nearest;
  }
}

import * as THREE from 'three';
import { TERRAIN_INFO } from '../../core/config.js';
import { ElevationField } from '../terrain/ElevationField.js';
import { RENDER_ORDER } from '../shared/RenderOrder.js';

const MAX_CELLS_PER_SIDE = 20;

function validateRegion(region, world) {
  if (region?.path != null) throw new TypeError('SlabPrototype accepts rectangle bounds only, not polygon paths.');
  const { x0, y0, x1, y1 } = region || {};
  if (![x0, y0, x1, y1].every(Number.isInteger)) {
    throw new TypeError('SlabPrototype region must use integer x0/y0/x1/y1 coordinates.');
  }
  if (x0 < 0 || y0 < 0 || x1 >= world.w || y1 >= world.h || x1 <= x0 || y1 <= y0) {
    throw new RangeError('SlabPrototype region must be an in-bounds rectangle at least 2×2 cells.');
  }
  if (x1 - x0 > MAX_CELLS_PER_SIDE || y1 - y0 > MAX_CELLS_PER_SIDE) {
    throw new RangeError(`SlabPrototype is limited to ${MAX_CELLS_PER_SIDE} cells per side.`);
  }
  return { x0, y0, x1, y1 };
}

function makeTerrainPalette() {
  return TERRAIN_INFO.map(({ color }) => new THREE.Color(`rgb(${color.join(',')})`));
}

function makeGeometry(vertexCount, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function writeColor(attribute, index, world, cellIndex, palette) {
  const color = palette[world.type[cellIndex]] || palette[5];
  attribute.setXYZ(index, color.r, color.g, color.b);
}

/**
 * Small rectangular geometry probe for comparing one target-world patch with
 * the terrain below it. It only reads world data; callers own scene mounting.
 *
 * @param {{mortalWorld: object, targetWorld: object, coordinates: object,
 *   region: {x0:number,y0:number,x1:number,y1:number}}} options
 * @returns {SlabPrototype}
 */
export class SlabPrototype {
  constructor({ mortalWorld, targetWorld, coordinates, region, mortalElevation, targetElevation }) {
    if (!mortalWorld || !targetWorld || !coordinates?.cellToRender) {
      throw new TypeError('SlabPrototype requires mortalWorld, targetWorld, and coordinates.');
    }
    // 缺省只为历史研究调用保留（等价 RAW）；Host 永远显式传入两侧 stage.elevation。
    mortalElevation = mortalElevation || new ElevationField(mortalWorld);
    targetElevation = targetElevation || new ElevationField(targetWorld);
    if (mortalWorld.w !== targetWorld.w || mortalWorld.h !== targetWorld.h) {
      throw new RangeError('SlabPrototype worlds must have matching dimensions.');
    }
    this.mortalWorld = mortalWorld;
    this.targetWorld = targetWorld;
    this.mortalElevation = mortalElevation;
    this.targetElevation = targetElevation;
    this.coordinates = coordinates;
    this.region = validateRegion(region, targetWorld);
    this.root = new THREE.Group();
    this.group = this.root;
    this.palette = makeTerrainPalette();

    const { x0, y0, x1, y1 } = this.region;
    const columns = x1 - x0 + 1, rows = y1 - y0 + 1;
    const surfaceIndices = new Uint32Array((columns - 1) * (rows - 1) * 6);
    let cursor = 0;
    for (let y = 0; y < rows - 1; y++) for (let x = 0; x < columns - 1; x++) {
      const a = y * columns + x, b = a + 1, c = a + columns, d = c + 1;
      surfaceIndices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
    this.surfaceGeometry = makeGeometry(columns * rows, surfaceIndices);
    this.surfaceMesh = new THREE.Mesh(this.surfaceGeometry, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    }));
    this.root.add(this.surfaceMesh);
    this.surfaceMesh.renderOrder = RENDER_ORDER.terrain;

    // One independent quad per perimeter cell interval. Unique vertices keep
    // the bottom and top endpoints exactly aligned with both terrain surfaces.
    this.edges = [];
    for (let x = x0; x < x1; x++) {
      this.edges.push([[x, y0], [x + 1, y0]]);
      this.edges.push([[x, y1], [x + 1, y1]]);
    }
    for (let y = y0; y < y1; y++) {
      this.edges.push([[x0, y], [x0, y + 1]]);
      this.edges.push([[x1, y], [x1, y + 1]]);
    }
    const wallIndices = new Uint32Array(this.edges.length * 6);
    for (let i = 0; i < this.edges.length; i++) wallIndices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    this.wallGeometry = makeGeometry(this.edges.length * 4, wallIndices);
    this.wallMesh = new THREE.Mesh(this.wallGeometry, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    }));
    this.root.add(this.wallMesh);
    this.wallMesh.renderOrder = RENDER_ORDER.realmBoundary;

    const surfaceTriangles = (columns - 1) * (rows - 1) * 2;
    this.stats = {
      vertices: columns * rows + this.edges.length * 4,
      triangles: surfaceTriangles + this.edges.length * 2,
      surfaceTriangles,
      wallTriangles: this.edges.length * 2,
    };
    this.update();
  }

  /** Refresh geometry and colors from the current worlds without changing them. */
  update() {
    const { x0, y0, x1, y1 } = this.region;
    const { targetWorld, mortalWorld, coordinates, palette } = this;
    const position = this.surfaceGeometry.attributes.position;
    const color = this.surfaceGeometry.attributes.color;
    const columns = x1 - x0 + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const localIndex = (y - y0) * columns + x - x0;
      const worldIndex = y * targetWorld.w + x;
      const point = coordinates.cellToRender(x, y);
      position.setXYZ(localIndex, point.x, this.targetElevation.at(x, y), point.z);
      writeColor(color, localIndex, targetWorld, worldIndex, palette);
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.surfaceGeometry.computeVertexNormals();
    this.surfaceGeometry.computeBoundingBox();
    this.surfaceGeometry.computeBoundingSphere();

    const wallPosition = this.wallGeometry.attributes.position;
    const wallColor = this.wallGeometry.attributes.color;
    for (let edgeIndex = 0; edgeIndex < this.edges.length; edgeIndex++) {
      const edge = this.edges[edgeIndex];
      for (let end = 0; end < 2; end++) {
        const [x, y] = edge[end];
        const point = coordinates.cellToRender(x, y);
        const targetIndex = y * targetWorld.w + x;
        const mortalIndex = y * mortalWorld.w + x;
        const topHeight = this.targetElevation.at(x, y);
        const bottomHeight = this.mortalElevation.at(x, y);
        const topVertex = edgeIndex * 4 + end * 2;
        const bottomVertex = topVertex + 1;
        wallPosition.setXYZ(topVertex, point.x, topHeight, point.z);
        wallPosition.setXYZ(bottomVertex, point.x, bottomHeight, point.z);
        writeColor(wallColor, topVertex, targetWorld, targetIndex, palette);
        writeColor(wallColor, bottomVertex, mortalWorld, mortalIndex, palette);
      }
    }
    wallPosition.needsUpdate = true;
    wallColor.needsUpdate = true;
    this.wallGeometry.computeVertexNormals();
    this.wallGeometry.computeBoundingBox();
    this.wallGeometry.computeBoundingSphere();
    return this;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.remove(this.surfaceMesh, this.wallMesh);
    this.surfaceGeometry.dispose();
    this.wallGeometry.dispose();
    this.surfaceMesh.material.dispose();
    this.wallMesh.material.dispose();
  }
}

export default SlabPrototype;

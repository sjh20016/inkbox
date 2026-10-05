import * as THREE from 'three';
import { EnvironmentBatch } from '../environment/EnvironmentBatch.js';
import { decorationFootprintOwned, decorationGround } from '../environment/RealmDecorationLayer.js';
import { projectedPixels, chooseLOD, budgetLOD } from '../lod/PresentationBudget.js';
import { TERRAIN_INFO } from '../../core/config.js';

const CAPACITY = 256;
const SITE_ASSETS = Object.freeze({ cave: 'mortal.site.cave' });

/** Receives the marker layer's single derivation. Owns only fixed instance buffers. */
export class SiteGeographyLayer {
  constructor(world, coordinates, elevation) {
    this.world = world; this.coordinates = coordinates; this.elevation = elevation;
    this.group = new THREE.Group(); this.group.name = 'SiteGeographyLayer';
    this.batch = null; this.enabled = false; this.productionEnabled = false;
    this.regionGeometry = null; this.regionInside = true; this.view = {}; this.lodEnabled = true;
    this.derived = null; this.renderedIds = new Set(); this.lods = new Map();
    this.stats = { instances: 0, triangles: 0, drawCalls: 0, lod: [0,0,0], overflow: 0, capacity: CAPACITY, siteCount: 0, fallback: 0, maskRejected: 0 };
  }
  setEnvironmentAssets(library, material, enabled) {
    if (this.batch && (!library || this.batch.library !== library || this.batch.material !== material)) {
      this.batch.group.removeFromParent(); this.batch.dispose(); this.batch = null;
    }
    const ids = worldAssets(this.world, library);
    if (enabled && library && material && ids.length && !this.batch) {
      this.batch = new EnvironmentBatch(library, { material, capacity: CAPACITY, assetIds: ids, pickField: 'renderSites' });
      this.group.add(this.batch.group);
    }
    this.productionEnabled = !!enabled; this.write();
  }
  setEnabled(enabled) { this.enabled = !!enabled; this.write(); }
  setRegionGeometry(region, inside = true) { this.regionGeometry = region; this.regionInside = !!inside; this.write(); }
  setLODEnabled(enabled) { this.lodEnabled = !!enabled; this.write(); }
  setArtView(view) {
    const changed = this.view.pixelsPerUnit !== view?.pixelsPerUnit || this.view.verticalPixelsPerUnit !== view?.verticalPixelsPerUnit;
    this.view = view || {}; if (changed) this.write();
  }
  update(derived) { this.derived = derived; this.write(); }
  write() {
    const records = [], counts = [0,0,0], active = new Set();
    this.renderedIds.clear(); let siteCount = 0, maskRejected = 0, overflow = 0, demoted = 0;
    for (const [kind, items] of Object.entries(this.derived?.sites || {})) for (const item of items) {
      active.add(item.id);
      if (!centerOwned(this.regionGeometry, this.regionInside, item)) continue;
      siteCount++;
      const assetId = SITE_ASSETS[kind];
      if (!this.enabled || !this.productionEnabled || !this.batch || !assetId || !this.batch.assetIds.includes(assetId)) continue;
      const shape = this.batch.library.assetInfo(assetId).footprint;
      const footprint = { x: item.x, y: item.y, width: shape.width, depth: shape.depth, h: shape.height, rotationY: 0 };
      if (!decorationFootprintOwned(this.world, this.regionGeometry, this.regionInside, footprint) || !terrainSuitable(this.world, footprint)) { maskRejected++; continue; }
      if (records.length >= CAPACITY) { overflow++; continue; }
      const ground = decorationGround(this.elevation, footprint);
      const p = this.coordinates.worldToRender(item.x, item.y, ground);
      const desired = chooseLOD('site', projectedPixels(shape.height, this.view, shape.width), this.lods.get(item.id), this.lodEnabled);
      const budget = this.lodEnabled ? budgetLOD('site', desired, counts) : { lod: 0, demoted: false };
      if (budget.demoted) demoted++;
      this.lods.set(item.id, budget.lod); this.renderedIds.add(item.id);
      records.push({ assetId, lod: budget.lod, position: { x:p.x, y:ground, z:p.z }, scale: { x:shape.width, y:shape.height, z:shape.depth }, rotationY:0,
        source: { id:item.id, x:item.x, y:item.y, kind } });
    }
    for (const id of this.lods.keys()) if (!active.has(id)) this.lods.delete(id);
    this.batch?.write(records);
    this.stats = { ...(this.batch?.stats || { instances:0,triangles:0,drawCalls:0,lod:[0,0,0],overflow:0 }), capacity:CAPACITY,
      siteCount, fallback:siteCount-records.length, maskRejected, demoted, overflow:overflow+(this.batch?.stats.overflow || 0) };
  }
  dispose() { this.batch?.dispose(); this.batch=null; this.group.clear(); this.derived=null; this.renderedIds.clear(); this.lods.clear(); }
}
function worldAssets(world, library) {
  if (world?.plane !== 'mortal' || !library || library.disposed) return [];
  return Object.values(SITE_ASSETS).filter(id => library.manifest?.assets?.[id]);
}
function centerOwned(region, inside, item) { return !region || region.allInside || region.isInsideCell(item.x,item.y) === inside; }
function terrainSuitable(world, f) {
  let min=Infinity,max=-Infinity;
  for(let y=Math.floor(f.y-f.depth/2);y<=Math.ceil(f.y+f.depth/2);y++) for(let x=Math.floor(f.x-f.width/2);x<=Math.ceil(f.x+f.width/2);x++) {
    if(x<0||y<0||x>=world.w||y>=world.h) return false;
    const i=y*world.w+x,h=world.height[i];
    if(!Number.isFinite(h)||!TERRAIN_INFO[world.type[i]]||TERRAIN_INFO[world.type[i]].water) return false;
    min=Math.min(min,h);max=Math.max(max,h);
  }
  return max-min <= .25;
}

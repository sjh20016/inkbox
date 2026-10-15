import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { readEnvironmentLibrary } from './inkbox-environment-glb-reader.mjs';
import { RealmDecorationLayer,deriveRealmDecorations,decorationFootprintOwned,decorationGround,DECORATION_BUDGETS } from '../src/inkbox/render3d/environment/RealmDecorationLayer.js';
import { createCoordinates } from '../src/inkbox/render3d/coordinates.js';
import { ElevationField } from '../src/inkbox/render3d/terrain/ElevationField.js';
import { RegionGeometry } from '../src/inkbox/render3d/region/RegionGeometry.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { createEnvironmentMaterial } from '../src/inkbox/render3d/environment/EnvironmentMaterial.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/decorations/node');
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const report={suite:'M2-C2B natural decorations',pass:false,checks:[],planes:[]};
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log('PASS '+name);};
const library=readEnvironmentLibrary(ROOT),camera=new THREE.OrthographicCamera(-90,90,70,-70,.1,2000);camera.position.set(0,180,120);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
try{
 check('natural shipping geometry has no building semantics, one material and low closed-volume LODs',()=>{
  for(const kind of ['rock','cliff','pillar','terrace','slab']){const asset=library.assetInfo('environment.'+kind);assert.equal(asset.pick,'none');assert.deepEqual(asset.lods.map(n=>library.modules.get(n).triangles),[42,20,6]);assert(!asset.hlod);assert(asset.revision.includes('crossbeams'));}
 });
 for(const generate of [generateUpperWorld,generateNetherWorld]){
  const world=generate({preset:{w:128,h:96},seed:20260923}),before=sha(world),layout=deriveRealmDecorations(world),elevation=new ElevationField(world);
  const material=createEnvironmentMaterial(library,world.plane),layer=new RealmDecorationLayer(world,createCoordinates(world),elevation);
  try{
   layer.setEnvironmentAssets(library,material,true);layer.setArtView({pixelsPerUnit:12,verticalPixelsPerUnit:12,camera});layer.update();
   check(world.plane+' deterministic terrain-only layout, bounded screen density and camera-independent distribution',()=>{
    assert(layout.length>0);assert.deepEqual(layer.layout,layout);assert.deepEqual(deriveRealmDecorations(world),layout);assert(layout.length<=DECORATION_BUDGETS[world.plane].capacity);assert.equal(new Set(layout.map(r=>r.cell)).size,layout.length);
    const identity=layer.layout;camera.position.x+=3;camera.updateMatrixWorld(true);layer.setArtView({pixelsPerUnit:14,verticalPixelsPerUnit:13,camera});assert.equal(layer.layout,identity);
    assert(layer.stats.instances>0);assert(layer.stats.instances<=layer.budget.screen);assert(layer.stats.lod[0]<=layer.budget.detail);assert.equal(sha(world),before);
   });
   check(world.plane+' rotated whole-footprint ownership rejects center-only leaks and keeps every submitted quad owned',()=>{
    const r=layout.find(r=>r.x>8&&r.y>8&&r.x<world.w-8&&r.y<world.h-8&&r.width>3&&Math.abs(Math.cos(r.rotationY))>.5);assert(r);
    const tiny=new RegionGeometry(world,new RegionMask(normalizeRegion([[r.x-1,r.y-2],[r.x+1,r.y-2],[r.x+1,r.y+2],[r.x-1,r.y+2]],world,.45)));
    assert(tiny.isInsideCell(r.x,r.y));assert(!decorationFootprintOwned(world,tiny,true,r),'covering the center cannot authorize the rotated prop');
    const region=new RegionGeometry(world,new RegionMask(normalizeRegion([[20,15],[100,15],[100,75],[65,75],[65,45],[20,45]],world,.45)));
    layer.setRegionGeometry(region,true);layer.update();
    const rows=[...layer.batch.meshes.values()].flatMap(m=>m.userData.decorativeOnly);
    assert(rows.length>0);assert(rows.every(r=>decorationFootprintOwned(world,region,true,r)));
    assert(rows.every(r=>r.id==null&&r.siteId==null&&r.entityId==null&&r.houseKey==null));
    layer.setRegionGeometry(region,false);layer.update();assert([...layer.batch.meshes.values()].flatMap(m=>m.userData.decorativeOnly).every(r=>decorationFootprintOwned(world,region,false,r)));
   });
   check(world.plane+' Stage elevation anchor, decoration toggle and disposal preserve world and shared resources',()=>{
    const r=layout[0],ground=decorationGround(elevation,r);assert(ground<=elevation.at(r.x,r.y));
    layer.setEnvironmentAssets(library,material,false);layer.update();assert.equal(layer.stats.instances,0);
    layer.setEnvironmentAssets(library,material,true);layer.setRegionGeometry(null,true);layer.update();assert(layer.stats.instances>0);
    assert.equal(layer.batch.material,material);assert.equal(layer.batch.material.uniforms.uEnvironmentAtlas.value,library.texture);
    assert.equal(sha(world),before);report.planes.push({plane:world.plane,layout:layout.length,stats:layer.stats,worldSha:before});
   });
  }finally{layer.dispose();material.dispose();}
 }
 report.pass=true;
}finally{library.dispose();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(report,null,2)+'\n');}

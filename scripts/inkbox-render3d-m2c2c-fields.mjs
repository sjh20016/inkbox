import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { ScalarFieldTexture } from '../src/inkbox/render3d/art/ScalarFieldTexture.js';
import { makeTestHost } from './inkbox-c2c-test-utils.mjs';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { RegionMask } from '../src/inkbox/ui/RegionMask.js';
import { normalizeRegion } from '../src/inkbox/ui/tools.js';

const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/local/m2c2c/fields');
const report={suite:'C2C scalar field cache and Stage isolation',checks:[],gpu:false};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
const preset={w:64,h:48};
function worlds(seed=509){const world=generateWorld({preset,seed,scatter:true});
  world.upper=generateUpperWorld({preset,seed});world.nether=generateNetherWorld({preset,seed});return world;}
check('one byte per cell, finite clamped source values and explicit R8 upload contract',()=>{
  // Explicit boundary-value test fixture, outside the simulation.
  const world={w:3,h:2,size:6,plane:'nether',veg:new Float32Array([NaN,-1,0,.5,1,2])};
  const field=new ScalarFieldTexture(world,'veg',2);field.setEnabled(true);
  assert.deepEqual([...field.bytes],[0,0,0,128,255,255]);
  assert.equal(field.texture.format,THREE.RedFormat);assert.equal(field.texture.type,THREE.UnsignedByteType);
  assert.equal(field.texture.colorSpace,THREE.NoColorSpace);assert.equal(field.texture.unpackAlignment,1);
  assert.equal(field.texture.image.data.byteLength,world.size);assert.equal(field.stats.uploads,1);
  assert.equal(field.texture.flipY,false);assert.equal(field.texture.generateMipmaps,false);
  assert.deepEqual(field.texture.updateRanges,[],'r186 partial updateRanges only support RGBA, not RED');field.dispose();
});
check('bounded 4Hz refresh uploads only changed quantized field bytes',()=>{
  const world=worlds().nether,field=new ScalarFieldTexture(world,'veg',2);field.setEnabled(true);
  const initial=field.stats.uploads,scans=field.stats.scans;
  for(let i=0;i<600;i++)field.update(1/60);
  assert.equal(field.stats.uploads,initial);assert(field.stats.scans-scans<=41);
  world.veg[0]=world.veg[0]<.8?world.veg[0]+.1:world.veg[0]-.1;
  for(let i=0;i<20;i++)field.update(1/60);
  assert.equal(field.stats.uploads,initial+1);assert.equal(field.stats.changedCells,world.size+1);
  assert.equal(field.stats.uploadBytes,(initial+1)*world.size);field.dispose();
});
check('disabled cache retains texture identity and synchronizes missed source changes on enable',()=>{
  const world=worlds().nether,field=new ScalarFieldTexture(world,'veg',2);field.setEnabled(true);
  const texture=field.texture,uploads=field.stats.uploads;field.setEnabled(false);
  world.veg[5]=.987;for(let i=0;i<120;i++)field.update(1/60);
  assert.equal(field.stats.uploads,uploads);field.setEnabled(true);
  assert.equal(field.texture,texture);assert.equal(field.bytes[5],Math.round(world.veg[5]*255));
  assert.equal(field.stats.uploads,uploads+1);field.dispose();
});
const world=worlds(),before=sha(world),host=makeTestHost(world,{geography:true});
try{
  host.setArtProfile('realm-style-v1');
  for(const [plane,key,mode] of [['nether','veg',2],['upper','qi',1]]){
    // Package 6 supports Nether; Package 7 enables the Upper branch in this same gate.
    if(plane==='upper'&&(process.argv.includes('--nether-only')||process.env.INKBOX_FIELDS_PACKAGE6==='1'))continue;
    check(`${plane} reads only its own ${key}, material uniform and cache identities`,()=>{
      host.setActivePlane(plane);host.update(.3);const stage=host.stages.get(plane),field=stage.scalarField;
      assert.equal(field.world,stage.world);assert.equal(field.key,key);assert(field.enabled&&field.texture);
      assert.equal(stage.terrain.inkMaterial.uniforms.fieldMode.value,mode);
      assert.equal(stage.terrain.inkMaterial.uniforms.fieldTexture.value,field.texture);
      for(let i=0;i<world.size;i++)assert.equal(field.bytes[i],Math.round(Math.min(1,Math.max(0,stage.world[key][i]))*255));
      assert.equal(field.bytes.length,world.size);assert.equal(host.stages.get('mortal').scalarField,null);
      report[plane]={...field.stats};
    });
  }
  check('existing quad Region masks govern field material without sharing realm textures',()=>{
    const region=new RegionMask(normalizeRegion([[10,9],[44,9],[44,35],[10,35]],world,.45));
    host.setActivePlane('mortal');host.setRealmViewState({open:true,targetPlane:'nether',region});host.update(.3);
    const mortal=host.stages.get('mortal'),nether=host.stages.get('nether');
    assert.equal(mortal.regionInside,false);assert.equal(nether.regionInside,true);
    assert.equal(nether.terrain.regionGeometry,nether.regionGeometry);assert(nether.terrain.keptQuads>0);
    assert.equal(nether.scalarField.world,world.nether);assert.equal(nether.scalarField.bytes.length,world.size);
    const upper=host.stages.get('upper').scalarField;if(upper?.texture)assert.notEqual(upper.texture,nether.scalarField.texture);
  });
  check('feature/profile toggles preserve material and texture ownership, World and save facts',()=>{
    const stage=host.stages.get('nether'),field=stage.scalarField,texture=field.texture,material=stage.terrain.inkMaterial;
    const source=material.fragmentShader;
    for(let i=0;i<50;i++){host.setGeographyEnabled(i%2===0);host.setArtProfile(i%3?'realm-style-v1':'legacy');host.update(.3);}
    host.setArtProfile('realm-style-v1');host.setGeographyEnabled(true);host.update(.3);
    assert.equal(field.texture,texture);assert.equal(stage.terrain.inkMaterial,material);assert.equal(material.fragmentShader,source);
    assert.equal(sha(world),before);
  });
  check('World replacement disposes each owned scalar texture once',()=>{
    const fields=[...host.stages.values()].map(s=>s.scalarField).filter(f=>f?.texture);let disposals=0;
    for(const f of fields)f.texture.addEventListener('dispose',()=>disposals++);
    host.setWorld(worlds(510));host.update(.3);assert.equal(disposals,fields.length);assert(fields.every(f=>f.disposed));
    assert.equal(host.stages.get('nether').scalarField.world,host.world.nether);
  });
}finally{host.dispose();}
report.passed=true;fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'fields.json'),JSON.stringify(report,null,2));

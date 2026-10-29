import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WORLD_PRESETS} from '../src/inkbox/core/config.js';
import {generateNetherStrataCandidate} from '../src/inkbox/world/netherStrataCandidate.js';
import {ElevationField} from '../src/inkbox/render3d/terrain/ElevationField.js';
import {deriveInkflameField,LEGACY_INKFLAME} from '../src/inkbox/render3d/nether/NetherInkflame.js';
import {NetherSoulfireLayer,SOULFIRE_CAPACITY} from '../src/inkbox/render3d/nether/NetherSoulfireLayer.js';
import {PlaneStage} from '../src/inkbox/render3d/stage/PlaneStage.js';
import {createCoordinates} from '../src/inkbox/render3d/coordinates.js';
import {ART_PROFILES} from '../src/inkbox/render3d/art/ArtPassProfile.js';
import {shanhaiStyleFor} from '../src/inkbox/render3d/shanhai/ShanhaiStyle.js';
import {serializeWorld} from '../src/inkbox/io/save.js';

const full={tone:'inkflame',soulfire:'flow',cliffInk:'full',lowMist:true};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const preset of Object.values(WORLD_PRESETS))for(const seed of [0,1,42,20260914,0xffffffff]){
  const world=generateNetherStrataCandidate({preset,seed}),elevation=new ElevationField(world);
  const before=world.height.slice(),water=world.water.slice(),yin=world.veg.slice();
  const field=deriveInkflameField(world,elevation),repeat=deriveInkflameField(world,elevation);
  assert.equal(hash(field.bytes),hash(repeat.bytes),'visual field is seed deterministic');
  assert.equal(field.bytes.length,world.size*4);assert(field.stats.upper>world.size*.01);
  assert(field.stats.lower>world.size*.05&&field.stats.middle>world.size*.01,'three readable registers across families');
  for(let i=0;i<world.size;i++)assert(Math.abs(field.bytes[i*4]+field.bytes[i*4+1]+field.bytes[i*4+2]-255)<=1,'finite normalized masks');
  assert(field.foot.x>=0&&field.foot.y>=0&&field.foot.x<world.w&&field.foot.y<world.h);
  assert.deepEqual(world.height,before);assert.deepEqual(world.water,water);assert.deepEqual(world.veg,yin);
  console.log(`${preset.key}/${seed}: upper=${field.stats.upper} middle=${field.stats.middle} lower=${field.stats.lower}`);
}

// Same height, different surrounding depression and real yin/wet facts must
// produce different qualification; the mask is not a height-only cutoff.
const w=64,h=48,size=w*h,synthetic={w,h,size,height:new Float32Array(size).fill(.6),water:new Float32Array(size),veg:new Float32Array(size).fill(.15)};
for(let y=8;y<40;y++)for(let x=8;x<56;x++)synthetic.height[y*w+x]=.45;
const target=24*w+24;synthetic.height[target]=.45;
const before=deriveInkflameField(synthetic,new ElevationField(synthetic));
for(let y=20;y<29;y++)for(let x=20;x<29;x++){synthetic.veg[y*w+x]=.9;if(y===24&&x>24)synthetic.water[y*w+x]=.035;}
for(const [x,y]of [[18,24],[30,24],[24,18],[24,30]])synthetic.height[y*w+x]=1.1;
const after=deriveInkflameField(synthetic,new ElevationField(synthetic));
assert.equal(synthetic.height[target],Math.fround(.45));
assert(after.bytes[target*4+2]>before.bytes[target*4+2]||after.bytes[target*4+3]>before.bytes[target*4+3],'hollow/yin/water change a same-height mask');

const world=generateNetherStrataCandidate({preset:WORLD_PRESETS.small,seed:42});
const facts=JSON.stringify(serializeWorld(world)),stage=new PlaneStage({plane:'nether',world});
assert.equal(stage.netherInkflame,null,'no product-default field or plume allocation');
stage.terrain.setArtProfile({...ART_PROFILES['shanhai-v1'],realmStyle:shanhaiStyleFor('nether')});
stage.terrainLines.setStyle(shanhaiStyleFor('nether').shanhai.lines);
stage.setNetherStrataEnabled(true);stage.setNetherInkflame(full);
const layer=stage.netherInkflame,material=stage.terrain.inkMaterial;
assert(layer.texture&&layer.mesh);assert(layer.stats.instances>0&&layer.stats.instances<=SOULFIRE_CAPACITY);
assert.equal(layer.geometry.index.count,6);assert(layer.mesh.userData.presentationOnly);
for(const m of [material,stage.netherCliffs.material,stage.terrainLines.strokeMaterial]){
  assert.equal(m.uniforms.nfField.value,layer.texture,'all effects borrow the same Stage-owned classification');
  assert.deepEqual(m.uniforms.nfBand.value.toArray(),layer.field.band);
}
const snapshot={...layer.stats},texVersion=layer.texture.version;
for(let i=0;i<80;i++){stage.update(.016);stage.setNetherInkflameTime(i*.016);}
assert.equal(layer.stats.rebuilds,snapshot.rebuilds,'idle frames do not rescan terrain');
assert.equal(layer.stats.instanceWrites,snapshot.instanceWrites,'idle frames do not rewrite instances');
assert.equal(layer.texture.version,texVersion,'idle frames do not reupload field');
assert.equal(material.uniforms.nfClock.value,79*.016,'render time is supplied by the existing Host');
assert.equal(world.day,0);
stage.setNetherInkflame({...full,soulfire:'static'});assert.equal(layer.material.uniforms.nfOptions.value.z,1);
stage.setNetherInkflame({...full,soulfire:'off'});assert.equal(layer.mesh,null,'off releases the plume batch');
stage.setNetherInkflame(full);
const mask={x0:10,y0:10,x1:110,y1:100,contains:(x,y)=>x>=10&&x<=110&&y>=10&&y<=100};
stage.setRegionMask(mask,true);
const writes=layer.stats.instanceWrites;
for(let i=0;i<12;i++){stage.setRegionMask(mask,true);stage.update(.016);}
assert.equal(layer.stats.instanceWrites,writes,'Region identity cache holds for plumes');
for(let i=0;i<layer.mesh.count;i++){
  const a=layer.mesh.instanceMatrix.array,ix=Math.round(a[i*16+12]+(world.w-1)/2),iy=Math.round(a[i*16+14]+(world.h-1)/2);
  assert(stage.contentGeometry.isInsideQuad(ix,iy),'plume anchors obey actual Region');
}
stage.setRegionMask(null);stage.setElevationProfile({datum:-4,relief:1.3});
assert(layer.stats.rebuilds>snapshot.rebuilds,'elevation changes invalidate derived masks');
assert.deepEqual(material.uniforms.nfBand.value.toArray(),layer.field.band,'height register follows the authority');
assert.deepEqual(layer.material.uniforms.nfBand.value.toArray(),layer.field.band);
assert.equal(JSON.stringify(serializeWorld(world)),facts,'settings/clock/Region/elevation do not mutate saved facts or runtime RNG');
const resources=[layer.texture,layer.geometry,layer.material];let disposals=0;
for(const r of resources)r.addEventListener('dispose',()=>disposals++);
stage.setNetherInkflame(LEGACY_INKFLAME);
assert.equal(stage.netherInkflame,null);assert.equal(disposals,3);
assert(material.uniforms.nfOptions.value.toArray().every(v=>v===0));
assert.equal(material.uniforms.nfField.value,stage.terrain.artData.typeTexture,'baseline fallback borrows old texture');
stage.setNetherInkflame(full);const replaced=stage.netherInkflame;
stage.setWorld(generateNetherStrataCandidate({preset:WORLD_PRESETS.small,seed:1}));
assert(replaced.disposed&&replaced.world===null);assert.equal(stage.netherInkflame,null);
stage.dispose();assert.equal(stage.root.children.length,0);

// Direct ownership also holds without a Stage and with the all-outside Region.
const direct=new NetherSoulfireLayer(world,createCoordinates(world),new ElevationField(world));direct.setOptions(full);
direct.setRegionGeometry({isInsideQuad:()=>true},false);assert.equal(direct.mesh.count,0);
direct.dispose();direct.dispose();assert.equal(direct.world,null);
console.log('D-N2A.1 masks, facts, sampler sharing, idle budget, Region, rollback and lifecycle passed.');

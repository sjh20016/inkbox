import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'assets/environment');
const sourceSpecs = [
  { id: 'mortal.house.base', name: 'house_base', file: '美术素材/实验建筑资产/建筑/bld_house.glb', triangles: 80, variant: 'base', roof: 'gable' },
  { id: 'mortal.house.small', name: 'house_small', file: '美术素材/实验建筑资产/宗门宅院/bld_hut.glb', triangles: 128, variant: 'small', roof: 'thatch' },
  { id: 'mortal.house.courtyard', name: 'house_courtyard', file: '美术素材/实验建筑资产/宗门宅院/bld_manor.glb', triangles: 188, variant: 'courtyard', roof: 'hip', remap: {12:9,13:10,14:9} },
  { id: 'mortal.house.hall', name: 'house_hall', file: '美术素材/实验建筑资产/建筑/bld_hall.glb', triangles: 116, variant: 'hall', roof: 'gable', binding: 'current-struct-hall', remap: {12:9,13:10,14:9} },
];
const SLOT = Object.freeze({ paper: 0, ink: 4, wood: 9, clay: 11 });
const semanticSlots = [
  'paper','paperDeep','paperShade','mist','ink','inkMid','inkLight','stone','stoneDark','wood','woodDark','clay','cinnabar','rouge','gold','azurite','indigo','malachite','pineGreen','orchid','upperA','upperB','upperC','upperD','nether','netherMid','soulFlame','snow',
];

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function indexPng() {
  const width = 128, height = 128, rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1); rows[row] = 0;
    for (let x = 0; x < width; x++) {
      const slot = Math.min(7, Math.floor(x / 16)) + 8 * Math.min(7, Math.floor(y / 16));
      const at = row + 1 + x * 4;
      rows[at] = slot + 1; rows[at + 1] = 255; rows[at + 2] = 255; rows[at + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
function align4(buffer) { const pad = (4 - buffer.length % 4) % 4; return pad ? Buffer.concat([buffer, Buffer.alloc(pad)]) : buffer; }
function glb(json, binary) {
  const jsonRaw = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.concat([jsonRaw, Buffer.alloc((4 - jsonRaw.length % 4) % 4, 0x20)]);
  const binBytes = align4(binary);
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBytes.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBytes.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, jsonBytes, bh, binBytes]);
}
function readSource(spec) {
  const bytes = fs.readFileSync(path.join(root, spec.file));
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected a glTF 2.0 GLB source');
  let offset = 12, json, bin;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (kind === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8', start, start + length));
    if (kind === 0x004e4942) bin = bytes.subarray(start, start + length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error('Source GLB is missing JSON or BIN chunks');
  if (json.nodes?.length !== 1 || json.nodes[0].mesh !== 0 || json.nodes[0].translation || json.nodes[0].rotation || json.nodes[0].scale) throw new Error('Source house node must have an identity transform');
  const primitive = json.meshes?.[0]?.primitives?.[0];
  if (!primitive || json.meshes[0].primitives.length !== 1 || primitive.mode != null && primitive.mode !== 4) throw new Error('Source must contain one triangle primitive');
  const readAccessor = (index) => {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    if (!a || !v || v.byteStride) throw new Error('Unsupported source accessor layout');
    const components = a.type === 'VEC3' ? 3 : a.type === 'VEC2' ? 2 : a.type === 'SCALAR' ? 1 : 0;
    if (!components || a.componentType !== 5126 && !(a.componentType === 5123 && components === 1)) throw new Error('Unsupported source accessor type');
    const width = a.componentType === 5126 ? 4 : 2, start = (v.byteOffset || 0) + (a.byteOffset || 0), out = [];
    for (let i = 0; i < a.count * components; i++) out.push(a.componentType === 5126 ? bin.readFloatLE(start + i * width) : bin.readUInt16LE(start + i * width));
    return { values: out, count: a.count, components };
  };
  const attrs = primitive.attributes;
  if (!Number.isInteger(attrs.POSITION) || !Number.isInteger(attrs.NORMAL) || !Number.isInteger(attrs.TEXCOORD_0) || !Number.isInteger(primitive.indices)) throw new Error('Source requires POSITION/NORMAL/UV and indices');
  const p = readAccessor(attrs.POSITION), n = readAccessor(attrs.NORMAL), uv = readAccessor(attrs.TEXCOORD_0), ix = readAccessor(primitive.indices);
  if (ix.values.length / 3 !== spec.triangles || p.count !== n.count || p.count !== uv.count) throw new Error(`Unexpected authored ${spec.name} triangle or attribute count`);
  const bounds = { min: json.accessors[attrs.POSITION].min, max: json.accessors[attrs.POSITION].max };
  if (Math.abs(bounds.min[1]) > 1e-6) throw new Error('Authored house ground pivot must start at Y=0');
  uvSlotSet(uv.values);
  return { p, n, uv, indices: ix.values, bounds };
}
function unitSource(source, remap = {}) {
  const { min, max } = source.bounds, size = max.map((v, i) => v - min[i]);
  if (size.some(v => !(v > 0))) throw new Error('Source bounds must have nonzero width, height and depth');
  const positions = [], normals = [], uvs = [];
  for (let face = 0; face < source.indices.length; face += 3) {
    const ids = source.indices.slice(face, face + 3);
    for (const id of ids) {
      const x = source.p.values[id * 3], y = source.p.values[id * 3 + 1], z = source.p.values[id * 3 + 2];
      positions.push((x - (min[0] + max[0]) / 2) / size[0], (y - min[1]) / size[1], (z - (min[2] + max[2]) / 2) / size[2]);
      const normal = [source.n.values[id * 3] * size[0], source.n.values[id * 3 + 1] * size[1], source.n.values[id * 3 + 2] * size[2]];
      const length = Math.hypot(...normal) || 1; normals.push(...normal.map(v => v / length));
      const u = source.uv.values[id * 2], v = source.uv.values[id * 2 + 1];
      const slot = Math.round(v*8-.5)*8 + Math.round(u*8-.5), mapped = remap[slot];
      uvs.push(mapped == null ? u : (mapped%8+.5)/8, mapped == null ? v : (Math.floor(mapped/8)+.5)/8);
    }
  }
  return { positions, normals, uvs, indices: Array.from({ length: positions.length / 3 }, (_, index) => index) };
}
function meshBuilder() {
  const positions = [], normals = [], uvs = [], indices = [];
  const vertex = (p, slot, normal) => {
    positions.push(...p); normals.push(...normal);
    uvs.push((slot % 8 + 0.5) / 8, (Math.floor(slot / 8) + 0.5) / 8);
    return positions.length / 3 - 1;
  };
  const tri = (a, b, c, slot) => {
    const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
    let n=[uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx], l=Math.hypot(...n)||1; n=n.map(v=>v/l);
    indices.push(vertex(a,slot,n),vertex(b,slot,n),vertex(c,slot,n));
  };
  const quad=(a,b,c,d,slot)=>{tri(a,b,c,slot);tri(a,c,d,slot);};
  const box=(x0,y0,z0,x1,y1,z1,slot)=>{
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],slot);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],slot);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],slot);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],slot);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],slot);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],slot);
  };
  return { positions,normals,uvs,indices,vertex,tri,quad,box,finish(){return {positions,normals,uvs,indices};} };
}
function manualLod1(roof = 'gable') {
  const b=meshBuilder(), wall=0.64, ridge=1, depth=0.91, half=0.5;
  b.box(-half,0,-depth/2,half,wall,depth/2,SLOT.paper);
  const roofSlot = roof === 'thatch' ? SLOT.clay : SLOT.ink;
  const rx = roof === 'hip' ? .30 : half;
  b.tri([-half,wall,-depth/2],[-half,wall,depth/2],[-rx,ridge,0],roof === 'hip' ? roofSlot : SLOT.paper);
  b.tri([half,wall,depth/2],[half,wall,-depth/2],[rx,ridge,0],roof === 'hip' ? roofSlot : SLOT.paper);
  b.quad([-half,wall,-depth/2],[-rx,ridge,0],[rx,ridge,0],[half,wall,-depth/2],roofSlot);
  b.quad([half,wall,depth/2],[rx,ridge,0],[-rx,ridge,0],[-half,wall,depth/2],roofSlot);
  // A single warm timber eave beam, inset within the original unit footprint.
  b.box(-half,wall-0.025,-depth/2+0.035,half,wall+0.025,-depth/2+0.085,SLOT.wood);
  return b.finish();
}
function tinyRoof(roof = 'gable', walls = false) {
  const b=meshBuilder(), y=0, top=0.35, depth=0.88;
  const slot = roof === 'thatch' ? SLOT.clay : SLOT.ink, rx = roof === 'hip' ? .30 : .5;
  const floor = walls ? .58 : y, peak = walls ? .94 : top;
  b.quad([-0.5,floor,-depth/2],[-rx,peak,0],[rx,peak,0],[0.5,floor,-depth/2],slot);
  b.quad([0.5,floor,depth/2],[rx,peak,0],[-rx,peak,0],[-0.5,floor,depth/2],slot);
  b.tri([-0.5,floor,-depth/2],[-0.5,floor,depth/2],[-rx,peak,0],slot);
  b.tri([0.5,floor,depth/2],[0.5,floor,-depth/2],[rx,peak,0],slot);
  if (walls) {
    b.quad([-.5,0,depth/2],[.5,0,depth/2],[.5,floor,depth/2],[-.5,floor,depth/2],SLOT.paper);
    b.quad([.5,0,-depth/2],[-.5,0,-depth/2],[-.5,floor,-depth/2],[.5,floor,-depth/2],SLOT.paper);
    b.quad([.5,0,depth/2],[.5,0,-depth/2],[.5,floor,-depth/2],[.5,floor,depth/2],SLOT.paper);
    b.quad([-.5,0,-depth/2],[-.5,0,depth/2],[-.5,floor,depth/2],[-.5,floor,-depth/2],SLOT.paper);
  } else b.quad([-0.5,y,-depth/2],[0.5,y,-depth/2],[0.5,y,depth/2],[-0.5,y,depth/2],slot);
  return b.finish();
}
// Opaque tapered silhouettes, without a face, skeleton, lamp or invented role.
function ghostSilhouette(variant, lod) {
  const b=meshBuilder(), segments=lod===0?6:lod===1?4:3;
  const levels=lod===0?[[.25,.28],[.62,.48],[.87,.30]]:lod===1?[[.35,.36],[.75,.40]]:[[.60,.4]];
  const rings=levels.map(([y,r],row)=>Array.from({length:segments},(_,i)=>{
    const angle=i*Math.PI*2/segments, taper=variant===1&&row===0?.72:variant===2&&row===0?1.2:1;
    return [Math.cos(angle)*r*taper+(variant-1)*.07*y,y,Math.sin(angle)*r*.70];
  }));
  const slot=row=>row===levels.length-1?0:row%2?7:2;
  for(let i=0;i<segments;i++){
    const next=(i+1)%segments;
    b.tri([0,0,0],rings[0][next],rings[0][i],7);
    for(let row=0;row<rings.length-1;row++)b.quad(rings[row][next],rings[row][i],rings[row+1][i],rings[row+1][next],slot(row));
    b.tri([(variant-1)*.07,1,0],rings.at(-1)[i],rings.at(-1)[next],0);
  }
  return b.finish();
}
function bounds(positions) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],positions[i+a]);max[a]=Math.max(max[a],positions[i+a]);}
  return {min,max};
}
function uvSlotSet(uvs) {
  const slots = new Set();
  for (let i=0;i<uvs.length;i+=2) {
    const x=uvs[i]*8-0.5,y=uvs[i+1]*8-0.5,xi=Math.round(x),yi=Math.round(y);
    if(Math.abs(x-xi)>1e-4||Math.abs(y-yi)>1e-4||xi<0||xi>7||yi<0||yi>7) throw new Error('Authored UV must address the center of one 8x8 palette slot');
    slots.add(yi*8+xi);
  }
  return [...slots].sort((a,b)=>a-b);
}
function addMesh(binaryParts, accessors, views, data, nodeName, slotSemantics) {
  let binary=Buffer.concat(binaryParts); binary=align4(binary);
  const attrs={};
  for(const [key,values,components] of [['POSITION',data.positions,3],['NORMAL',data.normals,3],['TEXCOORD_0',data.uvs,2]]){
    const start=binary.length, bytes=Buffer.alloc(values.length*4); values.forEach((v,i)=>bytes.writeFloatLE(v,i*4)); binary=Buffer.concat([binary,bytes]);
    const view=views.length; views.push({buffer:0,byteOffset:start,byteLength:bytes.length,target:34962});
    const accessor=accessors.length, b=bounds(data.positions);
    accessors.push({bufferView:view,componentType:5126,count:values.length/components,type:`VEC${components}`,...(key==='POSITION'?b:{})});attrs[key]=accessor;
  }
  binary=align4(binary); const indexStart=binary.length, indexBytes=Buffer.alloc(data.indices.length*4); data.indices.forEach((v,i)=>indexBytes.writeUInt32LE(v,i*4)); binary=Buffer.concat([binary,indexBytes]);
  const indexView=views.length;views.push({buffer:0,byteOffset:indexStart,byteLength:indexBytes.length,target:34963});
  const indexAccessor=accessors.length;accessors.push({bufferView:indexView,componentType:5125,count:data.indices.length,type:'SCALAR',min:[0],max:[Math.max(...data.indices)]});
  binaryParts=[binary];
  const uvSlots=uvSlotSet(data.uvs);
  return {binaryParts,accessors,views,node:{name:nodeName},mesh:{name:nodeName,primitives:[{attributes:attrs,indices:indexAccessor,material:0}]},module:{triangles:data.indices.length/3,bounds:bounds(data.positions),uvSlots,semanticSlots:slotSemantics}};
}
function main() {
  fs.mkdirSync(path.join(out,'mesh'),{recursive:true});fs.mkdirSync(path.join(out,'data'),{recursive:true});fs.mkdirSync(path.join(out,'materials'),{recursive:true});
  const specs=[], assets={}, sources={};
  for (const spec of sourceSpecs) {
    const source=readSource(spec), geometries=[unitSource(source,spec.remap),manualLod1(spec.roof),tinyRoof(spec.roof),tinyRoof(spec.roof,true)];
    const lods=[0,1,2].map(lod=>`env_${spec.name}_lod${lod}`), hlod=`env_${spec.name}_hlod`;
    for (let lod=0;lod<4;lod++) { const data=geometries[lod];specs.push([lod<3?lods[lod]:hlod,data,uvSlotSet(data.uvs).map(id=>semanticSlots[id])]); }
    assets[spec.id]={id:spec.id,source:path.basename(spec.file,'.glb'),realm:'mortal',binding:spec.binding||'current-struct-house',pick:'house',lods,hlod,variant:spec.variant,roofFamily:spec.roof};
    sources[spec.id]={file:spec.file,triangles:spec.triangles,sourceBounds:source.bounds,semanticRemap:spec.remap||{},normalization:{width:1/(source.bounds.max[0]-source.bounds.min[0]),height:1/(source.bounds.max[1]-source.bounds.min[1]),depth:1/(source.bounds.max[2]-source.bounds.min[2]),pivot:'center X/Z, min Y'}};
    fs.copyFileSync(path.join(root,spec.file),path.join(out,'source',path.basename(spec.file)));
  }
  for(let variant=0;variant<3;variant++) {
    const id=`nether.ghost.${variant}`,lods=[0,1,2].map(lod=>lod===2?'env_ghost_shared_lod2':`env_ghost_${variant}_lod${lod}`);
    for(let lod=0;lod<3;lod++)if(lod!==2||variant===0){const data=ghostSilhouette(lod===2?0:variant,lod);specs.push([lods[lod],data,uvSlotSet(data.uvs).map(id=>semanticSlots[id])]);}
    assets[id]={id,source:'authored ghost silhouette',realm:'nether',binding:'entities soulKind=ghost',pick:'entity',lods,variant};
  }
  let binaryParts=[Buffer.alloc(0)],accessors=[],views=[],nodes=[],meshes=[],modules={};
  for(const [name,data,semantics] of specs){const m=addMesh(binaryParts,accessors,views,data,name,semantics);binaryParts=m.binaryParts;accessors=m.accessors;views=m.views;m.node.mesh=meshes.length;nodes.push(m.node);meshes.push(m.mesh);modules[name]={node:name,triangles:m.module.triangles,bounds:m.module.bounds,uvSlots:m.module.uvSlots,semanticSlots:semantics};}
  const binary=binaryParts[0];
  const gltf={asset:{version:'2.0',generator:'Inkbox environment family builder'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials:[{name:'environment_index_atlas',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1},doubleSided:false}],textures:[{sampler:0,source:0}],images:[{uri:'../materials/EntityAtlas.png',mimeType:'image/png',name:'EntityAtlas'}],samplers:[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}],buffers:[{byteLength:binary.length}],bufferViews:views,accessors};
  fs.writeFileSync(path.join(out,'mesh/environment_library.glb'),glb(gltf,binary));
  fs.writeFileSync(path.join(out,'materials/EntityAtlas.png'),indexPng());
  fs.writeFileSync(path.join(out,'data/palette_slots.json'),JSON.stringify({schema:'environment-palette-slots-v1',texture:'../materials/EntityAtlas.png',grid:{columns:8,rows:8,width:128,height:128,filter:'nearest',mipmaps:false,colorSpace:'none',redByte:'slot-index-plus-one'},slots:semanticSlots.map((semantic,index)=>({index,semantic}))},null,2)+'\n');
  const manifest={schema:'inkbox-environment-library-v1',asset:'mesh/environment_library.glb',atlas:'materials/EntityAtlas.png',paletteSlots:'data/palette_slots.json',coordinateSystem:{gltf:'Y-up, authored front -Z, ridge along X',pivot:'ground-centered',normalTransform:'inverse-transpose of independent width/height/depth scale, normalized',moduleTransform:'identity; normalized authored source geometry'},source:sources['mortal.house.base'],sources,modules,assets};
  fs.writeFileSync(path.join(out,'data/environment_manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({assets:Object.keys(assets),modules:Object.fromEntries(Object.entries(modules).map(([k,v])=>[k,{triangles:v.triangles,bounds:v.bounds,uvSlots:v.uvSlots}])),atlas:'128x128 index PNG; 8x8 swatches; 28 semantic slots'},null,2));
}
main();

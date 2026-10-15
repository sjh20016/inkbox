// Exact old-prepare oracle plus snapshot copy ledger. CPU Canvas adapter only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {generateWorld} from '../src/inkbox/world/worldgen.js';
import {TERRAIN_RGB,INK_RGB} from '../src/inkbox/render/palette.js';
globalThis.document={createElement(){return{getContext(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};}};}};
const {TerrainLayer}=await import('../src/inkbox/render/terrainLayer.js');
const BASE='e071e832e78857fc9de84cf6af2ca78764717330',SOURCE='src/inkbox/render/terrainLayer.js';
const baselineSourceHash='36045e7c400a43db2d7addf6ec6f8353f4ad8995c149f98863efedc987402014';
const originalBody=`const { world, wash, w, h } = this;
    if (!this.landInputs) {
      const size = w * h;
      this.landColor = new Float64Array(size * 3);
      this.landValid = new Uint8Array(size);
      this.landInputs = {
        height: new Float32Array(size), water: new Float32Array(size),
        veg: new Float32Array(size), temp: new Float32Array(size),
        type: new Uint8Array(size), wash: new Float32Array(size),
      };
    }
    const old = this.landInputs, valid = this.landValid;
    // Palette vectors are mutable even though INK_RGB's outer object is frozen.
    const palette = [...TERRAIN_RGB.flat(), ...INK_RGB.paper,
      ...INK_RGB.shadow, ...INK_RGB.mist, ...INK_RGB.azurite].join(',');
    if (palette !== this.landPalette) {
      valid.fill(0);
      this.landPalette = palette;
    } else {
      for (let y = 0, i = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1, i += 1) {
          if (world.height[i] !== old.height[i] || world.water[i] !== old.water[i]) {
            // Slopes, ridges and shoreline ink read neighbouring height/water.
            for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny += 1) {
              for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx += 1) {
                valid[ny * w + nx] = 0;
              }
            }
          }
          if (world.type[i] !== old.type[i] || world.veg[i] !== old.veg[i]
            || world.temp[i] !== old.temp[i] || wash[i] !== old.wash[i]) valid[i] = 0;
        }
      }
    }
    for (const key of ['height', 'water', 'veg', 'temp', 'type']) old[key].set(world[key]);
    old.wash.set(wash);`;
if(process.argv.includes('--historical'))assert.equal(createHash('sha256').update(execFileSync('git',['show',`${BASE}:${SOURCE}`],{encoding:'utf8',windowsHide:true})).digest('hex'),baselineSourceHash);
const oracle=new Function('TERRAIN_RGB','INK_RGB',`return function(){${originalBody}}`)(TERRAIN_RGB,INK_RGB);
const keys=['height','water','veg','temp','type','wash'];
let active=null;const copyLedger=[];
const TypedArrayPrototype=Object.getPrototypeOf(Float32Array.prototype),originalSet=TypedArrayPrototype.set;
TypedArrayPrototype.set=function(...args){if(active?.landInputs){const key=keys.find(key=>active.landInputs[key]===this);if(key)copyLedger.push({layer:active,field:key,bytes:this.byteLength});}return originalSet.apply(this,args);};
const checks=[],summary=[];
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
const world=generateWorld({preset:{w:32,h:24},seed:673231,scatter:false,generationVersion:2,terrainPreset:'standard'});
const initialHash=createHash('sha256').update(JSON.stringify(world)).digest('hex');
const candidate=new TerrainLayer(world),reference=new TerrainLayer(world);reference.prepareLandCache=oracle;
const layers=[candidate,reference];
for(const layer of layers){const method=layer.prepareLandCache;layer.prepareLandCache=function(...args){const previous=active;active=this;try{return method.apply(this,args);}finally{active=previous;}};}
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);
function compare(label,{prepareOnly=false,expected,referenceExpected=keys,time=19.99}={}){
 copyLedger.length=0;
 for(const layer of layers)if(prepareOnly)layer.prepareLandCache();else layer.render(time,true);
 assert.deepEqual(candidate.data,reference.data,label+' RGBA');assert.deepEqual(candidate.landValid,reference.landValid,label+' validity');assert.deepEqual(candidate.landColor,reference.landColor,label+' cached colors');assert.equal(candidate.landPalette,reference.landPalette);assert.equal(candidate.lastRender,reference.lastRender);assert.equal(candidate.time,reference.time);
 for(const key of keys)assert.deepEqual(bytes(candidate.landInputs[key]),bytes(reference.landInputs[key]),label+' '+key+' snapshot bytes');
 const actual=copyLedger.filter(row=>row.layer===candidate).map(row=>row.field),old=copyLedger.filter(row=>row.layer===reference).map(row=>row.field);if(expected)assert.deepEqual(actual,expected,label+' only changed snapshots copied');assert.deepEqual(old,referenceExpected,label+' frozen original copies');summary.push({label,candidateCopies:actual.length,referenceCopies:old.length,candidateBytes:copyLedger.filter(row=>row.layer===candidate).reduce((sum,row)=>sum+row.bytes,0)});
}
try{
 check('cold copies all six once; unchanged render copies zero while original copies six',()=>{compare('initial',{expected:keys});compare('unchanged',{expected:[]});compare('animated unchanged',{expected:[],time:20.5});});
 check('every direct per-field mutation copies only that field and preserves neighbor invalidation',()=>{const i=world.idx(16,12);for(const key of keys){const source=key==='wash'?candidate.wash:world[key],saved=source[i];if(key==='wash')for(const layer of layers)layer.wash[i]=.975;else source[i]=key==='type'?16:.975;compare('direct '+key,{expected:[key]});if(key==='wash')for(const layer of layers)layer.wash[i]=saved;else source[i]=saved;compare('restore '+key,{expected:[key]});}});
 check('equal replacement buffers need no copy; changed replacements remain detected',()=>{const i=world.idx(16,12);for(const key of keys){if(key==='wash'){for(const layer of layers)layer.wash=layer.wash.slice();}else world[key]=world[key].slice();compare('equal replacement '+key,{expected:[]});const saved=key==='wash'?candidate.wash[i]:world[key][i];if(key==='wash')for(const layer of layers)layer.wash[i]+=.01;else world[key][i]=key==='type'?17:.875;compare('changed replacement '+key,{expected:[key]});if(key==='wash')for(const layer of layers)layer.wash[i]=saved;else world[key][i]=saved;compare('replacement restore '+key,{expected:[key]});}});
 check('palette-only invalidation refreshes colors without six redundant snapshots',()=>{const old=INK_RGB.shadow[0];try{INK_RGB.shadow[0]=old+3;compare('palette changed',{expected:[]});}finally{INK_RGB.shadow[0]=old;}compare('palette restored',{expected:[]});});
 check('NaN retains original !== invalidation and per-frame copying behavior',()=>{const i=world.idx(16,12),old=world.temp[i];world.temp[i]=NaN;compare('NaN first',{expected:['temp']});compare('NaN again',{expected:['temp']});world.temp[i]=old;compare('NaN restored',{expected:['temp']});});
 check('signed zero snapshots retain exact old bytes without changing invalidation rule',()=>{const i=world.idx(16,12);for(const key of ['height','water','veg','temp','wash']){const old=key==='wash'?candidate.wash[i]:world[key][i];if(key==='wash')for(const layer of layers)layer.wash[i]=0;else world[key][i]=0;compare('zero '+key);if(key==='wash')for(const layer of layers)layer.wash[i]=-0;else world[key][i]=-0;compare('negative zero '+key,{expected:[key]});if(key==='wash')for(const layer of layers)layer.wash[i]=old;else world[key][i]=old;compare('zero restore '+key,{expected:[key]});}});
 check('oversized equal-prefix replacement still throws original RangeError',()=>{for(const key of keys){const saved=key==='wash'?layers.map(layer=>layer.wash):world[key];if(key==='wash'){for(const layer of layers){const large=new Float32Array(layer.wash.length+1);large.set(layer.wash);layer.wash=large;}}else{const large=new world[key].constructor(world[key].length+1);large.set(world[key]);world[key]=large;}for(const layer of layers)assert.throws(()=>layer.prepareLandCache(),RangeError,key+' size overflow');if(key==='wash')for(let j=0;j<layers.length;j++)layers[j].wash=saved[j];else world[key]=saved;compare('overflow restore '+key,{expected:[]});}});
 check('short replacement preserves original partial set and missing-cell invalidation',()=>{const saved=world.temp;world.temp=saved.slice(0,saved.length-1);compare('short temp',{prepareOnly:true,expected:['temp']});world.temp=saved;compare('short restore');});
 check('relief/world/dimension replacement reallocate all cache snapshots',()=>{for(const layer of layers)layer.setRelief(false);compare('relief reallocates',{expected:keys});const next=generateWorld({preset:{w:27,h:19},seed:1473,scatter:false});for(const layer of layers)layer.setWorld(next);compare('world size replacement',{expected:keys});compare('new world unchanged',{expected:[]});for(const layer of layers){layer.setRelief(true);layer.setWorld(world);}compare('original world restored',{expected:keys});});
 check('formal World facts restored exactly',()=>{assert.equal(createHash('sha256').update(JSON.stringify(world)).digest('hex'),initialHash);});
 console.log(JSON.stringify({suite:'G2-P0.2 selective Canvas snapshot copies',BASE,baselineSourceHash,checks,comparisons:summary.length,copyLedger:summary,scope:'CPU exact RGBA/cache/original TypedArray.set protocol; no browser/GPU/performance claim.'}));
}finally{TypedArrayPrototype.set=originalSet;}

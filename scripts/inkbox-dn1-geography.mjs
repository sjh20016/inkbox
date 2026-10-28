import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { generateNetherLandscape } from '../src/inkbox/world/netherLandscape.js';
import { sampleNetherGeography } from '../src/inkbox/world/netherGeography.js';
const hash = w => { const h = createHash('sha256'); for (const k of ['height','water','veg','type','temp','moist','riverBase','qi']) h.update(Buffer.from(w[k].buffer)); return h.digest('hex'); };
function components(w, wet) {
  const seen = new Uint8Array(w.size), sizes = [];
  for (let i = 0; i < w.size; i++) {
    if (seen[i] || (w.water[i] > 0.0015) !== wet) continue;
    let count = 0; const queue = [i]; seen[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q], x = v % w.w, y = Math.floor(v / w.w); count++;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx=x+dx, yy=y+dy, n=yy*w.w+xx;
        if (xx>=0 && xx<w.w && yy>=0 && yy<w.h && !seen[n] && (w.water[n]>0.0015)===wet) { seen[n]=1; queue.push(n); }
      }
    }
    sizes.push(count);
  }
  return sizes.sort((a,b)=>b-a);
}
for (const name of ['small','medium','large','expanse']) for (const seed of [1,42,20260914]) {
  const preset = WORLD_PRESETS[name]; assert.ok(preset, name);
  const legacy = hash(generateNetherWorld({preset,seed}));
  const a = generateNetherLandscape({preset,seed}), b = generateNetherLandscape({preset,seed});
  assert.equal(hash(a),hash(b)); assert.equal(legacy,hash(generateNetherWorld({preset,seed})));
  let min=1,max=0; const kinds = new Set();
  for (let y=0;y<a.h;y+=3) for(let x=0;x<a.w;x+=3) { const v=sampleNetherGeography(a,x,y); kinds.add(v.kind); min=Math.min(min,v.height); max=Math.max(max,v.height); }
  assert.ok(max-min > 0.3); assert.ok(kinds.size >= 3);
  for(let x=0;x<a.w;x++) { let wet=false; for(let y=0;y<a.h;y++) if(a.water[y*a.w+x]>0.0015) wet=true; assert.ok(wet); }
  const waterParts = components(a,true), landParts = components(a,false);
  assert.equal(waterParts.length, 1, 'water must be four-connected');
  assert.ok(landParts.slice(2).reduce((a,b)=>a+b,0) < a.size * 0.01, 'land fragments');
  console.log(name,seed,'legacy',legacy.slice(0,12),'range',(max-min).toFixed(3),'regions',[...kinds].join(','));
}

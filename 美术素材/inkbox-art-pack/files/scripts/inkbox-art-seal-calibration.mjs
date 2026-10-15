// 两界裸高差与"镇压"标定（规划书 §10 的数据来源）。只读。
//   node scripts/inkbox-art-seal-calibration.mjs
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { visualElevation as V } from '../src/inkbox/render3d/terrain/VisualElevation.js';
const preset={w:288,h:180}, seed=20260929;
const M=generateWorld({preset,seed,scatter:true});
const U=generateUpperWorld({preset,seed:M.seed}), N=generateNetherWorld({preset,seed:M.seed});
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(p*(s.length-1))]};
// walkable-mortal cells only (rifts open on walkable cells)
const cells=[];for(let i=0;i<M.size;i++){if(M.isWalkable(i))cells.push(i);}
console.log('walkable mortal cells',cells.length,'of',M.size);
// local seal: mean raw height diff over 5x5 window (radius ~2), on walkable cells
function local(i,f){const x=i%M.w,y=(i/M.w)|0;let s=0,c=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=M.w||ny>=M.h)continue;s+=f(ny*M.w+nx);c++;}return s/c;}
const sealN=cells.map(i=>local(i,j=>M.height[j]-N.height[j]));
const gapU =cells.map(i=>local(i,j=>U.height[j]-M.height[j]));
const pr=a=>[.05,.25,.5,.75,.95].map(p=>q(a,p).toFixed(3)).join(' / ');
console.log('nether seal (M.h - N.h, raw) p5/p25/p50/p75/p95:',pr(sealN));
console.log('upper  lift (U.h - M.h, raw) p5/p25/p50/p75/p95:',pr(gapU));
// how many "stamps" to move seal p25->p75 : one 3D stamp at centre adds strength*falloff
const strength=0.035; console.log('3D sculpt raise per stamp at centre (raw):',strength,' -> stamps to cover p25..p75 nether:',((q(sealN,.75)-q(sealN,.25))/strength).toFixed(1));
// visual dV/dh at several heights
for(const h of [0.3,0.5,0.7,0.9]) console.log('dV/dh at h=',h,':',(38+76*Math.max(0,h-0.3)).toFixed(0));
// upper/nether width of raw height ranges
for(const [n,w] of [['mortal',M],['upper',U],['nether',N]]){const a=Array.from(w.height);console.log(n,'raw h p5/p50/p95',[.05,.5,.95].map(p=>q(a,p).toFixed(3)).join(' / '));}
// qi usage across planes: is qi meaningful in upper/nether?
for(const [n,w] of [['mortal',M],['upper',U],['nether',N]]){const a=Array.from(w.qi);console.log(n,'qi p5/p50/p95/max',[.05,.5,.95,1].map(p=>q(a,p).toFixed(3)).join(' / '));}

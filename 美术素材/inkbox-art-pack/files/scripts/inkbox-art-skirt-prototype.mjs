// 界缘可行性测量（规划书 §1.3 / D1 的数据来源）。只读：用仓库自己的生成器与 pointInRegion，不改任何东西。
//   node scripts/inkbox-art-skirt-prototype.mjs
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { visualElevation as V } from '../src/inkbox/render3d/terrain/VisualElevation.js';
import { pointInRegion } from '../src/inkbox/ui/realmView.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';

const preset={w:288,h:180}, seed=20260929;
const M=generateWorld({preset,seed,scatter:true});
const U=generateUpperWorld({preset,seed:M.seed}), N=generateNetherWorld({preset,seed:M.seed});
const W=M.w,H=M.h;
const q=(a,p)=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(p*(s.length-1))]};

// ---- region generators (integer node path, same contract as normalizeRegion) ----
const rnd=mulberry32(7);
function rectPath(x0,y0,x1,y1){return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];}
function blobPath(cx,cy,R,n=12){const ph=rnd()*6.28,a=[rnd()*.6+.2,rnd()*.6+.2,rnd()*.6+.2];const p=[];
  for(let k=0;k<n;k++){const t=k/n*6.2832;const r=R*(1+.3*Math.sin(2*t+ph)*a[0]+.25*Math.sin(3*t+2*ph)*a[1]+.15*Math.sin(5*t)*a[2]+ (rnd()-.5)*.25);
    p.push([Math.max(1,Math.min(W-2,Math.round(cx+r*Math.cos(t)*1.3))),Math.max(1,Math.min(H-2,Math.round(cy+r*Math.sin(t))))]);}
  return p.filter((v,i)=>i===0||v[0]!==p[i-1][0]||v[1]!==p[i-1][1]);}

// ---- inside mask per quad (same predicate as TerrainMesh.setRegionMask) ----
function maskOf(path){const qw=W-1,qh=H-1,ins=new Uint8Array(qw*qh);let n=0;
  for(let y=0;y<qh;y++)for(let x=0;x<qw;x++){if(pointInRegion(path,x+.5,y+.5)){ins[y*qw+x]=1;n++;}}
  return {ins,n,qw,qh};}
const inQ=(m,x,y)=>x>=0&&y>=0&&x<m.qw&&y<m.qh&&m.ins[y*m.qw+x]===1;

// ---- boundary edges: node->node segments between inside quad and outside/off-map ----
function boundary(m){const edges=[];// [nx0,ny0,nx1,ny1]
  for(let y=0;y<m.qh;y++)for(let x=0;x<m.qw;x++){ if(!m.ins[y*m.qw+x])continue;
    if(!inQ(m,x,y-1))edges.push([x,y,x+1,y]);      // top
    if(!inQ(m,x,y+1))edges.push([x,y+1,x+1,y+1]);  // bottom
    if(!inQ(m,x-1,y))edges.push([x,y,x,y+1]);      // left
    if(!inQ(m,x+1,y))edges.push([x+1,y,x+1,y+1]);  // right
  } return edges;}
function topo(edges){const deg=new Map();const key=(x,y)=>y*W+x;
  for(const e of edges){for(const [x,y] of [[e[0],e[1]],[e[2],e[3]]]){deg.set(key(x,y),(deg.get(key(x,y))||0)+1);}}
  let d4=0,d2=0,dodd=0;for(const v of deg.values()){if(v===4)d4++;else if(v===2)d2++;else dodd++;}
  // components via union-find on nodes
  const par=new Map();const f=a=>{while(par.get(a)!==a){par.set(a,par.get(par.get(a)));a=par.get(a);}return a;};
  for(const k of deg.keys())par.set(k,k);
  for(const e of edges){const a=f(key(e[0],e[1])),b=f(key(e[2],e[3]));if(a!==b)par.set(a,b);}
  const roots=new Set([...deg.keys()].map(f));
  return {nodes:deg.size,d4,d2,dodd,components:roots.size,deg};}

// ---- distance-to-boundary (chamfer over nodes) limited to radius K, only for TARGET side nodes (inside) ----
function nodeDist(edges,m,K){const dist=new Map();const key=(x,y)=>y*W+x;const q0=[];
  for(const e of edges){for(const [x,y] of [[e[0],e[1]],[e[2],e[3]]]){const k=key(x,y);if(!dist.has(k)){dist.set(k,0);q0.push([x,y]);}}}
  let head=0;while(head<q0.length){const [x,y]=q0[head++];const d=dist.get(key(x,y));if(d>=K)continue;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
      // only spread into nodes that touch at least one inside quad
      const touchIn=inQ(m,nx,ny)||inQ(m,nx-1,ny)||inQ(m,nx,ny-1)||inQ(m,nx-1,ny-1);if(!touchIn)continue;
      const kk=key(nx,ny);if(!dist.has(kk)){dist.set(kk,d+1);q0.push([nx,ny]);}}}
  return dist;}

const smooth=t=>t*t*(3-2*t);
function analyse(name,path,target,sign,cfg){
  const m=maskOf(path),edges=boundary(m),tp=topo(edges);
  const rimNodes=[...tp.deg.keys()];
  const Mv=i=>V(M.height[i]), Tv=i=>sign*cfg.D+cfg.s*V(target.height[i]);
  // raw gap with datum: >0 means target on the narratively correct side
  const g=rimNodes.map(i=>sign*(Tv(i)-Mv(i)));
  const wrong=g.filter(x=>x<=0).length/g.length;
  const Hn=g.map(x=>cfg.Hmin+cfg.Hcap*Math.tanh(Math.max(x,0)/cfg.Hcap)); // wall height after soft cap
  // rim target elevation R = M + sign*H ; shoulder distortion = |T - R| at rim, ramp over K cells
  const dev=rimNodes.map((i,k)=>Math.abs(Tv(i)-(Mv(i)+sign*Hn[k])));
  const slope=dev.map(d=>d/cfg.K);
  // natural target slope for reference (adjacent node dY on the target plane, scaled)
  return {name,insideQuads:m.n,edges:edges.length,wallTris:edges.length*2,loops:tp.components,d4:tp.d4,
    wrongPct:wrong*100,wallH:[q(Hn,.1),q(Hn,.5),q(Hn,.9),Math.max(...Hn)],dev:[q(dev,.5),q(dev,.9),Math.max(...dev)],slope:[q(slope,.5),q(slope,.9)]};
}
const cfgs={
  raw   :{D:0 ,s:1  ,Hmin:0 ,Hcap:1e9,K:4}, // current state: gap unbounded
  A     :{D:24,s:.6 ,Hmin:6 ,Hcap:22 ,K:4},
  B     :{D:30,s:.6 ,Hmin:8 ,Hcap:26 ,K:5},
};
const regions=[];
regions.push(['rect40x30 centre',rectPath(124,75,164,105)]);
regions.push(['rect20x20',rectPath(60,40,80,60)]);
for(let i=0;i<14;i++){const R=8+rnd()*32;regions.push([`blob#${i} R${R.toFixed(0)}`,blobPath(40+rnd()*208,30+rnd()*120,R)]);}
regions.push(['near-border rect',rectPath(0,0,50,40)]);

for(const [plane,tw,sign] of [['upper',U,+1],['nether',N,-1]]){
  console.log('\n######',plane);
  for(const [cn,cfg] of Object.entries(cfgs)){
    const rows=regions.map(([n,p])=>analyse(n,p,tw,sign,cfg));
    const agg=(f)=>rows.map(f);
    console.log(`cfg ${cn}: wrong-side rim nodes mean ${(agg(r=>r.wrongPct).reduce((a,b)=>a+b)/rows.length).toFixed(0)}% | wall H p10/p50/p90/max (mean over regions) ${[0,1,2,3].map(k=>(agg(r=>r.wallH[k]).reduce((a,b)=>a+b)/rows.length).toFixed(0)).join('/')} | shoulder |T-R| p50/p90/max ${[0,1,2].map(k=>(agg(r=>r.dev[k]).reduce((a,b)=>a+b)/rows.length).toFixed(0)).join('/')} | shoulder slope/cell p50/p90 ${[0,1].map(k=>(agg(r=>r.slope[k]).reduce((a,b)=>a+b)/rows.length).toFixed(1)).join('/')}`);
  }
}
// topology / size table (independent of plane)
console.log('\n###### topology & size');
for(const [n,p] of regions){const m=maskOf(p),e=boundary(m),t=topo(e);console.log(n.padEnd(20),'quads',String(m.n).padStart(5),'edges',String(e.length).padStart(4),'wallTris',String(e.length*2).padStart(4),'rimNodes',String(t.nodes).padStart(4),'components',t.components,'deg4',t.d4);}
// timing of mask+boundary build on 288x180
let t0=performance.now();for(let i=0;i<5;i++){const m=maskOf(regions[0][1]);boundary(m);}console.log('mask+boundary rect ms/iter',((performance.now()-t0)/5).toFixed(1));
t0=performance.now();const bp=regions[8][1];for(let i=0;i<5;i++){const m=maskOf(bp);boundary(m);}console.log('mask+boundary blob ms/iter',((performance.now()-t0)/5).toFixed(1),'path len',bp.length);

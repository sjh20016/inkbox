// Deterministic, simulation-independent helpers shared by G2 browser/performance evidence.
// Root discovery uses private RNG streams; the World/Life RNG remains untouched.
import { rollSpiritRoot } from '../src/inkbox/core/cultivation.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';

export function combatStyle(root) {
  if (root?.rootName === '雷灵根' || root?.rootName === '九天雷灵根'
      || root?.mutated?.name === '雷灵根' || root?.mutated?.name === '九天雷灵根') return 'thunder';
  if (root?.elements?.includes('火')) return 'fire';
  return 'blade';
}

export function findCombatRoots(seed = 0x673231) {
  const found = {};
  for (const [style, salt] of [['blade', 0x10], ['fire', 0x20], ['thunder', 0x30]]) {
    for (let attempt = 0; attempt < 100000 && !found[style]; attempt += 1) {
      const rootSeed = (seed ^ salt ^ attempt) >>> 0;
      const root = rollSpiritRoot(mulberry32(rootSeed));
      if (combatStyle(root) === style) found[style] = { root, seed: rootSeed };
    }
    if (!found[style]) throw new Error(`Unable to find deterministic ${style} root`);
  }
  return found;
}

/**
 * Produce an in-page setup expression for official Life.spawn combat fixtures.
 * Existing entities are retained. New fighters are isolated, level-30 cultivators
 * with valid HP and deterministic attacker roots; only `advanceDays` runs combat.
 */
export function combatFixtureExpression({ count = 2, roots = findCombatRoots(), seed = 673231,
  minSpacing = 8 } = {}) {
  if (!Number.isSafeInteger(count) || count < 2 || count % 2) throw new RangeError('count must be an even integer >= 2');
  const rootValues = Object.fromEntries(Object.entries(roots).map(([style, item]) => [style, item.root]));
  return `return (async()=>{
    const k=window.inkbox,w=k.world;if(!w||!k.life)throw Error('Inkbox World/Life missing');
    const {maxHpFor}=await import('./src/inkbox/sim/cultivation.js');
    const rootByStyle=${JSON.stringify(rootValues)},beforeIds=new Set(w.entities.map(e=>e.id));
    const beforeCount=w.entities.length,existing=w.entities.filter(e=>e.hp>0).map(e=>[e.x,e.y]);
    const candidates=[];
    for(let y=10;y<w.h-10;y+=2)for(let x=10;x<w.w-10;x+=2){
      const a=w.idx(x,y),b=w.idx(x+1,y);
      if(!w.isWalkable(a)||!w.isWalkable(b)||w.struct[a]!==0||w.struct[b]!==0)continue;
      // Life.findSpawnSpot samples nearby tiles. Require actual legal support,
      // then retry the unchanged public spawn API if its finite random search misses.
      let spawnSupport=0;
      for(let yy=y-3;yy<=y+3;yy++)for(let xx=x-3;xx<=x+3;xx++){
        const i=w.idx(xx,yy);if(w.isWalkable(i)&&w.struct[i]===0)spawnSupport++;
      }
      if(spawnSupport<20)continue;
      let visualCost=0;
      for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+3;xx++){
        const i=w.idx(xx,yy);
        visualCost+=w.veg[i]+(w.type[i]===7||w.type[i]===8?.65:0)+(w.struct[i]===0?0:.3)
          +Math.abs(w.height[i]-w.height[a])*32;
      }
      candidates.push({x,y,visualCost,spawnSupport});
    }
    for(const p of candidates)p.nearestNpc=existing.reduce((d,q)=>Math.min(d,Math.hypot(q[0]-p.x,q[1]-p.y)),Infinity);
    candidates.sort((a,b)=>a.visualCost-b.visualCost||b.nearestNpc-a.nearestNpc\n      ||Math.hypot(a.x-w.w/2,a.y-w.h/2)-Math.hypot(b.x-w.w/2,b.y-w.h/2));
    const chosen=[];
    for(const p of candidates){
      if(existing.some(q=>Math.hypot(q[0]-p.x,q[1]-p.y)<2.8))continue;
      if(chosen.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<${minSpacing}))continue;
      chosen.push(p);if(chosen.length>=${count/2})break;
    }
    if(chosen.length<${count/2})throw Error('Insufficient clear walkable combat sites: '+chosen.length+'/'+${count/2});
    const created=[];let pairIndex=0,spawnCalls=0,spawnMisses=0;
    for(const site of chosen){
      const style=['blade','fire','thunder'][pairIndex++%3];
      for(let side=0;side<2;side++){
        let n=0;
        for(let attempt=0;attempt<8&&n!==1;attempt++){
          spawnCalls++;n=k.life.spawn(site.x,site.y,'cultivator',1);if(n===0)spawnMisses++;
        }
        if(n!==1)throw Error('Formal Life.spawn failed after bounded retries at '+site.x+','+site.y);
        const e=w.entities.find(e=>!beforeIds.has(e.id)&&!created.some(x=>x.id===e.id));
        if(!e)throw Error('Life.spawn did not add a new entity');
        const x=site.x+(side===0?.15:.95),y=site.y+.5;
        e.x=x;e.y=y;e.tx=x;e.ty=y;e.level=30;e.exp=0;e.root=side===0?rootByStyle[style]:rootByStyle.blade;
        e.maxHp=maxHpFor(e);e.hp=e.maxHp;e.restUntil=w.day;e.madUntil=side===0?w.day+120:0;
        e.state='wander';e.faction=0;
        created.push({id:e.id,sp:e.sp,x:e.x,y:e.y,level:e.level,hp:e.hp,maxHp:e.maxHp,style:side===0?style:'blade',side});
      }
    }
    window.__g2CombatActors=created.map(x=>x.id);
    const originalRetained=beforeIds.size===w.entities.filter(e=>beforeIds.has(e.id)).length;
    return {seed:w.seed,count:created.length,pairs:chosen.length,actors:created,
      originalEntityCount:beforeCount,originalEntitiesRetained:originalRetained,
      newEntityCount:w.entities.length-beforeCount,world:[w.w,w.h],day:w.day,
      spawnCalls,spawnMisses,sites:chosen,rootNames:Object.fromEntries(Object.entries(rootByStyle).map(([k,v])=>[k,v.rootName]))};
  })()`;
}

/** Formal unprovoked cultivator-vs-beast fixture; normal hostility/level gates choose the target. */
export function beastCombatFixtureExpression({ roots = findCombatRoots(), minNpcDistance = 3 } = {}) {
  const root = roots.blade.root;
  return `return (async()=>{
    const k=window.inkbox,w=k.world,{maxHpFor}=await import('./src/inkbox/sim/cultivation.js');
    const beforeIds=new Set(w.entities.map(e=>e.id)),beforeCount=w.entities.length,prior=new Set(beforeIds),existing=w.entities.filter(e=>e.hp>0).map(e=>[e.x,e.y]);
    let site=null;
    for(let y=10;y<w.h-10&&!site;y+=1)for(let x=10;x<w.w-10;x+=1){const a=w.idx(x,y),b=w.idx(x+1,y);
      if(!w.isWalkable(a)||!w.isWalkable(b)||w.struct[a]!==0||w.struct[b]!==0)continue;
      if(existing.some(q=>Math.hypot(q[0]-x,q[1]-y)<${minNpcDistance}))continue;site={x,y};break;}
    if(!site)throw Error('No clear walkable site for beast combat');
    if(k.life.spawn(site.x,site.y,'cultivator',1)!==1)throw Error('Life.spawn cultivator failed');
    const c=w.entities.find(e=>!prior.has(e.id));if(!c)throw Error('spawned cultivator missing');prior.add(c.id);
    if(k.life.spawn(site.x,site.y,'beast',1)!==1)throw Error('Life.spawn beast failed');
    const b=w.entities.find(e=>!prior.has(e.id));if(!b)throw Error('spawned beast missing');
    c.x=site.x+.15;c.y=site.y+.5;c.tx=c.x;c.ty=c.y;c.level=30;c.exp=0;c.root=${JSON.stringify(root)};c.maxHp=maxHpFor(c);c.hp=c.maxHp;c.restUntil=w.day;c.madUntil=0;
    b.x=site.x+.95;b.y=site.y+.5;b.tx=b.x;b.ty=b.y;b.level=30;b.exp=0;b.maxHp=maxHpFor(b);b.hp=b.maxHp;b.restUntil=w.day;b.madUntil=0;
    c.state=b.state='wander';
    window.__g2BeastActors=[c.id,b.id];
    return {site,cultivator:{id:c.id,sp:c.sp,level:c.level,hp:c.hp,maxHp:c.maxHp},
      beast:{id:b.id,sp:b.sp,level:b.level,hp:b.hp,maxHp:b.maxHp},existingCount:existing.length,
      priorEntitiesRetained:beforeCount===w.entities.filter(e=>beforeIds.has(e.id)).length};
  })()`;
}
export function summarizeRng(rng) {
  return Array.from({ length: 11 }, () => Math.floor(rng() * 0x100000000) >>> 0);
}

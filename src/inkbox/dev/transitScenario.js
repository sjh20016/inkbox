// Explicit, controlled initial conditions inside the real game. No alternate
// clock, entities, renderer or delivery implementation lives in this fixture.
import { SPECIES, STRUCT } from '../core/config.js';
import { recomputeAll } from '../world/terrain.js';
import { lifespanForEntity, maxHpFor } from '../sim/cultivation.js';
import { sculpt, addWater, withWaterEditBatch } from '../sim/powers.js';

export const TRANSIT_SCENE_SEED = 20261025;

export function transitScenarioGeometry(world) {
  const sx = world.w / 200, sy = world.h / 128;
  return {
    left: { x: Math.round(67*sx), y: Math.round(64*sy) },
    right: { x: Math.round(132*sx), y: Math.round(64*sy) },
    cut: { x: Math.round(100*sx), y: Math.round(64*sy) },
    damX: Math.round(110*sx),
    dam: [54,59,64,69,74].map(y=>({x:Math.round(110*sx),y:Math.round(y*sy)})),
    reopen: { x: Math.round(110*sx), y: Math.round(58*sy) },
  };
}

export function isTransitScenario(world) {
  return world?.seed === TRANSIT_SCENE_SEED
    && world.villages?.some(v=>v.name==='西津') && world.villages?.some(v=>v.name==='东渡');
}

/** The experiment's buttons execute the same real, bounded terrain powers. */
export function applyTransitScenarioEdit(world, history, kind) {
  if (!isTransitScenario(world)) throw Error('Not the T0 development world');
  if (!['cut','dam','reopen'].includes(kind)) return false;
  const geometry=transitScenarioGeometry(world);
  history.begin();
  try {
    if(kind==='cut') sculpt(world,geometry.cut.x+.5,geometry.cut.y+.5,6,-.34,history);
    if(kind==='dam') for(const p of geometry.dam) sculpt(world,p.x+.5,p.y+.5,5,.42,history);
    if(kind==='reopen') {
      const p=geometry.reopen;
      sculpt(world,p.x+.5,p.y+.5,6,-.68,history);
      withWaterEditBatch(world,history,()=>addWater(world,p.x+.5,p.y+.5,5,.08,history));
    }
    return history.end(`T0 ${kind}`);
  } catch(error) {history.rollback(world);throw error;}
}

/** Call only while deliberately creating the labelled T0 development world. */
export function installTransitScenario(world, life) {
  if (world.seed !== TRANSIT_SCENE_SEED || life.world !== world) throw Error('T0 fixture ownership mismatch');
  world.entities.length=0; world.villages.length=0; world.factions.length=0;
  world.leylines.length=0; world.sites.length=0; world.artifacts.length=0;
  world.clans.length=0; world.souls.length=0; world.chronicle.length=0; world.milestones.length=0;
  world.nextEntityId=1; world.nextVillageId=1; world.nextFactionId=1;
  world.mapProgress=null; delete world.transit;
  world.height.fill(.84); world.water.fill(0); world.riverBase.fill(0);
  world.temp.fill(.6); world.moist.fill(.55); world.veg.fill(.45);
  world.fire.fill(0); world.over.fill(0); world.struct.fill(0); world.owner.fill(0);
  const sx=world.w/200,sy=world.h/128;
  function rect(x0,y0,x1,y1,height,water=0) {
    for(let y=Math.round(y0*sy);y<=Math.round(y1*sy);y++)
      for(let x=Math.round(x0*sx);x<=Math.round(x1*sx);x++) {
        const i=world.idx(x,y);world.height[i]=height;world.water[i]=water;
      }
  }
  rect(20,38,75,90,.43); rect(124,38,180,90,.43);
  rect(76,54,123,74,.16,.19);
  rect(76,63,123,65,.34);
  recomputeAll(world);
  const geo=transitScenarioGeometry(world);
  const left=life.foundVillage(geo.left.x,geo.left.y,0);
  const right=life.foundVillage(geo.right.x,geo.right.y,0);
  left.name='西津';right.name='东渡';left.food=260;right.food=8;
  for(const v of [left,right]) {
    // Real house records, with finite construction cooldown and ordinary Life
    // production/consumption afterwards. The fixture does not freeze society.
    v.houses=[{x:v.x,y:v.y,type:STRUCT.HALL},{x:v.x-2,y:v.y+2,type:STRUCT.HOUSE}];
    for(const h of v.houses) world.struct[world.idx(h.x,h.y)]=h.type;
    life.spawn(v.x,v.y,SPECIES.HUMAN,6,0,{village:v.id,genesis:true});
  }
  life.spawn(left.x-3,left.y-3,SPECIES.CULTIVATOR,1,0,{village:left.id,genesis:true});
  const flier=world.entities.at(-1);
  // A labelled initial-condition fixture, not a claim of natural progression.
  flier.level=20;flier.exp=0;flier.maxHp=maxHpFor(flier);flier.hp=flier.maxHp;
  flier.lifespan=lifespanForEntity(flier,20);flier.name='渡海修士';
  life.syncVillagePops();life.rebuildGrid();
  world.record('T0受控初始场景：西津盈粮、东渡缺粮；陆桥尚通，可由正式神力截海。','world');
  recomputeAll(world);
  return {leftId:left.id,rightId:right.id,flierId:flier.id,...geo};
}

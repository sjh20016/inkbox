import fs from 'node:fs';
import path from 'node:path';
import { World } from '../../src/inkbox/world/World.js';
import { Life } from '../../src/inkbox/sim/life.js';
import { mulberry32 } from '../../src/inkbox/core/noise.js';
import { DAO_BY_KEY } from '../../src/inkbox/core/cultivation.js';
import { recomputeAll } from '../../src/inkbox/world/terrain.js';
import { maxHpFor, lifespanForEntity } from '../../src/inkbox/sim/cultivation.js';
import { wanlingState } from '../../src/inkbox/world/wanlingState.js';
import { stepDaoActivities } from '../../src/inkbox/sim/daoActivities.js';
import { installTransitScenario, TRANSIT_SCENE_SEED } from '../../src/inkbox/dev/transitScenario.js';
import { serializeWorld } from '../../src/inkbox/io/save.js';

/** Controlled initial conditions, serialized for native import into the ordinary game. */
export function createWti1Scene() {
  const world=new World(200,128,TRANSIT_SCENE_SEED),life=new Life(world,mulberry32(1234));
  const transit=installTransitScenario(world,life);
  for(let y=70;y<=84;y++)for(let x=48;x<=62;x++) {
    const i=world.idx(x,y);world.temp[i]=.75;world.moist[i]=.03;world.veg[i]=.04;
  }
  recomputeAll(world);
  function configure(actor,name,key,level,x,y) {
    Object.assign(actor,{name,level,exp:0,x,y,tx:x,ty:y,timer:1000,state:'rest',mind:80,pollution:0,
      ...(key?{dao:{path:DAO_BY_KEY[key],stage:0,progress:0}}:{})});
    actor.maxHp=maxHpFor(actor);actor.hp=actor.maxHp;actor.lifespan=lifespanForEntity(actor,level);
    return actor;
  }
  function spawn(name,key,level,x,y) {
    const before=world.entities.length;
    if(life.spawn(x,y,'cultivator',1,0,{village:transit.leftId,genesis:true})!==1)throw Error('Fixture spawn failed');
    return configure(world.entities[before],name,key,level,x,y);
  }
  const flier=configure(world.entities.find(e=>e.id===transit.flierId),'远行丹修','alchemy',20,30.5,61.5);
  const healer=spawn('两度丹修','alchemy',10,54.5,76.5);
  const patient=spawn('待疗修士',null,10,55.5,76.5);patient.hp=patient.maxHp*.48;
  const talisman=spawn('复行符修','talisman',10,67.5,66.5);
  life.syncVillagePops();life.rebuildGrid();
  const state=wanlingState(world);state.lastPathDay=-30;
  stepDaoActivities(world,life);
  const metadata={fixture:'WT-I1 controlled initial conditions',naturalSample:false,
    map:[world.w,world.h],seed:world.seed,transit,
    actors:{flier:flier.id,healer:healer.id,patient:patient.id,talisman:talisman.id},
    note:'初始修为、伤势、静养计时与两岸地形预置；后续使用正式 Life/advance、工具、行程和存读档。静养仍结算年龄、修炼、饥饿与死亡。',
    placement:{deer:{x:35,y:50},wolf:{x:35,y:50},dangkang:{x:64,y:66},tiangou:{x:68,y:66}},
  };
  return {world,life,metadata};
}
export function writeWti1Scene(outputDir='reports/local/wti1/fixture') {
  const {world,metadata}=createWti1Scene();fs.mkdirSync(outputDir,{recursive:true});
  const savePath=path.resolve(outputDir,'wti1-playable.save.json');
  fs.writeFileSync(savePath,JSON.stringify(serializeWorld(world)));
  fs.writeFileSync(path.resolve(outputDir,'metadata.json'),JSON.stringify(metadata,null,2));
  return {savePath,metadata};
}

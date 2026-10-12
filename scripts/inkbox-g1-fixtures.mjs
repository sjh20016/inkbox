import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { createAdvanceState } from '../src/inkbox/sim/advance.js';
export function fixture(seed = 731) {
  const preset = {key:'g1-fixture',w:64,h:40};
  const world = generateWorld({preset,seed,scatter:true});
  world.mapProgress = {stage:3};
  world.upper = generateUpperWorld({preset,seed});
  world.nether = generateNetherWorld({preset,seed});
  let draws = 0, ecoDraws = 0;
  const stream = mulberry32(seed ^ 0xa5a5a5a5);
  const rng = () => { draws++; return stream(); };
  const ecoStream = mulberry32(seed ^ 0x45434f);
  const ecoRng = () => { ecoDraws++; return ecoStream(); };
  const life = new Life(world,rng), upperLife = new UpperLife(world.upper);
  let entity = world.entities.find(e => e.sp === 'cultivator');
  if (!entity) {
    for (const village of world.villages) { life.spawn(village.x,village.y,'cultivator',1); entity = world.entities.find(e => e.sp === 'cultivator'); if (entity) break; }
  }
  if (!entity) {
    for (let i=0;i<world.w * world.h;i++) {
      if (!world.isWalkable(i) || world.struct[i]) continue;
      life.spawn(i % world.w,Math.floor(i / world.w),'cultivator',1);
      entity = world.entities.find(e => e.sp === 'cultivator');
      if (entity) break;
    }
  }
  if (!entity) throw new Error('Fixture has no cultivator');
  entity.level = 4; entity.exp = 0; entity.fortune = 60; entity.mind = 60;
  return {world,entity,life,upperLife,rng,ecoRng,state:createAdvanceState(),draws:() => draws,ecoDraws:() => ecoDraws};
}

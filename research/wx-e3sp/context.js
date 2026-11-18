import { deserializeWorld, serializeWorld } from '../../src/inkbox/io/save.js';
import { Life } from '../../src/inkbox/sim/life.js';
import { UpperLife } from '../../src/inkbox/sim/upperLife.js';
import { createAdvanceState } from '../../src/inkbox/sim/advance.js';
import { rngStream } from '../../src/inkbox/core/noise.js';
import { restoreRuntimeState, captureRuntimeState } from '../../src/inkbox/sim/runtimeState.js';
import { History } from '../../src/inkbox/sim/powers.js';

// Private authority construction only. Serialization is never a normal step.
export function restoreResearchContext(checkpoint) {
  const input=JSON.parse(typeof checkpoint==='string'?checkpoint:JSON.stringify(checkpoint));
  if(input.v!==11||!input.runtime?.exact)throw new TypeError('Research requires an exact v11/G8 checkpoint');
  const world=deserializeWorld(input);
  if(!input.runtime.upperLife){delete world.upper;delete world.nether;}
  const life=new Life(world,rngStream(world.seed^0xa5a5a5a5));
  const upperLife=input.runtime.upperLife?new UpperLife(world.upper):undefined;
  const state=createAdvanceState(),playerRng=rngStream(world.seed^0x504c4159);
  restoreRuntimeState(input.runtime,{world,life,upperLife,advanceState:state,playerRng});
  return {world,life,upperLife,state,playerRng,history:new History()};
}
export function captureResearchSave(context) {
  const {world,life,upperLife,state,playerRng}=context;
  return JSON.stringify(serializeWorld(world,{}, {runtime:captureRuntimeState({world,life,upperLife,advanceState:state,playerRng})}));
}

import * as save from '../../reports/local/wx-e2p/mirror/src/inkbox/io/save.js';
import {rngStream} from '../../reports/local/wx-e2p/mirror/src/inkbox/core/noise.js';
import {Life} from '../../reports/local/wx-e2p/mirror/src/inkbox/sim/life.js';
import {UpperLife} from '../../reports/local/wx-e2p/mirror/src/inkbox/sim/upperLife.js';
import {advanceWorld,createAdvanceState} from '../../reports/local/wx-e2p/mirror/src/inkbox/sim/advance.js';
import {captureRuntimeState,restoreRuntimeState} from '../../reports/local/wx-e2p/mirror/src/inkbox/sim/runtimeState.js';
export const api={
 restore(saved){const input=structuredClone(saved),world=save.deserializeWorld(input);if(!input.runtime?.upperLife){delete world.upper;delete world.nether;}const life=new Life(world,rngStream(world.seed^0xa5a5a5a5));const upperLife=input.runtime?.upperLife?new UpperLife(world.upper):undefined;const state=createAdvanceState(),playerRng=rngStream(world.seed^0x504c4159);if(input.runtime)restoreRuntimeState(input.runtime,{world,life,upperLife,advanceState:state,playerRng});return {world,life,upperLife,state,playerRng};},
 capture(c){return save.serializeWorld(c.world,{}, {runtime:captureRuntimeState({world:c.world,life:c.life,upperLife:c.upperLife,advanceState:c.state,playerRng:c.playerRng})});},
 advance(c,days){return advanceWorld(c.world,days,c);}
};

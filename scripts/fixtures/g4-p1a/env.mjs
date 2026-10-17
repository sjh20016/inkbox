// Node-only module adapter; no simulation formulas or replacement APIs.
import * as H from '../../../src/inkbox/sim/hydrology.js';
import * as T from '../../../src/inkbox/world/terrain.js';
import * as noise from '../../../src/inkbox/core/noise.js';
export { SEA_LEVEL } from '../../../src/inkbox/core/config.js';
export const M = { H, T, noise };

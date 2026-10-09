import assert from "node:assert/strict";
import { parseCreationSeed, makeCreationRequest } from "../src/inkbox/ui/g2/creation/creationMenuModel.js";
assert.equal(parseCreationSeed("0"), 0);
assert.equal(parseCreationSeed("4294967295"), 4294967295);
for (const invalid of ["", "-1", "1.2", "0x10", "4294967296", "NaN", null]) {
  assert.throws(() => parseCreationSeed(invalid), RangeError);
}
assert.deepEqual(makeCreationRequest({preset:"medium",terrainPreset:"standard",seed:"0",progressive:true}),
  {type:"create-world",options:{preset:"medium",terrainPreset:"standard",seed:0,progressive:true}});
assert.throws(() => makeCreationRequest({preset:"made-up",terrainPreset:"standard",seed:"1",progressive:false}));
console.log("G2-W: creation pure model assertions OK (DOM/browser not covered)");

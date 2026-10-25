import assert from 'node:assert/strict';
import { WANLING_CATALOG } from '../src/inkbox/core/wanlingCatalog.js';
import { selectedWanling, selectWanlingForm, placeableWanlings, wanlingPlacementNotice } from '../src/inkbox/ui/wanlingSelection.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { createWanlingScene } from './fixtures/wanling-scene.mjs';
import { removeWanling } from '../src/inkbox/sim/wanling.js';
import { serializeWorld } from '../src/inkbox/io/save.js';

const {world}=createWanlingScene();
const sandbox={world,toolId:'inspect',selectTool(id){this.toolId=id;},
  wanlingSelection:{refresh(){}},wanlingCodex:{syncChoice(){}},qol:{syncToolState(){}}};
assert.deepEqual(placeableWanlings().map(c=>c.key),WANLING_CATALOG.filter(c=>!c.derived).map(c=>c.key));
assert.equal(placeableWanlings().length,17);
assert.equal(placeableWanlings('herd').length,2);assert.equal(placeableWanlings('spirit').length,3);
for(const c of WANLING_CATALOG) {
  const before=JSON.stringify(serializeWorld(world));
  assert(selectWanlingForm(sandbox,c.key,{activate:true}));
  assert.equal(sandbox.toolId,'beast');assert.equal(selectedWanling(sandbox).key,c.key);
  sandbox.render3d={active:true,renderer:{activePlane:'mortal'}};
  assert.equal(selectedWanling(sandbox).key,c.key,'Three reads the same choice');
  sandbox.render3d.active=false;sandbox.selectTool('raise');sandbox.selectTool('beast');
  assert.equal(selectedWanling(sandbox).key,c.key,'changing group/tool/renderer does not reset form');
  assert.equal(JSON.stringify(serializeWorld(world)),before,'selection and view changes never spawn or write the World');
  if(c.derived){assert.match(wanlingPlacementNotice(sandbox),/关系派生/);continue;}
  let placed=null;
  for(let y=2;y<world.h-2&&!placed;y++)for(let x=2;x<world.w-2&&!placed;x++) {
    const count=world.wanling?.units.length||0;
    const result=TOOL_BY_ID.beast.apply({world,wanlingForm:selectedWanling(sandbox).key,x,y});
    if((world.wanling?.units.length||0)>count){placed=world.wanling.units.at(-1);assert.match(result,new RegExp(`真实 ID ${placed.id}`));}
    else assert.match(result,/未投放/);
  }
  assert(placed,`${c.key} has a real legal habitat`);assert.equal(placed.form,c.key);
  assert.equal(world.wanling.units.filter(u=>u.id===placed.id).length,1,'one request creates one actual identity');
}
assert.equal(selectWanlingForm(sandbox,'unknown'),false);assert.equal(selectedWanling(sandbox).key,'stone');
selectWanlingForm(sandbox,'deer');sandbox.render3d={active:true,renderer:{activePlane:'upper'}};
assert.match(wanlingPlacementNotice(sandbox),/凡界/);sandbox.render3d.renderer.activePlane='mortal';
const before=world.wanling.units.length;
assert.match(TOOL_BY_ID.beast.apply({world,wanlingForm:'deer',x:95,y:60}),/栖地不符/);
assert.equal(world.wanling.units.length,before);
const first=world.wanling.units.find(u=>u.form==='deer');removeWanling(world,first.id);
assert(!world.wanling.units.some(u=>u.id===first.id));
console.log('WT-I1 selection: all 17 catalog-driven real species, shared transient choice, derived refusal, failures and removal passed');

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
const source=path.join(root,'src/inkbox');
const target=path.join(root,'reports/local/wx-e2p/mirror/src/inkbox');
fs.mkdirSync(path.dirname(target),{recursive:true});
function copyTree(from,to){fs.mkdirSync(to,{recursive:true});for(const entry of fs.readdirSync(from,{withFileTypes:true})){const src=path.join(from,entry.name),dst=path.join(to,entry.name);if(entry.isDirectory())copyTree(src,dst);else if(entry.isFile())fs.copyFileSync(src,dst);}}
copyTree(source,target);
const hash=x=>createHash('sha256').update(x).digest('hex');
const hashes={};
const expected={'sim/life.js':'27b0974d922043163a7f59133e733e14b138521687e2ed091126c230e2874d8c','sim/advance.js':'09191e3b5e2340fad35014f88033d469d98b88fd8cbed04eab94d6a4f6d719b1'};
for(const name of ['sim/life.js','sim/advance.js']){
 const p=path.join(target,name),body=fs.readFileSync(p,'utf8');hashes[name]=hash(body);
 if(hashes[name]!==expected[name])throw Error(`Audited source changed: ${name} ${hashes[name]}`);
 if(name==='sim/life.js'){
  const start=body.indexOf('  step(dtDays) {');
  const end=body.indexOf('\n  /**',start);
  if(start<0||end<0)throw Error('Life source anchor changed');
  let slice=body.slice(start,end).replace('  step(dtDays) {','  *stepSlices(dtDays) {');
  slice=slice.replace('    const list = world.entities;','    yield {phase:"prepare"};\n    const list = world.entities;');
  slice=slice.replace("      if(measuring)endWorkMetric(world,'life.stepEntity',entityStarted);","      if(measuring)endWorkMetric(world,'life.stepEntity',entityStarted);\n      yield {phase:'entity',index:i};");
  slice=slice.replace('    this.syncVillagePops();',"    yield {phase:'death-sweep'};\n    this.syncVillagePops();");
  slice=slice.replace("    if(measuring)endWorkMetric(world,'life.post-entity',phaseStarted);","    if(measuring)endWorkMetric(world,'life.post-entity',phaseStarted);\n    yield {phase:'post-entity'};");
  fs.writeFileSync(p,body.slice(0,end)+'\n'+slice+body.slice(end));
 }else{
  const start=body.indexOf('export function advanceWorld(world, days, deps = {}) {');
  if(start<0)throw Error('Advance source anchor changed');
  let slice=body.slice(start).replace('export function advanceWorld(world, days, deps = {}) {','export function* advanceWorldSlices(world, days, deps = {}) {');
  slice=slice.replace('const fired = advanceWorld(world, slice, deps);','const fired = yield* advanceWorldSlices(world, slice, deps);');
  slice=slice.replace('    deps.life.step(days);','    yield* deps.life.stepSlices(days);');
  slice=slice.replace('  // ── 上界：',"  yield {phase:'life-complete'};\n  // ── 上界：");
  fs.writeFileSync(p,body+'\n'+slice);
 }
}
fs.writeFileSync(path.join(root,'reports/local/wx-e2p/source-hashes.json'),JSON.stringify({sourceHead:'cda97516d4a20e258af103cd395ddff67644b793',hashes},null,2));
console.log('Generated isolated source mirror',target,hashes);

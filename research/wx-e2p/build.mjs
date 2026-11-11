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
const rawHashes={},normalizedHashes={};
// Canonical Git blobs at #65 use LF. Check semantics independent of checkout EOL.
const expectedNormalizedHashes={'sim/life.js':'0d285f62b4a7d670085f6526970181fac3f4225bd6a7a84c5b55010f5048e4da','sim/advance.js':'1335246407f3bc829522800a25cd3beaa8f88c3b9d405565b518e7f9ecc2b2d0'};
for(const name of ['sim/life.js','sim/advance.js']){
 const p=path.join(target,name),raw=fs.readFileSync(p),body=raw.toString('utf8');rawHashes[name]=hash(raw);normalizedHashes[name]=hash(body.replace(/\r\n?/g,'\n'));
 if(normalizedHashes[name]!==expectedNormalizedHashes[name])throw Error(`Audited source changed: ${name} raw=${rawHashes[name]} normalized=${normalizedHashes[name]}`);
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
fs.writeFileSync(path.join(root,'reports/local/wx-e2p/source-hashes.json'),JSON.stringify({sourceHead:'cda97516d4a20e258af103cd395ddff67644b793',rawHashes,normalizedHashes,expectedNormalizedHashes},null,2));
console.log('Generated isolated source mirror',target,{rawHashes,normalizedHashes});

// Test-only access tracing. Production World/Entity objects are never proxied.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderFrame,getWorldStatus} from '../src/inkbox/presentation/readView/index.js';
import {getSettlementInspection} from '../src/inkbox/presentation/readView/query.js';
import {nativeApi,digest} from './inkbox-wx-e0-replay.mjs';

export function traceReads(world,read){
 const reads=new Map(),writes=[],seen=new WeakMap();
 function wrap(value,at){
  if(!value||typeof value!=='object'||value instanceof Map||value instanceof Set||ArrayBuffer.isView(value))return value;
  if(seen.has(value))return seen.get(value);
  const proxy=new Proxy(value,{get(target,key,receiver){const name=at+'.'+String(key);reads.set(name,(reads.get(name)||0)+1);return wrap(Reflect.get(target,key,receiver),name);},set(target,key){writes.push(at+'.'+String(key));throw Error('Read projection attempted authoritative write');},deleteProperty(target,key){writes.push(at+'.'+String(key));throw Error('Read projection attempted authoritative delete');}});
  seen.set(value,proxy);return proxy;
 }
 const result=read(wrap(world,'world'));return {result,reads:[...reads].map(([field,count])=>({field,count})),writes};
}
async function main(){
 const api=await nativeApi(),rows=[];
 for(const age of [100,400]){
  const file=path.resolve(`../inkbox-wxe0/reports/local/wx-e0/checkpoints/20260914-${age}y-save.json`),bytes=fs.readFileSync(file),c=api.restore(JSON.parse(bytes)),before=digest(api.capture(c));
  for(const [consumer,read]of [['RenderFrame',w=>renderFrame(w)],['HUD seed Query',w=>getWorldStatus(w)],['settlement inspection Query',w=>w.villages.length?getSettlementInspection(w,'mortal',w.villages[0].id):null]]){
   const trace=traceReads(c.world,read);rows.push({age,consumer,checkpointSha256:digest(bytes),reads:trace.reads,writes:trace.writes,resultBytes:Buffer.byteLength(JSON.stringify(trace.result))});
  }
  if(digest(api.capture(c))!==before)throw Error('Read tracing altered complete world/runtime/RNG');
 }
 const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'reports/local/wx-e2ra/read-audit.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({scope:'Opt-in Node production projection audit on genuine natural worlds. Maps/Sets/typed arrays are treated as leaf containers; whole-world before/after hashes catch authoritative mutation. This does not trace every main/Camera/Three/G1 reader.',rows},null,2));console.log('E2R-a access audit: natural100/400 RenderFrame, HUD and settlement Query, no writes or full-world/RNG change');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

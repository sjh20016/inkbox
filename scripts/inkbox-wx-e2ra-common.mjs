// Harness contract reused from committed E1C fdfdae00f92e621a44d679deee0dbc6d3323db6b; no A production code imported.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export {nativeApi,advanceDays,digest,assertNativeInvariants} from './inkbox-wx-e0-replay.mjs';
export const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const BASE='90219509ff77e7f13ec17b6e222c6c0844475569';
export const option=(n,d)=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)??d;
export const git=(root,args)=>execFileSync('git',['-c','safe.directory='+root,'-C',root,...args],{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const writeJson=(file,data)=>{fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));};
export function source(root=ROOT){
 const files=git(root,['ls-files','--cached','--others','--exclude-standard','src/inkbox','scripts/inkbox-wx-e2ra*','tests/fixtures/wx-e2ra-reference']).split(/\r?\n/).filter(f=>f&&fs.existsSync(path.join(root,f)));
 return {root,head:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),dirty:git(root,['status','--porcelain']),hashes:Object.fromEntries([...new Set(files)].sort().map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))};
}
export const environment=()=>({node:process.version,v8:process.versions.v8,platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,createdAt:new Date().toISOString(),command:process.argv});
export function readCheckpoint(age){const file=path.resolve(option('checkpoint-root',path.join(ROOT,'../inkbox-wxe0/reports/local/wx-e0/checkpoints')),`${option('seed','20260914')}-${age}y-save.json`),bytes=fs.readFileSync(file),saved=JSON.parse(bytes);if(!saved.runtime)throw Error('Missing native G8 runtime');return {file,bytes:bytes.length,sha256:hash(bytes),saved};}
export function exportReference(){
 const root=path.join(ROOT,'reports/local/wx-e2ra/reference');
 if(!fs.existsSync(path.join(root,'package.json'))){fs.mkdirSync(root,{recursive:true});const archive=path.join(root,'source.tar');execFileSync('git',['archive','--format=tar','--output='+archive,BASE,'src','package.json'],{cwd:ROOT});execFileSync('tar',['-xf',archive,'-C',root]);fs.unlinkSync(archive);}
 const listing=git(ROOT,['ls-tree','-r',BASE,'src','package.json']).split(/\r?\n/),hashes={},gitBlobs={};
 for(const line of listing){const match=line.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);if(!match)continue;const [,expected,file]=match,bytes=fs.readFileSync(path.join(root,file));
  const normalized=/\.(js|json|css|html|md|txt|csv|svg)$/.test(file)?Buffer.from(bytes.toString('utf8').replace(/\r\n?/g,'\n')):bytes;
  const blob=createHash('sha1').update('blob '+normalized.length+'\0').update(normalized).digest('hex');if(blob!==expected)throw Error('Frozen #66 reference changed: '+file);
  hashes[file]=hash(bytes);gitBlobs[file]=expected;
 }
 return {root,head:BASE,tree:git(ROOT,['rev-parse',BASE+'^{tree}']),dirty:false,hashes,gitBlobs,pinnedExport:true,normalization:'LF-normalized text Git blob identity; exact binary bytes'};
}

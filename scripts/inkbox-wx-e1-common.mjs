import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,nativeApi,advanceDays} from './inkbox-wx-e0-replay.mjs';
export {digest,nativeApi,advanceDays};
export const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const BASE='cda97516d4a20e258af103cd395ddff67644b793';
export const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
export const writeJson=(file,data)=>{fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));};
export const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
export function source(root=ROOT){
 const files=git(root,['ls-files','src/inkbox','scripts/inkbox-wx-e1*']).split(/\r?\n/).filter(f=>fs.existsSync(path.join(root,f)));
 // Include uncommitted new harnesses; never relabel an earlier run with a later SHA.
 for(const f of fs.readdirSync(path.join(root,'scripts')).filter(f=>f.startsWith('inkbox-wx-e1')))if(!files.includes('scripts/'+f))files.push('scripts/'+f);
 return {root,head:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),dirty:git(root,['status','--porcelain']),hashes:Object.fromEntries(files.sort().map(f=>[f,digest(fs.readFileSync(path.join(root,f)))]))};
}
export const environment=()=>({node:process.version,platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,createdAt:new Date().toISOString(),command:process.argv});
export function exportReference(){
 const dir=path.join(ROOT,'reports/local/wx-e1/reference');
 if(!fs.existsSync(path.join(dir,'package.json'))){fs.mkdirSync(dir,{recursive:true});const archive=path.join(dir,'source.tar');execFileSync('git',['archive','--format=tar','--output='+archive,BASE,'src','package.json'],{cwd:ROOT});execFileSync('tar',['-xf',archive,'-C',dir]);fs.unlinkSync(archive);}
 // Every export file is checked against the pinned Git blob on every invocation.
 const files=git(ROOT,['ls-tree','-r','--name-only',BASE,'src']).split(/\r?\n/);
 const hashes={},gitHashes={};for(const f of files){const actual=fs.readFileSync(path.join(dir,f));const expected=execFileSync('git',['show',BASE+':'+f],{cwd:ROOT,maxBuffer:32*1024*1024});
  const normalize=bytes=>/\.(js|json|css|html|md|txt|csv|svg)$/.test(f)?Buffer.from(bytes.toString('utf8').replace(/\r\n?/g,'\n')):bytes;
  if(digest(normalize(actual))!==digest(normalize(expected)))throw Error('Modified reference '+f);hashes[f]=digest(actual);gitHashes[f]=digest(expected);
 }
 return {root:dir,head:BASE,tree:git(ROOT,['rev-parse',BASE+'^{tree}']),dirty:false,hashes,gitHashes,normalization:'git archive honors Windows CRLF attributes; text compared as LF, binary bytes exact',pinnedExport:true};
}
export const checkpoint=age=>path.resolve(option('checkpoint-root',path.join(ROOT,'../inkbox-wxe0/reports/local/wx-e0/checkpoints')),`20260914-${age}y-save.json`);
export function readCheckpoint(age){const file=checkpoint(age),bytes=fs.readFileSync(file),saved=JSON.parse(bytes);if(!saved.runtime)throw Error('Missing native runtime');return {file,bytes:bytes.length,sha256:digest(bytes),saved};}
export const quantile=(a,p)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.max(0,Math.ceil(s.length*p)-1)]??null;};
export const distribution=a=>({n:a.length,p50:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99),max:a.length?Math.max(...a):null});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export {nativeApi,contextSummary,assertNativeInvariants} from './inkbox-wx-e0-replay.mjs';
export const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const BASELINE='9668e392e53a9ddf6159efe0c67d900802c98a7f';
export const option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));};
export const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:20*1024*1024}).trim();
export function source(){const files=git(['ls-files','--cached','--others','--exclude-standard','src','scripts/inkbox-e-m2*','scripts/cdp.mjs','scripts/inkbox-owned-server.mjs','scripts/inkbox-server.mjs','package.json','.github/workflows/ci.yml']).split(/\r?\n/).filter(f=>f&&fs.existsSync(path.join(ROOT,f)));return {head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),dirty:git(['status','--porcelain']),hashes:Object.fromEntries([...new Set(files)].sort().map(f=>[f,digest(fs.readFileSync(path.join(ROOT,f)))]))};}
export const environment=()=>({createdAt:new Date().toISOString(),node:process.version,v8:process.versions.v8,platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,command:process.argv});
export function checkpoint(age){const file=path.resolve(option('checkpoint-root','../inkbox-wx-s1/reports/local/wx-s1/natural'),`20260914-${age}y-save.json`);const bytes=fs.readFileSync(file),saved=JSON.parse(bytes);if(saved.v!==11||!saved.runtime)throw Error('Real v11/G8 input required: '+file);return {file,sha256:digest(bytes),bytes:bytes.length,saved};}
export function distribution(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??null;return {calls:sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)??null,total:sorted.reduce((a,b)=>a+b,0)};}
export function summarizeBreakdown(snapshot){const groups={};for(const row of snapshot.samples){if(row.inclusiveMs==null)continue;const g=groups[row.name]??={inclusive:[],exclusive:[]};g.inclusive.push(row.inclusiveMs);g.exclusive.push(row.exclusiveMs);}return Object.fromEntries(Object.entries(groups).map(([name,g])=>[name,{inclusiveMs:distribution(g.inclusive),exclusiveMs:distribution(g.exclusive)}]));}
export function verifiedReference(){const root=path.resolve(option('reference','reports/local/wx-em2/reference'));if(!fs.existsSync(path.join(root,'src/inkbox/main.js'))){fs.mkdirSync(root,{recursive:true});const tar=path.join(root,'source.tar');execFileSync('git',['archive','--format=tar','--output='+tar,BASELINE,'src','package.json'],{cwd:ROOT});execFileSync('tar',['-xf',tar,'-C',root]);}const rows=git(['ls-tree','-r',BASELINE,'src','package.json']).split(/\r?\n/);for(const row of rows){const m=row.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);if(!m)continue;const b=fs.readFileSync(path.join(root,m[2])),actual=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(actual!==m[1])throw Error('Reference blob changed: '+m[2]);}return {root,head:BASELINE,verifiedGitBlobs:rows.length};}

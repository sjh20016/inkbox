import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {execFileSync as realExec} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'scripts/cdp.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const profile='C:\\Temp\\cdp-Ab12xY',executable='C:\\Apps\\msedge.exe';
const frozen=[{pid:100,created:'123',executable,commandLine:`msedge.exe --user-data-dir=${profile}`,depth:0},{pid:200,created:'456',executable,commandLine:'msedge.exe --type=gpu-process',depth:1}];
function fixture(options={}){
 let present=true,removals=0,queries=0,terminations=0;const events=[],scripts=[],errors=[];
 const process={platform:'win32',env:{},exitCode:options.priorExit};
 const context={fs:{existsSync:()=>present,rmSync(){removals++;if(removals<=(options.locks||0))throw Object.assign(Error('held handle'),{code:'EPERM'});present=false;}},path:path.win32,os:{tmpdir:()=> 'C:\\Temp'},net:{},process,
   spawn(){throw Error('Real launch forbidden in virtual test');},
   execFileSync(file,args,config){assert.equal(file,'powershell.exe');const script=args.at(-1);scripts.push(script);
     if(config.env.INKBOX_CDP_FROZEN){events.push('terminate-frozen');terminations++;assert.deepEqual(JSON.parse(config.env.INKBOX_CDP_FROZEN),frozen);return JSON.stringify({attempted:options.pidReused?0:1,errors:[]});}
     events.push('discover');queries++;if(options.queryFails)throw Error('ownership inventory unavailable');
     return JSON.stringify({supported:true,processes:queries===1?frozen:(options.survivor?[frozen[1]]:[])});
   },console:{log(){},error:s=>errors.push(s)},setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){}};
 vm.runInNewContext(source+'\nglobalThis.TestSession=Session;',context);
 const child={pid:100,spawnfile:executable,exitCode:0,signalCode:null,kill(){throw Error('Cannot kill an unverified leader');}};
 const cdp={ws:{readyState:1,close(){events.push('socket-close');}},async send(){events.push('graceful-close');},rejectPending(){}};
 const session=new context.TestSession(cdp,child,options.profile||profile,{});
 return {session,process,events,scripts,errors,counts:()=>({removals,queries,terminations,present})};
}
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
await check('leader already exited: frozen descendants are still processed before profile removal',async()=>{
 const f=fixture();const r=await f.session.close();assert.equal(r.complete,true);assert.equal(f.counts().terminations,1);assert(f.events.indexOf('discover')<f.events.indexOf('graceful-close'));assert.equal(f.process.exitCode,undefined);
});
await check('temporary handle lock resolves under one shared bound without sticky intermediate exit1',async()=>{
 const f=fixture({locks:12});const r=await f.session.close();assert.equal(r.attempts,13);assert.equal(r.complete,true);assert.equal(f.process.exitCode,undefined);assert.equal(f.counts().queries,2);
});
await check('persistent lock retains terminal failure and original nonzero process gate',async()=>{
 const f=fixture({locks:100});const r=await f.session.close();assert.equal(r.complete,false);assert.equal(r.removed,false);assert.equal(f.counts().removals,20);assert.equal(f.process.exitCode,1);
});
await check('owned survivor prevents profile deletion even after termination attempt',async()=>{
 const f=fixture({survivor:true});const r=await f.session.close();assert.equal(r.complete,false);assert.equal(r.processesExited,false);assert.equal(f.counts().removals,0);assert.equal(f.process.exitCode,1);
});
await check('unknown ownership fails closed and never deletes the profile',async()=>{
 const f=fixture({queryFails:true});const r=await f.session.close();assert.equal(r.complete,false);assert.equal(f.counts().terminations,0);assert.equal(f.counts().removals,0);assert.equal(f.process.exitCode,1);
});
await check('out-of-Temp and prefix-collision targets cause no process or filesystem action',async()=>{
 for(const p of ['C:\\Users\\real-profile','C:\\Temp\\cdp-Ab12xY-other']){const f=fixture({profile:p});assert.equal((await f.session.close()).complete,false);assert.equal(f.counts().queries,0);assert.equal(f.counts().removals,0);assert.equal(f.counts().terminations,0);}
});
await check('successful cleanup never clears a prior product failure',async()=>{
 const f=fixture({priorExit:1});assert.equal((await f.session.close()).complete,true);assert.equal(f.process.exitCode,1);
});
await check('repeated and concurrent close calls share one terminal cleanup result',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.session.close(),f.session.close()]);assert.equal(a,b);assert.equal(await f.session.close(),a);assert.equal(f.counts().removals,1);assert.equal(f.counts().terminations,1);
});
await check('performance consumes the same terminal result without a second deletion or exit reset',async()=>{
 const s=fs.readFileSync(path.join(root,'scripts/inkbox-g2-performance.mjs'),'utf8');assert(!s.includes('async function removeOwnedProfile'));assert(s.includes('profileCleanupEvidence=cleanup;'));assert(s.includes('if(!cleanup.complete||!report.environment.edgeExited)'));assert(!/process\.exitCode\s*=\s*0/.test(s));
 assert(source.includes('await finalizeOwnedBrowser(child, userDataDir, cdp)'));
});
if(process.platform==='win32'){
 await check('real PowerShell identity filters reject PID reuse and command-line mismatch (mock processes only)',async()=>{
   const f=fixture();await f.session.close();const discovery=f.scripts.find(s=>s.includes('$rows = @()')),termination=f.scripts.find(s=>s.includes('$frozen = ConvertFrom-Json'));
   const rows=[...frozen.map(p=>({...p,parent:p.pid===200?100:0})),{pid:300,created:'789',executable,commandLine:`msedge.exe --user-data-dir=${profile}-other`,parent:0}];
   const prelude=`$ErrorActionPreference='Stop'; $script:fixture=ConvertFrom-Json -InputObject $env:INKBOX_TEST_PROCESSES; $script:stopped=@(); function Get-CimInstance { foreach($r in $script:fixture){[pscustomobject]@{ProcessId=[int]$r.pid;ParentProcessId=[int]$r.parent;CreationDate=[DateTime]::new([Int64]$r.created,[DateTimeKind]::Utc);ExecutablePath=[string]$r.executable;CommandLine=[string]$r.commandLine}} }; function Stop-Process {param([int]$Id,[switch]$Force,[string]$ErrorAction);$script:stopped+=$Id}; function Get-Process {param([int]$Id,[string]$ErrorAction);return $null};`;
   const run=(body,rows,prior=[])=>realExec('powershell.exe',['-NoProfile','-NonInteractive','-Command',prelude+body],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,INKBOX_TEST_PROCESSES:JSON.stringify(rows),INKBOX_CDP_PROFILE:profile,INKBOX_CDP_EXECUTABLE:executable,INKBOX_CDP_FROZEN:JSON.stringify(frozen),INKBOX_CDP_PRIOR_IDENTITIES:JSON.stringify(prior),INKBOX_CDP_LAUNCHER_PENDING:'false',INKBOX_CDP_LAUNCHER_PID:'100'}}).trim();
   const discovered=JSON.parse(run(discovery,rows));assert.deepEqual(discovered.processes.map(p=>p.pid).sort((a,b)=>a-b),[100,200]);
   const changed=rows.map(p=>p.pid===100?{...p,commandLine:p.commandLine+'-other'}:p.pid===200?{...p,created:'999'}:p);
   assert.equal(JSON.parse(run(termination,changed)).attempted,0);
   assert.equal(JSON.parse(run(termination,rows)).attempted,2);
   assert.deepEqual(JSON.parse(run(discovery,[rows[1]],frozen)).processes.map(p=>p.pid),[200],'Frozen orphan survives discovery after leader disappears');
   assert.equal(JSON.parse(run(discovery,[{...rows[1],created:'999'}],frozen)).processes.length,0,'Reused orphan PID is not the frozen process');
   const oldOrphan=[{...rows[0],created:'200'},{...rows[1],created:'100'}];
   assert.deepEqual(JSON.parse(run(discovery,oldOrphan)).processes.map(p=>p.pid),[100],'Child older than its apparent parent is not an owned descendant');
   const quoted=rows.map(p=>p.pid===100?{...p,commandLine:`msedge.exe "--user-data-dir=${profile}"`}:p);
   assert.deepEqual(JSON.parse(run(discovery,quoted)).processes.map(p=>p.pid).sort((a,b)=>a-b),[100,200]);
 });
}
console.log(JSON.stringify({pass:true,checks,scope:'Real cleanup coordinator with virtual filesystem/processes. Windows additionally executes its actual PowerShell filters against mocked cmdlets; no real browser is launched, killed or deleted.'}));

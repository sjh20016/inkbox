import {advanceWorldSlices} from '../../reports/local/wx-e2p/mirror/src/inkbox/sim/advance.js';
export function createEngine(saved,api){
 let committed=api.restore(saved), draft=null, iterator=null;
 let sessionId=0,seq=0,queue=[],paused=false,submitted=0,completed=0,commands=[];
 const snapshot=()=>api.capture(committed);
 const identity=()=>`${committed.world.seed}:${committed.world.day}`;
 function reset(input){sessionId++;seq=0;queue=[];draft=null;iterator=null;paused=false;submitted=0;completed=0;commands=[];committed=api.restore(input);return status();}
 function status(){return {sessionId,seq,worldId:identity(),committedDay:committed.world.day,submittedDays:submitted,completedDays:completed,backlogDays:submitted-completed,paused,busy:!!iterator,commands:[...commands]};}
 function command(payload,issuedRealTime=performance.now()){const entry={commandId:`${sessionId}:${++seq}`,issuedRealTime,acceptedSimulationBoundary:committed.world.day,payload};if(payload?.type!=='inspect')return {...entry,result:'rejected: unsupported experimental command'};commands.push(entry);return {...entry,result:'queued'};}
 function advance(days){if(!Number.isFinite(days)||days<=0)throw Error('invalid days');if(paused)return {accepted:false,reason:'paused',...status()};queue.push(days);submitted+=days;return {accepted:true,...status()};}
 function pump(budgetMs=7){const start=performance.now();let longest=0,steps=0;
  while(!paused&&(iterator||queue.length)){
   if(!iterator){const days=queue.shift();draft=api.restore(snapshot());iterator=advanceWorldSlices(draft.world,days,draft);draft._days=days;}
   const before=performance.now(),result=iterator.next();longest=Math.max(longest,performance.now()-before);steps++;
   if(result.done){committed=draft;completed+=draft._days;draft=null;iterator=null;}
   if(performance.now()-start>=budgetMs)break;
  }
  return {elapsedMs:performance.now()-start,longestPhaseMs:longest,slices:steps,...status()};
 }
 function pause(){paused=true;return status();}function resume(){paused=false;return status();}
 function cancel(){return reset(snapshot());}
 return {api,snapshot,status,command,advance,pump,pause,resume,cancel,reset};
}

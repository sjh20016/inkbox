import {advanceWorldSlices} from '../../reports/local/wx-e2p/mirror/src/inkbox/sim/advance.js';
export function createEngine(saved,api){
 let committed=api.restore(saved), draft=null, iterator=null;
 let sessionId=0,seq=0,queue=[],paused=false,submitted=0,completed=0,commands=[],fault=null;
 const snapshot=()=>api.capture(committed);
 const identity=()=>`${committed.world.seed}:${committed.world.day}`;
 function reset(input){sessionId++;seq=0;queue=[];draft=null;iterator=null;paused=false;submitted=0;completed=0;commands=[];fault=null;committed=api.restore(input);return status();}
 function status(){return {sessionId,seq,worldId:identity(),committedDay:committed.world.day,submittedDays:submitted,completedDays:completed,backlogDays:submitted-completed,paused,busy:!!iterator,fault,commands:[...commands]};}
 function command(payload,issuedRealTime=performance.now()){const entry={commandId:`${sessionId}:${++seq}`,issuedRealTime,acceptedSimulationBoundary:committed.world.day,payload};if(payload?.type!=='inspect'){commands.push({...entry,result:'rejected: unsupported experimental command'});return commands.at(-1);}const result={...entry,result:'completed',snapshot:snapshot()};commands.push({...entry,result:'completed'});return result;}
 function advance(days){if(!Number.isFinite(days)||days<=0)throw Error('invalid days');if(fault)return {accepted:false,reason:'faulted',...status()};if(paused)return {accepted:false,reason:'paused',...status()};queue.push(days);submitted+=days;return {accepted:true,...status()};}
 function pump(budgetMs=7){const start=performance.now();let longest=0,steps=0;
  while(!paused&&!fault&&(iterator||queue.length)){
   if(!iterator){try{const days=queue.shift();draft=api.restore(snapshot());iterator=advanceWorldSlices(draft.world,days,draft);draft._days=days;}catch(error){fault=String(error);draft=null;iterator=null;queue=[];throw error;}}
   const before=performance.now();let result;try{result=iterator.next();}catch(error){fault=String(error);draft=null;iterator=null;queue=[];throw error;}longest=Math.max(longest,performance.now()-before);steps++;
   if(result.done){committed=draft;completed+=draft._days;draft=null;iterator=null;}
   if(performance.now()-start>=budgetMs)break;
  }
  return {elapsedMs:performance.now()-start,longestPhaseMs:longest,slices:steps,...status()};
 }
 function pause(){paused=true;return status();}function resume(){paused=false;return status();}
 function cancel(){return reset(snapshot());}
 return {api,snapshot,status,command,advance,pump,pause,resume,cancel,reset};
}

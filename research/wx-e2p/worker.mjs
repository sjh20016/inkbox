import {api} from './browser-api.mjs';
let current=null,sessionId=null,worldId=null,seq=0,paused=false,queue=[],submitted=0,completed=0,fault=null,committedDay=null;
function response(type,requestSeq,data={}){postMessage({type,sessionId,seq:requestSeq,worldId,committedDay,submittedDays:submitted,completedDays:completed,backlogDays:submitted-completed,...data});}
function drain(){if(paused||fault||!current||!queue.length)return;const item=queue.shift();const started=performance.now();try{if(item.injectFailure==='after-partial-day'){current.world.day+=item.days;throw Error('injected partial transaction failure');}api.advance(current,item.days);completed+=item.days;committedDay=current.world.day;response('committed',item.seq,{cpuMs:performance.now()-started,snapshot:{day:committedDay,entities:current.world.entities.length}});setTimeout(drain,0);}catch(error){fault=String(error);queue=[];response('fault',item.seq,{error:fault});}}
onmessage=({data:m})=>{try{
 if(m.type==='init'||m.type==='load'){if(!Number.isSafeInteger(m.sessionId)||!Number.isSafeInteger(m.seq)||m.seq<=0||typeof m.worldId!=='string'||(sessionId!==null&&m.sessionId<=sessionId)){response('rejected',m.seq,{reason:'stale or invalid session transition'});return;}const restored=api.restore(m.saved);sessionId=m.sessionId;worldId=m.worldId;seq=m.seq;paused=false;queue=[];submitted=completed=0;fault=null;current=restored;committedDay=current.world.day;response('ready',m.seq);return;}
 if(m.sessionId!==sessionId||m.worldId!==worldId||m.seq<=seq){response('rejected',m.seq,{reason:'stale session/world/seq'});return;}seq=m.seq;
 if(m.type==='cancel'||m.type==='dispose'){queue=[];response(m.type,m.seq);close();return;}
 if(fault){response('rejected',m.seq,{reason:'faulted session; reload required'});return;}
 if(m.type==='advance'){if(typeof m.days!=='number'||!Number.isFinite(m.days)||m.days<=0){response('rejected',m.seq,{reason:'invalid days'});return;}if(paused){response('rejected',m.seq,{reason:'paused'});return;}queue.push({days:m.days,seq:m.seq,injectFailure:m.injectFailure});submitted+=m.days;response('accepted',m.seq);setTimeout(drain,0);}
 else if(m.type==='snapshot'||m.type==='inspect')response(m.type,m.seq,{snapshot:{day:current.world.day,entities:current.world.entities.length}});
 else if(m.type==='save')response('save',m.seq,{saved:api.capture(current)});
 else if(m.type==='pause'){paused=true;response('paused',m.seq);}
 else if(m.type==='resume'){paused=false;response('resumed',m.seq);setTimeout(drain,0);}
 else if(m.type==='command')response('rejected',m.seq,{reason:'unsupported experimental command',commandId:m.commandId,issuedRealTime:m.issuedRealTime,acceptedSimulationBoundary:current.world.day});
 else response('rejected',m.seq,{reason:'unknown type'});
 }catch(error){response('error',m.seq,{error:String(error),stack:error?.stack});}};

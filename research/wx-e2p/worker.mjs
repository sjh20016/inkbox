import {api} from './browser-api.mjs';
let current=null,sessionId=null,worldId=null,seq=0,paused=false,queue=[],submitted=0,completed=0;
function response(type,requestSeq,data={}){postMessage({type,sessionId,seq:requestSeq,worldId,committedDay:current?.world.day??null,submittedDays:submitted,completedDays:completed,backlogDays:submitted-completed,...data});}
function drain(){if(paused||!current||!queue.length)return;const item=queue.shift();const started=performance.now();api.advance(current,item.days);completed+=item.days;response('committed',item.seq,{cpuMs:performance.now()-started,snapshot:{day:current.world.day,entities:current.world.entities.length}});setTimeout(drain,0);}
onmessage=({data:m})=>{try{
 if(m.type==='init'||m.type==='load'){sessionId=m.sessionId;worldId=m.worldId;seq=0;paused=false;queue=[];submitted=completed=0;current=api.restore(m.saved);response('ready',m.seq);return;}
 if(m.sessionId!==sessionId||m.worldId!==worldId||m.seq<=seq){response('rejected',m.seq,{reason:'stale session/world/seq'});return;}seq=m.seq;
 if(m.type==='advance'){if(paused){response('rejected',m.seq,{reason:'paused'});return;}queue.push({days:m.days,seq:m.seq});submitted+=m.days;response('accepted',m.seq);setTimeout(drain,0);}
 else if(m.type==='snapshot'||m.type==='inspect')response(m.type,m.seq,{snapshot:{day:current.world.day,entities:current.world.entities.length}});
 else if(m.type==='save')response('save',m.seq,{saved:api.capture(current)});
 else if(m.type==='pause'){paused=true;response('paused',m.seq);}
 else if(m.type==='resume'){paused=false;response('resumed',m.seq);setTimeout(drain,0);}
 else if(m.type==='command')response('rejected',m.seq,{reason:'unsupported experimental command',commandId:m.commandId,issuedRealTime:m.issuedRealTime,acceptedSimulationBoundary:current.world.day});
 else if(m.type==='cancel'||m.type==='dispose'){queue=[];response(m.type,m.seq);close();}
 else response('rejected',m.seq,{reason:'unknown type'});
 }catch(error){response('error',m.seq,{error:String(error),stack:error?.stack});}};

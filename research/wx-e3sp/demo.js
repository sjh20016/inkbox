import { createResumableSimulation } from './engine.js';
import { createCanvasPresenter,createThreePresenter } from './presenters.js';
const params=new URLSearchParams(location.search),age=params.get('age')||'400',rendererKind=params.get('renderer')==='3d'?'3d':'canvas',mode=params.get('mode')==='sync'?'sync':'cooperative';
const canvas=document.querySelector('#surface'),feedback=document.querySelector('#feedback'),stats=document.querySelector('#stats'),abort=new AbortController(),options={signal:abort.signal};
let simulation,presenter,raf,disposed=false,point,previous,started,startDay,localPending=[];
const frameStats=[],inputStats=[];
const eventStats={count:0,consumedIDs:[],lastDelivery:null},seenEvents=new Set();
function consumeEvents(committed){
  for(const packet of simulation.getEvents()){
    if(packet.worldGeneration!==committed.worldGeneration||packet.commitSequence>committed.commitSequence)throw Error('Event packet is outside the visible committed generation');
    if(seenEvents.has(packet.deliveryId))continue;
    seenEvents.add(packet.deliveryId);eventStats.consumedIDs.push(packet.deliveryId);eventStats.count++;eventStats.lastDelivery={deliveryId:packet.deliveryId,commitSequence:packet.commitSequence,plane:packet.plane,type:packet.event.type};
  }
  document.querySelector('#event-feedback').textContent=`已提交事件：${eventStats.count}${eventStats.lastDelivery?' · '+eventStats.lastDelivery.type:''}`;
  if(!simulation.ackEvents(committed.commitSequence,committed.worldGeneration))throw Error('Committed event acknowledgement rejected');
}
function message(text){feedback.textContent=text;}
function command(type,payload={}){const now=performance.now(),s=simulation.getStatus(),f=simulation.getFrame(),record={type,issuedMs:now,localPaintedMs:null,authorityMs:null};inputStats.push(record);localPending.push(record);
  const ack=simulation.submit({schemaVersion:1,worldGeneration:s.worldGeneration,seq:s.nextCommandSeq,issuedAtCommittedDay:f.committedDay,type,payload});record.ack=ack;message(ack.ok?'输入已收到 · 等待完整结算':'未受理 · '+ack.reason);
  if(ack.ok)simulation.waitForReceipt(ack.seq).then(receipt=>{record.authorityMs=performance.now();record.receipt=receipt;message('权威回执 · '+JSON.stringify(receipt));}).catch(e=>{record.error=e.message;message(e.message);});return ack;
}
function power(){const f=simulation.getFrame(),e=simulation.getQuery()?.entities?.[0],p=point||{x:Math.floor(e?.x??f.geometry.w/2),y:Math.floor(e?.y??f.geometry.h/2)},toolId=document.querySelector('#tool').value;return command(toolId==='raise'?'terrain-stroke':'power',{toolId,point:p,radius:1,...(toolId==='raise'?{points:[{...p,count:1}]}:{})});}
function bind(){document.querySelector('#command').addEventListener('click',power,options);document.querySelector('#undo').addEventListener('click',()=>command('undo'),options);
  document.querySelector('#story').addEventListener('click',async()=>{const ref=simulation.getQuery()?.entities?.find(e=>e.storyRef)?.storyRef;if(!ref){message('此提交没有可读人物身份');return;}try{const cards=await simulation.readStories(ref,simulation.getStatus().worldGeneration),out=document.querySelector('#story-result');out.hidden=false;out.textContent=JSON.stringify(cards,null,2);}catch(e){message(e.message);}},options);
  document.querySelector('#pause').addEventListener('click',()=>simulation.pause(performance.now()),options);document.querySelector('#resume').addEventListener('click',()=>simulation.resume(2,performance.now()),options);
  document.querySelector('#cancel').addEventListener('click',()=>{simulation.cancel();message('事务已取消；须显式恢复，未宣称回滚。');},options);
  document.querySelector('#recover').addEventListener('click',()=>simulation.recover().then(()=>message('已显式恢复完整记录')).catch(e=>message(e.message)),options);
  document.querySelector('#save').addEventListener('click',async()=>{try{const text=await simulation.requestSave();const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download='inkbox-e3sp-complete.json';a.click();URL.revokeObjectURL(url);message('完整边界已导出');}catch(e){message(e.message);}},options);
  let drag=null;canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};const r=canvas.getBoundingClientRect();point=presenter.pick(e.clientX-r.left,e.clientY-r.top);},options);
  canvas.addEventListener('pointermove',e=>{if(!drag)return;presenter.pan(drag.x-e.clientX,drag.y-e.clientY);drag={x:e.clientX,y:e.clientY};},options);for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;},options);
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();presenter.zoom(e.deltaY<0?1.1:1/1.1,e.clientX-r.left,e.clientY-r.top);},{...options,passive:false});
}
function frame(now){if(disposed)return;const enter=performance.now(),dt=previous===undefined?0:(now-previous)/1000,interval=previous===undefined?null:now-previous;previous=now;
  try{simulation.tick(enter);simulation.runSlice({budgetMs:6,maxStarts:1});const committed=simulation.getFrame();presenter.setFrame(committed);presenter.render(enter/1000,dt);consumeEvents(committed);for(const p of localPending)p.localPaintedMs=performance.now();localPending=[];
    const s=simulation.getStatus();stats.textContent=JSON.stringify({renderer:rendererKind,mode,elapsedSeconds:(enter-started)/1000,committedDay:committed.committedDay,actualDaysPerSecond:(committed.committedDay-startDay)/((enter-started)/1000||1),...s},null,2);
    frameStats.push({rafMs:now,intervalMs:interval,enterMs:enter,endMs:performance.now(),committedDay:committed.committedDay,commitSequence:committed.commitSequence});
  }catch(error){message('研究运行错误 · '+error.message);window.e3spDemo.error=error.stack;}raf=requestAnimationFrame(frame);
}
async function boot(){const response=await fetch(`/reports/local/wx-e3sp/inputs/${age}.json`);if(!response.ok)throw Error('缺少原始检查点 '+response.status);const text=await response.text();simulation=await createResumableSimulation(text,{mode,budgetMs:6,riftActive:false});const first=simulation.getFrame();presenter=(rendererKind==='3d'?createThreePresenter:createCanvasPresenter)(canvas,first);started=performance.now();startDay=first.committedDay;
  window.e3spDemo={simulation,rendererKind,mode,frameStats,inputStats,eventStats,presenter,command,power,dispose(){disposed=true;cancelAnimationFrame(raf);abort.abort();presenter.dispose();simulation.dispose();}};bind();simulation.setSpeed(2,started);message('只读已提交世界 · 点击地表选点，再落笔');raf=requestAnimationFrame(frame);}
window.addEventListener('pagehide',()=>window.e3spDemo?.dispose(),{once:true});boot().catch(e=>{message(e.message);window.e3spDemo={error:e.stack};console.error(e);});

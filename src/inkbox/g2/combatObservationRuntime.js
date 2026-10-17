import { characterKey, createSelectionToken, resolveCharacter } from '../g1/characterIdentity.js';
import { createCombatObserverView } from '../ui/g2/combat/combatObserverView.js';
import { canAccess } from '../core/mapAccess.js';

const PLANES = ['mortal', 'upper', 'nether'];
const LIMIT = 24;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fingerprint = item => JSON.stringify([item.plane,item.day,item.subjectId,item.targetId,item.seed,item.x,item.y,item.data?.fromX,item.data?.fromY,item.data?.style]);
const sourceFor = (world, plane) => plane === 'mortal' ? world : world?.[plane];

/** Match what the host currently renders. No tool switch or invented realm window. */
export function combatPointVisible(sb, plane, x, y) {
  const source=sourceFor(sb.world,plane);
  if (!source || !Number.isFinite(x) || !Number.isFinite(y) || x<0 || y<0 || x>=source.w || y>=source.h || !canAccess(sb.world,x,y)) return false;
  const view = sb.getRealmViewState?.();
  const active = sb.render3d?.active ? sb.render3d.renderer?.activePlane || 'mortal' : 'mortal';
  if (active !== 'mortal') return plane === active;
  const inWindow = !!(view?.open && view.region?.contains(x,y));
  return plane === 'mortal' ? !inWindow : inWindow && view.targetPlane === plane;
}

/** Session-only bindings to already ingested snapshots; never a second consumer/history. */
export function createCombatObservationRuntime({getWorld,getStage,getCharacter=()=>null,isVisible=()=>false,onFocus=()=>{},view}={}) {
  let world=null, ingested=null, epoch=0, sequence=0, ingestedSources=new Map(), entries=new Map(), vm=null, rendered='', destroyed=false;
  function reset() { if(destroyed)return null;world=getWorld();ingested=null;ingestedSources.clear();epoch++;sequence=0;entries.clear();rendered='';vm=freeze({enabled:true,events:[],focusedCharacter:null,summary:{text:'近讯只覆盖仍存续的采样反馈，不代表完整交手史。'}});view?.render(vm);return vm; }
  function sync() { if(world!==getWorld())reset(); }
  function snapshots() { return ingested===world && world ? PLANES.flatMap(plane=>(ingestedSources.get(plane)===sourceFor(world,plane)?getStage()?.snapshotPlane(plane)?.items||[]:[]).filter(item=>item.kind==='combat').map(item=>({item,signature:fingerprint(item)}))) : []; }
  function live(token,plane) {
    if(!token)return null;
    const r=resolveCharacter(world,token.key,{token});
    return r.ok && r.status==='alive' && r.sourceWorld===sourceFor(world,plane) && (r.currentPlane||r.plane)===plane && Number.isFinite(r.entity?.hp) && r.entity.hp>0 ? r.entity : null;
  }
  function resolveEntry(entry,now) {
    if(!entry || entry.epoch!==epoch || entry.world!==world || entry.source!==sourceFor(world,entry.plane))return null;
    const observed=now.find(row=>row.signature===entry.signature);
    const actor=live(entry.actorToken,entry.plane),target=live(entry.targetToken,entry.plane);
    return observed && actor && target && isVisible(entry.plane,actor.x,actor.y) && isVisible(entry.plane,target.x,target.y) ? {actor,target,item:observed.item} : null;
  }
  function current() { if(destroyed)return null;sync();return vm; }
  function refresh({ingestedWorld,readyOnly=false}={}) {
    if(destroyed)return null;sync();if(ingestedWorld===world){ingested=world;ingestedSources=new Map(PLANES.map(plane=>[plane,sourceFor(world,plane)]));}
    if(readyOnly)return vm;
    const now=snapshots(), next=new Map();
    for(const {item,signature} of now) {
      const source=sourceFor(world,item.plane);
      const previous=[...entries.values()].find(entry=>entry.signature===signature && entry.source===source && entry.world===world && entry.epoch===epoch);
      const entry=previous || {id:`combat-${epoch}-${++sequence}`,epoch,world,source,plane:item.plane,signature,
        actorToken:createSelectionToken(world,characterKey(item.plane,item.subjectId)),targetToken:createSelectionToken(world,characterKey(item.plane,item.targetId))};
      // Keep the original binding until this snapshot expires. Dropping an
      // invalid token would let a later refresh bind the old hit to a reused ID.
      next.set(entry.id,entry);
    }
    entries=next;
    const focused=getCharacter(), health=focused?.health;
    const events=[...entries.values()].map(entry=>{
      const row=now.find(row=>row.signature===entry.signature), valid=resolveEntry(entry,now), item=row.item;
      if(!valid)return null;
      return {id:entry.id,day:item.day,type:'damage',title:'交手留痕',detail:'眼下的命中动静，不说明持续交战、胜败或伤因。',plane:item.plane,
        actor:entry.actorToken?.entity?.name||`人物 #${item.subjectId}`,target:entry.targetToken?.entity?.name||`人物 #${item.targetId}`,
        timeLabel:Number.isFinite(item.day)?`第 ${item.day} 日`:'发生日不可考',x:valid?.target.x??null,y:valid?.target.y??null,canObserve:!!valid};
    }).filter(Boolean).slice(-LIMIT);
    vm=freeze({enabled:true,events,focusedCharacter:focused?{name:focused.identity.name,combatStatus:['wounded','recovering'].includes(health?.state)?health.state:'unknown'}:null,
      summary:{text:(health?`气血：${health.hpText}；${health.restText}。`:'')+'近讯只显示眼下可观测的交手动静，可能有所遗漏；气血与生平以命簿保留记录为准。墨痕散去不说明胜负。'}});
    const text=JSON.stringify(vm);if(text!==rendered){rendered=text;view?.render(vm);}return vm;
  }
  function handleAction(action) {
    if(destroyed)return {ok:false,reason:'destroyed'};sync();
    if(action?.type!=='locate-combat')return {ok:false,reason:'invalid-action'};
    const valid=resolveEntry(entries.get(action.eventId),snapshots());
    if(!valid)return {ok:false,reason:'stale-or-inaccessible-event'};
    const entry=entries.get(action.eventId);
    onFocus({plane:entry.plane,x:valid.target.x,y:valid.target.y});
    return {ok:true,effect:{type:'focus',plane:entry.plane,x:valid.target.x,y:valid.target.y}};
  }
  reset();return {current,refresh,handleAction,reset,destroy(){if(destroyed)return;reset();destroyed=true;view?.destroy();}};
}

export function createSandboxCombatObservation(sb,root) {
  let runtime;
  const view=root?createCombatObserverView(root,{onAction:action=>runtime.handleAction(action)}):null;
  runtime=createCombatObservationRuntime({getWorld:()=>sb.world,getStage:()=>sb.stage,getCharacter:()=>sb.g1.current(),view,
    isVisible:(plane,x,y)=>combatPointVisible(sb,plane,x,y),onFocus:({plane,x,y})=>{
      if(sb.render3d?.active)sb.render3d.renderer.focusOn(x,y,{duration:.75},plane);
      else sb.camera.focusOn(x,y,{zoom:Math.max(sb.camera.zoom,7),duration:.75});
      sb.dirty=true;
    }});
  return runtime;
}

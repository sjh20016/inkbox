// Presentation only. Never interpret an attack animation as a persistent kill or victory.
export const COMBAT_EVENT_LIMIT=24;
export const COMBAT_STATES=Object.freeze({
  fighting:"正在交战",wounded:"负伤",recovering:"养伤中",left:"已离开战斗",
  idle:"未在交战",unknown:"当前状态未知",
});
const PLANES=new Set(["mortal","upper","nether"]);
const TYPES=new Set(["encounter","attack","damage","retreat","battle","other"]);
function str(value,fallback="未载") {
  return typeof value==="string" && value.trim() ? value.trim().slice(0,180) : fallback;
}
export function normalizeCombatEvents(events){
  if(!Array.isArray(events))return [];
  const result=[],seen=new Set();
  // Newest at the end. Keep cap to avoid unbounded DOM churn.
  for(let i=events.length-1;i>=0 && result.length<COMBAT_EVENT_LIMIT;i--){
    const entry=events[i];
    if(!entry || typeof entry!=="object")continue;
    const key=typeof entry.id==="string" || typeof entry.id==="number" ? String(entry.id) : "index:"+i;
    if(seen.has(key))continue; seen.add(key);
    const type=TYPES.has(entry.type)?entry.type:"other";
    // Only allowed safe generic labels. Long-term battles / kills must come from the host chronicle elsewhere.
    const title=str(entry.title,type==="attack"?"交手动静":"交战动静");
    const detail=str(entry.detail,"");
    const plane=PLANES.has(entry.plane)?entry.plane:"unknown";
    const x=typeof entry.x==="number"&&Number.isFinite(entry.x)?entry.x:null;
    const y=typeof entry.y==="number"&&Number.isFinite(entry.y)?entry.y:null;
    const canObserve=entry.canObserve===true && x!==null&&y!==null&&plane!=="unknown";
    result.push({id:key,type,title,detail,plane,x,y,canObserve,
      actor:str(entry.actor,""),target:str(entry.target,""),
      // Echo externally verified labels only; never derive persistent facts from FX.
      timeLabel:str(entry.timeLabel,""),
    });
  }
  return result.reverse();
}
export function combatCharacterStatus(focusedCharacter){
  const status=focusedCharacter?.combatStatus;
  return Object.hasOwn(COMBAT_STATES,status)?COMBAT_STATES[status]:COMBAT_STATES.unknown;
}
export function combatObserverModel(input={}){
  const model=input && typeof input==="object"?input:{};
  return {enabled:model.enabled===true,events:normalizeCombatEvents(model.events),
    status:combatCharacterStatus(model.focusedCharacter),
    characterName:str(model.focusedCharacter?.name,"未选中人物"),
    summary:typeof model.summary?.text==="string"?str(model.summary.text,""):"",
    loading:model.loading===true,error:str(model.error,""),
  };
}

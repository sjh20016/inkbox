// Presentation-only contract. Host owns task capability, target checks, execution and completion.
export const TASK_KINDS=Object.freeze([
  {id:"seek-prodigy",title:"寻访天才",description:"访察修行资质出众者，回报所见。"},
  {id:"investigate-site",title:"调查秘境",description:"前往指定遗迹或秘境，探察线索。"},
  {id:"clear-beast",title:"清理凶兽",description:"前往选定地区，查访凶兽之患。"},
]);
export const TASK_STATES=Object.freeze({
  idle:"待命",traveling:"赶路",working:"执行中",blocked:"受阻",
  completed:"已完成",failed:"已失败",
});
function label(value,fallback="未载",limit=300){
  return typeof value==="string"&&value.trim()?value.trim().slice(0,limit):fallback;
}
export function normalizeBusanziModel(input={}){
  const model=input&&typeof input==="object"?input:{};
  const c=model.character&&typeof model.character==="object"?model.character:{};
  const affinity=model.affinity&&typeof model.affinity==="object"?model.affinity:{};
  const capabilities=model.capabilities&&typeof model.capabilities==="object"?model.capabilities:{};
  const logs=Array.isArray(model.dialogue)?model.dialogue.slice(-12):[];
  const tasks=Array.isArray(model.tasks)?model.tasks.slice(0,12):[];
  return {
    displayName:label(c.displayName,"卜算子",40),realName:"未知",
    state:label(c.state,"行踪未载",80),location:label(c.location,"未载",80),
    affinityLabel:label(affinity.label,"亲缘未载",80),
    affinityProgress:typeof affinity.percent==="number"&&Number.isFinite(affinity.percent)?
      Math.min(100,Math.max(0,affinity.percent)):null,
    dialogue:logs.map(d=>typeof d==="string"?{text:label(d)}:{
      text:label(d?.text),time:label(d?.time,"",40)}),
    tasks:tasks.map((t,i)=>({
      id:String(t?.id??i),title:label(t?.title,TASK_KINDS.find(k=>k.id===t?.taskType)?.title??"未名委托",80),
      stateLabel:TASK_STATES[t?.state]??"状态未载",
      targetLabel:label(t?.targetLabel,"目标未载",80),result:label(t?.result,"",160),
    })),
    canRequestTask:capabilities.taskRequests===true,
    allowedTaskKinds:Array.isArray(capabilities.allowedTaskKinds)?
      capabilities.allowedTaskKinds.filter(id=>TASK_KINDS.some(t=>t.id===id)):[],
    targets:capabilities.targets&&typeof capabilities.targets==="object"?capabilities.targets:{},
    guide:label(model.guide?.text,"",220),guideAvailable:model.guide?.available===true,
    helpAvailable:capabilities.help!==false,
    busy:model.busy===true,error:label(model.error,"",150),wind:model.wind==="breeze",
  };
}
export function makeBusanziTaskRequest(taskType,target,capabilities={}){
  if(capabilities?.taskRequests!==true)return null;
  if(!TASK_KINDS.some(t=>t.id===taskType))return null;
  if(!Array.isArray(capabilities.allowedTaskKinds)||!capabilities.allowedTaskKinds.includes(taskType))return null;
  if(!target||typeof target!=="object"||!["site","entity","region"].includes(target.kind))return null;
  if(!(typeof target.id==="string"&&target.id.trim()||Number.isSafeInteger(target.id)))return null;
  return {type:"request-busanzi-task",taskType,target:{kind:target.kind,id:target.id}};
}

import { TASK_KINDS,normalizeBusanziModel,makeBusanziTaskRequest } from "./busanziBridgeModel.js";
import { busanziPortraitSvg } from "./busanziPortrait.js";
function n(d,t,c,v){const e=d.createElement(t);if(c)e.className=c;if(v!==undefined)e.textContent=v;return e;}
function put(el,v){const text=String(v??"");if(el.textContent!==text)el.textContent=text;}
/** No simulated AI. Tasks remain host-gated requests; guide is opt-out and never hijacks focus. */
export function createBusanziBridgeView(root,{onAction}={}){
  if(!root?.ownerDocument||typeof root.replaceChildren!=="function")throw new TypeError("DOM root required");
  const doc=root.ownerDocument,frame=n(doc,"section","g2-busanzi");
  frame.setAttribute("aria-label","卜算子 · 天意桥");
  const trigger=n(doc,"button","g2-busanzi__trigger","☲ 卜算子 · 展开");trigger.type="button";
  const panel=n(doc,"div","g2-busanzi__panel");
  const head=n(doc,"header","g2-busanzi__head");
  const portrait=n(doc,"img","g2-busanzi__portrait");portrait.alt="卜算子 · 离卦符纸遮面";
  const info=n(doc,"div"),title=n(doc,"h2","","卜算子"),name=n(doc,"small","","本名 · 未知"),affinity=n(doc,"p","g2-busanzi__affinity");
  info.append(title,name,affinity);
  const close=n(doc,"button","g2-busanzi__close","收起");close.type="button";
  head.append(portrait,info,close);
  const motto=n(doc,"p","g2-busanzi__motto","半遮真容，半说天机。");
  const guide=n(doc,"div","g2-busanzi__guide"),guideText=n(doc,"p");
  const skip=n(doc,"button","","跳过引导");skip.type="button";guide.append(guideText,skip);
  const tabs=n(doc,"nav","g2-busanzi__tabs");
  const tabButtons=new Map(),pages=new Map();
  [["dialogue","其一 · 闲谈"],["tasks","其二 · 天意委托"],["journey","其三 · 行踪"]].forEach(([key,label])=>{
    const btn=n(doc,"button","",label);btn.type="button";btn.dataset.tab=key;
    btn.setAttribute("aria-pressed",String(key==="dialogue"));tabButtons.set(key,btn);tabs.append(btn);
    const page=n(doc,"section","g2-busanzi__page");pages.set(key,page);page.hidden=key!=="dialogue";
  });
  const dialogueList=n(doc,"ol","g2-busanzi__dialogue");pages.get("dialogue").append(dialogueList);
  const taskHint=n(doc,"p","g2-busanzi__hint"),taskList=n(doc,"div","g2-busanzi__tasks");
  pages.get("tasks").append(taskHint,taskList);
  const journeyStatus=n(doc,"p","g2-busanzi__hint"),journeyList=n(doc,"div","g2-busanzi__journey");
  pages.get("journey").append(journeyStatus,journeyList);
  const error=n(doc,"p","g2-busanzi__error");error.setAttribute("role","status");
  const footer=n(doc,"footer","g2-busanzi__footer"),help=n(doc,"button","","重新打开帮助");
  help.type="button";footer.append(help);
  panel.append(head,motto,guide,tabs,...pages.values(),error,footer);frame.append(trigger,panel);
  root.replaceChildren(frame);
  let disposed=false,expanded=false,dismissed=false,current=null,portraitKey=null;
  const emit=(action)=>{if(!disposed&&typeof onAction==="function")onAction(action);};
  function toggle(value){
    expanded=!!value;panel.hidden=!expanded;
    put(trigger,expanded?"☲ 卜算子 · 收起":"☲ 卜算子 · 展开");
    trigger.setAttribute("aria-expanded",String(expanded));
  }
  function switchTab(key){
    if(!pages.has(key))return;
    for(const [k,page] of pages){page.hidden=k!==key;tabButtons.get(k).setAttribute("aria-pressed",String(k===key));}
  }
  function onClick(event){
    if(disposed)return;
    const btn=event.target.closest?.("button");if(!btn||!frame.contains(btn)||btn.disabled)return;
    if(btn===trigger)toggle(!expanded);
    else if(btn===close)toggle(false);
    else if(btn===help)emit({type:"open-help",source:"busanzi"});
    else if(btn===skip){dismissed=true;guide.hidden=true;emit({type:"dismiss-busanzi-guide"});}
    else if(btn.dataset.tab)switchTab(btn.dataset.tab);
    else if(btn.dataset.taskType){
      const type=btn.dataset.taskType;
      const req=makeBusanziTaskRequest(type,current?.targets[type],{
        taskRequests:current?.canRequestTask,allowedTaskKinds:current?.allowedTaskKinds,
      });
      if(req)emit(req);
    }
  }
  frame.addEventListener("click",onClick);toggle(false);
  return {
    render(model={}){
      if(disposed)return;
      current=normalizeBusanziModel(model);
      put(title,current.displayName);put(affinity,current.affinityLabel+
        (current.affinityProgress===null?"":" · "+Math.round(current.affinityProgress)+"%"));
      put(error,current.busy?"正在等待天意回应…":current.error);
      const key=current.wind?"breeze":"still";
      if(portraitKey!==key){
        portrait.src="data:image/svg+xml;charset=utf-8,"+
          encodeURIComponent(busanziPortraitSvg({wind:current.wind}));
        portraitKey=key;
      }
      guide.hidden=dismissed || !current.guideAvailable || !current.guide;
      put(guideText,current.guide);
      put(taskHint,current.canRequestTask?"委托请求由宿主裁决，尚不代表已接单。":"任务能力尚未开放，此处仅展示未来入口。");
      help.disabled=!current.helpAvailable;
      current.dialogue.forEach((entry,i)=>{
        let li=dialogueList.children[i];if(!li){li=n(doc,"li");dialogueList.append(li);}
        put(li,entry.text+(entry.time?" · "+entry.time:""));
      });
      while(dialogueList.children.length>current.dialogue.length)dialogueList.lastChild.remove();
      if(!current.dialogue.length&& !dialogueList.children.length)dialogueList.append(n(doc,"li","","尚无对话记录"));
      TASK_KINDS.forEach((kind,i)=>{
        let row=taskList.children[i];
        if(!row){
          row=n(doc,"article","g2-busanzi__task");
          const text=n(doc,"div");text.append(n(doc,"strong"),n(doc,"p"),n(doc,"small"));
          const button=n(doc,"button","g2-busanzi__request","请求委托");button.type="button";
          button.dataset.taskType=kind.id;row.append(text,button);taskList.append(row);
        }
        const text=row.children[0],button=row.children[1];
        put(text.children[0],kind.title);put(text.children[1],kind.description);
        const available=makeBusanziTaskRequest(kind.id,current.targets[kind.id],{
          taskRequests:current.canRequestTask,allowedTaskKinds:current.allowedTaskKinds,
        })!==null;
        put(text.children[2],available?"已有目标 · 待裁决":"目标未载或任务未开放");
        button.disabled=!available||current.busy;
      });
      put(journeyStatus,"行踪 · "+current.state+" / 所在 · "+current.location);
      if(current.tasks.length && journeyList.children.length && journeyList.children[0].className==="g2-busanzi__hint") journeyList.replaceChildren();
      current.tasks.forEach((task,i)=>{
        let row=journeyList.children[i];
        if(!row){row=n(doc,"article","g2-busanzi__journey-item");row.append(n(doc,"strong"),n(doc,"span"),n(doc,"small"));journeyList.append(row);}
        put(row.children[0],task.title+" · "+task.stateLabel);
        put(row.children[1],"目标："+task.targetLabel);put(row.children[2],task.result);
      });
      while(journeyList.children.length>current.tasks.length)journeyList.lastChild.remove();
      if(!current.tasks.length && !journeyList.children.length)journeyList.append(n(doc,"p","g2-busanzi__hint","尚无委托行踪"));
    },
    destroy(){if(disposed)return;disposed=true;frame.removeEventListener("click",onClick);
      portrait.removeAttribute("src");frame.remove();},
  };
}

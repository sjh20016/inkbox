import { combatObserverModel } from "./combatObserverModel.js";
function n(doc,tag,cls,text){
  const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
}
function update(el,text){const v=String(text??"");if(el.textContent!==v)el.textContent=v;}
/** Host explicitly curates recent combat signals and character status. Emits locate requests only. */
export function createCombatObserverView(root,{onAction}={}){
  if(!root?.ownerDocument||typeof root.replaceChildren!=="function")throw new TypeError("DOM root required");
  const doc=root.ownerDocument,frame=n(doc,"section","g2-combat");
  frame.setAttribute("aria-label","交战观测");
  const header=n(doc,"header","g2-combat__header");
  header.append(n(doc,"h3","","山河有声"));
  const counter=n(doc,"span","g2-combat__counter");header.append(counter);
  const status=n(doc,"p","g2-combat__status");
  const detail=n(doc,"p","g2-combat__detail");
  const message=n(doc,"p","g2-combat__message");message.setAttribute("role","status");
  const list=n(doc,"ol","g2-combat__list");
  const empty=n(doc,"p","g2-combat__empty","眼下未见交手之声");
  frame.append(header,status,detail,message,list,empty);
  root.replaceChildren(frame);
  let disposed=false,valid=new Map();
  function onClick(event){
    if(disposed)return;
    const btn=event.target.closest?.("[data-combat-key]");
    if(!btn || !frame.contains(btn) || btn.disabled)return;
    const item=valid.get(btn.dataset.combatKey);
    if(!item?.canObserve)return;
    if(typeof onAction==="function")onAction({
      type:"locate-combat",eventId:item.id,plane:item.plane,x:item.x,y:item.y,
    });
  }
  frame.addEventListener("click",onClick);
  return {
    render(input={}){
      if(disposed)return;
      const vm=combatObserverModel(input);valid=new Map(vm.events.map(e=>[e.id,e]));
      update(status,vm.characterName+" · "+vm.status);
      update(detail,vm.summary);
      update(message,vm.loading?"观测载入中…":vm.error);
      update(counter,vm.enabled?vm.events.length+" 则近讯":"尚未接入");
      empty.hidden=vm.enabled && vm.events.length>0;empty.textContent=!vm.enabled?
        "宿主尚未提供交战观测信息":vm.loading?"交战记录读取中…":"眼下未见交手之声";
      const scroll=list.scrollTop;
      const shown=vm.enabled?vm.events:[];
      shown.forEach((item,i)=>{
        let row=list.children[i];
        if(!row){
          row=n(doc,"li","g2-combat__item");
          const inner=n(doc,"div","g2-combat__item-text");
          inner.append(n(doc,"strong"),n(doc,"small"),n(doc,"span"));
          const watch=n(doc,"button","g2-combat__watch","前往观战");
          watch.type="button";row.append(inner,watch);list.append(row);
        }
        const inner=row.children[0],watch=row.children[1];
        update(inner.children[0],item.title);
        update(inner.children[1],[item.timeLabel,item.actor,item.target].filter(Boolean).join(" · "));
        update(inner.children[2],item.detail);
        watch.dataset.combatKey=item.id;
        watch.disabled=!item.canObserve;
        watch.title=item.canObserve?"请求镜头定位":"当前位置不可考";
      });
      while(list.children.length>shown.length)list.lastChild.remove();
      // Frequent snapshot updates must preserve scroll position, never grab focus.
      if(list.scrollTop!==scroll)list.scrollTop=scroll;
    },
    destroy(){
      if(disposed)return;disposed=true;valid.clear();
      frame.removeEventListener("click",onClick);frame.remove();
    },
  };
}

// All demos consume fixture.js and gallery fixture generators, NOT Inkbox runtime.
import { createCreationMenuView } from "../../src/inkbox/ui/g2/creation/creationMenuView.js";
import { mountPortraitGallery } from "./portraitsDemo.js";
import { mountCombatDemo } from "./combatDemo.js";
import { mountBusanziDemo } from "./busanziDemo.js";
import { createRealmEdgePreview } from "../../src/inkbox/ui/g2/realm-edge/realmEdgePreview.js";
import { creationFixture } from "./fixture.js";
const root=document.querySelector("#stage");
const actions=document.querySelector("#extra-actions");
const log=document.querySelector("#log");
const nav=document.querySelector(".g2-workbench__nav");
let mounted=null,mode="";
function note(message){log.textContent=message;}
function request(action){
  const payload=action.type==="import-save"?
    {type:action.type,fileName:action.file?.name??"unnamed"}:action;
  note("收到 UI 请求，未实际执行：\n"+JSON.stringify(payload,null,2));
  if(mode==="creation"){
    if(action.type==="request-random-seed")mounted?.render({...creationFixture,seed:20260914,result:"preview-seed",message:"演示种子由 fixture 返回。"});
    else mounted?.render({...creationFixture,result:"preview-ack",message:"已收到请求（并未操作真实世界）。"});
  }
}
function extra(label,handler){
  const button=document.createElement("button");button.type="button";button.textContent=label;
  button.addEventListener("click",handler);actions.append(button);
}
function switchMode(next){
  if(next===mode)return;
  if(mounted?.destroy)mounted.destroy();
  else if(typeof mounted==="function")mounted();
  mounted=null;root.replaceChildren();actions.replaceChildren();
  mode=next;
  nav.querySelectorAll("button").forEach(b=>b.setAttribute("aria-current",b.dataset.mode===mode?"page":"false"));
  if(next==="creation"){
    mounted=createCreationMenuView(root,{onAction:request});
    mounted.render({...creationFixture,seed:0});
  }else if(next==="portraits"){
    const dispose=mountPortraitGallery(root);
    mounted={destroy:dispose};
    extra("刷新同一批身份（检查稳定性）",()=>{mounted?.destroy();mounted={destroy:mountPortraitGallery(root)};
      note("已用相同 identityKey 重建 64 枚头像。形象由身份键确定，不抽运行时随机流。");});
  }else if(next==="combat"){
    mounted=mountCombatDemo(root,request);
    extra("模拟 60+ 条事件高频刷新",()=>mounted.stress());
    extra("连续刷新 20 次",()=>{for(let i=0;i<20;i++)mounted.stress();note("已触发 20 次 fixture 刷新，事件容量保持 24。");});
  }else if(next==="busanzi"){
    mounted=mountBusanziDemo(root,request);
    extra("切换待命 / 任务预览状态",()=>mounted.cycle());
  }else if(next==="edge"){
    mounted=createRealmEdgePreview(root);
  }
}
nav.addEventListener("click",e=>{
  const button=e.target.closest("button[data-mode]");
  if(button&&nav.contains(button))switchMode(button.dataset.mode);
});
switchMode("creation");

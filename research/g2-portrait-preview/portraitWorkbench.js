import {createLayeredCharacterPortrait} from "../../src/inkbox/ui/g2/portraits/v2/portraitComposer.js";
import {createPortraitGenome,createPortraitStyle,inheritPortraitGenome} from "../../src/inkbox/ui/g2/portraits/v2/portraitGenome.js";
import {createPortraitAssetRegistry} from "../../src/inkbox/ui/g2/portraits/v2/portraitAssetRegistry.js";
import {VARIANTS,GENETIC_SLOTS,STYLE_SLOTS} from "../../src/inkbox/ui/g2/portraits/v2/portraitSchema.js";
const stage=document.querySelector("#output"),tools=document.querySelector("#tools"),inspector=document.querySelector("#inspector");
const nav=document.querySelector(".g2p__tabs");
let currentTab="",handles=[],selected=0,seed=0,pack=createPortraitAssetRegistry(),uploaded=null;
let uploadedSlot="eyes",uploadURL=null,uploadCount=0;
const doc=document;
function elem(tag,cls="",content){
  const e=doc.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;
}
function cleanup(){
  handles.forEach(h=>h.destroy());handles=[];stage.replaceChildren();tools.replaceChildren();
}
function inspect(model){
  const g=model.genome??createPortraitGenome(model.identityKey);
  const s=model.style??createPortraitStyle(model.identityKey);
  const dl=elem("dl");
  for(const k of [...GENETIC_SLOTS,...STYLE_SLOTS]){
    dl.append(elem("dt","",k),elem("dd","",g[k]??s[k]??"无"));
  }
  const extra=elem("p","g2p__muted","遗传只影响先天槽位。服饰、发型、状态均由宿主或独立样式数据决定。");
  inspector.replaceChildren(dl,extra);
}
function button(label,fn){const b=elem("button","",label);b.type="button";b.addEventListener("click",fn);tools.append(b);return b;}
function control(label,options,onChange){
  const field=elem("label");field.append(elem("span","",label));
  const sel=elem("select");
  for(const [value,name] of options){
    const opt=elem("option","",name);opt.value=value;sel.append(opt);
  }
  sel.addEventListener("change",()=>onChange(sel.value));field.append(sel);tools.append(field);return sel;
}
function mountPortrait(holder,model,registry=pack){
  const view=createLayeredCharacterPortrait(holder,{registry});view.render(model);handles.push(view);return view;
}
function card(model,title,subtitle="",registry=pack){
  const el=elem("article","g2p__panel");const holder=elem("div");
  el.append(holder,elem("h3","",title),elem("p","",subtitle));stage.append(el);
  mountPortrait(holder,model,registry);return el;
}
function makePerson(id,extra={}){return {identityKey:"fixture:"+seed+":"+id,status:"alive",...extra};}
function gallery(){
  const text=elem("p","g2p__caption","64 位独立身份。点击任意头像检查所选素材 ID。仅展示占位艺术，不推断真实人物属性。");
  stage.append(text);const grid=elem("div","g2p__grid");stage.append(grid);
  const batch=[];
  for(let i=0;i<64;i++){
    const model=makePerson(i),tile=elem("button","g2p__tile");
    tile.type="button";tile.dataset.selected=String(selected===i);
    const portrait=elem("div"),label=elem("span","","人物 "+String(i+1).padStart(2,"0"));
    tile.append(portrait,label);grid.append(tile);batch.push({tile,model});
    mountPortrait(portrait,model);
    tile.addEventListener("click",()=>{selected=i;for(const x of batch)x.tile.dataset.selected=String(x===batch[i]);inspect(model);});
  }
  inspect(batch[selected].model);
}
function family(){
  stage.append(elem("p","g2p__caption","固定双亲与出生外貌快照；子代分别独立继承。基于亲缘关系的纯函数演示，不修改真实世界。"));
  const grid=elem("div","g2p__family");stage.append(grid);
  const a=createPortraitGenome("family:"+seed+":A"),b=createPortraitGenome("family:"+seed+":B");
  const children=Array.from({length:4},(_,i)=>inheritPortraitGenome({parentA:a,parentB:b,childKey:"family:"+seed+":child:"+i}));
  const grand=inheritPortraitGenome({parentA:children[0],parentB:children[1],childKey:"family:"+seed+":grand"});
  const entries=[["双亲 A",a],["双亲 B",b],...children.map((g,i)=>["子代 "+(i+1),g]),["下一代",grand]];
  for(const [i,[name,genome]] of entries.entries()){
    const model=makePerson("family-"+i,{genome,style:createPortraitStyle("family:"+seed+":"+i)});
    const el=elem("article","g2p__panel");
    el.append(elem("h3","",name));const holder=elem("div");el.append(holder);
    el.append(elem("p","","面容基因来自固定快照"));grid.append(el);
    mountPortrait(holder,model);
    el.addEventListener("click",()=>inspect(model));
  }
  inspect(makePerson("family-0",{genome:a}));
}
function states(){
  stage.append(elem("p","g2p__caption","同一人物不换脸：受伤、年老、幽冥鬼魂、入魔和功法影响由宿主状态驱动，基础基因始终相同。"));
  const grid=elem("div","g2p__states");stage.append(grid);
  const conditions=[
    ["平常",{ageStage:"adult"}],["负伤",{injury:2,scar:true}],
    ["老年",{ageStage:"elder"}],["鬼魂",{ghost:true}],
    ["入魔",{corruption:3}],["火系功法",{technique:"fire"}],
    ["寒性功法",{technique:"frost"}],["多重状态",{ageStage:"elder",injury:2,ghost:true,corruption:2}]
  ];
  for(const [name,portraitState] of conditions){
    const model=makePerson("same-identity",{portraitState});
    const el=elem("article","g2p__panel");el.append(elem("h3","",name));
    const holder=elem("div");el.append(holder);
    el.append(elem("p","",JSON.stringify(portraitState)));grid.append(el);
    mountPortrait(holder,model);el.addEventListener("click",()=>inspect(model));
  }
  inspect(makePerson("same-identity"));
}
function painting(){
  stage.append(elem("p","g2p__caption","左：程序素材。右：选中槽位可临时覆盖本地手绘 PNG，不会上传到仓库或修改存档。"));
  const wrapper=elem("div","g2p__painting");stage.append(wrapper);
  const model=makePerson("painting-example");
  for(const title of ["程序素材","手绘替换预览"]){
    const el=elem("div","g2p__panel");
    el.append(elem("h3","",title));const holder=elem("div");el.append(holder);
    el.append(elem("p","","请上传 512×512 全画布透明 PNG"));wrapper.append(el);
    let registry=pack;
    if(title==="手绘替换预览"&&uploadURL){
      const chosen=(model.genome??createPortraitGenome(model.identityKey))[uploadedSlot] ??
        createPortraitStyle(model.identityKey)[uploadedSlot];
      registry={packId:"preview-"+uploadCount,
        hasArtwork:(slot,variant)=>slot===uploadedSlot&&variant===chosen||pack.hasArtwork(slot,variant),
        get:(slot,variant,recipe,state)=>{
          if(slot===uploadedSlot&&variant===chosen)return {kind:"image",slot,variant,src:uploadURL};
          return pack.get(slot,variant,recipe,state);
        }};
    }
    mountPortrait(holder,model,registry);
  }
  inspect(model);
}
function render(){
  cleanup();
  nav.querySelectorAll("button").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===currentTab?"page":"false"));
  if(currentTab==="gallery")gallery();
  else if(currentTab==="family")family();
  else if(currentTab==="states")states();
  else if(currentTab==="painting")painting();
  if(currentTab!=="painting"){
    button("换一批演示身份",()=>{seed++;selected=0;render();});
  }else{
    control("替换槽位",["eyes","brows","nose","mouth","face","frontHair","backHair","robe","ornament"]
      .map(v=>[v,v]),value=>{uploadedSlot=value;render();}).value=uploadedSlot;
    const field=elem("label");field.append(elem("span","","载入本地透明 PNG"));
    const input=elem("input");input.type="file";input.accept="image/png";field.append(input);tools.append(field);
    input.addEventListener("change",()=>{
      const file=input.files?.[0];if(!file)return;
      if(file.type!=="image/png"||file.size>8*1024*1024){
        inspector.replaceChildren(elem("p","g2p__muted","仅接受不超过 8 MiB 的 PNG。"));return;
      }
      if(uploadURL)URL.revokeObjectURL(uploadURL);
      uploadURL=URL.createObjectURL(file);uploadCount++;render();
    });
    button("移除试装素材",()=>{if(uploadURL)URL.revokeObjectURL(uploadURL);uploadURL=null;uploadCount++;render();});
  }
}
nav.addEventListener("click",e=>{const target=e.target.closest("button[data-tab]");
  if(!target||!nav.contains(target)||target.dataset.tab===currentTab)return;
  currentTab=target.dataset.tab;render();
});
async function initialize(){
  try{
    const response=await fetch("../../assets/portraits/inkbox-face-v1/manifest.json",{cache:"no-store"});
    if(response.ok)pack=createPortraitAssetRegistry({manifest:await response.json(),baseUrl:"../../assets/portraits/inkbox-face-v1/"});
  }catch(_err){ /* Preview keeps fully procedural fallback when pack manifest unavailable. */ }
  currentTab="gallery";render();
}
window.addEventListener("pagehide",()=>{cleanup();if(uploadURL)URL.revokeObjectURL(uploadURL);},{once:true});
initialize();

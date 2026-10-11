import {SLOT_ORDER,PORTRAIT_CANVAS} from "./portraitSchema.js";
import {resolvePortraitRecipe} from "./portraitGenome.js";
import {normalizePortraitState,resolvePortraitEffects} from "./portraitState.js";
import {createPortraitAssetRegistry} from "./portraitAssetRegistry.js";
import {proceduralSlotNodes} from "./proceduralPortraitPack.js";
const SVG="http://www.w3.org/2000/svg";
const emptyRegistry=createPortraitAssetRegistry();
function variantFor(slot,recipe){
  const {genome:g,style:s}=recipe;
  const names={background:s.motif,backHair:s.backHair,robe:s.robe,neck:"base",face:g.face,
    ears:"base",eyes:g.eyes,brows:g.brows,nose:g.nose,mouth:g.mouth,cheeks:"base",
    frontHair:s.frontHair,ornament:s.ornament,frame:"base"};
  return names[slot]??"base";
}
function stateForEffect(effect,state){
  if(effect==="age-lines")return {ageStage:state.ageStage};
  if(effect.startsWith("bruise-")||effect==="bandage")return {injury:state.injury};
  if(effect==="scar")return {scar:true};
  if(effect.startsWith("technique-"))return {technique:state.technique};
  if(effect.startsWith("corruption-"))return {corruption:state.corruption};
  if(effect==="ghost")return {ghost:true};
  return {};
}
export function buildPortraitLayerPlan(model={},registry=emptyRegistry){
  const recipe=resolvePortraitRecipe(model);
  const state=normalizePortraitState(model?.portraitState??model?.state??{});
  const effects=resolvePortraitEffects(state);
  const items=[];
  for(const slot of SLOT_ORDER){
    if(slot==="skinMarks"||slot==="effects"){
      for(const effect of effects){
        const subset=stateForEffect(effect,state);
        const fallback=proceduralSlotNodes(slot,recipe,subset);
        if(!fallback.length && !registry.hasArtwork(slot,effect))continue;
        const resolved=registry.get(slot,effect,recipe,subset);
        items.push(Object.freeze({...resolved,slot,variant:effect,fallback}));
      }
      continue;
    }
    const variant=variantFor(slot,recipe);
    const resolved=registry.get(slot,variant,recipe,state);
    items.push(Object.freeze({...resolved,slot,variant,
      fallback:proceduralSlotNodes(slot,recipe,state)}));
  }
  return Object.freeze({recipe,state,effects,items:Object.freeze(items)});
}
function el(doc,tag,attrs={}){
  const node=doc.createElementNS(SVG,tag);
  for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
  return node;
}
function appendNodes(doc,group,descriptors){
  for(const descriptor of descriptors){
    if(!descriptor||!["path","ellipse","line","rect","circle"].includes(descriptor.tag))continue;
    group.append(el(doc,descriptor.tag,descriptor.attrs));
  }
}
/** SVG nodes in DOM: PNG sprites stay relative to document, not inside data: URLs. */
export function createLayeredCharacterPortrait(root,{registry=emptyRegistry}={}){
  if(!root?.ownerDocument||typeof root.replaceChildren!=="function")throw new TypeError("DOM root required");
  const doc=root.ownerDocument;
  const figure=doc.createElement("figure");figure.className="g2-portrait g2-portrait-v2";
  const svg=el(doc,"svg",{viewBox:PORTRAIT_CANVAS.viewBox,role:"img","aria-label":"人物面相"});
  svg.classList.add("g2-portrait-v2__svg");
  const statusBorder=doc.createElement("span");
  statusBorder.className="g2-portrait__state";statusBorder.setAttribute("aria-hidden","true");
  figure.append(svg,statusBorder);root.replaceChildren(figure);
  let disposed=false,previousKey=null,lastPlan=null;
  function redraw(plan){
    const fragment=doc.createDocumentFragment();
    for(const item of plan.items){
      const group=el(doc,"g",{"data-slot":item.slot,"data-variant":item.variant});
      if(item.kind==="image"){
        const image=el(doc,"image",{x:0,y:0,width:100,height:100,href:item.src,preserveAspectRatio:"none"});
        image.addEventListener("error",()=>{if(disposed||!group.contains(image))return;
          image.remove();appendNodes(doc,group,item.fallback);},{once:true});
        group.append(image);
      }else appendNodes(doc,group,item.nodes);
      fragment.append(group);
    }
    svg.replaceChildren(fragment);
  }
  return {
    render(model={}){
      if(disposed)return;
      const plan=buildPortraitLayerPlan(model,registry);
      const status=["alive","dead","ascended","nether","missing"].includes(model?.status)?model.status:"unknown";
      const key=JSON.stringify([plan.recipe,plan.state,registry.packId]);
      if(key!==previousKey){redraw(plan);previousKey=key;lastPlan=plan;}
      if(figure.dataset.status!==status)figure.dataset.status=status;
      svg.setAttribute("aria-label",typeof model?.alt==="string"&&model.alt.trim()?model.alt:"人物面相");
    },
    getPlan(){return lastPlan;},
    destroy(){if(disposed)return;disposed=true;previousKey=null;lastPlan=null;svg.replaceChildren();figure.remove();}
  };
}

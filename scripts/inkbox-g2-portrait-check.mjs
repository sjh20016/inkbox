import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {PORTRAIT_CANVAS,VARIANTS,SLOT_ORDER,GENETIC_SLOTS} from "../src/inkbox/ui/g2/portraits/v2/portraitSchema.js";
import {createPortraitGenome,createPortraitStyle,inheritPortraitGenome,resolvePortraitRecipe,portraitHash} from "../src/inkbox/ui/g2/portraits/v2/portraitGenome.js";
import {normalizePortraitState,resolvePortraitEffects} from "../src/inkbox/ui/g2/portraits/v2/portraitState.js";
import {proceduralSlotNodes} from "../src/inkbox/ui/g2/portraits/v2/proceduralPortraitPack.js";
import {validatePortraitManifest,createPortraitAssetRegistry} from "../src/inkbox/ui/g2/portraits/v2/portraitAssetRegistry.js";
import {buildPortraitLayerPlan,createLayeredCharacterPortrait} from "../src/inkbox/ui/g2/portraits/v2/portraitComposer.js";
let n=0;function test(value,label){assert.ok(value,label);n++;}
test(PORTRAIT_CANVAS.master===1024&&PORTRAIT_CANVAS.exportSize===512,"drawing size");
test(SLOT_ORDER.indexOf("eyes")<SLOT_ORDER.indexOf("frontHair"),"hair over eyes");
const seen=new Set();
for(let i=0;i<64;i++){
  const identityKey="fixture:portrait:"+i;
  const genome=createPortraitGenome(identityKey);
  test(JSON.stringify(genome)===JSON.stringify(createPortraitGenome(identityKey)),"reproducible person "+i);
  seen.add(JSON.stringify(genome));
}
test(seen.size>=48,"64 identities are distinguishable");
test(portraitHash("seed")===portraitHash("seed"),"stable hash");
const a=createPortraitGenome("world:A"),b=createPortraitGenome("world:B");
const c1=inheritPortraitGenome({parentA:a,parentB:b,childKey:"baby",mutationRate:0});
const c2=inheritPortraitGenome({parentA:a,parentB:b,childKey:"baby",mutationRate:0});
test(JSON.stringify(c1)===JSON.stringify(c2),"stable child");
test(GENETIC_SLOTS.every(k=>c1[k]===a[k]||c1[k]===b[k]),"child inherits one real parent per slot");
test(GENETIC_SLOTS.every(k=>VARIANTS[k].includes(inheritPortraitGenome({parentA:a,childKey:"single"})[k])),"single-parent birth");
test(GENETIC_SLOTS.every(k=>VARIANTS[k].includes(inheritPortraitGenome({childKey:"orphan"})[k])),"no-parent birth");
test(GENETIC_SLOTS.every(k=>VARIANTS[k].includes(inheritPortraitGenome({parentA:a,parentB:b,childKey:"max",mutationRate:1})[k])),"mutation capped");
test(createPortraitGenome("x",{eyes:"not-an-eye"}).eyes!== "not-an-eye","invalid external genome rejected");
const ancient=resolvePortraitRecipe({identityKey:"old",appearance:{eyes:0,hair:0,skinColor:3}});
test(ancient.genome.eyes===VARIANTS.eyes[0]&&ancient.style.frontHair===VARIANTS.frontHair[0],"G2-W numeric compatibility");
test(normalizePortraitState({injury:100,corruption:99}).injury===3,"bounded damage");
test(normalizePortraitState({ghost:"yes"}).ghost===false,"no false state inference");
const multi={ageStage:"elder",injury:3,scar:true,technique:"yin",corruption:2,ghost:true};
const fx=resolvePortraitEffects(multi);
test(fx.length===6&&fx.includes("ghost")&&fx.includes("bandage"),"multi-state effect IDs");
test(!resolvePortraitEffects({}).length,"empty state");
const unmodified=buildPortraitLayerPlan({identityKey:"same"});
const transformed=buildPortraitLayerPlan({identityKey:"same",portraitState:multi});
test(JSON.stringify(unmodified.recipe.genome)===JSON.stringify(transformed.recipe.genome),"transformation preserves genetic face");
test(transformed.items.length<=28,"bounded state layer count");
test(transformed.items.every(x=>SLOT_ORDER.includes(x.slot)),"only contract-defined slots");
for(const slot of ["face","eyes","frontHair","backHair","robe","nose","mouth"])
  test(proceduralSlotNodes(slot,unmodified.recipe,unmodified.state).length>0,"procedural "+slot);
const artist={id:"inkbox-face-v1",schemaVersion:1,slots:{eyes:{"calm-01":"eyes/calm-01.png"},
  frontHair:{"sweep-01":"front-hair/sweep-01.png"},skinMarks:{"scar":"overlays/scar.png"}}};
test(validatePortraitManifest(artist).ok,"valid partial hand drawing pack");
for(const bad of ["../../other.png","https://evil.test/eye.png","/private.png","x.svg","eyes/a.png?b=c"]){
  test(!validatePortraitManifest({schemaVersion:1,slots:{eyes:{"calm-01":bad}}}).ok,"reject unsafe sprite "+bad);
}
test(!validatePortraitManifest({schemaVersion:1,slots:{eyes:{"not-in-contract":"x.png"}}}).ok,"unknown ID blocked");
const pack=createPortraitAssetRegistry({manifest:artist,baseUrl:"../../assets/portraits/inkbox-face-v1/"});
const artModel={identityKey:"artist",genome:{eyes:"calm-01"}};
const plan=buildPortraitLayerPlan(artModel,pack);
test(plan.items.some(x=>x.kind==="image"&&x.slot==="eyes"),"hand-drawn eye overrides placeholder");
test(plan.items.some(x=>x.kind==="procedural"&&x.slot==="face"),"unpainted face remains procedural");
test(plan.items.filter(x=>x.kind==="image").every(x=>x.src.startsWith("../../assets/")),"local only sprite locations");
class StubNode{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.parentNode=null;this.children=[];
    this.listeners=new Map();this.attributes=new Map();this.className="";this.dataset={};
    this.classList={add:(v)=>{this.className+=(this.className?" ":"")+v;}};
  }
  setAttribute(k,v){this.attributes.set(k,String(v));if(k.startsWith("data-"))this.dataset[k.slice(5)]=String(v);}
  getAttribute(k){return this.attributes.get(k);}
  addEventListener(k,fn){const a=this.listeners.get(k)??[];a.push(fn);this.listeners.set(k,a);}
  append(...nodes){for(const node of nodes){
    if(node.isFragment){const list=[...node.children];node.replaceChildren();this.append(...list);continue;}
    if(node.parentNode)node.remove();node.parentNode=this;this.children.push(node);
  }}
  replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode){const c=this.parentNode.children,i=c.indexOf(this);if(i>=0)c.splice(i,1);this.parentNode=null;}}
  contains(n){for(let x=n;x;x=x.parentNode)if(x===this)return true;return false;}
  find(k,v){if(this.getAttribute(k)===v)return this;for(const c of this.children){const hit=c.find(k,v);if(hit)return hit;}return null;}
}
function docRoot(){const doc={
  createElement:t=>new StubNode(doc,t),
  createElementNS:(_ns,t)=>new StubNode(doc,t),
  createDocumentFragment:()=>{const f=new StubNode(doc,"fragment");f.isFragment=true;return f;}
};return doc.createElement("main");}
const root=docRoot();
const portrait=createLayeredCharacterPortrait(root,{registry:pack});
portrait.render(artModel);
const first=root.children[0],svg=first.children[0],eyes=svg.find("data-slot","eyes");
test(svg.children.length===plan.items.length,"finite DOM groups");
test(eyes.children[0].tagName==="image","real SVG image sprite");
portrait.render(artModel);
test(root.children[0]===first&&svg.find("data-slot","eyes")===eyes,"repeat render does not replace DOM");
const img=eyes.children[0];for(const fn of img.listeners.get("error")??[])fn();
test(eyes.children[0]?.tagName!=="image"&&eyes.children.length>1,"404 artwork falls back to procedural eye");
portrait.render({...artModel,portraitState:{ghost:true}});
test(root.children[0]===first,"state changes retain figure");
test(portrait.getPlan().effects.includes("ghost"),"re-render state");
portrait.destroy();test(root.children.length===0,"destroy removes portrait");
portrait.render(artModel);test(root.children.length===0,"render after destroy inert");
const folder=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const page=readFileSync(resolve(folder,"research/g2-portrait-preview/index.html"),"utf8");
for(const mode of ["gallery","family","states","painting"])test(page.includes('data-tab="'+mode+'"'),"preview mode "+mode);
for(const f of ["portraitSchema.js","portraitGenome.js","portraitState.js","proceduralPortraitPack.js","portraitAssetRegistry.js","portraitComposer.js"]){
 const src=readFileSync(resolve(folder,"src/inkbox/ui/g2/portraits/v2",f),"utf8");
 test(!/from\s*["'][^"']*(?:\/sim\/|\/world\/|\/io\/save|\/render3d\/)/.test(src),"renderer isolated from World");
 test(!/Math\.random\s*\(/.test(src),"no procedural simulated RNG");
}
console.log("G2-P PASS "+n+" assertions, DOM stub (real browser still requires manual testing)");

import {SLOT_ORDER,VARIANTS} from "./portraitSchema.js";
import {proceduralSlotNodes} from "./proceduralPortraitPack.js";
const SLOTS=new Set(SLOT_ORDER);
const isPlain=x=>x&&typeof x==="object"&&!Array.isArray(x);
const SAFE_PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[:\\?#])[a-zA-Z0-9_\-./]+\.png$/i;
function validPath(value){return typeof value==="string"&&value.length<=180&&SAFE_PATH.test(value);}
function safeBase(baseUrl){
  // The runtime will resolve URLs against document baseURI; no protocols allowed in the manifest itself.
  if(typeof baseUrl!=="string"||!baseUrl||baseUrl.startsWith("//")||/^https?:/i.test(baseUrl))return "./";
  return baseUrl.endsWith("/")?baseUrl:baseUrl+"/";
}
/** A pack is descriptive data only; never execute code stored in a manifest. */
export function validatePortraitManifest(manifest){
  if(!isPlain(manifest)||manifest.schemaVersion!==1||!isPlain(manifest.slots))return {ok:false,reason:"invalid-schema"};
  for(const [slot,entries] of Object.entries(manifest.slots)){
    if(!SLOTS.has(slot)||!isPlain(entries))return {ok:false,reason:"invalid-slot"};
    for(const [variant,relpath] of Object.entries(entries)){
      // States may be keyed by stable overlay name; other slots only accept declared IDs.
      if(slot!=="skinMarks"&&slot!=="effects"&&slot!=="frame"&&slot!=="background"&&slot!=="cheeks"&&slot!=="neck"&&slot!=="ears"&&!VARIANTS[slot]?.includes(variant)){
        return {ok:false,reason:"unknown-variant"};
      }
      if(!validPath(relpath))return {ok:false,reason:"invalid-path"};
    }
  }
  return {ok:true,reason:null};
}
export function createPortraitAssetRegistry({manifest=null,baseUrl="./"}={}){
  const result=manifest===null?{ok:true}:validatePortraitManifest(manifest);
  if(!result.ok)throw new TypeError("Portrait manifest: "+result.reason);
  const source=manifest?.slots??{};
  // Detached snapshot, prevents caller changing asset IDs under existing portraits.
  const slots=Object.fromEntries(Object.entries(source).map(([k,v])=>[k,Object.freeze({...v})]));
  const base=safeBase(baseUrl);
  return Object.freeze({
    packId:typeof manifest?.id==="string"?manifest.id:"procedural-v1",
    get(slot,variant,recipe,state){
      if(!SLOTS.has(slot))throw new TypeError("Unknown slot "+slot);
      const image=slots[slot]?.[variant];
      if(image)return {kind:"image",src:base+image,slot,variant};
      return {kind:"procedural",slot,variant,nodes:proceduralSlotNodes(slot,recipe,state)};
    },
    hasArtwork(slot,variant){return validPath(slots[slot]?.[variant]);}
  });
}

import {PALETTES,slotIndex} from "./portraitSchema.js";
const N=(tag,attrs)=>({tag,attrs});
const path=(d,fill,stroke="#303637",sw=1.7,extra={})=>N("path",{d,fill,stroke,"stroke-width":sw,"stroke-linejoin":"round","stroke-linecap":"round",...extra});
const ellipse=(cx,cy,rx,ry,fill,stroke="none",sw=1)=>N("ellipse",{cx,cy,rx,ry,fill,stroke,"stroke-width":sw});
const line=(x1,y1,x2,y2,stroke,sw)=>N("line",{x1,y1,x2,y2,stroke,"stroke-width":sw,"stroke-linecap":"round"});
const C=PALETTES;
function at(arr,slot,val){return arr[Math.max(0,slotIndex(slot,val))%arr.length];}
const faces=[
  "M32 34 Q26 48 31 65 Q36 82 50 84 Q64 82 69 65 Q74 48 68 34Z",
  "M31 35 Q24 49 30 65 Q35 78 50 81 Q65 78 70 65 Q76 49 69 35Z",
  "M34 32 Q27 46 31 66 Q36 85 50 88 Q64 85 69 66 Q73 46 66 32Z",
  "M29 33 Q28 50 31 65 L40 81 L50 86 L60 81 L69 65 Q72 50 71 33Z",
  "M32 34 Q27 47 29 61 Q34 79 50 83 Q66 79 71 61 Q73 47 68 34Z"
];
const fore=[
  "M23 48 Q18 17 39 13 Q65 6 77 30 L73 44 Q64 27 52 30 Q45 44 34 44 Q34 32 25 50Z",
  "M25 48 Q17 15 47 12 Q73 9 76 39 Q63 38 53 29 Q40 42 26 49Z",
  "M24 48 Q16 17 45 12 Q78 11 77 48 L69 38 Q58 36 50 39 L31 39Z",
  "M25 42 Q19 15 42 13 Q70 9 76 35 L73 41 Q55 25 37 33Z",
  "M23 46 Q16 17 40 12 Q70 7 78 36 L69 44 L64 29 L52 40 L43 29 L33 44Z",
  "M23 50 Q20 13 48 12 Q72 12 76 40 L64 34 Q55 26 41 29 Q34 52 24 56Z",
  "M23 46 Q19 15 43 13 Q72 12 77 47 L71 41 Q68 30 61 37 L50 47 L43 36 Q33 31 25 50Z",
  "M25 49 Q18 19 39 13 Q62 7 76 28 L73 42 Q61 33 52 31 Q45 39 33 40 L32 49Z"
];
const back=[
 "M26 27 Q21 16 48 12 Q75 12 76 33 L80 84 Q69 91 66 72 L33 72 Q31 95 21 84Z",
 "M27 23 Q39 7 57 12 Q78 15 75 35 L72 75 L64 73 Q76 55 62 26 Q39 20 33 77 L25 73Z",
 "M24 37 Q15 17 37 11 Q59 6 77 25 L77 47 L66 73 L62 35 Q46 27 32 41 L32 73 L20 75Z",
 "M26 37 Q23 15 44 13 Q73 7 77 35 L72 61 Q58 75 50 76 Q41 75 28 62Z",
 "M24 30 Q14 11 34 12 Q49 12 48 27 Q60 11 76 14 Q88 26 77 42 L71 75 L28 76Z",
 "M23 37 Q21 13 46 12 Q76 7 76 31 L80 94 L66 92 L67 35 L32 42 L33 94 L20 90Z"
];
function eyes(style,palette){
  const i=slotIndex("eyes",style),offset=[0,2,-2,1,-1,0,1,0][i];
  const rx=[4.6,5,4.6,4.4,4.1,4.9,4.4,4.8][i];
  const iris=[2.3,2.5,2,2.1,1.9,2.4,2,2.3][i];
  let result=[];
  for(const center of [40,60]){
    result.push(ellipse(center,51+offset*.3,rx,2.8,palette.skin,"#303637",1.1));
    result.push(ellipse(center,51+offset*.3,iris,2.65,palette.iris,"none"));
    result.push(ellipse(center,51+offset*.3,1.02,2.2,"#232c30","none"));
    result.push(ellipse(center-0.65,50.1+offset*.3,.73,.65,"#f9f8f0","none"));
    result.push(path("M"+(center-5)+" "+(50+offset*.3)+" Q"+center+" "+(47+offset)+" "+(center+5)+" "+(50+offset*.3),
      "none","#242e30",2.0));
  }
  return result;
}
/** Pure finite vector descriptors, no text or inline event handlers. */
export function proceduralSlotNodes(slot,recipe,state={}){
  const {genome:g,style:s}=recipe;
  const hair=state.ghost?"#697b80":state.ageStage==="elder"?"#9f9f99":at(C.hair,"hair",g.hair);
  const skin=state.ghost?"#c1d0cd":at(C.skin,"skin",g.skin);
  const robe=at(C.robe,"robe",s.robe);
  const accent=at(C.accent,"accent",s.accent);
  const palette={hair,skin,robe,accent,iris:state.corruption>0?"#974c4b":state.ghost?"#90afb6":"#718e85"};
  switch(slot){
    case "background":{
      const base=[N("rect",{x:0,y:0,width:100,height:100,fill:state.ghost?"#d8e2df":C.paper})];
      const i=slotIndex("motif",s.motif);
      if(i===1)base.push(N("circle",{cx:50,cy:50,r:44,stroke:"#b4b7aa",fill:"none","stroke-width":.8}));
      if(i===2)base.push(path("M6 67 Q22 43 42 60 T96 55","none","#abb9ad",1.5));
      if(i===3)base.push(path("M4 25 H95 M12 85 H89","none","#b9b6a6",.8));
      return base;
    }
    case "backHair":return [path(back[Math.max(0,slotIndex("backHair",s.backHair))],hair,"#303637",2.3)];
    case "robe":{
      const d="M3 100 Q7 82 28 78 L43 78 L50 86 L57 78 L72 78 Q93 81 97 100Z";
      const outer=[path(d,robe,"#333b3b",2.6)];
      const collars=[
        "M34 79 L50 94 L66 78 L60 78 L49 89 L40 79Z",
        "M36 79 L49 91 L65 78 L57 78 L48 86 L41 79Z",
        "M32 81 Q49 79 67 81 L62 87 L49 90 L38 87Z",
        "M33 83 L49 95 L67 81 L59 79 L49 89 L39 80Z",
        "M32 80 L50 98 L67 82 L62 78 L50 91 L39 79Z"
      ];
      outer.push(path(collars[Math.max(0,slotIndex("collar",s.collar))],"#f9f4e7","#48504c",1.7));
      outer.push(line(49,94,55,100,accent,2.4));
      return outer;
    }
    case "neck":return [path("M39 73 L39 86 Q49 94 61 86 L61 73Z",skin,"#343c3a",1.5)];
    case "face":return [path(faces[Math.max(0,slotIndex("face",g.face))],skin,"#31383a",2.4),
      path("M34 62 Q36 72 39 74","none","#b77f76",.65,{opacity:.45})];
    case "ears":return [ellipse(30,54,3.8,6.2,skin,"#3a3e3a",1.3),ellipse(70,54,3.8,6.2,skin,"#3a3e3a",1.3)];
    case "eyes":return eyes(g.eyes,palette);
    case "brows":{
      const k=slotIndex("brows",g.brows),curves=[
        ["M35 44 Q40 43 45 44","M55 44 Q60 43 65 44"],
        ["M35 45 L45 41","M55 41 L65 45"],
        ["M35 44 Q38 40 45 43","M55 43 Q62 40 65 44"],
        ["M35 43 L45 45","M55 45 L65 43"],
        ["M37 44 L44 43","M56 43 L63 44"],
        ["M35 44 Q41 45 45 44","M55 44 Q59 45 65 44"]
      ][Math.max(0,k)];
      return curves.map(d=>path(d,"none","#343536",k===1?2.8:2.25));
    }
    case "nose":{
      const i=slotIndex("nose",g.nose);
      return i===0?[ellipse(50,62,.95,1,"#b88a75")]:
        i===1?[path("M50 58 L49 63","none","#bd8d7e",1.3)]:
        [path("M50 60 Q47 63 50 64","none","#b5867a",1.25)];
    }
    case "mouth":{
      const variants=["M46 70 Q50 70 54 70","M45 69 Q50 74 55 69","M45 70 L55 70","M46 69 Q50 72 54 70","M46 70 Q50 68 54 70"];
      return [path(variants[Math.max(0,slotIndex("mouth",g.mouth))],"none",state.ghost?"#819396":"#9c635d",1.25)];
    }
    case "cheeks":return state.ghost?[]:[ellipse(35,60,4,1.8,"#ce8e82","none"),ellipse(65,60,4,1.8,"#ce8e82","none")].map(n=>({tag:n.tag,attrs:{...n.attrs,opacity:.22}}));
    case "skinMarks":{
      let nodes=[];
      if(state.ageStage==="middle"||state.ageStage==="elder"){
        nodes.push(path("M29 53 L33 55 M67 55 L71 53 M44 70 L42 73 M56 70 L58 73","none","#937f75",.85,{opacity:.5}));
        if(state.ageStage==="elder")nodes.push(path("M37 64 Q39 66 42 64 M58 64 Q61 66 63 64 M37 36 L43 36 M57 36 L63 36","none","#9a8c7c",.8,{opacity:.52}));
      }
      if(state.injury>0){
        nodes.push(path(state.injury>=2?"M56 54 L64 61 L62 64":"M62 56 L66 59","none","#a56863",1.9));
        if(state.injury>=3)nodes.push(path("M54 49 L70 49 L70 59 L54 59Z","#ece6d8","#a9a199",1));
      }
      if(state.scar)nodes.push(path("M32 53 L39 65","none","#a97877",1.1));
      if(state.corruption>0)nodes.push(path("M65 61 Q70 58 70 53 M65 61 L68 65","none","#723c48",1+state.corruption*.3));
      if(state.technique==="fire")nodes.push(path("M32 62 L29 58 L32 57","none","#bc674e",1.2));
      if(state.technique==="frost")nodes.push(path("M33 57 L31 60 L34 60 M66 59 L69 58","none","#819db0",1.2));
      if(state.technique==="wood")nodes.push(path("M33 60 Q29 55 31 54","none","#829b72",1.2));
      if(state.technique==="yin")nodes.push(path("M32 60 L35 65 M65 65 L68 60","none","#677d87",1.3));
      return nodes;
    }
    case "frontHair":return [path(fore[Math.max(0,slotIndex("frontHair",s.frontHair))],hair,"#293031",2.3),
      path("M23 38 Q17 58 27 77 L33 76 Q25 56 32 42Z",hair,"#293031",1.5),
      path("M76 39 Q83 57 73 79 L67 75 Q74 53 68 39Z",hair,"#293031",1.5)];
    case "ornament":{
      const i=slotIndex("ornament",s.ornament);
      if(i<=0)return [];
      if(i===1)return [line(67,22,83,18,"#7b6e58",2.8)];
      if(i===2)return [path("M31 25 Q24 20 21 26 Q23 33 31 28Z",accent,"#3a3b39",1.1)];
      if(i===3)return [ellipse(75,35,3.2,3.2,"#d4b77d","#3a3c38",1)];
      return [path("M24 30 Q50 37 76 28","none",accent,1.6)];
    }
    case "effects":{
      const nodes=[];
      if(state.ghost){
        nodes.push(path("M16 86 Q4 71 14 55 M84 85 Q97 70 87 55","none","#759398",1.5,{opacity:.7}));
      }
      if(state.corruption>=2)nodes.push(path("M20 88 Q18 76 25 68 M79 85 Q84 72 76 64","none","#853d49",1.25));
      if(state.technique==="fire")nodes.push(path("M13 91 Q7 85 14 79 M86 91 Q94 85 86 79","none","#c48257",1.1));
      return nodes;
    }
    case "frame":return [
      N("rect",{x:2,y:2,width:96,height:96,fill:"none",stroke:state.ghost?"#729095":state.corruption>=2?"#7d4144":"#b6b4a6","stroke-width":state.ghost?1.4:.8,opacity:.7})
    ];
    default:return [];
  }
}
export const PROCEDURAL_ASSET_PACK=Object.freeze({id:"procedural-v1",schemaVersion:1});

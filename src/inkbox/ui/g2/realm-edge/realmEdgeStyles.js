// G2-W pure world-space style recipe; caller owns projection, clipping and depth.
export const EDGE_PALETTES=Object.freeze({
  mortalUpper:Object.freeze({paper:"#eeeae1",far:"#c2c8b7",near:"#d8d3c3",
    ink:"#353b3a",gold:"#998454"}),
  mortalNether:Object.freeze({paper:"#e8e4dd",far:"#737d7c",near:"#aeb0a2",
    ink:"#222a2a",gold:"#8b7150"}),
});
export const EDGE_SPECS=Object.freeze({
  view:Object.freeze({inkWidth:3.2,ghostWidth:8.0,ghostOpacity:.16,goldOpacity:0,
    jitterWorldUnits:1.25,fadeWorldUnits:5}),
  rift:Object.freeze({inkWidth:3.8,ghostWidth:9.0,ghostOpacity:.28,
    goldWidth:1.2,goldOpacity:.72,jitterWorldUnits:1.7,fadeWorldUnits:7}),
});
function hash(v){let h=2166136261;for(const c of String(v)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function wobble(x,y,seed){return hash(seed+":"+Math.floor(x*2)+":"+Math.floor(y*2))/4294967295-.5;}
/**
 * World-space points are returned as one path, not viewport-fixed CSS.
 * A host must clip mask and reproject each point using the current camera.
 */
export function buildRealmEdgeGeometry(points,{kind="view",seed=0,spacing=7}={}){
  if(!Array.isArray(points)||points.length<2)return [];
  const spec=EDGE_SPECS[kind]||EDGE_SPECS.view;
  const stride=Math.min(32,Math.max(2,Number.isFinite(spacing)?spacing:7));
  const nodes=[];
  for(let i=0;i<points.length-1&&nodes.length<900;i++){
    const a=points[i],b=points[i+1];
    if(!a||!b||![a.x,a.y,b.x,b.y].every(n=>typeof n==="number"&&Number.isFinite(n)))continue;
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length<=0||length>1e6)continue;
    const steps=Math.min(96,Math.max(1,Math.ceil(length/stride)));
    for(let j=0;j<steps&&nodes.length<900;j++){
      const t=j/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      const shift=wobble(x,y,seed)*spec.jitterWorldUnits;
      nodes.push({x:x-(b.y-a.y)/length*shift,y:y+(b.x-a.x)/length*shift});
    }
  }
  const last=points[points.length-1];
  if(last&&Number.isFinite(last.x)&&Number.isFinite(last.y)&&nodes.length<900)nodes.push({x:last.x,y:last.y});
  return nodes;
}
export function geometryToSvgPath(nodes,project=(point)=>point){
  if(!Array.isArray(nodes))return "";
  return nodes.map((p,i)=>{
    const pos=project(p);
    if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))return "";
    return (i===0?"M":"L")+pos.x.toFixed(2)+" "+pos.y.toFixed(2);
  }).filter(Boolean).join(" ");
}

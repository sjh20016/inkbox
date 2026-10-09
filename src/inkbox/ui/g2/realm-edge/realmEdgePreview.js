import { EDGE_PALETTES,EDGE_SPECS,buildRealmEdgeGeometry,geometryToSvgPath } from "./realmEdgeStyles.js";
const SVG_NS="http://www.w3.org/2000/svg";
function html(d,tag,cls,text){const e=d.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function svg(d,tag,attrs={}){const e=d.createElementNS(SVG_NS,tag);for(const [key,val] of Object.entries(attrs))e.setAttribute(key,String(val));return e;}
/** Standalone SVG experiment. No Renderer, World, or DOM overlays for runtime. */
export function createRealmEdgePreview(root){
  if(!root?.ownerDocument||typeof root.replaceChildren!=="function")throw new TypeError("DOM root required");
  const doc=root.ownerDocument,frame=html(doc,"section","g2-edge");
  frame.append(html(doc,"p","g2-edge__caption","视界边缘 · 纸墨与暗金（离屏 SVG 算法实验）"));
  const tools=html(doc,"div","g2-edge__tools");
  const select=html(doc,"select");select.setAttribute("aria-label","观察尺度");
  [0.75,1,1.5,2].forEach(v=>{const o=html(doc,"option","",v+" 倍观察");o.value=String(v);select.append(o);});
  select.value="1";tools.append(html(doc,"span","","缩放尺度"),select);
  const pairs=[
    ["mortalUpper","view","凡间 / 上界 · 普通视界"],["mortalUpper","rift","凡间 / 上界 · 真实裂隙"],
    ["mortalNether","view","凡间 / 幽冥 · 普通视界"],["mortalNether","rift","凡间 / 幽冥 · 真实裂隙"],
  ];
  const grid=html(doc,"div","g2-edge__grid");
  const records=pairs.map(([palette,kind,label],index)=>{
    const card=html(doc,"article","g2-edge__card");
    card.append(html(doc,"h3","",label));
    const drawing=svg(doc,"svg",{viewBox:"0 0 360 165",role:"img","aria-label":label});
    card.append(drawing);grid.append(card);
    return {drawing,palette,kind,index};
  });
  const note=html(doc,"p","g2-edge__caption","重算节点以世界格为基准，缩放只改变投影比例。正式几何裁剪与遮挡应由 Renderer 负责。");
  frame.append(tools,grid,note);root.replaceChildren(frame);
  let disposed=false;
  function draw(scale){
    records.forEach(({drawing,palette,kind,index})=>{
      const colors=EDGE_PALETTES[palette],spec=EDGE_SPECS[kind];
      drawing.replaceChildren();
      const backdrop=svg(doc,"rect",{width:360,height:165,fill:colors.paper});
      drawing.append(backdrop);
      const terrain=svg(doc,"path",{d:"M0 145 L20 126 L47 131 L77 90 L108 104 L142 66 L166 85 L201 53 L224 84 L260 61 L299 102 L331 94 L360 123 L360 165 L0 165Z",
        fill:colors.near,stroke:colors.ink,"stroke-width":1.25});
      const skyline=svg(doc,"path",{d:"M0 65 Q64 21 100 57 T207 45 T360 63 V0 H0Z",fill:colors.far,opacity:.8});
      drawing.append(skyline,terrain);
      const worldPoints=[{x:0,y:64},{x:42,y:60},{x:92,y:76},{x:138,y:69},{x:183,y:82},
        {x:225,y:72},{x:282,y:74},{x:337,y:61},{x:360,y:60}];
      const world=buildRealmEdgeGeometry(worldPoints,{seed:31+index,kind});
      const project=p=>({x:180+(p.x-180)*scale,y:77+(p.y-77)*scale});
      const d=geometryToSvgPath(world,project);
      drawing.append(svg(doc,"path",{d,fill:"none",stroke:colors.ink,"stroke-width":spec.ghostWidth,opacity:spec.ghostOpacity,
        "stroke-linejoin":"round","stroke-linecap":"round"}));
      drawing.append(svg(doc,"path",{d,fill:"none",stroke:colors.ink,"stroke-width":spec.inkWidth,
        "stroke-linejoin":"round","stroke-dasharray":kind==="view"?"22 3 7 2":"30 2 6 1"}));
      if(kind==="rift"){
        drawing.append(svg(doc,"path",{d,fill:"none",stroke:colors.gold,"stroke-width":spec.goldWidth,
          opacity:spec.goldOpacity,"stroke-dasharray":"24 5 8 4"}));
      }
      // Noninteractive ground texture, all coordinates local to this preview SVG.
      for(let x=11;x<359;x+=27){
        const y=129+(x*7%13);
        drawing.append(svg(doc,"path",{d:"M"+x+" "+y+" l8 -4",stroke:colors.ink,"stroke-width":.6,opacity:.22}));
      }
    });
  }
  function onChange(){if(!disposed)draw(Number(select.value)||1);}
  select.addEventListener("change",onChange);draw(1);
  return {render(options={}){
    if(disposed)return;
    if([0.75,1,1.5,2].includes(options.scale))select.value=String(options.scale);
    draw(Number(select.value)||1);
  },destroy(){
    if(disposed)return;disposed=true;select.removeEventListener("change",onChange);frame.remove();
  }};
}

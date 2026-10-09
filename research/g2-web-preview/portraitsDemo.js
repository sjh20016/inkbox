import { createCharacterPortrait } from "../../src/inkbox/ui/g2/portraits/characterPortrait.js";
/** Disposable fixture gallery, 64 identities. The samples imply no World attributes. */
export function mountPortraitGallery(root) {
  const doc=root.ownerDocument;
  const wrapper=doc.createElement("section");wrapper.className="g2-demo-portraits";
  const head=doc.createElement("p");head.textContent="64 枚不同人物身份 · 纯前端外貌实验，不代表模拟真实性别、宗门或道途。";
  const grid=doc.createElement("div");grid.className="g2-demo-portraits__grid";
  const handles=[];
  for(let i=0;i<64;i++){
    const tile=doc.createElement("article");tile.className="g2-demo-portraits__tile";
    const holder=doc.createElement("div");holder.className="g2-demo-portraits__portrait";
    const label=doc.createElement("small");label.textContent="命簿 "+String(i+1).padStart(2,"0");
    tile.append(holder,label);grid.append(tile);
    const view=createCharacterPortrait(holder);
    const data={identityKey:"fixture:portrait:"+i,status:i%17===0?"ascended":i%13===0?"dead":"alive"};
    view.render(data);view.render(data);
    handles.push(view);
  }
  wrapper.append(head,grid);root.replaceChildren(wrapper);
  return ()=>{handles.forEach(x=>x.destroy());wrapper.remove();};
}

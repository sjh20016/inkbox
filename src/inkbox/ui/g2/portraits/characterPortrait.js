import { portraitSvg, generatePortraitParts } from "./portraitGenerator.js";
/** One stable image node, no timers, World access, or remote resources. */
export function createCharacterPortrait(root) {
  if (!root?.ownerDocument || typeof root.replaceChildren!=="function") throw new TypeError("DOM root required");
  const doc=root.ownerDocument;
  const figure=doc.createElement("figure"); figure.className="g2-portrait";
  const image=doc.createElement("img"); image.className="g2-portrait__image";
  image.alt="程序化人物面相"; image.decoding="async"; image.draggable=false;
  const state=doc.createElement("span"); state.className="g2-portrait__state";state.setAttribute("aria-hidden","true");
  figure.append(image,state); root.replaceChildren(figure);
  let lastKey=null, disposed=false;
  return {
    render(model={}) {
      if(disposed)return;
      const parts=generatePortraitParts(model);
      const key=JSON.stringify(parts);
      if(key!==lastKey) {
        // SVG is constructed exclusively from trusted closed palettes.
        image.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(portraitSvg(model));
        lastKey=key;
      }
      const status=["alive","dead","ascended","nether","missing"].includes(model?.status)?model.status:"unknown";
      if(figure.dataset.status!==status) figure.dataset.status=status;
      image.alt=model?.alt && typeof model.alt==="string" ? model.alt : "人物面相";
    },
    destroy() {if(disposed)return;disposed=true;image.removeAttribute("src");figure.remove();lastKey=null;},
  };
}

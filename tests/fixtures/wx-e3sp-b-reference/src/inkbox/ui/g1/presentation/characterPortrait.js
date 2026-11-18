import { generatePortraitParts, portraitSvg } from "./portraitGenerator.js";

const STATES = new Set(["alive", "dead", "ascended", "nether", "missing"]);

/** A stable decorative portrait node owned by its character card. */
export function createCharacterPortrait(root) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== "function") {
    throw new TypeError("createCharacterPortrait requires a DOM root");
  }
  const doc = root.ownerDocument;
  const figure = doc.createElement("figure");
  figure.className = "g1-character__portrait";
  const image = doc.createElement("img");
  image.className = "g1-character__portrait-image";
  image.alt = "人物面相未载";
  image.decoding = "async";
  image.draggable = false;
  const frame = doc.createElement("span");
  frame.className = "g1-character__portrait-frame";
  frame.setAttribute("aria-hidden", "true");
  figure.append(image, frame);
  root.replaceChildren(figure);

  let lastSignature = null;
  let disposed = false;
  function clear() {
    image.removeAttribute("src");
    image.alt = "人物面相未载";
    figure.dataset.status = "unknown";
    lastSignature = null;
  }
  return {
    render(identity, name, appearance) {
      if (disposed) return;
      const key = typeof identity?.key === "string" && identity.key.length ? identity.key : null;
      if (!key) {
        clear();
        return;
      }
      const options = { identityKey: key, appearance };
      const parts = generatePortraitParts(options);
      const signature = JSON.stringify(parts);
      if (signature !== lastSignature) {
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(portraitSvg(options));
        lastSignature = signature;
      }
      const status = STATES.has(identity.status) ? identity.status : "unknown";
      if (figure.dataset.status !== status) figure.dataset.status = status;
      image.alt = typeof name === "string" && name ? name + " · 人物面相" : "人物面相";
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      clear();
      figure.remove();
    },
  };
}

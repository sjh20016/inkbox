// UI-only priority shared by camera and drawer keyboard handlers. No World state.
export function blockingInputLayer(doc = globalThis.document) {
  if (!doc) return null;
  const creation = doc.getElementById?.('inkCreationMenu');
  if (creation && !creation.hidden && creation.classList?.contains('on')) return creation;
  const viewer = doc.querySelector?.('.busanzi-viewer');
  if (viewer) return viewer;
  const help = doc.getElementById?.('inkHelp');
  if (help?.classList?.contains('on')) return help;
  const character = doc.getElementById?.('inkPersonDetail');
  if (character?.classList?.contains('on') && character.getAttribute?.('aria-modal') === 'true') return character;
  return null;
}

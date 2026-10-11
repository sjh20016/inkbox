/** Minimal presentation adapter; it consumes only G1's public identity snapshot. */
export function characterPortraitInput(worldSeed, identity) {
  if (!identity || typeof identity.key !== 'string' || !identity.key.trim()) return null;
  const seed = Number.isSafeInteger(worldSeed) ? String(worldSeed >>> 0) : 'unknown';
  const identityKey = `g1:${seed}:${identity.key}`;
  return Object.freeze({
    identityKey,
    status: typeof identity.status === 'string' ? identity.status : 'unknown',
    alt: `${typeof identity.name === 'string' && identity.name ? identity.name : '无名之人'}的人物面相`,
  });
}

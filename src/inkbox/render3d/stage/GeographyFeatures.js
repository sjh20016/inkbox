/** Presentation switches only. They never belong to World, save or simulation. */
export const GEOGRAPHY_FEATURES = Object.freeze(['sites', 'leylines', 'upperQi', 'netherYin', 'rifts', 'riftFx']);

export function geographyFeatures(value = false) {
  const result = {};
  for (const key of GEOGRAPHY_FEATURES) result[key] = typeof value === 'object' && value !== null ? !!value[key] : value === true;
  return Object.freeze(result);
}

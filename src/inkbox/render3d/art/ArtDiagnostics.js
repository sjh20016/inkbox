// Local development tools only. These values never enter World or save data.
export const ART_DEBUG_VIEWS = Object.freeze(['base', 'coast', 'mass', 'structure', 'atmosphere', 'final']);
export const ART_DEBUG_MODES = Object.freeze({ final: 0, base: 1, coast: 2, mass: 3, structure: 4, atmosphere: 5 });

export function isArtDevelopmentLocation(location = globalThis.location) {
  return !!location && (location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname));
}

export function artDebugOptions(location = globalThis.location) {
  const development = isArtDevelopmentLocation(location);
  const params = new URLSearchParams(location?.search || '');
  const requested = params.get('artDebug');
  const debugView = development && ART_DEBUG_VIEWS.includes(requested) ? requested : 'final';
  return { development, debugView, panel: development && (params.get('artdebug') === '1' || !!requested) };
}

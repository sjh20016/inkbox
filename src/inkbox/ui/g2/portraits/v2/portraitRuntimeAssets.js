import {createPortraitAssetRegistry} from './portraitAssetRegistry.js';

const MANIFEST_URL = './assets/portraits/inkbox-face-v1/manifest.json';
const ASSET_BASE_URL = './assets/portraits/inkbox-face-v1/';
let registryPromise = null;

/**
 * Load the local hand-drawn pack once. Missing or invalid optional artwork leaves the
 * deterministic procedural renderer available, so portraits never block the game boot.
 */
export function getPortraitRegistry({fetcher = globalThis.fetch} = {}) {
  if (registryPromise) return registryPromise;
  registryPromise = (async () => {
    try {
      if (typeof fetcher !== 'function') return createPortraitAssetRegistry();
      const response = await fetcher(MANIFEST_URL, {cache: 'no-store'});
      if (!response?.ok) return createPortraitAssetRegistry();
      const manifest = await response.json();
      return createPortraitAssetRegistry({manifest, baseUrl: ASSET_BASE_URL});
    } catch {
      return createPortraitAssetRegistry();
    }
  })();
  return registryPromise;
}

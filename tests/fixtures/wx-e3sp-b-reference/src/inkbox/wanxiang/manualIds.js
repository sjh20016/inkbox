import { MANUALS, FORBIDDEN_TECHNIQUES, NETHER_TECHNIQUES } from '../core/lore.js';
// Persisted encoding is deliberately unchanged.
export const techniqueId = t => `manual:${Array.from(typeof t === 'string' ? t : t.name).map(c => c.codePointAt(0).toString(16)).join('-')}`;
export const MANUAL_INDEX = new Map([...MANUALS,...FORBIDDEN_TECHNIQUES,...NETHER_TECHNIQUES].map(t=>[techniqueId(t),t]));

import { readObjectStories, resolveStoryRef } from '../wanxiang/storyReading.js';
import { settlementRuinMarkerId } from '../world/settlementIdentity.js';
import { renderStoryCards } from './storyCardsView.js';
import { storyRefKey } from '../wanxiang/storyFacts.js';

// One displayed object per inspector. HUD rebuilds can reattach this snapshot,
// without querying facts again or growing a history of previously opened cards.
const objectReaders = new WeakMap();

/** Uses existing inspectors. Every click rechecks identity and map access. */
export function navigateStoryRef(sb, ref) {
  const resolved = resolveStoryRef(sb.world,ref);
  if (!resolved.available) { sb.notify?.(resolved.reason || '原对象已不可追',2400); return {ok:false,reason:resolved.reason}; }
  if (ref.kind === 'person') {
    const current = resolved.currentRef || ref;
    return sb.g1.open(`${current.plane}:${current.id}`,{focus:true});
  }
  if (ref.kind === 'faction') {
    if (sb.render3d?.active) sb.render3d.renderer.focusOn(resolved.x,resolved.y,{duration:.75},ref.plane);
    else sb.camera?.focusOn(resolved.x,resolved.y,{zoom:Math.max(sb.camera.zoom,7),duration:.75});
    sb.focusedSectId=ref.id; sb.dirty=true; return {ok:true};
  }
  // A carried original is inspected through its actual holder's inventory.
  if (ref.kind === 'artifact' && resolved.currentRef) {
    const current = resolved.currentRef;
    return sb.g1.open(`${current.plane}:${current.id}`,{focus:true});
  }
  const pick = ref.kind === 'artifact' ? {kind:'artifact',artifactId:ref.id}
    : ref.kind === 'settlement' ? {kind:'settlement',settlementId:ref.id}
    : ref.kind === 'settlement-ruin' ? {kind:'site',siteId:settlementRuinMarkerId(ref.id)}
    : {kind:'site',siteId:ref.id};
  return {ok:!!sb.inspectPlaneSubject(ref.plane,pick)};
}

/** Installation is cheap; compiling facts occurs only inside the click handler. */
export function appendObjectStoryReader(sb, panel, ref) {
  if (!ref || !['artifact','site','settlement','settlement-ruin'].includes(ref.kind)) return;
  const world = sb.world, doc=panel.ownerDocument;
  const key=storyRefKey(ref),previous=objectReaders.get(panel);
  if (previous?.world === world && previous.key === key) { panel.append(previous.section); return; }
  const section=doc.createElement('section');section.className='ink-object-stories';
  const read=doc.createElement('button');read.type='button';read.className='inspect-link';read.textContent='因果拾章 · 旧闻';
  const content=doc.createElement('div');
  read.addEventListener('click',() => {
    if (sb.world !== world || !section.isConnected) return;
    const projection=readObjectStories(world,ref);
    renderStoryCards(content,projection,{onNavigate:target => {
      if (sb.world !== world || !section.isConnected) return {ok:false,reason:'世界或检视已切换'};
      return navigateStoryRef(sb,target);
    }});
  });
  section.append(read,content);panel.append(section);
  objectReaders.set(panel,{world,key,section});
}

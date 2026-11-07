const STATUS = {watching:'尚待后续',resolved:'已有回响',interrupted:'已中止',unresolved:'后续未可考'};
const SOURCE = {'committed-fact':'正式事实','profile-history':'人物经历','experience-ledger':'正式经历账本','wanxiang-history':'命途正式经历','artifact-history':'原物履历','settlement-history':'地方沿革','current-artifact':'原物当前实况'};
const TYPE = {'site-failure':'探府失利','site-success':'探府有得','paid-reciprocity':'真实付费回助',healed:'正式治疗',disaster:'遭灾',aid:'获援',abandoned:'荒废',recovered:'恢复',forged:'炼成',gained:'所得',found:'拾得',inherited:'传承',lost:'遗落','current-location':'当前去向'};
const date = value => Number.isFinite(value) ? `第 ${Math.floor(value)} 日` : '日期未载';

/** A bounded, text-only reader shared by both renderers. Never reads a World. */
export function renderStoryCards(root, projection = {}, {onNavigate} = {}) {
  const doc = root.ownerDocument;
  const el = (tag, text, cls) => {const node=doc.createElement(tag);if(text!=null)node.textContent=String(text);if(cls)node.className=cls;return node;};
  const section=el('section',null,'ink-story-reader');section.setAttribute('aria-label','因果拾章');
  section.append(el('h3','命途摘录'),el('p',`取证于${date(projection.day)} · 阅读与关注不改变世界`,'ink-story-reader__coverage'));
  const cards=Array.isArray(projection.cards)?projection.cards:[];
  if(!cards.length)section.append(el('p','尚无足够来源可编为拾章；不推断未记载的经历。'));
  for(const card of cards.slice(0,3)){
    const article=el('article',null,'ink-story-card');article.dataset.storyKey=card.key||'';
    article.append(el('h4',card.title||'因果拾章'),el('small',`${STATUS[card.status]||'状态未可考'} · ${card.mode==='watch_hook'?'观察钩子':'历史摘录'} · ${date(card.originDay)} — ${date(card.lastEvidenceDay)}`));
    if(card.summary)article.append(el('p',card.summary));
    const timeline=el('ol');
    for(const node of (card.nodes||[]).slice(0,12)){const row=el('li',`${date(node.day)} · ${node.text||'记录未载'}`);if(node.evidenceKey)row.dataset.evidenceKey=node.evidenceKey;timeline.append(row);}
    if(timeline.children.length)article.append(timeline);
    if(card.reason)article.append(el('p',card.reason,'ink-story-card__reason'));
    const links=el('div',null,'ink-story-card__links');
    for(const ref of (card.related||[]).slice(0,12)){
      const button=el('button',ref.label||`${ref.kind} #${ref.id}`);button.type='button';
      button.disabled=ref.available!==true||typeof onNavigate!=='function';
      if(ref.reason)button.title=ref.reason;
      button.addEventListener('click',()=>onNavigate?.(ref));links.append(button);
      if(ref.available===false&&ref.reason)links.append(el('small',ref.reason));
    }
    article.append(links);
    const details=el('details');details.append(el('summary','核对事实来源'));
    for(const evidence of (card.evidence||[]).slice(0,16)){
      const row=el('p',`${evidence.grade||'未评级'} · ${SOURCE[evidence.source]||evidence.source||'来源未载'} · ${date(evidence.day)} · ${TYPE[evidence.type]||evidence.type||''}`);
      row.append(el('code',evidence.key||'来源键未载'));if(evidence.text)row.append(el('span',evidence.text));details.append(row);
    }
    article.append(details);section.append(article);
  }
  if(projection.coverage)section.append(el('p',projection.coverage,'ink-story-reader__coverage'));
  root.replaceChildren(section);
  return {destroy(){section.remove();}};
}

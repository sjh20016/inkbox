import { WANLING_CATALOG, WANLING_BY_KEY } from '../core/wanlingCatalog.js';
import { liveWanling, wanlingById, WANLING_LIMITS } from '../world/wanlingState.js';
import { daoActivityFor } from '../sim/daoActivities.js';
import { DAO_BY_KEY } from '../core/cultivation.js';
import { wanlingInspectCard, wanlingStateLabel } from './wanlingFacts.js';

// A compact shelf disclosure. Selecting/previewing never writes the World.
export function createWanlingPanel(sandbox,actions,doc=document) {
  const root=doc.getElementById('inkWanling'); if(!root)return null;
  const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
  const details=make('details','wanling-details'),summary=make('summary','','万灵 · 山海图录');
  const body=make('div','wanling-body'),select=make('select');select.id='inkWanlingForm';select.setAttribute('aria-label','选择生灵');
  for(const c of WANLING_CATALOG){const o=make('option','',`${c.name}${c.derived?' · 关系派生':''}`);o.value=c.key;select.append(o);}
  const description=make('p','wanling-note'),buttons=make('div','wanling-actions');
  const place=make('button','','投放到地图'),preview=make('button','','看模型');place.type=preview.type='button';place.id='inkWanlingPlace';preview.id='inkWanlingPreview';
  const status=make('p','wanling-status');status.setAttribute('role','status');
  const list=make('div','wanling-list'),card=make('div','wanling-card'),paths=make('details','wanling-paths'),pathTitle=make('summary','','修士行道'),pathList=make('div');
  paths.append(pathTitle,pathList);buttons.append(place,preview);body.append(select,description,buttons,status,card,list,paths);details.append(summary,body);root.replaceChildren(details);
  let attached=null,selectedId=null,last=-Infinity,previewStop=null,previewToken=0,signature='';
  function choice(){const c=WANLING_BY_KEY.get(select.value);description.textContent=`${c.role}。${c.counter}。${c.model?'复用山海模型。':'程序化代表影。'}`;place.disabled=!!c.derived;preview.disabled=!c.model;}
  select.addEventListener('change',choice);choice();
  place.addEventListener('click',()=>{
    const c=WANLING_BY_KEY.get(select.value);if(c.derived)return;
    sandbox.wanlingForm=c.key;sandbox.selectTool('beast');
    sandbox.render3d?.setTool?.('beast');
    status.textContent=`已选${c.name} · 合上符匣后单击凡界合法栖地；每次投放一个真实单位。`;
    place.blur();
  });
  function inspect(id) {
    const u=wanlingById(sandbox.world,id);if(!u){card.replaceChildren();return;}
    selectedId=id;details.open=true;card.replaceChildren();
    const info=wanlingInspectCard(sandbox.world,u);card.append(make('h4','',info.head));
    for(const [key,value]of info.rows){const row=make('p');row.append(make('span','',`${key}：`),doc.createTextNode(value));card.append(row);}
    const remove=make('button','','收回此生灵');remove.type='button';remove.dataset.wanlingRemove=String(id);
    remove.addEventListener('click',()=>{actions.remove(id);selectedId=null;card.replaceChildren();refresh(true);});card.append(remove);
  }
  function focus(u){sandbox.camera.focusOn(u.x,u.y,{zoom:Math.max(sandbox.camera.zoom,7),duration:.6});
    if(sandbox.render3d?.active){const camera=sandbox.render3d.renderer.cameraRig.camera;camera.zoom=Math.max(camera.zoom,3.2);camera.updateProjectionMatrix();}
    inspect(u.id);}
  function refresh(force=false) {
    const now=globalThis.performance?.now?.()??Date.now(),w=sandbox.world;if(!w)return;
    if(!force&&w===attached&&now-last<1200)return;last=now;
    if(attached!==w){attached=w;selectedId=null;signature='';card.replaceChildren();}
    const units=liveWanling(w);summary.textContent=`万灵 · 山海图录 (${units.length}/${WANLING_LIMITS.units})`;
    if(!details.open&&!force)return;
    const nextSignature=JSON.stringify([w.day,units.map(u=>[u.id,u.hp,u.count,u.state,u.reason,u.bondedBy,u.mask]),w.wanling?.jobs,w.wanling?.events]);
    if(!force&&nextSignature===signature)return;
    if(!force&&root.contains(doc.activeElement)&&doc.activeElement.tagName==='BUTTON')return;
    signature=nextSignature;
    list.replaceChildren();
    for(const u of units.slice(0,32)){
      const b=make('button','wanling-unit',`${WANLING_BY_KEY.get(u.form)?.name||u.form} #${-u.id} · ${u.count} · ${wanlingStateLabel(u)}`);b.type='button';b.dataset.wanlingId=u.id;b.addEventListener('click',()=>focus(u));list.append(b);
    }
    if(units.length>32)list.append(make('p','wanling-note',`另有${units.length-32}个单位，可直接在地图上检视。`));
    if(!units.length)list.append(make('p','wanling-note','尚未遇见生灵。天道可直接投放，不受收集进度限制。'));
    if(selectedId!=null)inspect(selectedId);
    pathList.replaceChildren();
    const actors=(w.entities||[]).filter(e=>e.dao?.path?.key&&e.hp>0);
    for(const e of actors.slice(0,24)){
      const job=daoActivityFor(w,e.id),name=DAO_BY_KEY[e.dao.path.key]?.name||e.dao.path.name;
      const b=make('button','wanling-unit',`${e.name} · ${name} · ${job?.summary||'暂无合适目标'}`);b.type='button';b.dataset.daoActor=e.id;
      b.addEventListener('click',()=>{sandbox.camera.focusOn(e.x,e.y,{zoom:8,duration:.6});sandbox.g1.open({plane:'mortal',entityId:e.id});});pathList.append(b);
    }
    const events=w.wanling?.events||[];
    if(events.length){const log=make('details','wanling-events'),s=make('summary','','最近见闻');log.append(s);
      for(const e of events.slice(-6).reverse())log.append(make('p','wanling-note',`第${Math.floor(e.day)}日 · ${e.text}`));list.append(log);}
  }
  details.addEventListener('toggle',()=>{if(details.open)refresh(true);});
  preview.addEventListener('click',async()=>{
    const info=WANLING_BY_KEY.get(select.value);if(!info.model)return;
    const token=++previewToken;previewStop?.();
    const modal=make('dialog','wanling-preview'),title=make('h3','',`${info.name} · 模型预览`),close=make('button','','合卷'),holder=make('div','wanling-model');close.type='button';
    modal.append(title,holder,make('p','wanling-note',info.derived?'仅展示模型；世界里的比翼来自真实道侣，不可独立投放。':'模型预览不改变世界；当前行为请在地图中检视。'),close);doc.body.append(modal);modal.showModal();
    let stop=()=>{};previewStop=()=>{stop();modal.close();modal.remove();};
    close.addEventListener('click',()=>{++previewToken;previewStop?.();previewStop=null;});modal.addEventListener('cancel',e=>{e.preventDefault();close.click();});
    try{const m=await import('./wanlingPreview.js');const dispose=await m.showWanlingPreview(holder,info.model);
      if(token!==previewToken){dispose();return;}stop=dispose;
    }catch{holder.textContent='模型暂未载入；仍可在地图投放并检视真实状态。';}
  });
  refresh(true);return{refresh,inspect,dispose(){++previewToken;previewStop?.();root.replaceChildren();}};
}

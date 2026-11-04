// Presentation only: all drafts and commands go through the identity-aware controller.
const TABS = [['fate','命格'],['practice','修持'],['bonds','因缘'],['history','经历'],['edit','改命']];
const FIELDS = [['physique','体质','physiques'],['bloodlines','血脉','bloodlines'],['hexagram','本命卦','hexagrams'],['personality','性格','personalities'],['hobbies','杂趣','hobbies'],['traits','经历特质','experienceTraits'],['states','状态','experienceTraits'],['bonds','债誓','experienceTraits'],['daoSeed','道种','daoSeeds']];
const MULTI = new Set(['bloodlines','personality','hobbies','traits','states','bonds']);
const describe = value => value == null ? '未载' : typeof value === 'object' ? Array.isArray(value) ? value.map(describe).join('、') || '无' : (value.name || value.id) ? `${value.name || value.id}${value.stage!=null?' · 阶段 '+value.stage:''}${value.grade!=null?' · 血阶 '+value.grade:''}${value.latent?' · 潜隐':''}${value.expiresDay!=null?' · 至第 '+value.expiresDay+' 日':''}${value.inheritable?' · 可传承':''}` : Object.entries(value).map(([k,v])=>`${k}：${describe(v)}`).join(' · ') : String(value);
export function createMingpuView(root, { request } = {}) {
 const doc=root.ownerDocument;
 const el=(tag,text,cls)=>{const x=doc.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const shell=el('section',undefined,'g1-mingpu');shell.hidden=true;shell.setAttribute('aria-label','展开命簿');
 const head=el('header'),title=el('h2'),clock=el('p');head.append(title,clock,button('返回速览',()=>close()));
 const nav=el('div',undefined,'g1-mingpu__tabs');nav.setAttribute('role','tablist');
 const body=el('div',undefined,'g1-mingpu__body'), notice=el('p',undefined,'g1-mingpu__notice');notice.setAttribute('role','status');
 const pages={},buttons={};let vm=null,open=false,active='fate',draft=null,operations=[],preview=null,serial=0,busy=false;
 for(const [id,label] of TABS){const p=el('section');p.setAttribute('role','tabpanel');p.setAttribute('aria-label',label);pages[id]=p;body.append(p);const b=button(label,()=>show(id));b.setAttribute('role','tab');buttons[id]=b;nav.append(b);}
 shell.append(head,nav,notice,body);
 function show(id){active=id;for(const [key,p] of Object.entries(pages)){p.hidden=key!==id;buttons[key].setAttribute('aria-selected',String(key===id));}body.scrollTop=0;}
 function close(){open=false;shell.hidden=true;root.classList?.remove('g1-mingpu-host');draft=null;operations=[];preview=null;serial++;}
 async function call(type){if(!request||busy||!vm)return null;busy=true;const generation=serial,key=vm.identity.key;try{const r=await request({type,targetKey:key,draft,operations});if(generation!==serial||vm?.identity.key!==key)return null;notice.textContent=r?.message||r?.reason|| (r?.ok?'已完成':'操作未完成');return r;}catch(e){notice.textContent=e.message;return null;}finally{busy=false;}}
 function pairs(parent,rows){const dl=el('dl');for(const [label,value] of rows){dl.append(el('dt',label),el('dd',describe(value)));}parent.append(dl);}
 function block(parent,title,rows){parent.append(el('h3',title));if(!rows?.length)parent.append(el('p','暂无保留记录'));else pairs(parent,rows);}
 function paint(){if(!vm)return;const m=vm.mingpu||{},p=m.profile||{};title.textContent=`${vm.identity.name} · 命簿`;clock.textContent=`第 ${Number.isFinite(m.day)?Math.floor(m.day):'未载'} 日 · 同步世界时钟 · ${m.enabled?'万象塑命 Alpha 已启用':'万象塑命 Alpha 未启用'}`;
 for(const id of ['fate','practice','bonds','history'])pages[id].replaceChildren();
 block(pages.fate,'五项属性',[['根骨',p.attributes?.bone],['悟性',p.attributes?.comprehension],['神识',p.attributes?.perception],['气运',m.fortune],['道心',m.mind]]);
 block(pages.fate,'六维禀赋',[['灵根',p.root||m.legacyRoot],['体质',p.physique],['血脉',p.bloodlines],['本命卦',p.hexagram],['性格',p.personality],['杂趣',p.hobbies]]);
 block(pages.fate,'当前状态与道种',[['状态',p.states],['道种',p.daoSeed],['经历特质',p.traits]]);
 block(pages.practice,'真实功法',m.techniques?.map((x,i)=>[i===0?'主修':'辅修',x]));
 block(pages.practice,'技能与调度',p.cultivation?.skills?.map((x,i)=>[`招式 ${i+1}`,x]));
 block(pages.practice,'三件携带法宝',Array.from({length:3},(_,i)=>[`携带 ${i+1}`,m.artifacts?.[i]||'空位']));
 block(pages.practice,'修炼现况',vm.cultivationRows?.map(x=>[x.label,x.value]));
 block(pages.bonds,'人间牵系',vm.relations?.map(x=>[x.label,x.value]));block(pages.bonds,'债誓与遗传来源',[['债誓',p.bonds],['双亲遗传',p.dna]]);
 pages.history.append(el('p',vm.historyCoverage?.description||'仅显示实际保留记录'));
 for(const event of [...(p.history||[])].reverse()){const a=el('article');a.append(el('h3',`第 ${event.day} 日 · ${event.source||event.mode}`));for(const d of event.diff||[])pairs(a,[[d.field,`${describe(d.before)} → ${describe(d.after)}`]]);pages.history.append(a);}
 for(const e of [...(vm.history||[])].reverse())pages.history.append(el('p',`第 ${e.day??'未载'} 日 · ${e.text}`));
 }
 function paintEdit(){const page=pages.edit;page.replaceChildren();const m=vm?.mingpu||{};
 page.append(el('p','点选只形成草稿。预览通过后，一次提交改写；世界继续推进，人物版本变化时须重新读取。A：已接线；B：满足条件生效；C：仅记录身份。状态持续期从提交当日计。'));
 if(!m.enabled){page.append(button('启用万象塑命 Alpha',async()=>{const r=await call('enable');if(r?.ok){notice.textContent='已启用；请读取人物草稿';}}));return;}
 page.append(button('读取 / 刷新草稿',async()=>{const r=await call('begin');if(r?.ok){draft=r.draft;operations=[];preview=null;paintEdit();}}));
 if(!draft){page.append(el('p','尚未建立草稿'));return;}
 const category=el('select'),search=el('input'),library=el('div',undefined,'g1-mingpu__library');search.type='search';search.placeholder='搜索词条';search.setAttribute('aria-label','搜索词条');category.setAttribute('aria-label','词条类别');
 for(const [field,label] of FIELDS){const o=el('option',label);o.value=field;category.append(o);}
 const grade=el('input');grade.type='number';grade.min='1';grade.max='9';grade.value='1';grade.setAttribute('aria-label','血阶 1 至 9');
 const purity=el('input');purity.type='number';purity.min='0';purity.max='100';purity.value='50';purity.setAttribute('aria-label','血脉纯度 0 至 100');
 const stage=el('input');stage.type='number';stage.min='0';stage.max='9';stage.value='0';stage.setAttribute('aria-label','阶段');
 const duration=el('input');duration.type='number';duration.min='1';duration.placeholder='目录默认';duration.setAttribute('aria-label','持续天数');
 const latent=el('input');latent.type='checkbox';const latentLabel=el('label','潜隐血脉');latentLabel.append(latent);
 const inheritance=el('input');inheritance.type='checkbox';const inheritLabel=el('label','改变今后传承');inheritLabel.append(inheritance);
 function add(field,value,op='set'){operations.push({op,field,...(op==='remove'?{id:value.id}:{value})});preview=null;renderDiff();renderRemovals();}
 function populate(){library.replaceChildren();const [field,,catalog]=FIELDS.find(x=>x[0]===category.value)||FIELDS[0];for(const e of (m.catalog?.[catalog]||[]).filter(x=>(catalog!=='experienceTraits'||(field==='traits'?['persistent','trait','special'].includes(x.category):x.category===(field==='states'?'state':'bond')))&&`${x.name} ${x.id} ${x.effectText||''}`.toLowerCase().includes((search.value||'').toLowerCase()))){const a=el('article');a.append(el('strong',e.name),el('p',describe(e.effectText||e.effect||e.description)),el('small',`效果接线：${e.implementation||'待核对'} · ${[e.limit,e.inheritance,e.exit,e.source,e.conditionalEffects?.map(c=>c.condition).join('、')].filter(Boolean).join(' · ')}`));const locked=e.editable===false;const b=button(locked?'尚未接入':MULTI.has(field)?'加入草稿':'替换草稿',()=>{const value={id:e.id,name:e.name,stage:Number(stage.value),...(field==='states'||field==='bonds'?{durationDays:Number(duration.value)||e.durationDays||null}:{}),...(field==='bloodlines'?{grade:Number(grade.value),purity:Number(purity.value),latent:latent.checked,stable:inheritance.checked}:{}),inheritable:inheritance.checked};add(field,value,MULTI.has(field)?'add':'set');});b.disabled=locked;a.append(b);library.append(a);}}
 category.addEventListener('change',populate);search.addEventListener('input',populate);page.append(category,search,el('label','血阶'),grade,el('label','血脉纯度'),purity,inheritLabel,latentLabel,el('label','阶段'),stage,el('label','持续天数'),duration,library);
 const removals=el('div');function renderRemovals(){removals.replaceChildren(el('h3','草稿当前条目 · 可移除后替换'));const profile=structuredClone(draft.profile);for(const o of operations){if(o.op==='set')profile[o.field]=o.value;else if(o.op==='add'){profile[o.field]=profile[o.field].filter(x=>x.id!==o.value.id);profile[o.field].push(o.value);}else profile[o.field]=profile[o.field].filter(x=>x.id!==o.id);}for(const [field,label]of FIELDS){const values=MULTI.has(field)?profile[field]||[]:profile[field]?[profile[field]]:[];for(const x of values)removals.append(button(`移除${label}：${describe(x)}`,()=>add(field,MULTI.has(field)?x:null,MULTI.has(field)?'remove':'set')));}}page.append(removals);
 const attributeBox=el('div');attributeBox.append(el('h3','基础禀赋'));
 const attrs={};for(const [key,label]of [['bone','根骨'],['comprehension','悟性'],['perception','神识']]){const input=el('input');input.type='number';input.min='0';input.max='100';input.value=String(draft.profile?.attributes?.[key]??50);input.setAttribute('aria-label',label);attrs[key]=input;attributeBox.append(el('label',label),input);}
 attributeBox.append(button('加入属性草稿',()=>add('attributes',Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,Number(v.value)])))));
 const roots=el('div');roots.append(el('h3','灵根通道'));const channels=[];for(const [id,label]of [['metal','金'],['wood','木'],['water','水'],['fire','火'],['earth','土']]){const check=el('input');check.type='checkbox';check.checked=draft.profile?.root?.elements?.includes(id)||false;channels.push([id,check]);const labelEl=el('label',label);labelEl.append(check);roots.append(labelEl);}
 const rootPurity=el('input');rootPurity.type='number';rootPurity.min='0';rootPurity.max='100';rootPurity.value=String(draft.profile?.root?.purity??50);rootPurity.setAttribute('aria-label','灵根纯度');roots.append(rootPurity,button('加入灵根草稿',()=>add('root',{elements:channels.filter(([,c])=>c.checked).map(([id])=>id),purity:Number(rootPurity.value),natural:false,heavenly:false})));page.append(attributeBox,roots);
 const diff=el('div',undefined,'g1-mingpu__diff'),actions=el('div',undefined,'g1-mingpu__actions');
 const commit=button('提交改命',async()=>{if(!preview?.ok||!operations.length||busy)return;commit.disabled=true;const r=await call('commit');if(r?.ok){draft=null;operations=[];preview=null;paintEdit();}else{preview=null;renderDiff();}});
 function renderDiff(){diff.replaceChildren(el('h3',`草稿 · ${operations.length} 项变化`));for(const o of operations)diff.append(el('p',`${o.op} ${FIELDS.find(x=>x[0]===o.field)?.[1]||o.field}：${describe(o.value||o.id)}`));if(preview)diff.append(el('p',preview.ok?`校验通过 · 代价 ${describe(preview.cost??'以提交回执为准')}`:`无法提交：${preview.reason||describe(preview.errors)}`));commit.disabled=!preview?.ok||!operations.length;}
 actions.append(button('撤销草稿更改',()=>{operations=[];preview=null;renderDiff();renderRemovals();}),button('预览并校验',async()=>{if(!operations.length)return;preview=await call('preview');renderDiff();}),commit);page.append(diff,actions);populate();renderDiff();renderRemovals();
 }
 return {open(){if(!vm)return;open=true;root.append(shell);shell.hidden=false;root.classList?.add('g1-mingpu-host');paint();paintEdit();show(active);},render(next){const changed=vm?.identity.key!==next?.identity?.key;const enabledChanged=vm?.mingpu?.enabled!==next?.mingpu?.enabled;vm=next;if(changed){close();return;}if(open){paint();if(enabledChanged&&!draft)paintEdit();}},destroy(){serial++;shell.remove();root.classList?.remove('g1-mingpu-host');}};
}

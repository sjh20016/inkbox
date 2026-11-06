import { mechanismState, factTitle, provenance, worldDay, catalogValue, operationTitle, fieldTitle } from './mingpuFacts.js';
// Presentation only: all drafts and commands go through the identity-aware controller.
const TABS = [['fate','命格'],['practice','修持'],['bonds','因缘'],['history','经历'],['edit','改命']];
const FIELDS = [['physique','体质','physiques'],['hexagram','本命卦','hexagrams'],['personality','性格','personalities'],['hobbies','杂趣','hobbies']];
const MULTI = new Set(['personality','hobbies']);
const describe = value => value == null ? '未载' : typeof value === 'object' ? Array.isArray(value) ? value.map(describe).join('、') || '无' : (value.name || value.id) ? `${value.name || value.id}${value.stage!=null?' · 阶段 '+value.stage:''}${value.grade!=null?' · 血阶 '+value.grade:''}${value.latent?' · 潜隐':''}${value.expiresDay!=null?' · 至第 '+value.expiresDay+' 日':''}${value.inheritable?' · 可传承':''}` : Object.entries(value).map(([k,v])=>`${k}：${describe(v)}`).join(' · ') : String(value);
export function createMingpuView(root, { request } = {}) {
 const doc=root.ownerDocument;
 const el=(tag,text,cls)=>{const x=doc.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const shell=el('section',undefined,'g1-mingpu');shell.hidden=true;shell.setAttribute('aria-label','展开命簿');
 const head=el('header'),title=el('h2'),clock=el('p');head.append(title,clock,button('返回速览',()=>close()));
 const nav=el('div',undefined,'g1-mingpu__tabs');nav.setAttribute('role','tablist');
 const body=el('div',undefined,'g1-mingpu__body'), notice=el('p',undefined,'g1-mingpu__notice');notice.setAttribute('role','status');
 const pages={},buttons={};let vm=null,open=false,active='fate',draft=null,operations=[],preview=null,serial=0,busy=false,authority='player';
 for(const [id,label] of TABS){const p=el('section');p.setAttribute('role','tabpanel');p.setAttribute('aria-label',label);pages[id]=p;body.append(p);const b=button(label,()=>show(id));b.setAttribute('role','tab');buttons[id]=b;nav.append(b);}
 shell.append(head,nav,notice,body);
 function show(id){active=id;for(const [key,p] of Object.entries(pages)){p.hidden=key!==id;buttons[key].setAttribute('aria-selected',String(key===id));}body.scrollTop=0;}
 function close(){open=false;shell.hidden=true;root.classList?.remove('g1-mingpu-host');draft=null;operations=[];preview=null;serial++;}
 async function call(type){if(!request||busy||!vm)return null;busy=true;const generation=serial,key=vm.identity.key;try{const r=await request({type,targetKey:key,draft,operations,authority});if(generation!==serial||vm?.identity.key!==key)return null;notice.textContent=r?.message||r?.reason|| (r?.ok?'已完成':'操作未完成');return r;}catch(e){notice.textContent=e.message;return null;}finally{busy=false;}}
 function pairs(parent,rows){const dl=el('dl');for(const [label,value] of rows){dl.append(el('dt',label),el('dd',describe(value)));}parent.append(dl);}
 function block(parent,title,rows){parent.append(el('h3',title));if(!rows?.length)parent.append(el('p','暂无保留记录'));else pairs(parent,rows);}
 function paint(){if(!vm)return;const m=vm.mingpu||{},p=m.profile||{};title.textContent=`${vm.identity.name} · 命簿`;clock.textContent=`第 ${Number.isFinite(m.day)?Math.floor(m.day):'未载'} 日 · 同步世界时钟 · ${m.enabled?'万象塑命 Alpha 已启用':'万象塑命 Alpha 未启用'}`;
 for(const id of ['fate','practice','bonds','history'])pages[id].replaceChildren();
 block(pages.fate,'五项属性',[['根骨',p.attributes?.bone],['悟性',p.attributes?.comprehension],['神识',p.attributes?.perception],['气运',m.fortune],['道心',m.mind]]);
 block(pages.fate,'六维禀赋',[['灵根',p.root||m.legacyRoot],['体质',p.physique],['血脉',p.bloodlines],['本命卦',p.hexagram],['性格',p.personality],['杂趣',p.hobbies]]);
 block(pages.fate,'当前状态与道种',[['状态',p.states],['道种',p.daoSeed],['经历特质',p.traits]]);
 const observation=m.observation||{};
 block(pages.fate,'当前数值修正',(observation.effects||[]).map(effect=>[effect.label,Number(effect.value).toFixed(3)]));
 pages.fate.append(el('p','以下条件根据此刻人物事实判断。技能、物件或目标限定仍以实际行动为准。'));
 for(const mechanism of observation.mechanisms||[]){
   const article=el('article',undefined,'g1-mingpu__mechanism');
   article.append(el('h3',`${mechanism.name} · ${mechanismState(mechanism)}`),el('p',mechanism.description));
   pairs(article,[['来源',mechanism.source],['阶段',mechanism.stage],['传承',mechanism.inheritable?(mechanism.stable?'可遗传且已稳定':'标记可传承，稳定资格待满足'):'未取得遗传资格'],['约束',mechanism.limit],['剩余',mechanism.remaining==null?'无定时期限':`${mechanism.remaining} 日`]]);
   for(const check of mechanism.checks||[])article.append(el('small',`${check.condition} · ${check.proven?'当前条件已满足':'需等实际行动才能判定'}${check.consumer?'':' · 机制尚未实现或待消费者核对'}`));
   pages.fate.append(article);
 }
 block(pages.practice,'真实功法',m.techniques?.map((x,i)=>[i===0?'主修':'辅修',x]));
 block(pages.practice,'技能与调度',p.cultivation?.skills?.map((x,i)=>[`招式 ${i+1}`,x]));
 block(pages.practice,'三件携带法宝',Array.from({length:3},(_,i)=>[`携带 ${i+1}`,m.artifacts?.[i]||'空位']));
 block(pages.practice,'修炼现况',vm.cultivationRows?.map(x=>[x.label,x.value]));
 block(pages.bonds,'人间牵系',vm.relations?.map(x=>[x.label,x.value]));block(pages.bonds,'债誓与遗传来源',[['债誓',p.bonds],['双亲遗传',p.dna]]);
 block(pages.bonds,'已过期关系留痕',(p.experienceLedger?.bondHistory||[]).slice(-12).map(row=>[`${describe(row)} · 至第 ${worldDay(row.endedDay??row.expiresDay)} 日`,row.targetKey]));
 block(pages.bonds,'双亲身份引用',(observation.parents||[]).map((key,index)=>[`双亲 ${index+1}`,key]));
 block(pages.bonds,'血脉来源',(observation.bloodSources||[]).map(source=>[source.id,source.parent||source.source]));
 for(const record of [...(observation.records||[])].reverse()){
   const article=el('article',undefined,'g1-mingpu__milestone');
   article.append(el('h3',`第 ${Math.floor(record.day)} 日 · ${factTitle(record.type)}`));
   pairs(article,[['来源','修行所得 / 真实世界事件'],['事实引用',record.id],['地点',record.siteId],['人物变化',record.changed?'已产生变化':'保留事实，未新增特质'],['参与者',record.helperKey||record.targetKey],['付出/所得',record.cost??record.amount],['后续影响',record.changed?'人物经历或机制状态发生变化':'事实留存；未新增特质']]);
   pages.history.append(article);
 }
 pages.history.append(el('p',vm.historyCoverage?.description||'仅显示实际保留记录'));
 for(const event of [...(p.history||[])].reverse()){const a=el('article');a.append(el('h3',`第 ${worldDay(event.day)} 日 · ${event.type?factTitle(event.type)+' · ':''}${provenance(event)}`));pairs(a,[['人物',event.actorKey||event.key||vm.identity.key],['来源',provenance(event)],['事实引用',event.source],['地点',event.location],['参与者',event.targetKey],['付出',event.cost],['结果',event.result],['传承资格涉及',event.inheritanceAffected?'是':'否'],['进行中事务涉及',event.inFlightAffected?'是':'否']]);for(const d of event.diff||[])pairs(a,[[fieldTitle(d.field),`${catalogValue(d.before,m.catalog)} → ${catalogValue(d.after,m.catalog)}`]]);pages.history.append(a);}
 for(const e of [...(vm.history||[])].reverse())pages.history.append(el('p',`第 ${worldDay(e.day)} 日 · ${e.text}`));
 }
 function paintEdit(){const page=pages.edit;page.replaceChildren();const m=vm?.mingpu||{};
 page.append(el('p','常规改命仅改变命格身份与基础禀赋。草稿以最新世界事实预览；相关字段变化须重新读取。天道敕改为独立操作，保留来源，不伪造自然治疗或传承资格。'));
 if(!m.enabled){page.append(button('启用万象塑命 Alpha',async()=>{const r=await call('enable');if(r?.ok){notice.textContent='已启用；请读取人物草稿';}}));return;}
 page.append(button('读取 / 刷新草稿',async()=>{const r=await call('begin');if(r?.ok){draft=r.draft;authority='player';operations=[];preview=null;paintEdit();}}));
 if(!draft){page.append(el('p','尚未建立草稿'));return;}
 const category=el('select'),search=el('input'),library=el('div',undefined,'g1-mingpu__library');search.type='search';search.placeholder='搜索词条';search.setAttribute('aria-label','搜索词条');category.setAttribute('aria-label','词条类别');
 for(const [field,label] of FIELDS){const o=el('option',label);o.value=field;category.append(o);}
 function add(field,value,op='set'){authority='player';if(operations.some(x=>x.op==='decree'))operations=[];if(MULTI.has(field)){let values=operations.filter(x=>x.field===field).at(-1)?.value||draft.profile[field]||[];values=values.map(x=>({id:x.id})).filter(x=>x.id!==value?.id);if(op!=='remove')values.push({id:value.id});operations=operations.filter(x=>x.field!==field);operations.push({op:'set',field,value:values});}else operations.push({op:'set',field,value});preview=null;renderDiff();renderRemovals();}
 function populate(){library.replaceChildren();const [field,,catalog]=FIELDS.find(x=>x[0]===category.value)||FIELDS[0];for(const e of (m.catalog?.[catalog]||[]).filter(x=>(catalog!=='experienceTraits'||(field==='traits'?['persistent','trait','special'].includes(x.category):x.category===(field==='states'?'state':'bond')))&&`${x.name} ${x.id} ${x.effectText||''}`.toLowerCase().includes((search.value||'').toLowerCase()))){const a=el('article');a.append(el('strong',e.name),el('p',describe(e.effectText||e.effect||e.description)),el('small',`效果接线：${e.implementation||'待核对'} · ${[e.limit,e.inheritance,e.exit,e.source,e.conditionalEffects?.map(c=>c.condition).join('、')].filter(Boolean).join(' · ')}`));const locked=e.editable===false;const b=button(locked?'尚未接入':MULTI.has(field)?'加入草稿':'替换草稿',()=>{const value={id:e.id};add(field,value,MULTI.has(field)?'add':'set');});b.disabled=locked;a.append(b);library.append(a);}}
 category.addEventListener('change',populate);search.addEventListener('input',populate);page.append(category,search,library);
 const removals=el('div');function renderRemovals(){removals.replaceChildren(el('h3','草稿当前条目 · 可移除后替换'));const profile=structuredClone(draft.profile);for(const o of operations){if(o.op==='decree')continue;if(o.op==='set')profile[o.field]=o.value;else if(o.op==='add'){profile[o.field]=profile[o.field].filter(x=>x.id!==o.value.id);profile[o.field].push(o.value);}else profile[o.field]=profile[o.field].filter(x=>x.id!==o.id);}for(const [field,label]of FIELDS){const values=MULTI.has(field)?profile[field]||[]:profile[field]?[profile[field]]:[];for(const x of values)removals.append(button(`移除${label}：${describe(x)}`,()=>add(field,MULTI.has(field)?x:null,MULTI.has(field)?'remove':'set')));}}page.append(removals);
 const attributeBox=el('div');attributeBox.append(el('h3','基础禀赋'));
 const attrs={};for(const [key,label]of [['bone','根骨'],['comprehension','悟性'],['perception','神识']]){const input=el('input');input.type='number';input.min='0';input.max='100';input.value=String(draft.profile?.attributes?.[key]??50);input.setAttribute('aria-label',label);attrs[key]=input;attributeBox.append(el('label',label),input);}
 attributeBox.append(button('加入属性草稿',()=>add('attributes',Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,Number(v.value)])))));
 const roots=el('div');roots.append(el('h3','灵根通道'));const channels=[];for(const [id,label]of [['metal','金'],['wood','木'],['water','水'],['fire','火'],['earth','土']]){const check=el('input');check.type='checkbox';check.checked=draft.profile?.root?.elements?.includes(id)||false;channels.push([id,check]);const labelEl=el('label',label);labelEl.append(check);roots.append(labelEl);}
 const rootPurity=el('input');rootPurity.type='number';rootPurity.min='0';rootPurity.max='100';rootPurity.value=String(draft.profile?.root?.purity??50);rootPurity.setAttribute('aria-label','灵根纯度');roots.append(rootPurity,button('加入灵根草稿',()=>add('root',{elements:channels.filter(([,c])=>c.checked).map(([id])=>id),purity:Number(rootPurity.value),natural:false,heavenly:false})));page.append(attributeBox,roots);
 const decree=el('fieldset');decree.append(el('legend','天道敕改 · 自由观世'),el('p','无需统一天机费用。敕改不会增加自然治疗次数或伪造修行经历；仍需预览并提交。'));
 function command(op){authority='decree';operations=[{op:'decree',...op}];preview=null;renderDiff();}
 if(['yin_block','yang_block'].includes(draft.profile.physique?.id))decree.append(button('敕令开脉',()=>command({action:'open_meridians'})));
 for(const state of draft.profile.states||[])decree.append(button(`敕令洗去：${describe(state)}`,()=>command({action:'remove_state',id:state.id})));
 for(const blood of draft.profile.bloodlines||[])decree.append(button(`敕令${blood.latent?'显化':'潜隐'}：${describe(blood)}`,()=>command({action:'set_bloodline_visibility',id:blood.id,latent:!blood.latent})));
 const grant=el('select');grant.setAttribute('aria-label','敕赐血脉');for(const row of m.catalog?.bloodlines||[]){const option=el('option',row.name);option.value=row.id;grant.append(option);}
 decree.append(grant,button('敕赐初阶血脉',()=>{if(grant.value)command({action:'grant_bloodline',id:grant.value,grade:1,purity:50,latent:false});}));page.append(decree);
 const diff=el('div',undefined,'g1-mingpu__diff'),actions=el('div',undefined,'g1-mingpu__actions');
 const commit=button('提交改命',async()=>{if(!preview?.ok||!operations.length||busy)return;commit.disabled=true;const r=await call('commit');if(r?.ok){draft=null;operations=[];preview=null;paintEdit();}else{preview=null;renderDiff();}});
 function renderDiff(){diff.replaceChildren(el('h3',`${authority==='decree'?'天道敕改':'常规改命'}草稿 · ${operations.length} 项变化`));for(const o of operations)diff.append(el('p',operationTitle(o,m.catalog)));if(preview?.ok)for(const row of preview.diff||[])pairs(diff,[[fieldTitle(row.field),`${catalogValue(row.before,m.catalog)} → ${catalogValue(row.after,m.catalog)}`]]);if(preview)diff.append(el('p',preview.ok?`校验通过 · 代价 ${describe(preview.cost??'以提交回执为准')}`:`无法提交：${preview.reason||describe(preview.errors)}`));commit.disabled=!preview?.ok||!operations.length;}
 actions.append(button('撤销草稿更改',()=>{operations=[];preview=null;renderDiff();renderRemovals();}),button('预览并校验',async()=>{if(!operations.length)return;preview=await call('preview');renderDiff();}),commit);page.append(diff,actions);populate();renderDiff();renderRemovals();
 }
 return {open(){if(!vm)return;open=true;root.append(shell);shell.hidden=false;root.classList?.add('g1-mingpu-host');paint();paintEdit();show(active);},render(next){const changed=vm?.identity.key!==next?.identity?.key;const enabledChanged=vm?.mingpu?.enabled!==next?.mingpu?.enabled;vm=next;if(changed){close();return;}if(open){paint();if(enabledChanged&&!draft)paintEdit();}},destroy(){serial++;shell.remove();root.classList?.remove('g1-mingpu-host');}};
}

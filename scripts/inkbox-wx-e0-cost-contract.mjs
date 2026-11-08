import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const REQUIRED_FIELDS=['consumerAndFactSource','settlementObjects','timePrecision','worstCaseCost','queryMethod','rngContract','cacheInvalidation','dataLifetime','failureAndExit','testEvidence'];
export const BASELINE_INVENTORY=Object.freeze({commit:'c4b169d707704b614344345dfb1cac8fe96d50a9',count:65,sha256:'75fb48cb5adebb80c790e97e8f6aefe96aff9d690ea2fb3ba3941a7b284417e8'});
const sha256=value=>createHash('sha256').update(value).digest('hex');
const sourceSha256=value=>sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n'),'utf8'));
const inventorySha256=paths=>sha256(Buffer.from(`${paths.join('\n')}\n`,'utf8'));
const empty=v=>typeof v!=='string'||!v.trim();
const SOURCE_ROOTS=['src/inkbox/sim','src/inkbox/wanxiang'];

export async function discoverSimulationModules(root,readDirectory=readdir){
  const found=[];
  async function visit(relative){
    let entries;try{entries=await readDirectory(path.join(root,relative),{withFileTypes:true});}catch{return;}
    for(const entry of entries){const child=`${relative}/${entry.name}`;if(entry.isDirectory())await visit(child);else if(entry.isFile()&&entry.name.endsWith('.js'))found.push(child.replaceAll('\\','/'));}
  }
  for(const directory of SOURCE_ROOTS)await visit(directory);
  return found.sort();
}

/** Validate explicit review anchors and complete cards. Hashes are never rewritten. */
export async function checkCostRegistry({root,registry,contractText,changedPaths=[],readBytes=readFile,sourcePaths=null,baselineInventory=BASELINE_INVENTORY}){
  const errors=[];
  for(const field of REQUIRED_FIELDS)if(!registry.requiredCostCardFields?.includes(field))errors.push(`registry omits required field ${field}`);
  for(const field of REQUIRED_FIELDS)if(!contractText.includes(`\`${field}\``))errors.push(`contract does not define ${field}`);
  const cards=new Map();
  for(const card of registry.cards||[]){if(!card.id||cards.has(card.id))errors.push(`missing or duplicate card id ${card.id||'(empty)'}`);cards.set(card.id,card);for(const field of REQUIRED_FIELDS)if(empty(card[field]))errors.push(`card ${card.id||'(empty)'} missing ${field}`);}
  const paths=new Map();
  for(const entry of registry.protectedFiles||[]){
    if(!entry.path||paths.has(entry.path))errors.push(`missing or duplicate protected path ${entry.path||'(empty)'}`);paths.set(entry.path,entry);
    if(!cards.has(entry.cardId))errors.push(`${entry.path}: missing cost card ${entry.cardId}`);
    if(entry.planned&&entry.sha256==null){try{await readBytes(path.join(root,entry.path));errors.push(`${entry.path}: planned protected file exists but has no reviewed SHA-256`);}catch{}continue;}
    if(!/^[a-f0-9]{64}$/.test(entry.sha256||'')){errors.push(`${entry.path}: missing valid reviewed SHA-256`);continue;}
    try{const bytes=await readBytes(path.join(root,entry.path));if(sourceSha256(bytes)!==entry.sha256)errors.push(`${entry.path}: LF-normalized SHA-256 differs from reviewed registry; review diff and update deliberately`);}
    catch{errors.push(`${entry.path}: registered file is missing`);}
  }
  const inventory=registry.sourceInventory;
  if(!Array.isArray(inventory))errors.push('registry is missing the fixed baseline sourceInventory');
  else if(new Set(inventory).size!==inventory.length)errors.push('registry sourceInventory contains duplicate paths');
  if(registry.baseline!==baselineInventory.commit)errors.push(`registry baseline must equal pinned ${baselineInventory.commit}`);
  if(Array.isArray(inventory)){
    if(inventory.length!==baselineInventory.count||inventorySha256(inventory)!==baselineInventory.sha256)
      errors.push(`registry sourceInventory differs from pinned ${baselineInventory.count}-path c4 baseline digest`);
    if(inventory.some((item,index)=>index>0&&inventory[index-1].localeCompare(item)>0))errors.push('registry sourceInventory is not in canonical sorted order');
  }
  const baselinePaths=new Set(inventory||[]);
  const discovered=sourcePaths||await discoverSimulationModules(root);
  for(const current of discovered){
    if(baselinePaths.has(current))continue;
    const entry=paths.get(current);
    if(!entry)errors.push(`${current}: new simulation module is absent from baseline inventory and lacks a registered cost card/review hash`);
    else if(!/^[a-f0-9]{64}$/.test(entry.sha256||''))errors.push(`${current}: new simulation module lacks a reviewed SHA-256`);
  }
  for(const changed of changedPaths){
    const normalized=changed.replaceAll('\\','/').replace(/^\.\//,'');
    if(SOURCE_ROOTS.some(prefix=>normalized.startsWith(`${prefix}/`))&&!baselinePaths.has(normalized)&&!paths.has(normalized))errors.push(`${normalized}: changed new simulation module lacks a registered cost card`);
  }
  return errors;
}

const readRegistry=async root=>JSON.parse(await readFile(path.join(root,'docs/development/SIMULATION_COST_REGISTRY.json'),'utf8'));
const contractPath='docs/development/SIMULATION_COST_CONTRACT.md';

// Controlled red: an unregistered consumer and a modified protected hot path fail.
const fixtureCard=Object.fromEntries(REQUIRED_FIELDS.map(field=>[field,'controlled bounded event consumer']));
const fixtureBytes=Buffer.from('baseline hot path');
const fixtureInventory=['src/inkbox/sim/life.js'];
const fixtureBaseline={commit:'fixture-baseline',count:fixtureInventory.length,sha256:inventorySha256(fixtureInventory)};
const fixtureRegistry={baseline:fixtureBaseline.commit,requiredCostCardFields:REQUIRED_FIELDS,sourceInventory:fixtureInventory,protectedFiles:[{path:'src/inkbox/sim/life.js',sha256:sourceSha256(fixtureBytes),cardId:'fixture'}],cards:[{id:'fixture',...fixtureCard}]};
const fixtureContract=REQUIRED_FIELDS.map(field=>`\`${field}\``).join(' ');
const fixtureBase=await checkCostRegistry({root:'fixture',registry:fixtureRegistry,contractText:fixtureContract,baselineInventory:fixtureBaseline,sourcePaths:['src/inkbox/sim/life.js'],readBytes:async()=>fixtureBytes});
assert.deepEqual(fixtureBase,[],'registered baseline and complete card pass');
const forbidden=Buffer.from('for (const entity of world.entities) stepEntity(entity);');
const modified=await checkCostRegistry({root:'fixture',registry:fixtureRegistry,contractText:fixtureContract,readBytes:async()=>forbidden});
assert(modified.some(error=>error.includes('life.js')&&error.includes('SHA-256 differs')),'unreviewed full-population scan in protected hot path fails');
const tempRoot=await mkdtemp(path.join(os.tmpdir(),'wx-e0-cost-'));
try{
  const modulePath=path.join(tempRoot,'src/inkbox/sim/newHotLoop.js');await mkdir(path.dirname(modulePath),{recursive:true});await writeFile(modulePath,'for (const entity of world.entities) stepEntity(entity);');
  const redRegistry={...fixtureRegistry};
  const red=await checkCostRegistry({root:tempRoot,registry:redRegistry,contractText:fixtureContract,baselineInventory:fixtureBaseline,readBytes:async file=>file.endsWith('life.js')?fixtureBytes:readFile(file)});
  assert(red.some(error=>error.includes('newHotLoop.js')&&error.includes('lacks a registered cost card')),'CLI directory enumeration rejects arbitrary unregistered new module without env/changedPaths');
  const pollutedRegistry={...fixtureRegistry,sourceInventory:[...fixtureInventory,'src/inkbox/sim/newHotLoop.js']};
  const polluted=await checkCostRegistry({root:tempRoot,registry:pollutedRegistry,contractText:fixtureContract,baselineInventory:fixtureBaseline,readBytes:async file=>file.endsWith('life.js')?fixtureBytes:readFile(file)});
  assert(polluted.some(error=>error.includes('sourceInventory differs from pinned')),'adding a new module path to the registry inventory itself fails the pinned digest');
  const eventPath='src/inkbox/sim/newHotLoop.js';
  const eventBytes=Buffer.from('formal event consumer');await writeFile(modulePath,eventBytes);
  const greenRegistry={baseline:fixtureBaseline.commit,requiredCostCardFields:REQUIRED_FIELDS,sourceInventory:redRegistry.sourceInventory,protectedFiles:[...fixtureRegistry.protectedFiles,{path:eventPath,sha256:sourceSha256(eventBytes),cardId:'event'}],cards:[...fixtureRegistry.cards,{id:'event',...fixtureCard,consumerAndFactSource:'formal event payload',settlementObjects:'one event object',timePrecision:'formal event',worstCaseCost:'one object O(1)',queryMethod:'direct event reference',rngContract:'no draw',cacheInvalidation:'no cache',dataLifetime:'transient',failureAndExit:'discard stale event',testEvidence:'controlled event fixture'}]};
  const green=await checkCostRegistry({root:tempRoot,registry:greenRegistry,contractText:fixtureContract,baselineInventory:fixtureBaseline,readBytes:async file=>file.endsWith('life.js')?fixtureBytes:readFile(file)});
  assert.deepEqual(green,[],'registered bounded event consumer with complete card and matching hash passes directory enumeration');
}finally{await rm(tempRoot,{recursive:true,force:true});}

const root=path.resolve(here,'..');const registry=await readRegistry(root);const contractText=await readFile(path.join(root,contractPath),'utf8');
const changedPaths=(process.env.WX_E0_CHANGED_FILES||'').split(/\r?\n/).filter(Boolean);
const errors=await checkCostRegistry({root,registry,contractText,changedPaths});
if(errors.length){for(const error of errors)console.error(`WX-E0 cost contract: ${error}`);process.exitCode=1;}
else console.log(`WX-E0 cost contract: ${registry.cards.length} complete cards, ${registry.protectedFiles.length} protected anchors, ${registry.sourceInventory.length} baseline modules, controlled red/green fixtures passed`);

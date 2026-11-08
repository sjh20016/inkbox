import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const REQUIRED_FIELDS=['consumerAndFactSource','settlementObjects','timePrecision','worstCaseCost','queryMethod','rngContract','cacheInvalidation','dataLifetime','failureAndExit','testEvidence'];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const sourceSha256=value=>sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n'),'utf8'));
const empty=v=>typeof v!=='string'||!v.trim();

/** Validate explicit review anchors and complete cards. Hashes are never rewritten. */
export async function checkCostRegistry({root,registry,contractText,changedPaths=[],readBytes=readFile}){
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
  for(const changed of changedPaths){
    const normalized=changed.replaceAll('\\','/').replace(/^\.\//,'');
    if(/(?:^|\/)(?:life|advance|skills|workMetrics|effects|main|siteSearch)\.js$/i.test(normalized)&&!paths.has(normalized))errors.push(`${normalized}: changed hot-path candidate is not registered with a cost card`);
  }
  return errors;
}

const readRegistry=async root=>JSON.parse(await readFile(path.join(root,'docs/development/SIMULATION_COST_REGISTRY.json'),'utf8'));
const contractPath='docs/development/SIMULATION_COST_CONTRACT.md';

// Controlled red: an unregistered consumer and a modified protected hot path fail.
const fixtureCard=Object.fromEntries(REQUIRED_FIELDS.map(field=>[field,'controlled bounded event consumer']));
const fixtureBytes=Buffer.from('baseline hot path');
const fixtureRegistry={requiredCostCardFields:REQUIRED_FIELDS,protectedFiles:[{path:'src/inkbox/sim/life.js',sha256:sha256(fixtureBytes),cardId:'fixture'}],cards:[{id:'fixture',...fixtureCard}]};
const fixtureContract=REQUIRED_FIELDS.map(field=>`\`${field}\``).join(' ');
const fixtureRegistryBaselineHash=sourceSha256(fixtureBytes);
fixtureRegistry.protectedFiles[0].sha256=fixtureRegistryBaselineHash;
const fixtureBase=await checkCostRegistry({root:'fixture',registry:fixtureRegistry,contractText:fixtureContract,readBytes:async()=>fixtureBytes});
assert.deepEqual(fixtureBase,[],'registered baseline and complete card pass');
const unregistered=await checkCostRegistry({root:'fixture',registry:fixtureRegistry,contractText:fixtureContract,changedPaths:['src/inkbox/sim/siteSearch.js'],readBytes:async()=>fixtureBytes});
assert(unregistered.some(error=>error.includes('siteSearch.js')&&error.includes('not registered')),'new hot-path consumer without card fails');
const forbidden=Buffer.from('for (const entity of world.entities) stepEntity(entity);');
const modified=await checkCostRegistry({root:'fixture',registry:fixtureRegistry,contractText:fixtureContract,readBytes:async()=>forbidden});
assert(modified.some(error=>error.includes('life.js')&&error.includes('SHA-256 differs')),'unreviewed full-population scan in protected hot path fails');
const greenRegistry={requiredCostCardFields:REQUIRED_FIELDS,protectedFiles:[{path:'src/inkbox/sim/siteSearch.js',sha256:sha256(fixtureBytes),cardId:'event'}],cards:[{id:'event',...fixtureCard,consumerAndFactSource:'formal event payload',settlementObjects:'one event object',timePrecision:'formal event',worstCaseCost:'one object O(1)',queryMethod:'direct event reference',rngContract:'no draw',cacheInvalidation:'no cache',dataLifetime:'transient',failureAndExit:'discard stale event',testEvidence:'controlled event fixture'}]};
assert.deepEqual(await checkCostRegistry({root:'fixture',registry:greenRegistry,contractText:fixtureContract,changedPaths:['src/inkbox/sim/siteSearch.js'],readBytes:async()=>fixtureBytes}),[],'registered bounded event consumer with complete card passes');

const root=path.resolve(here,'..');const registry=await readRegistry(root);const contractText=await readFile(path.join(root,contractPath),'utf8');
const changedPaths=(process.env.WX_E0_CHANGED_FILES||'').split(/\r?\n/).filter(Boolean);
const errors=await checkCostRegistry({root,registry,contractText,changedPaths});
if(errors.length){for(const error of errors)console.error(`WX-E0 cost contract: ${error}`);process.exitCode=1;}
else console.log(`WX-E0 cost contract: ${registry.cards.length} complete cards, ${registry.protectedFiles.length} protected anchors, controlled red/green fixtures passed`);

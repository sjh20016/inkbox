import assert from 'node:assert/strict';

// CDP Session.errors() covers exceptions and Log errors, but console.error is
// a separate Runtime event. A release run must fail for either kind.
export function collectBrowserErrors(session) {
  const consoleErrors = (session?.cdp?.events || [])
    .filter(event => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    .map(event => ({ type: 'console.error', timestamp: event.params.timestamp,
      text: event.params.args?.map(arg => String(arg.description ?? arg.value ?? arg.type)).join(' ') || 'console.error()' }));
  return [...(session?.errors() || []), ...consoleErrors];
}

export function selectCases(cases, selection) {
  if (selection === undefined) return cases;
  assert.match(selection, /^\d+(,\d+)*$/, 'INKBOX_PERF_CASE must be a nonempty comma-separated list of case indices');
  const indices = selection.split(',').map(Number);
  assert.equal(new Set(indices).size, indices.length, 'Duplicate performance case index');
  assert(indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < cases.length), 'Performance case index out of range');
  return indices.map(index => ({ ...cases[index], caseIndex: index }));
}

export function diagnosticCases(kind) {
  assert(['acceptance', 'source', 'observation', 'whole'].includes(kind), 'Unknown INKBOX_PERF_DIAGNOSTIC');
  if (kind !== 'whole') return null;
  return ['canvas', '3d'].flatMap(renderer => ['normal', 'dense', 'character', 'environment', 'environment-changing']
    .map(scenario => ({ preset: 'expanse', renderer, view: 'full', count: scenario === 'normal' ? 0 : 32, scenario })));
}

// Run after the unchanged official World and combat fixture have been created.
// Every edit uses the product tool API. No simulation array is patched here.
export function scenarioSetup(c) {
  return `const k=window.inkbox,w=k.world;window.__g2pfBurnSites=[];
  if(${JSON.stringify(c.scenario || '')}==='character'){
    const e=w.entities.find(e=>e.id===window.__g2CombatActors?.[0])||w.entities.find(e=>['human','cultivator'].includes(e.sp));
    if(!e||!k.g1.open({plane:'mortal',entityId:e.id}).ok)throw Error('Formal character observation could not open');
  }
  if(${JSON.stringify(c.scenario || '')}.startsWith('environment')){
    const sites=[];for(let y=12;y<w.h-12;y+=12)for(let x=12;x<w.w-12;x+=12){const i=w.idx(x,y);if(w.veg[i]>.3&&w.isWalkable(i))sites.push({x,y});}
    if(sites.length<6)throw Error('Insufficient real vegetation sites');window.__g2pfBurnSites=sites.slice(0,6);
    const result=k.environmentObservation.select({plane:'mortal',...sites[0],radius:6});if(!result.ok)throw Error('Formal environment observation could not open');
    k.selectTool('burn');k.applyTool(true,{point:sites[0],radius:6});
    if(!w.fire.some(value=>value>.01))throw Error('Formal burn tool did not ignite World');
    k.selectTool('raise');
  }return {scenario:${JSON.stringify(c.scenario || null)},burnSites:window.__g2pfBurnSites,characterOpen:!!k.g1.current(),environmentOpen:!!k.environmentObservation.current().observation};`;
}

if (process.argv.includes('--check')) {
  const consoleEvent = { method: 'Runtime.consoleAPICalled', params: { type: 'error', args: [{ value: 'app failure' }] } };
  assert.equal(collectBrowserErrors({ errors: () => [], cdp: { events: [consoleEvent] } }).length, 1);
  assert.equal(collectBrowserErrors({ errors: () => ['exception'], cdp: { events: [consoleEvent] } }).length, 2);
  assert.equal(collectBrowserErrors({ errors: () => [], cdp: { events: [{ ...consoleEvent, params: { type: 'warn' } }] } }).length, 0);
  const cases = Array.from({ length: 12 }, (_, caseIndex) => ({ caseIndex }));
  assert.equal(selectCases(cases, undefined).length, 12);
  assert.deepEqual(selectCases(cases, '1,7').map(c => c.caseIndex), [1, 7]);
  for (const invalid of ['', '12', '-1', 'x', '1,1', '1,', ' 1', '1.0']) assert.throws(() => selectCases(cases, invalid));
  assert.equal(diagnosticCases('whole').length, 10);
  console.log('G2-PF config: valid selection and fail-closed invalid selection verified');
}

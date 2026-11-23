// The official E-M2 runner loads the natural v11 checkpoint and inspects both renderers.
process.argv.push('--ages=400', '--renderers=canvas,3d', '--views=overview',
  '--speed-indices=0,2', '--sequence=A', '--rounds=1', '--duration-ms=2000',
  '--warmup-ms=500', '--population-reader=1', '--out=reports/mlod0b/browser');
await import('./inkbox-e-m2-browser.mjs');

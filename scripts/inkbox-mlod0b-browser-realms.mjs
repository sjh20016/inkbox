process.argv.push('--ages=400','--renderers=canvas,3d','--views=overview',
  '--speed-indices=0','--sequence=A','--rounds=1','--duration-ms=1000',
  '--warmup-ms=500','--population-reader=1','--population-realms=1',
  '--out=reports/mlod0b/browser-realms');
await import('./inkbox-e-m2-browser.mjs');

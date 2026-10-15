// Injected into browser probes through toString(); keep this function self-contained.
// Steady style comparisons follow real product RAFs until short-lived UI FX expire.
// Never hide meshes, modify FX ages, drain events or advance simulation from a probe.
export async function waitForIdlePresentation(host, timeoutMs = 15000) {
  const read = () => [...host.stages.values()].filter(stage => stage.visible)
    .map(stage => ({ plane: stage.plane, count: stage.fxProbe?.mesh.count || 0 }));
  const started = performance.now(), initialCounts = read();
  let frames = 0, idleFrames = 0, finalCounts = initialCounts;
  while (performance.now() - started < timeoutMs) {
    await new Promise(requestAnimationFrame);
    frames++;
    finalCounts = read();
    idleFrames = finalCounts.every(row => row.count === 0) ? idleFrames + 1 : 0;
    if (idleFrames >= 3) return { frames, elapsedMs: performance.now() - started,
      initialCounts, finalCounts, waitedOnProductRAF: true };
  }
  throw new Error(`Presentation FX did not naturally settle before ${timeoutMs}ms: ${JSON.stringify(finalCounts)}`);
}

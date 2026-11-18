// One lazy entry for the launcher URL and the live Canvas → Three button.
// Importing this module alone never loads Three or replaces the current world.
const pending = new WeakMap();

export function enterRender3D(sandbox) {
  if (sandbox.render3d) {
    if (!sandbox.render3d.active) sandbox.render3d.setActive(true);
    return Promise.resolve(sandbox.render3d);
  }
  if (pending.has(sandbox)) return pending.get(sandbox);
  const loading = import('./Render3DAdapter.js').then(({ Render3DAdapter }) => {
    if (!sandbox.render3d) sandbox.render3d = new Render3DAdapter(sandbox);
    return sandbox.render3d;
  });
  pending.set(sandbox, loading);
  return loading.finally(() => pending.delete(sandbox));
}

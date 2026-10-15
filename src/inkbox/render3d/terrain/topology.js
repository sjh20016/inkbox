/** Historical worlds keep T0; v2 worlds select the less steep diagonal from authoritative heights. */
export function adaptiveTopology(world) { return Number(world.generation?.version) >= 2; }
export function diagonalAD(world,x,y) {
  if (!adaptiveTopology(world)) return false;
  const i=y*world.w+x,h=world.height;
  return Math.abs(h[i]-h[i+world.w+1]) < Math.abs(h[i+1]-h[i+world.w]);
}
export function quadIndices(world,x,y) {
  const a=y*world.w+x,b=a+1,c=a+world.w,d=c+1;
  return diagonalAD(world,x,y)?[a,c,d,a,d,b]:[a,c,b,b,c,d];
}
export function dirtyQuads(world,region,visit) {
  for(let y=Math.max(0,region.y0-1);y<=Math.min(world.h-2,region.y1);y++)
    for(let x=Math.max(0,region.x0-1);x<=Math.min(world.w-2,region.x1);x++)visit(x,y);
}

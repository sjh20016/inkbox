import { planTransitRoute } from '../world/transitGeography.js';
import { startWorkMetric, endWorkMetric, countWorkMetric } from '../sim/workMetrics.js';

/** Encounter movement currently uses Life.moveTowards, so only a land route is executable. */
export function opportunityLandRoute(world, actor, site) {
  if (!world || !actor || !site || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)
    || !Number.isFinite(site.x) || !Number.isFinite(site.y)) return null;
  const started = startWorkMetric(world);
  countWorkMetric(world, 'opportunityRouteChecks');
  try {
    const route = planTransitRoute(world, actor, site, { mode: 'land', actor });
    return route.ok ? route : null;
  } finally { endWorkMetric(world, 'opportunityRoute', started); }
}

export function canReachOpportunity(world, actor, site) {
  const route = opportunityLandRoute(world, actor, site);
  return !!route && route.distance <= 96 && routeCorners(route).length <= 128;
}

/** A few corners are enough for Life's direct movement without persisting a full route. */
export function routeCorners(route) {
  const points = route?.legs?.[0]?.points || [];
  if (!points.length) return [];
  const corners = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) corners.push({ x: b.x, y: b.y });
  }
  corners.push({ x: points.at(-1).x, y: points.at(-1).y });
  return corners;
}

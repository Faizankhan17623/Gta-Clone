// Deterministic placement of static activities outside the carriageways.
// Keep the passed position object: mission prompts and visuals use that reference.
export function overlapsRoad(city, x, z, radius = 0) {
  const edge = 8 + radius + .25;
  return city.roadXs.some(v => Math.abs(x - v) < edge) ||
    city.roadZs.some(v => Math.abs(z - v) < edge);
}

export function placeStreetSite(city, pos, radius = 2.5, label = 'activity') {
  const sites = city.activitySites ||= [];
  const clear = (x, z) => !overlapsRoad(city, x, z, radius) &&
    !city.colliders.some(c => x + radius > c.x0 && x - radius < c.x1 && z + radius > c.z0 && z - radius < c.z1) &&
    !sites.some(s => Math.abs(x - s.x) < radius + s.radius + 1 && Math.abs(z - s.z) < radius + s.radius + 1);
  const candidates = [{ x: pos.x, z: pos.z }];
  // Corners, edge midpoints and centers of actual city lots, not random roads.
  for (const walk of city.walks) {
    const inset = 30 - radius - .6;
    for (const dx of [-inset, 0, inset]) for (const dz of [-inset, 0, inset])
      candidates.push({ x: walk.x + dx, z: walk.z + dz });
  }
  candidates.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
  const site = candidates.find(p => clear(p.x, p.z));
  if (!site) throw new Error(`No clear off-road location for ${label}`);
  pos.x = site.x; pos.z = site.z;
  sites.push({ ...site, radius, label });
  return pos;
}

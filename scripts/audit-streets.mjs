import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await page.goto(`http://localhost:${process.env.PORT || 8082}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__debug);
  await page.click('#playbtn');
  console.log(JSON.stringify(await page.evaluate(async () => {
    const THREE = await import('three');
    const { overlapsRoad } = await import('/js/site-layout.js');
    const w = window.__debug.world;
    const moving = new Set([w.player.mesh, ...[w.peds, w.traffic, w.parked, w.cops].flat().map(v => v.mesh)]);
    const blocks = [];
    for (const o of w.scene.children) {
      if (moving.has(o) || !o.visible || (!o.isMesh && !o.isGroup)) continue;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3()), p = box.getCenter(new THREE.Vector3());
      if (box.min.y > 3 || box.max.y < .5 || size.y < .5 || size.x > 60 || size.z > 60 || Math.abs(p.x) > 85 || Math.abs(p.z) > 85) continue;
      if (w.city.roadXs.some(x => box.max.x > x - 7 && box.min.x < x + 7) ||
          w.city.roadZs.some(z => box.max.z > z - 7 && box.min.z < z + 7))
        blocks.push({ name: o.name, type: o.geometry?.type, color: o.material?.color?.getHexString(), center: p, size });
    }
    return { siteCount: w.city.activitySites.length, invalidSites: w.city.activitySites.filter(s => overlapsRoad(w.city, s.x, s.z, s.radius)), blocks };
  })));
} finally { await browser.close(); }

import * as THREE from 'three';
import { blockStart, BLOCK } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// SAFEHOUSES: buy-once hideouts dotted around the map. Owning one gives you a
// save point on the doorstep, a free spot to stash a car, and a small daily
// rent cheque you collect on foot. Distinct from economy.js properties (those
// are pure passive-income businesses) — safehouses are about respawn/save
// convenience. Save/load through world.safehouses.owned (a set of keys);
// respawn() calls nearestSafehouseDoor() to pick the drop point.

const HOUSES = [
  { key: 'harborflat', name: 'HARBOR FLAT',     price: 12000, rent: 220, block: [1, 8], off: [-14, 10] },
  { key: 'hillsvilla',  name: 'HILLSIDE VILLA',  price: 28000, rent: 480, block: [8, 1], off: [12, -12] },
  { key: 'downtownloft', name: 'DOWNTOWN LOFT',  price: 20000, rent: 360, block: [5, 5], off: [0, 16] },
  { key: 'garagepad',   name: 'GARAGE PAD',      price: 9000,  rent: 150, block: [3, 2], off: [10, 8] },
];

function houseMesh(scene, pos, def) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x394655, metalness: 0.1, roughness: 0.85 })
  );
  body.position.y = 2;
  body.castShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.4, 6.6),
    new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.9 })
  );
  roof.position.y = 4.2;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 2.4),
    new THREE.MeshBasicMaterial({ color: 0x11151a })
  );
  door.position.set(0, 1.2, 3.02);
  group.add(door);

  // "for sale" / owned marker ring at the doorstep
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 0.4, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.set(0, 0.4, 5);
  group.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.2, 34, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.set(0, 17, 5);
  group.add(beam);

  group.position.copy(pos);
  scene.add(group);
  return { group, ring, beam };
}

export function initSafehouses(scene, world, save) {
  const owned = new Set(save.safehouses || []);
  const rentDay = save.safehouseRentDay ?? -1;

  const list = [];
  for (const def of HOUSES) {
    const pos = new THREE.Vector3(
      blockStart(def.block[0]) + BLOCK / 2 + (def.off?.[0] || 0),
      0,
      blockStart(def.block[1]) + BLOCK / 2 + (def.off?.[1] || 0)
    );
    const { group, ring, beam } = houseMesh(scene, pos, def);
    // the doorstep — where the ring sits, where the player respawns
    const door = pos.clone().add(new THREE.Vector3(0, 0, 5));
    list.push({ def, pos, door, group, ring, beam });
  }

  world.safehouses = { list, owned, rentDay, nearest: null };
  refreshBeams(world);
}

function refreshBeams(world) {
  for (const h of world.safehouses.list) {
    const own = world.safehouses.owned.has(h.def.key);
    h.beam.visible = !own;
    h.ring.material.color.set(own ? 0x7cf78c : 0x5ad1ff);
  }
}

// Call from respawn() to send the player to their nearest owned safehouse
// instead of the map spawn. Pass the position to measure from (e.g. where the
// player died). Returns a Vector3 or null.
export function nearestSafehouseDoor(world, from) {
  const sh = world.safehouses;
  if (!sh) return null;
  const p = from || world.player.pos;
  let best = null, bestD = Infinity;
  for (const h of sh.list) {
    if (!sh.owned.has(h.def.key)) continue;
    const d = Math.hypot(p.x - h.door.x, p.z - h.door.z);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best ? best.door.clone() : null;
}

export function updateSafehouses(world, dt, pressed) {
  const sh = world.safehouses;
  if (!sh) return;
  world.safehouseHint = null;

  const player = world.player;
  const onFoot = !player.inCar && !player.inHeli && player.pos.y < 2.5;

  for (const h of sh.list) {
    h.ring.rotation.y += dt;
  }
  if (!onFoot) return;

  // find the doorstep we're standing on
  let here = null;
  for (const h of sh.list) {
    if (Math.hypot(player.pos.x - h.door.x, player.pos.z - h.door.z) < 3) { here = h; break; }
  }
  if (!here) return;

  const owned = sh.owned.has(here.def.key);

  if (!owned) {
    world.safehouseHint = `${here.def.name} — press <b>E</b> to buy ($${here.def.price.toLocaleString()})`;
    if (pressed['KeyE']) {
      if (world.money < here.def.price) { showToast('Not enough cash for that safehouse'); return; }
      world.money -= here.def.price;
      sh.owned.add(here.def.key);
      refreshBeams(world);
      sfxMissionPass();
      showMissionMsg('SAFEHOUSE BOUGHT', here.def.name, '#7cf78c');
      showNews('a new safehouse changes hands on the city register');
      world.onSave?.();
    }
    return;
  }

  // owned: offer to save, and hand over a day's pooled rent if it's a new day
  const rentDue = sh.rentDay !== world.dailyDay;
  const totalRent = HOUSES
    .filter((d) => sh.owned.has(d.key))
    .reduce((s, d) => s + d.rent, 0);

  world.safehouseHint = rentDue
    ? `${here.def.name} — press <b>E</b> to save & collect rent ($${totalRent})`
    : `${here.def.name} — press <b>E</b> to save`;

  if (pressed['KeyE']) {
    if (rentDue) {
      world.money += totalRent;
      sh.rentDay = world.dailyDay;
      sfxPickup();
      showToast(`RENT COLLECTED — +$${totalRent}`);
    }
    world.onSave?.();
    sfxMissionPass();
    showToast('GAME SAVED');
  }
}

import { makeVehicle, physStep } from './car.js';
import { roadCenter, N } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';
import { addCrime } from './police.js';
import { addChaos } from './economy.js';

// The armored truck: every few minutes a Gruppe-6-style cash transporter
// rolls onto the streets. It's slow but takes a beating — wreck it and the
// doors burst open: a lump sum plus a ring of cash cubes around the wreck.

const CASH = 1000;

export function initArmored(world) {
  world.armored = {
    truck: null,
    t: 75 + Math.random() * 90, // first one shows up early to teach the mechanic
    goal: { x: 0, z: 0 },
    retargetT: 0,
    farT: 0,
  };
}

function spawnTruck(world) {
  const a = world.armored;
  const p = world.player.inCar ? world.player.inCar.pos : world.player.pos;
  let x = roadCenter(0), z = roadCenter(0);
  for (let i = 0; i < 30; i++) {
    x = roadCenter((Math.random() * (N + 1)) | 0);
    z = roadCenter((Math.random() * (N + 1)) | 0);
    if (Math.hypot(x - p.x, z - p.z) > 140) break;
  }
  a.truck = makeVehicle(world.scene, x, z, Math.random() * Math.PI * 2, '#7d8391', {
    health: 400, accel: 8, top: 17, rad: 2.0,
  });
  a.truck.mesh.scale.set(1.15, 1.3, 1.15); // boxier, meaner
  world.traffic.push(a.truck); // shootable + rammable like any car
  a.retargetT = 0;
  a.farT = 0;
  showToast('💰 ARMORED TRUCK on the streets — wreck it for the cash');
  showNews('an armored cash transporter begins its route');
}

function pickRoute(world) {
  const a = world.armored;
  a.goal.x = roadCenter((Math.random() * (N + 1)) | 0);
  a.goal.z = roadCenter((Math.random() * (N + 1)) | 0);
  a.retargetT = 7;
}

function burstOpen(world) {
  const a = world.armored;
  const t = a.truck;
  world.money += CASH;
  addCrime(world, 2);
  addChaos(world, 30);
  sfxMissionPass();
  showToast(`ARMORED TRUCK DOWN +$${CASH} — grab the spilled cash!`);
  showNews('cash rains over the street after an armored truck heist');

  // the doors blow open: relocate money cubes into a ring around the wreck
  let moved = 0;
  for (const pk of world.pickups) {
    if (pk.type !== 'money' || moved >= 6) continue;
    const ang = (moved / 6) * Math.PI * 2;
    pk.mesh.position.set(t.pos.x + Math.sin(ang) * 4, 1.0, t.pos.z + Math.cos(ang) * 4);
    moved++;
  }
  a.truck = null; // the wreck stays in traffic like any other burnt-out car
  a.t = 200 + Math.random() * 200;
  world.onSave?.();
}

export function updateArmored(world, dt) {
  const a = world.armored;
  world.truckBlip = null;
  if (!a) return;

  if (!a.truck) {
    a.t -= dt;
    if (a.t <= 0) { spawnTruck(world); pickRoute(world); }
    return;
  }

  const t = a.truck;
  if (t.dead) { burstOpen(world); return; }

  // if the player got in (or the truck got carjacked out of traffic), the
  // guards bail and the route is over — no payout, just a very tough ride
  if (world.player.inCar === t || !world.traffic.includes(t)) {
    showToast('The guards bail — the cash was already dropped off');
    a.truck = null;
    a.t = 200 + Math.random() * 200;
    return;
  }

  a.retargetT -= dt;
  if (a.retargetT <= 0 || Math.hypot(a.goal.x - t.pos.x, a.goal.z - t.pos.z) < 16) pickRoute(world);
  let err = Math.atan2(a.goal.x - t.pos.x, a.goal.z - t.pos.z) - t.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  physStep(t, {
    steer: Math.max(-1, Math.min(1, err * 2.0)),
    throttle: 1,
    handbrake: false,
  }, dt, world.city.colliders);

  world.truckBlip = { x: t.pos.x, z: t.pos.z };

  // nobody hunted it — it finishes the route and leaves
  const p = world.player.inCar ? world.player.inCar.pos : world.player.pos;
  a.farT = Math.hypot(t.pos.x - p.x, t.pos.z - p.z) > 250 ? a.farT + dt : 0;
  if (a.farT > 90) {
    world.scene.remove(t.mesh);
    const ti = world.traffic.indexOf(t);
    if (ti >= 0) world.traffic.splice(ti, 1);
    a.truck = null;
    a.t = 200 + Math.random() * 200;
    showNews('the armored transporter completes its route untouched');
  }
}

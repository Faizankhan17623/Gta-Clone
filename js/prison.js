import * as THREE from 'three';
import { HALF } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxShot, sfxMissionPass } from './sound.js';
import { addCrime } from './police.js';
import { addTracer, addFlash } from './effects.js';
import { makeBoat } from './water.js';

// Harbor Island Penitentiary: get busted at three stars or worse and you
// don't respawn on your corner — you wake up in the island yard, minus a
// fine. Escape however you like: steal the prison launch, swim for it,
// web over the wall... or sit tight until your crew sends a boat.

const ISLAND = new THREE.Vector3(HALF + 170, 0, -120);
const TOP = 1.4;            // yard floor height
const FINE = 500;
const CREW_BOAT_AT = 75;    // seconds until the crew shows up
const GUARD_GRACE = 8;      // seconds before the guards start caring

function slab(scene, colliders, x, y, z, w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  if (colliders) colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: y + h / 2 + 0.3 });
  return m;
}

function makeGuard(world, x, z, axis) {
  const ch = createCharacter({ shirt: '#2a3548', pants: '#1a2230', skin: '#c98e63' });
  world.scene.add(ch.group);
  ch.group.position.set(x, TOP, z);
  ch.group.userData.baseY = TOP; // walk bob anchors to the yard, not the sea
  return { ch, mesh: ch.group, pos: ch.group.position, axis, dir: 1, animT: 0, shootT: 1 };
}

export function initPrison(scene, world) {
  const cols = world.city.colliders;
  const { x, z } = ISLAND;

  // the island slab
  slab(scene, cols, x, TOP / 2, z, 44, TOP, 32, 0x6a6e74);
  // perimeter walls — a gap on the west side is the dock gate
  slab(scene, cols, x, TOP + 2.2, z - 16, 44, 4.4, 1, 0x565a62);          // north
  slab(scene, cols, x, TOP + 2.2, z + 16, 44, 4.4, 1, 0x565a62);          // south
  slab(scene, cols, x + 22, TOP + 2.2, z, 1, 4.4, 32, 0x565a62);          // east
  slab(scene, cols, x - 22, TOP + 2.2, z - 10, 1, 4.4, 12, 0x565a62);     // west (upper)
  slab(scene, cols, x - 22, TOP + 2.2, z + 10, 1, 4.4, 12, 0x565a62);     // west (lower) — gap between
  // cell block
  slab(scene, cols, x + 12, TOP + 2.6, z - 6, 14, 5.2, 12, 0x4a4038);
  // watchtower with an all-night lamp
  slab(scene, cols, x - 12, TOP + 4, z + 9, 2, 8, 2, 0x3a3f48);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd070 })
  );
  lamp.position.set(x - 12, TOP + 8.6, z + 9);
  scene.add(lamp);
  // dock walkway out the west gate + the prison launch
  slab(scene, cols, x - 27, TOP / 2, z, 10, TOP, 6, 0x585048);
  const launch = makeBoat(scene, x - 36, z, -Math.PI / 2, 'speed', '#4a5058');
  world.boats.push(launch);

  world.prison = {
    pending: false,
    inside: false,
    jailT: 0,
    crewBoat: null,
    guards: [makeGuard(world, x - 4, z + 4, 'z'), makeGuard(world, x + 4, z + 12, 'x')],
    cell: new THREE.Vector3(x + 12, TOP, z + 2),
  };
}

// Called from respawn(): true = the player wakes up in the yard instead.
export function prisonIntake(world) {
  const pr = world.prison;
  if (!pr) return false;
  if (!pr.pending) {
    pr.inside = false; // died or restarted — whatever it was, you're out
    return false;
  }
  pr.pending = false;
  // Saul Bettercall meets you at the precinct door (lawyer.js) —
  // one retainer, one walk
  if (world.lawyerRetained) {
    world.lawyerRetained = false;
    showMissionMsg('CASE DISMISSED', '"Chain of custody. Don\'t ask. You owe me nothing — you PAID me."', '#b08af0');
    showNews('charges evaporate; a lawyer in a loud suit bills by the miracle');
    world.onSave?.();
    return false;
  }
  pr.inside = true;
  pr.jailT = 0;
  pr.crewArrived = false;
  const fine = Math.min(FINE, world.money);
  world.money -= fine;
  world.player.pos.copy(pr.cell);
  showMissionMsg('HARBOR ISLAND PENITENTIARY', `Processed and fined $${fine}. Now: how do you feel about swimming?`, '#8fd0ff');
  showNews('a familiar face is booked into the island pen before sunrise');
  return true;
}

const _pv = new THREE.Vector3();

export function updatePrison(world, dt) {
  const pr = world.prison;
  if (!pr) return;
  const player = world.player;
  if (!pr.inside) world.prisonHint = null;

  // guards only earn their pay when someone is on or near the island
  const nearIsland = Math.hypot(player.pos.x - ISLAND.x, player.pos.z - ISLAND.z) < 130;
  if (nearIsland) {
    for (const g of pr.guards) {
      // pace the yard
      const speed = 1.6;
      if (g.axis === 'z') {
        g.pos.z += g.dir * speed * dt;
        if (Math.abs(g.pos.z - ISLAND.z) > 12) g.dir *= -1;
        g.mesh.rotation.y = g.dir > 0 ? 0 : Math.PI;
      } else {
        g.pos.x += g.dir * speed * dt;
        if (Math.abs(g.pos.x - ISLAND.x) > 16) g.dir *= -1;
        g.mesh.rotation.y = g.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      g.animT += dt * 4;
      animateWalk(g.ch, g.animT, 0.45);

      // once the grace period ends they shoot anyone loose in the yard
      if (pr.inside && pr.jailT > GUARD_GRACE) {
        const d = g.pos.distanceTo(player.pos);
        const breaking = player.pos.distanceTo(pr.cell) > 10; // out of your corner
        g.shootT -= dt;
        if (breaking && d < 26 && g.shootT <= 0 && !player.inBoat) {
          g.shootT = 1.7 + Math.random() * 0.8;
          g.mesh.rotation.y = Math.atan2(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
          sfxShot('pistol');
          const aim = player.pos.clone();
          aim.y += 1.1 + (Math.random() - 0.5) * 0.9;
          addTracer(g.pos.clone().setY(TOP + 1.4), aim);
          addFlash(aim, 0xffd080, 0.2);
          if (Math.random() < 0.35 && !(player.dodgeT > 0)) player.health -= 6;
        }
      }
    }
  }

  if (!pr.inside) return;

  pr.jailT += dt;
  world.prisonHint = pr.jailT < GUARD_GRACE
    ? 'PRISON — the launch is at the west dock. The guards haven\'t noticed you yet.'
    : pr.crewArrived
      ? 'PRISON — your crew\'s boat is at the dock. <b>GO GO GO</b>'
      : `PRISON — swim, steal the launch, or wait for your crew (${Math.max(0, Math.ceil(CREW_BOAT_AT - pr.jailT))}s)`;

  // the crew keeps its promises
  if (!pr.crewArrived && pr.jailT >= CREW_BOAT_AT) {
    pr.crewArrived = true;
    pr.crewBoat = makeBoat(world.scene, ISLAND.x - 36, ISLAND.z + 8, -Math.PI / 2, 'speed', '#b23434');
    world.boats.push(pr.crewBoat);
    sfxMissionPass();
    showToast('YOUR CREW CAME THROUGH — red boat at the dock');
    showNews('an unregistered speedboat idles off the prison island, radio silent');
  }

  // free: anything that puts real water between you and the walls
  _pv.set(player.pos.x - ISLAND.x, 0, player.pos.z - ISLAND.z);
  if (_pv.length() > 60) {
    pr.inside = false;
    world.prisonHint = null;
    addCrime(world, 2);
    if (world.stats) world.stats.jailbreaks = (world.stats.jailbreaks || 0) + 1;
    sfxMissionPass();
    showMissionMsg('JAILBREAK', 'Nobody has ever escaped Harbor Island. Until tonight.', '#ffd24a');
    showNews('sirens across the bay — a prisoner is loose and the pen is furious');
    world.onSave?.();
  }
}

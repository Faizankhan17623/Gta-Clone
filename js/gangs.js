import * as THREE from 'three';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { blockStart, BLOCK, N, resolveCircle } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { addTracer, addFlash } from './effects.js';
import { sfxShot, sfxMissionPass } from './sound.js';

// Gang territory: the north-east corner district belongs to the Vipers.
// Walk in and they open fire. Put down ten of them to seize the turf —
// it stops being hostile and pays protection money forever after.

const MEMBERS = 10;
const KILLS_TO_OWN = 10;

const _v = new THREE.Vector3();

function randomZonePoint(zone) {
  return {
    x: zone.x0 + 4 + Math.random() * (zone.x1 - zone.x0 - 8),
    z: zone.z0 + 4 + Math.random() * (zone.z1 - zone.z0 - 8),
  };
}

export function initGang(scene, world, saved) {
  // two blocks in the NE corner
  const zone = {
    x0: blockStart(N - 2),
    x1: blockStart(N - 1) + BLOCK,
    z0: blockStart(0),
    z1: blockStart(0) + BLOCK,
  };

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(zone.x1 - zone.x0, zone.z1 - zone.z0),
    new THREE.MeshBasicMaterial({ color: 0xc03030, transparent: true, opacity: 0.09, depthWrite: false })
  );
  quad.rotation.x = -Math.PI / 2;
  quad.position.set((zone.x0 + zone.x1) / 2, 0.3, (zone.z0 + zone.z1) / 2);
  scene.add(quad);

  const members = [];
  for (let i = 0; i < MEMBERS; i++) {
    const ch = createCharacter({ shirt: '#a02020', pants: '#181f28', skin: '#c98e63' });
    scene.add(ch.group);
    const p = randomZonePoint(zone);
    ch.group.position.set(p.x, 0, p.z);
    members.push({
      ch,
      mesh: ch.group,
      pos: ch.group.position,
      heading: Math.random() * Math.PI * 2,
      animT: Math.random() * 5,
      dead: false,
      deadT: 0,
      shootT: 1 + Math.random() * 2,
      tgt: randomZonePoint(zone),
    });
  }

  const gang = {
    zone,
    quad,
    members,
    owned: !!saved?.owned,
    kills: saved?.kills | 0,
    incomeT: 0,
  };
  if (gang.owned) {
    quad.material.color.set(0x2faf4e);
    for (const m of members) m.mesh.visible = false;
  }
  world.gang = gang;
  world.gangPeds = members; // exposed so player bullets/rockets can hit them
  return gang;
}

export function killGangMember(world, m) {
  if (m.dead) return;
  const gang = world.gang;
  m.dead = true;
  m.deadT = 0;
  m.mesh.rotation.z = Math.PI / 2;
  m.mesh.position.y = 0.25;
  if (gang.owned) return;
  gang.kills++;
  if (gang.kills >= KILLS_TO_OWN) {
    gang.owned = true;
    gang.quad.material.color.set(0x2faf4e);
    world.money += 700;
    sfxMissionPass();
    showMissionMsg('TERRITORY SEIZED!', '+$700 · the district pays you now', '#7cf78c');
    world.onSave?.();
  } else {
    showToast(`VIPERS DOWN: ${gang.kills}/${KILLS_TO_OWN}`);
  }
}

export function updateGang(world, dt) {
  const gang = world.gang;
  const player = world.player;

  // owned: quiet district, protection money ticks in
  if (gang.owned) {
    gang.incomeT += dt;
    if (gang.incomeT > 60) {
      gang.incomeT = 0;
      world.money += 40;
      showToast('TERRITORY INCOME +$40');
    }
    return;
  }

  const focus = player.inCar ? player.inCar.pos : player.pos;
  const inZone =
    focus.x > gang.zone.x0 - 20 && focus.x < gang.zone.x1 + 20 &&
    focus.z > gang.zone.z0 - 20 && focus.z < gang.zone.z1 + 20;

  for (const m of gang.members) {
    if (m.dead) {
      m.deadT += dt;
      if (m.deadT > 25) { // reinforcements arrive, but the kill count stands
        m.dead = false;
        m.mesh.rotation.z = 0;
        m.mesh.position.y = 0;
        const p = randomZonePoint(gang.zone);
        m.pos.set(p.x, 0, p.z);
      }
      continue;
    }

    // webbed up: can't move or shoot
    if (m.webT > 0) {
      m.webT -= dt;
      if (m.webT <= 0 && m.webWrap) m.webWrap.visible = false;
      continue;
    }

    const dToPlayer = Math.hypot(focus.x - m.pos.x, focus.z - m.pos.z);

    if (inZone && dToPlayer < 34 && !player.inHeli) {
      // face the intruder and shoot
      m.heading = Math.atan2(focus.x - m.pos.x, focus.z - m.pos.z);
      m.mesh.rotation.y = m.heading;
      m.ch.rArm.rotation.x = -Math.PI / 2; // aiming
      animateIdle(m.ch);
      m.ch.rArm.rotation.x = -Math.PI / 2;
      m.shootT -= dt;
      if (m.shootT <= 0) {
        m.shootT = 1.4 + Math.random() * 0.8;
        const from = m.pos.clone();
        from.y = 1.4;
        const aim = focus.clone();
        aim.y = focus.y + 1.2 + (Math.random() - 0.5);
        aim.x += (Math.random() - 0.5) * 3;
        aim.z += (Math.random() - 0.5) * 3;
        addTracer(from, aim);
        addFlash(aim, 0xffd080, 0.25);
        sfxShot('pistol');
        if (Math.random() < 0.5 && dToPlayer < 30) {
          if (player.inCar) player.inCar.health -= 5;
          else player.health -= 5;
        }
      }
    } else {
      // patrol the turf
      _v.set(m.tgt.x - m.pos.x, 0, m.tgt.z - m.pos.z);
      const d = _v.length();
      if (d < 1) {
        m.tgt = randomZonePoint(gang.zone);
      } else {
        _v.normalize();
        m.heading = Math.atan2(_v.x, _v.z);
        m.pos.addScaledVector(_v, 1.5 * dt);
        resolveCircle(m.pos, 0.4, world.city.colliders);
      }
      m.animT += dt * 3.4;
      animateWalk(m.ch, m.animT, 0.5);
      m.mesh.rotation.y = m.heading;
    }
  }
}

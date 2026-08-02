import * as THREE from 'three';
import { blockStart, BLOCK, N, resolveCircle } from './city.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { makeVehicle, physStep } from './car.js';
import { addTracer, addFlash, addExplosion } from './effects.js';
import { sfxShot, sfxMissionPass } from './sound.js';

// ============================================================================
// GANG WARFARE SYSTEM: Multiple gangs compete for territory control
// Features: Territory ownership, gang relationships, turf wars, reputation
// ============================================================================

const GANGS_CONFIG = [
  {
    key: 'vipers',
    name: 'VIPERS',
    color: 0xc03030,
    strength: 5,
    startingTerritories: [{ bi: N - 2, bj: 0 }, { bi: N - 1, bj: 0 }],
    description: 'Street-level gang, strong in the northeast district',
  },
  {
    key: 'triads',
    name: 'TRIADS',
    color: 0x1a4d7a,
    strength: 6,
    startingTerritories: [{ bi: 0, bj: N - 2 }, { bi: 0, bj: N - 1 }],
    description: 'Organized crime syndicate, controls the harbor',
  },
  {
    key: 'cartel',
    name: 'CARTEL',
    color: 0x8b4513,
    strength: 7,
    startingTerritories: [{ bi: N - 2, bj: N - 2 }, { bi: N - 1, bj: N - 1 }],
    description: 'Drug trafficking empire, most ruthless faction',
  },
  {
    key: 'bikers',
    name: 'BIKERS',
    color: 0xff6b00,
    strength: 4,
    startingTerritories: [{ bi: 2, bj: 2 }, { bi: 3, bj: 3 }],
    description: 'Motorcycle club, smaller but tight-knit crew',
  },
  {
    key: 'player',
    name: 'YOUR CREW',
    color: 0x2faf4e,
    strength: 0,
    startingTerritories: [],
    description: 'Your emerging criminal empire',
  },
];

// Territory zones mapped to city blocks
export function createTerritoryZone(bi, bj) {
  return {
    blockI: bi,
    blockJ: bj,
    x0: blockStart(bi),
    x1: blockStart(bi) + BLOCK,
    z0: blockStart(bj),
    z1: blockStart(bj) + BLOCK,
    centerX: blockStart(bi) + BLOCK / 2,
    centerZ: blockStart(bj) + BLOCK / 2,
  };
}

export function initGangWars(scene, world, saved) {
  const gangs = new Map();
  const territories = [];
  const relationships = new Map(); // gang_key -> { [other_gang]: reputation -100 to +100 }

  // Initialize gangs
  GANGS_CONFIG.forEach((config) => {
    const gang = {
      key: config.key,
      name: config.name,
      color: config.color,
      strength: config.strength,
      description: config.description,
      territories: [],
      members: [],
      reputation: 0, // player's standing with this gang
      income: 0,
      incomeT: 0,
      controlled_businesses: [],
      active_wars: [],
      relationships: {},
    };

    // Set up starter territories
    config.startingTerritories.forEach((pos) => {
      const zone = createTerritoryZone(pos.bi, pos.bj);
      zone.owner = config.key;
      gang.territories.push(zone);
      territories.push(zone);

      // Visualize territory ownership
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.x1 - zone.x0, zone.z1 - zone.z0),
        new THREE.MeshBasicMaterial({
          color: config.color,
          transparent: true,
          opacity: 0.06,
          depthWrite: false,
        })
      );
      quad.rotation.x = -Math.PI / 2;
      quad.position.set(zone.centerX, 0.2, zone.centerZ);
      zone.quad = quad;
      scene.add(quad);
    });

    gangs.set(config.key, gang);
  });

  // Initialize relationships
  gangs.forEach((gang) => {
    gang.relationships = {};
    gangs.forEach((other) => {
      if (gang.key !== other.key) {
        // Random initial relationships: -30 to +30
        gang.relationships[other.key] = Math.random() * 60 - 30;
      }
    });
  });

  const gangWarsState = {
    gangs,
    territories,
    relationships,
    warEvents: [], // [{ attacker, defender, zone, active, timer }]
    playerGang: gangs.get('player'),
    gangRespect: 0, // player's overall reputation (0-100)
    lastTurfWar: 0,
  };

  world.gangWars = gangWarsState;
  world.gangMembers = []; // All hostile gang members in the world
  return gangWarsState;
}

// ============================================================================
// TERRITORY CONTROL: Add/remove zones from player control
// ============================================================================

export function claimTerritory(world, zone) {
  const playerGang = world.gangWars.playerGang;
  const previousOwner = zone.owner;

  if (previousOwner === 'player') {
    showToast('ALREADY OWNED');
    return false;
  }

  // Remove from previous owner
  if (previousOwner && previousOwner !== 'neutral') {
    const prevGang = world.gangWars.gangs.get(previousOwner);
    const idx = prevGang.territories.findIndex((z) => z === zone);
    if (idx >= 0) prevGang.territories.splice(idx, 1);
  }

  // Add to player
  zone.owner = 'player';
  zone.quad.material.color.set(playerGang.color);
  playerGang.territories.push(zone);

  // Notify other gangs
  world.gangWars.gangs.forEach((gang) => {
    if (gang.key !== 'player') {
      gang.relationships['player'] -= 15; // They lose respect for you
    }
  });

  showMissionMsg('TERRITORY SEIZED!', `+${zone.blockI},${zone.blockJ} now under your control`, '#7cf78c');
  showNews('Your crew takes over a new district');
  world.gangRespect = (world.gangRespect || 0) + 10;
  world.onSave?.();
  return true;
}

export function loseTerritory(world, zone, newOwner = 'neutral') {
  const playerGang = world.gangWars.playerGang;
  const idx = playerGang.territories.findIndex((z) => z === zone);
  if (idx >= 0) playerGang.territories.splice(idx, 1);

  zone.owner = newOwner;
  zone.quad.material.color.set(
    newOwner === 'neutral'
      ? 0x555555
      : world.gangWars.gangs.get(newOwner).color
  );

  world.gangRespect = Math.max(0, (world.gangRespect || 0) - 15);
  showNews('Your crew lost control of a district');
}

// ============================================================================
// TERRITORY INCOME: Passive money from controlled zones
// ============================================================================

export function updateTerritoryIncome(world, dt) {
  const playerGang = world.gangWars.playerGang;
  const baseIncomePerZone = 50; // $ per minute per zone

  playerGang.incomeT += dt;
  if (playerGang.incomeT >= 60) {
    playerGang.incomeT = 0;
    const income = playerGang.territories.length * baseIncomePerZone;
    world.money += income;
    if (income > 0) {
      showToast(`TERRITORY INCOME +$${income}`);
    }
  }
}

// ============================================================================
// GANG REPUTATION: Player standing with each gang
// ============================================================================

export function modifyGangReputation(world, gangKey, amount) {
  const gang = world.gangWars.gangs.get(gangKey);
  if (!gang) return;

  gang.reputation = Math.max(-100, Math.min(100, gang.reputation + amount));

  if (gang.reputation < -50) {
    showToast(`${gang.name} HOSTILE`);
  } else if (gang.reputation > 50) {
    showToast(`${gang.name} FRIENDLY`);
  }
}

// ============================================================================
// GANG STRENGTH: Dynamic calculation based on territories & minions
// ============================================================================

export function calculateGangStrength(gang, minionCount = 0) {
  const territoryBonus = gang.territories.length * 2;
  return gang.strength + territoryBonus + minionCount * 0.5;
}

// ============================================================================
// TURF WAR: Initiate automatic conflicts between gangs
// ============================================================================

export function startTurfWar(world, attacker, defender, zone) {
  const war = {
    attacker,
    defender,
    zone,
    active: true,
    timer: 180, // 3 minutes
    spawned: 0,
    attackerForce: [],
    defenderForce: [],
  };

  world.gangWars.warEvents.push(war);
  showNews(`TURF WAR: ${attacker.name} vs ${defender.name} in district ${zone.blockI},${zone.blockJ}`);
  return war;
}

export function updateTurfWars(world, dt, scene) {
  const warEvents = world.gangWars.warEvents;

  for (let i = warEvents.length - 1; i >= 0; i--) {
    const war = warEvents[i];
    war.timer -= dt;

    // Spawn reinforcements
    if (war.spawned < 10 && Math.random() < 0.02) {
      spawnWarParticipant(world, war, war.attacker);
      war.spawned++;
    }

    // War ends
    if (war.timer <= 0) {
      endTurfWar(world, war);
      warEvents.splice(i, 1);
    }
  }
}

function spawnWarParticipant(world, war, gang) {
  const zone = war.zone;
  const x = zone.centerX + (Math.random() - 0.5) * 20;
  const z = zone.centerZ + (Math.random() - 0.5) * 20;

  const ch = createCharacter({
    shirt: `#${gang.color.toString(16).padStart(6, '0')}`,
    pants: '#181f28',
    skin: '#c98e63',
  });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);

  const member = {
    ch,
    mesh: ch.group,
    pos: ch.group.position,
    heading: Math.random() * Math.PI * 2,
    animT: 0,
    health: 50,
    dead: false,
    gang,
    shootT: 1 + Math.random(),
  };

  if (gang === war.attacker) {
    war.attackerForce.push(member);
  } else {
    war.defenderForce.push(member);
  }

  world.gangMembers.push(member);
}

function endTurfWar(world, war) {
  // Count survivors
  const attackerAlive = war.attackerForce.filter((m) => !m.dead).length;
  const defenderAlive = war.defenderForce.filter((m) => !m.dead).length;

  if (attackerAlive > defenderAlive && war.defender.key === 'player') {
    loseTerritory(world, war.zone, war.attacker.key);
    showMissionMsg('TERRITORY LOST!', `${war.attacker.name} took over`, '#c0392b');
  } else if (defenderAlive > attackerAlive && war.defender.key === 'player') {
    showToast('DEFENDED YOUR TURF!');
  }

  // Clean up war members
  war.attackerForce.forEach((m) => {
    world.scene.remove(m.mesh);
    const idx = world.gangMembers.indexOf(m);
    if (idx >= 0) world.gangMembers.splice(idx, 1);
  });
  war.defenderForce.forEach((m) => {
    world.scene.remove(m.mesh);
    const idx = world.gangMembers.indexOf(m);
    if (idx >= 0) world.gangMembers.splice(idx, 1);
  });
}

// ============================================================================
// GANG MEMBER COMBAT: Update hostile gang members in the world
// ============================================================================

export function updateGangMembers(world, dt) {
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;

  for (let i = world.gangMembers.length - 1; i >= 0; i--) {
    const member = world.gangMembers[i];

    if (member.dead) {
      member.deadT = (member.deadT || 0) + dt;
      if (member.deadT > 15) {
        world.scene.remove(member.mesh);
        world.gangMembers.splice(i, 1);
      }
      continue;
    }

    const d = Math.hypot(focus.x - member.pos.x, focus.z - member.pos.z);

    if (d < 35 && member.gang.key !== 'player') {
      // Aggro on player
      member.heading = Math.atan2(focus.x - member.pos.x, focus.z - member.pos.z);
      member.mesh.rotation.y = member.heading;
      animateWalk(member.ch, member.animT, 0.7);
      member.animT += dt * 5;

      // Shoot at player
      member.shootT -= dt;
      if (member.shootT <= 0 && d < 30) {
        member.shootT = 1.2 + Math.random() * 0.5;
        const from = member.pos.clone();
        from.y = 1.4;
        const aim = focus.clone();
        aim.y += 1 + (Math.random() - 0.5);
        addTracer(from, aim);
        addFlash(aim, 0xffd080, 0.25);
        sfxShot('pistol');

        if (Math.random() < 0.4) {
          if (player.inCar) {
            player.inCar.health -= 5;
          } else if (!player.dodgeT) {
            player.health -= 6;
          }
        }
      }

      // Move toward player
      const moveDir = new THREE.Vector3(
        Math.sin(member.heading),
        0,
        Math.cos(member.heading)
      );
      member.pos.addScaledVector(moveDir, 2.5 * dt);
      resolveCircle(member.pos, 0.4, world.city.colliders);
    }
  }
}

// ============================================================================
// KILL GANG MEMBER: Award XP and respect
// ============================================================================

export function killGangMember(world, member) {
  if (member.dead) return;
  member.dead = true;
  member.deadT = 0;
  member.mesh.rotation.z = Math.PI / 2;
  member.mesh.position.y = 0.25;

  // Lose reputation with their gang, gain with rivals
  modifyGangReputation(world, member.gang.key, -5);
  world.gangWars.gangs.forEach((g) => {
    if (g.key !== member.gang.key && g.key !== 'player') {
      modifyGangReputation(world, g.key, 2);
    }
  });

  showToast('GANG MEMBER DOWN');
}

export default { initGangWars, claimTerritory, updateTerritoryIncome, updateGangMembers };

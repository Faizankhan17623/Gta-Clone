import * as THREE from 'three';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { addTracer, addFlash } from './effects.js';
import { sfxShot, sfxMissionPass } from './sound.js';
import { resolveCircle } from './city.js';

// ============================================================================
// MINION SYSTEM: Recruit, level up, and deploy goons to your crew
// Features: Roles, leveling, stat progression, loyalty, deployment
// ============================================================================

const MINION_ROLES = [
  {
    key: 'enforcer',
    name: 'ENFORCER',
    description: 'Heavy hitter. High damage, strong melee.',
    salary: 150,
    baseCombat: 12,
    baseHealth: 120,
    color: { shirt: '#8a1a1a', pants: '#0d0d0d', skin: '#c98e63' },
    specialAbility: 'Heavy Punch - Double damage in melee combat',
  },
  {
    key: 'hustler',
    name: 'HUSTLER',
    description: 'Smooth talker. Extracts money from businesses.',
    salary: 100,
    baseCombat: 6,
    baseHealth: 80,
    color: { shirt: '#2a3a55', pants: '#1a1a1a', skin: '#d9a06e' },
    specialAbility: 'Intimidate - Forces business owners to pay up',
  },
  {
    key: 'sentinel',
    name: 'SENTINEL',
    description: 'Territory guardian. Patrols and defends turf.',
    salary: 120,
    baseCombat: 10,
    baseHealth: 110,
    color: { shirt: '#1c2026', pants: '#0d0d0d', skin: '#b8935e' },
    specialAbility: 'Garrison - Holds territory from multiple attackers',
  },
  {
    key: 'spy',
    name: 'SPY',
    description: 'Intel gatherer. Scout enemy gangs.',
    salary: 130,
    baseCombat: 5,
    baseHealth: 70,
    color: { shirt: '#1a1a2e', pants: '#16213e', skin: '#a68b5f' },
    specialAbility: 'Reconnaissance - Reveals enemy gang positions',
  },
  {
    key: 'hitman',
    name: 'HITMAN',
    description: 'Professional killer. Eliminates high-value targets.',
    salary: 250,
    baseCombat: 15,
    baseHealth: 100,
    color: { shirt: '#0a0a0a', pants: '#1a1a1a', skin: '#8b7355' },
    specialAbility: 'Assassination - One-shot kill on unaware targets',
  },
];

export function initMinions(scene, world, saved) {
  world.minions = [];
  world.minionStats = {
    totalKills: 0,
    totalMissionsCompleted: 0,
    averageLevel: 1,
  };

  // Load saved minions
  if (saved && saved.minions) {
    saved.minions.forEach((data) => {
      const minion = createMinion(scene, data, world);
      world.minions.push(minion);
    });
  }

  world.minionRoles = MINION_ROLES;
  world.minionDeploy = new Set(); // Currently deployed minions
  world.minionIncome = 0;
  return world.minions;
}

export function createMinion(scene, data, world) {
  const roleConfig = MINION_ROLES.find((r) => r.key === data.role) || MINION_ROLES[0];

  const ch = createCharacter(roleConfig.color);
  scene.add(ch.group);

  const minion = {
    id: data.id || Math.random(),
    name: data.name || generateMinionName(),
    role: data.role || 'enforcer',
    roleConfig,
    level: data.level || 1,
    xp: data.xp || 0,
    xpToLevel: 200,
    
    // Combat stats
    health: roleConfig.baseHealth,
    maxHealth: roleConfig.baseHealth,
    combat: data.combat || roleConfig.baseCombat,
    intimidation: data.intimidation || 8,
    stealth: data.stealth || 5,
    loyalty: data.loyalty || 60,
    
    // Gameplay
    salary: roleConfig.salary,
    missionCount: data.missionCount || 0,
    kills: data.kills || 0,
    
    // Visual
    mesh: ch.group,
    ch,
    pos: ch.group.position,
    heading: 0,
    animT: 0,
    
    // State
    alive: true,
    dead: false,
    deployed: false,
    location: 'safehouse',
    orders: null,
    currentMission: null,
    
    // Equipped gear
    gear: data.gear || {
      weapon: 'pistol',
      armor: 'none',
      upgrades: [],
    },
  };

  minion.pos.set(0, -100, 0); // Hidden initially
  return minion;
}

function generateMinionName() {
  const firstNames = [
    'Tony', 'Vince', 'Marco', 'Dom', 'Sal', 'Frankie', 'Bruno', 'Carlo',
    'Nino', 'Rocco', 'Vinny', 'Gino', 'Angelo', 'Paulie', 'Spike', 'Jacks',
  ];
  const lastNames = [
    'Giancana', 'Corleone', 'Marcano', 'Blanco', 'Dimitrescu', 'Kusama',
    'Torrio', 'Capone', 'Luciano', 'Gotti', 'Dion', 'Costa',
  ];
  return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

// ============================================================================
// RECRUITMENT: Hire minions from the roster
// ============================================================================

export function recruitMinion(world, roleKey, customName = null) {
  if (world.money < 500) {
    showToast('NOT ENOUGH CASH TO RECRUIT');
    return null;
  }

  const roleConfig = MINION_ROLES.find((r) => r.key === roleKey);
  if (!roleConfig) return null;

  world.money -= 500; // Recruitment cost
  const minion = createMinion(world.scene, { role: roleKey }, world);
  if (customName) minion.name = customName;

  world.minions.push(minion);
  showMissionMsg('NEW RECRUIT', `${minion.name} (${roleConfig.name}) joined your crew`, '#4ad2ff');
  sfxMissionPass();
  return minion;
}

// ============================================================================
// LEVELING SYSTEM: Minions gain XP from missions and kills
// ============================================================================

export function addMinionXP(minion, amount) {
  minion.xp += amount;

  while (minion.xp >= minion.xpToLevel) {
    minion.xp -= minion.xpToLevel;
    levelUpMinion(minion);
  }
}

export function levelUpMinion(minion) {
  minion.level++;
  minion.xpToLevel = Math.ceil(200 * Math.pow(1.15, minion.level));
  
  // Stat improvements
  minion.maxHealth += 10 + minion.level;
  minion.health = minion.maxHealth;
  minion.combat += 2 + (Math.random() > 0.5 ? 1 : 0);
  minion.intimidation += 1 + (Math.random() > 0.6 ? 1 : 0);
  minion.stealth += 0.5 + (Math.random() > 0.7 ? 0.5 : 0);
  minion.loyalty += 5;
  minion.salary = Math.ceil(minion.salary * 1.1); // Salary increase

  showToast(`${minion.name} LEVEL UP → ${minion.level}`);
}

// ============================================================================
// DEPLOYMENT: Send minions on missions or patrol
// ============================================================================

export function deployMinion(world, minion, mission) {
  if (!minion.alive) {
    showToast(`${minion.name} is dead!`);
    return false;
  }
  if (minion.deployed) {
    showToast(`${minion.name} already deployed`);
    return false;
  }

  minion.deployed = true;
  minion.location = 'deployed';
  minion.currentMission = mission;
  world.minionDeploy.add(minion);

  showToast(`${minion.name} deployed on ${mission.type.toUpperCase()} mission`);
  return true;
}

export function recallMinion(minion) {
  if (!minion.deployed) return false;
  minion.deployed = false;
  minion.location = 'safehouse';
  minion.currentMission = null;
  return true;
}

// ============================================================================
// MINION COMBAT: Deployed minions engage in combat
// ============================================================================

export function updateDeployedMinions(world, dt) {
  const player = world.player;

  for (const minion of world.minionDeploy) {
    if (!minion.alive) continue;

    const mission = minion.currentMission;
    if (!mission) continue;

    // Find enemies to fight
    const enemies = [];
    world.gangMembers.forEach((gm) => {
      if (gm.gang.key !== 'player' && !gm.dead) {
        enemies.push(gm);
      }
    });

    if (enemies.length > 0) {
      const target = enemies[0]; // Target nearest
      const d = Math.hypot(target.pos.x - minion.pos.x, target.pos.z - minion.pos.z);

      if (d < 50) {
        // Move toward target
        if (d > 2) {
          minion.heading = Math.atan2(target.pos.x - minion.pos.x, target.pos.z - minion.pos.z);
          const moveDir = new THREE.Vector3(Math.sin(minion.heading), 0, Math.cos(minion.heading));
          minion.pos.addScaledVector(moveDir, 3 * dt);
          resolveCircle(minion.pos, 0.4, world.city.colliders);
          minion.animT += dt * 6;
          animateWalk(minion.ch, minion.animT, 0.7);
        }

        // Attack target
        minion.shootT = (minion.shootT || 0) - dt;
        if (minion.shootT <= 0 && d < 30) {
          minion.shootT = 1.2 - minion.combat * 0.02; // Better combat = faster shots
          const from = minion.pos.clone();
          from.y = 1.4;
          const aim = target.pos.clone();
          aim.y += 1;
          addTracer(from, aim);
          addFlash(aim, 0xffd080, 0.25);
          sfxShot('pistol');

          // Deal damage
          const damage = minion.combat * 0.8 + Math.random() * 3;
          target.health -= damage;
          if (target.health <= 0) {
            target.dead = true;
            minion.kills++;
            addMinionXP(minion, 50);
          }
        }

        minion.mesh.rotation.y = minion.heading;
      }
    } else {
      // No enemies, patrol
      animateIdle(minion.ch);
    }
  }
}

// ============================================================================
// PAYROLL: Minions cost money each day
// ============================================================================

export function updateMinionPayroll(world, dt) {
  // Pay minions once per game day (1 real minute = 1 game hour)
  if (!world.minionPayT) world.minionPayT = 0;
  world.minionPayT += dt;

  if (world.minionPayT >= 60) {
    world.minionPayT = 0;

    let totalPayroll = 0;
    world.minions.forEach((minion) => {
      if (minion.alive) {
        totalPayroll += minion.salary;
      }
    });

    if (totalPayroll > 0) {
      if (world.money >= totalPayroll) {
        world.money -= totalPayroll;
        world.minions.forEach((minion) => {
          if (minion.alive) {
            minion.loyalty = Math.min(100, minion.loyalty + 2); // Happy minions
          }
        });
        showToast(`MINION PAYROLL -$${totalPayroll}`);
      } else {
        // Can't pay minions - they get unhappy
        world.minions.forEach((minion) => {
          minion.loyalty = Math.max(0, minion.loyalty - 10);
          if (minion.loyalty < 20 && Math.random() < 0.1) {
            minion.alive = false;
            showNews(`${minion.name} left the crew (unpaid)`);
          }
        });
        showToast('CANT PAY MINIONS! Loyalty dropping!');
      }
    }
  }
}

// ============================================================================
// MINION HQ / MANAGEMENT: Interact with minions in safehouse
// ============================================================================

export function openMinionMenu(world) {
  // Called from hud.js to show minion roster
  const menu = {
    minions: world.minions,
    totalSalary: world.minions.reduce((sum, m) => sum + (m.alive ? m.salary : 0), 0),
    totalLevel: world.minions.reduce((sum, m) => sum + m.level, 0),
    averageLevel: world.minions.length > 0 
      ? Math.floor(world.minions.reduce((sum, m) => sum + m.level, 0) / world.minions.length)
      : 0,
  };
  return menu;
}

// ============================================================================
// MINION STATS DISPLAY
// ============================================================================

export function getMinionStatus(minion) {
  const xpPercent = Math.floor((minion.xp / minion.xpToLevel) * 100);
  return {
    name: minion.name,
    role: minion.roleConfig.name,
    level: minion.level,
    xp: `${minion.xp}/${minion.xpToLevel} (${xpPercent}%)`,
    health: `${minion.health}/${minion.maxHealth}`,
    combat: minion.combat,
    intimidation: minion.intimidation,
    stealth: minion.stealth,
    loyalty: minion.loyalty,
    kills: minion.kills,
    missions: minion.missionCount,
    deployed: minion.deployed,
    alive: minion.alive,
  };
}

// ============================================================================
// MINION DEATH / RETIREMENT
// ============================================================================

export function killMinion(world, minion) {
  if (!minion.alive) return;
  minion.alive = false;
  minion.deployed = false;
  world.minionDeploy.delete(minion);
  showNews(`${minion.name} was killed in action`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initMinions,
  recruitMinion,
  deployMinion,
  recallMinion,
  addMinionXP,
  levelUpMinion,
  updateDeployedMinions,
  updateMinionPayroll,
  openMinionMenu,
  getMinionStatus,
  killMinion,
  MINION_ROLES,
};

import * as THREE from 'three';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { addFlash, addExplosion } from './effects.js';
import { sfxMissionPass } from './sound.js';

// ============================================================================
// EXTORTION SYSTEM: Racketeering, protection money, and intimidation
// Features: Target businesses, collect protection money, risk rival interference
// ============================================================================

const EXTORTABLE_BUSINESSES = [
  {
    key: 'pizzeria',
    name: 'VINNY\'S PIZZERIA',
    type: 'restaurant',
    location: { x: 15, z: 25 },
    baseDemand: 300,
    weeklyPayment: 50,
    owner: 'Vinny',
  },
  {
    key: 'laundromat',
    name: 'CLEAN SLATE LAUNDROMAT',
    type: 'laundry',
    location: { x: -20, z: 30 },
    baseDemand: 250,
    weeklyPayment: 40,
    owner: 'Ralph',
  },
  {
    key: 'pawnshop',
    name: 'LUCKY PAWN',
    type: 'retail',
    location: { x: 35, z: -10 },
    baseDemand: 400,
    weeklyPayment: 60,
    owner: 'Frankie',
  },
  {
    key: 'bar',
    name: 'WHISKEY JACKET',
    type: 'bar',
    location: { x: -30, z: -25 },
    baseDemand: 350,
    weeklyPayment: 55,
    owner: 'Tony',
  },
  {
    key: 'casino',
    name: 'LUCKY 7 CASINO',
    type: 'casino',
    location: { x: 40, z: 40 },
    baseDemand: 1000,
    weeklyPayment: 200,
    owner: 'The House',
  },
  {
    key: 'nightclub',
    name: 'VELVET NIGHTS',
    type: 'nightclub',
    location: { x: -40, z: 35 },
    baseDemand: 500,
    weeklyPayment: 80,
    owner: 'Marco',
  },
];

export function initExtortion(world, saved) {
  world.extortions = [];
  world.extortionTargets = EXTORTABLE_BUSINESSES.map((b) => ({
    ...b,
    status: 'untouched', // untouched | threatened | complying | hostile
    compliance: 0,
    demandAmount: b.baseDemand,
    weeklyIncome: 0,
    lastPayment: 0,
    intimidationMissions: 0,
    rivalInterference: 0,
  }));

  // Load saved extortion data
  if (saved && saved.extortions) {
    saved.extortions.forEach((data) => {
      const target = world.extortionTargets.find((t) => t.key === data.key);
      if (target) {
        target.status = data.status;
        target.compliance = data.compliance;
        target.demandAmount = data.demandAmount;
        target.weeklyIncome = data.weeklyIncome;
      }
    });
  }

  return world.extortionTargets;
}

// ============================================================================
// INITIATE EXTORTION: Threaten a business
// ============================================================================

export function initiateExtortion(world, businessKey) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target) return null;

  if (target.status !== 'untouched') {
    showToast('ALREADY EXTORTING THIS BUSINESS');
    return target;
  }

  target.status = 'threatened';
  target.compliance = 0;

  showMissionMsg('EXTORTION INITIATED', `Demand $${target.demandAmount} from ${target.owner}`, '#c0392b');
  showNews(`Your crew starts shaking down ${target.name}`);

  // Generate intimidation mission to gain compliance
  const mission = {
    type: 'intimidation',
    target: businessKey,
    objective: `Intimidate ${target.owner} to pay up`,
    reward: 200,
    complianceGain: 20,
  };

  world.onSave?.();
  return target;
}

// ============================================================================
// COMPLIANCE: Increase business owner's willingness to pay
// ============================================================================

export function increaseCompliance(world, businessKey, amount) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target) return;

  target.compliance = Math.min(100, target.compliance + amount);

  if (target.compliance >= 100 && target.status === 'threatened') {
    target.status = 'complying';
    target.weeklyIncome = target.weeklyPayment;
    showToast(`${target.owner} CAVED IN`);
    showMissionMsg('EXTORTION SUCCESS', `${target.name} now pays $${target.weeklyPayment}/week`, '#7cf78c');
  }
}

// ============================================================================
// COLLECT PAYMENTS: Get weekly money from complying businesses
// ============================================================================

export function updateExtortionIncome(world, dt) {
  if (!world.extortionPayT) world.extortionPayT = 0;
  world.extortionPayT += dt;

  // Pay once per game day
  if (world.extortionPayT >= 60) {
    world.extortionPayT = 0;

    let totalIncome = 0;
    world.extortionTargets.forEach((target) => {
      if (target.status === 'complying' && target.compliance >= 80) {
        // Random chance of rival gang interference
        if (Math.random() < 0.15) {
          target.rivalInterference++;
          if (target.rivalInterference >= 3) {
            target.status = 'hostile';
            target.compliance = 0;
            showToast(`${target.name} TAKEN OVER BY RIVAL GANG`);
            showNews(`A rival gang muscled in on your extortion racket`);
          }
          return; // No payment this week
        }

        const payment = target.weeklyIncome;
        world.money += payment;
        totalIncome += payment;
        target.lastPayment = world.time;
      }
    });

    if (totalIncome > 0) {
      showToast(`EXTORTION INCOME +$${totalIncome}`);
    }
  }
}

// ============================================================================
// INTIMIDATION MISSIONS: Force compliance through threats
// ============================================================================

export function generateIntimidationMission(world, businessKey) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target) return null;

  const missionTypes = [
    {
      name: 'SHAKE DOWN THE OWNER',
      description: `Find ${target.owner} and make threats`,
      reward: 150,
      complianceGain: 15,
      difficulty: 'easy',
    },
    {
      name: 'DESTROY PROPERTY',
      description: `Wreck ${target.name} to show you\'re serious`,
      reward: 200,
      complianceGain: 25,
      difficulty: 'medium',
    },
    {
      name: 'ASSAULT STAFF',
      description: `Beat up employees to send a message`,
      reward: 250,
      complianceGain: 35,
      difficulty: 'hard',
    },
    {
      name: 'KIDNAP & INTERROGATE',
      description: `Grab ${target.owner} and force him to see reason`,
      reward: 400,
      complianceGain: 50,
      difficulty: 'very hard',
    },
  ];

  const missionType = missionTypes[Math.floor(Math.random() * missionTypes.length)];

  return {
    type: 'intimidation',
    businessKey,
    businessName: target.name,
    owner: target.owner,
    name: missionType.name,
    description: missionType.description,
    reward: missionType.reward,
    complianceGain: missionType.complianceGain,
    difficulty: missionType.difficulty,
    active: true,
    timer: 300, // 5 minutes
  };
}

// ============================================================================
// COMPLETE INTIMIDATION MISSION
// ============================================================================

export function completeIntimidationMission(world, mission) {
  const target = world.extortionTargets.find((t) => t.key === mission.businessKey);
  if (!target) return false;

  increaseCompliance(world, mission.businessKey, mission.complianceGain);
  world.money += mission.reward;
  target.intimidationMissions++;

  showMissionMsg('INTIMIDATION SUCCESS', `${target.owner} increased compliance`, '#7cf78c');
  showNews(`Protection racket at ${target.name} advanced`);

  world.onSave?.();
  return true;
}

// ============================================================================
// RIVAL GANG TAKEOVER: Lose extortion racket to competitors
// ============================================================================

export function rivalTakeoverExtortion(world, businessKey) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target) return;

  if (target.status === 'complying') {
    target.status = 'hostile';
    target.compliance = 0;
    target.weeklyIncome = 0;
    target.rivalInterference = 0;

    showMissionMsg('EXTORTION LOST!', `Rival gang took over ${target.name}`, '#c0392b');
    showNews(`Your extortion racket at ${target.name} was stolen by rivals`);
  }
}

// ============================================================================
// DEFEND EXTORTION RACKET: Mission to hold territory against rivals
// ============================================================================

export function generateDefenseExtortionMission(world, businessKey) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target || target.status !== 'complying') return null;

  return {
    type: 'extortion_defense',
    businessKey,
    businessName: target.name,
    name: 'DEFEND PROTECTION RACKET',
    description: `A rival gang is trying to muscle in on ${target.name}. Drive them off.`,
    reward: 300,
    repGain: 20,
    active: true,
    timer: 240,
    enemy_wave: 1,
    enemies_spawned: 0,
  };
}

// ============================================================================
// ESCALATE EXTORTION: Increase demands over time
// ============================================================================

export function escalateExtortionDemands(world, businessKey) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target || target.status !== 'complying') return;

  const oldDemand = target.demandAmount;
  target.demandAmount = Math.ceil(target.demandAmount * 1.3);
  target.weeklyPayment = Math.ceil(target.weeklyPayment * 1.2);
  target.compliance = Math.max(0, target.compliance - 20); // Owner gets unhappy

  showToast(`Increased protection money at ${target.name}`);
  showNews(`You raised the extortion demands at ${target.name}`);
}

// ============================================================================
// EXTORTION STATS
// ============================================================================

export function getExtortionStats(world) {
  const stats = {
    active: 0,
    complying: 0,
    total: world.extortionTargets.length,
    weeklyIncome: 0,
    riskLevel: 0,
  };

  world.extortionTargets.forEach((target) => {
    if (target.status === 'threatened') stats.active++;
    if (target.status === 'complying') {
      stats.complying++;
      stats.weeklyIncome += target.weeklyPayment;
    }
    if (target.rivalInterference > 0) stats.riskLevel++;
  });

  return stats;
}

// ============================================================================
// RETIREMENT: Stop extorting a business
// ============================================================================

export function stopExtortion(world, businessKey) {
  const target = world.extortionTargets.find((t) => t.key === businessKey);
  if (!target) return;

  target.status = 'untouched';
  target.compliance = 0;
  target.weeklyIncome = 0;
  target.demandAmount = target.baseDemand;
  target.rivalInterference = 0;

  showToast(`Stopped extorting ${target.name}`);
}

export default {
  initExtortion,
  initiateExtortion,
  increaseCompliance,
  updateExtortionIncome,
  generateIntimidationMission,
  completeIntimidationMission,
  rivalTakeoverExtortion,
  generateDefenseExtortionMission,
  escalateExtortionDemands,
  getExtortionStats,
  stopExtortion,
  EXTORTABLE_BUSINESSES,
};

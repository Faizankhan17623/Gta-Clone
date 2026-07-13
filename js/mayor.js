import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';

// City Hall: the crown got you respect — now get power. Win the office
// (crown + reputation + a very legal $20,000 campaign donation) and the
// policy desk is yours: how hard the police push, how thick the traffic
// runs, how loose the Lucky 7 pays. Plus a salary, obviously. This city
// pays its criminals best when they're elected.

const CAMPAIGN_COST = 20000;
const REP_NEEDED = 2000;
const SALARY = 800;

const POLICE_STANCES = [
  { name: 'CHILL', heat: 0.5, extra: 0 },     // heat fades twice as fast
  { name: 'NORMAL', heat: 1, extra: 0 },
  { name: 'MARTIAL', heat: 1.8, extra: 1 },   // more cops, stubborn stars
];
const TRAFFIC_MODES = [
  { name: 'CALM', flow: 0.6 },
  { name: 'NORMAL', flow: 1 },
  { name: 'GRIDLOCK', flow: 1.5 },
];
const CASINO_MODES = [
  { name: 'HOUSE RULES', odds: 0 },  // jackpots nearly never
  { name: 'NORMAL', odds: 1 },
  { name: 'LOOSE SLOTS', odds: 2 },  // the city eats the losses
];

export function initMayor(scene, world, save) {
  // a columned facade on the plaza south of spawn
  let hallPos = world.city.spawn.clone().add(new THREE.Vector3(0, 0, -30));
  const probe = new THREE.Vector3(hallPos.x, 1, hallPos.z);
  if (pointBlocked(probe, world.city.colliders, 2)) hallPos = world.city.spawn.clone().add(new THREE.Vector3(-30, 0, 0));

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.6, 5),
    new THREE.MeshLambertMaterial({ color: 0x8a8778 })
  );
  base.position.copy(hallPos).setY(0.3);
  scene.add(base);
  for (const dx of [-3, -1, 1, 3]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.36, 4.2, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c0 })
    );
    col.position.set(hallPos.x + dx, 2.6, hallPos.z - 1.6);
    col.castShadow = true;
    scene.add(col);
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.7, 3),
    new THREE.MeshLambertMaterial({ color: 0x8a8778 })
  );
  roof.position.copy(hallPos).add(new THREE.Vector3(0, 4.9, -1.6));
  scene.add(roof);
  const c = document.createElement('canvas');
  c.width = 192; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#6a6656'; g.fillRect(0, 0, 192, 40);
  g.fillStyle = '#f2eeda'; g.font = 'bold 20px Georgia'; g.textAlign = 'center';
  g.fillText('CITY HALL', 96, 27);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.05), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.copy(hallPos).add(new THREE.Vector3(0, 4.2, 0.05));
  scene.add(sign);

  world.policy = { police: 1, traffic: 1, casino: 1, ...(save?.policy || {}) };
  world.mayor = {
    hallPos,
    elected: !!save?.mayor,
    salaryDay: save?.salaryDay ?? -1,
  };
}

// numbers the rest of the game reads
export function policeHeat(world) { return POLICE_STANCES[world.policy?.police ?? 1].heat; }
export function policeExtra(world) { return POLICE_STANCES[world.policy?.police ?? 1].extra; }
export function trafficFlow(world) { return TRAFFIC_MODES[world.policy?.traffic ?? 1].flow; }
export function casinoOdds(world) { return CASINO_MODES[world.policy?.casino ?? 1].odds; }

export function updateMayor(world, dt, pressed) {
  const m = world.mayor;
  if (!m) return;
  const player = world.player;
  world.mayorHint = null;
  const d = Math.hypot(player.pos.x - m.hallPos.x, player.pos.z - m.hallPos.z);
  if (d > 5 || player.inCar || player.inHeli) return;

  if (!m.elected) {
    if (!world.crowned) {
      world.mayorHint = 'CITY HALL — "come back when you\'re somebody" (be crowned King first)';
      return;
    }
    if ((world.rep | 0) < REP_NEEDED) {
      world.mayorHint = `CITY HALL — the King needs ${REP_NEEDED} reputation to run (you: ${world.rep | 0})`;
      return;
    }
    world.mayorHint = `Press <b>E</b> to RUN FOR MAYOR — $${CAMPAIGN_COST} campaign, landslide guaranteed`;
    if (pressed['KeyE']) {
      if (world.money < CAMPAIGN_COST) { showToast('The campaign chest is light'); return; }
      world.money -= CAMPAIGN_COST;
      m.elected = true;
      world.fwT = 4; // fireworks, naturally
      if (world.stats) world.stats.mayor = 1;
      sfxMissionPass();
      showMissionMsg('🏛 MAYOR OF THE CITY', 'Elected in a landslide. Turnout: suspicious. Mandate: absolute.', '#ffd24a');
      showNews('the new mayor\'s first act: declaring the election "extremely legitimate"');
      world.onSave?.();
    }
    return;
  }

  // the policy desk
  world.nearKiosk = true;
  const p = world.policy;
  const salaryReady = m.salaryDay !== world.dailyDay;
  world.mayorHint = 'POLICY DESK — ' +
    `<b>1</b> Police: ${POLICE_STANCES[p.police].name} · ` +
    `<b>2</b> Traffic: ${TRAFFIC_MODES[p.traffic].name} · ` +
    `<b>3</b> Casino: ${CASINO_MODES[p.casino].name} · ` +
    `<b>4</b> Salary ${salaryReady ? `$${SALARY}` : '✔ paid'}`;

  if (pressed['Digit1']) {
    p.police = (p.police + 1) % POLICE_STANCES.length;
    sfxPickup();
    showToast(`POLICE STANCE: ${POLICE_STANCES[p.police].name}`);
    showNews(p.police === 0 ? 'the mayor slashes the police budget; the police send a fruit basket'
      : p.police === 2 ? 'martial policing announced — downtown grumbles, criminals sweat'
        : 'police funding returns to normal, whatever that means');
    world.onSave?.();
  }
  if (pressed['Digit2']) {
    p.traffic = (p.traffic + 1) % TRAFFIC_MODES.length;
    sfxPickup();
    showToast(`TRAFFIC POLICY: ${TRAFFIC_MODES[p.traffic].name}`);
    world.onSave?.();
  }
  if (pressed['Digit3']) {
    p.casino = (p.casino + 1) % CASINO_MODES.length;
    sfxPickup();
    showToast(`CASINO REGULATION: ${CASINO_MODES[p.casino].name}`);
    showNews(p.casino === 2 ? 'the Lucky 7 ordered to "loosen up" — economists faint' :
      p.casino === 0 ? 'casino odds tightened; the house sends the mayor flowers' :
        'gambling regulation returns to baseline');
    world.onSave?.();
  }
  if (pressed['Digit4'] && salaryReady) {
    m.salaryDay = world.dailyDay;
    world.money += SALARY;
    sfxMissionPass();
    showToast(`MAYORAL SALARY +$${SALARY} — public service is its own reward, plus this`);
    world.onSave?.();
  }
}

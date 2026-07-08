import * as THREE from 'three';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup, sfxMissionFail } from './sound.js';

// The city lottery: a garish kiosk near the casino sells one $100 ticket a
// day. Numbers are drawn at midnight. Almost certainly a waste of money,
// which is the authentic lottery experience.

const TICKET = 100;

export function initLottery(scene, world, save) {
  const pos = world.city.spawn.clone().add(new THREE.Vector3(12, 0, 22));
  const booth = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 2.4, 1.8),
    new THREE.MeshLambertMaterial({ color: 0xd04a9a })
  );
  booth.position.copy(pos).setY(1.2);
  booth.castShadow = true;
  scene.add(booth);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#2a0a20'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#ffd24a'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★ LOTTO ★', 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.copy(pos).setY(2.7);
  scene.add(sign);

  world.lottery = { pos, ticketDay: save.lottoDay ?? -1, prevDay: world.dailyDay };
}

export function updateLottery(world, dt, pressed) {
  const lo = world.lottery;
  const player = world.player;
  world.lottoHint = null;

  // midnight draw: if yesterday's ticket exists, roll it
  if (world.dailyDay !== lo.prevDay) {
    if (lo.ticketDay === lo.prevDay) {
      const r = Math.random();
      if (r < 0.004) {
        world.money += 25000;
        sfxMissionPass();
        showMissionMsg('🎉 LOTTO JACKPOT!', '+$25,000 — the kiosk owner weeps', '#ffd24a');
        showNews('local web-slinger wins the city lottery, officials suspicious');
        if (world.stats) world.stats.jackpots++;
      } else if (r < 0.05) {
        world.money += 1500;
        sfxPickup();
        showToast('LOTTO: 4 numbers! +$1500');
      } else if (r < 0.2) {
        world.money += 300;
        sfxPickup();
        showToast('LOTTO: 3 numbers +$300');
      } else {
        sfxMissionFail();
        showToast('LOTTO: nothing. As predicted by mathematics');
      }
      world.onSave?.();
    }
    lo.prevDay = world.dailyDay;
  }

  const d = Math.hypot(player.pos.x - lo.pos.x, player.pos.z - lo.pos.z);
  if (d < 3.2 && !player.inCar && !player.inHeli) {
    if (lo.ticketDay === world.dailyDay) {
      world.lottoHint = 'LOTTO — ticket bought, draw at midnight 🤞';
    } else {
      world.lottoHint = `Press <b>E</b> for a LOTTO ticket — $${TICKET} (jackpot $25,000, drawn at midnight)`;
      if (pressed['KeyE']) {
        if (world.money < TICKET) { showToast('Not enough cash'); return; }
        world.money -= TICKET;
        lo.ticketDay = world.dailyDay;
        sfxPickup();
        showToast('Ticket bought — see you at midnight');
        world.onSave?.();
      }
    }
  }
}

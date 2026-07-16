import * as THREE from 'three';
import { showToast } from './hud.js';
import { sfxHorn } from './sound.js';

// DRIVER'S TOUCHES: a real two-tone horn (N) that makes nearby traffic
// flinch, cruise control (O) that holds your speed hands-off, and a
// speedometer that lives in the corner while you drive.

const _away = new THREE.Vector3();

export function initVehicleFx(world) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:18px;bottom:64px;font:700 22px/1 monospace;' +
    'color:#9fe8ff;text-shadow:0 1px 4px #000;display:none;z-index:30;pointer-events:none';
  document.body.appendChild(el);
  world.vehiclefx = { speedo: el, hornCd: 0 };
}

export function updateVehicleFx(world, dt, pressed) {
  const fx = world.vehiclefx;
  if (!fx) return;
  const player = world.player;
  const car = player.inCar;
  fx.hornCd = Math.max(0, fx.hornCd - dt);

  if (!car) {
    if (fx.speedo.style.display !== 'none') fx.speedo.style.display = 'none';
    world.cruise = 0;
    return;
  }

  // speedometer
  const kmh = Math.round(car.vel.length() * 3.6);
  fx.speedo.style.display = 'block';
  fx.speedo.textContent = `${kmh} km/h${world.cruise ? ' · CRUISE' : ''}`;

  // horn: traffic within earshot flinches out of the way
  if (pressed['KeyN'] && fx.hornCd <= 0) {
    fx.hornCd = 0.7;
    sfxHorn();
    for (const v of world.traffic || []) {
      if (v.dead || v === car) continue;
      const dx = v.pos.x - car.pos.x, dz = v.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1 && d < 12) {
        _away.set(dx / d, 0, dz / d);
        v.vel.addScaledVector(_away, 5);
      }
    }
  }

  // cruise control: O locks the current speed until you touch the pedals
  if (pressed['KeyO']) {
    if (world.cruise) {
      world.cruise = 0;
      showToast('CRUISE OFF');
    } else if (car.vel.length() > 6) {
      world.cruise = car.vel.length();
      showToast(`CRUISE ${Math.round(world.cruise * 3.6)} km/h — pedals cancel`);
    } else {
      showToast('Too slow for cruise control');
    }
  }
}

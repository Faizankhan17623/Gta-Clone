import * as THREE from 'three';
import { sfx } from './audio.js';
import { hitMarker } from './effects.js';
import { WEAPONS, freshLoadout } from './weapons.js';

export function createShooting({ camera, scene, weapon, effects, enemies, hud, onKill, onHit, sendShot }) {
  let loadout = freshLoadout();
  let selected = 'pistol', reloading = false, fireTimer = 0, firing = false;
  let damageMultiplier = 1, infiniteAmmoUntil = 0;
  const raycaster = new THREE.Raycaster(); raycaster.far = 250;
  const muzzle = new THREE.Vector3();
  const spec = () => WEAPONS[selected];
  function refresh() { const a=loadout[selected]; hud.setWeapon(spec().name,a.ammo,a.reserve,spec().magazine); weapon.setColor?.(spec().color); }
  function select(id) { if(!loadout[id]?.unlocked||reloading)return false; selected=id;refresh();return true; }
  function unlock(id) { if(!loadout[id])return false;loadout[id].unlocked=true;select(id);hud.toast(`${WEAPONS[id].name} unlocked`,'good');return true; }
  function addAmmo(amount=30){Object.values(loadout).forEach(a=>{if(a.unlocked)a.reserve+=amount;});refresh();return true;}
  function reload(){const a=loadout[selected],w=spec();if(reloading||a.ammo===w.magazine||a.reserve<=0)return;reloading=true;sfx.reload();hud.setReloading(true);setTimeout(()=>{const take=Math.min(w.magazine-a.ammo,a.reserve);a.ammo+=take;a.reserve-=take;reloading=false;refresh();},w.reload*1000);}
  function tryFire(){
    const a=loadout[selected],w=spec(); if(reloading||fireTimer>0)return;
    if(a.ammo<=0){sfx.empty();reload();return;} if(performance.now()>infiniteAmmoUntil)a.ammo--;
    fireTimer=w.interval;refresh();sfx.shoot();weapon.kick();
    const origin=camera.getWorldPosition(new THREE.Vector3()),base=camera.getWorldDirection(new THREE.Vector3());
    sendShot?.({origin,dir:base,fireTime:Date.now(),weapon:selected}); let anyHit=false;
    for(let pellet=0;pellet<w.pellets;pellet++){
      const dir=base.clone();dir.x+=(Math.random()-.5)*w.spread;dir.y+=(Math.random()-.5)*w.spread;dir.z+=(Math.random()-.5)*w.spread;dir.normalize();raycaster.set(origin,dir);
      const eh=raycaster.intersectObjects(enemies.list,true),oh=raycaster.intersectObjects(scene.userData.obstacles,false);let point=null,target=null,barrel=null;
      if(eh.length){point=eh[0].point;let o=eh[0].object;while(o&&!o.userData.enemy)o=o.parent;target=o;}
      if(oh.length&&(!point||oh[0].distance<eh[0].distance)){point=oh[0].point;target=null;barrel=oh[0].object.userData.explosive&&!oh[0].object.userData.spent?oh[0].object:null;}
      const end=point||origin.clone().add(dir.multiplyScalar(250));weapon.getMuzzleWorld(muzzle);effects.spawnTracer(muzzle,end);if(point)effects.spawnImpact(end);
      if(target){const result=enemies.damage(target,w.damage*damageMultiplier,point);anyHit=true;onHit?.(result.headshot);if(result.killed)onKill?.(result.headshot,target.userData.enemy.type);}
      if(barrel){barrel.userData.spent=true;barrel.material.color.setHex(0x292929);effects.spawnImpact(barrel.position.clone());for(const foe of [...enemies.list]){if(foe.position.distanceTo(barrel.position)<6){const result=enemies.damage(foe,120,foe.position);if(result.killed)onKill?.(false,foe.userData.enemy.type);}}}
    }
    if(anyHit){hitMarker();sfx.hit();}
  }
  document.addEventListener('mousedown',e=>{if(document.pointerLockElement&&e.button===0){firing=true;tryFire();}});
  document.addEventListener('mouseup',e=>{if(e.button===0)firing=false;});
  document.addEventListener('keydown',e=>{if(e.code==='KeyR')reload();if(/^Digit[1-4]$/.test(e.code))select(['pistol','rifle','shotgun','sniper'][+e.code.slice(-1)-1]);});
  refresh();
  return {update(d){fireTimer=Math.max(0,fireTimer-d);if(firing)tryFire();},reload,select,unlock,addAmmo,
    isUnlocked(id){return !!loadout[id]?.unlocked;},
    attach(id){if(id==='optic')Object.values(WEAPONS).forEach(w=>w.headshot*=1.08);if(id==='mag')Object.values(WEAPONS).forEach(w=>w.magazine+=6);if(id==='grip')Object.values(WEAPONS).forEach(w=>w.spread*=.65);refresh();},
    setDamageMultiplier(v,seconds=0){damageMultiplier=v;if(seconds)setTimeout(()=>damageMultiplier=1,seconds*1000);},setInfiniteAmmo(seconds){infiniteAmmoUntil=performance.now()+seconds*1000;},
    upgrade(kind){const w=spec();if(kind==='damage')w.damage*=1.15;if(kind==='magazine'){w.magazine+=4;loadout[selected].ammo+=4;}if(kind==='reload')w.reload*=.85;refresh();},reset(){loadout=freshLoadout();selected='pistol';reloading=false;refresh();}};
}

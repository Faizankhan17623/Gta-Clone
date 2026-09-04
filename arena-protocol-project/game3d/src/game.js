import { sfx } from './audio.js';

export function createGame({ hud, enemies, player, shooting, pickups }) {
  const state={health:100,maxHealth:100,score:0,wave:0,alive:true,betweenWaves:false,paused:false,shieldUntil:0,difficulty:1};
  let waveToken=0,missions=null,inventory=null,achievements=null,daily=null;
  const spawn=()=>{const e=21,s=Math.floor(Math.random()*4),r=(Math.random()-.5)*2*e;return s===0?[r,-e]:s===1?[r,e]:s===2?[-e,r]:[e,r];};
  function startWave(n){state.wave=n;hud.setWave(n);const boss=n%5===0,count=boss?1:2+n;
    for(let i=0;i<count;i++){const [x,z]=spawn();let type='grunt',ranged=false,health=25+n*6,speed=2+n*.12,damage=8+n*1.5;
      if(boss){type='boss';health=300+n*35;speed=1.45;damage=22;hud.setBoss(health,health,true);}else if(i%5===1){type='runner';speed*=1.75;health*=.65;}else if(i%5===2){type='tank';health*=2.5;speed*=.6;damage*=1.5;}else if(i%5===3){type='ranged';ranged=true;speed*=.75;damage*=.7;}
      enemies.spawn(x,z,{health:health*state.difficulty,speed:speed*(.85+state.difficulty*.15),damage:damage*state.difficulty,type,ranged});}
    state.betweenWaves=false;hud.toast(boss?`BOSS WAVE ${n}`:`WAVE ${n}`,boss?'danger':'info');
  }
  function takeDamage(amount){if(!state.alive||state.paused||performance.now()<state.shieldUntil)return;if(inventory)amount=inventory.absorb(amount);state.health=Math.max(0,state.health-amount);hud.setHealth(state.health,state.maxHealth);hud.damageFlash();sfx.hurt();if(!state.health)die();}
  function heal(amount){state.health=Math.min(state.maxHealth,state.health+amount);hud.setHealth(state.health,state.maxHealth);}
  function die(){state.alive=false;waveToken++;enemies.clear();if(document.pointerLockElement)document.exitPointerLock();saveBest();hud.showGameOver(state.score,state.wave,restart);}
  function saveBest(){const best=Math.max(state.score,Number(localStorage.getItem('arenaBest')||0));localStorage.setItem('arenaBest',best);localStorage.setItem('arenaWave',Math.max(state.wave,Number(localStorage.getItem('arenaWave')||0)));hud.setBest(best);}
  function addScore(points){state.score+=points;hud.setScore(state.score);}
  function spendScore(points){if(state.score<points)return false;state.score-=points;hud.setScore(state.score);return true;}
  function onKill(headshot,type){addScore((type==='boss'?1000:100)+(headshot?50:0));missions?.record('kills');achievements?.record('kills');daily?.record('kills');if(headshot){missions?.record('headshots');achievements?.record('headshots');daily?.record('headshots');}if(type==='boss'){hud.setBoss(0,1,false);missions?.record('bosses');achievements?.record('bosses');}if(Math.random()<.16)grantPowerup();}
  function grantPowerup(){const p=['damage','speed','ammo','shield'][Math.floor(Math.random()*4)];if(p==='damage')shooting.setDamageMultiplier(2,10);if(p==='speed')player.setSpeedMultiplier(1.5,10);if(p==='ammo')shooting.setInfiniteAmmo(10);if(p==='shield')state.shieldUntil=performance.now()+10000;hud.toast(`${p.toUpperCase()} POWER-UP: 10 seconds`,'good');}
  function collect(type){if(type==='health'){if(state.health>=state.maxHealth)return false;state.health=Math.min(state.maxHealth,state.health+35);hud.setHealth(state.health,state.maxHealth);hud.toast('+35 health','good');return true;}if(type==='ammo')return shooting.addAmmo(35);return shooting.unlock(type);}
  function chooseUpgrade(kind){if(kind==='health'){state.maxHealth+=20;state.health=state.maxHealth;}else shooting.upgrade(kind);hud.setHealth(state.health,state.maxHealth);hud.hideUpgrade();player.controls.lock();startWave(state.wave+1);}
  function waveClear(){if(state.betweenWaves||!state.alive||enemies.count)return;state.betweenWaves=true;missions?.record('waves');achievements?.record('waves');daily?.record('waves');saveBest();setTimeout(()=>{if(state.alive){if(document.pointerLockElement)document.exitPointerLock();hud.showUpgrade(chooseUpgrade);}},1200);}
  function restart(){waveToken++;Object.assign(state,{health:100,maxHealth:100,score:0,wave:0,alive:true,betweenWaves:false,paused:false});enemies.clear();shooting.reset();player.resetTo(0,1.7,10);pickups.spawnAll();hud.reset();player.controls.lock();startWave(1);}
  function togglePause(){if(!state.alive)return;state.paused=!state.paused;hud.showPause(state.paused,()=>togglePause(),restart);if(state.paused&&document.pointerLockElement)document.exitPointerLock();else if(!state.paused)player.controls.lock();}
  function update(delta){if(!state.alive||state.paused||!player.controls.isLocked)return;enemies.update(delta,player.object.position,takeDamage);pickups.update(delta,player.object.position,collect);waveClear();const boss=enemies.list.find(e=>e.userData.enemy.type==='boss');if(boss)hud.setBoss(boss.userData.enemy.health,boss.userData.enemy.maxHealth,true);}
  function start(){hud.setBest(Number(localStorage.getItem('arenaBest')||0));pickups.spawnAll();startWave(1);}
  return {state,start,update,restart,onKill,takeDamage,heal,togglePause,collect,addScore,spendScore,setMissions(v){missions=v;},setInventory(v){inventory=v;},setAchievements(v){achievements=v;},setDaily(v){daily=v;},setDifficulty(v){state.difficulty=v;}};
}

const CATALOG=[{id:'rifle',name:'Rifle',price:500},{id:'shotgun',name:'Shotgun',price:900},{id:'sniper',name:'Sniper',price:1500},{id:'ammo',name:'Ammo crate',price:250},{id:'armor',name:'Body armor',price:600}];
export function createShop({hud,game,shooting,controls,inventory}){
  function buy(id){const item=CATALOG.find(v=>v.id===id);if(!item)return;if(!['ammo','armor'].includes(id)&&shooting.isUnlocked(id)){hud.toast('Already owned','info');return;}if(!game.spendScore(item.price)){hud.toast('Not enough score','danger');return;}if(id==='ammo')shooting.addAmmo(45);else if(id==='armor')inventory.addArmor(60);else shooting.unlock(id);hud.toast(`${item.name} purchased`,'good');open();}
  function open(){if(!game.state.alive)return;if(document.pointerLockElement)document.exitPointerLock();hud.showShop(CATALOG,game.state.score,buy,close);}
  function close(){hud.hideModal();controls.lock();}
  document.addEventListener('keydown',e=>{if(e.code==='KeyB'&&game.state.alive)open();});
  return{open,close,buy,catalog:CATALOG};
}

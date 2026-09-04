// Touch controls for phones and tablets.
export function createMobileControls({ player, shooting, grenades, inventory, hud }) {
  if (!window.matchMedia?.('(pointer: coarse)').matches) return { update() {}, active: false };
  const root = document.createElement('div'); root.className = 'touch-controls';
  root.innerHTML = '<div class="touch-stick"><i></i></div><div class="touch-actions"><button data-a="fire">FIRE</button><button data-a="reload">R</button><button data-a="grenade">G</button><button data-a="medkit">MED</button></div>';
  document.body.appendChild(root);
  const stick = root.querySelector('.touch-stick'), knob = stick.querySelector('i');
  const setAxis = (x, y) => { const r=stick.getBoundingClientRect(), dx=x-(r.left+r.width/2), dy=y-(r.top+r.height/2), max=r.width*.38, len=Math.hypot(dx,dy)||1, nx=Math.min(max,len)*dx/len, ny=Math.min(max,len)*dy/len; knob.style.transform=`translate(${nx}px,${ny}px)`; player.setAction('forward',ny < -12); player.setAction('back',ny > 12); player.setAction('left',nx < -12); player.setAction('right',nx > 12); };
  const clear=()=>{knob.style.transform='translate(0,0)'; ['forward','back','left','right'].forEach(k=>player.setAction(k,false));};
  stick.addEventListener('pointerdown',e=>{stick.setPointerCapture(e.pointerId);setAxis(e.clientX,e.clientY);}); stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))setAxis(e.clientX,e.clientY);}); stick.addEventListener('pointerup',clear); stick.addEventListener('pointercancel',clear);
  root.querySelectorAll('button').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault();const a=btn.dataset.a;if(a==='fire')shooting.fire();if(a==='reload')shooting.reload();if(a==='grenade')grenades.throwOne('frag',true);if(a==='medkit')inventory.useMedkit();}));
  player.setMobileActive(true); player.controls.isLocked = true; hud.toast('Touch controls enabled'); return { update() {}, active: true };
}

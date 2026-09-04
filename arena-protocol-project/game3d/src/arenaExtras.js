// Optional online and accessibility layer: lobby/team controls, spectator
// feedback, lightweight replay capture, and reduced-motion/color settings.
export function createArenaExtras({ profile, net, hud, player, game }) {
  const style=document.createElement('style');style.textContent='.arena-lobby{position:fixed;right:18px;bottom:18px;z-index:45;display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #8bd3ff66;border-radius:10px;background:#07131ee8;color:#dff5ff;font:11px monospace}.arena-lobby button{margin:2px;padding:6px;border:1px solid #8bd3ff88;border-radius:5px;background:#102536;color:#dff5ff;font:10px monospace}.reduced-motion *{animation:none!important;transition:none!important}.high-contrast{filter:contrast(1.2)}';document.head.appendChild(style);
  const settings=document.querySelector('.settings');
  const add=(label,control)=>{const l=document.createElement('label');l.append(label,' ',control);settings?.appendChild(l);};
  const reduced=document.createElement('input');reduced.type='checkbox';reduced.checked=!!profile.data.reducedMotion;add('Reduced motion',reduced);
  const contrast=document.createElement('input');contrast.type='checkbox';contrast.checked=!!profile.data.highContrast;add('High contrast',contrast);
  const mode=document.createElement('select');mode.innerHTML='<option value="solo">Solo / Co-op</option><option value="tdm">Team deathmatch</option>';add('Mode',mode);
  const lobby=document.createElement('div');lobby.className='arena-lobby';lobby.innerHTML='<b>ONLINE LOBBY</b><span class="lobby-status">Connecting…</span><div><button data-team="red">RED TEAM</button><button data-team="blue">BLUE TEAM</button><button data-replay>EXPORT REPLAY</button></div>';document.body.appendChild(lobby);
  const status=lobby.querySelector('.lobby-status');
  lobby.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{net.setTeam(b.dataset.team);status.textContent=`Joined ${b.dataset.team.toUpperCase()} team`;hud.toast(status.textContent,'good');});
  const replay=[];lobby.querySelector('[data-replay]').onclick=()=>{const blob=new Blob([JSON.stringify(replay)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='arena-replay.json';a.click();URL.revokeObjectURL(a.href);};
  mode.onchange=()=>hud.toast(mode.value==='tdm'?'Team mode selected':'Solo/co-op selected');reduced.onchange=()=>{profile.set('reducedMotion',reduced.checked);document.body.classList.toggle('reduced-motion',reduced.checked);};contrast.onchange=()=>{profile.set('highContrast',contrast.checked);document.body.classList.toggle('high-contrast',contrast.checked);};
  let elapsed=0;function update(dt){elapsed+=dt;if(elapsed>.1){elapsed=0;replay.push({t:Date.now(),x:player.object.position.x,y:player.object.position.y,z:player.object.position.z,wave:game.state.wave});if(replay.length>1800)replay.shift();}status.textContent=net.connected?`Connected · ${net.ping} ms · ${mode.value.toUpperCase()}`:'Offline · local practice';}
  function event(name,data){if(name==='kill'&&data.victim===net.selfId)hud.toast('SPECTATOR MODE · waiting to respawn','danger');}
  document.addEventListener('keydown',e=>{if(e.code==='KeyL')lobby.classList.toggle('open');});document.body.classList.toggle('reduced-motion',!!profile.data.reducedMotion);document.body.classList.toggle('high-contrast',!!profile.data.highContrast);
  return {update,event,replay};
}

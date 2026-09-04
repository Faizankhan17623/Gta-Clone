// Lightweight progression extras shared by the arena UI: save slots,
// player identity, daily login reward, and a local high-score leaderboard.
export function createMetaFeatures({ profile, hud, net }) {
  const storage = window.localStorage;
  const read = (key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));
  const settings = document.querySelector('.settings');
  if (settings) {
    const name = document.createElement('label'); name.textContent = 'Callsign ';
    const input = document.createElement('input'); input.value = profile.data.name; input.maxLength = 18; input.placeholder = 'Operative'; name.appendChild(input); settings.appendChild(name);
    const color = document.createElement('label'); color.textContent = 'Color '; const picker = document.createElement('input'); picker.type='color'; picker.value=profile.data.color; color.appendChild(picker); settings.appendChild(color);
    const save = () => { profile.set('name', input.value.trim() || 'Operative'); profile.set('color', picker.value); net.identify(profile.data.name); hud.toast(`Profile saved: ${profile.data.name}`,'good'); };
    input.addEventListener('change', save); picker.addEventListener('change', save);
    const slot = document.createElement('button'); slot.textContent='SAVE SLOT'; slot.className='secondary'; slot.onclick=()=>{write('arenaSaveSlot1',{profile:profile.data,at:Date.now()});hud.toast('Save slot updated','good');}; settings.appendChild(slot);
    const load = document.createElement('button'); load.textContent='LOAD SLOT'; load.className='secondary'; load.onclick=()=>{const s=read('arenaSaveSlot1',null);if(!s)return hud.toast('No save slot yet','danger');Object.entries(s.profile).forEach(([k,v])=>profile.set(k,v));input.value=profile.data.name;picker.value=profile.data.color;net.identify(profile.data.name);hud.toast('Save slot loaded','good');}; settings.appendChild(load);
  }
  const today = new Date().toISOString().slice(0,10), login = read('arenaDailyLogin',null);
  if (!login || login.day !== today) { write('arenaDailyLogin',{day:today,streak:(login?.streak||0)+1}); hud.toast(`Daily login reward · day ${(login?.streak||0)+1}`,'good'); }
  function record(score,wave) { const board=read('arenaLeaderboard',[]); board.push({name:profile.data.name,score,wave,at:Date.now()}); board.sort((a,b)=>b.score-a.score); write('arenaLeaderboard',board.slice(0,10)); }
  return { record, leaderboard:()=>read('arenaLeaderboard',[]) };
}

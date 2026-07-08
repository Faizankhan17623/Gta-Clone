import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// Classic cheat codes: just type the word during play. Keyboard only —
// a parting gift for the desktop faithful.

// code letters must dodge the bound keys — P pauses, M maps, L opens the
// legend, G snaps a photo, E interacts, T slings a trampoline, J jetpacks
const CODES = {
  RICHRICH: 'cash',
  HAVOC: 'boom',
  OINKOFF: 'clear',
  SKYBIRD: 'heli',
  WOOFWOOF: 'dog',
  WHOAWHOA: 'slowmo',
  IRONSKIN: 'heal',
  CROWNY: 'crown',
  CASHRAIN: 'cashrain',
  SUNDOWN: 'night',
};

export function initCheats(actions) {
  let buf = '';
  window.addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
    buf = (buf + e.key.toUpperCase()).slice(-12);
    for (const [code, act] of Object.entries(CODES)) {
      if (buf.endsWith(code)) {
        buf = '';
        sfxMissionPass();
        showToast('CHEAT: ' + code);
        showNews('the laws of the city bend for someone typing furiously');
        actions[act]?.();
      }
    }
  });
}

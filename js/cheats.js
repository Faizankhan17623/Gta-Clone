import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// Classic cheat codes: just type the word during play. Keyboard only —
// a parting gift for the desktop faithful.

// code letters must dodge the bound keys — P pauses, M maps, L opens the
// legend, G snaps a photo, E interacts, T slings a trampoline, J jetpacks.
// O (instant replay) could not be dodged: 14 codes already contained it, so
// `typingCheat()` below lets that hotkey stand down mid-word instead.
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
  SHOWDOWN: 'nemesis',   // the rival finds you RIGHT NOW
  BRAINS: 'outbreak',    // zombie night, on demand
  QUAKY: 'disaster',     // shake the city
  BURNBURN: 'fire',      // somebody call Station 7
  DEEPDARK: 'kaiju',     // the harbor thing rises on demand
  BRASSRAIN: 'maxammo',  // every pocket rattles: all ammo maxed
  IRONWORKS: 'gunmods',  // the gunsmith's whole catalog, free
  INVINCO: 'god',        // untouchable for a minute
  SONICRUN: 'zoom',      // coffee has nothing on this (90s sprint)
  BOUNCY: 'bouncy',      // moon-grade legs for two minutes
  HUSHFUND: 'hush',      // the precinct looks away for two minutes
  CHAOS: 'fivestars',    // instant five stars, good luck
  SKYWARD: 'skyward',    // the jetpack is suddenly yours
  DRUNKY: 'drunk',       // the camera has had a few
  NOONDAY: 'noon',       // high noon on demand
};

// Any letter typed in the last second counts as mid-word. A single-key hotkey
// that shares a letter with a cheat code checks this and stands down.
let lastLetterAt = -Infinity;
const TYPING_WINDOW_MS = 1000;

export function typingCheat() {
  return performance.now() - lastLetterAt < TYPING_WINDOW_MS;
}

export function initCheats(actions) {
  let buf = '';
  window.addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
    // A lone letter is a hotkey. Only a run of TWO OR MORE letters that still
    // matches the start of some code counts as cheat entry, so pressing O by
    // itself still opens the replay while OINKOFF does not.
    const next = (buf + e.key.toUpperCase()).slice(-12);
    let typing = false;
    for (let i = 0; i < next.length - 1 && !typing; i++) {
      typing = CODE_PREFIXES.has(next.slice(i));
    }
    buf = next;
    if (typing) lastLetterAt = performance.now();
    for (const [code, act] of Object.entries(CODES)) {
      if (buf.endsWith(code)) {
        buf = '';
        // Do NOT clear lastLetterAt here: the letter that completed the code is
        // still being handled this frame, and if it doubles as a hotkey (the O
        // ending INVINCO) the guard must stay up for it.
        lastLetterAt = performance.now();
        sfxMissionPass();
        showToast('CHEAT: ' + code);
        showNews('the laws of the city bend for someone typing furiously');
        actions[act]?.();
      }
    }
  });
}

// Every prefix of every code, so we can tell "typing a cheat" from "hotkey".
const CODE_PREFIXES = new Set();
for (const code of Object.keys(CODES)) {
  for (let i = 1; i <= code.length; i++) CODE_PREFIXES.add(code.slice(0, i));
}

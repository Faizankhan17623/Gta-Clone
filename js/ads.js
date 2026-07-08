import { showToast } from './hud.js';

// Monetization layer. Works in three tiers:
//   1. no ID configured  -> "simulated" ads (a 3s overlay) so the game and its
//      reward flow are fully playable and testable with nothing external.
//   2. AdMob/AdSense ID   -> real ads once you set AD_CONFIG (see setAdConfig).
//   3. "Remove Ads" owned -> ad calls resolve instantly, rewards still granted.
//
// To go live: create a free Google AdMob account, make a Rewarded + an
// Interstitial ad unit, and call setAdConfig({ provider:'admob',
// rewarded:'ca-app-pub-...', interstitial:'ca-app-pub-...' }). No code changes.

export const AD_CONFIG = {
  provider: 'sim',        // 'sim' | 'admob' | 'adsense'
  rewarded: '',
  interstitial: '',
  removed: false,         // set true when the player buys "Remove Ads"
};

export function setAdConfig(cfg) {
  Object.assign(AD_CONFIG, cfg);
}

let overlay = null;
function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'adoverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:70;display:none;flex-direction:column;' +
    'align-items:center;justify-content:center;background:rgba(4,6,10,0.94);color:#fff;text-align:center;';
  overlay.innerHTML =
    '<div style="font:800 italic 30px Arial;color:#ffd24a;letter-spacing:2px">ADVERTISEMENT</div>' +
    '<div id="adbox" style="margin:18px 0;width:min(80vw,420px);height:min(46vh,300px);border-radius:12px;' +
    'background:linear-gradient(135deg,#1d2a3a,#3d5a7a);display:flex;align-items:center;justify-content:center;' +
    'font:700 18px Arial;color:#cfe0f0">Your ad could be here</div>' +
    '<div id="adtimer" style="font:700 15px Arial;color:#9fb2c8"></div>';
  document.body.appendChild(overlay);
  return overlay;
}

// Simulated ad: a short countdown overlay. Resolves true when "watched".
function playSimAd(seconds = 3) {
  return new Promise((resolve) => {
    const el = ensureOverlay();
    el.style.display = 'flex';
    const timer = el.querySelector('#adtimer');
    let t = seconds;
    timer.textContent = `Reward in ${t}s...`;
    const iv = setInterval(() => {
      t--;
      if (t > 0) { timer.textContent = `Reward in ${t}s...`; return; }
      clearInterval(iv);
      el.style.display = 'none';
      resolve(true);
    }, 1000);
  });
}

// A rewarded ad. Returns true if the player watched to the end (grant reward).
export async function showRewardedAd() {
  if (AD_CONFIG.removed) return true; // paid users skip the watch, still rewarded
  if (AD_CONFIG.provider === 'admob' && window.admob) {
    try { await window.admob.rewarded.load(AD_CONFIG.rewarded); const r = await window.admob.rewarded.show(); return !!r; }
    catch { return playSimAd(); }
  }
  if (AD_CONFIG.provider === 'adsense' && window.adBreak) {
    return new Promise((res) => window.adBreak({ type: 'reward', beforeReward: (show) => show(), adViewed: () => res(true), adDismissed: () => res(false), adBreakDone: () => res(false) }));
  }
  return playSimAd();
}

// A non-rewarded interstitial (between missions). Never blocks gameplay.
export async function showInterstitial() {
  if (AD_CONFIG.removed) return;
  if (AD_CONFIG.provider === 'admob' && window.admob) {
    try { await window.admob.interstitial.load(AD_CONFIG.interstitial); await window.admob.interstitial.show(); return; } catch {}
  }
  await playSimAd(2);
}

// Rewarded-ad button helper: watch -> grant cash. Returns granted amount.
export async function watchForCash(world, amount = 500) {
  const ok = await showRewardedAd();
  if (ok) {
    world.money += amount;
    world.onSave?.();
    showToast(`AD REWARD +$${amount}`);
    return amount;
  }
  return 0;
}

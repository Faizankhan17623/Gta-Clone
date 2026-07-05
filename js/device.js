// Native mobile-device features via standard web APIs: haptic vibration,
// fullscreen, orientation lock, screenshot save/share, and a camera photo
// booth. Everything degrades gracefully when a capability is missing or a
// permission is denied — the game never breaks.

import { isTouch } from './touch.js';

export function vibrate(pattern) {
  // Android phones buzz; desktop and iOS silently ignore it.
  if (isTouch && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

export function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) req.call(el).catch(() => {});
  // lock to landscape on phones once we're fullscreen
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

// Turn the freshly rendered canvas into a PNG blob. Must be called in the
// same tick as the render (WebGL clears its buffer otherwise).
export function grabCanvas(canvas) {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/png'); }
    catch { resolve(null); }
  });
}

// Share the shot to the phone's native sheet (save to Photos, send to a
// friend); fall back to a plain download on desktop or if sharing is blocked.
export async function saveOrShare(blob, name = 'open-city.png') {
  if (!blob) return false;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'OPEN CITY' });
      return true;
    } catch { /* user cancelled — fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// ---------------- camera photo booth ----------------
// A fullscreen overlay showing the live camera with the game logo stamped on;
// snap composites a photo you can save or share. Front/back camera toggle.

let booth = null;
let stream = null;
let facing = 'environment';

function stopStream() {
  if (stream) {
    for (const t of stream.getTracks()) t.stop();
    stream = null;
  }
}

async function startStream(video) {
  stopStream();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing }, audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function buildBooth() {
  const root = document.createElement('div');
  root.id = 'cambooth';
  root.style.cssText =
    'position:fixed;inset:0;z-index:60;display:none;background:#000;' +
    'align-items:center;justify-content:center;flex-direction:column;';

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
  root.appendChild(video);

  const label = document.createElement('div');
  label.textContent = 'OPEN CITY';
  label.style.cssText =
    'position:absolute;top:16px;left:0;right:0;text-align:center;pointer-events:none;' +
    'font:900 italic 26px Arial;letter-spacing:3px;color:#ffd24a;text-shadow:2px 2px 0 #000;';
  root.appendChild(label);

  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;bottom:22px;left:0;right:0;display:flex;gap:16px;justify-content:center;';
  const mk = (txt, bg) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText =
      `font:800 15px Arial;color:#111;border:none;border-radius:8px;padding:12px 20px;` +
      `cursor:pointer;background:${bg};`;
    bar.appendChild(b);
    return b;
  };
  const snap = mk('📸 SNAP', 'linear-gradient(180deg,#ffd24a,#f0a32a)');
  const flip = mk('🔄 FLIP', 'linear-gradient(180deg,#7ecbff,#3d8fd0)');
  const close = mk('✕ CLOSE', 'linear-gradient(180deg,#ff8a6a,#d05a3a)');
  root.appendChild(bar);
  document.body.appendChild(root);

  snap.onclick = async () => {
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 1280;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(video, 0, 0, w, h);
    g.font = `900 italic ${Math.round(w * 0.06)}px Arial`;
    g.fillStyle = '#ffd24a';
    g.textAlign = 'center';
    g.shadowColor = '#000';
    g.shadowBlur = 8;
    g.fillText('OPEN CITY', w / 2, h * 0.1);
    c.toBlob((b) => saveOrShare(b, 'open-city-selfie.png'), 'image/png');
  };
  flip.onclick = async () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    try { await startStream(video); } catch {}
  };
  close.onclick = () => closeCamera();

  booth = { root, video };
  return booth;
}

export async function openCamera(onClose) {
  if (!cameraSupported()) return 'unsupported';
  if (!booth) buildBooth();
  booth.onClose = onClose;
  booth.root.style.display = 'flex';
  try {
    await startStream(booth.video);
    return 'ok';
  } catch (e) {
    booth.root.style.display = 'none';
    return e && e.name === 'NotAllowedError' ? 'denied' : 'error';
  }
}

export function closeCamera() {
  stopStream();
  if (booth) {
    booth.root.style.display = 'none';
    booth.onClose?.();
  }
}

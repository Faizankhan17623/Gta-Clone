// Cloud save — mirror the local save slots to the server so a player can
// restore on another device.
//
// Auth is the bank account's bearer token (js/bankapi.js). "Signed in for
// cloud save" == "has a linked bank account". If the server has no DB, or the
// player has no account, cloud save is simply unavailable and the game keeps
// working from localStorage exactly as before.
//
// Model: last-write-wins, but a PUT carrying `baseRev` gets a 409 with the
// server's version if someone else advanced it — the UI then offers keep-local
// or pull-server. Push is debounced off saveGame(); pull is a start-screen
// action per slot.

import { isLinked, apiCall } from './bankapi.js';
import { showToast } from './hud.js';
import {
  activeSlot, slotBlob, writeSlotBlob, slotCloudRev, setSlotCloudRev,
} from './saveslots.js';

let world = null;
let pushDueAt = 0;               // performance.now() timestamp; 0 = nothing pending
let pushing = false;
let queuedSlot = -1;              // a slot whose push is waiting on connectivity
const status = new Map();         // slot -> 'synced' | 'local' | 'conflict' | 'error' | 'pushing'

export function cloudAvailable() {
  return isLinked();
}

export function cloudStatus(slot) {
  return status.get(slot) || (cloudAvailable() ? 'local' : 'off');
}

export function initCloudSave(w) {
  world = w;
  world.cloud = {
    available: cloudAvailable,
    status: cloudStatus,
    pull: (slot) => pullSlot(slot),
    push: (slot) => pushSlot(slot, { immediate: true }),
    resolve: (slot, choice) => resolveConflict(slot, choice),
    conflict: () => world._cloudConflict || null,
    list: listSlots,
  };
  // flush any queued push when the tab regains focus / network
  window.addEventListener('online', () => { if (queuedSlot >= 0) pushSlot(queuedSlot, { immediate: true }); });
}

// Called from saveGame() in main.js. Debounced so a burst of autosaves is one
// upload. Only the ACTIVE slot is pushed here (that's the one being played).
// Wall-clock deadline (not accumulated dt) so a backgrounded tab still flushes.
export function cloudSaveTick() {
  if (!cloudAvailable() || pushing || !pushDueAt) return;
  if (performance.now() >= pushDueAt) {
    pushDueAt = 0;
    pushSlot(activeSlot(), {});
  }
}

const PUSH_DEBOUNCE_MS = 12000; // quiet period before an upload

export function scheduleCloudPush() {
  if (!cloudAvailable()) return;
  pushDueAt = performance.now() + PUSH_DEBOUNCE_MS;
}

// Independent of the rAF game loop (which throttles in a background tab): a
// low-frequency timer also flushes a due push. cloudSaveTick() in the loop
// still handles the common foreground case promptly.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    if (pushDueAt && !pushing && cloudAvailable() && performance.now() >= pushDueAt) {
      pushDueAt = 0;
      pushSlot(activeSlot(), {});
    }
  }, 4000);
}

// Best-effort final flush when the tab is closing / hidden.
if (typeof window !== 'undefined') {
  const flush = () => {
    if (pushDueAt && cloudAvailable()) { pushDueAt = 0; pushSlot(activeSlot(), { immediate: true }); }
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

async function pushSlot(slot, { immediate }) {
  if (!cloudAvailable() || pushing) return;
  const blob = slotBlob(slot);
  if (!blob || !Object.keys(blob).length) return;

  pushing = true;
  status.set(slot, 'pushing');
  try {
    const baseRev = slotCloudRev(slot);
    const body = baseRev > 0 ? { blob, baseRev } : { blob };
    const r = await apiCall(`/api/save/${slot}`, { method: 'PUT', body });
    setSlotCloudRev(slot, r.rev);
    status.set(slot, 'synced');
    queuedSlot = -1;
  } catch (e) {
    if (e.status === 409) {
      // server moved on under us — leave the local save intact, flag it. The
      // player picks keep-local vs pull-server from the pause menu / start
      // screen (world.cloud.resolve). Never auto-overwrite local progress.
      status.set(slot, 'conflict');
      world._cloudConflict = { slot, server: e.data?.server };
      try { showToast('☁ cloud save conflict — resolve it in the menu'); } catch {}
    } else if (e.status === 401) {
      status.set(slot, 'off'); // token went bad / unlinked
    } else if (e.status === 503) {
      status.set(slot, 'local'); // DB off — silently fine
    } else {
      status.set(slot, 'error');
      queuedSlot = slot; // retry on reconnect
    }
    if (!immediate && e.status !== 409) { /* debounced path: stay quiet */ }
  } finally {
    pushing = false;
  }
  return status.get(slot);
}

// Overwrite the local slot with the server's version and reload if it's active.
export async function pullSlot(slot) {
  if (!cloudAvailable()) return { error: 'not signed in' };
  try {
    const r = await apiCall(`/api/save/${slot}`, { method: 'GET' });
    writeSlotBlob(slot, r.blob);
    setSlotCloudRev(slot, r.rev);
    status.set(slot, 'synced');
    if (slot === activeSlot()) {
      setTimeout(() => location.reload(), 300);
      return { ok: true, reloading: true };
    }
    return { ok: true };
  } catch (e) {
    if (e.status === 404) return { error: 'no cloud save in that slot' };
    status.set(slot, 'error');
    return { error: e.message };
  }
}

// Resolve a stored conflict: 'local' re-pushes without baseRev (force),
// 'server' pulls.
export async function resolveConflict(slot, choice) {
  if (choice === 'server') {
    const r = await pullSlot(slot);
    if (!r.error) world._cloudConflict = null;
    return r;
  }
  // force local: push without baseRev so it wins
  try {
    const blob = slotBlob(slot);
    const r = await apiCall(`/api/save/${slot}`, { method: 'PUT', body: { blob } });
    setSlotCloudRev(slot, r.rev);
    status.set(slot, 'synced');
    world._cloudConflict = null;
    return { ok: true };
  } catch (e) {
    status.set(slot, 'error');
    return { error: e.message };
  }
}

export async function listSlots() {
  if (!cloudAvailable()) return [];
  try {
    return await apiCall('/api/save', { method: 'GET' });
  } catch {
    return [];
  }
}

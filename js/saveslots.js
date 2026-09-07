// Save slots — three independent save files instead of one.
//
// The game reads and writes one localStorage key (`opencity-save-v1`). This
// module sits UNDER that: it keeps three stored blobs
// (`opencity-slot-0/1/2`) plus a pointer (`opencity-active-slot`), and before
// the game boots it copies the active slot's blob into `opencity-save-v1`.
// From then on the game saves normally; `mirrorActiveSlot()` copies each save
// back into the active slot's key so nothing is lost.
//
// This runs BEFORE js/main.js reads its save, so it has to be imported first
// in index.html (a tiny inline module) or at the very top of main.js.

const LIVE_KEY = 'opencity-save-v1';
const SLOT_KEY = (i) => `opencity-slot-${i}`;
const ACTIVE_KEY = 'opencity-active-slot';
const NAME_KEY = (i) => `opencity-slot-name-${i}`;
export const SLOT_COUNT = 3;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

export function activeSlot() {
  const n = parseInt(lsGet(ACTIVE_KEY) || '0', 10);
  return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : 0;
}

export function slotName(i) {
  return lsGet(NAME_KEY(i)) || `SLOT ${i + 1}`;
}

export function setSlotName(i, name) {
  const clean = String(name || '').trim().slice(0, 18);
  if (clean) lsSet(NAME_KEY(i), clean); else lsDel(NAME_KEY(i));
}

// A compact summary of a slot's blob for the start-screen cards.
export function slotSummary(i) {
  const raw = lsGet(SLOT_KEY(i));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return {
      empty: false,
      money: s.money | 0,
      bank: s.bank | 0,
      missions: s.missions | 0,
      level: 1 + Math.floor(Math.sqrt((s.xp | 0) / 120)),
      char: s.char || 'weaver',
      crowned: !!s.crowned,
      packages: (s.tokens || []).length,
    };
  } catch { return { empty: false, corrupt: true }; }
}

// Called once, as early as possible, before the game reads its save.
export function bootActiveSlot() {
  const i = activeSlot();
  const blob = lsGet(SLOT_KEY(i));
  if (blob != null) {
    lsSet(LIVE_KEY, blob);
  } else {
    // First time this slot is used: start it from whatever is live (covers
    // players upgrading from the pre-slots single save), else empty.
    const live = lsGet(LIVE_KEY);
    lsSet(SLOT_KEY(i), live != null ? live : '{}');
  }
}

// Called by main.js right after each saveGame() so the slot mirrors the live
// save. Cheap string copy.
export function mirrorActiveSlot() {
  const live = lsGet(LIVE_KEY);
  if (live != null) lsSet(SLOT_KEY(activeSlot()), live);
}

// Switch slots. Mirrors the current live save first, then swaps and reloads —
// a reload is by far the safest way to re-seed 168 modules' state.
export function switchToSlot(i) {
  if (i === activeSlot()) return;
  mirrorActiveSlot();
  lsSet(ACTIVE_KEY, String(i));
  const blob = lsGet(SLOT_KEY(i));
  lsSet(LIVE_KEY, blob != null ? blob : '{}');
  location.reload();
}

export function copySlot(from, to) {
  if (from === to) return;
  const blob = lsGet(SLOT_KEY(from));
  lsSet(SLOT_KEY(to), blob != null ? blob : '{}');
  const nm = lsGet(NAME_KEY(from));
  if (nm) lsSet(NAME_KEY(to), nm + ' COPY');
  if (to === activeSlot()) lsSet(LIVE_KEY, blob != null ? blob : '{}');
}

export function deleteSlot(i) {
  lsDel(SLOT_KEY(i));
  lsDel(NAME_KEY(i));
  if (i === activeSlot()) { lsSet(LIVE_KEY, '{}'); location.reload(); }
}

export function exportSlot(i) {
  const data = lsGet(SLOT_KEY(i)) || '{}';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `open-city-${slotName(i).toLowerCase().replace(/\s+/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function importIntoSlot(i, text) {
  JSON.parse(text); // throws if not JSON — caller catches
  lsSet(SLOT_KEY(i), text);
  if (i === activeSlot()) lsSet(LIVE_KEY, text);
}

// ---------- start-screen UI ----------
// A row of slot cards injected above the character picker. Purely DOM; the
// game loop hasn't started yet when this is shown.

export function buildSlotPicker(container) {
  const wrap = document.createElement('div');
  wrap.id = 'slotpick';
  wrap.style.cssText = 'pointer-events:auto;margin-bottom:14px;';
  wrap.innerHTML =
    '<div style="color:#8ea6bb;font:800 11px Consolas,monospace;letter-spacing:.3em;margin-bottom:10px">SAVE SLOT</div>' +
    '<div id="slotrow" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"></div>';
  const row = wrap.querySelector('#slotrow');
  const active = activeSlot();

  for (let i = 0; i < SLOT_COUNT; i++) {
    const sum = slotSummary(i);
    const card = document.createElement('div');
    card.style.cssText =
      'width:150px;padding:10px 9px;cursor:pointer;transition:all .15s;' +
      'background:rgba(8,15,24,.72);border:1px solid rgba(140,170,190,.2);' +
      'clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);' +
      (i === active ? 'border-color:#55e6ff;background:rgba(85,230,255,.1);' : '');
    const body = sum && !sum.empty
      ? (sum.corrupt
          ? '<div style="color:#ff8a6a;font:700 11px Arial">corrupt save</div>'
          : `<div style="font:800 13px Consolas,monospace;color:#7cf78c">$${(sum.money + sum.bank).toLocaleString()}</div>` +
            `<div style="font:600 10px Consolas,monospace;color:#cfd8e3;line-height:1.7">LVL ${sum.level} · ${sum.missions} MISS<br>${sum.packages}/20 PKG${sum.crowned ? ' · 👑' : ''}</div>`)
      : '<div style="color:#8ea6bb;font:700 11px Arial">empty — new game</div>';
    card.innerHTML =
      `<div style="font:800 12px Consolas,monospace;letter-spacing:.12em;color:#eef4fb;text-transform:uppercase;margin-bottom:5px">${slotName(i)}</div>` +
      body +
      `<div style="display:flex;gap:4px;margin-top:7px;justify-content:center">` +
      `<button data-act="rename" title="Rename" style="${MINI}">✎</button>` +
      `<button data-act="export" title="Export to file" style="${MINI}">⬇</button>` +
      `<button data-act="import" title="Import from file" style="${MINI}">⬆</button>` +
      (sum && !sum.empty ? `<button data-act="delete" title="Delete" style="${MINI};color:#ff8a6a">🗑</button>` : '') +
      `</div>`;

    card.onclick = (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'rename') {
        const nm = prompt('Slot name:', slotName(i));
        if (nm != null) { setSlotName(i, nm); rebuild(container); }
        return;
      }
      if (act === 'export') { exportSlot(i); return; }
      if (act === 'import') {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return;
          f.text().then((t) => {
            try { importIntoSlot(i, t); rebuild(container); }
            catch { alert('That file is not a valid OPEN CITY save.'); }
          });
        };
        input.click();
        return;
      }
      if (act === 'delete') {
        if (confirm(`Delete "${slotName(i)}" permanently?`)) { deleteSlot(i); rebuild(container); }
        return;
      }
      // plain click on the card = make it active
      if (i !== activeSlot()) switchToSlot(i);
    };
    row.appendChild(card);
  }
  container.prepend(wrap);
}

const MINI =
  'pointer-events:auto;cursor:pointer;width:22px;height:22px;padding:0;font-size:11px;' +
  'background:rgba(85,230,255,.12);border:1px solid rgba(85,230,255,.3);color:#eef4fb;' +
  'border-radius:4px;line-height:1;';

function rebuild(container) {
  document.getElementById('slotpick')?.remove();
  buildSlotPicker(container);
}

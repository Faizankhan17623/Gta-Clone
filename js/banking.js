import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import * as api from './bankapi.js';

// CITY BANK. Extends world.bank (created in atm.js) with an account number,
// a cash-in-hand cap and an overlay for deposits, withdrawals and transfers.
//
// Two modes:
//  - LOCAL (default): balance lives in the save file, transfers go to a local
//    ledger. Works with no server.
//  - ONLINE: when the bank server (/api/bank) is reachable and the player has
//    linked a handle, the real Postgres balance is used and transfers move
//    money between real accounts.
//
// Rules (both modes):
//  - Cash in hand caps at CASH_CAP ($10,000); overflow is auto-deposited and
//    a deposit prompt pops up.
//  - Mission rewards under REWARD_TO_BANK ($15,000) pay cash (subject to the
//    cap); $15,000 and up wire straight to the bank.

export const CASH_CAP = 10000;
export const REWARD_TO_BANK = 15000;

function makeAccountNumber() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10);
  return n.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

let ui = null;
let world_ = null;

function buildUI() {
  if (ui) return ui;
  const root = document.createElement('div');
  root.id = 'bankui';
  root.style.cssText =
    'position:fixed;inset:0;z-index:42;display:none;align-items:center;justify-content:center;' +
    'background:radial-gradient(ellipse at 50% 35%,rgba(22,52,79,.55),rgba(6,11,18,.92));' +
    'font-family:Segoe UI,Inter,Arial,sans-serif;color:#eef4fb;';
  root.innerHTML = `
    <div style="width:min(460px,92vw);background:rgba(8,15,24,.92);border:1px solid rgba(85,230,255,.32);
      padding:22px 24px;clip-path:polygon(13px 0,100% 0,100% calc(100% - 13px),calc(100% - 13px) 100%,0 100%,0 13px)">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font:800 12px Consolas,monospace;letter-spacing:.3em;color:#55e6ff">CITY BANK</span>
        <span id="bank-mode" style="font:800 9px Consolas,monospace;letter-spacing:.2em;color:#8ea6bb"></span>
      </div>
      <div id="bank-acct" style="font:700 12px Consolas,monospace;color:#8ea6bb;margin:4px 0 14px"></div>
      <div style="display:flex;justify-content:space-between;font:800 15px Segoe UI,sans-serif;margin-bottom:4px">
        <span>CASH</span><span id="bank-cash">$0</span></div>
      <div style="display:flex;justify-content:space-between;font:800 15px Segoe UI,sans-serif;margin-bottom:14px">
        <span>BALANCE</span><span id="bank-bal" style="color:#4fe08a">$0</span></div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="bank-amt" type="number" min="1" placeholder="amount"
          style="flex:1;background:#0b1926;color:#eef4fb;border:1px solid #345064;padding:8px;font:700 13px Consolas,monospace">
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <button data-act="dep" style="flex:1">DEPOSIT</button>
        <button data-act="wd" style="flex:1">WITHDRAW</button>
        <button data-act="depall" style="flex:1">DEPOSIT ALL</button>
      </div>
      <div style="font:800 10px Consolas,monospace;letter-spacing:.2em;color:#8ea6bb;margin-bottom:6px">TRANSFER TO ACCOUNT</div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <input id="bank-to" type="text" placeholder="account number"
          style="flex:2;background:#0b1926;color:#eef4fb;border:1px solid #345064;padding:8px;font:700 12px Consolas,monospace">
        <button data-act="xfer" style="flex:1">SEND</button>
      </div>
      <div id="bank-link" style="border-top:1px solid rgba(140,170,190,.15);padding-top:10px;margin-bottom:8px"></div>
      <div id="bank-msg" style="min-height:16px;font:700 11px Consolas,monospace;color:#ffb648;margin-bottom:10px"></div>
      <button data-act="close" style="width:100%;background:transparent;color:#eef4fb;box-shadow:inset 0 0 0 1px rgba(85,230,255,.5)">CLOSE</button>
    </div>`;
  for (const b of root.querySelectorAll('button')) {
    b.style.cssText += 'cursor:pointer;padding:9px 0;border:none;background:#55e6ff;color:#06131a;' +
      'font:900 12px Consolas,monospace;letter-spacing:.12em;' +
      'clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)';
  }
  document.body.appendChild(root);
  ui = {
    root,
    mode: root.querySelector('#bank-mode'),
    acct: root.querySelector('#bank-acct'),
    cash: root.querySelector('#bank-cash'),
    bal: root.querySelector('#bank-bal'),
    amt: root.querySelector('#bank-amt'),
    to: root.querySelector('#bank-to'),
    link: root.querySelector('#bank-link'),
    msg: root.querySelector('#bank-msg'),
  };
  return ui;
}

function renderLinkRow() {
  if (!ui) return;
  if (api.isLinked()) {
    ui.link.innerHTML =
      `<div style="font:700 10px Consolas,monospace;color:#8ea6bb">Linked as <b style="color:#eef4fb">${api.handle()}</b></div>` +
      `<button data-act="unlink" style="margin-top:6px;width:100%;background:transparent;color:#ff9a90;box-shadow:inset 0 0 0 1px rgba(255,91,82,.5)">UNLINK ACCOUNT</button>`;
  } else {
    ui.link.innerHTML =
      `<div style="font:800 10px Consolas,monospace;letter-spacing:.2em;color:#8ea6bb;margin-bottom:6px">LINK AN ONLINE ACCOUNT</div>` +
      `<div style="display:flex;gap:6px;margin-bottom:6px">` +
      `<input id="bank-handle" placeholder="handle" style="flex:2;background:#0b1926;color:#eef4fb;border:1px solid #345064;padding:7px;font:700 11px Consolas,monospace">` +
      `<button data-act="reg" style="flex:1">CREATE</button></div>` +
      `<div style="display:flex;gap:6px">` +
      `<input id="bank-token" placeholder="token (to log in)" style="flex:2;background:#0b1926;color:#eef4fb;border:1px solid #345064;padding:7px;font:700 11px Consolas,monospace">` +
      `<button data-act="lin" style="flex:1">LOG IN</button></div>`;
  }
  for (const b of ui.link.querySelectorAll('button')) {
    b.style.cssText += 'cursor:pointer;padding:8px 0;border:none;font:900 11px Consolas,monospace;letter-spacing:.1em;' +
      'clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)';
    if (!b.style.background) { b.style.background = '#55e6ff'; b.style.color = '#06131a'; }
  }
}

function refresh(world) {
  const bk = world.bank;
  const on = api.isOnline() && api.isLinked();
  ui.mode.textContent = on ? '● ONLINE' : '○ LOCAL';
  ui.mode.style.color = on ? '#4fe08a' : '#8ea6bb';
  ui.acct.textContent = 'A/C ' + (on ? api.accountNo() : bk.account);
  ui.cash.textContent = '$' + Math.round(world.money);
  ui.bal.textContent = '$' + Math.round(on ? (bk.onlineBalance ?? 0) : bk.balance);
  renderLinkRow();
}

function say(m) { if (ui) ui.msg.textContent = m; }

async function syncOnline(world) {
  if (!(api.isOnline() && api.isLinked())) return;
  try {
    const a = await api.getAccount();
    world.bank.onlineBalance = a.balance;
    refresh(world);
  } catch (e) { /* stay on last known */ }
}

function open(world, reason) {
  buildUI();
  world_ = world;
  world.bankUiOpen = true;
  ui.root.style.display = 'flex';
  say(reason || '');
  refresh(world);
  syncOnline(world);

  ui.root.onclick = (e) => handleClick(world, e);
}

async function handleClick(world, e) {
  const act = e.target.dataset?.act;
  if (!act) return;
  const bk = world.bank;
  const online = api.isOnline() && api.isLinked();
  const amt = Math.max(0, Math.floor(Number(ui.amt.value) || 0));

  try {
    if (act === 'close') return close(world);

    if (act === 'reg') {
      const h = (ui.root.querySelector('#bank-handle')?.value || '').trim();
      const r = await api.register(h);
      bk.onlineBalance = r.balance;
      done(world, `Account ${r.account_no} created. TOKEN: ${r.token} — save it!`);
      return;
    }
    if (act === 'lin') {
      const h = (ui.root.querySelector('#bank-handle')?.value || '').trim();
      const tk = (ui.root.querySelector('#bank-token')?.value || '').trim();
      const r = await api.login(h, tk);
      bk.onlineBalance = r.balance;
      done(world, `Logged in — balance $${r.balance}`);
      return;
    }
    if (act === 'unlink') { api.unlink(); done(world, 'Account unlinked (back to local)'); return; }

    if (act === 'dep') {
      if (amt <= 0) return say('Enter an amount');
      if (world.money < amt) return say('Not that much cash on hand');
      if (online) { const r = await api.deposit(amt); bk.onlineBalance = r.balance; }
      else bk.balance += amt;
      world.money -= amt;
      done(world, `Deposited $${amt}`);
      return;
    }
    if (act === 'wd') {
      if (amt <= 0) return say('Enter an amount');
      if (world.money + amt > CASH_CAP) return say(`Can't hold over $${CASH_CAP} in cash`);
      if (online) { const r = await api.withdraw(amt); bk.onlineBalance = r.balance; }
      else {
        if (bk.balance < amt) return say('Balance too low');
        bk.balance -= amt;
      }
      world.money += amt;
      done(world, `Withdrew $${amt}`);
      return;
    }
    if (act === 'depall') {
      if (world.money <= 0) return say('Pockets are empty');
      const n = Math.round(world.money);
      if (online) { const r = await api.deposit(n); bk.onlineBalance = r.balance; }
      else bk.balance += n;
      world.money = 0;
      done(world, `Deposited $${n}`);
      return;
    }
    if (act === 'xfer') {
      const to = ui.to.value.trim().replace(/\s+/g, ' ');
      if (!to) return say('Enter an account number');
      if (amt <= 0) return say('Enter an amount');
      if (online) {
        const r = await api.transfer(to, amt, ui.root.querySelector('#bank-handle')?.value || null);
        bk.onlineBalance = r.balance;
      } else {
        if (to === bk.account) return say("That's your own account");
        if (bk.balance < amt) return say('Balance too low to transfer');
        bk.balance -= amt;
        bk.ledger.push({ to, amt, day: world.dailyDay ?? 0 });
        if (bk.ledger.length > 30) bk.ledger.shift();
      }
      showNews(`a $${amt} transfer is wired to account ${to.slice(-4)}`);
      done(world, `Sent $${amt} to ${to}`);
      return;
    }
  } catch (err) {
    say(err.message || 'bank error');
  }
}

function done(world, m) {
  sfxPickup();
  refresh(world);
  say(m);
  world.onSave?.();
}

function close(world) {
  world.bankUiOpen = false;
  if (ui) ui.root.style.display = 'none';
}

export function initBanking(world, save) {
  world.bank = world.bank || { balance: save?.bank ?? 0, machines: [], day: -1 };
  world.bank.account = save?.bankAcct || makeAccountNumber();
  world.bank.ledger = Array.isArray(save?.bankLedger) ? save.bankLedger : [];
  world.bank.onlineBalance = null;
  world.bankUiOpen = false;
  // fire-and-forget: learn whether the bank server is up
  api.probe().catch(() => {});
}

export function bankingSave(world) {
  const bk = world.bank;
  return bk ? { bankAcct: bk.account, bankLedger: bk.ledger } : {};
}

// Route a reward. Small -> cash (capped), large -> bank. When online and
// linked, the "bank" part goes to the real account. Returns a toast line.
export function awardMoney(world, amount, { alwaysBank = false } = {}) {
  const bk = world.bank;
  const online = api.isOnline() && api.isLinked();
  const toBank = (n, why) => {
    if (online) {
      api.deposit(n, why || 'reward').then((r) => { bk.onlineBalance = r.balance; }).catch(() => { bk.balance += n; });
    } else {
      bk.balance += n;
    }
    world.onSave?.();
  };

  if (alwaysBank || amount >= REWARD_TO_BANK) {
    toBank(amount, 'mission reward');
    return `+$${amount} → BANK`;
  }
  const room = CASH_CAP - world.money;
  if (amount <= room) {
    world.money += amount;
    return `+$${amount} CASH`;
  }
  const toCash = Math.max(0, room);
  world.money += toCash;
  toBank(amount - toCash, 'reward overflow');
  return `+$${toCash} CASH · $${amount - toCash} → BANK`;
}

export function updateBanking(world, dt, keys, pressed) {
  const bk = world.bank;
  if (!bk) return;

  if (pressed['KeyK'] && !world.bankUiOpen) open(world);
  if (world.bankUiOpen && pressed['Escape']) close(world);

  // cash cap: skim overflow into the bank, nag once
  if (world.money > CASH_CAP) {
    const over = Math.round(world.money - CASH_CAP);
    world.money = CASH_CAP;
    if (api.isOnline() && api.isLinked()) {
      api.deposit(over, 'cash cap overflow').then((r) => { bk.onlineBalance = r.balance; }).catch(() => { bk.balance += over; });
    } else {
      bk.balance += over;
    }
    world.onSave?.();
    if (!world.bankUiOpen) open(world, `Cash is capped at $${CASH_CAP}. $${over} auto-deposited.`);
  }

  if (world.bankUiOpen) refresh(world);
}

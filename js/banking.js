import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// CITY BANK ACCOUNTS. Extends world.bank (created in atm.js) with an account
// number, a cash-in-hand cap and an overlay for deposits, withdrawals and
// transfers to another account number.
//
// Rules:
//  - You can carry at most CASH_CAP ($10,000) in hand. Money over that is
//    refused and a deposit prompt pops up.
//  - A mission reward under REWARD_TO_BANK ($15,000) is paid in cash (still
//    subject to the cap); anything from $15,000 up is wired straight to the
//    bank account.
//  - Other transfers land in a small local ledger so a second "account
//    number" can receive money even though there is no server yet.

export const CASH_CAP = 10000;
export const REWARD_TO_BANK = 15000;

function makeAccountNumber() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10);
  return n.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

let ui = null;

function buildUI() {
  if (ui) return ui;
  const root = document.createElement('div');
  root.id = 'bankui';
  root.style.cssText =
    'position:fixed;inset:0;z-index:42;display:none;align-items:center;justify-content:center;' +
    'background:radial-gradient(ellipse at 50% 35%,rgba(22,52,79,.55),rgba(6,11,18,.92));' +
    'font-family:Segoe UI,Inter,Arial,sans-serif;color:#eef4fb;';
  root.innerHTML = `
    <div style="width:min(440px,92vw);background:rgba(8,15,24,.92);border:1px solid rgba(85,230,255,.32);
      padding:22px 24px;clip-path:polygon(13px 0,100% 0,100% calc(100% - 13px),calc(100% - 13px) 100%,0 100%,0 13px)">
      <div style="font:800 12px Consolas,monospace;letter-spacing:.3em;color:#55e6ff">CITY BANK</div>
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
    acct: root.querySelector('#bank-acct'),
    cash: root.querySelector('#bank-cash'),
    bal: root.querySelector('#bank-bal'),
    amt: root.querySelector('#bank-amt'),
    to: root.querySelector('#bank-to'),
    msg: root.querySelector('#bank-msg'),
  };
  return ui;
}

function refresh(world) {
  const bk = world.bank;
  ui.acct.textContent = 'A/C ' + bk.account;
  ui.cash.textContent = '$' + Math.round(world.money);
  ui.bal.textContent = '$' + Math.round(bk.balance);
}

function open(world, reason) {
  buildUI();
  const bk = world.bank;
  world.bankUiOpen = true;
  ui.root.style.display = 'flex';
  ui.msg.textContent = reason || '';
  refresh(world);

  ui.root.onclick = (e) => {
    const act = e.target.dataset?.act;
    if (!act) return;
    const amt = Math.max(0, Math.floor(Number(ui.amt.value) || 0));
    if (act === 'close') return close(world);
    if (act === 'dep') {
      if (amt <= 0) return say('Enter an amount');
      if (world.money < amt) return say('Not that much cash on hand');
      world.money -= amt; bk.balance += amt; done(world, `Deposited $${amt}`);
    } else if (act === 'wd') {
      if (amt <= 0) return say('Enter an amount');
      if (bk.balance < amt) return say('Balance too low');
      if (world.money + amt > CASH_CAP) return say(`Can't hold over $${CASH_CAP} in cash`);
      bk.balance -= amt; world.money += amt; done(world, `Withdrew $${amt}`);
    } else if (act === 'depall') {
      if (world.money <= 0) return say('Pockets are empty');
      const n = Math.round(world.money); bk.balance += n; world.money = 0; done(world, `Deposited $${n}`);
    } else if (act === 'xfer') {
      const to = ui.to.value.trim().replace(/\s+/g, ' ');
      if (!to) return say('Enter an account number');
      if (to === bk.account) return say("That's your own account");
      if (amt <= 0) return say('Enter an amount');
      if (bk.balance < amt) return say('Balance too low to transfer');
      bk.balance -= amt;
      bk.ledger.push({ to, amt, day: world.dailyDay ?? 0 });
      if (bk.ledger.length > 30) bk.ledger.shift();
      showNews(`a $${amt} transfer is wired to account ${to.slice(-4)}`);
      done(world, `Sent $${amt} to ${to}`);
    }
  };
}

function say(m) { ui.msg.textContent = m; }
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
  // world.bank is created by initAtms; make sure it exists then extend it
  world.bank = world.bank || { balance: save?.bank ?? 0, machines: [], day: -1 };
  world.bank.account = save?.bankAcct || makeAccountNumber();
  world.bank.ledger = Array.isArray(save?.bankLedger) ? save.bankLedger : [];
  world.bankUiOpen = false;
  world._capWarnT = 0;
}

export function bankingSave(world) {
  const bk = world.bank;
  return bk ? { bankAcct: bk.account, bankLedger: bk.ledger } : {};
}

// Route a mission (or other big) reward. Small rewards go to cash (capped),
// large ones are wired to the bank. Returns a short line for the reward toast.
export function awardMoney(world, amount, { alwaysBank = false } = {}) {
  const bk = world.bank;
  if (alwaysBank || amount >= REWARD_TO_BANK) {
    bk.balance += amount;
    world.onSave?.();
    return `+$${amount} → BANK (a/c ${bk.account.slice(-4)})`;
  }
  const room = CASH_CAP - world.money;
  if (amount <= room) {
    world.money += amount;
    return `+$${amount} CASH`;
  }
  // partial to cash, the rest to the bank
  const toCash = Math.max(0, room);
  world.money += toCash;
  bk.balance += amount - toCash;
  world.onSave?.();
  return `+$${toCash} CASH · $${amount - toCash} → BANK`;
}

export function updateBanking(world, dt, keys, pressed) {
  const bk = world.bank;
  if (!bk) return;

  // K opens the bank anywhere; it also opens automatically when over the cap
  if (pressed['KeyK'] && !world.bankUiOpen) open(world);
  if (world.bankUiOpen && pressed['Escape']) close(world);

  // cash cap: skim the overflow into the bank and nag to manage it
  if (world.money > CASH_CAP) {
    const over = Math.round(world.money - CASH_CAP);
    world.money = CASH_CAP;
    bk.balance += over;
    world.onSave?.();
    if (!world.bankUiOpen) open(world, `Cash is capped at $${CASH_CAP}. $${over} auto-deposited.`);
  }

  if (world.bankUiOpen) refresh(world);
}

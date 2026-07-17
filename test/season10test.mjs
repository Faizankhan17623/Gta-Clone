// Season 10 audit: THE WHOLE CITY — 34 features. Wingsuit, web-pull,
// train hijack, jet ski circuit, trick park, elevators, pizza, repo,
// Mr. Frosty, news stringer, cop career, store robberies, jewelry,
// pink slips, most wanted, bribes, lawyer, stocks, casino boss,
// witness system, mall, calendar, sewer, arcade, golf, poker tourney,
// chess, race ghosts, boss rush, perks, explorer, armor.
import { chromium } from 'playwright-core';

let browser;
try { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
catch { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
const page = await browser.newPage();
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('PAGE ERROR:', e.message); });

await page.goto(`http://localhost:${process.env.PORT || 8081}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__debug, null, { timeout: 15000 });
await page.evaluate(() => localStorage.clear());
await page.click('#playbtn');
await page.waitForTimeout(500);

const ev = (fn, arg) => page.evaluate(fn, arg);
const results = [];
const check = (name, ok, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' — ' + note : ''}`);
};

async function resetPlayer() {
  await ev(() => {
    const d = window.__debug;
    if (d.getState() === 'cards') d.leaveCards();
    d.stopSwing();
    if (d.player.inCar) { d.player.inCar.vel.set(0, 0, 0); d.player.inCar = null; }
    d.player.inHeli = null;
    d.player.inBoat = null;
    d.player.inPlane = null;
    d.player.swim = false;
    d.player.mesh.visible = true;
    d.player.pos.set(d.world.city.spawn.x + 5, 0, d.world.city.spawn.z + 5);
    d.player.vel.set(0, 0, 0);
    d.player.vy = 0;
    d.player.onGround = true;
    d.player.health = d.world.maxHealth;
    d.world.wanted = 0;
    d.world.wantedTimer = 0;
    d.world.money = 100000;
  });
  await page.waitForTimeout(150);
}

async function goTo(src, dx = 1.5, dz = 0) {
  await ev(({ src, dx, dz }) => {
    const d = window.__debug;
    const p = new Function('d', `return ${src}`)(d);
    d.teleport(p.x + dx, 0, p.z + dz);
  }, { src, dx, dz });
  await page.waitForTimeout(350);
}

// ---- 1. all season-10 systems initialized ----
{
  const r = await ev(() => {
    const w = window.__debug.world;
    return {
      wingsuit: !!w.wingsuit, webpull: !!w.webpull, trainjack: !!w.trainjack,
      boatrace: w.boatrace?.gates.length === 6, trickpark: !!w.trickpark,
      elevators: (w.elevators?.lifts.length || 0) >= 1, pizza: !!w.pizza,
      repo: !!w.repo, icetruck: !!w.icetruck && !w.icetruck.owned,
      news: !!w.newsjob, cop: !!w.copjob && !w.copjob.on,
      stores: w.storerob?.stores.length === 4, jewelry: w.jewelry?.cases.length === 6,
      pinkslip: !!w.pinkslip, mostwanted: !!w.mostwanted, bribe: !!w.bribe,
      lawyer: !!w.lawyer && !w.lawyerRetained, stocks: !!w.stocks,
      casinoboss: !!w.casinoboss, calendar: !!w.calendar, mall: !!w.mall,
      sewer: !!w.sewer && !w.sewer.albert.dead, arcade: !!w.arcade,
      golf: !!w.golf, pokerT: !!w.pokerT, chess: !!w.chess, ghosts: !!w.ghosts,
      bossrush: !!w.bossrush, perks: !!w.perkShop, explorer: !!w.explorer,
      armor: !!w.armor,
    };
  });
  const bad = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
  check('All 31 Season-10 systems initialized', bad.length === 0, bad.length ? 'missing: ' + bad.join(',') : 'all up');
}

// ---- 2. wingsuit deploys in a fall ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.player.pos.y = 60;
    d.player.onGround = false;
    d.player.vy = -14;
  });
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(250);
  const on = await ev(() => window.__debug.world.wingsuit.on);
  check('Wingsuit deploys mid-fall (U)', on === true);
}

// ---- 3. express elevator up and down ----
{
  await resetPlayer();
  await goTo('d.world.elevators.lifts[0].pos', 0.5, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const up = await ev(() => ({ y: window.__debug.player.pos.y, h: window.__debug.world.elevators.lifts[0].h }));
  check('Elevator rides to the roof', Math.abs(up.y - up.h) < 3, `y ${up.y.toFixed(1)} vs h ${up.h.toFixed(1)}`);
}

// ---- 4. pizza run: four drops ----
{
  await resetPlayer();
  await goTo('d.world.pizza.pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const on = await ev(() => window.__debug.world.pizza.on);
  let delivered = false;
  if (on) {
    const before = await ev(() => window.__debug.world.money);
    for (let i = 0; i < 4; i++) {
      await goTo('d.world.pizza.drop', 0.5, 0);
      await page.waitForTimeout(250);
    }
    const r = await ev(() => ({ money: window.__debug.world.money, runs: window.__debug.world.pizza.runs, on: window.__debug.world.pizza.on }));
    delivered = !r.on && r.runs === 1 && r.money > before;
    check('Pizza run: 4 drops, tips paid', delivered, JSON.stringify(r));
  } else {
    check('Pizza run: 4 drops, tips paid', false, 'run never started');
  }
}

// ---- 5. repo run ----
{
  await resetPlayer();
  await goTo('d.world.repo.hut');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const spawned = await ev(() => !!window.__debug.world.repo.car);
  if (spawned) {
    const before = await ev(() => window.__debug.world.money);
    await ev(() => {
      const d = window.__debug;
      const rp = d.world.repo;
      d.player.inCar = rp.car;
      rp.car.pos.set(rp.pos.x + 1, 0, rp.pos.z + 1);
      rp.car.vel.set(0, 0, 0);
    });
    await page.waitForTimeout(400);
    const r = await ev(() => ({ done: window.__debug.world.repo.done, money: window.__debug.world.money, inCar: !!window.__debug.player.inCar }));
    check('Repo run: car delivered to the impound', r.done === 1 && r.money > before && !r.inCar, JSON.stringify(r));
  } else {
    check('Repo run: car delivered to the impound', false, 'no car spawned');
  }
}

// ---- 6. undercover shift: three collars ----
{
  await resetPlayer();
  await goTo('d.world.copjob.pos', 0.2, 0); // land on the probed-free pad itself
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const on = await ev(() => window.__debug.world.copjob.on && window.__debug.world.onDuty);
  let ok = false;
  if (on) {
    const before = await ev(() => window.__debug.world.money);
    for (let i = 0; i < 3; i++) {
      await ev(() => {
        const s = window.__debug.world.copjob.suspect;
        if (s) { s.target.hit(); s.target.hit(); } // downed counts as a collar at half pay
      });
      await page.waitForTimeout(400);
    }
    const r = await ev(() => ({
      on: window.__debug.world.copjob.on, duty: window.__debug.world.onDuty,
      arrests: window.__debug.world.copjob.arrests, money: window.__debug.world.money,
    }));
    ok = !r.on && !r.duty && r.arrests === 3 && r.money > before;
    check('Undercover shift: 3 collars + bonus, badge returned', ok, JSON.stringify(r));
  } else {
    check('Undercover shift: 3 collars + bonus, badge returned', false, 'shift never started');
  }
}

// ---- 7. corner store hold-up ----
{
  await resetPlayer();
  await goTo('d.world.storerob.stores[0].pos');
  const before = await ev(() => window.__debug.world.money);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__debug.world.storerob.stores[0].doneDay === window.__debug.world.dailyDay, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.up('KeyE');
  const r = await ev(() => ({
    done: window.__debug.world.storerob.stores[0].doneDay === window.__debug.world.dailyDay,
    money: window.__debug.world.money, wanted: window.__debug.world.wanted,
    dodged: window.__debug.world.crimeDodged || 0,
  }));
  // the witness system may legitimately eat the heat if nobody saw it
  check('Corner store robbed: till + heat (or no witnesses)', r.done && r.money > before && (r.wanted >= 2 || r.dodged >= 1), JSON.stringify(r));
}

// ---- 8. jewelry smash & grab ----
{
  await resetPlayer();
  await goTo('d.world.jewelry.pos', 2, 2);
  const before = await ev(() => window.__debug.world.money);
  await ev(() => { for (const c of window.__debug.world.jewelry.cases) c.target.hit(); });
  await page.waitForFunction(() => !window.__debug.world.jewelry.active, null, { timeout: 8000 }).catch(() => {});
  const r = await ev(() => ({
    active: window.__debug.world.jewelry.active, got: window.__debug.world.jewelry.got,
    money: window.__debug.world.money,
    doneDay: window.__debug.world.jewelry.doneDay === window.__debug.world.dailyDay,
  }));
  check('Jewelry: 6 cases smashed, loot banked', !r.active && r.got === 6 && r.money > before && r.doneDay, JSON.stringify(r));
}

// ---- 9. pink slips: beat the first rival ----
{
  await resetPlayer();
  const before = await ev(() => window.__debug.world.parked.length);
  await ev(() => {
    const d = window.__debug;
    const ps = d.world.pinkslip;
    const car = d.world.parked[0];
    car.pos.set(ps.startPos.x, 0, ps.startPos.z);
    car.vel.set(0, 0, 0);
    d.player.inCar = car;
    d.player.pos.copy(car.pos);
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  const on = await ev(() => window.__debug.world.pinkslip.on);
  if (on) {
    await ev(() => {
      const d = window.__debug;
      const ps = d.world.pinkslip;
      d.player.inCar.pos.set(ps.finishPos.x, 0, ps.finishPos.z);
    });
    await page.waitForTimeout(400);
    const r = await ev(() => ({
      rank: window.__debug.world.pinkslip.rank, cars: window.__debug.world.pinkslip.cars,
      parked: window.__debug.world.parked.length,
    }));
    check('Pink slip won: rival car parked at the strip', r.rank === 1 && r.cars === 1 && r.parked === before + 1, JSON.stringify(r));
  } else {
    check('Pink slip won: rival car parked at the strip', false, 'race never launched');
  }
}

// ---- 10. most wanted #1 goes down ----
{
  await resetPlayer();
  await page.waitForTimeout(300);
  const has = await ev(() => !!window.__debug.world.mostwanted.foe);
  if (has) {
    const before = await ev(() => window.__debug.world.money);
    await ev(() => { const f = window.__debug.world.mostwanted.foe; for (let i = 0; i < 5; i++) f.target.hit(); });
    await page.waitForTimeout(400);
    const r = await ev(() => ({ idx: window.__debug.world.mostwanted.idx, money: window.__debug.world.money }));
    check('Most Wanted #1 crossed off (+$1500)', r.idx === 1 && r.money === before + 1500, JSON.stringify(r));
  } else {
    check('Most Wanted #1 crossed off (+$1500)', false, 'no mark spawned');
  }
}

// ---- 11. bribe wipes 1-star heat ----
{
  await resetPlayer();
  await ev(() => { window.__debug.world.wanted = 1; });
  // wait for a real cruiser to spawn, then appear right next to it
  await page.waitForFunction(() => window.__debug.world.cops.some((c) => !c.dead), null, { timeout: 15000 }).catch(() => {});
  await ev(() => {
    const d = window.__debug;
    const cop = d.world.cops.find((c) => !c.dead);
    if (cop) { d.player.pos.set(cop.pos.x + 2, 0, cop.pos.z); d.player.vel.set(0, 0, 0); }
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyY');
  await page.waitForTimeout(300);
  const r = await ev(() => ({ wanted: window.__debug.world.wanted, money: window.__debug.world.money, paid: window.__debug.world.bribe.paid }));
  check('Bribe (Y): $500 clears one star', r.paid === 1 && r.wanted === 0 && r.money === 99500, JSON.stringify(r));
}

// ---- 12. lawyer on retainer ----
{
  await resetPlayer();
  await goTo('d.world.lawyer.pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const r = await ev(() => ({ retained: window.__debug.world.lawyerRetained, money: window.__debug.world.money }));
  check('Saul Bettercall retained ($1000)', r.retained === true && r.money === 99000, JSON.stringify(r));
}

// ---- 13. stocks: buy and sell ----
{
  await resetPlayer();
  await goTo('d.world.stocks.pos');
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  const bought = await ev(() => window.__debug.world.stocks.held.ocb || 0);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.press('1');
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(250);
  const r = await ev(() => ({ held: window.__debug.world.stocks.held.ocb || 0, money: window.__debug.world.money }));
  check('Ticker: buy 1 OCB then sell it back', bought === 1 && r.held === 0 && r.money === 100000, `bought ${bought}, ${JSON.stringify(r)}`);
}

// ---- 14. the galleria: door, gift, exit ----
{
  await resetPlayer();
  await goTo('d.world.mall.door', 0.5, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const inside = await ev(() => Math.abs(window.__debug.player.pos.y - 30) < 3);
  await ev(() => {
    const d = window.__debug;
    const k = d.world.mall.kioskPos;
    d.player.pos.set(k.x + 0.5, 30.2, k.z);
    d.player.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const gift = await ev(() => window.__debug.world.mall.giftDay === window.__debug.world.dailyDay);
  check('Galleria: teleports in, daily gift claimed', inside && gift, `inside ${inside}, gift ${gift}`);
}

// ---- 15. sewer: Albert falls, chest pays $3000 ----
{
  await resetPlayer();
  await goTo('d.world.sewer.hole', 0.5, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const inside = await ev(() => Math.abs(window.__debug.player.pos.y - 30) < 3);
  await ev(() => { const al = window.__debug.world.sewer.albert; for (let i = 0; i < 11; i++) al.target.hit(); });
  await ev(() => {
    const d = window.__debug;
    const c = d.world.sewer.chestPos;
    d.player.pos.set(c.x + 1, 30.2, c.z);
  });
  await page.waitForTimeout(300);
  const before = await ev(() => window.__debug.world.money);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const r = await ev(() => ({
    dead: window.__debug.world.sewer.albert.dead, looted: window.__debug.world.sewer.looted,
    money: window.__debug.world.money,
  }));
  check('Sewer: Albert down, hoard looted (+$3000)', inside && r.dead && r.looted && r.money === before + 3000, JSON.stringify(r));
}

// ---- 16. arcade: hi-striker spins up ----
{
  await resetPlayer();
  await goTo('d.world.arcade.pos', 0, 1.5);
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  const game = await ev(() => window.__debug.world.arcade.game);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const after = await ev(() => ({ game: window.__debug.world.arcade.game, money: window.__debug.world.money }));
  check('Arcade: HI-STRIKER plays and resolves', game === 'striker' && after.game === null && after.money === 99980, JSON.stringify(after));
}

// ---- 17. golf: swing meter and ball flight ----
{
  await resetPlayer();
  await goTo('d.world.golf.tee', 0.5, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const swinging = await ev(() => window.__debug.world.golf.state === 'swing');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const flying = await ev(() => !!window.__debug.world.golf.flight || !window.__debug.world.golf.ball.visible === false);
  await page.waitForFunction(() => !window.__debug.world.golf.flight, null, { timeout: 15000 }).catch(() => {});
  const landed = await ev(() => !window.__debug.world.golf.flight);
  check('Golf: meter → strike → splash', swinging && flying && landed, `swing ${swinging}, flight ${flying}, landed ${landed}`);
}

// ---- 18. chess with Volkov: three positions ----
{
  await resetPlayer();
  await goTo('d.world.chess.pos', 1.2, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const on = await ev(() => window.__debug.world.chess.on);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('1');
    await page.waitForTimeout(250);
  }
  const done = await ev(() => !window.__debug.world.chess.on);
  check('Chess: game starts, three picks resolve it', on && done, `on ${on}, done ${done}`);
}

// ---- 19. poker tournament seat ----
{
  await resetPlayer();
  await goTo('d.world.pokerT.pos', 1.2, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const r = await ev(() => ({ on: window.__debug.world.pokerT.on, money: window.__debug.world.money }));
  check('Backroom Classic: $2000 buy-in seats you', r.on && r.money === 98000, JSON.stringify(r));
}

// ---- 20. boss rush: four echoes fall ----
{
  await resetPlayer();
  await goTo('d.world.bossrush.pos', 1.2, 0);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const on = await ev(() => window.__debug.world.bossrush.on);
  let ok = false;
  if (on) {
    const before = await ev(() => window.__debug.world.money);
    for (let w = 0; w < 4; w++) {
      await ev(() => { const f = window.__debug.world.bossrush.foe; if (f) for (let i = 0; i < 14; i++) f.target.hit(); });
      await page.waitForTimeout(350);
    }
    const r = await ev(() => ({
      on: window.__debug.world.bossrush.on,
      done: window.__debug.world.bossrush.doneDay === window.__debug.world.dailyDay,
      money: window.__debug.world.money,
    }));
    ok = !r.on && r.done && r.money > before;
    check('Boss rush: all 4 shades down, obelisk pays', ok, JSON.stringify(r));
  } else {
    check('Boss rush: all 4 shades down, obelisk pays', false, 'gauntlet never started');
  }
}

// ---- 21. explorer logs new ground ----
{
  await resetPlayer();
  const a = await ev(() => window.__debug.world.explorer.seen.size);
  await ev(() => { window.__debug.teleport(-364, 0, 320); }); // far corner block, surely unvisited
  await page.waitForTimeout(1800);
  const b = await ev(() => window.__debug.world.explorer.seen.size);
  check('Cartographer: crossing blocks logs them', b > a && a >= 1, `${a} -> ${b} blocks`);
}

// ---- 22. body armor absorbs half ----
{
  await resetPlayer();
  await goTo('d.world.armor.pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const plate = await ev(() => window.__debug.world.armor.plate);
  await ev(() => { window.__debug.player.health -= 20; });
  await page.waitForTimeout(300);
  const r = await ev(() => ({ plate: window.__debug.world.armor.plate, hp: window.__debug.player.health }));
  check('Armor: 50 plate bought, absorbs half a 20-hit', plate === 50 && Math.abs(r.plate - 40) < 2, `plate ${plate}->${r.plate?.toFixed(0)}`);
}

// ---- 23. jet ski circuit ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.boardBoat(0);
    const br = d.world.boatrace;
    d.player.inBoat.pos.set(br.start.x, 0, br.start.z);
    d.player.inBoat.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(400);
  const on = await ev(() => window.__debug.world.boatrace.on);
  if (on) {
    const before = await ev(() => window.__debug.world.money);
    for (let i = 0; i < 6; i++) {
      await ev(() => {
        const d = window.__debug;
        const br = d.world.boatrace;
        if (br.on && br.idx < 6) d.player.inBoat.pos.set(br.gates[br.idx].pos.x, 0, br.gates[br.idx].pos.z);
      });
      await page.waitForTimeout(250);
    }
    const r = await ev(() => ({ on: window.__debug.world.boatrace.on, best: window.__debug.world.boatrace.best, money: window.__debug.world.money }));
    check('Jet ski circuit: 6 gates, best time set', !r.on && r.best > 0 && r.money > before, JSON.stringify(r));
  } else {
    check('Jet ski circuit: 6 gates, best time set', false, 'never started at the buoy');
  }
}

// ---- 24. save round-trip ----
{
  await ev(() => window.__debug.world.onSave());
  const s = await ev(() => JSON.parse(localStorage.getItem('opencity-save-v1') || '{}'));
  const ok = s.pizzaRuns === 1 && s.repoDone === 1 && s.copArrests === 3 && s.slipRank === 1 &&
    s.mwIdx === 1 && s.lawyer === true && s.albert === true && s.sewerChest === true &&
    s.boatBest > 0 && (s.blocksSeen || []).length >= 2 && s.armor > 30 && s.bossrushDay === 0;
  check('Season-10 progress persists in the save', ok,
    JSON.stringify({ pizza: s.pizzaRuns, repo: s.repoDone, cop: s.copArrests, slip: s.slipRank, mw: s.mwIdx, lawyer: s.lawyer, albert: s.albert, boat: s.boatBest, blocks: (s.blocksSeen || []).length, armor: s.armor, rush: s.bossrushDay }));
}

// ---- 25. no console errors ----
check('No page errors during the run', errors === 0, `${errors} errors`);

const fails = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);

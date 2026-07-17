import { showToast, showMissionMsg, showNews } from './hud.js';

// THE CITY CALENDAR: some days aren't like the others. FOG DAY drops a
// gray blanket over everything, BEACH DAY sends the city sunward (and
// triples cone sales), FESTIVAL doubles street-performance money, and
// TAX DAY... collects. A banner announces each morning.

function dayType(day) {
  if (day <= 0) return null;
  if (day % 7 === 3) return 'FOG DAY';
  if (day % 9 === 5) return 'BEACH DAY';
  if (day % 10 === 0) return 'FESTIVAL';
  if (day % 13 === 8) return 'TAX DAY';
  return null;
}

export function initCalendar(world) {
  world.calendar = { today: null, announced: -1 };
}

export function updateCalendar(world, dt, scene) {
  const cal = world.calendar;
  if (!cal) return;
  cal.today = dayType(world.dailyDay);

  // morning banner, once per day
  if (cal.announced !== world.dailyDay && world.clock > 7 && world.clock < 20) {
    cal.announced = world.dailyDay;
    if (cal.today === 'FOG DAY') {
      showMissionMsg('FOG DAY', 'The harbor exhaled overnight. Drive by feel.', '#9aa8b8');
      showNews('meteorologists apologize in advance for today');
    } else if (cal.today === 'BEACH DAY') {
      showMissionMsg('BEACH DAY', 'The whole city wants ice cream and bad decisions', '#f7d04a');
    } else if (cal.today === 'FESTIVAL') {
      showMissionMsg('STREET FESTIVAL', 'Double money for busking and trick combos today', '#f05a9a');
    } else if (cal.today === 'TAX DAY') {
      const tax = Math.min(world.money, Math.max(0, Math.round(world.money * 0.03)));
      if (tax > 0) {
        world.money -= tax;
        showMissionMsg('TAX DAY', `The city helps itself to $${tax}. Receipts unavailable.`, '#c94a3a');
        showNews('tax day proceeds smoothly for everyone who saw it coming');
      } else {
        showMissionMsg('TAX DAY', 'Nothing to take. The assessor sighs.', '#c94a3a');
      }
    }
  }

  // FOG DAY presses the fog in after daynight/weather have set it
  if (cal.today === 'FOG DAY' && scene.fog) {
    scene.fog.near = Math.min(scene.fog.near, 12);
    scene.fog.far = Math.min(scene.fog.far, 110);
  }

  // FESTIVAL doubles street-performance pay via a read-side multiplier
  world.festivalMult = cal.today === 'FESTIVAL' ? 2 : 1;
}

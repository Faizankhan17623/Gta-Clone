export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 24, headshot: 2, magazine: 12, reserve: 72, interval: 0.28, reload: 1.15, spread: 0.004, pellets: 1, color: 0x6f7b8c },
  rifle: { name: 'Rifle', damage: 15, headshot: 1.7, magazine: 30, reserve: 150, interval: 0.095, reload: 1.55, spread: 0.012, pellets: 1, color: 0x3d7f57 },
  shotgun: { name: 'Shotgun', damage: 10, headshot: 1.35, magazine: 6, reserve: 36, interval: 0.75, reload: 1.8, spread: 0.07, pellets: 8, color: 0x8b633d },
  sniper: { name: 'Sniper', damage: 85, headshot: 2.2, magazine: 5, reserve: 25, interval: 1.05, reload: 2.1, spread: 0.0005, pellets: 1, color: 0x33445f },
};

export function freshLoadout() {
  return Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, {
    unlocked: id === 'pistol', ammo: w.magazine, reserve: w.reserve,
  }]));
}

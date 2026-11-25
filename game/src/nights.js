// nights.js — night progression and upgrades for YATAI NIGHTS.

export const NIGHTS = [
  { night: 1, goal: 600, duration: 90, spawnEvery: 9, label: 'First Night' },
  { night: 2, goal: 900, duration: 90, spawnEvery: 8, label: 'Regulars Arrive' },
  { night: 3, goal: 1300, duration: 90, spawnEvery: 7, label: "The Critic's Whisper" },
  { night: 4, goal: 1800, duration: 90, spawnEvery: 6, label: 'Rush Season' },
  { night: 5, goal: 2400, duration: 90, spawnEvery: 5, label: 'Festival Night' },
];

export const RUSH_START = 35;
export const RUSH_END = 55;

export function isRush(nightTime) {
  return nightTime >= RUSH_START && nightTime < RUSH_END;
}

export const UPGRADES = [
  { id: 'second-pot', name: 'Second Pot', cost: 300, desc: 'Boil two bowls of noodles at once.' },
  { id: 'turbo-burner', name: 'Turbo Burner', cost: 250, desc: 'Noodles boil 30% faster.' },
  { id: 'comfy-stools', name: 'Comfy Stools', cost: 200, desc: 'Customers wait 25% longer.' },
  { id: 'lucky-lantern', name: 'Lucky Lantern', cost: 350, desc: 'Tips grow 25% bigger.' },
  { id: 'extra-seat', name: 'Extra Seat', cost: 400, desc: 'A fourth stool at the counter.' },
  { id: 'signboard', name: 'Painted Signboard', cost: 150, desc: 'Every price up 10%.' },
];

const upgradeIndex = new Map(UPGRADES.map((u) => [u.id, u]));

export function upgradeById(id) {
  return upgradeIndex.get(id) || null;
}

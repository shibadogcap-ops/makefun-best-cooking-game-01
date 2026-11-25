// recipes.js — broths, toppings, signatures and order helpers for YATAI NIGHTS.

export const BROTHS = [
  { id: 'shoyu', name: 'Shoyu', jp: '醤油', color: '#7a4a21', dark: '#5b3413', price: 90, unlockNight: 1 },
  { id: 'shio', name: 'Shio', jp: '塩', color: '#d9b96a', dark: '#b3923f', price: 85, unlockNight: 1 },
  { id: 'miso', name: 'Miso', jp: '味噌', color: '#a8642a', dark: '#7e4a1c', price: 100, unlockNight: 1 },
  { id: 'spicy', name: 'Spicy Miso', jp: '辛味噌', color: '#b33a1e', dark: '#8a2a14', price: 120, unlockNight: 3 },
];

export const TOPPINGS = [
  { id: 'negi', name: 'Spring Onion', jp: 'ねぎ', price: 10, unlockNight: 1, color: '#58b368' },
  { id: 'nori', name: 'Nori', jp: '海苔', price: 10, unlockNight: 1, color: '#1f3d2b' },
  { id: 'menma', name: 'Menma Bamboo', jp: 'メンマ', price: 15, unlockNight: 1, color: '#d9a45b' },
  { id: 'egg', name: 'Ajitama Egg', jp: '味玉', price: 20, unlockNight: 1, color: '#f2a541' },
  { id: 'chashu', name: 'Chashu Pork', jp: 'チャーシュー', price: 35, unlockNight: 2, color: '#d98a94' },
  { id: 'corn', name: 'Sweet Corn', jp: 'コーン', price: 15, unlockNight: 2, color: '#f7d038' },
  { id: 'butter', name: 'Butter', jp: 'バター', price: 20, unlockNight: 3, color: '#fbe89a' },
  { id: 'naruto', name: 'Narutomaki', jp: 'なると', price: 15, unlockNight: 3, color: '#f6f0f2' },
];

export const SIGNATURES = [
  { name: 'Shoyu Classic', broth: 'shoyu', toppings: ['negi', 'nori', 'egg'] },
  { name: 'Midnight Special', broth: 'miso', toppings: ['chashu', 'egg', 'corn', 'butter'] },
  { name: 'Shio Garden', broth: 'shio', toppings: ['negi', 'menma', 'naruto'] },
  { name: 'Spicy Volcano', broth: 'spicy', toppings: ['chashu', 'egg', 'negi'] },
];

const brothIndex = new Map(BROTHS.map((b) => [b.id, b]));
const toppingIndex = new Map(TOPPINGS.map((t) => [t.id, t]));

export function brothById(id) {
  return brothIndex.get(id) || null;
}

export function toppingById(id) {
  return toppingIndex.get(id) || null;
}

export function unlockedBroths(night) {
  return BROTHS.filter((b) => b.unlockNight <= night);
}

export function unlockedToppings(night) {
  return TOPPINGS.filter((t) => t.unlockNight <= night);
}

export function priceOf(order) {
  const broth = brothById(order.broth);
  const brothPrice = broth ? broth.price : 0;
  const toppingPrice = order.toppings.reduce((sum, id) => {
    const t = toppingById(id);
    return sum + (t ? t.price : 0);
  }, 0);
  return brothPrice + toppingPrice;
}

export function matchSignature(order) {
  const have = new Set(order.toppings);
  for (const sig of SIGNATURES) {
    if (sig.broth !== order.broth) continue;
    if (sig.toppings.length !== have.size) continue;
    if (sig.toppings.every((id) => have.has(id))) return sig.name;
  }
  return null;
}

function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

function shuffle(rng, array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generates one customer order for a given night.
// rng: () => [0,1) random function.
export function makeOrder(rng, night, toppingCount) {
  const broths = unlockedBroths(night);
  const toppings = unlockedToppings(night);
  const broth = pick(rng, broths);

  // 30% chance to serve a signature dish, if one is fully unlocked.
  if (rng() < 0.3 && toppings.length >= toppingCount) {
    const toppingIds = new Set(toppings.map((t) => t.id));
    const available = SIGNATURES.filter(
      (s) =>
        s.broth !== undefined &&
        brothById(s.broth) &&
        brothById(s.broth).unlockNight <= night &&
        s.toppings.every((id) => toppingIds.has(id))
    );
    if (available.length > 0) {
      const sig = pick(rng, available);
      const order = { broth: sig.broth, toppings: sig.toppings.slice(), signature: sig.name };
      order.price = priceOf(order);
      return order;
    }
  }

  const chosen = shuffle(rng, toppings).slice(0, Math.min(toppingCount, toppings.length));
  const order = { broth: broth.id, toppings: chosen.map((t) => t.id), signature: null };
  order.price = priceOf(order);
  order.signature = matchSignature(order);
  return order;
}

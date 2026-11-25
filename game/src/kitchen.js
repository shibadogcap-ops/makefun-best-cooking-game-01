// kitchen.js — pot boiling, bowl assembly and serving for YATAI NIGHTS.

import { priceOf, matchSignature } from './recipes.js';

export const BOIL_TIME = 4.0;
export const PERFECT_END = 6.5;

function turbo(upgrades) {
  return upgrades && upgrades.has('turbo-burner');
}

export function perfectEnd(upgrades) {
  return PERFECT_END * (turbo(upgrades) ? 0.7 : 1);
}

export function boilSeconds(upgrades) {
  return BOIL_TIME * (turbo(upgrades) ? 0.7 : 1);
}

export function createKitchen(upgrades) {
  const count = upgrades && upgrades.has('second-pot') ? 2 : 1;
  const pots = Array.from({ length: count }, () => ({ state: 'empty', t: 0 }));
  return { pots, bowl: { noodles: null, broth: null, toppings: [] }, lastServeAt: -99 };
}

export function startBoil(kitchen, i, upgrades) {
  const pot = kitchen.pots[i];
  if (!pot || pot.state !== 'empty') return false;
  pot.state = 'boiling';
  pot.t = 0;
  return true;
}

export function tickKitchen(kitchen, dt, upgrades) {
  const end = perfectEnd(upgrades);
  const boil = boilSeconds(upgrades);
  for (const pot of kitchen.pots) {
    if (pot.state !== 'boiling') continue;
    pot.t += dt;
    if (pot.t > end) pot.state = 'over';
    else if (pot.t >= boil) pot.state = 'perfect';
  }
}

export function potReady(pot) {
  return pot.state === 'perfect' || pot.state === 'over';
}

export function moveNoodlesToBowl(kitchen, i) {
  const pot = kitchen.pots[i];
  if (!pot || !potReady(pot) || kitchen.bowl.noodles !== null) return false;
  kitchen.bowl.noodles = pot.state === 'perfect' ? 'perfect' : 'over';
  pot.state = 'empty';
  pot.t = 0;
  return true;
}

export function setBroth(kitchen, brothId) {
  if (!kitchen.bowl.noodles || kitchen.bowl.toppings.length > 0) return false;
  kitchen.bowl.broth = brothId;
  return true;
}

export function addTopping(kitchen, toppingId) {
  const bowl = kitchen.bowl;
  if (!bowl.noodles || !bowl.broth) return false;
  if (bowl.toppings.includes(toppingId)) return false;
  bowl.toppings.push(toppingId);
  return true;
}

export function clearBowl(kitchen) {
  kitchen.bowl = { noodles: null, broth: null, toppings: [] };
}

export function bowlMatches(bowl, order) {
  if (!bowl.noodles || bowl.broth !== order.broth) return false;
  if (bowl.toppings.length !== order.toppings.length) return false;
  const have = new Set(bowl.toppings);
  return order.toppings.every((id) => have.has(id));
}

export function serveBowl(kitchen, customer, game, now) {
  const bowl = kitchen.bowl;
  if (!bowlMatches(bowl, customer.order)) return { ok: false };

  const perfect = bowl.noodles === 'perfect';
  let base = priceOf(customer.order);
  if (bowl.noodles === 'over') base = Math.floor(base / 2);

  const patience = customer.maxPatience > 0 ? customer.patience / customer.maxPatience : 0;
  let tipRate = 0.5 * patience;
  if (customer.type.picky && bowl.noodles !== 'perfect') tipRate = 0;

  if (now - kitchen.lastServeAt <= 6) game.combo += 1;
  else game.combo = 0;
  game.bestCombo = Math.max(game.bestCombo || 0, game.combo);

  let tipMult = Math.min(1 + 0.25 * game.combo, 3);
  if (game.upgrades && game.upgrades.has('lucky-lantern')) tipMult *= 1.25;

  let tip = Math.floor(base * tipRate * tipMult);
  const payMult = customer.type.payMult ?? 1;
  let total = Math.floor((base + tip) * payMult);
  if (game.upgrades && game.upgrades.has('signboard')) total = Math.floor(total * 1.1);

  clearBowl(kitchen);
  kitchen.lastServeAt = now;
  return { ok: true, total, base, tip: total - base, combo: game.combo, perfect };
}

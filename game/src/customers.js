// customers.js — customer types and spawning for YATAI NIGHTS.

import { makeOrder } from './recipes.js';

export const CUSTOMER_TYPES = [
  {
    id: 'salaryman',
    name: 'Salaryman',
    patience: 45,
    payMult: 1.0,
    minToppings: 2,
    maxToppings: 3,
    unlockNight: 1,
    desc: 'Tired office worker. Quick and simple.',
    skin: '#f2c9a0',
    shirt: '#2e3a5c',
    hair: '#1a1a1a',
    hairStyle: 'short',
  },
  {
    id: 'student',
    name: 'Student',
    patience: 30,
    payMult: 0.85,
    minToppings: 2,
    maxToppings: 2,
    unlockNight: 1,
    desc: 'Impatient student on a budget.',
    skin: '#f6d7b0',
    shirt: '#3f7d4e',
    hair: '#7a4a21',
    hairStyle: 'spiky',
  },
  {
    id: 'grandma',
    name: 'Grandma',
    patience: 70,
    payMult: 1.1,
    minToppings: 2,
    maxToppings: 3,
    unlockNight: 1,
    desc: 'Sweet grandma who tips generously.',
    skin: '#f0c8a0',
    shirt: '#8a5fa8',
    hair: '#cfcfcf',
    hairStyle: 'bun',
  },
  {
    id: 'drunk',
    name: 'Happy Uncle',
    patience: 80,
    payMult: 1.2,
    minToppings: 3,
    maxToppings: 4,
    unlockNight: 2,
    desc: 'A bit tipsy, orders everything, pays well.',
    skin: '#e8a878',
    shirt: '#d9c8a8',
    hair: '#4a3b2a',
    hairStyle: 'messy',
  },
  {
    id: 'critic',
    name: 'Food Critic',
    patience: 50,
    payMult: 2.0,
    minToppings: 3,
    maxToppings: 4,
    unlockNight: 3,
    desc: 'Exacting reviewer. Huge pay if you nail it.',
    skin: '#e8c8b8',
    shirt: '#232323',
    hair: '#2a2a2a',
    hairStyle: 'slick',
    picky: true,
  },
];

const typeIndex = new Map(CUSTOMER_TYPES.map((t) => [t.id, t]));

export function typeById(id) {
  return typeIndex.get(id) || null;
}

// Weighted pick among types unlocked at this night.
// Critic is rare (weight 1), drunk weight 2, everyone else weight 3.
export function pickType(rng, night) {
  const pool = CUSTOMER_TYPES.filter((t) => t.unlockNight <= night);
  const weights = pool.map((t) => {
    if (t.id === 'critic') return 1;
    if (t.id === 'drunk') return 2;
    return 3;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

let nextCustomerId = 1;

// Creates a customer with a fresh order for the given night.
export function spawnCustomer(rng, night) {
  const type = pickType(rng, night);
  const count = type.minToppings + Math.floor(rng() * (type.maxToppings - type.minToppings + 1));
  const order = makeOrder(rng, night, count);
  return {
    id: nextCustomerId++,
    type,
    order,
    patience: type.patience,
    maxPatience: type.patience,
    mood: 'waiting',
  };
}

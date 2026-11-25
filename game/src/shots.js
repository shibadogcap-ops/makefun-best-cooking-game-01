import { createKitchen } from './kitchen.js';
import { spawnCustomer, typeById } from './customers.js';
import { NIGHTS } from './nights.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nightInfo(night) {
  const index = Math.max(0, Math.min(NIGHTS.length, night) - 1);
  return NIGHTS[index] || NIGHTS[0];
}

function resetGame(game, night = 1) {
  const info = nightInfo(night);
  Object.assign(game, {
    screen: 'title',
    night: info.night,
    nightTime: 0,
    timeLeft: info.duration,
    bank: 0,
    totalEarned: 0,
    nightEarned: 0,
    served: 0,
    lost: 0,
    bestCombo: 0,
    combo: 0,
    comboTimer: 0,
    kitchen: createKitchen(new Set()),
    customers: [],
    spawnTimer: 0,
    upgrades: new Set(),
    popups: [],
    rush: false,
    message: '',
    messageT: 0,
  });
}

function sceneCustomer(rng, night, typeId, order, patienceFrac, mood = 'waiting') {
  const customer = spawnCustomer(rng, night);
  const type = typeById(typeId);
  if (type) customer.type = type;
  if (order) customer.order = order;
  customer.maxPatience = type ? type.patience : customer.maxPatience;
  customer.patience = customer.maxPatience * patienceFrac;
  customer.mood = mood;
  return customer;
}

function numberCustomers(customers) {
  customers.forEach((customer, index) => {
    customer.id = index + 1;
  });
}

function applyRush(game, rng) {
  resetGame(game, 2);
  game.screen = 'play';
  game.nightTime = 44;
  game.timeLeft = nightInfo(2).duration - game.nightTime;
  game.rush = true;
  game.upgrades = new Set(['second-pot']);
  game.kitchen = createKitchen(game.upgrades);
  game.kitchen.pots[0].state = 'perfect';
  game.kitchen.pots[0].t = 5;
  game.kitchen.pots[1].state = 'boiling';
  game.kitchen.pots[1].t = 2;
  game.kitchen.bowl = { noodles: 'perfect', broth: 'miso', toppings: ['chashu', 'egg'] };
  game.customers = [
    sceneCustomer(
      rng,
      2,
      'salaryman',
      { broth: 'miso', toppings: ['chashu', 'egg', 'corn', 'butter'], signature: 'Midnight Special' },
      0.7,
    ),
    sceneCustomer(rng, 2, 'student', null, 0.45),
    sceneCustomer(rng, 2, 'grandma', null, 0.85),
    sceneCustomer(rng, 2, 'drunk', null, 0.6),
  ];
  numberCustomers(game.customers);
  game.bank = 1240;
  game.totalEarned = game.bank;
  game.nightEarned = 340;
  game.served = 5;
  game.bestCombo = 3;
  game.combo = 3;
  game.comboTimer = 4;
  game.popups = [{ x: 600, y: 330, text: 'COMBO x3!', t: 0, life: 2, color: '#ffd34d' }];
}

function applyServe(game, rng) {
  resetGame(game, 1);
  game.screen = 'play';
  game.nightTime = 20;
  game.timeLeft = nightInfo(1).duration - game.nightTime;
  game.kitchen = createKitchen(game.upgrades);
  game.kitchen.pots[0].state = 'boiling';
  game.kitchen.pots[0].t = 1.5;
  game.kitchen.bowl = { noodles: 'perfect', broth: 'shoyu', toppings: ['negi', 'nori', 'egg'] };
  game.customers = [
    sceneCustomer(
      rng,
      1,
      'salaryman',
      { broth: 'shoyu', toppings: ['negi', 'nori', 'egg'], signature: 'Shoyu Classic' },
      0.9,
      'happy',
    ),
    sceneCustomer(rng, 1, 'student', null, 0.55),
  ];
  numberCustomers(game.customers);
  game.bank = 860;
  game.totalEarned = game.bank;
  game.nightEarned = 260;
  game.served = 3;
  game.bestCombo = 2;
  game.combo = 2;
  game.comboTimer = 3;
  game.popups = [
    { x: 600, y: 300, text: '+230', t: 0, life: 2, color: '#7dff8a' },
    { x: 640, y: 270, text: 'PERFECT!', t: 0, life: 2, color: '#ffd34d' },
  ];
}

function applyDayEnd(game) {
  resetGame(game, 2);
  game.screen = 'shop';
  game.upgrades = new Set(['second-pot']);
  game.kitchen = createKitchen(game.upgrades);
  game.nightTime = nightInfo(2).duration;
  game.timeLeft = 0;
  game.bank = 1730;
  game.totalEarned = 2140;
  game.nightEarned = 1240;
  game.served = 14;
  game.lost = 1;
  game.bestCombo = 5;
}

export function applyShot(game, name, seed = 1) {
  const rng = mulberry32(seed);
  if (name === 'rush') applyRush(game, rng);
  else if (name === 'serve') applyServe(game, rng);
  else if (name === 'dayend') applyDayEnd(game);
  else {
    resetGame(game, 1);
    game.screen = 'title';
  }
  game.message = '';
  game.messageT = 0;
  return game;
}

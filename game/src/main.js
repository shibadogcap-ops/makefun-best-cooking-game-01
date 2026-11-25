// main.js — YATAI NIGHTS: "Midnight Ramen Stall". Boot, input and the one loop.
// The renderer owns all drawing; this file owns the game object, the clock and
// every rule that moves it: nights, spawning, patience, combos, the till and
// the shop. ?shot=<name>&seed=<n> stages a frozen scene for screenshots.
import { BROTHS, TOPPINGS, unlockedToppings, unlockedBroths } from './recipes.js';
import { spawnCustomer } from './customers.js';
import {
  createKitchen,
  startBoil,
  tickKitchen,
  moveNoodlesToBowl,
  setBroth,
  addTopping,
  clearBowl,
  serveBowl,
  bowlMatches,
} from './kitchen.js';
import { NIGHTS, UPGRADES, isRush } from './nights.js';
import { drawScene, LAYOUT } from './render.js';
import { hitTest, keyAction } from './input.js';
import { sfx, ensureCtx } from './audio.js';
import { applyShot, mulberry32 } from './shots.js';

const W = 1280;
const H = 720;
const MAX_DT = 0.05;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const shotSeed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  screen: 'title',
  night: 1,
  nightTime: 0,
  timeLeft: 0,
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
  rng: Math.random,
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function nightInfo(night) {
  const index = Math.max(0, Math.min(NIGHTS.length, night) - 1);
  return NIGHTS[index];
}

function seatCount() {
  return game.upgrades.has('extra-seat') ? 4 : 3;
}

function customerPos(index) {
  if (index >= 0 && index < LAYOUT.seats.length) return LAYOUT.seats[index];
  const q = LAYOUT.queue[index - LAYOUT.seats.length];
  return q || { x: 640, y: 360 };
}

function addPopup(x, y, text, color) {
  game.popups.push({ x, y, text, t: 0, life: 2, color: color || '#ffe9b8' });
}

function say(text, seconds = 2.2) {
  game.message = text;
  game.messageT = seconds;
}

function brothName(id) {
  const b = BROTHS.find((x) => x.id === id);
  return b ? b.name : id;
}

function toppingName(id) {
  const t = TOPPINGS.find((x) => x.id === id);
  return t ? t.name : id;
}

function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}

function potReady(pot) {
  return pot && (pot.state === 'perfect' || pot.state === 'over');
}

function bowlEmpty() {
  const bowl = game.kitchen.bowl;
  return !bowl.noodles && !bowl.broth && bowl.toppings.length === 0;
}

// ---------------------------------------------------------------------------
// nights
// ---------------------------------------------------------------------------

function resetNight(night) {
  const info = nightInfo(night);
  game.night = info.night;
  game.nightTime = 0;
  game.timeLeft = info.duration;
  game.nightEarned = 0;
  game.customers = [];
  game.kitchen = createKitchen(game.upgrades);
  game.spawnTimer = 1;
  game.rush = false;
  game.combo = 0;
  game.comboTimer = 0;
  game.popups = [];
  game.screen = 'play';
}

function startNight(night) {
  resetNight(night);
}

// ---------------------------------------------------------------------------
// serving
// ---------------------------------------------------------------------------

function serveCustomer(customer) {
  const index = game.customers.indexOf(customer);
  if (index < 0) return false;
  const pos = customerPos(index);
  const result = serveBowl(game.kitchen, customer, game, game.nightTime);
  if (!result.ok) return false;

  game.bank += result.total;
  game.totalEarned += result.total;
  game.nightEarned += result.total;
  game.served += 1;
  game.comboTimer = 6;
  game.customers.splice(index, 1);

  addPopup(pos.x, pos.y - 46, `+${result.total}`, '#ffd34d');
  if (result.perfect) addPopup(pos.x, pos.y - 78, 'PERFECT!', '#7dff8a');
  sfx('serve');
  sfx('coin');
  return true;
}

function tryServeAny() {
  const bowl = game.kitchen.bowl;
  for (const customer of game.customers) {
    if (bowlMatches(bowl, customer.order)) {
      serveCustomer(customer);
      return true;
    }
  }
  say('No order matches this bowl');
  sfx('click');
  return false;
}

function describeOrder(order) {
  const broth = brothName(order.broth);
  const toppings = (order.toppings || []).map(toppingName).join(', ');
  return toppings ? `${broth} + ${toppings}` : broth;
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

function moveNoodlesFromPot(i) {
  const pot = game.kitchen.pots[i];
  if (!pot) return;
  if (pot.state === 'empty') {
    if (startBoil(game.kitchen, i, game.upgrades)) sfx('boil');
    else sfx('click');
    return;
  }
  if (!potReady(pot)) {
    say('Still boiling...');
    sfx('click');
    return;
  }
  const hadNoodles = game.kitchen.bowl.noodles !== null;
  if (moveNoodlesToBowl(game.kitchen, i)) {
    sfx('add');
    if (!hadNoodles) say('Noodles in! Pick a broth.');
  } else {
    say('The bowl already has noodles.');
    sfx('click');
  }
}

function handleAction(action) {
  if (!action) return;
  ensureCtx();
  const night = game.night;

  switch (action.kind) {
    case 'start':
      startNight(1);
      break;

    case 'pot':
      moveNoodlesFromPot(action.i);
      break;

    case 'bowl': {
      const i = game.kitchen.pots.findIndex(potReady);
      if (i >= 0) moveNoodlesFromPot(i);
      else {
        say('Nothing is ready — start a boil first.');
        sfx('click');
      }
      break;
    }

    case 'broth': {
      const broth = BROTHS.find((b) => b.id === action.id);
      if (!broth || !unlockedBroths(night).some((b) => b.id === action.id)) {
        sfx('click');
        break;
      }
      if (setBroth(game.kitchen, action.id)) {
        sfx('broth');
      } else if (!game.kitchen.bowl.noodles) {
        say('Boil noodles first');
        sfx('click');
      } else {
        say('Broth is set once toppings go in');
        sfx('click');
      }
      break;
    }

    case 'topping': {
      const topping = TOPPINGS.find((t) => t.id === action.id);
      if (!topping || !unlockedToppings(night).some((t) => t.id === action.id)) {
        sfx('click');
        break;
      }
      if (addTopping(game.kitchen, action.id)) {
        sfx('add');
      } else if (!game.kitchen.bowl.noodles || !game.kitchen.bowl.broth) {
        say('The bowl needs noodles and broth first');
        sfx('click');
      } else {
        say('Already in the bowl');
        sfx('click');
      }
      break;
    }

    case 'serve':
      tryServeAny();
      break;

    case 'customer': {
      const customer = action.customer;
      if (customer && bowlMatches(game.kitchen.bowl, customer.order)) {
        serveCustomer(customer);
      } else if (customer && customer.order) {
        say(`Wants: ${describeOrder(customer.order)}`);
        sfx('click');
      }
      break;
    }

    case 'trash':
      if (bowlEmpty()) {
        sfx('click');
      } else {
        clearBowl(game.kitchen);
        sfx('click');
      }
      break;

    case 'buy': {
      const upgrade = upgradeById(action.id);
      const affordable = upgrade && game.bank >= upgrade.cost && !game.upgrades.has(upgrade.id);
      if (affordable) {
        game.bank -= upgrade.cost;
        game.upgrades.add(upgrade.id);
        if (upgrade.id === 'second-pot' && game.kitchen.pots.length < 2) {
          game.kitchen.pots.push({ state: 'empty', t: 0 });
        }
        sfx('coin');
      } else {
        sfx('click');
      }
      break;
    }

    case 'next':
      startNight(game.night + 1);
      break;

    case 'again':
      game.bank = 0;
      game.totalEarned = 0;
      game.nightEarned = 0;
      game.served = 0;
      game.lost = 0;
      game.bestCombo = 0;
      game.combo = 0;
      game.comboTimer = 0;
      game.upgrades = new Set();
      game.customers = [];
      game.popups = [];
      game.kitchen = createKitchen(game.upgrades);
      game.night = 1;
      game.nightTime = 0;
      game.timeLeft = 0;
      game.rush = false;
      game.message = '';
      game.messageT = 0;
      game.screen = 'title';
      break;

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// simulation (play screen only, skipped while a shot is frozen)
// ---------------------------------------------------------------------------

function updatePlay(dt) {
  const info = nightInfo(game.night);
  game.nightTime += dt;
  game.timeLeft -= dt;
  game.rush = isRush(game.nightTime);

  tickKitchen(game.kitchen, dt, game.upgrades);

  // Spawning: the rush halves the interval; the stall seats seatCount
  // customers and tolerates two more in the queue lane.
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = info.spawnEvery * (game.rush ? 0.5 : 1);
    if (game.customers.length < seatCount() + 2) {
      const customer = spawnCustomer(game.rng, game.night);
      if (game.upgrades.has('comfy-stools')) {
        customer.patience *= 1.25;
        customer.maxPatience *= 1.25;
      }
      game.customers.push(customer);
    }
  }

  // Patience: who hits zero storms off, combo broken.
  for (let i = game.customers.length - 1; i >= 0; i -= 1) {
    const customer = game.customers[i];
    customer.patience -= dt;
    if (customer.patience <= 0 && customer.mood !== 'angry') {
      customer.mood = 'angry';
      const pos = customerPos(i);
      game.customers.splice(i, 1);
      game.lost += 1;
      game.combo = 0;
      game.comboTimer = 0;
      addPopup(pos.x, pos.y - 46, 'Left angry!', '#ff8a7a');
      sfx('angry');
    }
  }

  // Combo window.
  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      game.combo = 0;
    }
  }

  for (let i = game.popups.length - 1; i >= 0; i -= 1) {
    const p = game.popups[i];
    p.t += dt;
    if (p.t >= p.life) game.popups.splice(i, 1);
  }

  if (game.messageT > 0) game.messageT -= dt;

  if (game.timeLeft <= 0) {
    if (game.nightEarned >= info.goal) {
      if (game.night >= NIGHTS.length) {
        game.screen = 'results';
      } else {
        game.screen = 'shop';
      }
      sfx('win');
    } else {
      say('Goal missed — try the night again');
      resetNight(game.night);
    }
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

function toGameCoords(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  const y = ((event.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

canvas.addEventListener('click', (event) => {
  ensureCtx();
  const { x, y } = toGameCoords(event);
  handleAction(hitTest(game, x, y));
});

window.addEventListener('keydown', (event) => {
  ensureCtx();
  const action = keyAction(game, event.key);
  if (!action) return;
  event.preventDefault();
  handleAction(action);
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

if (shotName) {
  applyShot(game, shotName, shotSeed);
  game.rng = mulberry32(shotSeed);
  game.frozen = true;
}

let last = performance.now();
let elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;
  elapsed += dt;

  if (game.screen === 'play' && !game.frozen) updatePlay(dt);

  drawScene(ctx, game, elapsed);
}

requestAnimationFrame(frame);

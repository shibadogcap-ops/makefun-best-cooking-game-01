import { LAYOUT, RESULTS_AGAIN, SHOP_NEXT, cardRect } from './render.js';
import { BROTHS, TOPPINGS } from './recipes.js';
import { UPGRADES } from './nights.js';

function nightOf(game) {
  const n = game && game.night;
  if (typeof n === 'number') return n;
  if (n && typeof n.night === 'number') return n.night;
  return 1;
}

function unlocked(item, night) {
  return typeof item.unlockNight !== 'number' || item.unlockNight <= night;
}

function inRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function inCircle(x, y, c, r) {
  const dx = x - c.x;
  const dy = y - c.y;
  return dx * dx + dy * dy <= r * r;
}

function customerList(game) {
  const c = game && game.customers;
  if (!c) return [];
  if (Array.isArray(c)) return c;
  const out = [];
  if (Array.isArray(c.seats)) out.push(...c.seats);
  if (Array.isArray(c.queue)) out.push(...c.queue);
  if (out.length === 0 && Array.isArray(c.list)) out.push(...c.list);
  return out.filter(Boolean);
}

export function hitTest(game, x, y) {
  if (!game) return null;

  if (game.screen === 'title') return { kind: 'start' };

  if (game.screen === 'shop') {
    for (let i = 0; i < UPGRADES.length; i += 1) {
      if (inRect(x, y, cardRect(i))) return { kind: 'buy', id: UPGRADES[i].id };
    }
    if (inRect(x, y, SHOP_NEXT)) return { kind: 'next' };
    return null;
  }

  if (game.screen === 'results') {
    return inRect(x, y, RESULTS_AGAIN) ? { kind: 'again' } : null;
  }

  if (game.screen !== 'play') return null;

  for (let i = 0; i < LAYOUT.pots.length; i += 1) {
    if (inCircle(x, y, LAYOUT.pots[i], LAYOUT.pots[i].r)) return { kind: 'pot', i };
  }

  if (inCircle(x, y, LAYOUT.bowl, LAYOUT.bowl.r)) return { kind: 'bowl' };

  const night = nightOf(game);
  const brothLayout = LAYOUT.broths;
  for (let i = 0; i < BROTHS.length; i += 1) {
    const broth = BROTHS[i];
    if (!unlocked(broth, night)) continue;
    const r = {
      x: brothLayout.x0 + i * (brothLayout.w + brothLayout.gap),
      y: brothLayout.y ?? brothLayout.y0,
      w: brothLayout.w,
      h: brothLayout.h,
    };
    if (inRect(x, y, r)) return { kind: 'broth', id: broth.id };
  }

  const bins = LAYOUT.bins;
  const cols = bins.cols || 4;
  const binsY = bins.y ?? bins.y0;
  for (let i = 0; i < TOPPINGS.length; i += 1) {
    const topping = TOPPINGS[i];
    if (!unlocked(topping, night)) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const r = {
      x: bins.x0 + col * (bins.w + bins.gap),
      y: binsY + row * (bins.h + bins.gap),
      w: bins.w,
      h: bins.h,
    };
    if (inRect(x, y, r)) return { kind: 'topping', id: topping.id };
  }

  if (inRect(x, y, LAYOUT.serve)) return { kind: 'serve' };
  if (inRect(x, y, LAYOUT.trash)) return { kind: 'trash' };

  const customers = customerList(game);
  for (let i = 0; i < customers.length; i += 1) {
    const customer = customers[i];
    if (!customer) continue;
    let pos = null;
    if (i < LAYOUT.seats.length) pos = LAYOUT.seats[i];
    else {
      const q = LAYOUT.queue[i - LAYOUT.seats.length];
      if (q) pos = q;
    }
    if (pos && inCircle(x, y, pos, 46)) return { kind: 'customer', customer };
  }

  const ticket = LAYOUT.ticket;
  for (let i = 0; i < customers.length; i += 1) {
    const customer = customers[i];
    if (!customer) continue;
    const r = {
      x: ticket.x0 + i * (ticket.w + ticket.gap),
      y: ticket.y,
      w: ticket.w,
      h: ticket.h,
    };
    if (inRect(x, y, r)) return { kind: 'customer', customer };
  }

  return null;
}

export function keyAction(game, key) {
  if (!game) return null;
  const screen = game.screen;

  if (screen === 'play') {
    if (key === ' ') return { kind: 'serve' };
    if (key >= '1' && key <= '8') {
      const topping = TOPPINGS[Number(key) - 1];
      if (topping && unlocked(topping, nightOf(game))) return { kind: 'topping', id: topping.id };
      return null;
    }
    if (key === 'q') return { kind: 'pot', i: 0 };
    if (key === 'w') return { kind: 'pot', i: 1 };
    if (key === 'Backspace' || key === 'Delete') return { kind: 'trash' };
    return null;
  }

  if (key !== 'Enter') return null;
  if (screen === 'title') return { kind: 'start' };
  if (screen === 'shop') return { kind: 'next' };
  if (screen === 'results') return { kind: 'again' };
  return null;
}

// render.js — YATAI NIGHTS: "Midnight Ramen Stall". All drawing is canvas 2D paths,
// gradients and text on a fixed 1280x720 field; the caller owns the canvas, the
// transform and the clock. Every scene shares the same night-street backdrop so a
// screenshot of any screen reads as one coherent place: lantern glow, rain and a
// steaming bowl of ramen.
//
// State is read defensively: the game object is owned by the simulation, so field
// lookups fall back to sane defaults and nothing here throws on a sparse state.
import { BROTHS, TOPPINGS, brothById, toppingById } from './recipes.js';
import { NIGHTS, UPGRADES } from './nights.js';

export const LAYOUT = {
  board: { x: 16, y: 12, w: 472, h: 150 },
  ticket: { x0: 26, y: 22, w: 108, h: 132, gap: 10 },
  seats: [
    { x: 600, y: 455 },
    { x: 748, y: 455 },
    { x: 896, y: 455 },
    { x: 1044, y: 455 },
  ],
  queue: [
    { x: 1168, y: 318 },
    { x: 1168, y: 462 },
  ],
  pots: [
    { x: 105, y: 568, r: 54 },
    { x: 247, y: 568, r: 54 },
  ],
  bowl: { x: 478, y: 562, r: 66 },
  broths: { x0: 352, y: 650, w: 60, h: 52, gap: 8 },
  bins: { x0: 664, y: 486, w: 82, h: 62, gap: 8, cols: 4 },
  serve: { x: 1032, y: 486, w: 216, h: 64 },
  trash: { x: 1032, y: 562, w: 216, h: 52 },
  timer: { x: 872, y: 14, w: 392, h: 16 },
};

export const SHOP_NEXT = { x: 980, y: 630, w: 260, h: 56 };
export const RESULTS_AGAIN = { x: 515, y: 560, w: 250, h: 56 };

export function cardRect(i) {
  return { x: 90 + (i % 3) * 380, y: 210 + Math.floor(i / 3) * 190, w: 340, h: 160 };
}

const W = 1280;
const H = 720;
const TAU = Math.PI * 2;
const FONT =
  'system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function txt(ctx, s, x, y, size, color, align = 'left', weight = 700, baseline = 'alphabetic') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(s, x, y);
}

// Outlined text for things floating over busy art (popups, big titles).
function txtStroke(ctx, s, x, y, size, color, align = 'center', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.strokeStyle = 'rgba(10,10,20,0.85)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function ell(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function circ(ctx, x, y, r, fill) {
  ell(ctx, x, y, r, r, fill);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(c1);
  const b = p(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

// ---------------------------------------------------------------------------
// game-state readers (defensive: fields may be absent on early screens)
// ---------------------------------------------------------------------------

function nightIndex(game) {
  const n = game && game.night;
  let idx = 0;
  if (typeof n === 'number') idx = n - 1;
  else if (n && typeof n.night === 'number') idx = n.night - 1;
  return clamp(idx, 0, NIGHTS.length - 1);
}

function nightInfo(game) {
  return NIGHTS[nightIndex(game)];
}

function nightNumber(game) {
  return nightInfo(game).night;
}

function num(game, ...keys) {
  for (const k of keys) {
    const v = game && game[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function hasUpgrade(game, id) {
  const u = game && game.upgrades;
  if (!u) return false;
  if (typeof u.has === 'function') return u.has(id);
  if (Array.isArray(u)) return u.includes(id);
  return false;
}

// Ordered customer list: seats first, then the queue.
function orderedCustomers(game) {
  const c = game && game.customers;
  if (!c) return [];
  if (Array.isArray(c)) return c;
  const out = [];
  if (Array.isArray(c.seats)) out.push(...c.seats);
  if (Array.isArray(c.queue)) out.push(...c.queue);
  if (out.length === 0 && Array.isArray(c.list)) out.push(...c.list);
  return out.filter(Boolean);
}

function placedCustomers(game) {
  // Returns [{customer, x, y, queue}] — seats filled in order, overflow queues.
  const list = orderedCustomers(game);
  const placed = [];
  for (let i = 0; i < list.length; i += 1) {
    if (i < LAYOUT.seats.length) {
      placed.push({ customer: list[i], ...LAYOUT.seats[i], queue: false });
    } else {
      const q = LAYOUT.queue[i - LAYOUT.seats.length];
      if (q) placed.push({ customer: list[i], ...q, queue: true });
    }
  }
  return placed;
}

function kitchenState(game) {
  const k = (game && game.kitchen) || {};
  return {
    pots: Array.isArray(k.pots) ? k.pots : [],
    bowl: k.bowl || { noodles: null, broth: null, toppings: [] },
  };
}

function selectedBroth(game, bowl) {
  const direct =
    game && (game.selectedBroth || game.brothSel || game.brothId || game.broth);
  if (typeof direct === 'string' && brothById(direct)) return direct;
  return bowl && bowl.broth ? bowl.broth : null;
}

function bowlMatchesOrder(bowl, order) {
  if (!bowl || !order || !bowl.noodles || bowl.broth !== order.broth) return false;
  const want = order.toppings || [];
  if (want.length !== (bowl.toppings || []).length) return false;
  const have = new Set(bowl.toppings || []);
  return want.every((id) => have.has(id));
}

// ---------------------------------------------------------------------------
// topping & broth icons
// ---------------------------------------------------------------------------

export function drawToppingIcon(ctx, id, x, y, s) {
  const t = toppingById(id);
  const u = s / 2;
  ctx.save();
  ctx.translate(x, y);
  switch (id) {
    case 'egg': {
      // White ellipse with a glossy orange yolk.
      ell(ctx, 0, u * 0.15, u * 0.95, u * 0.72, '#f7f2e4');
      circ(ctx, 0, u * 0.12, u * 0.42, '#f2a541');
      circ(ctx, -u * 0.12, -u * 0.05, u * 0.12, '#ffd98a');
      break;
    }
    case 'chashu': {
      // Pink pork disc with a pale spiral of fat.
      circ(ctx, 0, 0, u * 0.9, '#d98a94');
      ctx.strokeStyle = '#f2c4ca';
      ctx.lineWidth = Math.max(1.5, u * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.35) {
        const r = (a / (TAU * 2.2)) * u * 0.75;
        const px = Math.cos(a + 0.6) * r;
        const py = Math.sin(a + 0.6) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      circ(ctx, -u * 0.28, -u * 0.3, u * 0.14, '#f7d9dc');
      break;
    }
    case 'nori': {
      // Dark green square sheet with a lighter centre stripe.
      rr(ctx, -u * 0.8, -u * 0.8, u * 1.6, u * 1.6, u * 0.22);
      ctx.fillStyle = '#1f3d2b';
      ctx.fill();
      ctx.strokeStyle = '#0f241a';
      ctx.lineWidth = Math.max(1, u * 0.08);
      ctx.stroke();
      ctx.fillStyle = '#2c5540';
      ctx.fillRect(-u * 0.16, -u * 0.62, u * 0.32, u * 1.24);
      break;
    }
    case 'menma': {
      // Three tan bamboo shoots fanned out.
      const sticks = [-0.5, 0, 0.5];
      for (const off of sticks) {
        ctx.save();
        ctx.translate(0, u * 0.15);
        ctx.rotate(off * 0.55);
        rr(ctx, -u * 0.16, -u * 0.85, u * 0.32, u * 1.7, u * 0.14);
        ctx.fillStyle = '#d9a45b';
        ctx.fill();
        ctx.strokeStyle = '#a8763a';
        ctx.lineWidth = Math.max(1, u * 0.07);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'negi': {
      // Five little green rings of spring onion.
      const pos = [
        [-0.42, -0.3],
        [0.42, -0.3],
        [-0.55, 0.15],
        [0.55, 0.15],
        [0, 0.5],
      ];
      for (const [px, py] of pos) {
        circ(ctx, px * u, py * u + u * 0.05, u * 0.3, '#eef7e8');
        ctx.strokeStyle = '#58b368';
        ctx.lineWidth = Math.max(1.5, u * 0.14);
        ctx.beginPath();
        ctx.arc(px * u, py * u + u * 0.05, u * 0.26, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'corn': {
      // A cluster of golden kernels.
      const cells = [
        [-0.5, -0.35],
        [0, -0.5],
        [0.5, -0.35],
        [-0.55, 0.05],
        [-0.2, -0.05],
        [0.2, -0.05],
        [0.55, 0.05],
        [-0.3, 0.45],
        [0.05, 0.55],
        [0.4, 0.45],
      ];
      for (const [px, py] of cells) {
        ell(ctx, px * u, py * u + u * 0.1, u * 0.24, u * 0.2, '#f7d038');
        ctx.strokeStyle = '#c9961f';
        ctx.lineWidth = Math.max(1, u * 0.06);
        ctx.stroke();
      }
      break;
    }
    case 'butter': {
      // A pale pat of butter with a glossy highlight.
      rr(ctx, -u * 0.85, -u * 0.45, u * 1.7, u * 0.9, u * 0.28);
      ctx.fillStyle = '#fbe89a';
      ctx.fill();
      ctx.strokeStyle = '#d9b95e';
      ctx.lineWidth = Math.max(1, u * 0.07);
      ctx.stroke();
      ell(ctx, -u * 0.3, -u * 0.18, u * 0.4, u * 0.14, 'rgba(255,255,255,0.75)');
      break;
    }
    case 'naruto': {
      // White fish cake disc with a pink swirl.
      circ(ctx, 0, 0, u * 0.85, '#f6f0f2');
      ctx.strokeStyle = '#f28ba0';
      ctx.lineWidth = Math.max(1.5, u * 0.13);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let a = 0; a < TAU * 1.6; a += 0.3) {
        const r = (a / (TAU * 1.6)) * u * 0.6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    default: {
      const color = (t && t.color) || '#9aa3b5';
      circ(ctx, 0, 0, u * 0.8, color);
      txt(ctx, '?', 0, u * 0.32, s * 0.55, '#10131c', 'center');
    }
  }
  ctx.restore();
}

// Small bowl of a given broth: bowl arc, coloured surface, steam curl.
export function drawBrothLadleIcon(ctx, broth, x, y, s) {
  const b = typeof broth === 'string' ? brothById(broth) : broth;
  const color = (b && b.color) || '#8a8f9a';
  const dark = (b && b.dark) || '#5b5f6b';
  const u = s / 2;
  ctx.save();
  ctx.translate(x, y);
  // Steam curl.
  ctx.strokeStyle = 'rgba(230,235,245,0.75)';
  ctx.lineWidth = Math.max(1, u * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-u * 0.15, -u * 0.85);
  ctx.quadraticCurveTo(-u * 0.5, -u * 1.05, -u * 0.2, -u * 1.25);
  ctx.stroke();
  // Bowl body (lower half ellipse + foot).
  ctx.beginPath();
  ctx.ellipse(0, u * 0.35, u * 0.8, u * 0.42, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#f2ede0';
  ctx.fill();
  ctx.strokeStyle = '#b8ad93';
  ctx.lineWidth = Math.max(1, u * 0.07);
  ctx.stroke();
  // Broth surface.
  ctx.beginPath();
  ctx.ellipse(0, u * 0.3, u * 0.66, u * 0.26, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, u * 0.06);
  ctx.stroke();
  // Noodle hint: two wavy strokes on the surface.
  ctx.strokeStyle = 'rgba(247,227,161,0.9)';
  ctx.lineWidth = Math.max(1, u * 0.07);
  for (const off of [-0.16, 0.14]) {
    ctx.beginPath();
    ctx.moveTo(-u * 0.4, u * (0.3 + off));
    ctx.quadraticCurveTo(-u * 0.1, u * (0.24 + off), 0, u * (0.3 + off));
    ctx.quadraticCurveTo(u * 0.15, u * (0.36 + off), u * 0.38, u * (0.3 + off));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// customers
// ---------------------------------------------------------------------------

function drawHair(ctx, style, r, color) {
  // All styles share a dome; extras sit on top.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.04, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  switch (style) {
    case 'bun': {
      circ(ctx, 0, -r * 1.18, r * 0.42, color);
      circ(ctx, -r * 0.2, -r * 1.05, r * 0.12, 'rgba(255,255,255,0.25)');
      break;
    }
    case 'spiky': {
      for (let i = -2; i <= 2; i += 1) {
        const bx = i * r * 0.38;
        const h = r * (0.5 + (2 - Math.abs(i)) * 0.18);
        ctx.beginPath();
        ctx.moveTo(bx - r * 0.22, -r * 0.82);
        ctx.lineTo(bx, -r * (0.82 + h / r));
        ctx.lineTo(bx + r * 0.22, -r * 0.82);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'messy': {
      for (const [dx, dy, rr2] of [
        [-0.55, -0.75, 0.3],
        [0.1, -0.95, 0.34],
        [0.6, -0.7, 0.28],
      ]) {
        circ(ctx, dx * r, dy * r, r * rr2, color);
      }
      break;
    }
    case 'slick': {
      // Side-swept fringe: a wedge across the forehead.
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.15);
      ctx.quadraticCurveTo(-r * 0.4, -r * 1.35, r * 0.9, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.5, -r * 1.0, -r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'short':
    default:
      break;
  }
}

export function drawCustomerFigure(ctx, customer, x, y, scale, t) {
  const type = (customer && customer.type) || {};
  const skin = type.skin || '#f2c9a0';
  const shirt = type.shirt || '#4a6fa5';
  const hair = type.hair || '#3a2c1e';
  const style = type.hairStyle || 'short';
  const mood = customer && customer.mood ? customer.mood : 'waiting';
  const bob = Math.sin((t || 0) * 2 + ((customer && customer.id) || 0) * 1.7) * 1.4;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale || 1, scale || 1);

  // Soft contact shadow.
  ell(ctx, 0, 2, 30, 7, 'rgba(0,0,0,0.28)');

  // Legs.
  ctx.fillStyle = '#333a4d';
  rr(ctx, -17, -56, 13, 56, 5);
  ctx.fill();
  rr(ctx, 4, -56, 13, 56, 5);
  ctx.fill();
  // Shoes.
  ctx.fillStyle = '#22262f';
  rr(ctx, -19, -8, 17, 8, 3);
  ctx.fill();
  rr(ctx, 2, -8, 17, 8, 3);
  ctx.fill();

  // Torso.
  rr(ctx, -24, -122, 48, 72, 16);
  ctx.fillStyle = shirt;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Collar.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(-12, -120);
  ctx.lineTo(0, -104);
  ctx.lineTo(12, -120);
  ctx.closePath();
  ctx.fill();
  // Arms.
  ctx.fillStyle = shirt;
  rr(ctx, -31, -116, 10, 44, 5);
  ctx.fill();
  rr(ctx, 21, -116, 10, 44, 5);
  ctx.fill();
  circ(ctx, -26, -70, 6, skin);
  circ(ctx, 26, -70, 6, skin);

  // Head.
  const hy = -148;
  circ(ctx, 0, hy, 25, skin);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Ears.
  circ(ctx, -24, hy + 2, 4.5, skin);
  circ(ctx, 24, hy + 2, 4.5, skin);
  ctx.save();
  ctx.translate(0, hy);
  drawHair(ctx, style, 25, hair);
  ctx.restore();

  // Face.
  ctx.fillStyle = '#26221e';
  circ(ctx, -9, hy - 2, 3, '#26221e');
  circ(ctx, 9, hy - 2, 3, '#26221e');
  // Brows.
  ctx.strokeStyle = hair;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  if (mood === 'angry') {
    ctx.beginPath();
    ctx.moveTo(-14, hy - 12);
    ctx.lineTo(-5, hy - 8);
    ctx.moveTo(14, hy - 12);
    ctx.lineTo(5, hy - 8);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-14, hy - 10);
    ctx.lineTo(-5, hy - 11);
    ctx.moveTo(5, hy - 11);
    ctx.lineTo(14, hy - 10);
    ctx.stroke();
  }
  // Mouth by mood.
  ctx.strokeStyle = '#7a3b32';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  if (mood === 'happy') {
    ctx.arc(0, hy + 6, 9, 0.25, Math.PI - 0.25);
  } else if (mood === 'angry') {
    ctx.arc(0, hy + 20, 9, Math.PI + 0.4, TAU - 0.4);
  } else {
    ctx.moveTo(-6, hy + 10);
    ctx.lineTo(6, hy + 10);
  }
  ctx.stroke();
  // Blush when happy.
  if (mood === 'happy') {
    ctx.fillStyle = 'rgba(240,120,110,0.35)';
    ell(ctx, -15, hy + 6, 5, 3, 'rgba(240,120,110,0.35)');
    ell(ctx, 15, hy + 6, 5, 3, 'rgba(240,120,110,0.35)');
  }

  // Patience bar above the head (hidden once the customer is happy).
  if (mood !== 'happy' && customer && typeof customer.patience === 'number') {
    const max = customer.maxPatience || 1;
    const frac = clamp(customer.patience / max, 0, 1);
    const bw = 62;
    const bx = -bw / 2;
    const by = -196;
    ctx.fillStyle = 'rgba(8,10,18,0.72)';
    rr(ctx, bx - 1.5, by - 1.5, bw + 3, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = mixColor('#e5534b', '#6fd66f', frac);
    if (frac > 0.02) {
      rr(ctx, bx, by, Math.max(6, bw * frac), 6, 3);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// backdrop: night sky, buildings, the yatai stall, wet street, rain
// ---------------------------------------------------------------------------

// Deterministic pseudo-random for stars and windows (stable frame to frame).
function hash01(i, salt) {
  const v = Math.sin(i * 127.1 + (salt || 0) * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

const STARS = Array.from({ length: 110 }, (_, i) => ({
  x: hash01(i, 1) * W,
  y: hash01(i, 2) * 330,
  r: 0.6 + hash01(i, 3) * 1.7,
  tw: hash01(i, 4) * TAU,
}));

// [x, w, height, windowSeed] — silhouettes along the horizon.
const BUILDINGS = [
  [-30, 170, 150, 3],
  [120, 130, 190, 7],
  [240, 180, 120, 11],
  [410, 150, 170, 5],
  [560, 120, 210, 13],
  [680, 170, 140, 2],
  [850, 140, 190, 9],
  [990, 160, 160, 4],
  [1140, 180, 220, 8],
  [1280, 140, 150, 12],
];
const HORIZON = 400;

function drawSky(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
  g.addColorStop(0, '#070b1d');
  g.addColorStop(0.55, '#131a3d');
  g.addColorStop(1, '#2c2350');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 40);

  // Stars.
  for (const s of STARS) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.8 + s.tw));
    ctx.fillStyle = `rgba(220,230,255,${a * 0.8})`;
    circ(ctx, s.x, s.y, s.r, `rgba(220,230,255,${a * 0.8})`);
  }

  // Moon with a soft halo.
  const mx = 1090;
  const my = 92;
  const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 110);
  halo.addColorStop(0, 'rgba(244,234,208,0.30)');
  halo.addColorStop(1, 'rgba(244,234,208,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(mx, my, 110, 0, TAU);
  ctx.fill();
  circ(ctx, mx, my, 38, '#f4ead0');
  circ(ctx, mx - 12, my - 8, 7, '#e2d3ae');
  circ(ctx, mx + 10, my + 12, 5, '#e2d3ae');
  circ(ctx, mx + 4, my - 16, 4, '#e2d3ae');
}

function drawBuildings(ctx, t) {
  for (let layer = 0; layer < 2; layer += 1) {
    const off = layer === 0 ? -14 : 0;
    const col = layer === 0 ? '#0c1128' : '#141b3d';
    for (let i = 0; i < BUILDINGS.length; i += 1) {
      const [bx, bw, bh, seed] = BUILDINGS[i];
      const top = HORIZON + 16 - bh + off;
      ctx.fillStyle = col;
      ctx.fillRect(bx, top, bw, HORIZON + 20 - top);
      // Roof lip.
      ctx.fillStyle = layer === 0 ? '#0a0e20' : '#10152e';
      ctx.fillRect(bx - 4, top, bw + 8, 8);
      if (layer === 1) {
        // Lit windows, deterministic per building.
        const cols = Math.max(2, Math.floor(bw / 26));
        const rows = Math.max(2, Math.floor((bh - 30) / 30));
        for (let c = 0; c < cols; c += 1) {
          for (let rw = 0; rw < rows; rw += 1) {
            const lit = hash01(seed * 31 + c * 7 + rw * 13, 5) < 0.32;
            const wx = bx + 8 + c * ((bw - 16) / cols);
            const wy = top + 18 + rw * 28;
            ctx.fillStyle = lit ? 'rgba(255,214,138,0.85)' : '#1c2447';
            ctx.fillRect(wx, wy, 10, 14);
          }
        }
        // Occasional antenna with a blinking beacon.
        if (seed % 3 === 0) {
          const ax = bx + bw / 2;
          ctx.strokeStyle = '#0a0e20';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ax, top);
          ctx.lineTo(ax, top - 26);
          ctx.stroke();
          const blink = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.4 + seed));
          circ(ctx, ax, top - 28, 3.5, `rgba(255,90,80,${blink})`);
        }
      }
    }
  }
}

function drawStreet(ctx, t) {
  const g = ctx.createLinearGradient(0, HORIZON - 10, 0, H);
  g.addColorStop(0, '#20263f');
  g.addColorStop(0.4, '#161b2c');
  g.addColorStop(1, '#0b0e18');
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON - 10, W, H - HORIZON + 10);

  // Wet sheen: faint horizontal band where lantern light pools.
  const sheen = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 120);
  sheen.addColorStop(0, 'rgba(255,170,90,0.05)');
  sheen.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, HORIZON, W, 120);

  // Puddles with warm reflections on the open street (right of the stall).
  const puddles = [
    [1160, 560, 90, 10],
    [1210, 640, 60, 7],
    [60, 620, 70, 8],
    [1130, 470, 55, 6],
  ];
  for (const [px, py, prx, pry] of puddles) {
    ell(ctx, px, py, prx, pry, 'rgba(38,48,78,0.8)');
    ell(ctx, px, py - pry * 0.2, prx * 0.7, pry * 0.5, 'rgba(255,170,100,0.16)');
  }

  // Lantern light spilling onto the street at the stall's right edge.
  const spill = ctx.createRadialGradient(1130, 520, 20, 1130, 520, 260);
  spill.addColorStop(0, 'rgba(255,140,70,0.14)');
  spill.addColorStop(1, 'rgba(255,140,70,0)');
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.ellipse(1130, 520, 260, 200, 0, 0, TAU);
  ctx.fill();
}

function lantern(ctx, x, anchorY, len, phase, t) {
  const sway = Math.sin(t * 1.1 + phase) * 0.055;
  ctx.save();
  ctx.translate(x, anchorY);
  ctx.rotate(sway);
  // Hanging string.
  ctx.strokeStyle = '#2c2620';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, len);
  ctx.stroke();
  const cy = len + 26;
  const r = 22;
  // Warm halo.
  const halo = ctx.createRadialGradient(0, cy, r * 0.3, 0, cy, r * 3.4);
  halo.addColorStop(0, 'rgba(255,120,60,0.32)');
  halo.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, cy, r * 3.4, 0, TAU);
  ctx.fill();
  // Caps.
  ctx.fillStyle = '#3a2c22';
  rr(ctx, -9, cy - r - 8, 18, 9, 3);
  ctx.fill();
  rr(ctx, -9, cy + r - 1, 18, 8, 3);
  ctx.fill();
  // Paper body with vertical ribs.
  const body = ctx.createLinearGradient(-r, 0, r, 0);
  body.addColorStop(0, '#c93a2e');
  body.addColorStop(0.5, '#ff8a4a');
  body.addColorStop(1, '#c93a2e');
  ctx.beginPath();
  ctx.ellipse(0, cy, r * 0.92, r * 1.12, 0, 0, TAU);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,20,10,0.55)';
  ctx.lineWidth = 1.4;
  for (const off of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.ellipse(0, cy, r * 0.92 * Math.abs(Math.cos(off * 1.2)), r * 1.12, 0, 0, TAU);
    ctx.stroke();
  }
  // Glyph.
  txt(ctx, 'ら', 0, cy + 7, 20, 'rgba(255,240,210,0.95)', 'center');
  ctx.restore();
}

function drawStall(ctx, t) {
  // --- wooden cart body -------------------------------------------------
  const wallX = 88;
  const wallR = 1092;
  // Back wall planks.
  ctx.fillStyle = '#6b4426';
  ctx.fillRect(wallX, 214, wallR - wallX, 246);
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 2;
  for (let y = 240; y < 456; y += 26) {
    ctx.beginPath();
    ctx.moveTo(wallX, y);
    ctx.lineTo(wallR, y);
    ctx.stroke();
  }
  // Side posts.
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(64, 150, 26, 336);
  ctx.fillRect(1090, 150, 26, 336);
  ctx.fillStyle = '#5f3d24';
  ctx.fillRect(64, 150, 8, 336);
  ctx.fillRect(1090, 150, 8, 336);

  // Shelf with jars on the back wall.
  ctx.fillStyle = '#54331d';
  ctx.fillRect(180, 330, 258, 10);
  const jars = ['#7a4a21', '#a8642a', '#d9b96a', '#5b3413'];
  for (let i = 0; i < jars.length; i += 1) {
    const jx = 205 + i * 68;
    ctx.fillStyle = jars[i];
    rr(ctx, jx, 296, 34, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#2c2620';
    rr(ctx, jx + 8, 288, 18, 9, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(jx + 5, 300, 6, 22);
  }

  // Menu slips.
  const slips = ['醤油', '味噌', '塩', '辛'];
  for (let i = 0; i < slips.length; i += 1) {
    const sx = 780 + i * 50;
    ctx.fillStyle = '#efe4c8';
    rr(ctx, sx, 268, 34, 52, 4);
    ctx.fill();
    ctx.strokeStyle = '#8a6a42';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    txt(ctx, slips[i], sx + 17, 300, 20, '#3a2c1e', 'center');
  }

  // Noren curtain: three panels with らーめん on the middle one.
  const norenX = 452;
  const norenY = 216;
  const panelW = 88;
  const gap = 8;
  // Rod.
  ctx.fillStyle = '#3a2c22';
  ctx.fillRect(norenX - 8, norenY - 6, panelW * 3 + gap * 2 + 16, 8);
  for (let i = 0; i < 3; i += 1) {
    const px = norenX + i * (panelW + gap);
    ctx.fillStyle = '#e9dfc6';
    rr(ctx, px, norenY + 2, panelW, 118, 3);
    ctx.fill();
    ctx.strokeStyle = '#3a5a8c';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(58,90,140,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 8, norenY + 12, panelW - 16, 96);
  }
  txt(ctx, 'らーめん', norenX + panelW + gap + panelW / 2, norenY + 66, 26, '#2c3e66', 'center', 800);
  circ(ctx, norenX + panelW / 2, norenY + 78, 16, '#3a5a8c');
  txt(ctx, 'め', norenX + panelW / 2, norenY + 84, 16, '#e9dfc6', 'center');
  circ(ctx, norenX + panelW * 2 + gap * 2 + panelW / 2, norenY + 78, 16, '#3a5a8c');
  txt(ctx, 'ん', norenX + panelW * 2 + gap * 2 + panelW / 2, norenY + 84, 16, '#e9dfc6', 'center');

  // Lanterns under the roof.
  lantern(ctx, 180, 168, 66, 0, t);
  lantern(ctx, 372, 168, 40, 2.1, t);
  lantern(ctx, 806, 168, 40, 4.2, t);
  lantern(ctx, 998, 168, 66, 5.3, t);

  // --- roof awning: red/cream stripes with scalloped hem --------------
  const roofY = 150;
  const awnTop = 168;
  const awnBot = 206;
  ctx.fillStyle = '#7a2622';
  ctx.fillRect(58, roofY, 1064, awnTop - roofY + 4);
  const stripe = 46;
  for (let i = 0; i < Math.ceil(1064 / stripe); i += 1) {
    const sx = 58 + i * stripe;
    ctx.fillStyle = i % 2 === 0 ? '#b8433c' : '#f0e2c4';
    ctx.fillRect(sx, awnTop, stripe, awnBot - awnTop);
    // Scallop.
    ctx.beginPath();
    ctx.arc(sx + stripe / 2, awnBot, stripe / 2, 0, Math.PI);
    ctx.fill();
  }
  // Valance trim.
  ctx.fillStyle = '#5e1d1a';
  ctx.fillRect(58, awnTop - 3, 1064, 5);

  // --- counter: top surface then the front face ------------------------
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(56, 452, 1068, 20);
  ctx.fillStyle = '#a97848';
  ctx.fillRect(56, 452, 1068, 8);
  const cg = ctx.createLinearGradient(0, 472, 0, 716);
  cg.addColorStop(0, '#7a5230');
  cg.addColorStop(1, '#54331d');
  ctx.fillStyle = cg;
  ctx.fillRect(56, 472, 1068, 244);
  // Plank seams + subtle sheen.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  for (let x = 104; x < 1124; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 476);
    ctx.lineTo(x, 712);
    ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(0, 472, 0, 560);
  sheen.addColorStop(0, 'rgba(255,220,170,0.10)');
  sheen.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(56, 472, 1068, 88);
  // Painted stall name on the counter front.
  txt(ctx, 'ラーメン', 140, 560, 26, 'rgba(255,230,190,0.28)', 'center', 800);
  txt(ctx, 'YATAI', 140, 584, 15, 'rgba(255,230,190,0.22)', 'center', 800);
}

// A raised wooden queue deck beside the stall's right side: the back queue spot
// (feet ~y318) stands on the slab, the front one (~y462) on the street below.
function drawQueueDeck(ctx) {
  const x0 = 1096;
  const x1 = 1280;
  const top = 312;
  const face = 350;
  // Support posts down to the street.
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(1124, face, 14, 240);
  ctx.fillRect(1246, face, 14, 240);
  ctx.fillStyle = '#5f3d24';
  ctx.fillRect(x0 + 20, face, x1 - x0 - 40, 26);
  // Slab: lit top edge + plank front.
  ctx.fillStyle = '#a97848';
  ctx.fillRect(x0, top, x1 - x0, 10);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x0, top + 10, x1 - x0, face - top - 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let px = x0 + 44; px < x1; px += 44) {
    ctx.beginPath();
    ctx.moveTo(px, top + 4);
    ctx.lineTo(px, face);
    ctx.stroke();
  }
  // Low railing stubs with a sagging rope.
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(x0 + 6, top - 22, 8, 24);
  ctx.fillRect(x1 - 14, top - 22, 8, 24);
  ctx.strokeStyle = '#8a6a42';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 + 10, top - 13);
  ctx.quadraticCurveTo((x0 + x1) / 2, top, x1 - 10, top - 13);
  ctx.stroke();
}

function drawRain(ctx, t) {
  ctx.strokeStyle = 'rgba(165,195,255,0.30)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 80; i += 1) {
    const rx = (hash01(i, 9) * (W + 120) + t * (60 + (i % 5) * 22)) % (W + 120) - 60;
    const speed = 640 + (i % 6) * 55;
    const ry = (hash01(i, 4) * (H + 120) + t * speed) % (H + 120) - 60;
    const len = 13 + (i % 4) * 5;
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 3.5, ry + len);
  }
  ctx.stroke();
}

function drawBackdrop(ctx, t) {
  drawSky(ctx, t);
  drawBuildings(ctx, t);
  drawStreet(ctx, t);
  drawStall(ctx, t);
  drawQueueDeck(ctx);
  drawRain(ctx, t);
}

// ---------------------------------------------------------------------------
// order board + tickets
// ---------------------------------------------------------------------------

function drawTicket(ctx, customer, x, y, w, h) {
  const order = (customer && customer.order) || {};
  const broth = brothById(order.broth) || BROTHS[0];
  const patience = customer && typeof customer.patience === 'number' ? customer.patience : 0;
  const maxP = (customer && customer.maxPatience) || 1;
  const pFrac = clamp(patience / maxP, 0, 1);
  const type = (customer && customer.type) || {};

  // Paper ticket.
  ctx.fillStyle = '#f7ecd2';
  rr(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = '#b99b62';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Pin hole.
  circ(ctx, x + w / 2, y + 7, 3, '#8a6a42');

  // Broth colour band with the broth name.
  ctx.fillStyle = broth.color;
  rr(ctx, x + 5, y + 14, w - 10, 20, 4);
  ctx.fill();
  txt(ctx, `${broth.jp} ${broth.name}`, x + w / 2, y + 29, 11, '#fff6e8', 'center');

  // Mini face.
  const fx = x + 19;
  const fy = y + 62;
  circ(ctx, fx, fy, 13, type.skin || '#f2c9a0');
  ctx.fillStyle = type.hair || '#3a2c1e';
  ctx.beginPath();
  ctx.arc(fx, fy - 3, 13, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  if (type.hairStyle === 'bun') circ(ctx, fx, fy - 15, 5, type.hair || '#3a2c1e');
  ctx.fillStyle = '#26221e';
  circ(ctx, fx - 4.5, fy, 1.8, '#26221e');
  circ(ctx, fx + 4.5, fy, 1.8, '#26221e');
  ctx.strokeStyle = '#7a3b32';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (customer && customer.mood === 'happy') ctx.arc(fx, fy + 4, 4, 0.3, Math.PI - 0.3);
  else if (customer && customer.mood === 'angry') ctx.arc(fx, fy + 11, 4, Math.PI + 0.4, TAU - 0.4);
  else {
    ctx.moveTo(fx - 3.5, fy + 7);
    ctx.lineTo(fx + 3.5, fy + 7);
  }
  ctx.stroke();

  // Topping icons in a row under the face.
  const icons = order.toppings || [];
  const startX = x + w / 2 - ((icons.length - 1) * 20) / 2;
  for (let i = 0; i < icons.length; i += 1) {
    drawToppingIcon(ctx, icons[i], startX + i * 20, y + 85, 18);
  }

  // Signature star + name on its own line, price below-right.
  if (order.signature) {
    ctx.fillStyle = '#e8a93c';
    drawStar(ctx, x + 12, y + 100, 7, '#e8a93c');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 92, w - 14, 14);
    ctx.clip();
    txt(ctx, order.signature, x + 22, y + 106, 8, '#8a5a10', 'left', 700);
    ctx.restore();
  }
  txt(ctx, `¥${order.price ?? ''}`, x + w - 9, y + 117, 12, '#2c3e66', 'right', 800);

  // Patience bar along the bottom edge.
  const bw = w - 14;
  const bx = x + 7;
  const by = y + h - 14;
  ctx.fillStyle = 'rgba(30,25,15,0.35)';
  rr(ctx, bx, by, bw, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = mixColor('#e5534b', '#6fd66f', pFrac);
  if (pFrac > 0.02) {
    rr(ctx, bx, by, Math.max(5, bw * pFrac), 7, 3.5);
    ctx.fill();
  }
}

function drawStar(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawOrderBoard(ctx, game) {
  const b = LAYOUT.board;
  // Wooden board with a hanging look.
  ctx.fillStyle = '#4a2f1c';
  rr(ctx, b.x - 6, b.y - 6, b.w + 12, b.h + 12, 10);
  ctx.fill();
  ctx.fillStyle = '#7a5230';
  rr(ctx, b.x, b.y, b.w, b.h, 8);
  ctx.fill();
  ctx.strokeStyle = '#3a2413';
  ctx.lineWidth = 3;
  ctx.stroke();

  const customers = orderedCustomers(game).slice(0, 4);
  const t = LAYOUT.ticket;
  for (let i = 0; i < customers.length; i += 1) {
    drawTicket(ctx, customers[i], t.x0 + i * (t.w + t.gap), t.y, t.w, t.h);
  }
}

// ---------------------------------------------------------------------------
// kitchen: pots, assembly bowl, broth ladles, topping bins, serve/trash
// ---------------------------------------------------------------------------

function steamWisp(ctx, x, y, t, seed) {
  for (let i = 0; i < 3; i += 1) {
    const ph = (t * 0.45 + i * 0.33 + seed * 0.17) % 1;
    const sx = x + Math.sin(t * 2 + i * 2.1 + seed * 7) * 9;
    const sy = y - 10 - ph * 74;
    const a = (1 - ph) * 0.3;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 9 + ph * 9);
    g.addColorStop(0, `rgba(235,240,250,${a})`);
    g.addColorStop(1, 'rgba(235,240,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 9 + ph * 9, 0, TAU);
    ctx.fill();
  }
}

function boilWindow(game) {
  const turbo = hasUpgrade(game, 'turbo-burner') ? 0.7 : 1;
  return { boil: 4.0 * turbo, end: 6.5 * turbo };
}

function drawPot(ctx, pot, def, t, game) {
  const { x, y, r } = def;
  const state = pot ? pot.state : 'empty';
  const pt = pot ? pot.t || 0 : 0;
  const { boil, end } = boilWindow(game);

  // Shadow + body.
  ell(ctx, x, y + r * 0.92, r * 1.02, r * 0.2, 'rgba(0,0,0,0.35)');
  const bg = ctx.createLinearGradient(x - r, 0, x + r, 0);
  bg.addColorStop(0, '#6e7887');
  bg.addColorStop(0.5, '#aab4c2');
  bg.addColorStop(1, '#5c6675');
  const rimY = y - r * 0.42;
  const botY = y + r * 0.88;
  rr(ctx, x - r - 4, rimY, r * 2 + 8, botY - rimY, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = '#39404d';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Handles.
  ctx.fillStyle = '#39404d';
  rr(ctx, x - r - 16, y + r * 0.05, 14, 12, 5);
  ctx.fill();
  rr(ctx, x + r + 2, y + r * 0.05, 14, 12, 5);
  ctx.fill();
  // Legs.
  ctx.fillStyle = '#39404d';
  ctx.fillRect(x - r * 0.6, botY - 4, 12, 12);
  ctx.fillRect(x + r * 0.6 - 12, botY - 4, 12, 12);

  // Broth / noodle surface.
  const surfColors = {
    empty: '#2b303c',
    boiling: '#7f95ad',
    perfect: '#eec25e',
    over: '#9c5a30',
  };
  ctx.beginPath();
  ctx.ellipse(x, rimY + 4, r - 6, (r - 6) * 0.3, 0, 0, TAU);
  ctx.fillStyle = surfColors[state] || surfColors.empty;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (state !== 'empty') {
    // Noodle swirls on the surface.
    ctx.strokeStyle = 'rgba(247,227,161,0.85)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (const off of [-0.14, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, rimY + 4 + off * r);
      ctx.quadraticCurveTo(x - r * 0.2, rimY + 4 + off * r - 7, x, rimY + 4 + off * r);
      ctx.quadraticCurveTo(x + r * 0.22, rimY + 4 + off * r + 7, x + r * 0.55, rimY + 4 + off * r);
      ctx.stroke();
    }
  }

  // Progress arc around the rim, coloured by state.
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(x, rimY + 4, r - 1, (r - 1) * 0.3, 0, 0, TAU);
  ctx.stroke();
  let frac = 0;
  let color = null;
  if (state === 'boiling') {
    frac = clamp(pt / boil, 0, 1);
    color = '#9db8d6';
  } else if (state === 'perfect') {
    frac = clamp((end - pt) / Math.max(0.001, end - boil), 0, 1);
    color = '#f5c04a';
  } else if (state === 'over') {
    frac = 1;
    color = '#d84a3a';
  }
  if (color && frac > 0.01) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(x, rimY + 4, r - 1, (r - 1) * 0.3, 0, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
    ctx.stroke();
  }
  ctx.restore();

  // Steam while the pot is live.
  if (state === 'boiling' || state === 'perfect') {
    steamWisp(ctx, x, rimY - 6, t, x);
  } else if (state === 'over') {
    steamWisp(ctx, x, rimY - 6, t * 0.4, x + 31);
  }
}

function drawAssemblyBowl(ctx, game, t) {
  const d = LAYOUT.bowl;
  const { bowl } = kitchenState(game);
  const cx = d.x;
  const cy = d.y;
  const r = d.r;

  ell(ctx, cx, cy + r * 0.86, r * 1.05, r * 0.2, 'rgba(0,0,0,0.35)');

  const hasNoodles = !!bowl.noodles;
  const broth = bowl.broth ? brothById(bowl.broth) : null;

  // Bowl body: wide half-bowl.
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r * 0.18);
  ctx.quadraticCurveTo(cx - r * 1.02, cy + r * 0.62, cx, cy + r * 0.9);
  ctx.quadraticCurveTo(cx + r * 1.02, cy + r * 0.62, cx + r, cy - r * 0.18);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, cy - r * 0.2, 0, cy + r * 0.9);
  bg.addColorStop(0, '#f6f1e2');
  bg.addColorStop(1, '#d9d0b8');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = '#8f8468';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Rim band + foot.
  ctx.fillStyle = '#3f6ea5';
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.18, r, r * 0.3, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  rr(ctx, cx - r * 0.22, cy + r * 0.82, r * 0.44, r * 0.14, 5);
  ctx.fillStyle = '#d9d0b8';
  ctx.fill();

  if (!hasNoodles) {
    // Empty station: dashed rim + hint.
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(140,150,170,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.12, r * 0.8, r * 0.24, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    txt(ctx, 'empty', cx, cy + r * 0.55, 16, 'rgba(120,128,145,0.9)', 'center', 700);
    txt(ctx, '麺を茹でて', cx, cy + r * 0.78, 12, 'rgba(120,128,145,0.75)', 'center', 700);
    return;
  }

  // Broth / noodle surface.
  let surf;
  if (broth) surf = broth.color;
  else if (bowl.noodles === 'over') surf = '#a8843f';
  else surf = '#ecd27a';
  if (bowl.noodles === 'over') surf = mixColor(surf, '#6e4a20', 0.35);
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.14, r * 0.8, r * 0.24, 0, 0, TAU);
  ctx.fillStyle = surf;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Noodle swirls.
  ctx.strokeStyle = bowl.noodles === 'over' ? 'rgba(240,220,160,0.6)' : 'rgba(250,235,180,0.95)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const off of [-0.08, 0.1]) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - r * 0.14 + off * r);
    ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.14 + off * r - 8, cx, cy - r * 0.14 + off * r);
    ctx.quadraticCurveTo(cx + r * 0.22, cy - r * 0.14 + off * r + 8, cx + r * 0.55, cy - r * 0.14 + off * r);
    ctx.stroke();
  }

  // Toppings arranged in a circle on the surface.
  const tops = bowl.toppings || [];
  const n = tops.length;
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI / 2 + (i * TAU) / Math.max(1, n);
    const px = cx + Math.cos(a) * r * 0.5;
    const py = cy - r * 0.14 + Math.sin(a) * r * 0.15;
    drawToppingIcon(ctx, tops[i], px, py, 24);
  }

  // Gentle steam once the bowl is built.
  steamWisp(ctx, cx, cy - r * 0.3, t, 7);
}

function drawBrothButtons(ctx, game) {
  const bowl = kitchenState(game).bowl;
  const sel = selectedBroth(game, bowl);
  const night = nightNumber(game);
  const b = LAYOUT.broths;
  for (let i = 0; i < BROTHS.length; i += 1) {
    const broth = BROTHS[i];
    const x = b.x0 + i * (b.w + b.gap);
    const y = b.y;
    const locked = broth.unlockNight > night;
    const selected = sel === broth.id;

    ctx.save();
    if (selected) {
      ctx.shadowColor = 'rgba(255,215,94,0.8)';
      ctx.shadowBlur = 14;
    }
    rr(ctx, x, y, b.w, b.h, 8);
    ctx.fillStyle = locked ? '#232838' : '#2c3242';
    ctx.fill();
    ctx.strokeStyle = selected ? '#ffd75e' : locked ? '#3a4152' : '#4a5470';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
    ctx.restore();

    // Icon.
    ctx.save();
    if (locked) ctx.globalAlpha = 0.45;
    drawBrothLadleIcon(ctx, broth, x + b.w / 2, y + 17, 30);
    ctx.restore();

    // Names (jp + clipped english).
    txt(ctx, broth.jp, x + b.w / 2, y + b.h - 20, 10, locked ? '#5a6274' : '#dfe5f2', 'center', 700);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + b.h - 15, b.w - 4, 12);
    ctx.clip();
    txt(ctx, broth.name, x + b.w / 2, y + b.h - 5, 9, locked ? '#5a6274' : '#aeb8cf', 'center', 600);
    ctx.restore();

    if (locked) {
      ctx.fillStyle = 'rgba(10,13,22,0.55)';
      rr(ctx, x, y, b.w, b.h, 8);
      ctx.fill();
      rr(ctx, x + b.w - 22, y + 3, 19, 14, 4);
      ctx.fillStyle = '#8a5a10';
      ctx.fill();
      txt(ctx, `N${broth.unlockNight}`, x + b.w - 12.5, y + 14, 10, '#ffe9b8', 'center');
    }
  }
}

function drawBins(ctx, game) {
  const { bowl } = kitchenState(game);
  const night = nightNumber(game);
  const b = LAYOUT.bins;
  const binsY = b.y ?? b.y0;
  for (let i = 0; i < TOPPINGS.length; i += 1) {
    const tp = TOPPINGS[i];
    const col = i % b.cols;
    const row = Math.floor(i / b.cols);
    const x = b.x0 + col * (b.w + b.gap);
    const y = binsY + row * (b.h + b.gap);
    const locked = tp.unlockNight > night;
    const inBowl = (bowl.toppings || []).includes(tp.id);

    ctx.save();
    if (inBowl) {
      ctx.shadowColor = 'rgba(255,215,94,0.9)';
      ctx.shadowBlur = 12;
    }
    rr(ctx, x, y, b.w, b.h, 8);
    ctx.fillStyle = locked ? '#262b38' : '#4a3624';
    ctx.fill();
    ctx.strokeStyle = inBowl ? '#ffd75e' : locked ? '#3a4152' : '#8a6a42';
    ctx.lineWidth = inBowl ? 3 : 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (locked) ctx.globalAlpha = 0.45;
    drawToppingIcon(ctx, tp.id, x + b.w / 2, y + 25, 26);
    ctx.restore();

    // Name, clipped to the bin.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + b.h - 34, b.w - 4, 12);
    ctx.clip();
    txt(ctx, tp.name, x + b.w / 2, y + b.h - 22, 9.5, locked ? '#5a6274' : '#e8d9b8', 'center', 600);
    ctx.restore();
    txt(ctx, `+${tp.price}`, x + b.w / 2, y + b.h - 8, 11, locked ? '#5a6274' : '#f2c94c', 'center', 800);

    if (locked) {
      ctx.fillStyle = 'rgba(10,13,22,0.55)';
      rr(ctx, x, y, b.w, b.h, 8);
      ctx.fill();
      rr(ctx, x + b.w - 24, y + 3, 21, 15, 4);
      ctx.fillStyle = '#8a5a10';
      ctx.fill();
      txt(ctx, `N${tp.unlockNight}`, x + b.w - 13.5, y + 15, 10, '#ffe9b8', 'center');
    }

    // Keyboard shortcut badge, top-left corner.
    rr(ctx, x + 4, y + 4, 16, 13, 4);
    ctx.fillStyle = 'rgba(10,13,22,0.85)';
    ctx.fill();
    txt(ctx, `${i + 1}`, x + 12, y + 10.5, 10, locked ? '#5a6274' : '#ffe9b8', 'center', 700, 'middle');
  }
}

function drawServeButton(ctx, game) {
  const s = LAYOUT.serve;
  const { bowl } = kitchenState(game);
  const canServe = orderedCustomers(game).some((c) => c.order && bowlMatchesOrder(bowl, c.order));
  const pulse = canServe ? 0.75 + 0.25 * Math.sin(performanceNow() * 6) : 0;

  ctx.save();
  if (canServe) {
    ctx.shadowColor = 'rgba(80,220,120,0.7)';
    ctx.shadowBlur = 16 + pulse * 10;
  }
  rr(ctx, s.x, s.y, s.w, s.h, 12);
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  g.addColorStop(0, canServe ? '#46c86e' : '#3d8a55');
  g.addColorStop(1, '#1f6b3a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#bff0cd';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  txtStroke(ctx, 'SERVE ▸', s.x + s.w / 2, s.y + 30, 24, '#f2fff5');
  txt(ctx, '配膳', s.x + s.w / 2, s.y + 50, 13, 'rgba(220,255,230,0.85)', 'center', 700);
}

// performance.now may not exist in some test contexts; fall back to Date.
function performanceNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000;
}

function drawTrashButton(ctx, game) {
  const s = LAYOUT.trash;
  rr(ctx, s.x, s.y, s.w, s.h, 10);
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  g.addColorStop(0, '#6e4a3a');
  g.addColorStop(1, '#4a2f24');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#a8785f';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Little bin icon.
  const ix = s.x + 34;
  const iy = s.y + s.h / 2;
  ctx.fillStyle = '#d8cfc0';
  rr(ctx, ix - 10, iy - 12, 20, 24, 3);
  ctx.fill();
  ctx.fillStyle = '#8a5a48';
  ctx.fillRect(ix - 12, iy - 16, 24, 5);
  ctx.fillRect(ix - 2, iy - 19, 4, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(ix - 6, iy - 6, 3, 12);
  ctx.fillRect(ix + 3, iy - 6, 3, 12);

  txt(ctx, 'Clear bowl', s.x + s.w / 2 + 14, s.y + s.h / 2 + 6, 18, '#f0e2d2', 'center', 800);
}

function drawKitchen(ctx, game, t) {
  const k = kitchenState(game);
  LAYOUT.pots.forEach((def, i) => drawPot(ctx, k.pots[i], def, t, game));
  drawAssemblyBowl(ctx, game, t);
  drawBrothButtons(ctx, game);
  drawBins(ctx, game);
  drawServeButton(ctx, game);
  drawTrashButton(ctx, game);
}

// ---------------------------------------------------------------------------
// HUD: night label, timer, coins, served, combo, goal, rush banner
// ---------------------------------------------------------------------------

function drawHUD(ctx, game, t) {
  const info = nightInfo(game);
  const label = `Night ${info.night} — ${info.label}`;
  txt(ctx, label, 512, 36, 20, '#ffe9b8', 'left', 800);

  const goal = info.goal;
  const earned = num(game, 'earned', 'nightEarned', 'score');

  // Stat pills.
  const pills = [
    { x: 512, w: 150, draw: () => drawCoinStat(ctx, num(game, 'bank', 'coins')) },
    { x: 672, w: 150, draw: () => txt(ctx, `Served ${num(game, 'served', 'bowlsServed')}`, 747, 63, 15, '#e8eefb', 'center', 700) },
  ];
  for (const p of pills) {
    pill(ctx, p.x, 46, p.w, 26);
    p.draw();
  }
  const combo = num(game, 'combo');
  if (combo >= 2) {
    pill(ctx, 832, 46, 160, 26);
    drawFlame(ctx, 856, 59, 10);
    txt(ctx, `COMBO ×${combo}`, 916, 63, 15, '#ffb35c', 'center', 800);
  }
  // Day timer bar.
  const tm = LAYOUT.timer;
  const duration = info.duration || 90;
  const raw = game ? (game.timeLeft ?? game.dayTime ?? game.remaining ?? game.time) : undefined;
  const left = clamp(typeof raw === 'number' ? raw : duration, 0, duration);
  const frac = duration > 0 ? left / duration : 1;
  rr(ctx, tm.x, tm.y, tm.w, tm.h, 8);
  ctx.fillStyle = '#141a2c';
  ctx.fill();
  ctx.strokeStyle = '#3a4a6a';
  ctx.lineWidth = 2;
  ctx.stroke();
  const innerW = tm.w - 6;
  const fw = Math.max(4, innerW * frac);
  let fillColor = '#69c86b';
  if (frac <= 0.22) fillColor = `rgba(229,83,75,${0.75 + 0.25 * Math.sin(t * 8)})`;
  else if (frac <= 0.5) fillColor = '#f2c94c';
  rr(ctx, tm.x + 3, tm.y + 3, fw, tm.h - 6, 5);
  ctx.fillStyle = fillColor;
  ctx.fill();
  txt(ctx, `${Math.ceil(left)}s`, tm.x + tm.w - 8, tm.y + tm.h / 2 + 4, 10, '#eef1f5', 'right', 700, 'middle');

  // Goal text directly under the timer bar, right-aligned to the canvas edge.
  txt(ctx, `Goal ${goal} · Earned ${earned}`, 1264, tm.y + tm.h + 17, 15, '#ffe9b8', 'right', 700);

  // Rush hour banner.
  if (game && game.rush) {
    const pulse = 0.8 + 0.2 * Math.sin(t * 9);
    ctx.save();
    ctx.globalAlpha = pulse;
    const bw = 360;
    const bx = 640 - bw / 2;
    const by = 96;
    rr(ctx, bx, by, bw, 42, 10);
    const g = ctx.createLinearGradient(0, by, 0, by + 42);
    g.addColorStop(0, '#e5534b');
    g.addColorStop(1, '#a52a22');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ffb0a0';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, '⚠ RUSH HOUR !', 640, by + 28, 22, '#fff2ea', 'center', 900);
    ctx.restore();
  }
}

function pill(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12,16,30,0.72)';
  rr(ctx, x, y, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCoinStat(ctx, bank) {
  const cx = 530;
  const cy = 59;
  const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 10);
  g.addColorStop(0, '#ffe9a0');
  g.addColorStop(1, '#d9a52e');
  circ(ctx, cx, cy, 10, '#f2c94c');
  ctx.strokeStyle = '#a8761f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, TAU);
  ctx.stroke();
  txt(ctx, '¥', cx, cy + 4, 11, '#7a5410', 'center', 800);
  txt(ctx, `${bank}`, 548, 64, 15, '#ffe9a8', 'left', 800);
}

function drawFlame(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ff8a3c';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.9, -s * 0.2, s * 0.55, s * 0.7);
  ctx.quadraticCurveTo(s * 0.3, s * 1.0, 0, s);
  ctx.quadraticCurveTo(-s * 0.3, s * 1.0, -s * 0.55, s * 0.7);
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
  ctx.fill();
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.3);
  ctx.quadraticCurveTo(s * 0.45, s * 0.15, s * 0.25, s * 0.55);
  ctx.quadraticCurveTo(0, s * 0.7, -s * 0.25, s * 0.55);
  ctx.quadraticCurveTo(-s * 0.45, s * 0.15, 0, -s * 0.3);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// play scene assembly
// ---------------------------------------------------------------------------

// Simple wooden stool: two legs and a round seat, drawn before the figure so a
// seated customer reads as sitting at the counter rather than floating.
function drawStool(ctx, x, y) {
  ctx.fillStyle = '#3a2413';
  ctx.fillRect(x - 26, y - 46, 7, 48);
  ctx.fillRect(x + 19, y - 46, 7, 48);
  ell(ctx, x, y - 56, 36, 11, '#5f3d24');
  ell(ctx, x, y - 58, 36, 10, '#8a5a34');
  ell(ctx, x - 10, y - 62, 14, 3, 'rgba(255,220,170,0.22)');
}

function drawPlay(ctx, game, t) {
  drawOrderBoard(ctx, game);
  for (const p of placedCustomers(game)) {
    if (!p.queue) drawStool(ctx, p.x, p.y);
    drawCustomerFigure(ctx, p.customer, p.x, p.y, p.queue ? 0.92 : 1, t);
  }
  drawKitchen(ctx, game, t);
  drawHUD(ctx, game, t);
}

// ---------------------------------------------------------------------------
// title screen
// ---------------------------------------------------------------------------

function drawTitleBowl(ctx, x, y, s, t) {
  // A decorative steaming bowl for the title screen.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ell(ctx, 0, 96, 130, 22, 'rgba(0,0,0,0.4)');
  // Body.
  ctx.beginPath();
  ctx.moveTo(-120, -10);
  ctx.quadraticCurveTo(-124, 70, 0, 92);
  ctx.quadraticCurveTo(124, 70, 120, -10);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -10, 0, 92);
  bg.addColorStop(0, '#f6f1e2');
  bg.addColorStop(1, '#cfc4a8');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = '#8f8468';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Rim + broth.
  ctx.fillStyle = '#3f6ea5';
  ctx.beginPath();
  ctx.ellipse(0, -12, 122, 34, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -14, 108, 27, 0, 0, TAU);
  ctx.fillStyle = '#b8432f';
  ctx.fill();
  // Noodles + toppings.
  ctx.strokeStyle = 'rgba(250,235,180,0.95)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const off of [-8, 6]) {
    ctx.beginPath();
    ctx.moveTo(-80, -14 + off);
    ctx.quadraticCurveTo(-30, -22 + off, 10, -14 + off);
    ctx.quadraticCurveTo(50, -6 + off, 85, -14 + off);
    ctx.stroke();
  }
  drawToppingIcon(ctx, 'egg', -52, -22, 34);
  drawToppingIcon(ctx, 'nori', 30, -26, 30);
  drawToppingIcon(ctx, 'menma', 66, -16, 30);
  drawToppingIcon(ctx, 'negi', -10, -8, 26);
  // Steam.
  for (let i = 0; i < 3; i += 1) {
    const ph = (t * 0.4 + i * 0.33) % 1;
    const sx = -30 + i * 32 + Math.sin(t * 2 + i) * 8;
    const sy = -50 - ph * 80;
    const a = (1 - ph) * 0.4;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14 + ph * 12);
    g.addColorStop(0, `rgba(235,240,250,${a})`);
    g.addColorStop(1, 'rgba(235,240,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 14 + ph * 12, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawTitle(ctx, game, t) {
  // Translucent panel behind the title block so it reads over the noren.
  rr(ctx, 240, 120, 800, 252, 18);
  ctx.fillStyle = 'rgba(8,10,28,0.55)';
  ctx.fill();

  // Big lantern-glow title.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(255,150,60,0.9)';
  ctx.shadowBlur = 34;
  const g = ctx.createLinearGradient(0, 190, 0, 290);
  g.addColorStop(0, '#ffe9a8');
  g.addColorStop(0.55, '#ffb35c');
  g.addColorStop(1, '#ff7a3c');
  ctx.font = `900 96px ${FONT}`;
  ctx.fillStyle = g;
  ctx.fillText('YATAI NIGHTS', 640, 268);
  ctx.restore();
  txt(ctx, 'Midnight Ramen Stall', 640, 322, 30, '#f3e6c8', 'center', 700);
  txt(ctx, '深夜の屋台', 640, 356, 20, 'rgba(243,230,200,0.7)', 'center', 700);

  drawTitleBowl(ctx, 640, 430, 1, t);

  const pulse = 0.65 + 0.35 * Math.sin(t * 3);
  ctx.save();
  ctx.globalAlpha = pulse;
  txtStroke(ctx, 'Click to open the stall', 640, 620, 26, '#fff6e8');
  ctx.restore();
  txt(ctx, 'Serve ramen before patience runs out — chain serves for combos!', 640, 662, 15, '#cfd6ea', 'center', 600);
}

// ---------------------------------------------------------------------------
// shop screen
// ---------------------------------------------------------------------------

function wrapLines(ctx, textStr, maxW) {
  const words = String(textStr).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawShopCard(ctx, game, upgrade, i) {
  const r = cardRect(i);
  const owned = hasUpgrade(game, upgrade.id);
  const bank = num(game, 'bank', 'coins');
  const affordable = bank >= upgrade.cost;
  const dim = owned || !affordable;

  ctx.save();
  if (owned) {
    ctx.shadowColor = 'rgba(110,220,140,0.5)';
    ctx.shadowBlur = 10;
  }
  rr(ctx, r.x, r.y, r.w, r.h, 12);
  ctx.fillStyle = owned ? '#1d3330' : '#1d2740';
  ctx.fill();
  ctx.strokeStyle = owned ? '#46c86e' : '#3a4a6a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  txt(ctx, upgrade.name, r.x + 20, r.y + 32, 21, '#eef1f5', 'left', 800);
  if (owned) {
    rr(ctx, r.x + r.w - 92, r.y + 14, 72, 24, 7);
    ctx.fillStyle = '#2f8a4e';
    ctx.fill();
    txt(ctx, 'OWNED', r.x + r.w - 56, r.y + 31, 13, '#d9ffe4', 'center', 800);
  } else {
    // Coin + cost.
    circ(ctx, r.x + 30, r.y + 60, 9, '#f2c94c');
    ctx.strokeStyle = '#a8761f';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(r.x + 30, r.y + 60, 9, 0, TAU);
    ctx.stroke();
    txt(ctx, `${upgrade.cost}`, r.x + 46, r.y + 65, 18, '#ffe9a8', 'left', 800);
    if (!affordable) {
      txt(ctx, `need ${upgrade.cost - bank}`, r.x + r.w - 18, r.y + 34, 12, '#8a93a8', 'right', 700);
    }
  }

  // Description, wrapped to the card.
  ctx.font = `600 13.5px ${FONT}`;
  const lines = wrapLines(ctx, upgrade.desc, r.w - 40).slice(0, 4);
  for (let li = 0; li < lines.length; li += 1) {
    txt(ctx, lines[li], r.x + 20, r.y + 92 + li * 19, 13.5, '#b9c2d8', 'left', 600);
  }

  if (dim && !owned) {
    ctx.fillStyle = 'rgba(8,11,20,0.55)';
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    txt(ctx, 'not enough coins', r.x + r.w / 2, r.y + r.h / 2 + 5, 15, '#8a93a8', 'center', 700);
  }
}

function drawShop(ctx, game, t) {
  // Dim the living stall behind the panel.
  ctx.fillStyle = 'rgba(5,8,16,0.78)';
  ctx.fillRect(0, 0, W, H);

  const info = nightInfo(game);
  const cleared = num(game, 'clearedNight', 'lastClearedNight') || info.night;
  const next = Math.min(cleared + 1, NIGHTS.length);
  const bank = num(game, 'bank', 'coins');
  const earned = num(game, 'earned', 'nightEarned');

  // Panel.
  ctx.fillStyle = 'rgba(18,23,40,0.96)';
  rr(ctx, 70, 64, 1140, 646, 16);
  ctx.fill();
  ctx.strokeStyle = '#3a4a6a';
  ctx.lineWidth = 3;
  ctx.stroke();

  txt(ctx, `Night ${cleared} cleared!`, 640, 122, 36, '#ffe9a8', 'center', 900);
  txt(ctx, `Earned ${earned} coins tonight`, 640, 160, 18, '#b9c2d8', 'center', 600);
  txt(ctx, 'Upgrade the stall', 640, 200, 22, '#8fd0ff', 'center', 800);

  UPGRADES.forEach((u, i) => drawShopCard(ctx, game, u, i));

  // Bank + next-night button.
  circ(ctx, 240, 664, 11, '#f2c94c');
  ctx.strokeStyle = '#a8761f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(240, 664, 11, 0, TAU);
  ctx.stroke();
  txt(ctx, `${bank}`, 258, 670, 18, '#ffe9a8', 'left', 800);

  const b = SHOP_NEXT;
  ctx.save();
  ctx.shadowColor = 'rgba(80,220,120,0.5)';
  ctx.shadowBlur = 14;
  rr(ctx, b.x, b.y, b.w, b.h, 12);
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, '#46c86e');
  g.addColorStop(1, '#1f6b3a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#bff0cd';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  txtStroke(ctx, `Start Night ${next} ▸`, b.x + b.w / 2, b.y + b.h / 2 + 8, 22, '#f2fff5');
}

// ---------------------------------------------------------------------------
// results screen
// ---------------------------------------------------------------------------

function drawResults(ctx, game, t) {
  ctx.fillStyle = 'rgba(5,8,16,0.72)';
  ctx.fillRect(0, 0, W, H);

  const total = num(game, 'totalEarned', 'earned', 'bank', 'coins');
  const bowls = num(game, 'bowlsServed', 'served');
  const combo = num(game, 'bestCombo', 'combo');
  const lost = num(game, 'customersLost', 'lost', 'missed');
  const stars = total >= 7000 ? 3 : total >= 5500 ? 2 : 1;

  ctx.fillStyle = 'rgba(18,23,40,0.96)';
  rr(ctx, 300, 96, 680, 560, 18);
  ctx.fill();
  ctx.strokeStyle = '#3a4a6a';
  ctx.lineWidth = 3;
  ctx.stroke();

  txt(ctx, 'Five Nights Done!', 640, 168, 40, '#ffe9a8', 'center', 900);
  txt(ctx, 'お疲れ様 — the stall sleeps until dusk', 640, 202, 15, '#8fd0ff', 'center', 600);

  const rows = [
    ['Total earned', `¥${total}`],
    ['Bowls served', `${bowls}`],
    ['Best combo', `×${combo}`],
    ['Customers lost', `${lost}`],
  ];
  for (let i = 0; i < rows.length; i += 1) {
    const y = 268 + i * 44;
    txt(ctx, rows[i][0], 420, y, 20, '#b9c2d8', 'right', 700);
    txt(ctx, rows[i][1], 470, y, 22, '#eef1f5', 'left', 800);
  }

  // Star row.
  for (let i = 0; i < 3; i += 1) {
    const sx = 640 + (i - 1) * 72;
    drawStar(ctx, sx, 500, 30, i < stars ? '#ffd75e' : '#3a4152');
    if (i < stars) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,215,94,0.8)';
      ctx.shadowBlur = 16;
      drawStar(ctx, sx, 500, 30, 'rgba(255,215,94,0.35)');
      ctx.restore();
    }
  }

  const b = RESULTS_AGAIN;
  ctx.save();
  ctx.shadowColor = 'rgba(80,220,120,0.5)';
  ctx.shadowBlur = 14;
  rr(ctx, b.x, b.y, b.w, b.h, 12);
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, '#46c86e');
  g.addColorStop(1, '#1f6b3a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#bff0cd';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  txtStroke(ctx, 'Play again', b.x + b.w / 2, b.y + b.h / 2 + 8, 22, '#f2fff5');
}

// ---------------------------------------------------------------------------
// popups + toast
// ---------------------------------------------------------------------------

function drawPopups(ctx, game) {
  const popups = (game && game.popups) || [];
  for (const p of popups) {
    if (!p || typeof p.text !== 'string') continue;
    const life = p.life || 1;
    const prog = clamp((p.t ?? 0) / life, 0, 1);
    const alpha = 1 - prog;
    if (alpha <= 0) continue;
    const px = p.x;
    const py = p.y - prog * 44;
    ctx.save();
    ctx.globalAlpha = alpha;
    txtStroke(ctx, p.text, px, py, 22, p.color || '#ffe9b8');
    ctx.restore();
  }
}

function drawToast(ctx, game) {
  if (!game || !game.message || !(game.messageT > 0)) return;
  const msg = String(game.message);
  ctx.font = `700 19px ${FONT}`;
  const mw = Math.min(720, ctx.measureText(msg).width + 64);
  const mx = 640 - mw / 2;
  const my = 186;
  const mh = 46;
  ctx.fillStyle = 'rgba(14,18,32,0.88)';
  rr(ctx, mx, my, mw, mh, 12);
  ctx.fill();
  ctx.strokeStyle = '#ffd75e';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  txt(ctx, msg, 640, my + mh / 2 + 7, 19, '#ffe9b8', 'center', 800);
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export function drawScene(ctx, game, t) {
  const time = typeof t === 'number' ? t : 0;
  drawBackdrop(ctx, time);

  const screen = game && game.screen;
  if (screen === 'title') {
    drawTitle(ctx, game, time);
  } else if (screen === 'shop') {
    drawShop(ctx, game, time);
  } else if (screen === 'results') {
    drawResults(ctx, game, time);
  } else if (screen === 'play' || (game && game.kitchen)) {
    drawPlay(ctx, game, time);
  }

  drawPopups(ctx, game);
  drawToast(ctx, game);
}

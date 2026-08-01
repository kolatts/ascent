// Everything derived from the grid layout. Nothing here reads or writes the save.
//
// A placement is { uid, type, x, y, damaged }. x/y are the top-left cell.
// Row 0 is the nose. Row GRID_H-1 is the rear edge.

import { PARTS, GRID_W, GRID_H, POWER_PRIORITY } from './parts.js';
import { PERKS } from './perks.js';

export const cellsOf = (p) => {
  const def = PARTS[p.type];
  const out = [];
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) out.push([p.x + dx, p.y + dy]);
  return out;
};

export const key = (x, y) => `${x},${y}`;

export function occupancy(placements) {
  const map = new Map();
  for (const p of placements) for (const [x, y] of cellsOf(p)) map.set(key(x, y), p);
  return map;
}

export function inBounds(type, x, y) {
  const def = PARTS[type];
  return x >= 0 && y >= 0 && x + def.w <= GRID_W && y + def.h <= GRID_H;
}

export function canPlace(placements, type, x, y, ignoreUid = null) {
  if (!inBounds(type, x, y)) return false;
  const occ = occupancy(placements.filter((p) => p.uid !== ignoreUid));
  const def = PARTS[type];
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) if (occ.has(key(x + dx, y + dy))) return false;
  return true;
}

/** Every legal top-left cell for a part type, in reading order. */
export function legalCells(placements, type) {
  const out = [];
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) if (canPlace(placements, type, x, y)) out.push([x, y]);
  return out;
}

const touchesRear = (p) => p.y + PARTS[p.type].h === GRID_H;

/**
 * Which parts are alive.
 *
 * A part is CONNECTED if a chain of touching parts links it to a reactor.
 * A part is POWERED if it is connected, undamaged, and the reactor budget
 * stretched far enough to reach it. Both failures look the same on the grid —
 * the cell goes dark — because to the player they mean the same thing:
 * that box is doing nothing but weighing you down.
 */
export function powerAnalysis(placements) {
  const occ = occupancy(placements);
  const reactors = placements.filter((p) => p.type === 'reactor' && !p.damaged);
  const connected = new Set();

  // Flood outward from every working reactor through touching parts.
  const queue = [...reactors];
  reactors.forEach((r) => connected.add(r.uid));
  while (queue.length) {
    const cur = queue.shift();
    for (const [x, y] of cellsOf(cur)) {
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const nb = occ.get(key(nx, ny));
        if (nb && !connected.has(nb.uid)) {
          connected.add(nb.uid);
          queue.push(nb);
        }
      }
    }
  }

  const supply = reactors.length * PARTS.reactor.supply;
  const powered = new Set(reactors.map((r) => r.uid));
  let used = 0;

  const eligible = placements
    .filter((p) => connected.has(p.uid) && !p.damaged && PARTS[p.type].draw > 0)
    .sort(
      (a, b) =>
        POWER_PRIORITY.indexOf(a.type) - POWER_PRIORITY.indexOf(b.type) ||
        a.y - b.y || a.x - b.x
    );

  const starved = new Set();
  for (const p of eligible) {
    const d = PARTS[p.type].draw;
    if (used + d <= supply) {
      used += d;
      powered.add(p.uid);
    } else {
      starved.add(p.uid);
    }
  }
  // Hull plates are wiring: connected means lit, they cost nothing to run.
  for (const p of placements)
    if (PARTS[p.type].draw === 0 && connected.has(p.uid) && !p.damaged) powered.add(p.uid);

  return { connected, powered, starved, supply, used };
}

const BASE_SCAN = 10;
const BASE_RANGE = 40;   // the hull makes a little fuel all by itself
const MIN_THRUST = 2;    // a ship with no working thruster can still cough along

export function shipStats(placements, activePerks = []) {
  const power = powerAnalysis(placements);
  const live = (p) => power.powered.has(p.uid) && !p.damaged;

  let mass = 0, thrust = 0, tankRange = 0, cargo = 16, scan = BASE_SCAN;
  let berths = 0, mend = 0, shields = 0;
  let minCol = GRID_W, maxCol = 0;

  for (const p of placements) {
    const def = PARTS[p.type];
    mass += def.mass; // dead weight still weighs
    // Width counts every part, working or not — a dead cargo bay is still
    // something you have to steer around a rock.
    minCol = Math.min(minCol, p.x);
    maxCol = Math.max(maxCol, p.x + def.w);
    if (!live(p)) continue;
    thrust += def.thrust || 0;
    tankRange += def.tankRange || 0;
    cargo += def.cargo || 0;
    scan += def.scan || 0;
    berths += def.berth || 0;
    mend += def.mend || 0;
    shields += def.shield || 0;
  }

  const perks = new Set(activePerks);
  if (perks.has('cartographer')) scan += 6;
  if (perks.has('deeptanks')) tankRange += 14;

  const effThrust = Math.max(MIN_THRUST, thrust);
  const speed = mass > 0 ? effThrust / mass : 0;

  // How far one trip can be. Engines and tanks both help; every part you bolt
  // on makes the ship heavier and gives some of it back.
  const range = Math.round((BASE_RANGE + tankRange) * speed);

  return {
    mass, thrust, cargo, scan, berths, mend, shields, speed, range,
    supply: power.supply, used: power.used,
    power,
    // Cells across. This is the ship's hitbox when it is threading rocks.
    widthCells: placements.length ? maxCol - minCol : 1,
    // Handling: how quickly it slides sideways in flight.
    agility: Math.round((2.4 + speed * 5.2) * 10) / 10,
  };
}

/** Can this ship make that hop in one go? */
export const canReach = (distance, stats) => distance <= stats.range;

/**
 * Roughly how hard a trip is, 1 to 3, from its length against your range.
 * A long trip means a long flight with more to dodge, not a fuel bill.
 */
export function tripDanger(distance, stats) {
  const k = distance / Math.max(stats.range, 1);
  return k <= 0.45 ? 1 : k <= 0.78 ? 2 : 3;
}

/**
 * Which of the pilot's chosen perks are actually awake: one per bunk.
 * Perks knocked out by a setback stay asleep even with a bunk free.
 */
export function activePerks(chosenPerks, berths, dazedPerks = []) {
  const awake = [];
  for (const id of chosenPerks) {
    if (dazedPerks.includes(id)) continue;
    if (awake.length < berths) awake.push(id);
  }
  return awake;
}

/**
 * Problems, worst first. Each names the exact cells at fault so the grid can
 * point at them. `blocking: true` means the ship genuinely cannot fly.
 */
export function shipProblems(placements) {
  const out = [];
  const power = powerAnalysis(placements);

  const reactors = placements.filter((p) => p.type === 'reactor');
  const thrusters = placements.filter((p) => p.type === 'thruster');

  if (reactors.length === 0)
    out.push({ blocking: true, icon: 'reactor', text: 'Your ship needs a reactor.', cells: [] });

  if (thrusters.length === 0)
    out.push({ blocking: true, icon: 'thruster', text: 'Your ship needs a thruster.', cells: [] });

  const misplaced = thrusters.filter((p) => !touchesRear(p));
  if (misplaced.length)
    out.push({
      blocking: false, icon: 'thruster',
      text: 'Thrusters go on the back row.',
      cells: misplaced.flatMap(cellsOf),
    });

  const rearOk = thrusters.filter(touchesRear);
  if (reactors.length && rearOk.length && !rearOk.some((p) => power.powered.has(p.uid)))
    out.push({
      blocking: false, icon: 'reactor',
      text: 'No thruster is getting power.',
      cells: rearOk.flatMap(cellsOf),
    });

  const dark = placements.filter(
    (p) => !p.damaged && !power.powered.has(p.uid) && PARTS[p.type].draw >= 0 && p.type !== 'reactor'
  );
  const unlit = dark.filter((p) => !power.connected.has(p.uid));
  if (unlit.length)
    out.push({
      blocking: false, icon: 'hull',
      text: 'Some parts are not joined to the reactor.',
      cells: unlit.flatMap(cellsOf),
    });

  if (power.starved.size)
    out.push({
      blocking: false, icon: 'reactor',
      text: 'The reactor cannot power everything.',
      cells: placements.filter((p) => power.starved.has(p.uid)).flatMap(cellsOf),
    });

  const broken = placements.filter((p) => p.damaged);
  if (broken.length)
    out.push({
      blocking: false, icon: 'repair',
      text: broken.length === 1 ? 'One part is broken.' : `${broken.length} parts are broken.`,
      cells: broken.flatMap(cellsOf),
    });

  return out;
}

export const canLaunch = (placements) => !shipProblems(placements).some((p) => p.blocking);

let uidSeq = 1;
export const newUid = () => `p${uidSeq++}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * A dependable ship built from whatever is in the crate. Used by the
 * "Build one for me" button and to seed a brand new game, so a six-year-old
 * can be flying inside two clicks.
 */
export function autoBuild(inventory) {
  const stock = { ...inventory };
  const placements = [];
  let supply = 0;
  let draw = 0;

  // Fixed spots, laid out so every part touches the reactor through something.
  // Anything the reactor could not power is left in the crate rather than
  // bolted on as dead weight.
  const put = (type, x, y, { essential = false } = {}) => {
    const def = PARTS[type];
    if ((stock[type] || 0) <= 0) return false;
    if (!essential && draw + (def.draw || 0) > supply) return false;
    if (!canPlace(placements, type, x, y)) return false;
    stock[type]--;
    placements.push({ uid: newUid(), type, x, y, damaged: false });
    supply += def.supply || 0;
    draw += def.draw || 0;
    return true;
  };

  // Kept deliberately narrow. Width is the ship's hitbox when it is threading
  // rocks, so the ship we hand a new player is a nimble one; going wide is a
  // choice they make, not a starting condition.
  put('reactor', 3, 2, { essential: true });
  put('hull', 2, 3, { essential: true });   // wiring out to the left thruster
  put('hull', 5, 3, { essential: true });   // and to the right one
  put('thruster', 2, 4);
  put('thruster', 5, 4);
  put('tank', 3, 0);
  put('quarters', 3, 4);
  put('quarters', 3, 5);   // two bunks, so two pilot skills start awake
  put('bumper', 2, 2);
  put('bumper', 5, 2);
  put('scanner', 2, 1);
  put('scanner', 5, 1);

  return placements;
}

/** Roll back inventory from a layout: returns { placements, inventory }. */
export function spendInventory(inventory, placements) {
  const inv = { ...inventory };
  for (const p of placements) inv[p.type] = (inv[p.type] || 0) - 1;
  for (const k of Object.keys(inv)) inv[k] = Math.max(0, inv[k]);
  return inv;
}

/** Total parts carried loose — capped by cargo capacity. */
export const loosePartCount = (inventory) =>
  Object.values(inventory).reduce((a, b) => a + b, 0);

/** Perk lookup helper re-exported so screens only import from one place. */
export { PERKS };

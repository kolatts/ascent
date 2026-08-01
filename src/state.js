// The whole game in one object, plus the only functions allowed to change it.
// Every mutation autosaves and tells the screens to redraw.

import { readSave, writeSave, clearSave, SAVE_VERSION } from './save.js';
import { generateMap, reveal } from './map.js';
import { autoBuild, spendInventory, shipStats, activePerks } from './ship.js';
import { PARTS } from './parts.js';

export const STARTING_INVENTORY = {
  hull: 10, reactor: 1, thruster: 2, tank: 1, cargo: 1, scanner: 1, quarters: 2, repair: 0,
};

/** Most a new run may inherit of each part from the traveller before it. */
const CARRY_CAP = {
  hull: 18, reactor: 2, thruster: 4, tank: 3, cargo: 2, scanner: 3, quarters: 4, repair: 2,
};

let state = null;
const listeners = new Set();

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function notify() {
  for (const fn of listeners) fn(state);
}

/** The only write path. Everything else calls through here. */
export function mutate(fn) {
  fn(state);
  // A tank that breaks or comes off the grid takes its fuel with it. Holding
  // this invariant in one place means no caller can leave the HUD reading 6/4.
  const cap = shipStats(state.placements, currentPerks(state)).fuelCap;
  state.fuel = Math.max(0, Math.min(state.fuel, cap));
  writeSave(state);
  notify();
}

export function newGame(carryOver = null) {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const map = generateMap(seed);

  // A new run starts with the parts of the ship that arrived before it. Topped
  // up to something flyable, and capped, so run twelve is not a junk mountain.
  const inventory = { ...STARTING_INVENTORY };
  if (carryOver) {
    for (const type of Object.keys(inventory)) {
      const inherited = carryOver.parts?.[type] || 0;
      inventory[type] = Math.min(CARRY_CAP[type] ?? 12, Math.max(inventory[type], inherited));
    }
  }

  const placements = autoBuild(inventory);

  state = {
    version: SAVE_VERSION,
    screen: 'title',
    pilot: { build: 1, suit: 0, helmet: 0, perks: ['miser', 'steady', 'scrapper'] },
    placements,
    inventory: spendInventory(inventory, placements),
    fuel: 10,
    map,
    currentId: map.startId,
    dazedPerks: [],
    log: [],
    legacy: carryOver ? { runs: carryOver.runs, parts: carryOver.parts } : { runs: 0, parts: {} },
    readAloud: state?.readAloud ?? false,
    arrived: false,
  };

  const stats = shipStats(state.placements, currentPerks(state));
  state.fuel = stats.fuelCap;
  reveal(state.map, state.currentId, stats.scan);
  writeSave(state);
  notify();
  return state;
}

export function loadOrCreate() {
  const saved = readSave();
  if (saved) {
    state = saved;
    notify();
    return state;
  }
  return newGame();
}

export function resetEverything() {
  clearSave();
  state = null;
  return newGame();
}

// ---------------------------------------------------------------- derived --

export const currentPerks = (s = state) =>
  activePerks(s.pilot.perks, shipBerths(s), (s.dazedPerks || []).map((d) => d.id));

function shipBerths(s) {
  let berths = 0;
  const { powered } = shipStatsRaw(s);
  for (const p of s.placements) {
    if (p.damaged || !powered.has(p.uid)) continue;
    berths += PARTS[p.type].berth || 0;
  }
  return berths;
}

// shipStats needs activePerks and activePerks needs berths, so berths are read
// from a perk-free pass first. Perks never change which parts have power.
function shipStatsRaw(s) {
  return shipStats(s.placements, []).power;
}

export const stats = (s = state) => shipStats(s.placements, currentPerks(s));

export const currentNode = (s = state) => s.map.nodes[s.currentId];

export const cargoUsed = (s = state) =>
  Object.values(s.inventory).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- actions --

export function addLog(text, icon = 'hull') {
  mutate((s) => {
    s.log.unshift({ text, icon });
    s.log = s.log.slice(0, 6);
  });
}

export function goTo(screen) {
  mutate((s) => { s.screen = screen; });
}

export function setFuel(v) {
  mutate((s) => { s.fuel = Math.max(0, Math.min(v, shipStats(s.placements, currentPerks(s)).fuelCap)); });
}

/** Add parts, respecting cargo space. Returns how many actually fitted. */
export function giveParts(bundle) {
  let taken = 0;
  mutate((s) => {
    const cap = shipStats(s.placements, currentPerks(s)).cargo;
    for (const [type, n] of Object.entries(bundle)) {
      for (let i = 0; i < n; i++) {
        if (cargoUsed(s) >= cap) return;
        s.inventory[type] = (s.inventory[type] || 0) + 1;
        taken++;
      }
    }
  });
  return taken;
}

export function spendParts(bundle) {
  mutate((s) => {
    for (const [type, n] of Object.entries(bundle)) {
      s.inventory[type] = Math.max(0, (s.inventory[type] || 0) - n);
    }
  });
}

export function revealAround(nodeId, radius) {
  mutate((s) => { reveal(s.map, nodeId, radius); });
}

export function setReadAloud(on) {
  mutate((s) => { s.readAloud = !!on; });
}

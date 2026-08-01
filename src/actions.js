// Everything the player can *do*. Each function ends with a short line for the
// log, because a six-year-old should be able to look at the last thing that
// happened and know why the numbers moved.

import { mutate, getState, currentPerks, stats, cargoUsed } from './state.js';
import { reveal, linkLength } from './map.js';
import { jumpCost, powerAnalysis, cellsOf } from './ship.js';
import { PARTS } from './parts.js';
import { pick, randInt } from './util.js';

const DAZE_JUMPS = 3;

// -------------------------------------------------------------- travelling --

export function travelPlan(toId) {
  const s = getState();
  const st = stats(s);
  const d = linkLength(s.map, s.currentId, toId);
  const cost = jumpCost(d, st, currentPerks(s));
  return { cost, distance: d, affordable: s.fuel >= cost, toId };
}

/**
 * Fly. Always allowed — a link you cannot pay for becomes a drift, which is
 * slower and costs you something, but never a dead end.
 */
export function travelTo(toId) {
  const plan = travelPlan(toId);
  const result = { drifted: !plan.affordable, cost: plan.cost, broke: null, jettisoned: 0, dazed: null };

  mutate((s) => {
    if (plan.affordable) {
      s.fuel -= plan.cost;
    } else {
      s.fuel = 0;
      applyDriftCost(s, result);
    }

    s.currentId = toId;
    const node = s.map.nodes[toId];
    node.visited = true;
    node.seen = true;
    if (node.type === 'gas') node.stock = 4; // clouds refill between visits

    // Tick down any concussion.
    s.dazedPerks = (s.dazedPerks || [])
      .map((d) => ({ ...d, left: d.left - 1 }))
      .filter((d) => d.left > 0);

    reveal(s.map, toId, stats(s).scan);

    s.log.unshift(
      result.drifted
        ? { text: 'You drifted in on empty tanks.', icon: 'thruster' }
        : { text: `You flew here. ${plan.cost} fuel used.`, icon: 'thruster' }
    );
    s.log = s.log.slice(0, 6);
  });

  return result;
}

/** Drifting always costs one thing. Pick the gentlest one that still stings. */
function applyDriftCost(s, result) {
  const perks = currentPerks(s);
  const power = powerAnalysis(s.placements);

  if (!perks.includes('steady')) {
    const workingThrusters = s.placements.filter((p) => p.type === 'thruster' && !p.damaged);
    const candidates = s.placements.filter(
      (p) =>
        !p.damaged &&
        p.type !== 'reactor' &&
        power.powered.has(p.uid) &&
        !(p.type === 'thruster' && workingThrusters.length <= 1)
    );
    if (candidates.length) {
      const victim = pick(Math.random, candidates);
      victim.damaged = true;
      result.broke = victim;
      return;
    }
  }

  const loose = Object.entries(s.inventory).filter(([, n]) => n > 0);
  if (loose.length) {
    let toDrop = Math.max(1, Math.floor(cargoUsed(s) / 2));
    while (toDrop > 0) {
      const stock = Object.entries(s.inventory).filter(([, n]) => n > 0);
      if (!stock.length) break;
      const [type] = pick(Math.random, stock);
      s.inventory[type]--;
      toDrop--;
      result.jettisoned++;
    }
    return;
  }

  const awake = currentPerks(s);
  if (awake.length) {
    const id = pick(Math.random, awake);
    s.dazedPerks = [...(s.dazedPerks || []), { id, left: DAZE_JUMPS }];
    result.dazed = id;
  }
}

// --------------------------------------------------------------- salvaging --

// Hull plates are the bread of this game — they wire the ship together and
// they pay for repairs — so a wreck mostly yields plates.
const COMMON = ['hull', 'hull', 'hull', 'hull', 'hull', 'scanner', 'quarters', 'repair'];
const RARE = ['reactor', 'thruster', 'tank', 'cargo'];

export function salvage(nodeId) {
  const s = getState();
  const node = s.map.nodes[nodeId];
  const perks = currentPerks(s);
  const bundle = {};
  const rng = Math.random;

  let draws = node.stock + randInt(rng, 1, 2);
  if (perks.includes('scrapper')) draws = Math.ceil(draws * 1.4);

  for (let i = 0; i < draws; i++) {
    const rare = perks.includes('luckyeye') ? 0.2 : 0.08;
    const type = rng() < rare ? pick(rng, RARE) : pick(rng, COMMON);
    bundle[type] = (bundle[type] || 0) + 1;
  }

  const cap = stats(s).cargo;
  const taken = {};
  let count = cargoUsed(s);
  for (const [type, n] of Object.entries(bundle)) {
    for (let i = 0; i < n; i++) {
      if (count >= cap) break;
      taken[type] = (taken[type] || 0) + 1;
      count++;
    }
  }
  const total = Object.values(taken).reduce((a, b) => a + b, 0);
  const spilled = Object.values(bundle).reduce((a, b) => a + b, 0) - total;

  mutate((st) => {
    for (const [type, n] of Object.entries(taken)) st.inventory[type] = (st.inventory[type] || 0) + n;
    st.map.nodes[nodeId].spent = true;
    st.map.nodes[nodeId].stock = 0;
    st.log.unshift({ text: `You found ${total} part${total === 1 ? '' : 's'}.`, icon: 'cargo' });
    st.log = st.log.slice(0, 6);
  });

  return { taken, total, spilled };
}

// ----------------------------------------------------------------- fuelling --

export const PUFF = 2;

export function drawFuel(nodeId) {
  const s = getState();
  const node = s.map.nodes[nodeId];
  const cap = stats(s).fuelCap;
  if (node.stock <= 0 || s.fuel >= cap) return 0;
  const got = Math.min(PUFF, cap - s.fuel);
  mutate((st) => {
    st.fuel += got;
    st.map.nodes[nodeId].stock -= 1;
  });
  return got;
}

// ------------------------------------------------------------------ station --

export const TRADE = { partsForFuel: { give: 3, get: 2 }, fuelForParts: { give: 3, get: 1 } };

export function sellPartsForFuel() {
  const s = getState();
  const cap = stats(s).fuelCap;
  if ((s.inventory.hull || 0) < TRADE.partsForFuel.give || s.fuel >= cap) return false;
  mutate((st) => {
    st.inventory.hull -= TRADE.partsForFuel.give;
    st.fuel = Math.min(cap, st.fuel + TRADE.partsForFuel.get);
    st.log.unshift({ text: 'Traded plates for fuel.', icon: 'station' });
    st.log = st.log.slice(0, 6);
  });
  return true;
}

export function buyPartsWithFuel() {
  const s = getState();
  if (s.fuel < TRADE.fuelForParts.give) return false;
  if (cargoUsed(s) >= stats(s).cargo) return false;
  mutate((st) => {
    st.fuel -= TRADE.fuelForParts.give;
    st.inventory.hull = (st.inventory.hull || 0) + TRADE.fuelForParts.get;
    st.log.unshift({ text: 'Traded fuel for plates.', icon: 'station' });
    st.log = st.log.slice(0, 6);
  });
  return true;
}

// ------------------------------------------------------------------ mending --

/** Hull plates to mend one part, after the repair bay and the Fixer perk. */
export function mendCost(s = getState()) {
  const st = stats(s);
  let cost = 2;
  if (st.mend > 0) cost -= 1;
  if (currentPerks(s).includes('engineer')) cost = Math.ceil(cost / 2);
  return Math.max(1, cost);
}

export const brokenParts = (s = getState()) => s.placements.filter((p) => p.damaged);

export function mendOne(uid) {
  const s = getState();
  const cost = mendCost(s);
  if ((s.inventory.hull || 0) < cost) return false;
  mutate((st) => {
    st.inventory.hull -= cost;
    const p = st.placements.find((q) => q.uid === uid);
    if (p) p.damaged = false;
    st.log.unshift({ text: 'Mended.', icon: 'repair' });
    st.log = st.log.slice(0, 6);
  });
  return true;
}

// ------------------------------------------------------------------ outcomes --

/** Apply one anomaly outcome. Returns a short list of things that changed. */
export function applyOutcome(outcome) {
  const changes = [];
  const s = getState();

  mutate((st) => {
    if (outcome.fuel) {
      const cap = stats(st).fuelCap;
      const before = st.fuel;
      st.fuel = Math.max(0, Math.min(cap, st.fuel + outcome.fuel));
      if (st.fuel !== before) changes.push({ icon: 'gas', text: `${st.fuel > before ? '+' : ''}${st.fuel - before} fuel` });
    }

    if (outcome.parts) {
      const cap = stats(st).cargo;
      let n = 0;
      for (const [type, count] of Object.entries(outcome.parts)) {
        for (let i = 0; i < count; i++) {
          if (cargoUsed(st) >= cap) break;
          st.inventory[type] = (st.inventory[type] || 0) + 1;
          n++;
        }
      }
      if (n) changes.push({ icon: 'cargo', text: `+${n} parts` });
    }

    if (outcome.reveal) {
      const found = reveal(st.map, st.currentId, outcome.reveal);
      if (found) changes.push({ icon: 'scanner', text: `${found} new places` });
    }

    if (outcome.heal) {
      const broken = st.placements.filter((p) => p.damaged);
      if (broken.length) {
        broken[0].damaged = false;
        changes.push({ icon: 'repair', text: 'a part mended' });
      }
      st.dazedPerks = [];
    }

    if (outcome.damage) {
      const power = powerAnalysis(st.placements);
      const workingThrusters = st.placements.filter((p) => p.type === 'thruster' && !p.damaged);
      const candidates = st.placements.filter(
        (p) => !p.damaged && p.type !== 'reactor' && power.powered.has(p.uid) &&
          !(p.type === 'thruster' && workingThrusters.length <= 1)
      );
      if (candidates.length) {
        const victim = pick(Math.random, candidates);
        victim.damaged = true;
        changes.push({ icon: 'repair', text: `${PARTS[victim.type].name} broke` });
      }
    }

    if (outcome.daze) {
      const awake = currentPerks(st);
      if (awake.length) {
        const id = pick(Math.random, awake);
        st.dazedPerks = [...(st.dazedPerks || []), { id, left: DAZE_JUMPS }];
        changes.push({ icon: 'quarters', text: 'a skill went to sleep' });
      }
    }

    if (outcome.hop) {
      // Step through the door: jump to a linked node further along.
      const here = st.map.nodes[st.currentId];
      const forward = here.links
        .map((id) => st.map.nodes[id])
        .filter((n) => n.layer > here.layer);
      if (forward.length) {
        const target = forward[0];
        st.currentId = target.id;
        target.visited = true;
        target.seen = true;
        reveal(st.map, target.id, stats(st).scan);
        changes.push({ icon: 'thruster', text: 'a free jump forward' });
      }
    }

    st.map.nodes[st.currentId].spent = true;
    st.log.unshift({ text: outcome.text, icon: 'anomaly' });
    st.log = st.log.slice(0, 6);
  });

  return changes;
}

// ------------------------------------------------------------------- beacon --

export function lightBeacon(nodeId) {
  let found = 0;
  mutate((s) => {
    found = reveal(s.map, nodeId, 48);
    s.map.nodes[nodeId].spent = true;
    s.log.unshift({ text: `The beacon showed you ${found} places.`, icon: 'beacon' });
    s.log = s.log.slice(0, 6);
  });
  return found;
}

// ------------------------------------------------------------------ arrival --

export function arriveAtHeaven() {
  mutate((s) => {
    s.arrived = true;
    s.screen = 'arrival';
  });
}

/** Break the ship down into the crate the next traveller starts with. */
export function harvestShip(s = getState()) {
  const parts = { ...s.inventory };
  for (const p of s.placements) parts[p.type] = (parts[p.type] || 0) + 1;
  return { runs: (s.legacy?.runs || 0) + 1, parts };
}

export { cellsOf };

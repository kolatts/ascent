// Everything the player can *do*. Each function ends with a short line for the
// log, because a six-year-old should be able to look at the last thing that
// happened and know why the numbers moved.
//
// There is no fuel to chase. The ship makes its own, so a trip is gated by how
// far the ship can reach, and what it costs you is the flying itself.

import { mutate, getState, currentPerks, stats, cargoUsed } from './state.js';
import { reveal, linkLength } from './map.js';
import { canReach, tripDanger, powerAnalysis } from './ship.js';
import { PARTS } from './parts.js';
import { pick, randInt } from './util.js';

const DAZE_JUMPS = 3;

// -------------------------------------------------------------- travelling --

export function travelPlan(toId) {
  const s = getState();
  const st = stats(s);
  const distance = linkLength(s.map, s.currentId, toId);
  return {
    toId, distance,
    reachable: canReach(distance, st),
    danger: tripDanger(distance, st),
  };
}

/**
 * Queue the flight. The move itself only lands when the leg is finished, so
 * the arcade screen is the thing that actually carries you there.
 */
export function beginTrip(toId) {
  const plan = travelPlan(toId);
  if (!plan.reachable) return false;
  mutate((s) => {
    s.pendingTrip = {
      toId,
      distance: plan.distance,
      seed: (Math.random() * 0xffffffff) >>> 0,
    };
    s.screen = 'flight';
  });
  return true;
}

/** Land, cash in the sparkles, and pay for anything you clipped on the way. */
export function completeTrip(result) {
  const landed = { sparkles: 0, broke: null, dazed: null, spilled: 0 };

  mutate((s) => {
    const trip = s.pendingTrip;
    if (!trip) return;
    arrive(s, trip.toId);

    // Sparkles become spare parts, as many as the hold will take.
    const cap = stats(s).cargo;
    for (let i = 0; i < result.sparkles; i++) {
      if (cargoUsed(s) >= cap) { landed.spilled++; continue; }
      const type = Math.random() < 0.12 ? pick(Math.random, ['scanner', 'quarters', 'bumper', 'repair']) : 'hull';
      s.inventory[type] = (s.inventory[type] || 0) + 1;
      landed.sparkles++;
    }

    // Three clean hits in one leg shakes something loose.
    if (result.bumps >= 3 && !currentPerks(s).includes('steady')) {
      const victim = breakSomething(s);
      if (victim) landed.broke = victim;
      else landed.dazed = dazeSomething(s);
    }

    s.log.unshift({
      text: landed.broke
        ? `You bumped in. The ${PARTS[landed.broke.type].name.toLowerCase()} broke.`
        : `You flew in and caught ${landed.sparkles} sparkle${landed.sparkles === 1 ? '' : 's'}.`,
      icon: landed.broke ? 'repair' : 'cargo',
    });
    s.log = s.log.slice(0, 6);
    s.lastLanding = landed;
  });

  return landed;
}

/** Reduced motion, or the Skip button: arrive with a modest handful. */
export function skipTrip() {
  const landed = { sparkles: 0, broke: null, dazed: null, spilled: 0 };
  mutate((s) => {
    const trip = s.pendingTrip;
    if (!trip) return;
    arrive(s, trip.toId);
    const cap = stats(s).cargo;
    const give = Math.max(1, Math.round(trip.distance / 12));
    for (let i = 0; i < give; i++) {
      if (cargoUsed(s) >= cap) break;
      s.inventory.hull = (s.inventory.hull || 0) + 1;
      landed.sparkles++;
    }
    s.log.unshift({ text: 'You flew straight in.', icon: 'thruster' });
    s.log = s.log.slice(0, 6);
    s.lastLanding = landed;
  });
  return landed;
}

function arrive(s, toId) {
  s.currentId = toId;
  s.pendingTrip = null;
  s.screen = 'map';
  const node = s.map.nodes[toId];
  node.visited = true;
  node.seen = true;

  s.dazedPerks = (s.dazedPerks || [])
    .map((d) => ({ ...d, left: d.left - 1 }))
    .filter((d) => d.left > 0);

  reveal(s.map, toId, stats(s).scan);
}

/** Pick something to break: never the reactor, never the last good thruster. */
function breakSomething(s) {
  const power = powerAnalysis(s.placements);
  const workingThrusters = s.placements.filter((p) => p.type === 'thruster' && !p.damaged);
  const candidates = s.placements.filter(
    (p) =>
      !p.damaged &&
      p.type !== 'reactor' &&
      power.powered.has(p.uid) &&
      !(p.type === 'thruster' && workingThrusters.length <= 1)
  );
  if (!candidates.length) return null;
  const victim = pick(Math.random, candidates);
  victim.damaged = true;
  return victim;
}

function dazeSomething(s) {
  const awake = currentPerks(s);
  if (!awake.length) return null;
  const id = pick(Math.random, awake);
  s.dazedPerks = [...(s.dazedPerks || []), { id, left: DAZE_JUMPS }];
  return id;
}

// --------------------------------------------------------------- salvaging --

// Hull plates are the bread of this game — they wire the ship together and
// they pay for repairs — so a wreck mostly yields plates.
const COMMON = ['hull', 'hull', 'hull', 'hull', 'hull', 'scanner', 'quarters', 'repair', 'bumper'];
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

  mutate((st) => {
    for (const [type, n] of Object.entries(taken)) st.inventory[type] = (st.inventory[type] || 0) + n;
    st.map.nodes[nodeId].spent = true;
    st.map.nodes[nodeId].stock = 0;
    st.log.unshift({ text: `You found ${total} part${total === 1 ? '' : 's'}.`, icon: 'cargo' });
    st.log = st.log.slice(0, 6);
  });

  return { taken, total };
}

// ------------------------------------------------------------------ station --

/** Stations swap what you have for what you need — never generously. */
export const SWAP = { give: 4, getRare: 1 };

export function swapForRare() {
  const s = getState();
  if ((s.inventory.hull || 0) < SWAP.give) return false;
  if (cargoUsed(s) >= stats(s).cargo) return false;
  const type = pick(Math.random, ['thruster', 'tank', 'cargo', 'bumper', 'scanner']);
  mutate((st) => {
    st.inventory.hull -= SWAP.give;
    st.inventory[type] = (st.inventory[type] || 0) + 1;
    st.log.unshift({ text: `Swapped plates for a ${PARTS[type].name.toLowerCase()}.`, icon: 'station' });
    st.log = st.log.slice(0, 6);
  });
  return type;
}

// ------------------------------------------------------------------- garden --

/** A quiet place. Mends one thing for nothing and wakes any sleepy skills. */
export function restHere(nodeId) {
  const out = { mended: null, woke: 0 };
  mutate((s) => {
    const broken = s.placements.find((p) => p.damaged);
    if (broken) { broken.damaged = false; out.mended = broken.type; }
    out.woke = (s.dazedPerks || []).length;
    s.dazedPerks = [];
    s.map.nodes[nodeId].spent = true;
    s.log.unshift({ text: 'You rested a while.', icon: 'quarters' });
    s.log = s.log.slice(0, 6);
  });
  return out;
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

  mutate((st) => {
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
      const victim = breakSomething(st);
      if (victim) changes.push({ icon: 'repair', text: `${PARTS[victim.type].name} broke` });
    }

    if (outcome.daze) {
      const id = dazeSomething(st);
      if (id) changes.push({ icon: 'quarters', text: 'a skill went to sleep' });
    }

    if (outcome.hop) {
      // Step through the door: a free jump to somewhere further along.
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

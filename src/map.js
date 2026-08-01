// The star map: a layered node graph strung out between the start and Heaven.
//
// Layers guarantee three things that matter more than pretty topology:
// every node is reachable, every route makes forward progress, and the
// distance between neighbours stays inside a band the fuel maths can price.

import { makeRng, pick, randInt, dist3, clamp } from './util.js';

export const LAYERS = 11;      // node layers, not counting Heaven
export const LAYER_STEP = 11;  // world units between layers
export const SPREAD = 19;      // lateral scatter

export const NODE_TYPES = {
  start:    { id: 'start',    name: 'Home',      tint: '#FBF3DF', hue: 0xfbf3df },
  derelict: { id: 'derelict', name: 'Old ship',  tint: '#D7BE8C', hue: 0xd7be8c },
  gas:      { id: 'gas',      name: 'Fuel cloud',tint: '#8FD9A8', hue: 0x8fd9a8 },
  station:  { id: 'station',  name: 'Station',   tint: '#9FD4E8', hue: 0x9fd4e8 },
  anomaly:  { id: 'anomaly',  name: 'Something', tint: '#E9A6C4', hue: 0xe9a6c4 },
  beacon:   { id: 'beacon',   name: 'Beacon',    tint: '#FFDD91', hue: 0xffdd91 },
  heaven:   { id: 'heaven',   name: 'The Light', tint: '#FFF3C4', hue: 0xfff3c4 },
};

export const NODE_GLYPHS = {
  start: '<path d="M16 4l4 8 8 1-6 6 2 9-8-4-8 4 2-9-6-6 8-1z"/>',
  derelict: '<path d="M7 20l9-14 9 14z" opacity=".9"/><path d="M4 24h24v3H4z"/><path d="M13 12l-4 8" stroke="#241E4E" stroke-width="2"/>',
  gas: '<circle cx="12" cy="17" r="7"/><circle cx="20" cy="14" r="8"/><circle cx="23" cy="20" r="5"/>',
  station: '<rect x="11" y="8" width="10" height="16" rx="3"/><rect x="3" y="13" width="6" height="6" rx="2"/><rect x="23" y="13" width="6" height="6" rx="2"/>',
  anomaly: '<circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4"/><path d="M16 10v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="22" r="1.8"/>',
  beacon: '<path d="M16 3l3 9h-6z"/><circle cx="16" cy="17" r="5"/><path d="M6 27h20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  heaven: '<circle cx="16" cy="16" r="7"/><path d="M16 1v6M16 25v6M1 16h6M25 16h6M5 5l4 4M23 23l4 4M27 5l-4 4M9 23l-4 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
};

export const nodeIcon = (type, size = 30) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" fill="currentColor">${NODE_GLYPHS[type]}</svg>`;

const WEIGHTED = [
  ...Array(30).fill('derelict'),
  ...Array(24).fill('gas'),
  ...Array(14).fill('station'),
  ...Array(22).fill('anomaly'),
  ...Array(10).fill('beacon'),
];

export function generateMap(seed) {
  const rng = makeRng(seed);
  const nodes = [];
  const layers = [];

  const add = (type, x, y, z, layer) => {
    const n = {
      id: nodes.length,
      type, layer,
      x, y, z,
      links: [],
      seen: false,      // inside scan range at some point
      visited: false,
      spent: false,     // salvaged / beacon used
      stock: 0,         // gas left in a cloud this visit, parts left in a wreck
    };
    nodes.push(n);
    return n;
  };

  // Layer 0: home.
  const start = add('start', 0, 0, 0, 0);
  layers.push([start]);

  for (let L = 1; L <= LAYERS; L++) {
    const count = L === LAYERS ? 3 : randInt(rng, 3, 4);
    const ring = [];
    for (let i = 0; i < count; i++) {
      // Fan the nodes around a circle so they never stack up.
      const a = (i / count) * Math.PI * 2 + rng() * 1.1;
      const r = SPREAD * (0.45 + rng() * 0.55);
      const x = L * LAYER_STEP + (rng() - 0.5) * 4;
      const y = Math.sin(a) * r * 0.6;
      const z = Math.cos(a) * r;
      ring.push(add(pick(rng, WEIGHTED), x, y, z, L));
    }
    layers.push(ring);
  }

  // Heaven, past the last ring.
  const heaven = add('heaven', (LAYERS + 1) * LAYER_STEP + 6, 0, 0, LAYERS + 1);
  layers.push([heaven]);

  const link = (a, b) => {
    if (a === b || a.links.includes(b.id)) return;
    a.links.push(b.id);
    b.links.push(a.id);
  };

  // Forward edges: each node reaches the two nearest nodes one layer on, and
  // each node in the next layer is guaranteed at least one way back.
  for (let L = 0; L < layers.length - 1; L++) {
    const here = layers[L];
    const next = layers[L + 1];
    for (const a of here) {
      const sorted = [...next].sort((p, q) => dist3(a, p) - dist3(a, q));
      link(a, sorted[0]);
      if (sorted[1] && rng() < 0.75) link(a, sorted[1]);
    }
    for (const b of next) {
      if (!here.some((a) => a.links.includes(b.id))) {
        const nearest = [...here].sort((p, q) => dist3(b, p) - dist3(b, q))[0];
        link(nearest, b);
      }
    }
  }

  // A few sideways edges so a layer isn't a straight corridor.
  for (const ring of layers) {
    if (ring.length < 2) continue;
    for (let i = 0; i < ring.length; i++) {
      if (rng() < 0.45) link(ring[i], ring[(i + 1) % ring.length]);
    }
  }

  // Fuel clouds and wrecks get their initial stock.
  for (const n of nodes) {
    if (n.type === 'gas') n.stock = 4;
    if (n.type === 'derelict') n.stock = randInt(rng, 2, 4);
  }

  start.visited = true;
  start.seen = true;

  return { seed, nodes, startId: start.id, heavenId: heaven.id };
}

export const nodeById = (map, id) => map.nodes[id];

export const linkLength = (map, a, b) => dist3(map.nodes[a], map.nodes[b]);

/** Everything you could fly to from here, cheapest first. */
export function optionsFrom(map, fromId) {
  return map.nodes[fromId].links.map((id) => ({
    id,
    node: map.nodes[id],
    distance: linkLength(map, fromId, id),
  })).sort((a, b) => a.distance - b.distance);
}

/**
 * Light up everything inside `radius` of `originId`, plus every node directly
 * linked to it. The player must always be able to see somewhere to go, even
 * with no scanner at all.
 */
export function reveal(map, originId, radius) {
  const origin = map.nodes[originId];
  let found = 0;
  for (const n of map.nodes) {
    const near = dist3(origin, n) <= radius;
    const linked = origin.links.includes(n.id);
    if ((near || linked || n.id === originId) && !n.seen) {
      n.seen = true;
      found++;
    }
  }
  return found;
}

/** How far along the journey the player is, 0..1. For the progress ribbon. */
export function progress(map, currentId) {
  const cur = map.nodes[currentId];
  return clamp(cur.layer / (LAYERS + 1), 0, 1);
}

/** Straight-line distance left to Heaven, for the "how far?" readout. */
export const distanceToHeaven = (map, currentId) =>
  dist3(map.nodes[currentId], map.nodes[map.heavenId]);

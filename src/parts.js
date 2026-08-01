// Part definitions. Footprint is in grid cells: w = columns, h = rows.
// Row 0 is the nose, row 5 is the rear. Nothing rotates — one less thing to
// explain to a small pilot.
//
// The ship carries its own fuel and makes more of it, so tanks buy *range*
// rather than a number you have to go and refill.

export const GRID_W = 8;
export const GRID_H = 6;

export const PARTS = {
  hull: {
    id: 'hull', name: 'Hull', w: 1, h: 1,
    mass: 2, draw: 0,
    tint: '#FFB4D2', hue: 0xff9ec4,
    blurb: 'Carries power along the ship.',
  },
  reactor: {
    id: 'reactor', name: 'Reactor', w: 2, h: 2,
    mass: 12, draw: 0, supply: 10,
    tint: '#FF9A5A', hue: 0xff8a3d,
    blurb: 'Makes power for everything else.',
  },
  thruster: {
    id: 'thruster', name: 'Thruster', w: 1, h: 2,
    mass: 6, draw: 3, thrust: 12, rearOnly: true,
    tint: '#4FD8FF', hue: 0x35cdff,
    blurb: 'Go faster. Goes on the back row.',
  },
  tank: {
    id: 'tank', name: 'Fuel tank', w: 2, h: 2,
    mass: 8, draw: 1, tankRange: 22,
    tint: '#5BE49B', hue: 0x3ade8c,
    blurb: 'Makes its own fuel. Fly further.',
  },
  cargo: {
    id: 'cargo', name: 'Cargo bay', w: 2, h: 2,
    mass: 8, draw: 1, cargo: 12,
    tint: '#FFD166', hue: 0xffc93c,
    blurb: 'Holds more spare parts.',
  },
  scanner: {
    id: 'scanner', name: 'Scanner', w: 1, h: 1,
    mass: 3, draw: 2, scan: 8,
    tint: '#C9B6FF', hue: 0xb9a0ff,
    blurb: 'Sees further across the map.',
  },
  quarters: {
    id: 'quarters', name: 'Quarters', w: 2, h: 1,
    mass: 5, draw: 1, berth: 1,
    tint: '#FF8FB1', hue: 0xff7aa3,
    blurb: 'A bed. Wakes up one pilot skill.',
  },
  repair: {
    id: 'repair', name: 'Repair bay', w: 2, h: 1,
    mass: 5, draw: 1, mend: 1,
    tint: '#7FE7D6', hue: 0x5adfca,
    blurb: 'Mending broken parts costs less.',
  },
  bumper: {
    id: 'bumper', name: 'Bumper', w: 1, h: 1,
    mass: 4, draw: 1, shield: 1,
    tint: '#FFE24D', hue: 0xffdd33,
    blurb: 'Bounces off one rock every trip.',
  },
};

/** Order the tray is drawn in. */
export const PART_ORDER = [
  'hull', 'reactor', 'thruster', 'tank', 'bumper', 'cargo', 'scanner', 'quarters', 'repair',
];

/** Power goes to the important things first when the reactor is short. */
export const POWER_PRIORITY = ['thruster', 'tank', 'bumper', 'scanner', 'quarters', 'cargo', 'repair'];

/**
 * Flat inline SVG glyph per part, so the tray reads as pictures rather than
 * words. All drawn on a 32x32 canvas in currentColor.
 */
export const GLYPHS = {
  hull: '<rect x="7" y="7" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="1.7" fill="#241E4E"/><circle cx="20" cy="20" r="1.7" fill="#241E4E"/>',
  reactor: '<circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="4.5" fill="#241E4E"/><circle cx="16" cy="16" r="2" />',
  thruster: '<path d="M11 4h10l2 12H9z"/><path d="M12 18h8l-4 10z" opacity=".75"/>',
  tank: '<rect x="8" y="6" width="16" height="20" rx="8"/><path d="M8 18h16" stroke="#241E4E" stroke-width="2" fill="none"/>',
  cargo: '<rect x="5" y="9" width="22" height="15" rx="4"/><path d="M5 15h22" stroke="#241E4E" stroke-width="2" fill="none"/><rect x="14" y="15" width="4" height="9" fill="#241E4E"/>',
  scanner: '<path d="M16 22 6 12a14 14 0 0 1 20 0z"/><rect x="14.5" y="20" width="3" height="8" rx="1.5"/>',
  quarters: '<rect x="5" y="13" width="22" height="10" rx="5"/><circle cx="11" cy="18" r="3" fill="#241E4E"/><path d="M5 9h8v4H5z" opacity=".7"/>',
  repair: '<path d="M20 6a6 6 0 0 0-7.5 7.7L6 20.2 9.8 24l6.5-6.5A6 6 0 0 0 24 10l-3.4 3.4-2.9-2.9z"/>',
  bumper: '<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="16" cy="16" r="3.5"/>',
};

export const partIcon = (id, size = 28) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" fill="currentColor">${GLYPHS[id]}</svg>`;

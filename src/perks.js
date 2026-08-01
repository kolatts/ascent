// Pilot skills. Pick three. Each one needs a bunk (Quarters) on the ship to
// wake up, so a clever pilot costs mass just like a big engine does.

export const PERKS = [
  {
    id: 'scrapper', name: 'Scrapper',
    blurb: 'Finds more parts in old ships.',
    glyph: '<path d="M6 22l8-8 4 4-8 8z"/><circle cx="22" cy="10" r="6"/><path d="M17 15l3 3"/>',
  },
  {
    id: 'miser', name: 'Careful',
    blurb: 'Uses less fuel on every trip.',
    glyph: '<path d="M16 5c5 6 8 9 8 13a8 8 0 0 1-16 0c0-4 3-7 8-13z"/><circle cx="16" cy="19" r="3" fill="#241E4E"/>',
  },
  {
    id: 'cartographer', name: 'Far Eyes',
    blurb: 'Sees further across the map.',
    glyph: '<circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 20l7 7" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  },
  {
    id: 'engineer', name: 'Fixer',
    blurb: 'Mending broken parts costs half.',
    glyph: '<path d="M14 4h4v10h10v4H18v10h-4V18H4v-4h10z"/>',
  },
  {
    id: 'luckyeye', name: 'Lucky Eye',
    blurb: 'Sometimes finds something rare.',
    glyph: '<path d="M16 6l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  },
  {
    id: 'steady', name: 'Steady Hands',
    blurb: 'Nothing breaks when you drift.',
    glyph: '<path d="M8 16c0-5 3-9 8-9s8 4 8 9-3 9-8 9-8-4-8-9z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 16l3 3 5-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  },
  {
    id: 'brave', name: 'Brave',
    blurb: 'Strange places treat you kindly.',
    glyph: '<path d="M16 27S5 20 5 13a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 7-11 14-11 14z"/>',
  },
  {
    id: 'deeptanks', name: 'Deep Tanks',
    blurb: 'Carries a little extra fuel.',
    glyph: '<rect x="9" y="4" width="14" height="24" rx="7"/><path d="M9 18h14" stroke="#241E4E" stroke-width="3"/>',
  },
];

export const perkById = (id) => PERKS.find((p) => p.id === id);

export const perkIcon = (perk, size = 30) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" fill="currentColor">${perk.glyph}</svg>`;

// Anomalies: a short line of text and two or three doors, each with a real
// consequence. Written so a grown-up can read one out loud in five seconds.
//
// An outcome is { text, icon, fuel?, parts?, damage?, daze?, reveal?, heal? }.

export const ANOMALIES = [
  {
    id: 'whale',
    icon: 'anomaly',
    text: 'Something enormous drifts past, singing.',
    choices: [
      { label: 'Sing back', icon: 'anomaly', good: { text: 'It follows you a while and shows you the way.', reveal: 40 }, bad: { text: 'It swims off. The quiet is nice.', fuel: 1 } },
      { label: 'Stay very still', icon: 'quarters', good: { text: 'It passes over you. Warm air fills your tanks.', fuel: 5 }, bad: { text: 'It brushes the hull. Something rattles loose.', damage: 1 } },
    ],
  },
  {
    id: 'garden',
    icon: 'gas',
    text: 'A garden is growing on a broken wing.',
    choices: [
      { label: 'Pick some', icon: 'cargo', good: { text: 'The seeds are heavy and useful.', parts: { hull: 3 } }, bad: { text: 'They crumble to dust in your glove.', parts: { hull: 1 } } },
      { label: 'Leave it be', icon: 'anomaly', good: { text: 'You feel better. The pilot rests well.', heal: true, fuel: 2 }, bad: { text: 'You feel better anyway.', fuel: 1 } },
    ],
  },
  {
    id: 'lighthouse',
    icon: 'beacon',
    text: 'An old lamp is still burning out here.',
    choices: [
      { label: 'Read the map beside it', icon: 'scanner', good: { text: 'Someone drew the whole road.', reveal: 55 }, bad: { text: 'The ink has run, but some of it holds.', reveal: 22 } },
      { label: 'Take the lamp', icon: 'reactor', good: { text: 'It burns in your reactor for hours.', fuel: 6 }, bad: { text: 'It goes out the moment you lift it.', parts: { hull: 2 } } },
    ],
  },
  {
    id: 'mirror',
    icon: 'anomaly',
    text: 'Another ship, exactly like yours, waves.',
    choices: [
      { label: 'Wave back', icon: 'quarters', good: { text: 'They hand you fuel through the window.', fuel: 4 }, bad: { text: 'They wave until you are out of sight.', fuel: 1 } },
      { label: 'Trade parts', icon: 'cargo', good: { text: 'You each get the piece you needed.', parts: { thruster: 1 } }, bad: { text: 'A fair swap, more or less.', parts: { hull: 2 } } },
      { label: 'Fly on', icon: 'thruster', good: { text: 'You save your fuel. They understand.', fuel: 2 }, bad: { text: 'You save your fuel.', fuel: 1 } },
    ],
  },
  {
    id: 'storm',
    icon: 'anomaly',
    text: 'A bright storm is crackling ahead.',
    choices: [
      { label: 'Fly straight through', icon: 'thruster', good: { text: 'The storm shoves you along for free.', fuel: 5, reveal: 25 }, bad: { text: 'Sparks jump the hull. One box goes dark.', damage: 1 } },
      { label: 'Go the long way round', icon: 'scanner', good: { text: 'Slow, calm, and you spot a shortcut.', reveal: 30 }, bad: { text: 'Slow and calm. You use a little fuel.', fuel: -1 } },
    ],
  },
  {
    id: 'sleeper',
    icon: 'quarters',
    text: 'A sleeping pilot floats in a small pod.',
    choices: [
      { label: 'Wake them gently', icon: 'quarters', good: { text: 'They thank you and mend your ship.', heal: true, parts: { hull: 2 } }, bad: { text: 'They mumble, roll over, and sleep on.', parts: { hull: 1 } } },
      { label: 'Tuck them in and go', icon: 'anomaly', good: { text: 'You leave them a lamp. It feels right.', fuel: 3 }, bad: { text: 'You leave them a lamp.', fuel: 1 } },
    ],
  },
  {
    id: 'library',
    icon: 'scanner',
    text: 'Thousands of paper charts, drifting loose.',
    choices: [
      { label: 'Catch as many as you can', icon: 'scanner', good: { text: 'Half the sky, drawn by hand.', reveal: 60 }, bad: { text: 'You catch three. Better than none.', reveal: 20 } },
      { label: 'Build something from them', icon: 'hull', good: { text: 'Folded tight, they patch a hull beautifully.', parts: { hull: 4 } }, bad: { text: 'Paper is paper. Still, it plugs a gap.', parts: { hull: 2 } } },
    ],
  },
  {
    id: 'door',
    icon: 'anomaly',
    text: 'A door stands open, with nothing around it.',
    choices: [
      { label: 'Step through', icon: 'thruster', good: { text: 'You come out much closer to the light.', hop: true }, bad: { text: 'You come out where you started, dizzy.', daze: true } },
      { label: 'Close it politely', icon: 'quarters', good: { text: 'It hums, pleased, and gives you fuel.', fuel: 4 }, bad: { text: 'It swings open again behind you.', fuel: 1 } },
    ],
  },
];

/** Roll an outcome. Brave pilots tip the odds; nothing is ever a dead end. */
export function resolveChoice(choice, perks, rng = Math.random) {
  const chance = perks.includes('brave') ? 0.78 : 0.6;
  const good = rng() < chance;
  return { ...(good ? choice.good : choice.bad), good };
}

export const anomalyFor = (nodeId) => ANOMALIES[nodeId % ANOMALIES.length];

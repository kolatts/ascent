# Ascent

Build a little ship out of scavenged parts, pick a pilot, and find your own way
across the stars to the light.

A single static site. No build step, no bundler, no backend. Open `index.html`
from any web server and it runs.

**Play it:** https://kolatts.github.io/ascent/

---

## What it is

Heaven is a real place at a real coordinate. You can fly there. You have a ship
you built yourself, a map with no marked route, and not enough fuel.

There is no losing. There is only arriving later, lighter, and differently than
you planned.

It is built to be playable by a six-year-old: every action is one tap, almost
nothing is written down, every part and place is a picture, and a speaker button
in the corner reads the game out loud.

## The two tensions

**Mass against thrust.** How far one drop of fuel takes you is `thrust / mass`.
Every part that makes the ship better also makes it heavier. Cargo bays are the
sharpest version: carrying more parts costs you the range to go and get them.

**Power routing.** The reactor emits a fixed budget, but a part only draws power
if a chain of touching parts links it back to the reactor. Unconnected parts are
dead weight — they still count toward mass, and their cell goes dark on the
grid. This is why the player spends mass on plain hull plates: purely to move
electricity around.

## No dead ends

A link you cannot pay for is still flyable — you drift there instead, arriving
with empty tanks and a problem. Fuel clouds can always be visited again. Any
node lets you strip the ship and rebuild it for free. The pressure comes from
routing and budgeting, never from punishment.

## Running it

Any static server:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Layout

```
index.html          importmap for three.js, page shell
styles.css          the whole look
assets/             title art, gates, icons (watercolour, generated)
src/
  main.js           boot and screen routing
  state.js          the single state object; every write autosaves
  save.js           one versioned localStorage key
  parts.js          part definitions and their icons
  ship.js           grid maths: placement, power flooding, derived stats
  perks.js          pilot skills
  map.js            star map generation and reveal
  actions.js        travel, salvage, refuel, trade, mend, arrive
  events.js         anomalies and their outcomes
  render.js         three.js renderer, ship and pilot geometry
  mapview.js        the star map and arrival scenes
  voice.js          read-aloud, via the browser's own speech
  screens/          title, pilot, designer, starmap, arrival
```

All 3D geometry is generated in code from primitives. The ship you see is built
from the grid you laid out — geometry is a function of game state, not an asset.

## Save

One key, `ascent.save.v1`, holding one JSON object: grid layout, inventory,
fuel, pilot and perks, the map graph with its revealed and visited flags,
current node, and active setbacks. Autosaved on every change. Close the tab and
come back and you resume exactly. The version in the key means a schema change
resets cleanly instead of crashing.

## Accessibility

- Every control is a real button, keyboard reachable, with a spoken label.
- `prefers-reduced-motion` turns off drifting, rotation and transitions.
- Read-aloud narrates headlines, choices and outcomes using the browser's own
  speech synthesis. No audio files.

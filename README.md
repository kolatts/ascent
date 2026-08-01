# Ascent

Build a little ship out of scavenged parts, pick a pilot, and find your own way
across the stars to the light.

A single static site. No build step, no bundler, no backend. Open `index.html`
from any web server and it runs.

**Play it:** https://kolatts.github.io/ascent/

---

## What it is

Heaven is a real place at a real coordinate. You can fly there. You have a ship
you built yourself out of scavenged parts, and a map with no marked route.

There is no losing. There is only arriving later, lighter, and differently than
you planned.

It is built to be playable by a six-year-old: every action is one tap or one
slide, almost nothing is written down, every part and place is a picture, and a
speaker button in the corner reads the game out loud.

## Flying is an arcade game

Choosing where to go happens on the map. *Getting* there is played: your ship
sits low on the screen and flies away up it while rocks and sparkles come down
to meet you. Slide a finger or move the mouse to steer; arrow keys also work.
Sparkles become spare parts. Three clean hits in one leg shakes something loose.

There is no fuel to hunt. The ship makes its own.

## What the ship you build actually does

**Range.** How far one leg can be, `(40 + tanks) × thrust / mass`. Engines and
tanks both help, and every part you bolt on makes the ship heavier and gives
some of it back. Places beyond your range are marked too far until you build
something better.

**Width is your hitbox.** The ship is exactly as wide in flight as it is on the
grid, so a fat cargo hauler genuinely struggles to thread a gap that a narrow
one slips through. That is the cost of carrying more.

**Dodge.** How quickly it slides sideways, straight out of `thrust / mass`.

**Power routing.** The reactor emits a fixed budget, but a part only draws power
if a chain of touching parts links it back to the reactor. Unconnected parts are
dead weight — they still count toward mass and width, and their cell goes dark
on the grid. This is why the player spends mass on plain hull plates: purely to
move electricity around.

## No dead ends

Every leg is survivable. Rocks bump, they never end a run; bumpers soak one hit
each, and Steady Hands means nothing breaks at all. Gardens mend a part for
nothing. Any node lets you strip the ship and rebuild it for free. A **Skip**
button ends any flight early, and `prefers-reduced-motion` skips the arcade
entirely and simply lands you.

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
  actions.js        travel, salvage, rest, swap, mend, arrive
  events.js         anomalies and their outcomes
  flight.js         the arcade leg: steering, rocks, sparkles, collisions
  render.js         three.js renderer, ship and pilot geometry
  mapview.js        the star map and arrival scenes
  voice.js          read-aloud, via the browser's own speech
  screens/          title, pilot, designer, starmap, flight, arrival
```

All 3D geometry is generated in code from primitives. The ship you see is built
from the grid you laid out — geometry is a function of game state, not an asset.

## Save

One key, `ascent.save.v2`, holding one JSON object: grid layout, inventory,
pilot and perks, the map graph with its revealed and visited flags, current
node, any queued flight, and active setbacks. Autosaved on every change. Close the tab and
come back and you resume exactly. The version in the key means a schema change
resets cleanly instead of crashing.

## Accessibility

- Every control is a real button, keyboard reachable, with a spoken label.
- Flights can be steered with the arrow keys, skipped with a button, or turned
  off entirely — `prefers-reduced-motion` lands you without the arcade leg, and
  also stops the drifting, rotation and transitions everywhere else.
- Read-aloud narrates headlines, choices and outcomes using the browser's own
  speech synthesis. No audio files.

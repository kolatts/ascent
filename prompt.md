# Build prompt: *Ascent* — a browser game about reaching heaven

Build a complete, playable browser game. It is a single static site that runs entirely
client-side and is deployed to GitHub Pages. No server, no backend, no build step.

---

## The pitch

Heaven is a real place at a real coordinate. You can fly there. You have a ship you built
yourself out of scavenged parts, a star map with no marked route, and not enough fuel.

The player designs a ship on a grid, designs a pilot, and picks their own way across an
open node map toward Heaven — scavenging parts, refueling, refitting, and absorbing
setbacks along the way. There is no losing. There is only arriving later, lighter, and
differently than you planned.

---

## Non-negotiable constraints

- **Static site.** Deployable by dropping files in a repo and turning on GitHub Pages.
- **No build step.** Use an ES module `importmap` with a CDN. No npm, no bundler, no CI.
- **Three.js** for all 3D.
- **All 3D geometry is generated in code** from primitives — no external model files, no
  textures downloaded at runtime. Ships must render from the player's actual grid layout,
  so geometry is a function of game state, not an asset.
- **localStorage save.** One slot, versioned key, autosave on every state change. Closing
  the tab and coming back must resume exactly.
- **Mouse/UI driven.** No twitch controls, no WASD flying. Every action is a click.

Suggested layout: `index.html`, `styles.css`, and a small `src/` of ES modules
(`state.js`, `ship.js`, `map.js`, `render.js`, `parts.js`, `perks.js`, `events.js`, `save.js`).
Split by system, not by size. Keep it readable over clever.

---

## Visual direction

Dark cosmic. Deep blue-black void, volumetric glow, gradients that feel like light through
gas rather than CSS decoration.

- **Palette:** void `#05060E`, panel `#0D1122`, hull `#8FA3C8`, ion glow `#5EE8FF`,
  reactor warning `#FF7A45`, heaven light `#FFF3C4`.
- **Type:** a wide geometric display face for headings and readouts, a neutral grotesque
  for body and part descriptions. Numbers are tabular — this is a game about budgets, and
  the player is reading digits constantly.
- **Light does the work.** Emissive materials, bloom, and additive blending carry the mood.
  Avoid glass-panel gradients and neon-outlined boxes; the glow should come from objects in
  the scene, not from the UI chrome imitating them.
- **Motion is ambient, not decorative.** The ship rotates slowly in the designer. The star
  map drifts. Transitions between screens are short. Respect `prefers-reduced-motion`.

The signature element: the ship preview updates *live* as parts are placed. Drop a thruster
and its exhaust plume ignites in the preview immediately. That single feedback loop is what
makes the designer feel like a game rather than a form.

---

## Systems

### 1. Ship designer

An 8×6 grid, top-down silhouette. The player places parts from an inventory. Stats are
**derived from the layout**, never entered directly.

Part types, each with a footprint (in cells), mass, and power draw or output:

| Part | Footprint | Role |
|---|---|---|
| Hull plate | 1×1 | Structure; conducts power between parts |
| Reactor | 2×2 | Generates the power budget |
| Thruster | 1×2 | Produces thrust; **must touch the rear edge** |
| Fuel tank | 2×2 | Fuel capacity |
| Cargo bay | 2×2 | Parts-carrying capacity |
| Scanner | 1×1 | Reveals map nodes at range |
| Quarters | 2×1 | Enables pilot perks |
| Repair bay | 2×1 | Reduces parts cost of repairs |

**The two tensions, made spatial:**

- **Mass vs. thrust.** Range per unit of fuel = `thrust / totalMass`. Every part you add to
  make the ship better also makes it heavier. Cargo bays are the sharpest version of this:
  carrying more parts costs you the range to go get them.
- **Power routing.** The reactor emits a fixed power budget, but a part only draws power if
  it is connected to the reactor through a contiguous chain of hull plates or other powered
  parts. Unconnected parts are dead weight — they still count toward mass. This is what
  makes it a *layout* puzzle instead of a checklist: the player spends mass on hull plates
  purely to move electricity around.

Live readout panel: total mass, thrust, range per fuel, power generated / drawn, cargo
capacity, scan radius. Invalid configurations are shown clearly and specifically ("Thruster
at C6 isn't touching the rear edge" — not "invalid ship"), and the player can still fly a
suboptimal ship. Only genuinely impossible ships (no reactor, no thruster) block launch.

### 2. The pilot

A small character designer. Procedural humanoid built from primitives in a pressure suit,
with a few adjustable parameters (build, suit color, helmet style) that are purely cosmetic.

Mechanically, the pilot picks **three perks** from a pool of about eight. Each perk needs a
Quarters module on the ship to be active — so perks cost mass, and a pilot-heavy build is a
real tradeoff against a cargo-heavy one.

Perk examples: `Scrapper` (+40% parts from derelicts), `Miser` (−15% fuel burn),
`Cartographer` (+1 scan range), `Field Engineer` (repairs cost half), `Salvager's Eye`
(derelicts occasionally yield a rare part), `Steady Hands` (setbacks damage one fewer part).

### 3. The star map

A 3D node graph in space, roughly 35–45 nodes, procedurally laid out each new game. Heaven
sits at the far end — always visible as a distant light, always reachable by many routes.

Edges cost fuel proportional to distance divided by the ship's range stat. Nodes are hidden
until they come within scan radius, so the map reveals itself as you move and routing is a
decision under real uncertainty.

Node types:

- **Derelict** — salvage parts. Some are picked clean.
- **Gas cloud** — refuel, slowly.
- **Station** — trade parts for fuel and back, at a bad rate. Repair damaged modules.
- **Anomaly** — a text event with two or three choices and a real consequence.
- **Beacon** — reveals a wide radius of the map at once.

The player can always refit at any node. Refitting is free; the parts to refit with are not.

### 4. Setbacks, not failure

There is no game over and no permadeath. Running out of fuel between nodes doesn't end the
run — you drift to the nearest node and arrive with a problem. Consequences are concrete and
recoverable:

- A specific module is marked **damaged** on the grid — its stats are zeroed until repaired
  with parts, and the player can see exactly which cell went dark.
- Fuel is lost, or cargo is jettisoned to make a burn.
- The ship drifts to an unintended node, off the planned route.
- A perk is temporarily disabled ("the pilot is concussed").

The pressure comes from routing and budgeting, not from punishment. The player should always
be able to see a way forward, even a slow and ugly one.

### 5. Arrival

The player reaches Heaven. It is real, it is there, and the arrival is a genuine payoff —
give it a proper sequence: the light resolves, the ship makes its final approach.

Then the twist. **Suggested version:** Heaven is a shipyard. Every derelict the player
stripped for parts was someone who made it here before them. Arriving means your ship is
taken apart into inventory for the next traveler, and the run's final screen is your ship
rendered one last time, then dissolving into its component parts — which are placed on the
map for a new game. The parts you salvaged were always someone's arrival.

If a different ending fits better, swap it, but preserve the shape: the twist should
reframe the *parts* resource, since that's what the player has been touching all game.

---

## Save format

Single localStorage key, e.g. `ascent.save.v1`, holding one JSON object: grid layout, part
inventory, fuel, pilot config and perks, map graph with revealed/visited flags, current
node, active setbacks. Version the key so a schema change resets cleanly instead of
crashing. Autosave on every mutation.

---

## Build order

Build in this sequence and make each step playable before moving on:

1. State model, part definitions, and the derived-stats calculator. Get the math right first.
2. Ship designer UI — grid, drag-and-drop, live readout, validation messages.
3. Three.js ship preview driven by the grid. Now it's a toy you can enjoy.
4. Star map generation, rendering, and travel with fuel cost.
5. Node interactions: salvage, refuel, trade, repair.
6. Anomaly events and setbacks.
7. Pilot designer and perks.
8. Arrival sequence and ending.
9. Save/load, then polish: bloom, transitions, empty and error states.

---

## Non-goals

Don't build: multiplayer, accounts, audio assets, a tutorial overlay, difficulty settings,
achievements, or a settings menu beyond reduced-motion and a reset-save button. Don't add a
second currency. Don't add a timer.

Write copy in the interface's own voice — plain, direct, a little cold, the way a ship's
console would say things. Never apologize in an error state; say what happened and what the
player can do about it.
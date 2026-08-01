// The ship designer. Click a part, click the grid. Click a placed part to
// pick it back up. Nothing is dragged, nothing rotates, nothing is typed.

import { el, setStyle, prefersReducedMotion } from '../util.js';
import { PARTS, PART_ORDER, GRID_W, GRID_H, partIcon } from '../parts.js';
import {
  canPlace, powerAnalysis, shipProblems, shipStats, canLaunch, newUid,
  autoBuild, spendInventory, cellsOf, key,
} from '../ship.js';
import { PERKS, perkIcon } from '../perks.js';
import { getState, mutate, currentPerks, stats, cargoUsed } from '../state.js';
import { makeShipView, setView } from '../render.js';
import * as Render from '../render.js';
import { speak } from '../voice.js';

export function mountDesigner(root, { onLaunch, onBackToPilot }) {
  const s = getState();
  let held = null;          // part type in hand
  let hover = null;         // { x, y, ok }
  let flagged = new Set();  // cells a problem is pointing at

  // ------------------------------------------------------------ scaffolding --
  const gridEl = el('div.grid', { style: { '--cols': GRID_W, '--rows': GRID_H } });
  const cellEls = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = el('button.cell', {
        type: 'button',
        'data-x': x, 'data-y': y,
        'aria-label': `row ${y + 1} column ${x + 1}`,
      });
      c.addEventListener('pointerenter', () => setHover(x, y));
      c.addEventListener('focus', () => setHover(x, y));
      c.addEventListener('click', () => placeAt(x, y));
      gridEl.append(c);
      cellEls.push(c);
    }
  }
  const tilesEl = el('div.tiles');
  const ghostEl = el('div.ghost', { hidden: true });
  gridEl.append(tilesEl, ghostEl);
  gridEl.addEventListener('pointerleave', () => { hover = null; drawGhost(); });

  const trayEl = el('div.tray');
  const readoutEl = el('div.readout');
  const problemsEl = el('div.problems');
  const previewEl = el('div.preview', { id: 'ship-anchor' });
  const perkStripEl = el('div.perkstrip');

  const launchBtn = el('button.big.go', { type: 'button', onclick: tryLaunch });
  const autoBtn = el('button.big.ghostbtn', {
    type: 'button',
    onclick: () => {
      mutate((st) => {
        const stock = { ...st.inventory };
        for (const p of st.placements) stock[p.type] = (stock[p.type] || 0) + 1;
        st.placements = autoBuild(stock);
        st.inventory = spendInventory(stock, st.placements);
        st.fuel = Math.min(st.fuel, shipStats(st.placements, []).fuelCap);
      });
      held = null;
      speak('Here is a ship.');
      refresh();
    },
    html: `${wand()}<span>Build one for me</span>`,
  });
  const clearBtn = el('button.small', {
    type: 'button',
    onclick: () => {
      mutate((st) => {
        for (const p of st.placements) st.inventory[p.type] = (st.inventory[p.type] || 0) + 1;
        st.placements = [];
      });
      held = null;
      refresh();
    },
  }, 'Take it all apart');

  const backBtn = el('button.small', { type: 'button', onclick: onBackToPilot }, '← Pilot');

  const screen = el('div.screen.designer', {},
    el('header.screen-head', {},
      el('h1.display', {}, 'Build your ship'),
      el('p.sub', {}, 'Tap a piece. Tap the ship.')
    ),
    el('div.build-body', {},
      el('div.build-left', {},
        el('div.grid-wrap', {},
          el('div.grid-edge.front', {}, 'front'),
          gridEl,
          el('div.grid-edge.rear', {}, 'back ⬇')
        ),
        trayEl
      ),
      el('div.build-right', {},
        previewEl,
        readoutEl,
        perkStripEl,
        problemsEl,
        el('div.build-actions', {}, autoBtn, launchBtn),
        el('div.build-actions.minor', {}, backBtn, clearBtn)
      )
    )
  );
  root.append(screen);

  // ------------------------------------------------------------------- 3D --
  const shipView = makeShipView(previewEl);
  setView(shipView);

  // ---------------------------------------------------------------- logic --
  /** Nudge a big part so the cell you tapped is inside it and it still fits. */
  function snap(type, x, y) {
    const def = PARTS[type];
    const tries = [];
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) tries.push([x - dx, y - dy]);
    const st = getState();
    for (const [tx, ty] of tries) if (canPlace(st.placements, type, tx, ty)) return [tx, ty];
    return null;
  }

  function setHover(x, y) {
    hover = { x, y };
    drawGhost();
  }

  function drawGhost() {
    if (!held || !hover) { ghostEl.hidden = true; return; }
    const spot = snap(held, hover.x, hover.y);
    const def = PARTS[held];
    ghostEl.hidden = false;
    ghostEl.className = `ghost ${spot ? 'ok' : 'bad'}`;
    const [gx, gy] = spot || [Math.min(hover.x, GRID_W - def.w), Math.min(hover.y, GRID_H - def.h)];
    setStyle(ghostEl, { '--x': gx, '--y': gy, '--w': def.w, '--h': def.h });
    ghostEl.innerHTML = partIcon(held, 26);
  }

  function placeAt(x, y) {
    const st = getState();
    if (!held) return;
    if ((st.inventory[held] || 0) <= 0) return;
    const spot = snap(held, x, y);
    if (!spot) { bump(); return; }
    const type = held;
    mutate((s2) => {
      s2.placements.push({ uid: newUid(), type, x: spot[0], y: spot[1], damaged: false });
      s2.inventory[type] = (s2.inventory[type] || 0) - 1;
      s2.fuel = Math.min(s2.fuel, shipStats(s2.placements, []).fuelCap);
    });
    if ((getState().inventory[type] || 0) <= 0) held = null;
    refresh();
  }

  function pickUp(uid) {
    const st = getState();
    const p = st.placements.find((q) => q.uid === uid);
    if (!p) return;
    mutate((s2) => {
      s2.placements = s2.placements.filter((q) => q.uid !== uid);
      s2.inventory[p.type] = (s2.inventory[p.type] || 0) + 1;
      s2.fuel = Math.min(s2.fuel, shipStats(s2.placements, []).fuelCap);
    });
    held = p.type;
    refresh();
  }

  function bump() {
    if (prefersReducedMotion()) return;
    gridEl.classList.remove('nope');
    void gridEl.offsetWidth;
    gridEl.classList.add('nope');
  }

  function tryLaunch() {
    const st = getState();
    if (!canLaunch(st.placements)) {
      const first = shipProblems(st.placements).find((p) => p.blocking);
      speak(first?.text || 'Your ship is not ready.', { force: true });
      flagProblem(first);
      bump();
      return;
    }
    onLaunch();
  }

  function flagProblem(problem) {
    flagged = new Set((problem?.cells || []).map(([x, y]) => key(x, y)));
    paintFlags();
    if (problem) speak(problem.text, { force: true });
  }

  function paintFlags() {
    for (const c of cellEls) {
      c.classList.toggle('flag', flagged.has(key(+c.dataset.x, +c.dataset.y)));
    }
  }

  // ---------------------------------------------------------------- paint --
  function refresh() {
    const st = getState();
    const power = powerAnalysis(st.placements);
    const perks = currentPerks(st);
    const sh = shipStats(st.placements, perks);

    // tiles
    tilesEl.replaceChildren();
    for (const p of st.placements) {
      const def = PARTS[p.type];
      const lit = power.powered.has(p.uid) && !p.damaged;
      const tile = el('button.tile', {
        type: 'button',
        title: def.name,
        'aria-label': `${def.name}, tap to take off the ship`,
        class: `${p.type} ${p.damaged ? 'broken' : lit ? 'lit' : 'dark'}`,
        style: { '--x': p.x, '--y': p.y, '--w': def.w, '--h': def.h },
        onclick: (ev) => { ev.stopPropagation(); pickUp(p.uid); },
        html: partIcon(p.type, Math.min(def.w, def.h) > 1 ? 34 : 24) +
          (p.damaged ? crackMark() : lit ? '' : unplugMark()),
      });
      tilesEl.append(tile);
    }

    // tray
    trayEl.replaceChildren();
    for (const type of PART_ORDER) {
      const def = PARTS[type];
      const n = st.inventory[type] || 0;
      const btn = el('button.chip', {
        type: 'button',
        class: `${held === type ? 'held' : ''} ${n <= 0 ? 'empty' : ''}`,
        'aria-pressed': held === type,
        'aria-label': `${def.name}, ${n} left`,
        onclick: () => {
          held = n > 0 ? (held === type ? null : type) : null;
          if (held) speak(def.name);
          refresh();
        },
        html: `<span class="chip-icon">${partIcon(type, 30)}</span>
               <span class="chip-n">${n}</span>
               <span class="chip-name">${def.name}</span>`,
      });
      trayEl.append(btn);
    }
    drawGhost();

    // readout
    const fuelPct = Math.round((sh.used / Math.max(1, sh.supply)) * 100);
    readoutEl.innerHTML = `
      <div class="stat" title="How far one drop of fuel takes you">
        ${gauge('reach')}<b>${sh.reach.toFixed(1)}</b><span>reach</span>
      </div>
      <div class="stat" title="How much fuel the ship can hold">
        ${gauge('fuel')}<b>${sh.fuelCap}</b><span>fuel</span>
      </div>
      <div class="stat" title="How heavy the ship is">
        ${gauge('mass')}<b>${sh.mass}</b><span>weight</span>
      </div>
      <div class="stat" title="Room for spare parts">
        ${gauge('cargo')}<b>${sh.cargo}</b><span>room</span>
      </div>
      <div class="stat wide ${sh.used > sh.supply ? 'over' : ''}" title="Power">
        ${gauge('power')}
        <div class="bar"><i style="width:${Math.min(100, fuelPct)}%"></i></div>
        <span>${sh.used}/${sh.supply} power</span>
      </div>`;

    // perks awake / asleep
    perkStripEl.replaceChildren();
    for (const id of st.pilot.perks) {
      const perk = PERKS.find((p) => p.id === id);
      if (!perk) continue;
      const awake = perks.includes(id);
      perkStripEl.append(el('div.perkpip', {
        class: awake ? 'awake' : 'asleep',
        title: awake ? `${perk.name}: ${perk.blurb}` : `${perk.name} needs a bed (Quarters)`,
        html: perkIcon(perk, 22) + `<span>${perk.name}</span>` + (awake ? '' : '<em>zzz</em>'),
      }));
    }

    // problems
    const problems = shipProblems(st.placements).slice(0, 2);
    problemsEl.replaceChildren();
    for (const pr of problems) {
      problemsEl.append(el('button.problem', {
        type: 'button',
        class: pr.blocking ? 'stop' : 'warn',
        onclick: () => flagProblem(pr),
        html: `<span class="pico">${partIcon(pr.icon, 22)}</span><span>${pr.text}</span>`,
      }));
    }
    if (!problems.length) {
      problemsEl.append(el('div.problem.good', {}, 'Ready to fly.'));
    }

    // Dimmed but still tappable: a dead button teaches nothing, whereas a
    // tap on this one says out loud what the ship is missing.
    const ok = canLaunch(st.placements);
    launchBtn.classList.toggle('notready', !ok);
    launchBtn.innerHTML = `<span>Fly</span>${arrow()}`;

    if (flagged.size) paintFlags();
    shipView.setShip(st.placements, power);
  }

  refresh();
  speak('Build your ship.');

  return {
    refresh,
    unmount() {
      Render.clearView();
      screen.remove();
    },
  };
}

// ------------------------------------------------------------------ glyphs --

const wand = () =>
  `<svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M6 26l14-14 3 3L9 29z"/><path d="M22 3l1.6 4.4L28 9l-4.4 1.6L22 15l-1.6-4.4L16 9l4.4-1.6z"/></svg>`;
const arrow = () =>
  `<svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M5 14h14V7l9 9-9 9v-7H5z"/></svg>`;
const unplugMark = () =>
  `<svg class="mark" viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M11 4v8H8v6a6 6 0 0 0 5 5.9V28h6v-4.1A6 6 0 0 0 24 18v-6h-3V4h-3v8h-4V4z" opacity=".8"/><path d="M4 4l24 24" stroke="currentColor" stroke-width="3"/></svg>`;
// A sticking plaster reads as "this needs mending" to someone who cannot
// yet read the word "damaged".
const crackMark = () =>
  `<svg class="mark" viewBox="0 0 32 32" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="2" y="12" width="28" height="9" rx="4.5" transform="rotate(-40 16 16)"/><circle cx="13" cy="19" r="1.3" fill="#2c1c1c"/><circle cx="19" cy="13" r="1.3" fill="#2c1c1c"/><circle cx="19" cy="19" r="1.3" fill="#2c1c1c"/><circle cx="13" cy="13" r="1.3" fill="#2c1c1c"/></svg>`;
const gauge = (kind) => {
  const paths = {
    reach: '<path d="M16 2l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/>',
    fuel: '<path d="M16 4c5 6 8 9 8 13a8 8 0 0 1-16 0c0-4 3-7 8-13z"/>',
    mass: '<path d="M6 24h20l-4-12H10z"/><circle cx="16" cy="8" r="3"/>',
    cargo: '<rect x="4" y="10" width="24" height="14" rx="3"/><path d="M4 16h24" stroke="#241E4E" stroke-width="2"/>',
    power: '<path d="M18 2l-11 16h8l-3 12 11-16h-8z"/>',
  };
  return `<svg class="gicon" viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true">${paths[kind]}</svg>`;
};

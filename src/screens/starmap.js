// The map screen. The 3D scene sets the mood; the buttons on top of it are
// plain DOM so they can be big, bright and easy to hit.

import { el, prefersReducedMotion, clamp } from '../util.js';
import { NODE_TYPES, nodeIcon, optionsFrom, progress } from '../map.js';

const JOURNEY_STEPS = 12;
import { partIcon, PARTS } from '../parts.js';
import { powerAnalysis } from '../ship.js';
import { getState, mutate, stats, currentPerks, cargoUsed } from '../state.js';
import {
  travelPlan, travelTo, salvage, drawFuel, sellPartsForFuel, buyPartsWithFuel,
  mendCost, brokenParts, mendOne, applyOutcome, lightBeacon, TRADE, PUFF,
} from '../actions.js';
import { anomalyFor, resolveChoice } from '../events.js';
import { makeMapView } from '../mapview.js';
import { setView, clearView } from '../render.js';
import { speak } from '../voice.js';

export function mountStarmap(root, { onRefit, onArrive }) {
  const stageEl = el('div.map-stage', { id: 'map-anchor' });
  const markersEl = el('div.markers');
  const hudEl = el('div.hud');
  const panelEl = el('div.panel');
  stageEl.append(markersEl);

  const screen = el('div.screen.map', {}, stageEl, hudEl, panelEl);
  root.append(screen);

  const view = makeMapView(stageEl, getState().map);
  setView(view);
  view.setShip(getState().placements, powerAnalysis(getState().placements));
  view.setCurrent(getState().currentId);
  view.refresh(getState());

  let busy = false;
  let pending = null; // { kind:'drift', id } | { kind:'outcome', changes, text } | { kind:'event' }

  // --- markers ---------------------------------------------------------------
  const markerFor = new Map();
  function buildMarkers() {
    markersEl.replaceChildren();
    markerFor.clear();
    for (const n of getState().map.nodes) {
      const b = el('button.marker', {
        type: 'button',
        'data-id': n.id,
        onclick: () => onMarker(n.id),
      });
      markersEl.append(b);
      markerFor.set(n.id, b);
    }
  }
  buildMarkers();

  view.onProject = (list) => {
    for (const p of list) {
      const m = markerFor.get(p.id);
      if (!m) continue;
      if (!p.visible) { m.style.display = 'none'; continue; }
      m.style.display = '';
      m.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      m.style.zIndex = String(1000 - Math.round(p.depth * 500));
    }
  };

  // Gentle parallax: the sky leans a little as you move the pointer.
  stageEl.addEventListener('pointermove', (ev) => {
    const r = stageEl.getBoundingClientRect();
    view.setDrift(((ev.clientX - r.left) / r.width) * 2 - 1, ((ev.clientY - r.top) / r.height) * 2 - 1);
  });
  stageEl.addEventListener('pointerleave', () => view.setDrift(0, 0));

  function paintMarkers() {
    const s = getState();
    const cur = s.map.nodes[s.currentId];
    const linked = new Set(cur.links);
    for (const n of s.map.nodes) {
      const m = markerFor.get(n.id);
      const known = n.seen || n.type === 'heaven';
      const adjacent = linked.has(n.id);
      const isCurrent = n.id === s.currentId;

      if (!known && !adjacent) { m.hidden = true; continue; }
      m.hidden = false;

      const plan = adjacent ? travelPlan(n.id) : null;
      // Which way is on? Without this the map is a maze and a small pilot
      // will happily fly back and forth between the same two dots forever.
      const onward = adjacent && n.layer > cur.layer;

      const cls = ['marker'];
      if (isCurrent) cls.push('here');
      if (adjacent) cls.push('reachable');
      if (onward) cls.push('onward');
      if (plan && !plan.affordable) cls.push('costly');
      if (!known) cls.push('unknown');
      if (n.visited) cls.push('been');
      if (n.type === 'heaven') cls.push('heaven');
      if (n.spent) cls.push('spent');
      m.className = cls.join(' ');
      m.style.setProperty('--tint', NODE_TYPES[n.type].tint);
      m.disabled = !adjacent || isCurrent || busy;

      const label = known ? NODE_TYPES[n.type].name : 'Somewhere new';
      m.setAttribute('aria-label',
        plan ? `${label}, ${plan.cost} fuel${onward ? ', toward the light' : ''}` : label);
      m.innerHTML = `
        ${onward ? `<span class="m-onward">${onwardGlyph()}</span>` : ''}
        <span class="m-disc">${known ? nodeIcon(n.type, 26) : questionGlyph()}</span>
        ${plan ? `<span class="m-cost ${plan.affordable ? '' : 'over'}">${drop(14)}${plan.cost}</span>` : ''}
        ${isCurrent ? '<span class="m-ring"></span>' : ''}`;
    }
  }

  // --- HUD -------------------------------------------------------------------
  function paintHud() {
    const s = getState();
    const sh = stats(s);
    const used = cargoUsed(s);
    const done = Math.round(progress(s.map, s.currentId) * JOURNEY_STEPS);

    hudEl.innerHTML = `
      <div class="hud-item fuel" title="Fuel">
        ${drop(22)}<b>${s.fuel}</b><span class="of">/${sh.fuelCap}</span>
        <div class="pips">${pips(s.fuel, sh.fuelCap)}</div>
      </div>
      <div class="hud-item" title="Spare parts">
        ${partIcon('cargo', 22)}<b>${used}</b><span class="of">/${sh.cargo}</span>
      </div>
      <div class="hud-item journey" title="How far along you are">
        <span class="j-track">${Array.from({ length: JOURNEY_STEPS },
          (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>
        ${nodeIcon('heaven', 22)}
      </div>`;
    const refit = el('button.small.refit', {
      type: 'button', onclick: onRefit, 'aria-label': 'Change ship',
    }, el('span', { html: partIcon('hull', 20) }), el('span.label', {}, 'Change ship'));
    hudEl.append(refit);
  }

  // --- panel -----------------------------------------------------------------
  function paintPanel() {
    const s = getState();
    const node = s.map.nodes[s.currentId];
    panelEl.replaceChildren();

    if (busy) {
      panelEl.append(el('div.panel-body.calm', {}, el('p.big-line', {}, 'Flying…')));
      return;
    }

    if (pending?.kind === 'drift') {
      const plan = travelPlan(pending.id);
      panelEl.append(el('div.panel-body', {},
        el('p.big-line', {}, `Not enough fuel. You need ${plan.cost}.`),
        el('div.choices', {},
          el('button.big.warn', {
            type: 'button',
            onclick: () => { const id = pending.id; pending = null; doTravel(id); },
            html: `${driftGlyph()}<span>Drift there anyway</span>`,
          }),
          el('button.big.ghostbtn', {
            type: 'button',
            onclick: () => { pending = null; paint(); },
            html: '<span>Stay here</span>',
          })
        )
      ));
      speak(`Not enough fuel. You need ${plan.cost}. You can drift there anyway.`);
      return;
    }

    if (pending?.kind === 'result') {
      panelEl.append(el('div.panel-body', {},
        el('p.big-line', {}, pending.text),
        el('div.pill-row', {}, pending.changes.map((c) =>
          el('span.pill', { html: `${partIcon(c.icon === 'gas' ? 'tank' : c.icon === 'scanner' ? 'scanner' : c.icon, 18)}<span>${c.text}</span>` }))),
        el('button.big.go', {
          type: 'button', onclick: () => { pending = null; paint(); },
          html: '<span>OK</span>',
        })
      ));
      speak(pending.text);
      return;
    }

    const body = el('div.panel-body');
    const title = el('div.panel-title', {},
      el('span.p-icon', { html: nodeIcon(node.type, 30) }),
      el('h2', {}, NODE_TYPES[node.type].name)
    );
    body.append(title);

    const actions = el('div.choices');

    if (node.type === 'heaven') {
      body.append(el('p.big-line', {}, 'You made it. The light is right there.'));
      actions.append(el('button.big.go glow', {
        type: 'button', onclick: onArrive,
        html: `${nodeIcon('heaven', 24)}<span>Go into the light</span>`,
      }));
      speak('You made it. The light is right there.');
    } else if (node.type === 'derelict') {
      if (node.spent) {
        body.append(el('p.big-line', {}, 'Empty. Someone got here first.'));
      } else {
        body.append(el('p.big-line', {}, 'An old ship, quiet and full of parts.'));
        actions.append(el('button.big.go', {
          type: 'button',
          onclick: () => {
            const r = salvage(node.id);
            const bits = Object.entries(r.taken)
              .map(([t, n]) => `${n} × ${PARTS[t].name}`).join(', ');
            pending = {
              kind: 'result',
              text: r.total ? `You took ${r.total} part${r.total === 1 ? '' : 's'}.` : 'Your crate is full.',
              changes: r.total ? [{ icon: 'cargo', text: bits }] : [],
            };
            paint();
          },
          html: `${partIcon('cargo', 24)}<span>Take the parts</span>`,
        }));
        speak('An old ship, quiet and full of parts.');
      }
    } else if (node.type === 'gas') {
      const sh = stats(s);
      const full = s.fuel >= sh.fuelCap;
      body.append(el('p.big-line', {}, full ? 'Tanks are full.' : node.stock > 0 ? 'Thick fuel, drifting free.' : 'This patch is thin now.'));
      actions.append(el('button.big.go', {
        type: 'button',
        class: full || node.stock <= 0 ? 'disabled' : '',
        onclick: () => {
          const got = drawFuel(node.id);
          if (got) speak(`Plus ${got} fuel.`);
          paint();
        },
        html: `${drop(24)}<span>Fill up +${PUFF}</span>`,
      }));
      body.append(el('div.stock-row', {},
        Array.from({ length: 4 }, (_, i) =>
          el('span.stockpip', { class: i < node.stock ? 'on' : '' }))));
    } else if (node.type === 'station') {
      body.append(el('p.big-line', {}, 'A station. They will swap, but not kindly.'));
      const sh = stats(s);
      actions.append(el('button.big', {
        type: 'button',
        class: (s.inventory.hull || 0) < TRADE.partsForFuel.give || s.fuel >= sh.fuelCap ? 'disabled' : '',
        onclick: () => { sellPartsForFuel(); paint(); },
        html: `${partIcon('hull', 20)}<b>${TRADE.partsForFuel.give}</b>${swap()}${drop(20)}<b>${TRADE.partsForFuel.get}</b>`,
      }));
      actions.append(el('button.big', {
        type: 'button',
        class: s.fuel < TRADE.fuelForParts.give || cargoUsed(s) >= sh.cargo ? 'disabled' : '',
        onclick: () => { buyPartsWithFuel(); paint(); },
        html: `${drop(20)}<b>${TRADE.fuelForParts.give}</b>${swap()}${partIcon('hull', 20)}<b>${TRADE.fuelForParts.get}</b>`,
      }));
      const broken = brokenParts(s);
      if (broken.length) {
        const cost = mendCost(s);
        body.append(el('p.note', {}, `Mending costs ${cost} hull plate${cost === 1 ? '' : 's'}.`));
        for (const p of broken) {
          actions.append(el('button.big.warn', {
            type: 'button',
            class: (s.inventory.hull || 0) < cost ? 'disabled' : '',
            onclick: () => { mendOne(p.uid); refreshShip(); paint(); },
            html: `${partIcon('repair', 20)}<span>Mend the ${PARTS[p.type].name.toLowerCase()}</span>`,
          }));
        }
      }
      speak('A station. You can swap parts for fuel here.');
    } else if (node.type === 'beacon') {
      if (node.spent) {
        body.append(el('p.big-line', {}, 'The beacon is dark now.'));
      } else {
        body.append(el('p.big-line', {}, 'A tall lamp, still blinking.'));
        actions.append(el('button.big.go', {
          type: 'button',
          onclick: () => {
            const found = lightBeacon(node.id);
            pending = { kind: 'result', text: `You can see ${found} new places.`, changes: [] };
            paint();
          },
          html: `${nodeIcon('beacon', 24)}<span>Light it up</span>`,
        }));
        speak('A tall lamp, still blinking.');
      }
    } else if (node.type === 'anomaly') {
      const ev = anomalyFor(node.id);
      if (node.spent) {
        body.append(el('p.big-line', {}, 'Whatever it was, it has gone quiet.'));
      } else {
        body.append(el('p.big-line', {}, ev.text));
        for (const c of ev.choices) {
          actions.append(el('button.big', {
            type: 'button',
            onclick: () => {
              const outcome = resolveChoice(c, currentPerks(getState()));
              const changes = applyOutcome(outcome);
              refreshShip();
              view.setCurrent(getState().currentId);
              pending = { kind: 'result', text: outcome.text, changes };
              paint();
            },
            html: `${partIcon(c.icon in { thruster: 1, quarters: 1, cargo: 1, scanner: 1, reactor: 1, hull: 1, repair: 1, tank: 1 } ? c.icon : 'hull', 22)}<span>${c.label}</span>`,
          }));
        }
        speak(ev.text);
      }
    } else {
      body.append(el('p.big-line', {}, 'Home. Everything starts here.'));
      speak('Home. Pick a place to fly to.');
    }

    if (actions.children.length) body.append(actions);

    const opts = optionsFrom(getState().map, s.currentId);
    if (opts.length && node.type !== 'heaven') {
      body.append(el('p.hint', {}, s.fuel === 0
        ? 'Your tank is empty. Green clouds fill it up again.'
        : 'Tap a glowing dot to fly. Arrows point to the light.'));
    }
    panelEl.append(body);
  }

  // --- travel ---------------------------------------------------------------
  function onMarker(id) {
    if (busy) return;
    const s = getState();
    if (id === s.currentId) return;
    if (!s.map.nodes[s.currentId].links.includes(id)) return;
    const plan = travelPlan(id);
    if (!plan.affordable) { pending = { kind: 'drift', id }; paint(); return; }
    doTravel(id);
  }

  function doTravel(id) {
    const res = travelTo(id);
    const animate = !prefersReducedMotion();
    view.setCurrent(id, { animate });
    busy = animate;
    paint();

    const finish = () => {
      busy = false;
      const s = getState();
      view.refresh(s);
      if (res.drifted) {
        const bits = [];
        if (res.broke) bits.push({ icon: 'repair', text: `${PARTS[res.broke.type].name} broke` });
        if (res.jettisoned) bits.push({ icon: 'cargo', text: `${res.jettisoned} parts lost` });
        if (res.dazed) bits.push({ icon: 'quarters', text: 'a skill is sleepy' });
        pending = { kind: 'result', text: 'You drifted in with empty tanks.', changes: bits };
        refreshShip();
      }
      paint();
    };
    if (animate) setTimeout(finish, 1200);
    else finish();
  }

  function refreshShip() {
    const s = getState();
    view.setShip(s.placements, powerAnalysis(s.placements));
  }

  // --- paint ------------------------------------------------------------------
  function paint() {
    view.refresh(getState());
    paintMarkers();
    paintHud();
    paintPanel();
  }

  paint();

  return {
    refresh() { refreshShip(); paint(); },
    unmount() { clearView(); screen.remove(); },
  };
}

// ------------------------------------------------------------------ glyphs --

const drop = (size = 20) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M16 3c6 7 9 10 9 14a9 9 0 0 1-18 0c0-4 3-7 9-14z"/></svg>`;
const onwardGlyph = () =>
  `<svg viewBox="0 0 32 20" width="26" height="17" fill="currentColor" aria-hidden="true"><path d="M16 1l7 9h-4.5v9h-5v-9H9z"/></svg>`;
const questionGlyph = () =>
  `<svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M16 4a8 8 0 0 0-8 8h5a3 3 0 1 1 4 2.8c-1.8.8-3 2.4-3 4.4V21h5v-1a5.6 5.6 0 0 0 3-5A8 8 0 0 0 16 4z"/><circle cx="16" cy="26" r="2.4"/></svg>`;
const swap = () =>
  `<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M4 11h18V6l7 7-7 7v-5H4z" opacity=".9"/></svg>`;
const driftGlyph = () =>
  `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M3 12c4-4 8 4 12 0s8-4 12 0"/><path d="M3 22c4-4 8 4 12 0s8-4 12 0"/></svg>`;
const pips = (n, cap) => {
  const shown = Math.min(cap, 14);
  let out = '';
  for (let i = 0; i < shown; i++) out += `<i class="${i < n ? 'on' : ''}"></i>`;
  return out;
};

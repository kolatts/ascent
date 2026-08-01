// The map screen. The 3D scene sets the mood; the buttons on top of it are
// plain DOM so they can be big, bright and easy to hit.
//
// Nothing here spends fuel. A route is either inside your ship's range or it
// isn't, and a longer route simply means a longer flight to fly.

import { el, prefersReducedMotion } from '../util.js';
import { NODE_TYPES, nodeIcon, optionsFrom, progress } from '../map.js';
import { partIcon, PARTS } from '../parts.js';
import { powerAnalysis } from '../ship.js';
import { getState, mutate, stats, currentPerks, cargoUsed } from '../state.js';
import {
  travelPlan, beginTrip, salvage, swapForRare, restHere,
  mendCost, brokenParts, mendOne, applyOutcome, lightBeacon, SWAP,
} from '../actions.js';
import { anomalyFor, resolveChoice } from '../events.js';
import { makeMapView } from '../mapview.js';
import { setView, clearView } from '../render.js';
import { speak } from '../voice.js';

const JOURNEY_STEPS = 12;

export function mountStarmap(root, { onRefit, onArrive, onFly }) {
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

  // Anything the last flight brought home, shown once then cleared.
  let pending = landingCard(getState().lastLanding);
  if (pending) mutate((s) => { s.lastLanding = null; });

  // --- markers ---------------------------------------------------------------
  const markerFor = new Map();
  for (const n of getState().map.nodes) {
    const b = el('button.marker', { type: 'button', 'data-id': n.id, onclick: () => onMarker(n.id) });
    markersEl.append(b);
    markerFor.set(n.id, b);
  }

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
      const onward = adjacent && n.layer > cur.layer;

      const cls = ['marker'];
      if (isCurrent) cls.push('here');
      if (adjacent) cls.push('reachable');
      if (onward) cls.push('onward');
      if (plan && !plan.reachable) cls.push('toofar');
      if (!known) cls.push('unknown');
      if (n.visited) cls.push('been');
      if (n.type === 'heaven') cls.push('heaven');
      if (n.spent) cls.push('spent');
      m.className = cls.join(' ');
      m.style.setProperty('--tint', NODE_TYPES[n.type].tint);
      m.disabled = !adjacent || isCurrent;

      const label = known ? NODE_TYPES[n.type].name : 'Somewhere new';
      m.setAttribute('aria-label', plan
        ? `${label}, ${plan.reachable ? ['', 'short', 'medium', 'long'][plan.danger] + ' trip' : 'too far'}${onward ? ', toward the light' : ''}`
        : label);

      m.innerHTML = `
        ${onward ? `<span class="m-onward">${onwardGlyph()}</span>` : ''}
        <span class="m-disc">${known ? nodeIcon(n.type, 26) : questionGlyph()}</span>
        ${plan ? (plan.reachable
          ? `<span class="m-trip d${plan.danger}">${rockRow(plan.danger)}</span>`
          : `<span class="m-trip far">${tooFarGlyph()}</span>`) : ''}
        ${isCurrent ? '<span class="m-ring"></span>' : ''}`;
    }
  }

  // --- HUD -------------------------------------------------------------------
  function paintHud() {
    const s = getState();
    const sh = stats(s);
    const done = Math.round(progress(s.map, s.currentId) * JOURNEY_STEPS);

    hudEl.innerHTML = `
      <div class="hud-item range" title="How far your ship can fly in one go">
        ${rangeGlyph(22)}<b>${sh.range}</b>
      </div>
      <div class="hud-item" title="Spare parts">
        ${partIcon('cargo', 22)}<b>${cargoUsed(s)}</b><span class="of">/${sh.cargo}</span>
      </div>
      <div class="hud-item journey" title="How far along you are">
        <span class="j-track">${Array.from({ length: JOURNEY_STEPS },
          (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>
        ${nodeIcon('heaven', 22)}
      </div>`;
    hudEl.append(el('button.small.refit', {
      type: 'button', onclick: onRefit, 'aria-label': 'Change ship',
    }, el('span', { html: partIcon('hull', 20) }), el('span.label', {}, 'Change ship')));
  }

  // --- panel -----------------------------------------------------------------
  function paintPanel() {
    const s = getState();
    const node = s.map.nodes[s.currentId];
    panelEl.replaceChildren();

    if (pending) {
      panelEl.append(el('div.panel-body', {},
        el('p.big-line', {}, pending.text),
        pending.pills.length ? el('div.pill-row', {}, pending.pills.map((c) =>
          el('span.pill', { html: `${partIcon(c.icon, 18)}<span>${c.text}</span>` }))) : null,
        el('button.big.go', {
          type: 'button', onclick: () => { pending = null; paint(); },
          html: '<span>OK</span>',
        })
      ));
      speak(pending.text);
      return;
    }

    const body = el('div.panel-body');
    body.append(el('div.panel-title', {},
      el('span.p-icon', { html: nodeIcon(node.type, 30) }),
      el('h2', {}, NODE_TYPES[node.type].name)
    ));
    const actions = el('div.choices');

    if (node.type === 'heaven') {
      body.append(el('p.big-line', {}, 'You made it. The light is right there.'));
      actions.append(el('button.big.go.glow', {
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
            pending = {
              text: r.total ? `You took ${r.total} part${r.total === 1 ? '' : 's'}.` : 'Your crate is full.',
              pills: Object.entries(r.taken).map(([t, n]) => ({ icon: t, text: `${n} × ${PARTS[t].name}` })),
            };
            paint();
          },
          html: `${partIcon('cargo', 24)}<span>Take the parts</span>`,
        }));
        speak('An old ship, quiet and full of parts.');
      }
    } else if (node.type === 'garden') {
      if (node.spent) {
        body.append(el('p.big-line', {}, 'You already rested here.'));
      } else {
        body.append(el('p.big-line', {}, 'A little garden, growing on a wing.'));
        actions.append(el('button.big.go', {
          type: 'button',
          onclick: () => {
            const r = restHere(node.id);
            const pills = [];
            if (r.mended) pills.push({ icon: 'repair', text: `${PARTS[r.mended].name} mended` });
            if (r.woke) pills.push({ icon: 'quarters', text: 'skills woke up' });
            pending = { text: r.mended || r.woke ? 'You rested. Everything feels better.' : 'You rested a while.', pills };
            refreshShip();
            paint();
          },
          html: `${nodeIcon('garden', 24)}<span>Rest here</span>`,
        }));
        speak('A little garden, growing on a wing.');
      }
    } else if (node.type === 'station') {
      body.append(el('p.big-line', {}, 'A station. They will swap, but not kindly.'));
      const sh = stats(s);
      actions.append(el('button.big', {
        type: 'button',
        class: (s.inventory.hull || 0) < SWAP.give || cargoUsed(s) >= sh.cargo ? 'disabled' : '',
        onclick: () => {
          const got = swapForRare();
          if (got) pending = { text: 'They dig one out for you.', pills: [{ icon: got, text: PARTS[got].name }] };
          paint();
        },
        html: `${partIcon('hull', 20)}<b>${SWAP.give}</b>${swap()}${questionGlyph(20)}`,
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
      speak('A station. You can swap parts here.');
    } else if (node.type === 'beacon') {
      if (node.spent) {
        body.append(el('p.big-line', {}, 'The beacon is dark now.'));
      } else {
        body.append(el('p.big-line', {}, 'A tall lamp, still blinking.'));
        actions.append(el('button.big.go', {
          type: 'button',
          onclick: () => {
            const found = lightBeacon(node.id);
            pending = { text: `You can see ${found} new places.`, pills: [] };
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
              pending = { text: outcome.text, pills: changes };
              paint();
            },
            html: `${partIcon(PARTS[c.icon] ? c.icon : 'hull', 22)}<span>${c.label}</span>`,
          }));
        }
        speak(ev.text);
      }
    } else {
      body.append(el('p.big-line', {}, 'Home. Everything starts here.'));
      speak('Home. Pick a place to fly to.');
    }

    if (actions.children.length) body.append(actions);

    if (optionsFrom(getState().map, s.currentId).length && node.type !== 'heaven') {
      const anyTooFar = getState().map.nodes[s.currentId].links
        .some((id) => !travelPlan(id).reachable);
      body.append(el('p.hint', {}, anyTooFar
        ? 'Faded places are too far. Build a bigger ship to reach them.'
        : 'Tap a glowing dot to fly there. Arrows point to the light.'));
    }
    panelEl.append(body);
  }

  // --- travel ---------------------------------------------------------------
  function onMarker(id) {
    const s = getState();
    if (id === s.currentId) return;
    if (!s.map.nodes[s.currentId].links.includes(id)) return;
    const plan = travelPlan(id);
    if (!plan.reachable) {
      pending = {
        text: 'That is further than your ship can fly.',
        pills: [{ icon: 'tank', text: 'add a tank or a thruster' }],
      };
      paint();
      return;
    }
    beginTrip(id);
    onFly();
  }

  function refreshShip() {
    const s = getState();
    view.setShip(s.placements, powerAnalysis(s.placements));
  }

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

/** Turn what the last flight brought home into a card. */
function landingCard(landing) {
  if (!landing) return null;
  const pills = [];
  if (landing.sparkles) pills.push({ icon: 'cargo', text: `${landing.sparkles} sparkles kept` });
  if (landing.spilled) pills.push({ icon: 'cargo', text: `${landing.spilled} spilled, crate full` });
  if (landing.broke) pills.push({ icon: 'repair', text: `${PARTS[landing.broke.type].name} broke` });
  if (landing.dazed) pills.push({ icon: 'quarters', text: 'a skill is sleepy' });
  if (!pills.length) return null;
  return {
    text: landing.broke ? 'You landed with a bump.' : 'Nice flying.',
    pills,
  };
}

// ------------------------------------------------------------------ glyphs --

const onwardGlyph = () =>
  `<svg viewBox="0 0 32 20" width="26" height="17" fill="currentColor" aria-hidden="true"><path d="M16 1l7 9h-4.5v9h-5v-9H9z"/></svg>`;
const questionGlyph = (size = 24) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M16 4a8 8 0 0 0-8 8h5a3 3 0 1 1 4 2.8c-1.8.8-3 2.4-3 4.4V21h5v-1a5.6 5.6 0 0 0 3-5A8 8 0 0 0 16 4z"/><circle cx="16" cy="26" r="2.4"/></svg>`;
const swap = () =>
  `<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M4 11h18V6l7 7-7 7v-5H4z" opacity=".9"/></svg>`;
const rangeGlyph = (size = 20) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M2 16l6-5v3h16v-3l6 5-6 5v-3H8v3z"/></svg>`;
const rockGlyph = () =>
  `<svg viewBox="0 0 32 32" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M16 3l10 7-3 13-14 2L3 13z"/></svg>`;
const rockRow = (n) => rockGlyph().repeat(n);
const tooFarGlyph = () =>
  `<svg viewBox="0 0 32 32" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l20 20M26 6L6 26"/></svg>`;

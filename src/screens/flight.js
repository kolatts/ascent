// The flight screen: one arcade leg between two places on the map.

import { el, prefersReducedMotion } from '../util.js';
import { partIcon } from '../parts.js';
import { powerAnalysis } from '../ship.js';
import { getState, stats, currentPerks } from '../state.js';
import { completeTrip, skipTrip } from '../actions.js';
import { makeFlightView } from '../flight.js';
import { setView, clearView } from '../render.js';
import { speak } from '../voice.js';

export function mountFlight(root, { onDone }) {
  const s = getState();
  const trip = s.pendingTrip;

  // No trip queued (a stale save, say) — go straight back to the map.
  if (!trip) {
    queueMicrotask(onDone);
    return { refresh() {}, unmount() {} };
  }

  const stageEl = el('div.map-stage', { id: 'flight-anchor' });
  const barFill = el('i');
  const sparkNum = el('b', {}, '0');
  const shieldRow = el('div.shieldrow');
  const coach = el('div.coach', {}, el('span', {}, 'Slide to steer'));

  const skipBtn = el('button.small.skipbtn', {
    type: 'button',
    onclick: () => finish(true),
  }, 'Skip');

  const hud = el('div.flighthud', {},
    el('div.flightbar', {},
      el('span.fb-icon', { html: rocket() }),
      el('div.bar', {}, barFill),
      el('span.fb-icon.goal', { html: star() })
    ),
    el('div.flightpills', {},
      el('div.hud-item.sparks', { html: `${star(20)}` }, sparkNum),
      shieldRow
    )
  );

  const screen = el('div.screen.flight', {}, stageEl, hud, coach, skipBtn);
  root.append(screen);

  const sh = stats(s);
  const perks = currentPerks(s);

  // Reduced motion gets the outcome without the ride.
  if (prefersReducedMotion()) {
    queueMicrotask(() => { skipTrip(); onDone(); });
    return { refresh() {}, unmount() { screen.remove(); } };
  }

  const view = makeFlightView(stageEl, {
    placements: s.placements,
    power: powerAnalysis(s.placements),
    stats: sh,
    perks,
    distance: trip.distance,
    seed: trip.seed,
  });
  setView(view);

  const paintShields = () => {
    shieldRow.replaceChildren();
    for (let i = 0; i < sh.shields; i++) {
      shieldRow.append(el('span.shieldpip', { class: i < view.shieldsLeft ? 'on' : '' }));
    }
    shieldRow.hidden = sh.shields === 0;
  };
  paintShields();

  view.onProgress = (p) => { barFill.style.width = `${Math.round(p * 100)}%`; };
  view.onSparkle = (n) => {
    sparkNum.textContent = String(n);
    sparkNum.classList.remove('pop');
    void sparkNum.offsetWidth;
    sparkNum.classList.add('pop');
  };
  view.onHit = ({ shielded }) => {
    paintShields();
    screen.classList.remove('jolt');
    void screen.offsetWidth;
    screen.classList.add(shielded ? 'ping' : 'jolt');
  };
  view.onFinish = () => finish(false);

  let done = false;
  function finish(skipped) {
    if (done) return;
    done = true;
    if (skipped) skipTrip();
    else completeTrip(view.result);
    onDone();
  }

  speak('Slide to steer.');
  setTimeout(() => coach.classList.add('gone'), 2600);

  return {
    refresh() {},
    unmount() {
      done = true;
      clearView();
      screen.remove();
    },
  };
}

const rocket = (size = 20) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M16 2c5 5 7 11 7 16h-4l-3 6-3-6H9c0-5 2-11 7-16z"/><circle cx="16" cy="12" r="2.6" fill="#0b0c1c"/></svg>`;
const star = (size = 20) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M16 3l3.6 8.6L29 13l-7 6.2L23.8 29 16 24.2 8.2 29 10 19.2 3 13l9.4-1.4z"/></svg>`;

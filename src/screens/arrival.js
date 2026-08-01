// Arrival. The light opens, the ship comes apart, and the pieces go back into
// the crate the next traveller starts with.

import { el, prefersReducedMotion } from '../util.js';
import { partIcon, PARTS, PART_ORDER } from '../parts.js';
import { powerAnalysis } from '../ship.js';
import { getState } from '../state.js';
import { harvestShip } from '../actions.js';
import { makeArrivalView } from '../mapview.js';
import { setView, clearView } from '../render.js';
import { speak } from '../voice.js';

const BEATS = [
  'The light opens.',
  'It is a shipyard.',
  'Every quiet old ship you found — they all got here too.',
  'Now your ship becomes parts, for whoever comes next.',
];

export function mountArrival(root, { onAgain }) {
  const s = getState();
  const stageEl = el('div.map-stage', { id: 'arrival-anchor' });
  const lineEl = el('p.beat');
  const crateEl = el('div.crate', { hidden: true });
  const againBtn = el('button.big.go.glow', {
    type: 'button', hidden: true, onclick: () => onAgain(harvestShip(getState())),
    html: '<span>Fly again</span>',
  });

  const screen = el('div.screen.arrival', {}, stageEl,
    el('div.arrival-copy', {},
      el('h1.display', {}, 'You made it'),
      lineEl, crateEl, againBtn
    )
  );
  root.append(screen);

  const view = makeArrivalView(stageEl, s.placements, powerAnalysis(s.placements));
  setView(view);

  const reduced = prefersReducedMotion();
  const gap = reduced ? 1200 : 3200;
  const timers = [];
  let i = 0;

  const showBeat = () => {
    if (i >= BEATS.length) return finish();
    lineEl.textContent = BEATS[i];
    lineEl.classList.remove('in');
    void lineEl.offsetWidth;
    lineEl.classList.add('in');
    speak(BEATS[i]);
    if (i === 2) view.dissolve();
    i++;
    timers.push(setTimeout(showBeat, gap));
  };

  function finish() {
    const harvest = harvestShip(getState());
    crateEl.hidden = false;
    crateEl.innerHTML =
      `<h2 class="section">In the crate</h2><div class="crate-row">` +
      PART_ORDER.filter((t) => harvest.parts[t] > 0)
        .map((t) => `<span class="crate-item" title="${PARTS[t].name}">${partIcon(t, 26)}<b>${harvest.parts[t]}</b></span>`)
        .join('') +
      `</div>`;
    againBtn.hidden = false;
    speak('Your parts are in the crate. Fly again?');
  }

  timers.push(setTimeout(showBeat, reduced ? 200 : 1200));

  return {
    refresh() {},
    unmount() {
      timers.forEach(clearTimeout);
      clearView();
      screen.remove();
    },
  };
}

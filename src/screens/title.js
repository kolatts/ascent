import { el } from '../util.js';
import { getState } from '../state.js';
import { clearView } from '../render.js';
import { speak } from '../voice.js';

export function mountTitle(root, { onPlay, onNew }) {
  const s = getState();
  const started = s.map.nodes.some((n) => n.visited && n.type !== 'start') || s.arrived;

  const screen = el('div.screen.title', {},
    el('div.title-art', { 'aria-hidden': 'true' }),
    el('div.title-inner', {},
      el('h1.display.huge', {}, 'Ascent'),
      el('p.tagline', {}, 'Build a little ship. Fly it to the light.'),
      el('div.title-actions', {},
        el('button.big.go', {
          type: 'button', onclick: onPlay,
          html: `<span>${started ? 'Keep flying' : 'Play'}</span>${play()}`,
        }),
        started && el('button.small', { type: 'button', onclick: onNew }, 'Start again')
      ),
      s.legacy?.runs > 0 &&
        el('p.legacy', {}, `You have made it ${s.legacy.runs} time${s.legacy.runs === 1 ? '' : 's'}. Their parts are in your crate.`)
    )
  );

  root.append(screen);
  clearView();
  speak('Ascent. Build a little ship, and fly it to the light.');

  return { unmount: () => screen.remove(), refresh: () => {} };
}

const play = () =>
  `<svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M9 5l18 11L9 27z"/></svg>`;

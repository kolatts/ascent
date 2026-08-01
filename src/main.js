// Boot and route. One screen is mounted at a time; the WebGL canvas lives
// underneath all of them and is handed a new scene by whichever is up.

import { el } from './util.js';
import { initRenderer, clearView } from './render.js';
import { loadOrCreate, getState, goTo, newGame, resetEverything, subscribe } from './state.js';
import { mountTitle } from './screens/title.js';
import { mountPilot } from './screens/pilot.js';
import { mountDesigner } from './screens/designer.js';
import { mountStarmap } from './screens/starmap.js';
import { mountArrival } from './screens/arrival.js';
import { toggleReadAloud, readAloudSupported, hush } from './voice.js';

const root = document.getElementById('app');
const canvas = document.getElementById('scene');

let current = null;
let currentName = null;

function mount(name) {
  if (current) { current.unmount(); current = null; }
  hush();
  root.replaceChildren();
  currentName = name;
  document.body.dataset.screen = name;

  try {
    switch (name) {
      case 'pilot':
        current = mountPilot(root, {
          onNext: () => goTo('designer'),
          onBack: () => goTo('title'),
        });
        break;
      case 'designer':
        current = mountDesigner(root, {
          onLaunch: () => goTo('map'),
          onBackToPilot: () => goTo('pilot'),
        });
        break;
      case 'map':
        current = mountStarmap(root, {
          onRefit: () => goTo('designer'),
          onArrive: () => goTo('arrival'),
        });
        break;
      case 'arrival':
        current = mountArrival(root, {
          onAgain: (harvest) => { newGame(harvest); goTo('pilot'); },
        });
        break;
      default:
        current = mountTitle(root, {
          onPlay: () => goTo(hasFlown() ? 'map' : 'pilot'),
          onNew: () => { resetEverything(); goTo('pilot'); },
        });
    }
  } catch (err) {
    console.error(err);
    clearView();
    root.replaceChildren(
      el('div.screen.oops', {},
        el('h1.display', {}, 'Something jammed'),
        el('p.big-line', {}, 'The ship is fine. The game got confused.'),
        el('button.big.go', { type: 'button', onclick: () => { resetEverything(); goTo('pilot'); } }, 'Start again')
      )
    );
  }
}

const hasFlown = () => {
  const s = getState();
  return !!(s.launched || s.arrived);
};

function shell() {
  const speaker = el('button.iconbtn', {
    type: 'button',
    'aria-label': 'Read out loud',
    title: 'Read out loud',
    onclick: () => { const on = toggleReadAloud(); speaker.classList.toggle('on', on); },
    html: speakerGlyph(),
  });
  speaker.classList.toggle('on', !!getState().readAloud);

  // Not "Home" — the first node on the map is already called that, and two
  // controls with the same spoken name on one screen is a maze.
  const home = el('button.iconbtn', {
    type: 'button',
    'aria-label': 'Main menu',
    title: 'Main menu',
    onclick: () => goTo('title'),
    html: homeGlyph(),
  });

  const bar = el('div.shell', {}, readAloudSupported ? speaker : null, home);
  document.body.append(bar);
}

function start() {
  initRenderer(canvas);
  loadOrCreate();
  shell();
  mount(getState().screen || 'title');
  subscribe((s) => {
    if (s.screen !== currentName) mount(s.screen);
  });
}

const speakerGlyph = () =>
  `<svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M6 12h5l7-6v20l-7-6H6z"/><path d="M22 11a7 7 0 0 1 0 10M25.5 7.5a12 12 0 0 1 0 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const homeGlyph = () =>
  `<svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M16 4L3 15h4v13h6v-8h6v8h6V15h4z"/></svg>`;

start();

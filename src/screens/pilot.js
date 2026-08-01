// Who flies. Three cosmetic dials and three skills — all pictures, no typing.

import { el } from '../util.js';
import { PERKS, perkIcon } from '../perks.js';
import { getState, mutate } from '../state.js';
import { makePilotView, setView, clearView, SUIT_COLORS } from '../render.js';
import { speak } from '../voice.js';

const MAX_PERKS = 3;

export function mountPilot(root, { onNext, onBack }) {
  const previewEl = el('div.preview.tall', { id: 'pilot-anchor' });
  const perksEl = el('div.perkgrid');
  const nextBtn = el('button.big.go', {
    type: 'button',
    onclick: () => {
      const n = getState().pilot.perks.length;
      if (n < MAX_PERKS) {
        speak(`Pick ${MAX_PERKS - n} more thing${MAX_PERKS - n === 1 ? '' : 's'} you are good at.`, { force: true });
        return;
      }
      onNext();
    },
  });

  const dials = el('div.dials');

  const screen = el('div.screen.pilot', {},
    el('header.screen-head', {},
      el('h1.display', {}, 'Who is flying?'),
      el('p.sub', {}, 'Pick a suit, then pick three things you are good at.')
    ),
    el('div.pilot-body', {},
      el('div.pilot-left', {}, previewEl, dials),
      el('div.pilot-right', {},
        el('h2.section', {}, 'Choose three'),
        perksEl,
        el('div.build-actions', {},
          el('button.small', { type: 'button', onclick: onBack }, '← Back'),
          nextBtn
        )
      )
    )
  );
  root.append(screen);

  const view = makePilotView(previewEl);
  setView(view);

  function dialRow(label, count, field, renderItem) {
    const row = el('div.dial', {}, el('span.dial-label', {}, label));
    const opts = el('div.dial-opts');
    for (let i = 0; i < count; i++) {
      opts.append(el('button.swatch', {
        type: 'button',
        'aria-label': `${label} ${i + 1}`,
        class: getState().pilot[field] === i ? 'on' : '',
        onclick: () => {
          mutate((s) => { s.pilot[field] = i; });
          refresh();
        },
        html: renderItem(i),
      }));
    }
    row.append(opts);
    return row;
  }

  function refresh() {
    const s = getState();

    dials.replaceChildren(
      dialRow('Suit', SUIT_COLORS.length, 'suit',
        (i) => `<span class="dot" style="background:#${SUIT_COLORS[i].toString(16).padStart(6, '0')}"></span>`),
      dialRow('Size', 3, 'build',
        (i) => `<span class="sizebar" style="--k:${0.5 + i * 0.25}"></span>`),
      dialRow('Helmet', 3, 'helmet',
        (i) => helmetGlyph(i))
    );

    perksEl.replaceChildren();
    for (const perk of PERKS) {
      const chosen = s.pilot.perks.includes(perk.id);
      perksEl.append(el('button.perkcard', {
        type: 'button',
        'aria-pressed': chosen,
        class: chosen ? 'on' : '',
        onclick: () => togglePerk(perk.id),
        html: `<span class="pk-icon">${perkIcon(perk, 30)}</span>
               <b>${perk.name}</b>
               <span class="pk-blurb">${perk.blurb}</span>
               <span class="pk-tick">${chosen ? tick() : ''}</span>`,
      }));
    }

    const n = s.pilot.perks.length;
    nextBtn.innerHTML = n === MAX_PERKS
      ? `<span>Build the ship</span>${arrow()}`
      : `<span>Pick ${MAX_PERKS - n} more</span>`;
    nextBtn.classList.toggle('notready', n !== MAX_PERKS);
    view.setPilot(s.pilot);
  }

  function togglePerk(id) {
    mutate((s) => {
      const has = s.pilot.perks.includes(id);
      if (has) s.pilot.perks = s.pilot.perks.filter((p) => p !== id);
      else if (s.pilot.perks.length < MAX_PERKS) s.pilot.perks.push(id);
      else s.pilot.perks = [...s.pilot.perks.slice(1), id]; // oldest drops out
    });
    const perk = PERKS.find((p) => p.id === id);
    if (perk) speak(`${perk.name}. ${perk.blurb}`);
    refresh();
  }

  refresh();
  speak('Who is flying? Pick a suit, then pick three things you are good at.');

  return { refresh, unmount() { clearView(); screen.remove(); } };
}

const tick = () =>
  `<svg viewBox="0 0 32 32" width="20" height="20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M6 17l7 7 13-15"/></svg>`;
const arrow = () =>
  `<svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M5 14h14V7l9 9-9 9v-7H5z"/></svg>`;
const helmetGlyph = (i) => {
  const extra = i === 1
    ? '<path d="M6 15a10 10 0 0 1 20 0" fill="none" stroke="#C79A4B" stroke-width="3"/>'
    : i === 2
      ? '<path d="M16 1l3 6h-6z" fill="#C79A4B"/>'
      : '';
  return `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><circle cx="16" cy="17" r="11" fill="currentColor"/><path d="M9 15a7 7 0 0 1 14 0 7 7 0 0 1-14 0z" fill="#241E4E"/>${extra}</svg>`;
};

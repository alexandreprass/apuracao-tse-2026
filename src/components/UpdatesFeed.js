import { html } from '../lib/html.js';
import { int, percent } from '../lib/format.js';
import { CANDIDATES } from '../data/mocks.js';

export const hourMinute = minute => `${Math.floor(minute / 60)}h${String(minute % 60).padStart(2, '0')}`;

export function UpdatesFeed({ updates }) {
  return html`<section class="insight">
    <h3>Últimas atualizações</h3>
    ${updates.length
      ? html`<ol class="updates">${updates.map(update => html`<li key=${update.minute}>
          <time>${hourMinute(update.minute)}</time>
          <p class="update-what">
            <b>+${int(update.sections)}</b> ${update.sections === 1 ? 'seção' : 'seções'}
            ${update.states.map(uf => html`<span class="update-uf" key=${uf}>${uf}</span>`)}
          </p>
          <p class="update-shares">${[0, 1].map(index => html`<span key=${index}>
            <i class=${'swatch tone-' + CANDIDATES[index].tone}></i>${percent(update.shares[index])}
          </span>`)}</p>
        </li>`)}</ol>`
      : html`<p class="empty">Nenhuma seção nova nos últimos minutos.</p>`}
  </section>`;
}

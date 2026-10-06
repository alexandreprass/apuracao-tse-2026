import { html } from '../lib/html.js';
import { leaderShare, percent } from '../lib/format.js';
import { CANDIDATES, resultColor } from '../data/mocks.js';
import { inkOn } from '../map/mapTheme.js';
import { DuelBar } from './Scoreboard.js';

/**
 * One place in a list: map-coloured tag, name, share bar and the leader's share.
 * Renders a button when `onClick` is given, otherwise a static row.
 */
export function PlaceRow({ tag, name, detail, result, theme, selected, onClick, label }) {
  const color = resultColor(result, theme);
  const content = html`
    <span class=${'place-tag' + (tag == null ? ' is-dot' : '')} style=${{ background: color, color: inkOn(color) }}>${tag}</span>
    <span class="place-name"><strong>${name}</strong>${detail && html`<small>${detail}</small>`}</span>
    <${DuelBar} result=${result}/>
    <b class=${'place-lead tone-' + CANDIDATES[result.winner].tone}>${percent(leaderShare(result))}</b>`;

  return onClick
    ? html`<button class="place-row" onClick=${onClick} aria-label=${label} aria-pressed=${selected}>${content}</button>`
    : html`<div class="place-row">${content}</div>`;
}

import { html } from '../lib/html.js';
import { int, percent } from '../lib/format.js';
import { CANDIDATES, COMPLETION_STEPS, completionPalette, MARGIN_STEPS, marginPalette } from '../data/mocks.js';

const pts = ratio => String(+(ratio * 100).toFixed(1)).replace('.', ',');

const Ramp = ({ colors }) => html`<span class="legend-ramp">${colors.map(color => html`<i key=${color} style=${{ background: color }}></i>`)}</span>`;

/**
 * Reads the map: how many places each side leads (and the electorate behind them, since area
 * misleads), then the colour scale for the current metric.
 */
export function Legend({ theme, metric, bubbles, tally, noun }) {
  return html`<div class="legend">
    ${metric === 'apurado'
      ? html`<span class="legend-scale"><${Ramp} colors=${completionPalette(theme)}/>seções apuradas: até ${COMPLETION_STEPS.map(pts).join(' · ')} · mais (%)</span>`
      : html`
        ${tally.map((side, index) => html`<span class="legend-side" key=${index}>
          <i class=${'swatch tone-' + CANDIDATES[index].tone}></i>
          <b>${CANDIDATES[index].party}</b> lidera em ${int(side.places)} ${noun}<span class="legend-electorate">${percent(side.electorateShare, 0)} do eleitorado</span>
        </span>`)}
        <span class="legend-scale">${marginPalette(theme).map((colors, index) => html`<${Ramp} key=${index} colors=${colors}/>`)}vantagem: até ${MARGIN_STEPS.map(pts).join(' · ')} · mais pontos</span>`}
    ${bubbles && html`<span class="legend-scale"><i class="legend-bubble"></i>área do círculo = eleitorado</span>`}
  </div>`;
}

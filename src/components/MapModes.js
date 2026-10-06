import { html } from '../lib/html.js';

const UNIT_LABELS = { estados: 'Estados', municipios: 'Municípios', eleitorado: 'Eleitorado' };
const METRIC_LABELS = { lider: 'Quem lidera', apurado: 'Apurado' };

function Segmented({ label, options, value, onChange }) {
  return html`<div class="segmented" role="group" aria-label=${label}>
    ${Object.entries(options).map(([key, text]) => html`<button key=${key} aria-pressed=${value === key} onClick=${() => onChange(key)}>${text}</button>`)}
  </div>`;
}

/** What the map draws and what its colour means. `units` lists the units valid for the open place. */
export function MapModes({ units, unit, metric, onUnit, onMetric }) {
  const unitOptions = Object.fromEntries(units.map(key => [key, UNIT_LABELS[key]]));
  return html`<div class="map-modes">
    ${units.length > 1 && html`<${Segmented} label="Recorte do mapa" options=${unitOptions} value=${unit} onChange=${onUnit}/>`}
    <${Segmented} label="Cor do mapa" options=${METRIC_LABELS} value=${metric} onChange=${onMetric}/>
  </div>`;
}

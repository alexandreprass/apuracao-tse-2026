import { html } from '../lib/html.js';
import { OFFICES, ROUNDS } from '../config.js';
import { STATES, stateName } from '../data/states.js';
import { runoffPickerUfs } from '../data/analysis.js';

/** Brasil › Estado › Município, plus a state picker. */
export function Breadcrumb({ route, geo, allowExterior = false, ufs = null }) {
  const { uf, ibge, round, office } = route;
  const municipality = ibge ? geo.byId.get(ibge) : null;
  const base = `#/${round}turno/${office}`;
  return html`<div class="place-bar">
    <nav class="breadcrumb" aria-label="Você está em">
      <ol>
        <li><a href=${base} aria-current=${!uf ? 'page' : undefined}>Brasil</a></li>
        ${uf && html`<li><a href=${`${base}/${uf}`} aria-current=${!ibge ? 'page' : undefined}>${uf === 'ZZ' ? 'Exterior' : stateName(uf)}</a></li>`}
        ${municipality && html`<li><span aria-current="page">${municipality.name}</span></li>`}
      </ol>
    </nav>
    <label class="state-picker">
      <span class="sr-only">Escolher estado</span>
      <select value=${uf || ''} onChange=${e => route.go({ uf: e.currentTarget.value || null, ibge: null })}>
        <option value="">${OFFICES[office].proportional ? 'Escolha um estado' : ufs ? `Brasil (${ufs.length} estados com 2º turno)` : 'Brasil (todos os estados)'}</option>
        ${runoffPickerUfs(ufs, uf).map(code => html`<option key=${code} value=${code}>${STATES[code][0]} (${code})</option>`)}
        ${allowExterior && html`<option value="ZZ">Exterior</option>`}
      </select>
    </label>
  </div>`;
}

export const placeTitle = (route, geo) => {
  const { uf, ibge } = route;
  if (ibge) return `${geo?.byId.get(ibge)?.name || ibge} (${uf})`;
  if (uf === 'ZZ') return 'Exterior';
  if (uf) return stateName(uf);
  return 'Brasil';
};

export const roundLabel = round => ROUNDS[round].label;

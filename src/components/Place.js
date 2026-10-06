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
    <div class="place-state-actions">
      ${uf && html`<button type="button" class="button is-small back-to-brazil" onClick=${() => route.go({ uf: null, ibge: null })}>Voltar</button>`}
      <label class="state-picker">
        <span class="sr-only">Escolher estado</span>
        <select value=${uf || ''} onChange=${e => route.go({ uf: e.currentTarget.value || null, ibge: null })}>
          <option value="">${OFFICES[office].proportional ? 'Escolha um estado' : ufs ? `Brasil (${ufs.length} estados com 2º turno)` : 'Brasil (todos os estados)'}</option>
          ${runoffPickerUfs(ufs, uf).map(code => html`<option key=${code} value=${code}>${STATES[code][0]} (${code})</option>`)}
          ${allowExterior && html`<option value="ZZ">Exterior</option>`}
        </select>
      </label>
    </div>
  </div>`;
}

/** Quick links to other offices while keeping the currently selected municipality open. */
export function MunicipalityOfficeLinks({ route }) {
  if (!route.ibge || !route.uf) return null;
  const offices = Object.entries(OFFICES).filter(([key]) => key !== route.office);
  return html`<div class="municipality-office-switch">
    <span>Ver também nesse município</span>
    <nav aria-label="Outros cargos neste município">
      ${offices.map(([key, office]) => html`<button type="button" key=${key}
        onClick=${() => route.go({ round: office.rounds.includes(route.round) ? route.round : 1, office: key, uf: route.uf, ibge: route.ibge })}>
        ${office.tab || office.label}
      </button>`)}
    </nav>
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

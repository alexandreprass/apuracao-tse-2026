import { useMemo } from 'preact/hooks';
import { html } from '../lib/html.js';
import { tally } from '../data/history.js';
import { STATES } from '../data/mocks.js';
import { ElectionMap } from '../map/ElectionMap.js';
import { BackButton } from './BackButton.js';
import { Legend } from './Legend.js';
import { MapModes } from './MapModes.js';
import { Timeline } from './Timeline.js';

/** The places the map is currently colouring, the units it can switch between, and what to call them. */
function mapView({ geo, snapshot, route, municipality, zoneRows }) {
  const { uf } = route;
  if (municipality) {
    return zoneRows?.length
      ? { rows: zoneRows, noun: 'zonas', units: [], unit: 'municipios', hint: 'Clique em uma zona para ver o resultado dela.' }
      : { rows: [snapshot.results.get(municipality.id)], noun: 'município', units: ['municipios', 'eleitorado'], unit: route.unit, hint: 'Este município não tem recorte por zona.' };
  }
  if (uf) {
    return {
      rows: geo.states[uf].municipalities.map(m => snapshot.results.get(m.id)), noun: 'municípios',
      units: ['municipios', 'eleitorado'], unit: route.unit, hint: 'Clique em um município para ampliar.',
    };
  }
  const byState = route.unit === 'estados';
  return {
    rows: byState ? Object.values(snapshot.states) : [...snapshot.results.values()], noun: byState ? 'estados' : 'municípios',
    units: ['estados', 'municipios', 'eleitorado'], unit: route.unit, hint: 'Clique em um estado para ver os municípios.',
  };
}

export function MapStage({ stageRef, geo, snapshot, route, municipality, zoneRows, theme, clock, flipped }) {
  const { uf } = route;
  const view = useMemo(() => mapView({ geo, snapshot, route, municipality, zoneRows }), [geo, snapshot, uf, municipality, zoneRows, route.unit]);
  const sides = useMemo(() => tally(view.rows), [view]);
  // An open state has no state-level map: fall back to municipalities there.
  const unit = view.units.includes(view.unit) ? view.unit : 'municipios';

  return html`<section class="stage" ref=${stageRef} aria-label="Mapa interativo">
    <header class="stage-head">
      <div class="stage-place">
        ${uf && html`<${BackButton} to=${municipality ? STATES[uf][0] : 'Brasil'} article=${municipality ? '' : 'o '} onClick=${route.back}/>`}
        <h2 class="stage-title">${municipality?.name || (uf ? STATES[uf][0] : 'Brasil')}${municipality && html`<span>${STATES[uf][0]}</span>`}</h2>
        <p class="stage-hint">${view.hint}</p>
      </div>
      <${MapModes} units=${view.units} unit=${unit} metric=${route.metric} onUnit=${route.setUnit} onMetric=${route.setMetric}/>
    </header>

    <div class="map-area">
      <${ElectionMap} geo=${geo} theme=${theme} unit=${unit} metric=${route.metric} flipped=${flipped}
        results=${snapshot.results} stateResults=${snapshot.states}
        uf=${uf} municipality=${municipality} zoneRows=${zoneRows} selectedZone=${route.zone}
        onState=${route.openState} onMunicipality=${route.openMunicipality} onZone=${route.selectZone}/>
    </div>

    <${Legend} theme=${theme} metric=${route.metric} bubbles=${unit === 'eleitorado'} tally=${sides} noun=${view.noun}/>
    <${Timeline} clock=${clock}/>
  </section>`;
}

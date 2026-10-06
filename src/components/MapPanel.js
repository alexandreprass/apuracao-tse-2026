import { useMemo, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { ElectionMap } from '../map/ElectionMap.js';
import { COMPLETION_STEPS, completionColor, completionRamp, MAP_EMPTY, marginColor, marginRamp, MARGIN_STEPS } from '../lib/color.js';
import { int, pct, titleCase } from '../lib/format.js';
import { stateName } from '../data/states.js';
import { Segmented } from './ui.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

const RAMP_LABELS = ['<5', '5–15', '15–30', '>30'];

/**
 * The interactive map: Brazil by state (or by municipality when municipal results exist),
 * coloured by who leads and by how much, or by how much has been counted.
 */
export function MapPanel({ geo, theme, states, municipalities, uf, ibge, onState, onMunicipality, title, nameOf }) {
  const [metric, setMetric] = useState('lider');
  const touch = useMediaQuery('(pointer: coarse)');
  const verb = touch ? 'Toque' : 'Clique';
  const municipality = ibge ? geo.byId.get(ibge) : null;
  const hasMunicipal = !!municipalities?.size;
  // Brasil is drawn by state; an open state by municipality.
  const effectiveUnit = uf ? 'municipios' : 'estados';

  // Without municipal results, municipalities inside an open state show the state's own result.
  const results = useMemo(() => {
    if (hasMunicipal) return municipalities;
    const map = new Map();
    if (uf && states[uf]) for (const m of geo.states[uf]?.municipalities || []) map.set(m.id, { ...states[uf], name: m.name, inherited: true });
    return map;
  }, [municipalities, states, uf, geo]);

  const paint = useMemo(() => ({
    fill: row => !row || row.empty ? MAP_EMPTY[theme] : metric === 'apurado' ? completionColor(row.completion, theme) : marginColor(row.color, row.margin, theme),
    label: row => !row || row.empty ? '—' : metric === 'apurado' ? pct(row.completion * 100, 0) : pct(row.leaderPct, 0),
    tooltip: row => {
      if (!row || row.empty) return 'Sem resultados';
      if (row.inherited) return `${verb} para ver o resultado do município`;
      const stale = row.stale ? ` · boletim das ${row.staleBulletin || '—'} (TSE sem resposta)` : '';
      if (metric === 'apurado') return `${pct(row.completion * 100)} das seções apuradas${stale}`;
      return `${titleCase(row.leaderName)} (${row.leaderParty}) · ${pct(row.leaderPct)}${stale}`;
    },
  }), [theme, metric, verb]);

  const legend = useMemo(() => {
    const rows = uf ? [...results.values()] : effectiveUnit === 'estados' ? Object.values(states) : [...results.values()];
    const tally = new Map();
    for (const row of rows) {
      if (!row || row.empty || row.inherited) continue;
      const key = row.leaderParty;
      const entry = tally.get(key) || { party: key, label: nameOf?.(row) || key, color: row.color, places: 0, electorate: 0 };
      entry.places++; entry.electorate += row.electorate || 0;
      tally.set(key, entry);
    }
    return [...tally.values()].sort((a, b) => b.places - a.places);
  }, [results, states, uf, effectiveUnit]);
  const noun = uf || effectiveUnit !== 'estados' ? 'municípios' : 'estados';
  const staleCount = uf ? 0 : Object.values(states).filter(r => r?.stale).length;

  return html`<section class="card map-card" aria-label="Mapa interativo">
    <header class="card-head">
      <div><h2>${title}</h2><p>${uf ? (municipality ? `${municipality.name} · ${stateName(uf)}` : `${verb} em um município para ver o resultado dele.`) : `${verb} em um estado para abrir os resultados dele.`}</p></div>
      <div class="map-controls">
        <${Segmented} label="Cor do mapa" value=${metric} onChange=${setMetric} options=${[['lider', 'Quem lidera'], ['apurado', '% apurado']]}/>
      </div>
    </header>
    <div class="map-area">
      <${ElectionMap} geo=${geo} theme=${theme} unit=${effectiveUnit} metric=${metric} paint=${paint}
        results=${results} stateResults=${states} uf=${uf && uf !== 'ZZ' ? uf : null} municipality=${municipality}
        onState=${onState} onMunicipality=${onMunicipality}/>
    </div>
    <div class="legend">
      ${metric === 'apurado'
        ? html`<span class="legend-scale">${completionRamp(theme).map(c => html`<i key=${c} style=${{ background: c }}></i>`)} seções apuradas: até ${COMPLETION_STEPS.map(s => pct(s * 100, 0)).join(' · ')} · mais</span>`
        : html`${legend.slice(0, 8).map(entry => html`<span class="legend-side" key=${entry.party}>
            <i class="swatch" style=${{ background: entry.color }}></i><b>${entry.label}</b> · ${int(entry.places)} ${noun}
          </span>`)}
          ${legend.slice(0, 2).map(entry => html`<div class="legend-ramp" key=${'ramp' + entry.party} role="img"
              aria-label=${`Vantagem de ${entry.label} sobre o 2º: até ${MARGIN_STEPS.map(s => int(s * 100)).join(', ')} pontos ou mais`}>
            <span class="legend-ramp-name">${entry.party}</span>
            ${marginRamp(entry.color, theme).map((c, i) => html`<i key=${c} style=${{ background: c }}><small>${RAMP_LABELS[i]}</small></i>`)}
          </div>`)}
          <span class="legend-side"><i class="swatch" style=${{ background: MAP_EMPTY[theme] }}></i>sem apuração</span>
          ${staleCount > 0 && html`<span class="legend-side"><i class="swatch swatch-stale"></i>boletim atrasado</span>`}
          <span class="legend-note">vantagem sobre o 2º colocado, em pontos percentuais</span>`}
    </div>
  </section>`;
}

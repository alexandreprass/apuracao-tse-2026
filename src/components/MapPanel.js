import { useMemo, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { ElectionMap } from '../map/ElectionMap.js';
import { COMPLETION_STEPS, completionColor, completionRamp, MAP_EMPTY, marginRamp, MARGIN_STEPS, partyFill, statusFill } from '../lib/color.js';
import { int, pct, titleCase } from '../lib/format.js';
import { stateName } from '../data/states.js';
import { Segmented } from './ui.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

const RAMP_LABELS = ['<5', '5–15', '15–30', '>30'];

/**
 * The interactive map: Brazil by state (or by municipality when municipal results exist),
 * coloured by who leads and by how much, or by how much has been counted.
 */
export function MapPanel({ geo, theme, states, municipalities, uf, ibge, onState, onMunicipality, title, nameOf,
  showStatus = false, statusLabel = '2º turno', initialMetric = 'lider', emptyLabel = 'Sem resultados', compact = false, seatLegend = null, seatMode = false }) {
  const [metric, setMetric] = useState(initialMetric);
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

  // The "situação" view only makes sense for whole races (states), not for municipalities.
  const statusMode = metric === 'situacao' && showStatus && !uf;
  const paint = useMemo(() => ({
    fill: row => !row || row.empty ? MAP_EMPTY[theme]
      : metric === 'apurado' ? completionColor(row.completion, theme)
      : statusMode ? statusFill(row, theme).fill
      : partyFill(row.leaderParty, row.margin, theme).fill,
    // Label ink comes with the palette step (best of #141821/#ffffff, always ≥ 4.5:1).
    ink: row => !row || row.empty || metric === 'apurado' ? null
      : statusMode ? statusFill(row, theme).ink
      : partyFill(row.leaderParty, row.margin, theme).ink,
    label: row => !row || row.empty ? '—' : metric === 'apurado' ? pct(row.completion * 100, 0)
      : pct(row.leaderPct, 0),
    // Runoff states, from the TSE status of their candidates: hatched, with a badge on the label.
    hatch: row => statusMode && row?.status === 'segundo-turno',
    badge: row => (statusMode && row?.status === 'segundo-turno' ? '2º turno' : null),
    // Races with several seats (senate): one dot per elected, in its party colour, on the state label.
    dots: row => (statusMode && row?.seats > 1 ? row.elected.map(e => partyFill(e.party, 1, theme).fill) : null),
    tooltip: row => {
      if (!row || row.empty) return emptyLabel;
      // Deputies (proportional): the state's biggest bench, never a "leader" per município.
      if (seatMode) return `Maior bancada: ${row.tied.join(', ')} · ${int(row.count)} de ${int(row.seats)} cadeiras${row.filled < row.seats ? ` (${int(row.filled)} eleitos publicados pelo TSE)` : ''}`;
      if (row.inherited) return `${verb} para ver o resultado do município`;
      const stale = row.stale ? ` · boletim das ${row.staleBulletin || '—'} (TSE sem resposta)` : '';
      if (metric === 'apurado') return `${pct(row.completion * 100)} das seções apuradas${stale}`;
      if (showStatus && !uf && row.status === 'segundo-turno') return `${statusLabel}: ${titleCase(row.leaderName)} (${row.leaderParty}) × ${titleCase(row.runnerUpName)} (${row.runnerUpParty})${stale}`;
      if (showStatus && !uf && row.seats > 1 && row.elected.length) return `Eleitos: ${row.elected.map(e => `${titleCase(e.name)} (${e.party})`).join(', ')}${stale}`;
      if (showStatus && !uf && row.status === 'decidido') return `Eleito: ${titleCase(row.leaderName)} (${row.leaderParty}) · ${pct(row.leaderPct)}${stale}`;
      return `${titleCase(row.leaderName)} (${row.leaderParty}) · ${pct(row.leaderPct)}${stale}`;
    },
  }), [theme, metric, verb, statusMode, showStatus, uf, emptyLabel, statusLabel, seatMode]);

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
  // "Situação" legend: per leading party, races decided in the 1º turno and runoffs it leads.
  const statusLegend = useMemo(() => {
    if (!showStatus) return [];
    const tally = new Map();
    for (const row of Object.values(states)) {
      if (!row || row.empty) continue;
      const entry = tally.get(row.leaderParty) || { party: row.leaderParty, color: row.color, decided: 0, open: 0 };
      if (row.status === 'decidido') entry.decided++; else entry.open++;
      tally.set(row.leaderParty, entry);
    }
    return [...tally.values()].sort((a, b) => b.decided - a.decided || b.open - a.open);
  }, [states, showStatus]);

  const hint = uf ? (municipality ? `${municipality.name} · ${stateName(uf)}` : `${verb} em um município para ver o resultado dele.`) : `${verb} em um estado para abrir os resultados dele.`;
  const controls = html`<${Segmented} label="Cor do mapa" value=${metric === 'situacao' && (!showStatus || uf) ? 'lider' : metric} onChange=${setMetric}
    options=${[['lider', 'Quem lidera'], ...(showStatus && !uf ? [['situacao', 'Situação']] : []), ['apurado', '% apurado']]}/>`;
  return html`<section class=${'card map-card' + (compact ? ' is-compact' : '')} aria-label=${`${title}. ${hint}`}>
    ${seatMode ? null : compact ? html`<div class="map-controls map-overlay">${controls}</div>`
      : html`<header class="card-head">
      <div><h2>${title}</h2><p>${hint}</p></div>
      <div class="map-controls">${controls}</div>
    </header>`}
    <div class="map-area">
      <${ElectionMap} geo=${geo} theme=${theme} unit=${effectiveUnit} metric=${metric} paint=${paint}
        results=${results} stateResults=${states} uf=${uf && uf !== 'ZZ' ? uf : null} municipality=${municipality}
        onState=${onState} onMunicipality=${onMunicipality}/>
    </div>
    <div class="legend">
      ${seatMode ? html`
          <span class="legend-side legend-key">Cor e %: partido com a maior bancada eleita no estado (situação do TSE).</span>
          ${legend.slice(0, 10).map(entry => html`<span class="legend-side" key=${entry.party}>
            <i class="swatch" style=${{ background: partyFill(entry.party, 1, theme).fill }}></i><b>${entry.party}</b> ${int(entry.places)} ${entry.places === 1 ? 'estado' : 'estados'}</span>`)}
          ${Object.values(states).some(r => r?.empty) && html`<span class="legend-side"><i class="swatch" style=${{ background: MAP_EMPTY[theme] }}></i>${emptyLabel}</span>`}`
      : statusMode && seatLegend ? html`
          <span class="legend-side legend-key">Cor do partido do mais votado; um ponto por eleito, na cor do partido.</span>
          ${seatLegend.map(entry => html`<span class="legend-side" key=${entry.party}>
            <i class="swatch" style=${{ background: partyFill(entry.party, 1, theme).fill }}></i><b>${entry.party}</b> ${int(entry.count)} ${entry.count === 1 ? 'cadeira' : 'cadeiras'}</span>`)}
          ${staleCount > 0 && html`<span class="legend-side"><i class="swatch swatch-stale"></i>boletim atrasado</span>`}`
      : statusMode ? html`
          <span class="legend-side legend-key">Cor do partido de quem venceu ou lidera.
            ${statusLegend.some(e => e.open) && html`<i class="swatch swatch-runoff"></i>hachura e selo “${statusLabel}”: ${statusLabel === '2º turno' ? 'disputa vai ao 2º turno' : 'em apuração'}`}</span>
          ${statusLegend.slice(0, 10).map(entry => html`<span class="legend-side" key=${entry.party}>
            <i class="swatch" style=${{ background: statusFill({ leaderParty: entry.party }, theme).fill }}></i><b>${entry.party}</b>
            ${[entry.decided && `${int(entry.decided)} ${entry.decided === 1 ? 'eleito' : 'eleitos'}`, entry.open && `lidera ${int(entry.open)} ${statusLabel === '2º turno' ? 'no 2º turno' : 'em apuração'}`].filter(Boolean).join(' · ')}
          </span>`)}
          ${staleCount > 0 && html`<span class="legend-side"><i class="swatch swatch-stale"></i>boletim atrasado</span>`}`
      : metric === 'apurado'
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

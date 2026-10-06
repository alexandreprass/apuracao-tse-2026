import { useMemo, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { OFFICES } from '../config.js';
import { int } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { seatsByParty } from '../data/analysis.js';
import { stateName, UFS } from '../data/states.js';
import { loadIndex, bundleUrl } from '../data/source.js';
import { useAsync, useProportional } from '../hooks/useData.js';
import { MapPanel } from '../components/MapPanel.js';
import { Icon } from '../components/Icon.js';
import { CountStrip, Dashboard, Scoreboard } from '../components/Dashboard.js';
import { Loading, Metrics, Notice, PartyBars } from '../components/ui.js';
import { Breadcrumb } from '../components/Place.js';
import { SiteFooter } from '../components/Header.js';

/** Map row coloured by the party with the most seats in that state (from the shipped index). */
function seatMapRow(summary, uf) {
  const name = stateName(uf);
  if (!summary?.elected) return { name, empty: true, completion: 0, electorate: 0 };
  const ranked = Object.entries(summary.elected).sort((a, b) => b[1] - a[1]);
  const [party, count] = ranked[0] || [];
  const second = ranked[1]?.[1] || 0;
  return {
    name,
    empty: !party,
    completion: 1,
    electorate: 0,
    status: 'decidido',
    finished: true,
    leaderName: party ? `${party} · ${count} ${count === 1 ? 'cadeira' : 'cadeiras'}` : '',
    leaderParty: party,
    leaderPct: party ? (100 * count) / summary.seats : 0,
    margin: party ? (count - second) / summary.seats : 0,
    color: party ? partyColor(party) : null,
  };
}

function officeLabel(office, uf) {
  if (uf === 'DF' && OFFICES[office].dfLabel) return OFFICES[office].dfLabel;
  return OFFICES[office].label;
}

/** Brazil overview: party seats on the left, elected candidates on the right. */
function Overview({ route, geo, theme, index, office }) {
  const [expandedUf, setExpandedUf] = useState(null);
  const seats = index?.offices?.[office]?.seats || {};
  const tally = seatsByParty(seats);
  const states = useMemo(() => Object.fromEntries(UFS.map(uf => [uf, seatMapRow(seats[uf], uf)])), [seats]);
  const present = UFS.filter(uf => seats[uf]);
  const results = useAsync(`all|1|${office}`, () => Promise.all(UFS.map(async uf => {
    try {
      const res = await fetch(bundleUrl(`tse/1/${office}/${uf}.json`));
      if (!res.ok) return [uf, null];
      const data = await res.json();
      return [uf, data.result || null];
    } catch {
      return [uf, null];
    }
  })).then(rows => Object.fromEntries(rows)));
  const strip = html`<p class="summary-line">
    <span><b>${int(tally.filled)}</b> eleitos</span>
    <span><b>${int(tally.seats)}</b> vagas</span>
    <span><b>${present.length}</b> estados</span>
  </p>`;
  const map = html`<${MapPanel} compact key=${office} geo=${geo} theme=${theme} states=${states} uf=${null}
    onState=${code => route.go({ uf: code, ibge: null })} title="Cadeiras por estado"/>`;
  const info = html`<div class="score-card">
    <div class="score-head"><span class="eyebrow">Eleitos por partido · Brasil</span></div>
    <${PartyBars} rows=${tally.parties} total=${tally.seats} unit="cadeiras" limit=${16} showPercent=${false}/>
  </div>`;
  const byUf = results.value || {};
  const scoreboard = !results.value
    ? html`<${Loading} text="Carregando candidatos…"/>`
    : html`<div class="score-card">
      <p class="muted small proportional-map-hint">OU CLIQUE NO MAPA PARA ABRIR OS DETALHES POR MUNICÍPIO</p>
      ${UFS.filter(uf => byUf[uf]?.candidates?.length).map(uf => {
        const result = byUf[uf];
        const elected = result.candidates.filter(c => c.kind === 'eleito');
        const candidates = elected.length ? elected : result.candidates.slice(0, 5);
        const isExpanded = expandedUf === uf;
        return html`<section class="uf-block" key=${uf}>
          <div class="uf-block-head">
            <a class="uf-block-title" href=${`#/1turno/${office}/${uf}`}><img class="state-flag" src=${`flags/${uf.toLowerCase()}.svg`} alt="" aria-hidden="true" loading="lazy"/><span>${uf} · ${stateName(uf)} · ${elected.length || candidates.length}</span></a>
            <button class="uf-block-toggle" type="button" aria-expanded=${isExpanded}
              aria-label=${isExpanded ? `Fechar candidatos de ${stateName(uf)}` : `Abrir candidatos de ${stateName(uf)}`}
              aria-controls=${`uf-candidates-${uf}`}
              onClick=${() => setExpandedUf(isExpanded ? null : uf)}>
              <${Icon} name=${isExpanded ? 'up' : 'down'} size=${16}/>
            </button>
          </div>
          ${isExpanded && html`<div id=${`uf-candidates-${uf}`}>
            <${Scoreboard} result=${{ ...result, candidates }} round=${1} office=${office} uf=${uf} show=${candidates.length}/>
          </div>`}
        </section>`;
      })}
    </div>`;
  return html`<${Dashboard} title=${`${OFFICES[office].plural} · Brasil · 1º turno`} strip=${strip}
    crumbs=${html`<${Breadcrumb} route=${route} geo=${geo}/>`} map=${map} info=${info} infoSidebar scoreboard=${scoreboard} scoreFill
    footer=${html`<${SiteFooter} round=${1}/>`}/>`;
}

/** One state's proportional race: every elected name in full, then the rest of the list. */
function StateRace({ route, geo, theme, office, uf, feed }) {
  const data = feed.data;
  const result = data?.result;
  const [drawer, setDrawer] = useState(null);
  const label = officeLabel(office, uf);
  if (!data) return html`<${Loading} text=${`Carregando ${label.toLowerCase()} de ${stateName(uf)}…`}/>`;
  if (data.status) return html`<${Notice} tone="error" title="Resultado indisponível">${data.message || 'Não foi possível ler este arquivo do TSE.'}</${Notice}>`;
  const elected = (result.candidates || []).filter(c => c.kind === 'eleito');
  const states = { [uf]: seatMapRow({ elected: Object.fromEntries(elected.map(c => [c.party, elected.filter(x => x.party === c.party).length])), seats: result.seats }, uf) };
  const parties = Object.entries(states[uf].leaderParty ? result.candidates.filter(c => c.kind === 'eleito').reduce((acc, c) => ({ ...acc, [c.party]: (acc[c.party] || 0) + 1 }), {}) : {})
    .sort((a, b) => b[1] - a[1])
    .map(([party, count]) => ({ party, count, color: partyColor(party) }));
  const strip = html`<${CountStrip} result=${result} actions=${html`<button class="button is-small" onClick=${() => setDrawer('detalhes')}>Detalhes</button>`}/>`;
  const map = html`<${MapPanel} compact geo=${geo} theme=${theme} states=${states} uf=${uf}
    onState=${code => route.go({ uf: code, ibge: null })} title=${`${label} · ${stateName(uf)}`}/>`;
  const scoreboard = html`<div class="score-card">
    <div class="score-head"><span class="eyebrow">${stateName(uf).toUpperCase()} · 1º TURNO · ${result.finished ? 'FINALIZADA' : 'EM APURAÇÃO'}</span></div>
    <p class="muted small">${int(elected.length)} eleitos de ${int(result.seats)} vagas${result.quotient ? ` · quociente eleitoral ${int(result.quotient)}` : ''}</p>
    <${Scoreboard} result=${result} round=${1} office=${office} uf=${uf} show=${Math.max(elected.length, 4)} focus=${route.focus}/>
  </div>`;
  const info = html`<div class="score-card">
    <div class="score-head"><span class="eyebrow">Cadeiras por partido · ${stateName(uf)}</span></div>
    <${PartyBars} rows=${parties} total=${result.seats} unit="cadeiras" showPercent=${false}/>
    <p class="muted small">${int(elected.length)} eleitos de ${int(result.seats)} vagas${result.quotient ? ` · quociente eleitoral ${int(result.quotient)}` : ''}</p>
  </div>`;
  const drawers = {
    detalhes: { title: `Participação e votos · ${stateName(uf)}`, content: html`<${Metrics} result=${result}/>` },
  };
  return html`<${Dashboard} title=${`${label} · ${stateName(uf)} · 1º turno`} strip=${strip}
    crumbs=${html`<${Breadcrumb} route=${route} geo=${geo}/>`} map=${map} info=${info} infoSidebar scoreboard=${scoreboard} scoreFill
    drawer=${drawer && drawers[drawer]} onCloseDrawer=${() => setDrawer(null)}
    footer=${html`<${SiteFooter} feed=${feed.feed} round=${1}/>`}/>`;
}

/** Deputies: shipped TSE copy, one file per state. Senate stays on the majoritarian view. */
export function ProportionalView({ route, geo, theme }) {
  const { office, uf } = route;
  const indexState = useAsync(`index|1|${office}`, () => loadIndex(1));
  const feed = useProportional(1, office, uf);
  if (!uf) {
    if (indexState.loading && !indexState.value) return html`<${Loading} text="Carregando cadeiras…"/>`;
    return html`<${Overview} route=${route} geo=${geo} theme=${theme} index=${indexState.value} office=${office}/>`;
  }
  return html`<${StateRace} route=${route} geo=${geo} theme=${theme} office=${office} uf=${uf} feed=${feed}/>`;
}

import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { OFFICES, ROUNDS } from '../config.js';
import { int, pct, titleCase } from '../lib/format.js';
import { federationMap, listOf, listVotes, nationalSeats, searchCandidates, seatStateRows, stateSeats, statusPending, suplentesByList, electedOf } from '../data/proportional.js';
import { loadIndex } from '../data/source.js';
import { stateName, UFS } from '../data/states.js';
import { useAsync } from '../hooks/useData.js';
import { Loading, Metrics, Notice, PartyBars, Segmented, StaleTag } from '../components/ui.js';
import { MapPanel } from '../components/MapPanel.js';
import { Breadcrumb } from '../components/Place.js';
import { CountStrip, Dashboard } from '../components/Dashboard.js';
import { SiteFooter } from '../components/Header.js';
import { NoBoletim } from './Majoritarian.js';

const RULE = 'Eleitos e suplentes conforme a situação publicada pelo TSE para cada candidato. O site não calcula quociente nem sobras.';

/** Federação (one list for the seats) or party: the same toggle on Brasil and on a state. */
function GroupToggle({ value, onChange }) {
  return html`<${Segmented} label="Agrupar cadeiras" value=${value ? 'fed' : 'party'} onChange=${v => onChange(v === 'fed')}
    options=${[['fed', 'Federação'], ['party', 'Partido']]}/>`;
}

/** Seat bars, with the parties of a federation under its name. */
function SeatBars({ rows, total, limit }) {
  return html`<${PartyBars} rows=${rows} total=${total} unit="cadeiras" limit=${limit}/>
    ${rows.some(r => r.federation) && html`<p class="muted small dep-feds">${rows.filter(r => r.federation).map(r => html`<span key=${r.key}>
      <i class="swatch" style=${{ background: r.color }}></i><b>${r.party}</b> ${Object.entries(r.parties).map(([p, n]) => `${p} ${n}`).join(' · ')}</span>`)}</p>`}`;
}

/** One candidate line: party stripe, name, party · number, TSE situação, votes. */
function CandidateLine({ c, fedMap }) {
  const list = listOf(c.party, fedMap);
  return html`<li class="dep-row" id=${'cand-' + c.n} style=${{ '--party': list.color }} title=${list.federation ? `${c.party} · ${list.federation}` : c.party}>
    <span class="dep-name"><b>${titleCase(c.name)}</b> <small>${c.party} · ${c.n}</small></span>
    <span class=${'dep-status is-' + c.kind}>${c.status || 'situação pendente'}</span>
    <span class="dep-votes">${int(c.votes)}</span>
  </li>`;
}

function SearchTab({ result, fedMap }) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchCandidates(result, query), [result, query]);
  return html`<div class="dep-search">
    <label class="sr-only" for="dep-q">Buscar candidato por nome, número ou partido</label>
    <div class="table-tools"><input id="dep-q" type="search" placeholder="Nome, número ou partido" value=${query} onInput=${e => setQuery(e.currentTarget.value)}/></div>
    ${query.trim() && html`<p class="muted small">${hits.length ? `${hits.length}${hits.length === 60 ? '+' : ''} candidato(s)` : 'Nenhum candidato encontrado.'}</p>`}
    <ol class="dep-list">${hits.map(c => html`<${CandidateLine} key=${c.n} c=${c} fedMap=${fedMap}/>`)}</ol>
  </div>`;
}

/** Brasil (federal: 513 seats) or the 27 assemblies summed (state deputies), from index.json only. */
function ProportionalBrasil({ route, geo, theme, office, summary, crumbs }) {
  const [byFed, setByFed] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const national = useMemo(() => nationalSeats(summary, byFed), [summary, byFed]);
  const states = useMemo(() => seatStateRows(summary), [summary]);
  const federal = office === 'deputado-federal';
  const onState = code => route.go({ uf: code, ibge: null });
  const strip = html`<div class="summary-chips">
    <span class="chip is-elected"><b>${int(national.filled)}</b> de ${int(national.seats)} cadeiras com eleito publicado pelo TSE</span>
    ${national.pending.length > 0 && html`<span class="chip is-runoff" title="A totalização não está concluída no TSE: a situação dos candidatos ainda não foi publicada"><b>${national.pending.join(', ')}</b> situação pendente no TSE</span>`}
  </div>`;
  const map = html`<${MapPanel} compact seatMode key=${office} geo=${geo} theme=${theme} states=${states} uf=${null} onState=${onState}
    title="Maior bancada por estado" emptyLabel="eleitos ainda não publicados pelo TSE"/>`;
  const scoreboard = html`<div class="score-card">
    <div class="score-head"><span class="eyebrow">${federal ? `Câmara dos Deputados · ${int(national.seats)} cadeiras` : `Assembleias das 27 UFs, somadas · ${int(national.seats)} cadeiras`}</span>
      <${GroupToggle} value=${byFed} onChange=${setByFed}/></div>
    <${SeatBars} rows=${national.rows} total=${national.seats} limit=${10}/>
    ${national.rows.length > 10 && html`<button class="panel-link" onClick=${() => setDrawer(true)}>Todas as ${national.rows.length} bancadas →</button>`}
    <p class="muted small">${RULE}</p>
  </div>`;
  const table = html`<table class="data-table dep-table"><thead><tr><th>Estado</th><th class="num">Vagas</th><th>Maior bancada</th></tr></thead>
    <tbody>${UFS.map(uf => {
      const r = states[uf];
      return html`<tr key=${uf}><td><a href=${`#/1turno/${office}/${uf}`}>${stateName(uf)}</a> <small>${uf}</small></td><td class="num">${int(r.seats)}</td>
        <td>${r.empty ? html`<span class="muted">situação pendente no TSE</span>` : html`<i class="swatch" style=${{ background: r.color }}></i>${r.tied.join(', ')} <small>${int(r.count)}</small>`}</td></tr>`;
    })}</tbody></table>`;
  const tabs = [
    { id: 'estados', label: 'Estados', content: table },
    { id: 'buscar', label: 'Buscar', content: html`<p class="muted small">Escolha um estado para ver eleitos e suplentes e buscar candidatos por nome, número ou partido.
      Os candidatos de cada estado só são baixados quando ele é aberto.</p>
      <div class="dep-ufs">${UFS.map(uf => html`<a key=${uf} class="button is-small" href=${`#/1turno/${office}/${uf}`}>${uf}</a>`)}</div>` },
  ];
  return html`<${Dashboard} title=${`${OFFICES[office].label} · Brasil · ${ROUNDS[1].label}`} strip=${strip} crumbs=${crumbs} map=${map}
    scoreboard=${scoreboard} tabs=${tabs} drawer=${drawer && { title: 'Cadeiras por bancada', content: html`<${SeatBars} rows=${national.rows} total=${national.seats} limit=${99}/>` }}
    onCloseDrawer=${() => setDrawer(false)} footer=${html`<${SiteFooter} feed=${null} round=${1}/>`}/>`;
}

/** One state: seats by list, eleitos, search, suplentes; downloaded only when the state is opened. */
function ProportionalState({ route, geo, theme, office, summary, state, crumbs }) {
  const { uf } = route;
  const [byFed, setByFed] = useState(true);
  const [drawer, setDrawer] = useState(null);
  useEffect(() => setDrawer(null), [office, uf]);
  const states = useMemo(() => seatStateRows(summary), [summary]);
  const data = state.data;
  const result = data?.result;
  const fedMap = useMemo(() => federationMap(result), [result]);
  const onState = code => route.go({ uf: code, ibge: null });
  const map = html`<${MapPanel} compact seatMode key=${office} geo=${geo} theme=${theme} states=${states} uf=${null} onState=${onState}
    title=${`Maior bancada por estado · ${stateName(uf)} aberto`} emptyLabel="eleitos ainda não publicados pelo TSE"/>`;
  const footer = html`<${SiteFooter} feed=${state.feed} round=${1}/>`;
  const title = `${OFFICES[office].label} · ${stateName(uf)} · ${ROUNDS[1].label}`;
  if (!data || (state.loading && !result && !data.status)) return html`<${Dashboard} title=${title} crumbs=${crumbs} map=${map}
    scoreboard=${html`<${Loading} text=${`Carregando ${OFFICES[office].plural.toLowerCase()} de ${stateName(uf)}…`}/>`} tabs=${[]} footer=${footer}/>`;
  if (!result) return html`<${Dashboard} title=${title} crumbs=${crumbs} map=${map} tabs=${[]} footer=${footer}
    scoreboard=${data.status === 'error' ? html`<${NoBoletim} data=${data}/>` : html`<${Notice} title="Sem resultado">${data.message || 'O TSE ainda não publicou este resultado.'}</${Notice}>`}/>`;

  const label = uf === 'DF' && OFFICES[office].dfLabel ? 'Deputado distrital' : OFFICES[office].label;
  const elected = electedOf(result);
  const pending = statusPending(result);
  const stale = !!(data.liveError || data.stale);
  const seats = stateSeats(result, byFed);
  const strip = html`<${CountStrip} result=${result} actions=${html`
    <button class="button is-small" onClick=${() => setDrawer('suplentes')}>Suplentes</button>
    <button class="button is-small" onClick=${() => setDrawer('detalhes')}>Detalhes</button>`}/>`;
  const scoreboard = html`<div class=${'score-card' + (stale ? ' is-stale' : '')}>
    <div class="score-head">
      <span class="eyebrow">${label} · ${stateName(uf)} · ${int(result.seats)} vagas${result.finished ? ' · finalizada' : ' · totalização não concluída'}</span>
      ${stale && html`<${StaleTag} updated=${result.updated}/>`}
      <${GroupToggle} value=${byFed} onChange=${setByFed}/>
    </div>
    ${pending ? html`<${Notice} tone="warning" title="Situação dos candidatos ainda não publicada">O TSE marcou a totalização de ${stateName(uf)} como não concluída
        (arquivo gerado em ${result.generated}) e ainda não informou quem está eleito. O site não calcula eleitos: eles aparecem aqui quando o TSE publicar.</${Notice}>`
      : html`<${SeatBars} rows=${seats} total=${result.seats} limit=${8}/>`}
    <p class="muted small dep-info">Quociente eleitoral: <b>${int(result.quotient)}</b> votos · votos de legenda: <b>${int(result.legend)}</b>
      <span> (números do TSE, só informativos). ${RULE}</span></p>
  </div>`;
  const tabs = [
    { id: 'eleitos', label: `Eleitos (${elected.length})`, content: elected.length
      ? html`<ol class="dep-list">${elected.map(c => html`<${CandidateLine} key=${c.n} c=${c} fedMap=${fedMap}/>`)}</ol>`
      : html`<p class="muted small">Nenhum eleito publicado pelo TSE ainda.</p>` },
    { id: 'buscar', label: 'Buscar', content: html`<${SearchTab} result=${result} fedMap=${fedMap}/>` },
    { id: 'listas', label: 'Votos por lista', content: html`<table class="data-table dep-table"><thead><tr><th>${byFed ? 'Federação/partido' : 'Partido'}</th><th class="num">Nominais</th><th class="num">Legenda</th><th class="num">Cadeiras</th></tr></thead>
      <tbody>${listVotes(result, byFed).filter(r => r.votes + r.legend > 0).map(r => html`<tr key=${r.key}><td><i class="swatch" style=${{ background: r.color }}></i>${r.party}</td>
        <td class="num">${int(r.votes)}</td><td class="num">${int(r.legend)}</td><td class="num">${pending ? '—' : int(r.seats)}</td></tr>`)}</tbody></table>
      <p class="muted small">Votos nominais e de legenda como o TSE publica; ${byFed ? 'a federação conta como uma lista só.' : 'partidos de uma federação concorrem juntos.'}</p>` },
  ];
  const drawers = {
    suplentes: { title: `Suplentes · ${stateName(uf)}`, content: pending ? html`<p class="muted">O TSE ainda não publicou a situação dos candidatos.</p>`
      : html`<p class="muted small">Suplentes de cada lista na ordem de votos, conforme a situação do TSE.</p>
        ${suplentesByList(result).map(g => html`<section key=${g.key} class="dep-group"><h3><i class="swatch" style=${{ background: g.color }}></i>${g.party}
          <small>${g.seats} ${g.seats === 1 ? 'cadeira' : 'cadeiras'} · ${g.candidates.length} suplentes</small></h3>
          <ol class="dep-list">${g.candidates.map(c => html`<${CandidateLine} key=${c.n} c=${c} fedMap=${fedMap}/>`)}</ol></section>`)}` },
    detalhes: { title: `Participação e votos · ${stateName(uf)}`, content: html`<${Metrics} result=${result}/>
      <p class="muted small">${result.source === 'tse' || data.source === 'tse' ? 'Lido ao vivo no TSE.' : 'Cópia dos arquivos oficiais do TSE.'} Atualizado pelo TSE em ${result.updated}.</p>` },
  };
  return html`<${Dashboard} title=${title} strip=${strip} crumbs=${crumbs} map=${map} scoreboard=${scoreboard} tabs=${tabs}
    drawer=${drawer && drawers[drawer]} onCloseDrawer=${() => setDrawer(null)} footer=${footer}/>`;
}

/**
 * Deputies (federal and state), 1º turno only. Brasil reads the small seat summary of index.json;
 * a state's candidates (`state`: the polled feed of useProportional) are downloaded only when it is opened.
 */
export function ProportionalView({ route, geo, theme, state }) {
  const { office, uf } = route;
  const index = useAsync('index|1', () => loadIndex(1));
  const summary = index.value?.offices?.[office];
  const crumbs = html`<${Breadcrumb} route=${route} geo=${geo}/>`;
  if (!summary && index.loading) return html`<${Loading}/>`;
  if (uf) return html`<${ProportionalState} route=${route} geo=${geo} theme=${theme} office=${office} summary=${summary} state=${state} crumbs=${crumbs}/>`;
  if (!summary) return html`${crumbs}<${Notice} title="Resumo indisponível">O resumo de cadeiras não pôde ser lido agora. Escolha um estado para ver os resultados dele.</${Notice}>`;
  return html`<${ProportionalBrasil} route=${route} geo=${geo} theme=${theme} office=${office} summary=${summary} crumbs=${crumbs}/>`;
}

import { useMemo, useRef } from 'preact/hooks';
import { html } from '../lib/html.js';
import { OFFICES, ROUNDS } from '../config.js';
import { int, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { mapRow, regionTotals, runoffCandidates, stateRows, statesWon, unpackMunicipalities } from '../data/analysis.js';
import { stateName } from '../data/states.js';
import { useLiveMunicipality, useMunicipalPack, useOffice } from '../hooks/useData.js';
import { CandidateCard, Countdown, Loading, Metrics, Notice, Section, ShareBar } from '../components/ui.js';
import { MapPanel } from '../components/MapPanel.js';
import { MunicipalitiesTable, StatesTable } from '../components/Tables.js';
import { Breadcrumb, placeTitle } from '../components/Place.js';
import { TrendChart } from '../components/TrendChart.js';

/** Candidate cards: the two leaders large, everyone else in a compact grid. */
function CandidateGrid({ result, office, uf }) {
  const [first, second, ...rest] = result.candidates;
  return html`<div class="candidates">
    <div class="candidates-top">
      ${[first, second].filter(Boolean).map((c, i) => html`<${CandidateCard} key=${c.n} candidate=${c} office=${office} uf=${uf} rank=${i + 1} big/>`)}
    </div>
    ${rest.length > 0 && html`<div class="candidates-rest">
      ${rest.map((c, i) => html`<${CandidateCard} key=${c.n} candidate=${c} office=${office} uf=${uf} rank=${i + 3}/>`)}
    </div>`}
  </div>`;
}

/** Votes per region for the two national leaders. */
function RegionBreakdown({ data }) {
  const regions = regionTotals(data);
  const leaders = data.br.candidates.slice(0, 2);
  return html`<div class="regions">
    ${regions.map(r => html`<div class="region" key=${r.region}>
      <h3>${r.region}<small>${int(r.electorate)} eleitores · comparecimento ${pct(r.electorate ? (100 * r.turnout) / r.electorate : 0)}</small></h3>
      ${leaders.map(c => {
        const share = r.valid ? (100 * (r.votes[c.n] || 0)) / r.valid : 0;
        return html`<div class="region-row" key=${c.n}>
          <span>${titleCase(c.name)}</span>
          <span class="party-track"><i style=${{ width: share + '%', background: partyColor(c.party) }}></i></span>
          <b>${pct(share)}</b>
        </div>`;
      })}
    </div>`)}
  </div>`;
}

function StatesWon({ data }) {
  const won = statesWon(data);
  const list = data.br.candidates.filter(c => won[c.n]);
  return html`<ul class="won-list">
    ${list.map(c => html`<li key=${c.n}><i class="swatch" style=${{ background: partyColor(c.party) }}></i>
      <b>${titleCase(c.name)}</b> venceu em <b>${won[c.n]}</b> ${won[c.n] === 1 ? 'estado' : 'estados'}</li>`)}
  </ul>`;
}

/** Before the TSE publishes the runoff: who is in it, when it starts, and an automatic check. */
export function RunoffWaiting({ office, uf, first, data }) {
  const scope = uf ? first?.uf?.[uf] : first?.br;
  const finalists = runoffCandidates(scope);
  const round = ROUNDS[2];
  return html`<div class="runoff-waiting">
    <${Section} title=${`${OFFICES[office].label} · ${uf ? stateName(uf) : 'Brasil'} · 2º turno`}
      subtitle=${`Votação em ${round.date}. A apuração começa quando as urnas fecham, às 17h (horário de Brasília).`}>
      <div class="countdown-box"><span>Faltam</span><${Countdown} target=${round.closesAt}/></div>
      ${finalists.length
        ? html`<div class="candidates-top">${finalists.map(c => html`<${CandidateCard} key=${c.n} big placeholder
            candidate=${{ ...c, status: '2º turno', kind: 'segundo-turno' }} office=${office} uf=${uf}
            note=${`1º turno: ${pct(c.pct)} · ${int(c.votes)} votos`}/>`)}</div>`
        : scope ? html`<${Notice} title="Sem 2º turno">${titleCase(scope.candidates[0]?.name)} foi eleito no 1º turno.</${Notice}>`
        : html`<${Loading} text="Carregando os finalistas do 1º turno…"/>`}
      <p class="muted small">Os votos aparecem aqui sozinhos assim que o TSE publicar o primeiro boletim do 2º turno
        (o site confere a cada ${data?.status === 'error' ? 'minuto' : 'poucos minutos'} e a cada minuto no dia da eleição). Nenhum número é exibido antes disso.</p>
      ${data?.status === 'error' && html`<${Notice} tone="error" title="Não foi possível consultar o TSE agora">${data.message}</${Notice}>`}
    </${Section}>
  </div>`;
}

/** Shares over time, recorded while a live count is open in this tab. */
function useSessionTrend(key, result, live) {
  const store = useRef(new Map());
  return useMemo(() => {
    if (!result || !live) return [];
    const list = store.current.get(key) || [];
    const last = list[list.length - 1];
    if (!last || last.counted !== result.sections.pct) {
      list.push({ counted: result.sections.pct, time: result.updated, shares: result.candidates.slice(0, 3).map(c => ({ n: c.n, name: c.name, party: c.party, pct: c.pct })) });
      store.current.set(key, list);
    }
    return [...list];
  }, [key, result, live]);
}

export function MajoritarianView({ route, geo, theme, office: officeState }) {
  const { round, office, uf, ibge } = route;
  const data = officeState.data;
  const firstRound = useOffice(1, office);
  const packState = useMunicipalPack(round, office === 'presidente' ? uf : null);
  const national = data?.br;
  const municipalRows = useMemo(() => unpackMunicipalities(packState.value, national, geo), [packState.value, national, geo]);
  const packRow = ibge ? municipalRows.get(ibge) : null;
  const live = useLiveMunicipality(round, office, ibge, !!ibge && (!packRow || data?.source === 'tse'));

  // Whole-country municipal map: every state's file, only when asked for (see MapPanel).
  const states = useMemo(() => stateRows(data), [data]);
  const mapMunicipal = useMemo(() => {
    if (!uf || !municipalRows.size) return null;
    const map = new Map();
    for (const [id, r] of municipalRows) map.set(id, mapRow(r, r.name));
    return map;
  }, [municipalRows, uf]);

  const result = ibge ? (live.value || packRow) : uf === 'ZZ' ? data?.zz : uf ? data?.uf?.[uf] : national;
  const trend = useSessionTrend(`${round}|${office}|${uf}|${ibge}`, result, data?.source === 'tse' && !result?.finished);

  if (!data) return html`<${Loading}/>`;
  if (data.status) {
    if (round === 2) return html`<${Breadcrumb} route=${route} geo=${geo}/><${RunoffWaiting} office=${office} uf=${uf === 'ZZ' ? null : uf} first=${firstRound.data} data=${data}/>`;
    return html`<${Notice} tone="error" title="Não foi possível carregar os resultados">${data.message} Tente atualizar em instantes.</${Notice}>`;
  }

  const title = `${OFFICES[office].label} · ${placeTitle(route, geo)}`;
  const onState = code => route.go({ uf: code, ibge: null });
  const onMunicipality = id => route.go({ uf: geo.byId.get(id)?.uf, ibge: id });

  return html`
    <${Breadcrumb} route=${route} geo=${geo} allowExterior=${!!data.zz}/>
    ${!result
      ? (ibge && live.loading ? html`<${Loading} text="Buscando o resultado do município no TSE…"/>`
        : html`<${Notice} title="Sem resultado para este lugar">O TSE não publicou resultado de ${OFFICES[office].label.toLowerCase()} aqui${round === 2 ? ' no 2º turno' : ''}.</${Notice}>`)
      : html`
        <section class="hero card" aria-labelledby="hero-title">
          <header class="hero-head">
            <div>
              <p class="eyebrow">${ROUNDS[round].label} · ${ROUNDS[round].date}${result.finished ? ' · totalização finalizada' : ' · em apuração'}</p>
              <h1 id="hero-title">${title}</h1>
            </div>
            <div class="hero-count"><strong>${pct(result.sections?.pct || 0)}</strong><span>das seções apuradas</span></div>
          </header>
          <${ShareBar} candidates=${result.candidates}/>
          ${round === 1 && !uf && office === 'presidente' && runoffCandidates(result).length === 2 && html`<p class="hero-note">
            Nenhum candidato passou de 50% dos votos válidos: <b>${runoffCandidates(result).map(c => titleCase(c.name)).join(' e ')}</b> disputam o 2º turno em ${ROUNDS[2].date}.${' '}
            <a href="#/2turno/presidente">Ver 2º turno →</a></p>`}
          <${CandidateGrid} result=${result} office=${office} uf=${uf}/>
          <p class="muted small">Percentuais sobre os votos válidos (sem brancos e nulos), como divulga o TSE.
            ${ibge && (live.value ? ' Resultado do município consultado ao vivo no TSE.' : ' Cópia dos arquivos oficiais do TSE.')}</p>
        </section>
        <${Section} title="Participação e votos" subtitle=${`Eleitorado, comparecimento e votos em ${placeTitle(route, geo)}`}>
          <${Metrics} result=${result}/>
        </${Section}>
        ${trend.length > 1 && html`<${Section} title="Evolução da apuração" subtitle="Registrada desde que você abriu esta página">
          <${TrendChart} points=${trend}/></${Section}>`}`}

    ${uf !== 'ZZ' && html`<div class="split">
      <${MapPanel} geo=${geo} theme=${theme} states=${states} municipalities=${mapMunicipal} uf=${uf} ibge=${ibge}
        onState=${onState} onMunicipality=${onMunicipality} title=${uf ? `Mapa de ${stateName(uf)}` : 'Mapa do Brasil'}/>
      ${!uf && national && html`<div class="stack">
        <${Section} title="Vitórias por estado"><${StatesWon} data=${data}/></${Section}>
        ${data.zz && html`<${Section} title="Exterior" subtitle=${`${int(data.zz.electorate)} eleitores fora do Brasil · contados à parte`}
            actions=${html`<a class="button" href=${`#/${round}turno/${office}/ZZ`}>Detalhes</a>`}>
          <${ShareBar} candidates=${data.zz.candidates}/>
          <ol class="mini-list">${data.zz.candidates.slice(0, 3).map(c => html`<li key=${c.n}><i class="swatch" style=${{ background: partyColor(c.party) }}></i>${titleCase(c.name)} <b>${pct(c.pct)}</b></li>`)}</ol>
          <p class="muted small">Comparecimento ${pct(data.zz.turnoutPct)} · ${pct(data.zz.sections.pct)} das seções apuradas</p>
        </${Section}>`}
      </div>`}
    </div>`}

    ${!uf && national && html`<${Section} title="Votos por região" subtitle="Percentual dos votos válidos dos dois primeiros colocados em cada região">
      <${RegionBreakdown} data=${data}/></${Section}>`}

    ${!uf && html`<${Section} title="Resultado por estado" subtitle="Clique no nome para abrir o estado. O exterior aparece separado.">
      <${StatesTable} data=${data} onState=${onState} exterior=${data.zz}/></${Section}>`}

    ${uf && uf !== 'ZZ' && !ibge && (municipalRows.size
      ? html`<${Section} title=${`Municípios de ${stateName(uf)}`} subtitle=${`${int(municipalRows.size)} municípios`}>
          <${MunicipalitiesTable} rows=${municipalRows} onMunicipality=${onMunicipality}/></${Section}>`
      : packState.loading ? html`<${Loading} text="Carregando municípios…"/>` : null)}
  `;
}


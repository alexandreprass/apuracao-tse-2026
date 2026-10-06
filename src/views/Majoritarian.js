import { useMemo } from 'preact/hooks';
import { html } from '../lib/html.js';
import { OFFICES, POLL_LIVE_MS, POLL_WAITING_MS, ROUNDS } from '../config.js';
import { brasiliaStamp, compact, int, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { mapRow, regionTotals, runoffCandidates, stateRows, statesWon, unpackMunicipalities } from '../data/analysis.js';
import { stateName } from '../data/states.js';
import { comebackEstimate } from '../data/estimate.js';
import { readTrend, recordTrend } from '../data/trend.js';
import { noBoletimNotice } from '../data/status.js';
import { useLiveMunicipality, useMunicipalPack, useOffice } from '../hooks/useData.js';
import { useMyMunicipality } from '../hooks/useMyMunicipality.js';
import { Icon } from '../components/Icon.js';
import { MyMunicipality } from '../components/MyMunicipality.js';
import { CandidateCard, Countdown, Loading, Metrics, Notice, Progress, Section, ShareBar, StaleTag } from '../components/ui.js';
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
      ${rest.slice(0, 2).map((c, i) => html`<${CandidateCard} key=${c.n} candidate=${c} office=${office} uf=${uf} rank=${i + 3}/>`)}
    </div>`}
    ${rest.length > 2 && html`<details class="candidates-more">
      <summary>Ver os outros ${rest.length - 2} candidatos</summary>
      <div class="candidates-rest">
        ${rest.slice(2).map((c, i) => html`<${CandidateCard} key=${c.n} candidate=${c} office=${office} uf=${uf} rank=${i + 5}/>`)}
      </div>
    </details>`}
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

/** Amber warning in the body when the TSE cannot be read and there is no boletim to show at all. */
export function NoBoletim({ data }) {
  const info = noBoletimNotice(data);
  return info && html`<${Notice} tone=${info.tone} title=${info.title}>${info.text}${info.detail ? html` <span class="muted small">(${info.detail})</span>` : ''}</${Notice}>`;
}

/** Before the TSE publishes the runoff: who is in it, when it starts, and an automatic check. */
export function RunoffWaiting({ office, uf, first, data, geo, onChooseMunicipality }) {
  const scope = uf ? first?.uf?.[uf] : first?.br;
  const finalists = runoffCandidates(scope);
  const round = ROUNDS[2];
  return html`<div class="runoff-waiting">
    <${NoBoletim} data=${data}/>
    ${office === 'presidente' && geo && html`<${MyMunicipality} geo=${geo} office=${office} officeData=${data} onChoose=${onChooseMunicipality}/>`}
    <${Section} title=${`${OFFICES[office].label} · ${uf ? stateName(uf) : 'Brasil'} · 2º turno`}
      subtitle=${`Votação em ${round.date}. A apuração começa quando as urnas fecham, às 17h (horário de Brasília).`}>
      <div class="countdown-box"><span>Faltam</span><${Countdown} target=${round.closesAt}/></div>
      ${finalists.length
        ? html`<div class="candidates-top">${finalists.map(c => html`<${CandidateCard} key=${c.n} big placeholder
            candidate=${{ ...c, status: '2º turno', kind: 'segundo-turno' }} office=${office} uf=${uf}
            note=${`1º turno: ${pct(c.pct)} · ${int(c.votes)} votos`}/>`)}</div>`
        : scope ? html`<${Notice} title="Sem 2º turno">${titleCase(scope.candidates[0]?.name)} foi eleito no 1º turno.</${Notice}>`
        : first?.status ? html`<p class="muted">Os finalistas aparecem aqui assim que o resultado do 1º turno puder ser lido.</p>`
        : html`<${Loading} text="Carregando os finalistas do 1º turno…"/>`}
      <p class="muted small">Os votos aparecem aqui sozinhos assim que o TSE publicar o primeiro boletim do 2º turno
        (o site confere a cada ${Math.round(POLL_WAITING_MS / 60_000)} minutos até as urnas fecharem, às 17h de ${round.date}, e a cada ${Math.round(POLL_LIVE_MS / 1000)} segundos
        a partir daí ou se o TSE não responder). Nenhum número é exibido antes disso.</p>
    </${Section}>
  </div>`;
}

/**
 * Shares over time while a count runs, kept in this browser (localStorage) so the chart does not
 * start empty when the reader comes back. Only official TSE numbers are recorded.
 */
function useStoredTrend(key, result, running) {
  return useMemo(() => {
    if (!result) return [];
    return running ? recordTrend(key, result) : readTrend(key);
  }, [key, result, running]);
}

/** "Dá pra virar?": the gap now and an ESTIMATE of the votes still to count. Never a result. */
function Comeback({ result }) {
  const e = comebackEstimate(result);
  if (!e) return null;
  const second = titleCase(e.second.name), first = titleCase(e.first.name);
  return html`<${Section} title="Dá pra virar?" className="comeback" subtitle="Diferença atual e quantos votos ainda faltam apurar"
      actions=${html`<span class="badge is-pending is-estimate" title="Cálculo do site, não é resultado do TSE">Estimativa · não é resultado oficial</span>`}>
    <div class="comeback-grid">
      <div class="comeback-item">
        <span class="metric-label">Diferença atual (TSE)</span>
        <strong>${int(e.gap)} votos</strong>
        <small>${first} à frente de ${second}</small>
      </div>
      <div class="comeback-item is-estimate">
        <span class="metric-label">Votos válidos que faltam apurar <em>(estimativa)</em></span>
        <strong>≈ ${compact(e.remainingValid)}</strong>
        <small>${int(e.sectionsLeft)} seções restantes × ${int(e.turnoutPerSection)} eleitores por seção (média das já apuradas)</small>
      </div>
      <div class="comeback-item is-estimate">
        <span class="metric-label">Para empatar <em>(estimativa)</em></span>
        ${e.reachable
          ? html`<strong>${pct(e.neededShare, 1)}</strong><small>dos votos válidos restantes teriam de ir para ${second}</small>`
          : html`<strong>Não alcança</strong><small>pela estimativa, os votos restantes são menos que a diferença</small>`}
      </div>
    </div>
    <p class="muted small"><${Icon} name="info" size=${14}/> Estimativa feita pelo site com a média das seções já apuradas; seções que faltam podem ter
      comparecimento e votos bem diferentes. Quem está eleito é só o que o TSE publicar na situação de cada candidato.</p>
  </${Section}>`;
}

export function MajoritarianView({ route, geo, theme, office: officeState, onChooseMunicipality }) {
  const { round, office, uf, ibge } = route;
  const [myMunicipality, setMyMunicipality] = useMyMunicipality();
  const data = officeState.data;
  const firstRound = useOffice(1, office);
  const packState = useMunicipalPack(round, office === 'presidente' ? uf : null);
  const national = data?.br;
  const municipalRows = useMemo(() => unpackMunicipalities(packState.value, national, geo), [packState.value, national, geo]);
  const packRow = ibge ? municipalRows.get(ibge) : null;
  // A municipality is read live from the TSE (and polled) whenever the office itself is live or has no shipped row.
  const live = useLiveMunicipality(round, office, ibge, !!ibge && (!packRow || data?.source === 'tse'));
  const liveResult = live.data?.result;

  const states = useMemo(() => stateRows(data), [data]);
  const mapMunicipal = useMemo(() => {
    if (!uf || !municipalRows.size) return null;
    const map = new Map();
    for (const [id, r] of municipalRows) map.set(id, mapRow(r, r.name));
    return map;
  }, [municipalRows, uf]);

  const result = ibge ? (liveResult || packRow) : uf === 'ZZ' ? data?.zz : uf ? data?.uf?.[uf] : national;
  const election = data?.br?.election || data?.uf?.[uf]?.election || round;
  const trend = useStoredTrend(`${election}|${round}|${office}|${uf || 'BR'}|${ibge || ''}`, result, !!result && !result.finished && !!data && !data.status);
  const packTime = packState.value?.fetchedAt ? brasiliaStamp(new Date(packState.value.fetchedAt)) : '';
  const scopeCode = ibge ? null : uf || 'BR';
  const scopeStale = !ibge && !!data && !data.status && (data.liveError || data.staleUfs?.includes(scopeCode));
  const muniStale = !!ibge && !!live.data?.liveError;

  if (!data) return html`<${Loading}/>`;
  if (data.status) {
    if (round === 2) return html`<${Breadcrumb} route=${route} geo=${geo}/><${RunoffWaiting} office=${office} uf=${uf === 'ZZ' ? null : uf}
      first=${firstRound.data} data=${data} geo=${geo} onChooseMunicipality=${onChooseMunicipality}/>`;
    if (data.status === 'error') return html`<${NoBoletim} data=${data}/>`; // the site keeps trying every 30 s
    return html`<${Notice} tone="error" title="Não foi possível carregar os resultados">${data.message} Tente atualizar em instantes.</${Notice}>`;
  }

  const title = `${OFFICES[office].label} · ${placeTitle(route, geo)}`;
  const onState = code => route.go({ uf: code, ibge: null });
  const onMunicipality = id => route.go({ uf: geo.byId.get(id)?.uf, ibge: id });

  return html`
    <${Breadcrumb} route=${route} geo=${geo} allowExterior=${!!data.zz}/>
    ${round === 2 && office === 'presidente' && !ibge && html`<${MyMunicipality} geo=${geo} office=${office} officeData=${data} onChoose=${onChooseMunicipality}/>`}
    ${!result
      ? (ibge && !live.data && live.feed ? html`<${Loading} text="Buscando o resultado do município no TSE…"/>`
        : html`<${Notice} title="Sem resultado para este lugar">O TSE não publicou resultado de ${OFFICES[office].label.toLowerCase()} aqui${round === 2 ? ' no 2º turno' : ''}.</${Notice}>`)
      : html`
        <section class=${'hero card' + (scopeStale || muniStale ? ' is-stale' : '')} aria-labelledby="hero-title">
          <header class="hero-head">
            <div>
              <p class="eyebrow">${ROUNDS[round].label} · ${ROUNDS[round].date}${result.finished ? ' · totalização finalizada' : ' · em apuração'}</p>
              ${scopeStale && html`<${StaleTag} updated=${result.updated} title="O TSE não respondeu na última consulta; mostrando o último boletim recebido"/>`}
              ${muniStale && html`<${StaleTag} updated=${result.updated} text=${`Cópia das ${result.updated?.slice(11, 16) || '—'}: o TSE não respondeu agora`}/>`}
              <h1 id="hero-title">${title}</h1>
            </div>
            <div class="hero-count"><strong>${pct(result.sections?.pct || 0)}</strong><span>das seções apuradas</span>
              <${Progress} value=${result.sections?.pct || 0} label="Seções apuradas" tone="is-count"/></div>
          </header>
          <${ShareBar} candidates=${result.candidates}/>
          ${(() => {
            const [a, b] = result.candidates.filter(c => c.votes > 0);
            return a && b && html`<p class="hero-margin">${titleCase(a.name)} ${result.finished ? 'teve' : 'está com'} ${int(a.votes - b.votes)} votos a mais que ${titleCase(b.name)}</p>`;
          })()}
          ${round === 1 && !uf && office === 'presidente' && runoffCandidates(result).length === 2 && html`<p class="hero-note">
            Nenhum candidato passou de 50% dos votos válidos: <b>${runoffCandidates(result).map(c => titleCase(c.name)).join(' e ')}</b> disputam o 2º turno em ${ROUNDS[2].date}.${' '}
            <a href="#/2turno/presidente">Ver 2º turno →</a></p>`}
          <${CandidateGrid} result=${result} office=${office} uf=${uf}/>
          <p class="muted small">Percentuais sobre os votos válidos (sem brancos e nulos), como divulga o TSE.
            ${ibge && (liveResult ? ' Resultado do município consultado ao vivo no TSE.' : ` Cópia dos arquivos oficiais do TSE${packTime ? ` de ${packTime}` : ''}.`)}</p>
          ${ibge && html`<p class="mine-toggle">${myMunicipality === ibge
            ? html`<button class="button is-on" aria-pressed="true" onClick=${() => setMyMunicipality(null)}><${Icon} name="star" size=${15}/> Meu município</button>`
            : html`<button class="button" aria-pressed="false" onClick=${() => setMyMunicipality(ibge)}><${Icon} name="star" size=${15}/> Marcar como meu município</button>`}</p>`}
        </section>
        ${round === 2 && html`<${Comeback} result=${result}/>`}
        <${Section} title="Participação e votos" subtitle=${`Eleitorado, comparecimento e votos em ${placeTitle(route, geo)}`}>
          <${Metrics} result=${result}/>
        </${Section}>
        ${trend.length > 1 && html`<${Section} title="Evolução da apuração" subtitle=${`Boletins do TSE vistos neste navegador desde ${trend[0].time ? trend[0].time.slice(0, 5) + ' ' + trend[0].time.slice(11, 16) : 'a primeira visita'} (guardados só aqui)`}>
          <${TrendChart} points=${trend}/></${Section}>`}`}

    ${uf !== 'ZZ' && html`<div class="split">
      <${MapPanel} geo=${geo} theme=${theme} states=${states} municipalities=${mapMunicipal} uf=${uf} ibge=${ibge}
        onState=${onState} onMunicipality=${onMunicipality} title=${uf ? `Mapa de ${stateName(uf)}` : 'Mapa do Brasil'}
        nameOf=${row => `${titleCase(row.leaderName)} (${row.leaderParty})`}/>
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

    ${!uf && html`<${Section} id="tabela-estados" title="Resultado por estado" subtitle="Abra um estado pelo nome. O exterior aparece separado.">
      <${StatesTable} data=${data} onState=${onState} exterior=${data.zz} staleUfs=${data.staleUfs}/></${Section}>`}

    ${uf && uf !== 'ZZ' && !ibge && (municipalRows.size
      ? html`<${Section} title=${`Municípios de ${stateName(uf)}`} subtitle=${`Cópia dos arquivos oficiais do TSE${packTime ? ` feita às ${packTime}` : ''}`}>
          <${MunicipalitiesTable} rows=${municipalRows} onMunicipality=${onMunicipality}/></${Section}>`
      : packState.loading ? html`<${Loading} text="Carregando municípios…"/>` : null)}
  `;
}


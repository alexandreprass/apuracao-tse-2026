import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { OFFICES, POLL_LIVE_MS, POLL_WAITING_MS, ROUNDS } from '../config.js';
import { brasiliaStamp, compact, int, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { electedCandidates, hasRunoff, mapRow, partyTally, seatsInDispute, raceStatus, regionTotals, runoffCandidates, runoffStates, stateRows, statesWon, unpackMunicipalities } from '../data/analysis.js';
import { stateName, UFS } from '../data/states.js';
import { comebackEstimate } from '../data/estimate.js';
import { readTrend, recordTrend } from '../data/trend.js';
import { noBoletimNotice } from '../data/status.js';
import { useLiveMunicipality, useMunicipalPack, useOffice } from '../hooks/useData.js';
import { useMyMunicipality } from '../hooks/useMyMunicipality.js';
import { Icon } from '../components/Icon.js';
import { MyMunicipality } from '../components/MyMunicipality.js';
import { CandidateCard, Countdown, Loading, Metrics, Notice, PartyBars, Section, StaleTag } from '../components/ui.js';
import { MapPanel } from '../components/MapPanel.js';
import { MunicipalitiesTable, RaceBadge, StatesTable } from '../components/Tables.js';
import { Breadcrumb, placeTitle } from '../components/Place.js';
import { TrendChart } from '../components/TrendChart.js';
import { CountStrip, Dashboard, Scoreboard } from '../components/Dashboard.js';
import { SiteFooter } from '../components/Header.js';

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

/** One line: states won by each candidate (vitórias por estado). */
function StatesWon({ data }) {
  const won = statesWon(data);
  const list = data.br.candidates.filter(c => won[c.n]);
  return html`<p class="won-line"><span class="metric-label">Vitórias por estado</span>
    ${list.map(c => html`<span key=${c.n}><i class="swatch" style=${{ background: partyColor(c.party) }}></i>
      ${titleCase(c.name)} <b>${won[c.n]}</b></span>`)}</p>`;
}

const REGION_SHORT = { Norte: 'N', Nordeste: 'NE', 'Centro-Oeste': 'CO', Sudeste: 'SE', Sul: 'S' };

/** One line: who leads each region (votos por região); the full breakdown opens in the drawer. */
function RegionChips({ data, onOpen }) {
  const regions = regionTotals(data);
  const leaders = data.br.candidates.slice(0, 2);
  return html`<p class="won-line"><span class="metric-label">Votos por região</span>
    ${regions.map(r => {
      const top = leaders.map(c => ({ c, share: r.valid ? (100 * (r.votes[c.n] || 0)) / r.valid : 0 })).sort((a, b) => b.share - a.share)[0];
      return html`<span key=${r.region} title=${`${r.region}: ${titleCase(top.c.name)} ${pct(top.share)}`}><i class="swatch" style=${{ background: partyColor(top.c.party) }}></i>${REGION_SHORT[r.region] || r.region} <b>${pct(top.share, 0)}</b></span>`;
    })}
    <button class="link-button" onClick=${onOpen}>Ver regiões</button></p>`;
}

/** Amber warning in the body when the TSE cannot be read and there is no boletim to show at all. */
export function NoBoletim({ data }) {
  const info = noBoletimNotice(data);
  return info && html`<${Notice} tone=${info.tone} title=${info.title}>${info.text}</${Notice}>`;
}

/** Before the TSE publishes the runoff: who is in it, when it starts, and an automatic check. */
export function RunoffWaiting({ office, uf, first, data, geo, onChooseMunicipality }) {
  const scope = uf ? first?.uf?.[uf] : first?.br;
  const finalists = runoffCandidates(scope);
  const round = ROUNDS[2];
  return html`<div class="runoff-waiting">
    <${NoBoletim} data=${data}/>
    ${office === 'presidente' && geo && html`<${MyMunicipality} geo=${geo} onChoose=${onChooseMunicipality}/>`}
    <${Section} heading="h1" title=${`${OFFICES[office].label} · ${uf ? stateName(uf) : 'Brasil'} · 2º turno`}
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

/** One line under the hero, straight from the TSE "situação": elected in the 1º turno, or who goes to the runoff. */
function RaceNote({ result, round, office, uf }) {
  if (round !== 1 || !result) return null;
  const finalists = runoffCandidates(result);
  const elected = electedCandidates(result);
  const runoffHref = `#/2turno/${office}${uf && !OFFICES[office].federal ? '/' + uf : ''}`;
  if (finalists.length >= 2 && OFFICES[office].rounds.includes(2)) return html`<p class="hero-note">
    Nenhum candidato passou de 50% dos votos válidos: <b>${finalists.map(c => titleCase(c.name)).join(' e ')}</b> disputam o 2º turno em ${ROUNDS[2].date}.${' '}
    <a href=${runoffHref}>Ver 2º turno →</a></p>`;
  if (elected.length) return html`<p class="hero-note is-done">
    ${elected.length === 1 ? html`<b>${titleCase(elected[0].name)}</b> (${elected[0].party}) foi eleito no 1º turno`
      : html`Eleitos: <b>${elected.map(c => `${titleCase(c.name)} (${c.party})`).join(', ')}</b>`}, segundo o TSE.</p>`;
  return null;
}

/** Governors (and, later, senators): every state's race at a glance, in the dashboard shell. */
function StateRacesOverview({ data, round, office, geo, theme, route, crumbs, feed, onChooseMunicipality }) {
  const states = stateRows(data);
  const present = UFS.filter(uf => data.uf[uf]);
  const decided = present.filter(uf => raceStatus(data.uf[uf]) === 'decidido');
  const runoffs = present.filter(uf => raceStatus(data.uf[uf]) === 'segundo-turno');
  const elected = partyTally(data, { electedOnly: true });
  const onState = code => route.go({ uf: code, ibge: null });
  const label = OFFICES[office].plural;
  // Several seats per state (senate, 2 in 2026): seats by party, a dot per elected on the map, no runoff.
  const seats = seatsInDispute(data);
  const multiSeat = seats > present.length;
  const electedCount = elected.reduce((s, r) => s + r.count, 0);
  const strip = multiSeat ? html`<div class="summary-chips">
    <span class="chip is-elected"><b>${electedCount}</b> de ${seats} cadeiras com eleito definido pelo TSE</span>
    <span class="chip"><b>${present.length}</b> estados · ${seats / present.length} vagas em cada</span>
  </div>` : html`<div class="summary-chips">
    <span class="chip is-elected"><b>${decided.length}</b> ${round > 1 ? 'eleitos no 2º turno' : 'eleitos no 1º turno'}</span>
    ${round === 1 && html`<span class="chip is-runoff"><b>${runoffs.length}</b> ${runoffs.length === 1 ? 'estado vai' : 'estados vão'} ao 2º turno (${ROUNDS[2].date})</span>`}
    ${round > 1 && present.length - decided.length > 0 && html`<span class="chip"><b>${present.length - decided.length}</b> em apuração</span>`}
    <span class="chip"><b>${present.length}</b> ${present.length === 27 ? 'estados' : 'estados com disputa'}</span>
  </div>`;
  const map = html`<${MapPanel} compact key=${office + round} geo=${geo} theme=${theme} states=${states} uf=${null} showStatus initialMetric="situacao"
    statusLabel=${round > 1 ? 'em apuração' : '2º turno'} emptyLabel=${round > 1 ? 'Sem 2º turno neste estado' : 'Sem resultados'}
    onState=${onState} title="Mapa por estado" seatLegend=${multiSeat ? elected : null}/>`;
  const scoreboard = multiSeat ? html`<div class="score-card">
    <div class="score-head"><span class="eyebrow">Cadeiras conquistadas por partido · ${seats} em disputa</span></div>
    <${PartyBars} rows=${elected} total=${seats} unit="cadeiras" limit=${12}/>
    <p class="muted small">Eleitos conforme a situação publicada pelo TSE, ${seats / present.length} por estado. Clique num estado para ver todos os candidatos.</p>
  </div>` : html`<div class="score-card">
    <div class="score-head"><span class="eyebrow">${round > 1 ? 'Eleitos no 2º turno por partido' : 'Eleitos no 1º turno por partido'}</span></div>
    <${PartyBars} rows=${elected} unit="cadeiras" limit=${8}/>
    <p class="muted small">Situação de cada candidato conforme o TSE (eleito, 2º turno, não eleito). Clique num estado para ver todos os candidatos.</p>
  </div>`;
  const statesTab = html`
    ${runoffs.length > 0 && html`<div class="runoff-list"><p class="won-line"><span class="metric-label">Disputas de 2º turno · ${ROUNDS[2].date}</span>
        <a href=${`#/2turno/${office}`}>Ver 2º turno →</a></p>
      <ul class="race-list">${runoffs.map(uf => {
        const [a, b] = runoffCandidates(data.uf[uf]);
        return html`<li key=${uf}><a href=${`#/${round}turno/${office}/${uf}`}><b>${uf}</b></a>
          <span><i class="swatch" style=${{ background: partyColor(a.party) }}></i>${titleCase(a.name)} <small>${a.party} ${pct(a.pct)}</small></span>
          <span><i class="swatch" style=${{ background: partyColor(b.party) }}></i>${titleCase(b.name)} <small>${b.party} ${pct(b.pct)}</small></span></li>`;
      })}</ul></div>`}
    <div id="tabela-estados"><${StatesTable} data=${data} onState=${onState} showStatus round=${round} staleUfs=${data.staleUfs}/></div>`;
  const tabs = [
    { id: 'estados', label: 'Estados', content: statesTab },
    { id: 'evolucao', label: 'Evolução', content: html`<p class="muted small">A evolução da apuração fica na página de cada estado.</p>` },
    { id: 'municipio', label: 'Meu município', content: html`<${MyMunicipality} geo=${geo} onChoose=${onChooseMunicipality}/>` },
  ];
  return html`<${Dashboard} title=${`${label} · Brasil · ${ROUNDS[round].label}`} strip=${strip} crumbs=${crumbs} map=${map}
    scoreboard=${scoreboard} tabs=${tabs} footer=${html`<${SiteFooter} feed=${feed} round=${round}/>`}/>`;
}

/** Runoff not published yet for a state office: the states that have one, with their finalists. */
function StateRunoffWaiting({ office, first, data }) {
  if (!first || first.status) return html`<${Loading} text="Carregando as disputas de 2º turno…"/>`;
  const list = runoffStates(first);
  return html`<div class="runoff-waiting">
    <${NoBoletim} data=${data}/>
    <${Section} heading="h1" title=${`${OFFICES[office].plural} · 2º turno`}
      subtitle=${`Votação em ${ROUNDS[2].date}, em ${list.length} estados. A apuração começa às 17h (Brasília).`}>
      <div class="countdown-box"><span>Faltam</span><${Countdown} target=${ROUNDS[2].closesAt}/></div>
      <div class="runoff-grid">${list.map(uf => html`<article class="runoff-state" key=${uf}>
        <h3><a href=${`#/2turno/${office}/${uf}`}>${stateName(uf)}</a> <small>${uf}</small></h3>
        ${runoffCandidates(first.uf[uf]).map(c => html`<${CandidateCard} key=${c.n} placeholder office=${office} uf=${uf}
          candidate=${{ ...c, status: '2º turno', kind: 'segundo-turno' }} note=${`1º turno: ${pct(c.pct)}`}/>`)}
      </article>`)}</div>
      <p class="muted small">Só aparecem os estados em que o TSE indicou 2º turno. Os votos surgem aqui sozinhos quando o TSE publicar o primeiro boletim
        (o site confere a cada ${Math.round(POLL_WAITING_MS / 60_000)} minutos até as urnas fecharem, às 17h de ${ROUNDS[2].date}, e a cada ${Math.round(POLL_LIVE_MS / 1000)} segundos depois disso ou se o TSE não responder).
        Nos outros ${27 - list.length} estados o governador foi eleito no 1º turno.</p>
    </${Section}>
  </div>`;
}

/** A state without a runoff for this office. */
function NoRunoff({ office, uf, first }) {
  const winner = electedCandidates(first?.uf?.[uf])[0];
  return html`<${Notice} heading="h1" title=${`Sem 2º turno em ${stateName(uf)}`}>
    ${winner ? html`${titleCase(winner.name)} (${winner.party}) foi eleito no 1º turno com ${pct(winner.pct)} dos votos válidos, segundo o TSE. ` : ''}
    <a href=${`#/1turno/${office}/${uf}`}>Ver resultado do 1º turno →</a></${Notice}>`;
}

export function MajoritarianView({ route, geo, theme, office: officeState, onChooseMunicipality }) {
  const { round, office, uf, ibge } = route;
  const federal = !!OFFICES[office].federal;
  const [myMunicipality, setMyMunicipality] = useMyMunicipality();
  const [drawer, setDrawer] = useState(null); // municípios, detalhes or regiões, over the panel
  useEffect(() => setDrawer(null), [office, round, uf, ibge]);
  const data = officeState.data;
  const firstRound = useOffice(1, office);
  const packState = useMunicipalPack(round, office, uf);
  const national = data?.br;
  // Municipal files list candidates by number; names, parties and photos come from the race's own result.
  const reference = federal ? national : data?.uf?.[uf];
  const municipalRows = useMemo(() => unpackMunicipalities(packState.value, reference, geo), [packState.value, reference, geo]);
  const runoffList = round > 1 && !federal && firstRound.data && !firstRound.data.status ? runoffStates(firstRound.data) : null;
  const packRow = ibge ? municipalRows.get(ibge) : null;
  // A municipality is read live from the TSE (and polled) when the office itself is live or has no shipped row,
  // but never before the round is published (no requests for files that cannot exist yet).
  const live = useLiveMunicipality(round, office, ibge, !!ibge && !!data && !data.status && (!packRow || data.source === 'tse'));
  const liveResult = live.data?.result;
  const liveError = live.data?.status === 'error' ? live.data : null;

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

  const crumbs = html`<${Breadcrumb} route=${route} geo=${geo} allowExterior=${!!data?.zz} ufs=${runoffList}/>`;
  if (runoffList && uf && !hasRunoff(firstRound.data, uf)) return html`${crumbs}<${NoRunoff} office=${office} uf=${uf} first=${firstRound.data}/>`;
  if (!data) return html`<${Loading}/>`;
  if (data.status) {
    if (round === 2 && (federal || uf)) return html`${crumbs}<${RunoffWaiting} office=${office} uf=${uf === 'ZZ' ? null : uf}
      first=${firstRound.data} data=${data} geo=${geo} onChooseMunicipality=${onChooseMunicipality}/>`;
    if (round === 2) return html`${crumbs}<${StateRunoffWaiting} office=${office} first=${firstRound.data} data=${data}/>`;
    if (data.status === 'error') return html`<${NoBoletim} data=${data}/>`; // the site keeps trying every 30 s
    return html`<${Notice} tone="error" title="Não foi possível carregar os resultados">${data.message} Tente atualizar em instantes.</${Notice}>`;
  }
  if (!federal && !uf) return html`<${StateRacesOverview} data=${data} round=${round} office=${office} geo=${geo} theme=${theme} route=${route}
    crumbs=${crumbs} feed=${officeState.feed} onChooseMunicipality=${onChooseMunicipality}/>`;

  const title = `${OFFICES[office].label} · ${placeTitle(route, geo)} · ${ROUNDS[round].label}`;
  const onState = code => route.go({ uf: code, ibge: null });
  const onMunicipality = id => route.go({ uf: geo.byId.get(id)?.uf, ibge: id });
  const mapUf = uf === 'ZZ' ? null : uf;
  const hasMunicipalTable = !!uf && uf !== 'ZZ' && !ibge;

  const strip = html`<${CountStrip} result=${result} actions=${html`
    ${hasMunicipalTable && html`<button class="button is-small" onClick=${() => setDrawer('municipios')}>Municípios</button>`}
    ${result && html`<button class="button is-small" onClick=${() => setDrawer('detalhes')}>Detalhes</button>`}`}/>`;
  const map = html`<${MapPanel} compact geo=${geo} theme=${theme} states=${states} municipalities=${mapMunicipal} uf=${mapUf} ibge=${ibge}
    onState=${onState} onMunicipality=${onMunicipality} title=${mapUf ? `Mapa de ${stateName(mapUf)}` : 'Mapa do Brasil'}
    nameOf=${row => `${titleCase(row.leaderName)} (${row.leaderParty})`}/>`;

  const scoreboard = !result
    ? (ibge && !live.data && live.feed ? html`<${Loading} text="Buscando o resultado do município no TSE…"/>`
      : liveError ? html`<${Notice} tone="warning" title="Não foi possível consultar o TSE agora">${liveError.message} O site continua tentando.</${Notice}>`
      : html`<${Notice} title="Sem resultado para este lugar">O TSE não publicou resultado de ${OFFICES[office].label.toLowerCase()} aqui${round === 2 ? ' no 2º turno' : ''}.</${Notice}>`)
    : html`<div class=${'score-card' + (scopeStale || muniStale ? ' is-stale' : '')}>
        <div class="score-head">
          <span class="eyebrow">${placeTitle(route, geo)} · ${ROUNDS[round].label}${result.finished ? ' · finalizada' : ' · em apuração'}</span>
          ${scopeStale && html`<${StaleTag} updated=${result.updated} title="O TSE não respondeu na última consulta; mostrando o último boletim recebido"/>`}
          ${muniStale && html`<${StaleTag} updated=${result.updated} text=${`Cópia das ${result.updated?.slice(11, 16) || '—'}: o TSE não respondeu agora`}/>`}
          ${!federal && !ibge && html`<${RaceBadge} result=${result} round=${round}/>`}
          ${ibge && (myMunicipality === ibge
            ? html`<button class="button is-small is-on" aria-pressed="true" onClick=${() => setMyMunicipality(null)}><${Icon} name="star" size=${14}/> Meu município</button>`
            : html`<button class="button is-small" aria-pressed="false" onClick=${() => setMyMunicipality(ibge)}><${Icon} name="star" size=${14}/> Marcar como meu município</button>`)}
        </div>
        <${Scoreboard} result=${result} round=${OFFICES[office].rounds.length > 1 ? round : null} focus=${route.focus}/>
        ${(() => {
          const seats = result.seats || 1;
          const voted = result.candidates.filter(c => c.votes > 0);
          const [a, b] = [voted[seats - 1], voted[seats]];
          if (!a || !b) return null;
          return seats > 1
            ? html`<p class="hero-margin">${titleCase(a.name)} ${result.finished ? 'ficou' : 'está'} com a ${seats}ª vaga por ${int(a.votes - b.votes)} votos à frente de ${titleCase(b.name)}</p>`
            : html`<p class="hero-margin">${titleCase(a.name)} ${result.finished ? 'teve' : 'está com'} ${int(a.votes - b.votes)} votos a mais que ${titleCase(b.name)}</p>`;
        })()}
        ${!ibge && (federal ? !uf : true) && html`<${RaceNote} result=${result} round=${round} office=${office} uf=${uf}/>`}
      </div>`;
  const extra = round === 2 && result && !electedCandidates(result).length && html`<${Comeback} result=${result}/>`;

  const exterior = federal && data.zz && html`<a class="exterior-line" href=${`#/${round}turno/${office}/ZZ`}>
    <b>Exterior</b>${data.zz.candidates.slice(0, 2).map(c => html`<span key=${c.n}><i class="swatch" style=${{ background: partyColor(c.party) }}></i>${titleCase(c.name)} ${pct(c.pct)}</span>`)}
    <small>${pct(data.zz.sections.pct)} apurado</small></a>`;
  const statesTab = html`
    ${hasMunicipalTable && html`<button class="panel-link" onClick=${() => setDrawer('municipios')}>Municípios de ${stateName(uf)}${municipalRows.size ? ` (${int(municipalRows.size)})` : ''} →</button>`}
    ${federal && national && html`<div class="states-summary">
      <${StatesWon} data=${data}/>
      <${RegionChips} data=${data} onOpen=${() => setDrawer('regioes')}/>
    </div>`}
    <div id="tabela-estados"><${StatesTable} data=${data} onState=${onState} staleUfs=${data.staleUfs} showStatus=${!federal} round=${round}/></div>
    ${exterior}`;
  const trendTab = trend.length > 1
    ? html`<p class="muted small">Boletins do TSE vistos neste navegador desde ${trend[0].time ? trend[0].time.slice(0, 5) + ' ' + trend[0].time.slice(11, 16) : 'a primeira visita'} (guardados só aqui).</p><${TrendChart} points=${trend}/>`
    : html`<p class="muted small">A evolução da apuração aparece aqui conforme o TSE publica novos boletins com esta página aberta (guardada só neste navegador).</p>`;
  const tabs = [
    { id: 'estados', label: 'Estados', content: statesTab },
    { id: 'evolucao', label: 'Evolução', content: trendTab },
    { id: 'municipio', label: 'Meu município', content: html`<${MyMunicipality} geo=${geo} onChoose=${onChooseMunicipality}/>` },
  ];
  const drawers = {
    municipios: hasMunicipalTable && { title: `Municípios de ${stateName(uf)}`, content: municipalRows.size
      ? html`<p class="muted small">Cópia dos arquivos oficiais do TSE${packTime ? ` feita às ${packTime}` : ''}.</p><${MunicipalitiesTable} rows=${municipalRows} onMunicipality=${id => { setDrawer(null); onMunicipality(id); }}/>`
      : packState.loading ? html`<${Loading} text="Carregando municípios…"/>` : html`<p class="muted">Sem resultados por município nesta cópia.</p>` },
    detalhes: result && { title: `Participação e votos · ${placeTitle(route, geo)}`, content: html`<${Metrics} result=${result}/>
      <p class="muted small">${result.subJudice
          ? `Percentuais sobre ${int(result.validComputed)} votos: os ${int(result.valid)} válidos mais ${int(result.subJudice)} anulados sub judice (candidatura com recurso pendente), como calcula o TSE.`
          : 'Percentuais sobre os votos válidos (sem brancos e nulos), como divulga o TSE.'}
        ${ibge && (liveResult ? ' Resultado do município consultado ao vivo no TSE.' : ` Cópia dos arquivos oficiais do TSE${packTime ? ` de ${packTime}` : ''}.`)}</p>` },
    regioes: federal && national && { title: 'Votos por região', content: html`<p class="muted small">Percentual dos votos válidos dos dois primeiros colocados em cada região.</p><${RegionBreakdown} data=${data}/>` },
  };
  return html`<${Dashboard} title=${title} strip=${strip} crumbs=${crumbs} map=${map} scoreboard=${scoreboard} extra=${extra}
    leaders=${result?.candidates} tabs=${tabs} drawer=${drawer && drawers[drawer]} onCloseDrawer=${() => setDrawer(null)}
    footer=${html`<${SiteFooter} feed=${officeState.feed} round=${round}/>`}/>`;
}


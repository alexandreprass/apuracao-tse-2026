// Derived figures. Pure functions over normalized results, shared by the views and the tests.
import { partyColor } from '../lib/color.js';
import { titleCase } from '../lib/format.js';
import { REGIONS, regionOf, stateName, UFS } from './states.js';

export const leader = result => (result?.candidates?.[0]?.votes > 0 ? result.candidates[0] : null);

/** Lead of the first over the second, in percentage points of valid votes. */
export function marginPoints(result) {
  const [a, b] = result?.candidates || [];
  if (!a) return 0;
  return a.pct - (b?.pct || 0);
}

/**
 * Where a race stands, read only from the TSE's own "situação" of each candidate (never recalculated):
 * "decidido" (someone elected), "segundo-turno" (runoff) or "em-apuracao" (no situação yet).
 */
export function raceStatus(result) {
  const kinds = (result?.candidates || []).map(c => c.kind);
  if (kinds.includes('eleito')) return 'decidido';
  if (kinds.includes('segundo-turno')) return 'segundo-turno';
  return 'em-apuracao';
}

export const electedCandidates = result => (result?.candidates || []).filter(c => c.kind === 'eleito');

/** States whose race for this office goes to a runoff, according to the TSE. */
export const runoffStates = data => UFS.filter(uf => raceStatus(data?.uf?.[uf]) === 'segundo-turno');

/** Whether a state has a 2º turno page for this office (else the route shows "Sem 2º turno em <UF>"). */
export const hasRunoff = (first, uf) => runoffStates(first).includes(uf);

/** States offered by the 2º turno state picker: the runoff ones (plus the current page, so the picker shows it). */
export const runoffPickerUfs = (ufs, current = null) => UFS.filter(code => !ufs || ufs.includes(code) || code === current);

/** What the map needs to colour and label one place. */
export function mapRow(result, name) {
  if (!result) return { name, empty: true, completion: 0, electorate: 0 };
  const first = leader(result);
  const status = raceStatus(result);
  return {
    status,
    runnerUpName: result.candidates[1]?.name,
    runnerUpParty: result.candidates[1]?.party,
    name,
    empty: !first,
    completion: (result.sections?.pct || 0) / 100,
    electorate: result.electorate,
    leaderName: first?.name,
    leaderParty: first?.party,
    leaderPct: first?.pct || 0,
    margin: marginPoints(result) / 100,
    color: first ? partyColor(first.party) : null,
    finished: result.finished,
  };
}

/** One map row per state; a state whose last request failed keeps its last result and is flagged. */
export const stateRows = data => Object.fromEntries(UFS.map(uf => {
  const row = mapRow(data?.uf?.[uf], stateName(uf));
  if (data?.staleUfs?.includes(uf) || (data?.liveError && data?.uf?.[uf])) {
    row.stale = true;
    row.staleBulletin = data.uf[uf]?.updated?.slice(11, 16) || '';
  }
  return [uf, row];
}));

/** Columns of the shipped municipal files (public/data/tse/<round>/<office>-municipios/<UF>.json). */
export const PACK_FIELDS = ['apuradoPct', 'eleitorado', 'comparecimento', 'validos', 'brancos', 'nulos', 'anuladosSubJudice', '...votos'];

/** One packed municipality row, read by column name (older files have no "anuladosSubJudice" column). */
export function readPackRow(fields, values) {
  const at = name => fields.indexOf(name);
  const get = name => (at(name) >= 0 ? values[at(name)] || 0 : 0);
  const votesAt = at('...votos') >= 0 ? at('...votos') : 6;
  return {
    apurado: get('apuradoPct'), electorate: get('eleitorado'), turnout: get('comparecimento'),
    valid: get('validos'), blank: get('brancos'), nulls: get('nulos'), subJudice: get('anuladosSubJudice'),
    votes: values.slice(votesAt),
  };
}

/**
 * Unpacks the shipped municipal file into result-like objects keyed by IBGE code. `reference` is the
 * race the file belongs to (Brazil for president, the state for governor): it gives names and parties.
 * Shares are over válidos + anulados sub judice, which is how the TSE computes them.
 */
export function unpackMunicipalities(pack, reference, geo) {
  const rows = new Map();
  if (!pack) return rows;
  const fields = pack.fields || PACK_FIELDS.filter(f => f !== 'anuladosSubJudice');
  const byNumber = Object.fromEntries((reference?.candidates || []).map(c => [c.n, c]));
  for (const [ibge, values] of Object.entries(pack.m)) {
    const { apurado, electorate, turnout, valid, blank, nulls, subJudice, votes } = readPackRow(fields, values);
    const base = valid + subJudice;
    const candidates = pack.candidates.map((n, i) => {
      const ref = byNumber[n];
      const c = { n, name: ref?.name || n, party: ref?.party || '', sq: ref?.sq, votes: votes[i] || 0, pct: base ? (100 * (votes[i] || 0)) / base : 0 };
      if (ref?.status) { c.status = ref.status; c.kind = ref.kind; }
      if (ref?.validity) c.validity = ref.validity;
      return c;
    }).sort((a, b) => b.votes - a.votes);
    // The TSE's total of votes includes the ones annulled sub judice (outside válidos, brancos and nulos).
    const total = valid + blank + nulls + subJudice;
    rows.set(ibge, {
      scope: ibge, scopeType: 'mu', name: geo?.byId.get(ibge)?.name || ibge,
      sections: { pct: apurado }, electorate, turnout, turnoutPct: electorate ? (100 * turnout) / electorate : 0,
      abstention: Math.max(0, electorate - turnout), abstentionPct: electorate ? (100 * (electorate - turnout)) / electorate : 0,
      totalVotes: total, valid, validComputed: base, subJudice, validPct: total ? (100 * base) / total : 0, blank, blankPct: total ? (100 * blank) / total : 0,
      null: nulls, nullPct: total ? (100 * nulls) / total : 0, candidates, finished: apurado >= 100,
      updated: pack.updated,
    });
  }
  return rows;
}

/** Sums states into regions: votes per candidate number, valid votes, turnout. */
export function regionTotals(data) {
  const regions = Object.fromEntries(REGIONS.map(r => [r, { region: r, electorate: 0, turnout: 0, valid: 0, votes: {} }]));
  for (const uf of UFS) {
    const result = data?.uf?.[uf];
    if (!result) continue;
    const region = regions[regionOf(uf)];
    region.electorate += result.electorate;
    region.turnout += result.turnout;
    region.valid += result.valid;
    for (const c of result.candidates) region.votes[c.n] = (region.votes[c.n] || 0) + c.votes;
  }
  return REGIONS.map(r => regions[r]);
}

/** States won (or led) per candidate number. */
export function statesWon(data) {
  const won = {};
  for (const uf of UFS) {
    const first = leader(data?.uf?.[uf]);
    if (first) won[first.n] = (won[first.n] || 0) + 1;
  }
  return won;
}

/** Candidates the TSE marked as going to the runoff. */
export const runoffCandidates = result => (result?.candidates || []).filter(c => c.kind === 'segundo-turno');

/** Seats (or leads) per party across states, for governors and senators. */
export function partyTally(data, { electedOnly = false } = {}) {
  const tally = {};
  for (const uf of UFS) {
    const result = data?.uf?.[uf];
    if (!result) continue;
    const picks = electedOnly
      ? result.candidates.filter(c => c.kind === 'eleito')
      : result.candidates.slice(0, Math.max(1, result.seats || 1)).filter(c => c.votes > 0);
    for (const c of picks) tally[c.party] = (tally[c.party] || 0) + 1;
  }
  return Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([party, count]) => ({ party, count, color: partyColor(party) }));
}

/** Federal or state legislature: seats per party summed over the states. */
export function seatsByParty(seatsSummary) {
  const total = {};
  let seats = 0;
  for (const state of Object.values(seatsSummary || {})) {
    seats += state.seats;
    for (const [party, count] of Object.entries(state.elected)) total[party] = (total[party] || 0) + count;
  }
  const parties = Object.entries(total).sort((a, b) => b[1] - a[1]).map(([party, count]) => ({ party, count, color: partyColor(party) }));
  return { seats, filled: parties.reduce((sum, p) => sum + p.count, 0), parties };
}

/** Share (0–100) of valid votes a party's candidate got in a 2022/2026 scope. */
export function partyShare(scope, party) {
  const hit = scope?.candidates?.find(c => c.party === party);
  return hit ? hit.pct : 0;
}

/** Turnout-style metrics of one scope, in a common shape for comparisons. */
export function participation(scope) {
  if (!scope) return null;
  const cast = scope.turnout || 0;
  const total = (scope.valid || 0) + (scope.blank || 0) + (scope.null || 0);
  return {
    electorate: scope.electorate,
    turnout: cast,
    turnoutPct: scope.electorate ? (100 * cast) / scope.electorate : 0,
    abstentionPct: scope.electorate ? (100 * (scope.abstention ?? scope.electorate - cast)) / scope.electorate : 0,
    validPct: total ? (100 * scope.valid) / total : 0,
    blankPct: total ? (100 * scope.blank) / total : 0,
    nullPct: total ? (100 * scope.null) / total : 0,
  };
}

/** Plain-text summary for sharing. */
export function shareText(result, title) {
  const top = (result?.candidates || []).slice(0, 3).filter(c => c.votes > 0)
    .map(c => `${titleCase(c.name)} (${c.party}) ${c.pct.toFixed(2).replace('.', ',')}%`).join(' · ');
  const counted = result?.sections ? ` — ${result.sections.pct.toFixed(2).replace('.', ',')}% das seções apuradas` : '';
  return `${title}: ${top || 'aguardando resultados'}${counted}. Fonte: TSE.`;
}

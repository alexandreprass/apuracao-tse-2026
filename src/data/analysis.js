// Derived figures. Pure functions over normalized results, shared by the views and the tests.
import { partyColor } from '../lib/color.js';
import { REGIONS, regionOf, stateName, UFS } from './states.js';

export const leader = result => (result?.candidates?.[0]?.votes > 0 ? result.candidates[0] : null);

/** Lead of the first over the second, in percentage points of valid votes. */
export function marginPoints(result) {
  const [a, b] = result?.candidates || [];
  if (!a) return 0;
  return a.pct - (b?.pct || 0);
}

/** What the map needs to colour and label one place. */
export function mapRow(result, name) {
  if (!result) return { name, empty: true, completion: 0, electorate: 0 };
  const first = leader(result);
  return {
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

export const stateRows = data => Object.fromEntries(UFS.map(uf => [uf, mapRow(data?.uf?.[uf], stateName(uf))]));

/** Unpacks the shipped municipal file into result-like objects keyed by IBGE code. */
export function unpackMunicipalities(pack, national, geo) {
  const rows = new Map();
  if (!pack) return rows;
  const byNumber = Object.fromEntries((national?.candidates || []).map(c => [c.n, c]));
  for (const [ibge, values] of Object.entries(pack.m)) {
    const [apurado, electorate, turnout, valid, blank, nulls, ...votes] = values;
    const candidates = pack.candidates.map((n, i) => ({
      n, name: byNumber[n]?.name || n, party: byNumber[n]?.party || '', sq: byNumber[n]?.sq,
      votes: votes[i] || 0, pct: valid ? (100 * (votes[i] || 0)) / valid : 0,
    })).sort((a, b) => b.votes - a.votes);
    const total = valid + blank + nulls;
    rows.set(ibge, {
      scope: ibge, scopeType: 'mu', name: geo?.byId.get(ibge)?.name || ibge,
      sections: { pct: apurado }, electorate, turnout, turnoutPct: electorate ? (100 * turnout) / electorate : 0,
      abstention: Math.max(0, electorate - turnout), abstentionPct: electorate ? (100 * (electorate - turnout)) / electorate : 0,
      totalVotes: total, valid, validPct: total ? (100 * valid) / total : 0, blank, blankPct: total ? (100 * blank) / total : 0,
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
    .map(c => `${c.name} (${c.party}) ${c.pct.toFixed(2).replace('.', ',')}%`).join(' · ');
  const counted = result?.sections ? ` — ${result.sections.pct.toFixed(2).replace('.', ',')}% das seções apuradas` : '';
  return `${title}: ${top || 'aguardando resultados'}${counted}. Fonte: TSE.`;
}

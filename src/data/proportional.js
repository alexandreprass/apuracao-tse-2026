// Deputies (federal and state): proportional races. Who is elected, by quociente partidário ("Eleito por QP")
// or by média, and who is suplente comes ONLY from the TSE "situação" of each candidate. The site never
// recalculates the quociente eleitoral, the quociente partidário nor the sobras: those numbers are shown as
// information, as the TSE publishes them. Pure functions, tested in Node.
import { federationColor, partyColor } from '../lib/parties.js';
import { normalize } from '../lib/format.js';
import { stateName, UFS } from './states.js';

export const electedOf = result => (result?.candidates || []).filter(c => c.kind === 'eleito');
export const suplentesOf = result => (result?.candidates || []).filter(c => c.kind === 'suplente');
/** The TSE has not published the situação yet (count running or reopened): nobody is shown as elected. */
export const statusPending = result => !!result && !electedOf(result).length && (result.candidates || []).some(c => c.kind === 'pendente');

/**
 * Party (sigla) → its federation, from the TSE data: a state result (federations + each party's "nfed")
 * or the office summary in index.json ({ number: { acronym, name, parties: [siglas] } }).
 */
export function federationMap(source) {
  const map = new Map();
  if (Array.isArray(source?.federations)) {
    for (const f of source.federations) {
      const members = (source.parties || []).filter(p => p.fed === f.number).map(p => p.party);
      for (const sigla of members) map.set(sigla, { number: f.number, acronym: f.acronym, name: f.name, parties: members });
    }
  } else {
    for (const [number, f] of Object.entries(source?.federations || {})) for (const sigla of f.parties) map.set(sigla, { number, ...f });
  }
  return map;
}

/** The list a party runs in: its federation (one list for the seats) or the party itself. */
export function listOf(party, fedMap, byFederation = true) {
  const f = byFederation ? fedMap.get(party) : null;
  return f
    ? { key: 'fed' + f.number, party: f.acronym, federation: f.name, color: federationColor(party) }
    : { key: party, party, federation: null, color: partyColor(party) };
}

/** Rows for PartyBars from { party: seats }: by federation (default) or by party, biggest first. */
export function groupSeats(counts, fedMap, byFederation = true) {
  const rows = new Map();
  for (const [party, count] of Object.entries(counts || {})) {
    if (!count) continue;
    const list = listOf(party, fedMap, byFederation);
    const row = rows.get(list.key) || { ...list, count: 0, parties: {} };
    row.count += count;
    row.parties[party] = (row.parties[party] || 0) + count;
    rows.set(list.key, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.party.localeCompare(b.party));
}

export const countByParty = list => list.reduce((acc, c) => { acc[c.party] = (acc[c.party] || 0) + 1; return acc; }, {});

/** Seats of one state, from the TSE situação of its candidates. */
export const stateSeats = (result, byFederation = true) => groupSeats(countByParty(electedOf(result)), federationMap(result), byFederation);

/** Brasil: seats summed over the states, from the small summary in index.json (no state file needed). */
export function nationalSeats(summary, byFederation = true) {
  const counts = {};
  let seats = 0, filled = 0;
  const states = Object.keys(summary?.seats || {});
  for (const uf of states) {
    const s = summary.seats[uf];
    seats += s.seats;
    for (const [party, n] of Object.entries(s.elected || {})) { counts[party] = (counts[party] || 0) + n; filled += n; }
  }
  const pending = states.filter(uf => Object.values(summary.seats[uf].elected || {}).reduce((a, b) => a + b, 0) < summary.seats[uf].seats);
  return { seats, filled, states: states.length, pending, rows: groupSeats(counts, federationMap(summary), byFederation) };
}

/** One row per state for the map and the table: the party with the biggest bench (ties listed). */
export function seatStateRows(summary) {
  return Object.fromEntries(UFS.map(uf => {
    const s = summary?.seats?.[uf];
    const entries = Object.entries(s?.elected || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const filled = entries.reduce((sum, [, n]) => sum + n, 0);
    if (!s || !entries.length) return [uf, { name: stateName(uf), empty: true, completion: 0, electorate: 0, seats: s?.seats || 0, filled: 0, finished: !!s?.finished }];
    const [party, count] = entries[0];
    return [uf, {
      name: stateName(uf), empty: false, leaderParty: party, leaderName: party, count, seats: s.seats, filled,
      tied: entries.filter(([, n]) => n === count).map(([p]) => p),
      leaderPct: (100 * count) / s.seats, margin: 1, color: partyColor(party),
      completion: s.finished ? 1 : 0, finished: s.finished, updated: s.updated, elected: [],
    }];
  }));
}

/** Search one state's candidates by name (accents ignored), number (prefix) or party/federation sigla. */
export function searchCandidates(result, query, limit = 60) {
  const q = normalize(query).trim();
  if (!q || !result) return [];
  const list = result.candidates || [];
  if (/^\d+$/.test(q)) return list.filter(c => c.n.startsWith(q)).slice(0, limit);
  const fedMap = federationMap(result);
  const lists = q.length >= 2 ? new Set(list.map(c => c.party).filter(p => normalize(p) === q || normalize(fedMap.get(p)?.acronym) === q
    || (q.length >= 3 && normalize(p).startsWith(q)))) : new Set();
  return list.filter(c => lists.has(c.party) || normalize(c.name).includes(q)).slice(0, limit);
}

/** Suplentes grouped by list (federation or party), lists with seats first; inside, the TSE order (votes). */
export function suplentesByList(result) {
  const fedMap = federationMap(result);
  const seats = Object.fromEntries(stateSeats(result).map(r => [r.key, r.count]));
  const groups = new Map();
  for (const c of suplentesOf(result)) {
    const list = listOf(c.party, fedMap);
    const g = groups.get(list.key) || { ...list, seats: seats[list.key] || 0, candidates: [] };
    g.candidates.push(c);
    groups.set(list.key, g);
  }
  return [...groups.values()].sort((a, b) => b.seats - a.seats || b.candidates.length - a.candidates.length);
}

/** Votes per list as the TSE publishes them (nominal + legenda), with the seats; information only. */
export function listVotes(result, byFederation = true) {
  const fedMap = federationMap(result);
  const seats = Object.fromEntries(stateSeats(result, byFederation).map(r => [r.key, r.count]));
  const rows = new Map();
  for (const p of result?.parties || []) {
    const list = listOf(p.party, fedMap, byFederation);
    const row = rows.get(list.key) || { ...list, votes: 0, legend: 0, seats: seats[list.key] || 0 };
    row.votes += p.votes; row.legend += p.legend || 0;
    rows.set(list.key, row);
  }
  return [...rows.values()].sort((a, b) => b.seats - a.seats || b.votes - a.votes);
}

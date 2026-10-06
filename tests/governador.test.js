import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeResult } from '../src/data/normalize.js';
import { electedCandidates, mapRow, partyTally, raceStatus, readPackRow, runoffCandidates, runoffStates, stateRows, unpackMunicipalities } from '../src/data/analysis.js';
import { statusFill, MAP_EMPTY, partyBadge, partyFill } from '../src/lib/color.js';
import * as c from '../scripts/palette/colorlib.mjs';
import { UFS } from '../src/data/states.js';
import { parseHash } from '../src/hooks/useRoute.js';
import { findEntries, searchableCandidates } from '../src/components/SearchDialog.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// Official TSE file: governor, 1º turno, Rio de Janeiro (resultados.tse.jus.br, generated 05/10/2026).
const rawRJ = json('./fixtures/rj-c0003-e006259-u.json');
const bundle = json('../public/data/tse/1/governador.json');
const presidents = json('../public/data/tse/1/presidente.json');

// What the TSE published on 05/10/2026: 20 governors elected in the 1º turno, 7 runoffs on 25/10.
const RUNOFF_UFS = ['AC', 'AM', 'DF', 'ES', 'RJ', 'RN', 'TO'];

test('governor file: situação comes straight from the TSE, finalists (e:"s") are not "elected"', () => {
  const r = normalizeResult(rawRJ);
  assert.equal(r.election, '6259');
  assert.equal(r.office, '3');
  const [first, second, ...rest] = r.candidates;
  assert.deepEqual([first.name, first.status, first.kind, first.elected], ['DOUGLAS RUAS', '2º turno', 'segundo-turno', false]);
  assert.deepEqual([second.name, second.status, second.kind, second.elected], ['EDUARDO PAES', '2º turno', 'segundo-turno', false]);
  assert.ok(rest.every(c => c.kind === 'nao-eleito' && !c.elected));
  assert.equal(raceStatus(r), 'segundo-turno');
  assert.deepEqual(runoffCandidates(r).map(c => c.n), ['22', '55']);
  assert.deepEqual(electedCandidates(r), []);
  assert.equal(first.vice, 'FERNANDA LOUBACK');
  assert.equal(first.coalition, 'RIO REAL');
});

test('governor file: shares are the TSE ones, over válidos + anulados sub judice', () => {
  const r = normalizeResult(rawRJ);
  assert.equal(r.valid, 8394627);
  assert.equal(r.subJudice, 274411);
  assert.equal(r.validComputed, 8669038);
  assert.equal(r.validComputed, r.valid + r.subJudice);
  assert.equal(r.valid + r.subJudice + r.blank + r.null, r.totalVotes);
  assert.equal(r.candidates.reduce((s, c) => s + c.votes, 0), r.validComputed);
  const subJudice = r.candidates.filter(c => c.validity === 'Anulado sub judice');
  assert.deepEqual(subJudice.map(c => c.name), ['GAROTINHO']);
  assert.equal(subJudice[0].votes, r.subJudice);
  for (const c of r.candidates) assert.ok(Math.abs(c.pct - (100 * c.votes) / r.validComputed) < 1e-6, c.name);
  assert.equal(r.candidates[0].pct.toFixed(2), '49.27');
  assert.deepEqual(r, bundle.uf.RJ, 'the shipped copy equals the official file');
});

test('elected / runoff mapping for every state, as published by the TSE', () => {
  assert.deepEqual(Object.keys(bundle.uf).sort(), [...UFS].sort());
  assert.deepEqual(runoffStates(bundle), RUNOFF_UFS);
  for (const uf of UFS) {
    const r = bundle.uf[uf];
    const elected = r.candidates.filter(c => c.kind === 'eleito');
    const finalists = runoffCandidates(r);
    for (const c of r.candidates) assert.equal(c.elected, c.kind === 'eleito', `${uf} ${c.name}`);
    for (const c of r.candidates) assert.ok(['eleito', 'segundo-turno', 'nao-eleito'].includes(c.kind), `${uf} ${c.name}: ${c.status}`);
    if (RUNOFF_UFS.includes(uf)) {
      assert.equal(raceStatus(r), 'segundo-turno', uf);
      assert.equal(elected.length, 0, uf);
      assert.deepEqual(finalists.map(c => c.n), r.candidates.slice(0, 2).map(c => c.n), `${uf}: finalists are the two most voted`);
    } else {
      assert.equal(raceStatus(r), 'decidido', uf);
      assert.equal(elected.length, 1, uf);
      assert.equal(elected[0].n, r.candidates[0].n, uf);
      assert.equal(finalists.length, 0, uf);
    }
  }
  assert.equal(partyTally(bundle, { electedOnly: true }).reduce((s, p) => s + p.count, 0), 20);
});

test('every state adds up: votes, turnout and shares', () => {
  for (const uf of UFS) {
    const r = bundle.uf[uf];
    assert.equal(r.finished, true, uf);
    assert.equal(r.sections.pct, 100, uf);
    assert.equal(r.turnout + r.abstention, r.electorate, `${uf} turnout + abstenção`);
    assert.equal(r.valid + r.subJudice + r.blank + r.null, r.totalVotes, `${uf} válidos + sub judice + brancos + nulos`);
    assert.equal(r.turnout, r.totalVotes, `${uf} comparecimento = votos`);
    assert.equal(r.candidates.reduce((s, c) => s + c.votes, 0), r.validComputed, `${uf} soma dos candidatos`);
    const subJudice = r.candidates.filter(c => /sub judice/i.test(c.validity || '')).reduce((s, c) => s + c.votes, 0);
    assert.equal(subJudice, r.subJudice, `${uf} sub judice`);
    for (const c of r.candidates) assert.ok(Math.abs(c.pct - (100 * c.votes) / r.validComputed) < 1e-6, `${uf} ${c.name}`);
    assert.ok(Math.abs(r.candidates.reduce((s, c) => s + c.pct, 0) - 100) < 1e-6, `${uf} soma dos %`);
  }
});

test('municipal files add up to each state and reproduce the TSE shares', () => {
  for (const uf of UFS) {
    const pack = json(`../public/data/tse/1/governador-municipios/${uf}.json`);
    const state = bundle.uf[uf];
    assert.deepEqual(pack.candidates, state.candidates.map(c => c.n), uf);
    const rows = [...unpackMunicipalities(pack, state, null).values()];
    for (const key of ['electorate', 'turnout', 'valid', 'subJudice', 'blank', 'null', 'validComputed', 'totalVotes']) {
      assert.equal(rows.reduce((s, r) => s + r[key], 0), state[key], `${uf} ${key}`);
    }
    for (const c of state.candidates) {
      assert.equal(rows.reduce((s, r) => s + r.candidates.find(x => x.n === c.n).votes, 0), c.votes, `${uf} ${c.name}`);
    }
    for (const r of rows) {
      assert.equal(r.candidates.reduce((s, c) => s + c.votes, 0), r.validComputed, `${uf} ${r.scope}`);
      // Situação and sub judice flags travel with the candidate.
      for (const c of r.candidates) assert.equal(c.kind, state.candidates.find(x => x.n === c.n).kind);
    }
  }
  // Rio de Janeiro (city): Paes 1.730.683 of 3.235.174 válidos + 60.118 sub judice = 52,519867739% on the TSE.
  const rio = unpackMunicipalities(json('../public/data/tse/1/governador-municipios/RJ.json'), bundle.uf.RJ, null).get('3304557');
  const paes = rio.candidates.find(c => c.n === '55');
  assert.equal(paes.votes, 1730683);
  assert.ok(Math.abs(paes.pct - 52.51986774) < 1e-6);
  // Old files (presidente) have no sub judice column and still read correctly.
  const old = readPackRow(['apuradoPct', 'eleitorado', 'comparecimento', 'validos', 'brancos', 'nulos', '...votos'], [100, 10, 8, 6, 1, 1, 4, 2]);
  assert.deepEqual([old.valid, old.subJudice, old.votes], [6, 0, [4, 2]]);
});

test('national map (design): party colour of the winner or leader; runoffs marked by status, not by colour', () => {
  const rows = stateRows(bundle);
  assert.equal(rows.SP.status, 'decidido');
  assert.equal(rows.RJ.status, 'segundo-turno');
  for (const theme of ['dark', 'light']) {
    // Same strongest party colour whether the race was decided or goes to the runoff…
    assert.deepEqual(statusFill(rows.RJ, theme), statusFill({ ...rows.RJ, status: 'decidido' }, theme));
    assert.deepEqual(statusFill(rows.RJ, theme), partyFill(rows.RJ.leaderParty, 1, theme));
    assert.equal(statusFill(mapRow(null, 'X'), theme).fill, MAP_EMPTY[theme]);
  }
});

test('"Eleito no Nº turno" badge: party colour with the palette ink reads at 4.5:1 for every party', () => {
  for (const name of Object.keys(bundle.uf).flatMap(uf => bundle.uf[uf].candidates.map(x => x.party))) {
    const { fill, ink } = partyBadge(name);
    assert.ok(c.contrast(fill, ink) >= 4.5, `${name}: ${c.contrast(fill, ink).toFixed(2)}`);
  }
});

test('routes: governor pages per state, 2º turno for governors but not senators', () => {
  const r = parseHash('#/2turno/governador/RJ');
  assert.deepEqual([r.round, r.office, r.uf], [2, 'governador', 'RJ']);
  assert.deepEqual(Object.values(parseHash('#/1turno/governador/BA/2927408')).slice(1, 5), [1, 'governador', 'BA', '2927408']);
  assert.equal(parseHash('#/2turno/senador/SP').office, 'presidente');
});

test('search finds governor candidates with their state, and states', () => {
  const candidates = searchableCandidates(presidents, bundle);
  const geo = { municipalities: [] };
  const hit = findEntries(geo, candidates, 'tarcisio').find(e => e.type === 'candidate');
  assert.deepEqual([hit.office, hit.uf, hit.n, hit.kind], ['governador', 'SP', '10', 'eleito']);
  const paes = findEntries(geo, candidates, 'eduardo paes').find(e => e.type === 'candidate');
  assert.deepEqual([paes.office, paes.uf, paes.kind], ['governador', 'RJ', 'segundo-turno']);
  assert.ok(findEntries(geo, candidates, 'lula').some(e => e.office === 'presidente'));
  assert.ok(findEntries(geo, candidates, 'bahia').some(e => e.type === 'state' && e.id === 'BA'));
  assert.ok(findEntries(geo, candidates, 'to').some(e => e.type === 'state' && e.id === 'TO'));
});

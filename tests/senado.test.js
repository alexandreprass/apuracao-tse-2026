import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeResult } from '../src/data/normalize.js';
import { electedCandidates, hasRunoff, mapRow, partyTally, raceStatus, seatsInDispute, stateRows } from '../src/data/analysis.js';
import { UFS } from '../src/data/states.js';
import { OFFICES } from '../src/config.js';
import { parseHash } from '../src/hooks/useRoute.js';
import { findEntries, searchableCandidates } from '../src/components/SearchDialog.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// Official TSE file: senador, 1º turno, São Paulo (resultados.tse.jus.br).
const rawSP = json('./fixtures/sp-c0005-e006259-u.json');
const bundle = json('../public/data/tse/1/senador.json');

/** Every candidate object of a raw TSE file (they carry the vote count "vap"). */
const rawCandidates = node => (Array.isArray(node) ? node.flatMap(rawCandidates)
  : node && typeof node === 'object' ? ('vap' in node && 'n' in node ? [node] : Object.values(node).flatMap(rawCandidates)) : []);

test('senado: 2 elected per state, straight from the TSE status, never recalculated from votes', () => {
  const sp = normalizeResult(rawSP);
  assert.equal(sp.seats, 2);
  const elected = electedCandidates(sp).map(c => c.n);
  assert.equal(elected.length, 2);
  assert.ok(sp.candidates.every(c => c.elected === (c.kind === 'eleito')));
  // Give the last candidate the most votes: the elected stay the ones the TSE marked.
  const tampered = structuredClone(rawSP);
  const all = rawCandidates(tampered);
  const last = all.find(c => !elected.includes(String(c.n)) && Number(c.vap) >= 0);
  last.vap = '999999999';
  const after = normalizeResult(tampered);
  assert.equal(after.candidates[0].n, String(last.n), 'the tampered candidate now has the most votes');
  assert.deepEqual(electedCandidates(after).map(c => c.n).sort(), [...elected].sort());
  // Shipped copy: all 27 states, exactly 2 elected each, no runoff anywhere.
  assert.deepEqual(Object.keys(bundle.uf).sort(), [...UFS].sort());
  for (const uf of UFS) {
    const r = bundle.uf[uf];
    assert.equal(r.seats, 2, uf);
    assert.equal(electedCandidates(r).length, 2, uf);
    assert.equal(raceStatus(r), 'decidido', uf);
    assert.equal(mapRow(r, uf).elected.length, 2, uf);
  }
});

test('senado: no 2º turno route (the round does not exist for this office)', () => {
  assert.deepEqual(OFFICES.senador.rounds, [1]);
  const r = parseHash('#/2turno/senador/SP');
  assert.notEqual(r.office, 'senador');
  assert.equal(parseHash('#/1turno/senador/SP').office, 'senador');
  assert.ok(UFS.every(uf => !hasRunoff(bundle, uf)));
});

test('senado: seat summary per party adds up to the 54 seats in dispute', () => {
  const tally = partyTally(bundle, { electedOnly: true });
  assert.equal(seatsInDispute(bundle), 54);
  assert.equal(tally.reduce((s, r) => s + r.count, 0), 54);
  // Same count as the elected listed per state.
  const byParty = {};
  for (const uf of UFS) for (const c of electedCandidates(bundle.uf[uf])) byParty[c.party] = (byParty[c.party] || 0) + 1;
  assert.deepEqual(Object.fromEntries(tally.map(r => [r.party, r.count])), byParty);
  // Map: the colour is the most voted candidate's party; the two elected ride along for the dots.
  const rows = stateRows(bundle);
  assert.equal(rows.SP.leaderParty, bundle.uf.SP.candidates[0].party);
  assert.equal(rows.SP.seats, 2);
});

test('senado: search finds senator candidates and opens their state', () => {
  const candidates = searchableCandidates(null, null, bundle);
  const [winner] = electedCandidates(bundle.uf.SP);
  const found = findEntries({ municipalities: [] }, candidates, winner.name.toLowerCase());
  assert.ok(found.some(e => e.type === 'candidate' && e.office === 'senador' && e.uf === 'SP' && e.n === winner.n));
});

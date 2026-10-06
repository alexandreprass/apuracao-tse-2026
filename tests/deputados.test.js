import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeResult } from '../src/data/normalize.js';
import { electedOf, federationMap, nationalSeats, searchCandidates, seatStateRows, stateSeats, statusPending, suplentesByList, listVotes } from '../src/data/proportional.js';
import { loadProportional, resetCaches } from '../src/data/source.js';
import { UFS } from '../src/data/states.js';
import { parseHash } from '../src/hooks/useRoute.js';
import { ENABLED_OFFICES, OFFICES } from '../src/config.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// Official TSE file: deputado federal, 1º turno, Acre (resultados.tse.jus.br).
const rawAC = json('./fixtures/ac-c0006-e006259-u.json');
const index = json('../public/data/tse/1/index.json');
const copy = (office, uf) => json(`../public/data/tse/1/${office}/${uf}.json`).result;
const rawCandidates = node => (Array.isArray(node) ? node.flatMap(rawCandidates)
  : node && typeof node === 'object' ? ('vap' in node && 'n' in node ? [node] : Object.values(node).flatMap(rawCandidates)) : []);

test('deputados: eleitos come only from the TSE situação; tampered votes do not change who is elected', () => {
  const ac = normalizeResult(rawAC, { compact: true });
  const elected = electedOf(ac).map(c => c.n).sort();
  assert.equal(elected.length, ac.seats);
  assert.ok(ac.candidates.every(c => c.elected === /^eleito/i.test(c.status)));
  const tampered = structuredClone(rawAC);
  for (const c of rawCandidates(tampered)) c.vap = elected.includes(String(c.n)) ? '1' : '999999';
  const again = normalizeResult(tampered, { compact: true });
  assert.deepEqual(electedOf(again).map(c => c.n).sort(), elected);
  // The kind of election (por QP, por média) is the TSE text, kept as is.
  assert.ok(electedOf(ac).every(c => ['Eleito por QP', 'Eleito por média'].includes(c.status)));
  assert.ok(ac.quotient > 0, 'quociente eleitoral shown as published');
});

test('deputados: seats per state equal the vacancies (every finished UF), and the Brasil summary adds to 513 / 1059', () => {
  for (const office of ['deputado-federal', 'deputado-estadual']) {
    const summary = index.offices[office];
    for (const uf of UFS) {
      const r = copy(office, uf);
      const total = stateSeats(r).reduce((s, row) => s + row.count, 0);
      if (r.finished) assert.equal(total, r.seats, `${office} ${uf}`);
      else assert.ok(total <= r.seats);
      assert.equal(summary.seats[uf].seats, r.seats);
    }
    const national = nationalSeats(summary);
    assert.equal(national.seats, office === 'deputado-federal' ? 513 : 1059);
    assert.equal(national.rows.reduce((s, r) => s + r.count, 0), national.filled);
    // A state the TSE reopened (no situação yet) is listed as pending, never filled in by the site.
    for (const uf of national.pending) assert.ok(!copy(office, uf).finished);
  }
});

test('deputados: a count without situação shows no elected (no recalculation)', () => {
  const pending = { candidates: [{ n: '1', party: 'PL', votes: 10, kind: 'pendente', status: '' }], seats: 1, parties: [], federations: [] };
  assert.equal(statusPending(pending), true);
  assert.deepEqual(stateSeats(pending), []);
});

test('deputados: federations group as one list, with the federation colour', () => {
  const sp = copy('deputado-federal', 'SP');
  const fed = federationMap(sp);
  assert.equal(fed.get('PT').acronym, fed.get('PCDOB').acronym);
  const byFed = stateSeats(sp, true), byParty = stateSeats(sp, false);
  const pt = byFed.find(r => r.parties.PT);
  assert.equal(pt.key, 'fed101');
  assert.equal(pt.count, Object.values(pt.parties).reduce((a, b) => a + b, 0));
  assert.equal(byFed.reduce((s, r) => s + r.count, 0), byParty.reduce((s, r) => s + r.count, 0));
  assert.ok(byParty.every(r => !r.federation));
  // The Brasil summary groups the same way, from index.json only.
  assert.ok(nationalSeats(index.offices['deputado-federal']).rows.some(r => r.key === 'fed101'));
  // Suplentes and votes per list follow the same lists.
  assert.ok(suplentesByList(sp).some(g => g.key === 'fed101'));
  const votes = listVotes(sp);
  assert.equal(votes.reduce((s, r) => s + r.votes + r.legend, 0), sp.valid);
});

test('deputados: search by name (accents ignored), number prefix and party', () => {
  const sp = copy('deputado-federal', 'SP');
  assert.ok(searchCandidates(sp, 'tábata').some(c => c.name === 'TABATA AMARAL'));
  assert.ok(searchCandidates(sp, '4040').every(c => c.n.startsWith('4040')));
  const pl = searchCandidates(sp, 'pl', 999);
  assert.ok(pl.length > 10 && pl.every(c => c.party === 'PL' || c.name.toLowerCase().includes('pl')));
  assert.ok(searchCandidates(sp, 'psol/rede', 999).some(c => c.party === 'REDE'));
  assert.deepEqual(searchCandidates(sp, '  '), []);
});

test('deputados: no 2º turno route, and both offices are enabled', () => {
  for (const office of ['deputado-federal', 'deputado-estadual']) {
    assert.deepEqual(OFFICES[office].rounds, [1]);
    assert.ok(ENABLED_OFFICES.includes(office));
    assert.equal(parseHash(`#/2turno/${office}/SP`).office, 'presidente');
    assert.equal(parseHash(`#/1turno/${office}/SP`).office, office);
  }
});

test('deputados: the map colours each state by its biggest bench; a state without situação is empty', () => {
  const rows = seatStateRows(index.offices['deputado-federal']);
  assert.equal(rows.SP.leaderParty, 'PL');
  assert.ok(rows.AC.tied.length >= 1 && rows.AC.tied.includes(rows.AC.leaderParty));
  for (const uf of nationalSeats(index.offices['deputado-federal']).pending) if (!Object.keys(index.offices['deputado-federal'].seats[uf].elected).length) assert.equal(rows[uf].empty, true);
});

test('deputados: opening a state downloads only that state (lazy), never the others', async () => {
  resetCaches();
  const asked = [];
  globalThis.fetch = async url => {
    asked.push(String(url));
    if (String(url).endsWith('manifest.json')) return { status: 200, ok: true, json: async () => ({ rounds: { 1: { offices: ['deputado-federal'] } } }) };
    return { status: 200, ok: true, json: async () => ({ result: normalizeResult(rawAC, { compact: true }) }) };
  };
  const data = await loadProportional(1, 'deputado-federal', 'AC');
  assert.equal(data.source, 'local');
  assert.equal(data.result.seats, 8);
  const files = asked.filter(u => !u.endsWith('manifest.json'));
  assert.equal(files.length, 1);
  assert.match(files[0], /tse\/1\/deputado-federal\/AC\.json/);
});

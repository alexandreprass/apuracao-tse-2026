import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mineOffices, mineRow, finalistNumbers } from '../src/data/mine.js';
import { runoffStates, unpackMunicipalities } from '../src/data/analysis.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const governors = json('../public/data/tse/1/governador.json');
const presidents = json('../public/data/tse/1/presidente.json');
const pack = (office, uf) => json(`../public/data/tse/1/${office}-municipios/${uf}.json`);

test('Meu município: Governador row only in the states with a governor runoff (from the TSE status)', () => {
  for (const uf of runoffStates(governors)) assert.deepEqual(mineOffices(uf, governors), ['presidente', 'governador']);
  assert.equal(runoffStates(governors).length, 7);
  assert.deepEqual(mineOffices('SP', governors), ['presidente']);
  // No 1º turno copy (still loading or unreadable): Presidente only, never a guess.
  assert.deepEqual(mineOffices('RJ', null), ['presidente']);
  assert.deepEqual(mineOffices('RJ', { status: 'error' }), ['presidente']);
});

test('Meu município: before the count, both rows show the city 1º turno result of the two finalists', () => {
  const rio = '3304557'; // Rio de Janeiro (IBGE)
  const gov = unpackMunicipalities(pack('governador', 'RJ'), governors.uf.RJ, null).get(rio);
  const pres = unpackMunicipalities(pack('presidente', 'RJ'), presidents.br, null).get(rio);
  const g = mineRow({ published: false, firstRow: gov, numbers: finalistNumbers(governors.uf.RJ) });
  const p = mineRow({ published: false, firstRow: pres, numbers: finalistNumbers(presidents.br) });
  assert.equal(g.phase, 'first');
  assert.deepEqual(g.candidates.map(c => c.n).sort(), finalistNumbers(governors.uf.RJ).sort());
  assert.ok(g.candidates.every(c => c.pct > 0 && c.party));
  assert.equal(p.phase, 'first');
  assert.equal(p.candidates.length, 2);
});

test('Meu município: live first, then the shipped copy, last good boletim flagged as stale, errors never "not published"', () => {
  const result = { candidates: [{ n: '22', votes: 60, pct: 60, party: 'PL' }, { n: '55', votes: 40, pct: 40, party: 'PSD' }], sections: { pct: 37.5 }, updated: '25/10/2026 19:30:00' };
  const copy = { ...result, sections: { pct: 10 } };
  assert.deepEqual([mineRow({ published: true, live: { result }, copyRow: copy }).phase, mineRow({ published: true, live: { result }, copyRow: copy }).apurado], ['live', 37.5]);
  assert.equal(mineRow({ published: true, live: { status: 'not-published' }, copyRow: copy }).phase, 'copy');
  const stale = mineRow({ published: true, live: { result, liveError: 'timeout' } });
  assert.equal(stale.stale, true);
  assert.equal(stale.apurado, 37.5);
  assert.equal(mineRow({ published: true, live: { status: 'error' } }).phase, 'error');
  assert.equal(mineRow({ published: true, live: { status: 'not-published' } }).phase, 'not-published');
  assert.equal(mineRow({ published: false }).phase, 'waiting');
});

test('Meu município: compact rows stack and never scroll sideways at 390px', () => {
  const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  assert.match(css, /\.mine-rows \{ display: grid;/);
  assert.match(css, /\.mine-finalists span \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; \}/);
});

test('Meu município: while the files load the row says "carregando", never "aguardando o TSE" (aprimoramento item 5)', () => {
  assert.equal(mineRow({ published: false, firstRow: undefined, loading: true }).phase, 'loading');
  assert.equal(mineRow({ published: false, firstRow: undefined, loading: false }).phase, 'waiting');
  assert.equal(mineRow({ published: true, live: null, loading: true }).phase, 'loading');
  const src = readFileSync(new URL('../src/components/MyMunicipality.js', import.meta.url), 'utf8');
  assert.match(src, /loading: \(\) => 'carregando…'/);
});

test('Meu município is on the 2º turno waiting page of Governador too, not only Presidente (aprimoramento item 4)', () => {
  const src = readFileSync(new URL('../src/views/Majoritarian.js', import.meta.url), 'utf8');
  const waiting = src.slice(src.indexOf('export function RunoffWaiting'), src.indexOf('\n}\n', src.indexOf('export function RunoffWaiting')));
  assert.match(waiting, /MyMunicipality/);
  assert.doesNotMatch(waiting, /office === 'presidente' && geo && html`<\$\{MyMunicipality\}/);
  // RJ (a governor runoff) gets both rows.
  assert.deepEqual(mineOffices('RJ', governors), ['presidente', 'governador']);
});

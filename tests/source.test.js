import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadMunicipality, loadOffice, resetCaches, signature } from '../src/data/source.js';

const rjFixture = JSON.parse(readFileSync(new URL('./fixtures/rj-c0003-e006259-u.json', import.meta.url), 'utf8'));
/** The RJ governor file as if it were the 2º turno, generated at `hg`. */
const rjRunoff = hg => ({ ...rjFixture, t: '2', ele: '6260', dg: '25/10/2026', hg, tf: 'n' });
const ok = body => ({ status: 200, ok: true, json: async () => body });
const firstRoundCopy = ok({ uf: { RJ: { candidates: [{ kind: 'segundo-turno' }] }, SP: { candidates: [{ kind: 'eleito' }] } } });

// The browser path, with fetch replaced: TSE requests and requests for the shipped copy.
function mockFetch({ tse, local }) {
  globalThis.fetch = async url => {
    const handler = String(url).startsWith('https://resultados.tse.jus.br') ? tse : local;
    return handler(String(url));
  };
}
const status = code => ({ status: code, ok: code < 400, json: async () => ({}) });
const configWithout2ndRound = { status: 200, ok: true, json: async () => ({ pl: [{ cd: '3220', e: [{ cd: '6257' }, { cd: '6259' }] }] }) };

test('2º turno for governors: a TSE that cannot be reached is an error, never "not published yet"', async () => {
  // CORS or network failure makes fetch reject; the shipped copy has no 2º turno (404).
  mockFetch({ tse: async () => { throw new TypeError('Failed to fetch'); }, local: async () => status(404) });
  const data = await loadOffice(2, 'governador');
  assert.equal(data.status, 'error');
});

test('2º turno for governors: before the TSE publishes it, the page waits', async () => {
  mockFetch({ tse: async url => (url.endsWith('ele-c.json') ? configWithout2ndRound : status(404)), local: async () => status(404) });
  const data = await loadOffice(2, 'governador');
  assert.equal(data.status, 'not-published');
});

test('2º turno for governors: once published, only the runoff states are requested', async () => {
  resetCaches();
  const asked = [];
  mockFetch({
    tse: async url => {
      if (url.endsWith('ele-c.json')) return { status: 200, ok: true, json: async () => ({ pl: [{ e: [{ cd: '6260' }] }] }) };
      asked.push(url.match(/dados\/(\w\w)\//)[1]);
      return status(404);
    },
    local: async url => (url.includes('tse/1/governador.json')
      ? { status: 200, ok: true, json: async () => ({ uf: { RJ: { candidates: [{ kind: 'segundo-turno' }] }, SP: { candidates: [{ kind: 'eleito' }] } } }) }
      : status(404)),
  });
  const data = await loadOffice(2, 'governador');
  assert.deepEqual(asked, ['rj']);
  assert.equal(data.status, 'not-published');
});

test('município ao vivo: falha de rede vira erro, e 404 continua sendo "não publicado"', async () => {
  resetCaches();
  const codes = ok({ '3304557': ['60011', 'RJ'] });
  mockFetch({ tse: async () => { throw new TypeError('Failed to fetch'); }, local: async () => codes });
  assert.equal((await loadMunicipality(2, 'governador', '3304557')).status, 'error');
  mockFetch({ tse: async () => status(404), local: async () => codes });
  assert.equal((await loadMunicipality(2, 'governador', '3304557')).status, 'not-published');
});

test('2º turno for governors: a state that fails mid-count keeps its last good result, flagged as stale', async () => {
  resetCaches();
  let rjDown = false;
  mockFetch({
    tse: async url => {
      if (!url.includes('/rj/')) return status(404);
      if (rjDown) throw new TypeError('Failed to fetch');
      return ok(rjRunoff('19:30:00'));
    },
    local: async url => (url.includes('tse/1/governador.json') ? firstRoundCopy : status(404)),
  });
  const first = await loadOffice(2, 'governador');
  assert.equal(first.source, 'tse');
  assert.ok(first.uf.RJ);
  rjDown = true;
  const second = await loadOffice(2, 'governador', first);
  assert.notEqual(second.status, 'not-published');
  assert.equal(second.uf.RJ, first.uf.RJ, 'o último boletim bom continua na tela');
  assert.ok(second.stale || second.staleUfs?.includes('RJ'), 'a tela avisa que o dado está desatualizado');
});

test('2º turno for governors: the same boletim keeps the same objects and signature (nothing is redrawn)', async () => {
  resetCaches();
  let hg = '19:30:00';
  mockFetch({
    tse: async url => (url.includes('/rj/') ? ok(rjRunoff(hg)) : status(404)),
    local: async url => (url.includes('tse/1/governador.json') ? firstRoundCopy : status(404)),
  });
  const first = await loadOffice(2, 'governador');
  const again = await loadOffice(2, 'governador', first);
  assert.equal(again.uf.RJ, first.uf.RJ);
  assert.equal(signature(again), signature(first));
  hg = '19:31:00';
  const changed = await loadOffice(2, 'governador', again);
  assert.notEqual(signature(changed), signature(again));
});

test('2º turno for governors: with two races, only the state that failed is marked as stale', async () => {
  resetCaches();
  let amDown = false;
  const twoRaces = ok({ uf: { RJ: { candidates: [{ kind: 'segundo-turno' }] }, AM: { candidates: [{ kind: 'segundo-turno' }] } } });
  mockFetch({
    tse: async url => {
      if (url.includes('/am/') && amDown) throw new TypeError('Failed to fetch');
      return url.includes('/rj/') || url.includes('/am/') ? ok(rjRunoff('19:30:00')) : status(404);
    },
    local: async url => (url.includes('tse/1/governador.json') ? twoRaces : status(404)),
  });
  const first = await loadOffice(2, 'governador');
  amDown = true;
  const second = await loadOffice(2, 'governador', first);
  assert.deepEqual(second.staleUfs, ['AM']);
  assert.equal(second.uf.AM, first.uf.AM);
  assert.ok(!second.liveError);
});

test('2º turno for governors: before the polls close, a waiting page asks the TSE for one state only', async () => {
  resetCaches();
  const asked = [];
  const twoRaces = ok({ uf: { RJ: { candidates: [{ kind: 'segundo-turno' }] }, AM: { candidates: [{ kind: 'segundo-turno' }] } } });
  mockFetch({
    tse: async url => { asked.push(url); return status(404); },
    local: async url => (url.includes('tse/1/governador.json') ? twoRaces : status(404)),
  });
  const data = await loadOffice(2, 'governador');
  assert.equal(data.status, 'not-published');
  assert.equal(asked.length, 1);
});

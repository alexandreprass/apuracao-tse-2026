import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeResult, num, parseTseDate, statusKind } from '../src/data/normalize.js';
import { leader, mapRow, marginPoints, regionTotals, runoffCandidates, shareText, statesWon, unpackMunicipalities } from '../src/data/analysis.js';
import { photoUrl, pollsClosed, POLL_LIVE_MS, POLL_WAITING_MS, ROUNDS, tseProgressUrl, tseResultUrl } from '../src/config.js';
import { UFS } from '../src/data/states.js';
import { canonicalHash, fixAddress, parseHash, toHash } from '../src/hooks/useRoute.js';
import { isFinished, pollDelay } from '../src/data/feed.js';
import { titleCase } from '../src/lib/format.js';
import { comebackEstimate } from '../src/data/estimate.js';
import { readTrend, recordTrend, MAX_SERIES } from '../src/data/trend.js';
import { ufOfIbge } from '../src/data/states.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// Official TSE file for president, 1º turno, Brasil (resultados.tse.jus.br, 05/10/2026 12:51:05).
const raw = json('./fixtures/br-c0001-e006257-u.json');
const bundle = json('../public/data/tse/1/presidente.json');

test('TSE numbers in Brazilian format are parsed', () => {
  assert.equal(num('47,027772356'), 47.027772356);
  assert.equal(num('119300788'), 119300788);
  assert.equal(num(''), 0);
  assert.equal(parseTseDate('05/10/2026 12:51:05').toISOString(), '2026-10-05T15:51:05.000Z');
  assert.equal(statusKind('2º turno'), 'segundo-turno');
  assert.equal(statusKind('Eleito por QP', true), 'eleito');
  assert.equal(statusKind('Não eleito'), 'nao-eleito');
  assert.equal(statusKind('Suplente'), 'suplente');
});

test('the official national file normalizes to the published totals', () => {
  const r = normalizeResult(raw);
  assert.equal(r.election, '6257');
  assert.equal(r.updated, '05/10/2026 12:51:05');
  assert.equal(r.finished, true);
  assert.equal(r.electorate, 158745502);
  assert.equal(r.turnout, 125275835);
  assert.equal(r.abstention, 33469244);
  assert.equal(r.valid, 119300788);
  assert.equal(r.blank, 2300798);
  assert.equal(r.null, 3674249);
  assert.equal(r.valid + r.blank + r.null, r.totalVotes);
  assert.equal(r.sections.pct, 100);
  assert.equal(r.candidates.length, 12);
  assert.equal(r.candidates.reduce((s, c) => s + c.votes, 0), r.valid);
  const [first, second] = r.candidates;
  assert.deepEqual([first.n, first.votes, first.pct.toFixed(2), first.kind], ['22', 56104503, '47.03', 'segundo-turno']);
  assert.equal(first.elected, false, 'runoff finalists come with e:"s" but are not elected');
  assert.equal(r.validComputed, r.valid);
  assert.equal(r.subJudice, 0);
  assert.deepEqual(r.federations.map(f => [f.number, f.parties]), [['101', ['13', '43', '65']]]);
  assert.equal(r.parties.find(p => p.party === 'PT').fed, '101');
  assert.deepEqual([second.n, second.votes, second.pct.toFixed(2), second.kind], ['13', 53879538, '45.16', 'segundo-turno']);
  assert.equal(second.vice, 'GERALDO ALCKMIN');
  assert.deepEqual(runoffCandidates(r).map(c => c.n), ['22', '13']);
  assert.deepEqual(r, bundle.br, 'the shipped copy equals the official file');
});

test('the shipped copy is consistent: states plus abroad add up to Brazil', () => {
  assert.deepEqual(Object.keys(bundle.uf).sort(), [...UFS].sort());
  const scopes = [...Object.values(bundle.uf), bundle.zz];
  for (const key of ['electorate', 'turnout', 'valid', 'blank', 'null']) {
    assert.equal(scopes.reduce((s, r) => s + r[key], 0), bundle.br[key], key);
  }
  for (const c of bundle.br.candidates) {
    const sum = scopes.reduce((s, r) => s + (r.candidates.find(x => x.n === c.n)?.votes || 0), 0);
    assert.equal(sum, c.votes, c.name);
  }
  const won = statesWon(bundle);
  assert.equal(Object.values(won).reduce((a, b) => a + b, 0), 27);
  const regions = regionTotals(bundle);
  assert.equal(regions.reduce((s, r) => s + r.valid, 0) + bundle.zz.valid, bundle.br.valid);
});

test('municipal results add up to each state', () => {
  for (const uf of ['SP', 'BA', 'DF', 'RR']) {
    const pack = json(`../public/data/tse/1/presidente-municipios/${uf}.json`);
    const rows = unpackMunicipalities(pack, bundle.br, null);
    const valid = [...rows.values()].reduce((s, r) => s + r.valid, 0);
    assert.equal(valid, bundle.uf[uf].valid, uf);
    for (const r of rows.values()) assert.equal(r.candidates.reduce((s, c) => s + c.votes, 0), r.valid);
  }
});

test('map rows carry leader, margin and colour', () => {
  const row = mapRow(bundle.uf.BA, 'Bahia');
  assert.equal(row.leaderParty, 'PT');
  assert.ok(Math.abs(row.margin * 100 - marginPoints(bundle.uf.BA)) < 1e-9);
  assert.match(row.color, /^#[0-9a-f]{6}$/);
  assert.equal(mapRow(null, 'X').empty, true);
  assert.equal(leader({ candidates: [{ votes: 0 }] }), null);
  assert.match(shareText(bundle.br, 'Presidente · Brasil'), /Flavio Bolsonaro \(PL\) 47,03%/);
});

test('TSE URLs follow the published layout', () => {
  assert.equal(tseResultUrl(1, 'presidente', 'br'), 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json');
  assert.equal(tseResultUrl(2, 'presidente', 'sp71072'), 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json');
  assert.equal(tseResultUrl(1, 'governador', 'ac'), 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/ac/ac-c0003-e006259-u.json');
  assert.equal(tseResultUrl(1, 'deputado-estadual', 'df'), 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/df/df-c0008-e006259-u.json');
  assert.equal(tseProgressUrl(1, 'presidente'), 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-e006257-ab.json');
  assert.equal(photoUrl(2, 'presidente', '280002542548'), 'https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/280002542548.jpeg');
});

test('routes round-trip through the URL hash', () => {
  assert.deepEqual(parseHash(''), { page: 'resultados', round: 1, office: 'presidente', uf: null, ibge: null, focus: null });
  const r = parseHash('#/2turno/presidente/SP/3550308');
  assert.deepEqual([r.round, r.office, r.uf, r.ibge], [2, 'presidente', 'SP', '3550308']);
  assert.equal(toHash(r), '#/2turno/presidente/SP/3550308');
  assert.equal(parseHash('#/1turno/presidente/ZZ').uf, 'ZZ');
  assert.equal(parseHash('#/1turno/governador/ZZ').uf, null, 'abroad only votes for president');
  assert.deepEqual([parseHash('#/2turno/senador').round, parseHash('#/2turno/senador').office], [1, 'senador'], 'no senate runoff: its own 1º turno');
  assert.equal(parseHash('#/sobre').page, 'sobre');
  assert.equal(parseHash('#/1turno/presidente/XX').uf, null);
  assert.doesNotThrow(() => parseHash('#/1turno/%E0/SP'));
  assert.equal(parseHash('#/1turno/%E0/SP').uf, 'SP');
  assert.doesNotThrow(() => parseHash('#/2turno/presidente/SP/%E0%A4%A'));
  const wrong = parseHash('#/1turno/presidente/RJ/3550308');
  assert.deepEqual([wrong.uf, wrong.ibge], ['SP', '3550308'], 'the municipality decides the state');
  assert.equal(parseHash('#/1turno/presidente/SP/9999999').ibge, null);
  assert.equal(ufOfIbge('3550308'), 'SP');
});

test('proportional file: federations, sub judice votes and the base of the percentages', () => {
  const ac = normalizeResult(json('./fixtures/ac-c0006-e006259-u.json'), { compact: true });
  assert.equal(ac.valid, 462485, 'valid votes (vv)');
  assert.equal(ac.subJudice, 6127, 'annulled sub judice (vansj)');
  assert.equal(ac.validComputed, 468612, 'vv + vansj (vvc), the base the TSE uses for percentages');
  assert.equal(ac.validComputed, ac.valid + ac.subJudice);
  for (const c of ac.candidates.filter(c => c.votes > 0).slice(0, 20)) {
    assert.ok(Math.abs(c.pct - (100 * c.votes) / ac.validComputed) < 1e-6, `${c.name}: TSE percentage over vvc`);
  }
  assert.equal(ac.federations.length, 5);
  assert.equal(ac.parties.find(p => p.party === 'PT').fed, '101');
  assert.equal(ac.candidates.filter(c => c.elected).length, 8, '8 seats, elected from the TSE status');
  assert.ok(ac.candidates.filter(c => c.elected).every(c => c.kind === 'eleito'));
});

test('"dá pra virar?": gap and remaining-votes estimate', () => {
  const r = {
    finished: false, sections: { total: 1000, counted: 800 }, turnout: 240000, valid: 228000,
    candidates: [{ n: '13', name: 'A', votes: 120000 }, { n: '22', name: 'B', votes: 108000 }],
  };
  const e = comebackEstimate(r);
  assert.equal(e.gap, 12000);
  assert.equal(e.sectionsLeft, 200);
  assert.equal(e.turnoutPerSection, 300);
  assert.equal(e.remainingTurnout, 60000);
  assert.equal(e.remainingValid, 57000);
  assert.ok(Math.abs(e.neededShare - (100 * (57000 + 12000)) / 114000) < 1e-9);
  assert.equal(e.reachable, true);
  assert.equal(comebackEstimate({ ...r, finished: true }), null, 'no estimate once the count is over');
  assert.equal(comebackEstimate({ ...r, sections: { total: 1000, counted: 0 } }), null);
  assert.equal(comebackEstimate({ ...r, candidates: [{ n: '13', votes: 200000 }, { n: '22', votes: 28000 }] }).reachable, false);
});

test('evolution is kept in the browser, one point per boletim, bounded', () => {
  const mem = new Map();
  const store = { get: (k, f = null) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)), remove: k => mem.delete(k) };
  const at = (pct, time) => ({ sections: { pct }, updated: time, candidates: [{ n: '13', name: 'A', party: 'PT', pct: 50.1 }, { n: '22', name: 'B', party: 'PL', pct: 49.9 }] });
  recordTrend('k', at(10, '25/10/2026 18:00:00'), store);
  recordTrend('k', at(10, '25/10/2026 18:00:00'), store);
  recordTrend('k', at(20, '25/10/2026 18:10:00'), store);
  recordTrend('k', at(15, '25/10/2026 18:05:00'), store); // older boletim: ignored
  assert.deepEqual(readTrend('k', store).map(p => p.counted), [10, 20]);
  mem.set('apuracao:evolucao:v1:k', '"garbage"');
  assert.deepEqual(readTrend('k', store), []);
  for (let i = 0; i < MAX_SERIES + 5; i++) recordTrend('place' + i, at(1, 'x'), store);
  assert.equal(store.get('apuracao:evolucao:v1:index').length, MAX_SERIES);
  assert.equal(store.get('apuracao:evolucao:v1:place0'), null);
});

test('evolution: a new boletim with the same % apurado replaces the last point instead of duplicating it', () => {
  const mem = new Map();
  const store = { get: (k, f = null) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)), remove: k => mem.delete(k) };
  const at = (pct, time, a = 50.1) => ({ sections: { pct }, updated: time, candidates: [{ n: '13', name: 'A', party: 'PT', pct: a }, { n: '22', name: 'B', party: 'PL', pct: 100 - a }] });
  recordTrend('k', at(10, '25/10/2026 18:00:00'), store);
  recordTrend('k', at(20, '25/10/2026 18:10:00', 50.3), store);
  recordTrend('k', at(20, '25/10/2026 18:11:00', 50.4), store); // same %, later boletim: replaces
  let list = readTrend('k', store);
  assert.deepEqual(list.map(p => [p.counted, p.time]), [[10, '25/10/2026 18:00:00'], [20, '25/10/2026 18:11:00']]);
  assert.equal(list[1].shares[0].pct, 50.4, 'the newer shares are kept');
  recordTrend('k', at(20, '25/10/2026 18:09:00', 49), store); // same %, earlier boletim: ignored
  recordTrend('k', at(15, '25/10/2026 18:12:00', 49), store); // fewer sections: ignored
  list = readTrend('k', store);
  assert.deepEqual(list.map(p => [p.counted, p.time, p.shares[0].pct]), [[10, '25/10/2026 18:00:00', 50.1], [20, '25/10/2026 18:11:00', 50.4]]);
  recordTrend('k', at(30, '25/10/2026 18:20:00'), store);
  assert.deepEqual(readTrend('k', store).map(p => p.counted), [10, 20, 30], 'moving % still adds points');
});

test('names: Roman numerals without breaking accented names', () => {
  assert.equal(titleCase('IVÂNIA SILVA'), 'Ivânia Silva');
  assert.equal(titleCase('JOÃO II'), 'João II');
  assert.equal(titleCase('PEDRO IV DA SILVA'), 'Pedro IV da Silva');
  assert.equal(titleCase('IIARA'), 'Iiara');
  assert.equal(titleCase("SANT'ANA"), "Sant'Ana");
  assert.equal(titleCase('MARIA D’ÁVILA'), 'Maria D’Ávila');
});

test('polling: live counts every 30 s, waiting rounds less often, finished counts never', () => {
  const live = { source: 'tse', br: { finished: false }, uf: {} };
  assert.equal(isFinished(live), false);
  assert.equal(pollDelay(live, 2), 30000);
  assert.equal(pollDelay({ ...live, br: { finished: true } }, 2), null);
  assert.equal(pollDelay({ source: 'local', br: { finished: true }, uf: {} }, 1), null);
  const waiting = { status: 'not-published', uf: {} };
  assert.equal(pollDelay(waiting, 2, new Date('2026-10-10T12:00:00-03:00').getTime()), 5 * 60000);
  assert.equal(pollDelay(waiting, 2, new Date('2026-10-25T16:30:00-03:00').getTime()), 5 * 60000, 'election day, polls still open');
  assert.equal(pollDelay(waiting, 2, new Date('2026-10-25T21:00:00-03:00').getTime()), 30000, 'polls closed, nothing yet');
  assert.equal(pollDelay({ status: 'error', uf: {} }, 2), 30000, 'TSE unreachable: every 30 s, never stops');
  assert.equal(pollDelay({ ...live, br: { finished: true }, liveError: 'x', stale: true }, 2), 30000);
  assert.equal(pollDelay({ ...live, br: { finished: true }, staleUfs: ['SP'] }, 2), 30000);
});

test('2º turno, before the first boletim: every 5 min until the polls close at 17h (Brasília), every 30 s from then on', () => {
  const waiting = { status: 'not-published', uf: {} };
  const close = new Date(ROUNDS[2].closesAt).getTime();
  assert.equal(close, Date.parse('2026-10-25T20:00:00Z'), 'cutoff comes from the round config: 25/10/2026 17:00 in Brasília');
  assert.equal(POLL_WAITING_MS, 300000);
  assert.equal(POLL_LIVE_MS, 30000);
  for (const [at, ms] of [
    ['2026-10-06T11:00:00-03:00', 300000], ['2026-10-25T08:00:00-03:00', 300000],
    ['2026-10-25T16:00:00-03:00', 300000], [close - 1, 300000],
    [close, 30000], ['2026-10-25T17:00:01-03:00', 30000], ['2026-10-25T23:30:00-03:00', 30000], ['2026-10-27T10:00:00-03:00', 30000],
  ]) {
    const now = typeof at === 'number' ? at : new Date(at).getTime();
    assert.equal(pollDelay(waiting, 2, now), ms, new Date(now).toISOString());
    assert.equal(pollsClosed(2, now), ms === 30000);
  }
  // A TSE failure is retried every 30 s whatever the time.
  assert.equal(pollDelay({ status: 'error', uf: {} }, 2, new Date('2026-10-10T12:00:00-03:00').getTime()), 30000);
});

test('a municipality from another state rewrites the address to its real state, without a new history entry', () => {
  assert.equal(canonicalHash('#/1turno/presidente/SP/2927408'), '#/1turno/presidente/BA/2927408');
  assert.equal(canonicalHash('#/2turno/presidente/sp/2927408?c=13'), '#/2turno/presidente/BA/2927408?c=13');
  assert.equal(canonicalHash('#/1turno/presidente/BA/2927408'), null, 'already right');
  assert.equal(canonicalHash('#/1turno/presidente/SP'), null);
  assert.equal(canonicalHash('#/1turno/presidente/SP/9999999'), null, 'unknown code: dropped by the parser, address untouched');
  assert.equal(canonicalHash('#/sobre'), null);
  const calls = [];
  const hist = { state: { k: 1 }, replaceState: (...args) => calls.push(['replace', ...args]), pushState: (...args) => calls.push(['push', ...args]) };
  const loc = { pathname: '/apuracao-tse-2026/', search: '?fonte=tse', hash: '#/1turno/presidente/SP/2927408' };
  assert.equal(fixAddress(loc, hist), '#/1turno/presidente/BA/2927408');
  assert.deepEqual(calls, [['replace', { k: 1 }, '', '/apuracao-tse-2026/?fonte=tse#/1turno/presidente/BA/2927408']]);
  assert.equal(parseHash('#/1turno/presidente/BA/2927408').uf, 'BA');
  calls.length = 0;
  assert.equal(fixAddress({ ...loc, hash: '#/1turno/presidente/BA/2927408' }, hist), null);
  assert.deepEqual(calls, [], 'nothing to fix: no history call');
});

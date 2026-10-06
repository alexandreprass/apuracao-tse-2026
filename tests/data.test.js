import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeResult, num, parseTseDate, statusKind } from '../src/data/normalize.js';
import { leader, mapRow, marginPoints, regionTotals, runoffCandidates, shareText, statesWon, unpackMunicipalities } from '../src/data/analysis.js';
import { photoUrl, tseProgressUrl, tseResultUrl } from '../src/config.js';
import { UFS } from '../src/data/states.js';
import { parseHash, toHash } from '../src/hooks/useRoute.js';
import { isFinished, pollDelay } from '../src/hooks/useData.js';

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
  assert.match(shareText(bundle.br, 'Presidente · Brasil'), /FLAVIO BOLSONARO \(PL\) 47,03%/);
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
  assert.equal(parseHash('#/2turno/senador').office, 'presidente', 'no senate runoff');
  assert.equal(parseHash('#/sobre').page, 'sobre');
  assert.equal(parseHash('#/1turno/presidente/XX').uf, null);
});

test('polling: live counts every 30 s, waiting rounds less often, finished counts never', () => {
  const live = { source: 'tse', br: { finished: false }, uf: {} };
  assert.equal(isFinished(live), false);
  assert.equal(pollDelay(live, 2), 30000);
  assert.equal(pollDelay({ ...live, br: { finished: true } }, 2), null);
  assert.equal(pollDelay({ source: 'local', br: { finished: true }, uf: {} }, 1), null);
  const waiting = { status: 'not-published', uf: {} };
  assert.equal(pollDelay(waiting, 2, new Date('2026-10-10T12:00:00-03:00').getTime()), 5 * 60000);
  assert.equal(pollDelay(waiting, 2, new Date('2026-10-25T16:30:00-03:00').getTime()), 60000);
  assert.equal(pollDelay(waiting, 2, new Date('2026-10-25T21:00:00-03:00').getTime()), 60000);
});

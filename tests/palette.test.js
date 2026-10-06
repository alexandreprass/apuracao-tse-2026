// Central palette (src/lib/parties.js): re-checks the design guarantees from the published hexes,
// independently of the generator (same checks as design-review/palette/verify.mjs), plus the wiring
// in the site: every party in the shipped TSE data has an entry and no party colour is hardcoded.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as c from '../scripts/palette/colorlib.mjs';
import * as P from '../src/lib/parties.js';
import { MAP_EMPTY, marginColor, partyColor } from '../src/lib/color.js';
import { MAP_THEMES } from '../src/map/mapTheme.js';

const ROOT = new URL('..', import.meta.url).pathname;
const json = path => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const TOP = ['PL', 'PT', 'UNIÃO', 'PSD', 'PP', 'REPUBLICANOS', 'MDB', 'PODE', 'PSB', 'PSOL', 'PSDB', 'NOVO'];
const ALL = [...Object.entries(P.PARTIES), ...P.FALLBACK.map((p, i) => ['fallback' + i, p])];
const THEMES = ['light', 'dark'];

test('paleta: CIEDE2000 confere com os pares de Sharma (2005)', () => {
  const pairs = [[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, -1, 2], [50, 0, 0], 2.3669], [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0], [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082], [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644]];
  for (const [a, b, expected] of pairs) assert.ok(Math.abs(c.de2000Lab(a, b) - expected) < 1e-4);
  assert.equal(c.contrast('#ffffff', '#000000').toFixed(2), '21.00');
});

test('paleta: tinta de cada degrau é a de maior contraste e passa 4,5:1; degrau forte passa 3:1 no fundo do mapa', () => {
  for (const [k, p] of ALL) for (const th of THEMES) p.ramp[th].forEach((hex, i) => {
    const white = c.contrast(hex, '#ffffff'), dark = c.contrast(hex, '#141821');
    assert.equal(p.ink[th][i], white >= dark ? '#ffffff' : '#141821', `${k} ${th}[${i}] tinta`);
    assert.ok(Math.max(white, dark) >= 4.5, `${k} ${th}[${i}] ${hex} tinta < 4,5:1`);
    if (i === 3) assert.ok(c.contrast(hex, P.MAP_BG[th]) >= 3, `${k} ${th}[3] ${hex} < 3:1 no fundo`);
  });
});

test('paleta: ΔE00 ≥ 15 entre os 12 principais', () => {
  for (let i = 0; i < TOP.length; i++) for (let j = i + 1; j < TOP.length; j++) {
    const d = c.de2000(P.PARTIES[TOP[i]].base, P.PARTIES[TOP[j]].base);
    assert.ok(d >= 15, `${TOP[i]} × ${TOP[j]} ΔE ${d.toFixed(1)}`);
  }
});

/** Every 1º × 2º pair of a majoritarian race in the shipped data (any state), plus the pairs the team asked for. */
function headToHead() {
  const pairs = new Set(['UNIÃO|PP', 'PSD|MDB', 'PL|PT']);
  const add = r => { const [a, b] = r?.candidates || []; if (a && b && P.partyKey(a.party) !== P.partyKey(b.party)) pairs.add([P.partyKey(a.party), P.partyKey(b.party)].sort().join('|')); };
  const pres = json('public/data/tse/1/presidente.json');
  [pres.br, pres.zz, ...Object.values(pres.uf)].forEach(add);
  for (const office of ['governador', 'senador']) Object.values(json(`public/data/tse/1/${office}.json`).uf).forEach(add);
  return [...pairs].map(p => p.split('|'));
}

test('paleta: ΔE00 ≥ 10 com protanopia e deuteranopia em todo par de disputa dos dados', () => {
  const pairs = headToHead();
  assert.ok(pairs.length > 20);
  for (const [a, b] of pairs) for (const type of ['protan', 'deutan']) {
    const d = c.de2000(c.cvd(P.partyColor(a), type), c.cvd(P.partyColor(b), type));
    assert.ok(d >= 10, `${a} × ${b} ${type} ΔE ${d.toFixed(1)}`);
  }
});

test('paleta: nenhum partido usa o âmbar de aviso nem o cinza de "sem apuração"', () => {
  for (const [k, p] of ALL) {
    for (const hex of Object.values(P.RESERVED.amber)) assert.ok(c.de2000(p.base, hex) >= 15, `${k} perto do âmbar ${hex}`);
    for (const hex of Object.values(P.RESERVED.gray)) assert.ok(c.de2000(p.base, hex) >= 10, `${k} perto do cinza ${hex}`);
  }
  // The site's own "sem apuração" grey and map background are the ones the palette was checked against.
  for (const hex of Object.values(MAP_EMPTY)) assert.ok(Object.values(P.RESERVED.gray).includes(hex), `cinza ${hex} fora dos reservados`);
  assert.equal(MAP_THEMES.dark.background, P.MAP_BG.dark);
  assert.equal(MAP_THEMES.light.background, P.MAP_BG.light);
});

test('paleta: grafias, números e federações', () => {
  assert.equal(P.party('PCDOB'), P.party('PC do B'));
  assert.equal(P.party('PCdoB'), P.party(65));
  assert.equal(P.party('2222').number, 22);
  assert.equal(P.partyKey('PMB'), null, 'a chave antiga PMB saiu (é DEMOCRATA)');
  assert.equal(P.partyColor('XYZ'), P.partyColor('xyz'));
  assert.equal(P.federationColor('PV'), P.PARTIES.PT.base);
  assert.equal(P.federationColor('PP'), P.PARTIES['UNIÃO'].base);
  assert.equal(P.federationColor('PL'), P.PARTIES.PL.base);
});

test('paleta: marginColor devolve o degrau da paleta e recusa cor fora dela', () => {
  for (const p of Object.values(P.PARTIES)) for (const th of THEMES) for (const m of [0, .1, .2, .5]) {
    assert.equal(marginColor(p.base, m, th), P.partyFill(p.acronym, m, th).fill);
  }
  assert.throws(() => marginColor('#123456', .1, 'dark'), /fora da paleta/);
});

test('paleta: todo partido dos arquivos do TSE tem cor própria (nenhum cai no fallback)', () => {
  const seen = new Set();
  for (const office of ['presidente', 'governador', 'senador']) {
    const data = json(`public/data/tse/1/${office}.json`);
    for (const r of [data.br, data.zz, ...Object.values(data.uf)].filter(Boolean)) for (const x of [...r.candidates, ...(r.parties || [])]) seen.add(x.party);
  }
  for (const office of ['deputado-federal', 'deputado-estadual']) for (const f of readdirSync(join(ROOT, 'public/data/tse/1', office))) {
    for (const x of json(`public/data/tse/1/${office}/${f}`).result.parties) seen.add(x.party);
  }
  const missing = [...seen].filter(s => !P.partyKey(s));
  assert.deepEqual(missing, []);
});

test('paleta: nenhuma cor de partido fixa no código fora de src/lib/parties.js', () => {
  const bases = new Set(ALL.map(([, p]) => p.base.toLowerCase()));
  const files = [];
  const walk = dir => { for (const f of readdirSync(dir)) { const path = join(dir, f); if (statSync(path).isDirectory()) walk(path); else if (/\.(js|css|html)$/.test(f)) files.push(path); } };
  walk(join(ROOT, 'src'));
  files.push(join(ROOT, 'index.html'));
  const hits = [];
  for (const file of files.filter(f => !f.endsWith('src/lib/parties.js'))) {
    for (const hex of readFileSync(file, 'utf8').match(/#[0-9a-f]{6}\b/gi) || []) if (bases.has(hex.toLowerCase())) hits.push(`${file.replace(ROOT, '')}: ${hex}`);
  }
  assert.deepEqual(hits, []);
  assert.equal(partyColor('PT'), '#dc2630');
});

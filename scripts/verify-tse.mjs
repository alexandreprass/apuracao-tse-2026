#!/usr/bin/env node
// Compares the shipped copy (public/data/tse/1) with the live TSE files, field by field.
//   node scripts/verify-tse.mjs [UF ...]
import { readFile } from 'node:fs/promises';
import { tseResultUrl } from '../src/config.js';
import { normalizeResult } from '../src/data/normalize.js';

const bundle = JSON.parse(await readFile(new URL('../public/data/tse/1/presidente.json', import.meta.url)));
const codes = JSON.parse(await readFile(new URL('../public/data/tse/municipios.json', import.meta.url)));
const places = ['br', 'zz', ...(process.argv.slice(2).length ? process.argv.slice(2) : ['SP', 'MG', 'BA', 'RS', 'RJ', 'AC'])];
const FIELDS = ['electorate', 'turnout', 'abstention', 'totalVotes', 'valid', 'blank', 'null'];
let problems = 0;

const compare = (label, a, b) => {
  const diffs = FIELDS.filter(f => a[f] !== b[f]).map(f => `${f}: ${a[f]} ≠ ${b[f]}`);
  if (a.sections.pct !== b.sections.pct) diffs.push(`seções ${a.sections.pct} ≠ ${b.sections.pct}`);
  const votes = x => Object.fromEntries(x.candidates.map(c => [c.n, c.votes]));
  const va = votes(a), vb = votes(b);
  for (const n of new Set([...Object.keys(va), ...Object.keys(vb)])) if (va[n] !== vb[n]) diffs.push(`cand ${n}: ${va[n]} ≠ ${vb[n]}`);
  problems += diffs.length;
  const top = b.candidates.slice(0, 2).map(c => `${c.name} ${c.votes} (${c.pct.toFixed(2)}%)`).join(' | ');
  console.log(`${diffs.length ? '✗' : '✓'} ${label.padEnd(18)} válidos ${b.valid} · brancos ${b.blank} · nulos ${b.null} · comparec. ${b.turnoutPct.toFixed(2)}% · ${top}${diffs.length ? '\n   ' + diffs.join('\n   ') : ''}`);
};

for (const place of places) {
  const live = normalizeResult(await (await fetch(tseResultUrl(1, 'presidente', place.toLowerCase()))).json());
  const local = place === 'br' ? bundle.br : place === 'zz' ? bundle.zz : bundle.uf[place];
  compare(`presidente ${place}`, local, live);
}

// Municipal copy (packed arrays) against the live file for a few cities.
for (const ibge of ['3550308', '3304557', '5300108', '2927408']) {
  const [code, uf] = codes[ibge];
  const live = normalizeResult(await (await fetch(tseResultUrl(1, 'presidente', uf.toLowerCase() + code))).json());
  const pack = JSON.parse(await readFile(new URL(`../public/data/tse/1/presidente-municipios/${uf}.json`, import.meta.url)));
  const [, electorate, turnout, valid, blank, nulls, ...votes] = pack.m[ibge];
  const byNumber = Object.fromEntries(live.candidates.map(c => [c.n, c.votes]));
  const diffs = [];
  if (electorate !== live.electorate) diffs.push('eleitorado');
  if (turnout !== live.turnout) diffs.push('comparecimento');
  if (valid !== live.valid || blank !== live.blank || nulls !== live.null) diffs.push('válidos/brancos/nulos');
  pack.candidates.forEach((n, i) => { if ((byNumber[n] || 0) !== votes[i]) diffs.push('cand ' + n); });
  problems += diffs.length;
  console.log(`${diffs.length ? '✗' : '✓'} município ${ibge} (${uf}) válidos ${valid}${diffs.length ? ' — ' + diffs.join(', ') : ''}`);
}

const sum = Object.values(bundle.uf).reduce((s, r) => s + r.valid, 0) + bundle.zz.valid;
console.log(`${sum === bundle.br.valid ? '✓' : '✗'} soma dos válidos (27 UFs + exterior) = ${sum} · Brasil = ${bundle.br.valid}`);
if (sum !== bundle.br.valid) problems++;
console.log(problems ? `\n${problems} divergência(s)` : '\nTudo confere com o TSE.');
process.exit(problems ? 1 : 0);

#!/usr/bin/env node
// Compares the shipped copy (public/data/tse/1) with the live TSE files, field by field.
//   node scripts/verify-tse.mjs [UF ...]            # presidente: Brasil, exterior e algumas UFs
//   node scripts/verify-tse.mjs --cargo governador  # governador: as 27 UFs, as 27 capitais e 30 municípios sorteados
import { readFile } from 'node:fs/promises';
import { tseResultUrl } from '../src/config.js';
import { normalizeResult } from '../src/data/normalize.js';
import { readPackRow } from '../src/data/analysis.js';

const argv = process.argv.slice(2);
const office = argv.includes('--cargo') ? argv[argv.indexOf('--cargo') + 1] : 'presidente';
const ufArgs = argv.filter((a, i) => /^[A-Z]{2}$/.test(a) && argv[i - 1] !== '--cargo');
const bundle = JSON.parse(await readFile(new URL(`../public/data/tse/1/${office}.json`, import.meta.url)));
const codes = JSON.parse(await readFile(new URL('../public/data/tse/municipios.json', import.meta.url)));
const ALL = Object.keys(bundle.uf).sort();
const places = office === 'presidente'
  ? ['br', 'zz', ...(ufArgs.length ? ufArgs : ['SP', 'MG', 'BA', 'RS', 'RJ', 'AC'])]
  : (ufArgs.length ? ufArgs : ALL);
const FIELDS = ['electorate', 'turnout', 'abstention', 'totalVotes', 'valid', 'validComputed', 'subJudice', 'blank', 'null', 'finished'];
let problems = 0;

const compare = (label, a, b) => {
  const diffs = FIELDS.filter(f => a[f] !== b[f]).map(f => `${f}: ${a[f]} ≠ ${b[f]}`);
  // The TSE's own "situação" of each candidate must be copied as is.
  for (const c of b.candidates) {
    const mine = a.candidates.find(x => x.n === c.n);
    if (mine && (mine.status !== c.status || mine.kind !== c.kind)) diffs.push(`situação ${c.n}: ${mine.status} ≠ ${c.status}`);
    if (mine && mine.pct !== c.pct) diffs.push(`% ${c.n}: ${mine.pct} ≠ ${c.pct}`);
    if (mine && (mine.validity || '') !== (c.validity || '')) diffs.push(`candidatura ${c.n}: ${mine.validity} ≠ ${c.validity}`);
  }
  // Independent checks: the share shown must be votes over vvc (válidos + sub judice), "eleito" only from the
  // TSE's status text, and a governor race ends either with one elected or with exactly two runoff finalists.
  for (const c of a.candidates) {
    if (a.validComputed && Math.abs((100 * c.votes) / a.validComputed - c.pct) > 1e-6) diffs.push(`% ${c.n} ≠ votos/vvc`);
    if (c.elected !== (c.kind === 'eleito')) diffs.push(`eleito ${c.n} fora da situação do TSE`);
  }
  if (a.validComputed !== a.valid + a.subJudice) diffs.push(`vvc ${a.validComputed} ≠ vv ${a.valid} + sub judice ${a.subJudice}`);
  if (office === 'governador' && a.finished) {
    const won = a.candidates.filter(c => c.kind === 'eleito').length, runoff = a.candidates.filter(c => c.kind === 'segundo-turno').length;
    if (!((won === 1 && runoff === 0) || (won === 0 && runoff === 2))) diffs.push(`desfecho estranho: ${won} eleito(s), ${runoff} no 2º turno`);
  }
  if (a.sections.pct !== b.sections.pct) diffs.push(`seções ${a.sections.pct} ≠ ${b.sections.pct}`);
  const votes = x => Object.fromEntries(x.candidates.map(c => [c.n, c.votes]));
  const va = votes(a), vb = votes(b);
  for (const n of new Set([...Object.keys(va), ...Object.keys(vb)])) if (va[n] !== vb[n]) diffs.push(`cand ${n}: ${va[n]} ≠ ${vb[n]}`);
  problems += diffs.length;
  const top = b.candidates.slice(0, 2).map(c => `${c.name} ${c.votes} (${c.pct.toFixed(2)}%, ${c.status})`).join(' | ');
  console.log(`${diffs.length ? '✗' : '✓'} ${label.padEnd(18)} válidos ${b.valid} · brancos ${b.blank} · nulos ${b.null} · comparec. ${b.turnoutPct.toFixed(2)}% · ${top}${diffs.length ? '\n   ' + diffs.join('\n   ') : ''}`);
};

for (const place of places) {
  const live = normalizeResult(await (await fetch(tseResultUrl(1, office, place.toLowerCase()))).json());
  const local = place === 'br' ? bundle.br : place === 'zz' ? bundle.zz : bundle.uf[place];
  compare(`${office} ${place}`, local, live);
}

// Municipal copy (packed arrays) against the live file: capitals plus a fixed pseudo-random sample.
const CAPITALS = ['1200401', '2704302', '1302603', '1600303', '2927408', '2304400', '5300108', '3205309', '2111300', '5208707', '3106200',
  '5002704', '5103403', '1501402', '2507507', '2611606', '2211001', '4106902', '3304557', '2408102', '1100205', '1400100', '4314902',
  '4205407', '2800308', '3550308', '1721000'];
const packs = {};
const pack = async uf => (packs[uf] ||= JSON.parse(await readFile(new URL(`../public/data/tse/1/${office}-municipios/${uf}.json`, import.meta.url))));
let seed = 2026;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const allCodes = Object.keys(codes).sort();
const sample = Array.from({ length: office === 'presidente' ? 10 : 30 }, () => allCodes[Math.floor(random() * allCodes.length)]);
let municipalOk = 0;
for (const ibge of [...new Set([...(office === 'presidente' ? CAPITALS.slice(0, 6) : CAPITALS), ...sample])]) {
  const [code, uf] = codes[ibge];
  const live = normalizeResult(await (await fetch(tseResultUrl(1, office, uf.toLowerCase() + code))).json());
  const p = await pack(uf);
  if (!p.m[ibge]) { problems++; console.log(`✗ município ${ibge} (${uf}) ausente da cópia`); continue; }
  const row = readPackRow(p.fields, p.m[ibge]);
  const liveVotes = Object.fromEntries(live.candidates.map(c => [c.n, c]));
  const diffs = [];
  if (row.electorate !== live.electorate) diffs.push('eleitorado');
  if (row.turnout !== live.turnout) diffs.push('comparecimento');
  if (row.valid !== live.valid || row.blank !== live.blank || row.nulls !== live.null) diffs.push('válidos/brancos/nulos');
  if (p.fields.includes('anuladosSubJudice') && row.subJudice !== live.subJudice) diffs.push('sub judice');
  p.candidates.forEach((n, i) => {
    const c = liveVotes[n];
    if ((c?.votes || 0) !== row.votes[i]) diffs.push('cand ' + n);
    // The share the site shows (votes over válidos + sub judice) must match the TSE's own to 1e-6 p.p.
    const base = row.valid + row.subJudice;
    if (c && base && Math.abs((100 * row.votes[i]) / base - c.pct) > 1e-6) diffs.push(`% ${n}`);
  });
  problems += diffs.length;
  if (!diffs.length) municipalOk++;
  if (diffs.length || CAPITALS.includes(ibge)) console.log(`${diffs.length ? '✗' : '✓'} município ${ibge} (${uf}) válidos ${row.valid}${row.subJudice ? ` + ${row.subJudice} sub judice` : ''}${diffs.length ? ' — ' + diffs.join(', ') : ''}`);
}
console.log(`  ${municipalOk} municípios conferidos sem divergência`);

if (bundle.br) {
  const sum = Object.values(bundle.uf).reduce((s, r) => s + r.valid, 0) + bundle.zz.valid;
  console.log(`${sum === bundle.br.valid ? '✓' : '✗'} soma dos válidos (27 UFs + exterior) = ${sum} · Brasil = ${bundle.br.valid}`);
  if (sum !== bundle.br.valid) problems++;
}
console.log(problems ? `\n${problems} divergência(s)` : '\nTudo confere com o TSE.');
process.exit(problems ? 1 : 0);

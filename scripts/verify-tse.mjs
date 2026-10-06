#!/usr/bin/env node
// Compares the shipped copy (public/data/tse/1) with the live TSE files, field by field.
//   node scripts/verify-tse.mjs [UF ...]            # presidente: Brasil, exterior e algumas UFs
//   node scripts/verify-tse.mjs --cargo governador  # governador: as 27 UFs, as 27 capitais e 30 municípios sorteados
//   node scripts/verify-tse.mjs --cargo senador     # senador: idem; cada UF termina com tantos eleitos quanto as vagas (2 em 2026)
//   node scripts/verify-tse.mjs --cargo deputado-federal   # deputados (federal ou estadual): as 27 UFs, candidato por candidato
//     (votos, situação eleito/suplente/tipo, partido, federação, quociente e legenda), eleitos = vagas, e o resumo de cadeiras do index.json
import { readFile } from 'node:fs/promises';
import { OFFICES, tseResultUrl } from '../src/config.js';
import { normalizeResult } from '../src/data/normalize.js';
import { readPackRow } from '../src/data/analysis.js';

const argv = process.argv.slice(2);
const office = argv.includes('--cargo') ? argv[argv.indexOf('--cargo') + 1] : 'presidente';
const ufArgs = argv.filter((a, i) => /^[A-Z]{2}$/.test(a) && argv[i - 1] !== '--cargo');
const FIELDS = ['electorate', 'turnout', 'abstention', 'totalVotes', 'valid', 'validComputed', 'subJudice', 'blank', 'null', 'finished'];
if (OFFICES[office]?.proportional) process.exit(await verifyProportional());
const bundle = JSON.parse(await readFile(new URL(`../public/data/tse/1/${office}.json`, import.meta.url)));
const codes = JSON.parse(await readFile(new URL('../public/data/tse/municipios.json', import.meta.url)));
const ALL = Object.keys(bundle.uf).sort();
const places = office === 'presidente'
  ? ['br', 'zz', ...(ufArgs.length ? ufArgs : ['SP', 'MG', 'BA', 'RS', 'RJ', 'AC'])]
  : (ufArgs.length ? ufArgs : ALL);
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
  // Senate: no runoff; a finished race has exactly as many elected (TSE status) as seats in dispute.
  if (office === 'senador' && a.finished) {
    const won = a.candidates.filter(c => c.kind === 'eleito').length;
    if (won !== (b.seats || 2) || a.candidates.some(c => c.kind === 'segundo-turno')) diffs.push(`desfecho estranho: ${won} eleito(s) para ${b.seats} vaga(s)`);
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

/** Deputies: one shipped file per state, compared with the live TSE file of that state. Returns the exit code. */
async function verifyProportional() {
  const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  const index = JSON.parse(await readFile(new URL('../public/data/tse/1/index.json', import.meta.url)));
  const summary = index.offices?.[office]?.seats || {};
  let problems = 0, seats = 0, elected = 0, candidates = 0;
  for (const uf of ufArgs.length ? ufArgs : UFS) {
    const local = JSON.parse(await readFile(new URL(`../public/data/tse/1/${office}/${uf}.json`, import.meta.url))).result;
    const live = normalizeResult(await (await fetch(tseResultUrl(1, office, uf.toLowerCase()))).json(), { compact: true });
    const diffs = ['seats', 'quotient', 'legend', 'updated', 'finished', ...FIELDS].filter(f => local[f] !== live[f]).map(f => `${f}: ${local[f]} ≠ ${live[f]}`);
    const mine = new Map(local.candidates.map(c => [c.n, c]));
    for (const c of live.candidates) {
      const a = mine.get(c.n);
      if (!a) { diffs.push(`cand ${c.n} ausente da cópia`); continue; }
      for (const f of ['votes', 'pct', 'status', 'kind', 'elected', 'party', 'name']) if (a[f] !== c[f]) diffs.push(`cand ${c.n} ${f}: ${a[f]} ≠ ${c[f]}`);
      if ((a.validity || '') !== (c.validity || '')) diffs.push(`candidatura ${c.n}: ${a.validity} ≠ ${c.validity}`);
    }
    if (local.candidates.length !== live.candidates.length) diffs.push(`${local.candidates.length} candidatos ≠ ${live.candidates.length}`);
    // Parties and federations (votes, legend votes, "nfed"): what the seat grouping uses.
    const key = p => `${p.party}:${p.votes}:${p.legend}:${p.fed || ''}`;
    if (local.parties.map(key).join() !== live.parties.map(key).join()) diffs.push('partidos/federações divergem');
    if (JSON.stringify(local.federations) !== JSON.stringify(live.federations)) diffs.push('lista de federações diverge');
    // Independent checks: "eleito" only from the TSE status text, and a finished count elects exactly as many as the seats.
    const won = local.candidates.filter(c => c.kind === 'eleito');
    for (const c of local.candidates) if (c.elected !== (c.kind === 'eleito') || (c.kind === 'eleito') !== /^eleito/i.test(c.status)) diffs.push(`eleito ${c.n} fora da situação do TSE`);
    if (local.finished && won.length !== local.seats) diffs.push(`${won.length} eleitos para ${local.seats} vagas`);
    // A count the TSE reopened (finished = false, e.g. a retotalização) may carry vvc ≠ vv + sub judice for a while: a note, not a copy error.
    const notes = [];
    if (local.validComputed !== local.valid + local.subJudice) (local.finished ? diffs : notes).push(`vvc ${local.validComputed} ≠ vv ${local.valid} + sub judice ${local.subJudice}`);
    if (!local.finished) notes.push(`totalização não concluída no TSE (gerado ${local.generated}): ${won.length} eleitos publicados, situação ${local.candidates.filter(c => c.kind === 'pendente').length ? 'pendente' : 'parcial'}`);
    // index.json (Brasil view): seats and elected per party must be the file's own.
    const byParty = {};
    for (const c of won) byParty[c.party] = (byParty[c.party] || 0) + 1;
    const s = summary[uf];
    if (!s || s.seats !== local.seats || JSON.stringify(Object.entries(s.elected).sort()) !== JSON.stringify(Object.entries(byParty).sort())) diffs.push('resumo de cadeiras do index.json diverge');
    problems += diffs.length; seats += local.seats; elected += won.length; candidates += local.candidates.length;
    const kinds = [...new Set(won.map(c => c.status))].map(st => `${won.filter(c => c.status === st).length} ${st.toLowerCase()}`).join(', ');
    const suplentes = local.candidates.filter(c => c.kind === 'suplente').length;
    console.log(`${diffs.length ? '✗' : '✓'} ${office} ${uf} · ${local.seats} vagas · ${won.length} eleitos (${kinds}) · ${suplentes} suplentes · QE ${local.quotient} · legenda ${local.legend}${[...diffs.slice(0, 12), ...notes.map(n => `(aviso) ${n}`)].map(d => '\n   ' + d).join('')}`);
  }
  console.log(`  ${candidates} candidatos conferidos · ${elected} eleitos para ${seats} vagas`);
  console.log(problems ? `\n${problems} divergência(s)` : '\nTudo confere com o TSE.');
  return problems ? 1 : 0;
}

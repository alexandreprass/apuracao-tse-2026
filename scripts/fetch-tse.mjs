#!/usr/bin/env node
// Downloads the official results published by the TSE (resultados.tse.jus.br) and writes a compact
// copy to public/data/tse/<round>/, which the site uses when the TSE servers are unreachable and,
// for a finished count, as its primary source (faster than ~30 requests to the TSE).
//
//   node scripts/fetch-tse.mjs                 # 1º turno, all offices, plus municipal results for president
//   node scripts/fetch-tse.mjs --round 2       # 2º turno (president and the governors' runoffs)
//   node scripts/fetch-tse.mjs --no-municipios # skip the 5,570 municipal files (slowest part)
//
// Nothing here invents data: a file the TSE has not published is simply skipped.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICES, ROUNDS, TSE_BASE, electionCode, tseResultUrl } from '../src/config.js';
import { normalizeResult } from '../src/data/normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const round = Number(args[args.indexOf('--round') + 1]) || 1;
const withMunicipalities = !args.includes('--no-municipios');
const OUT = join(ROOT, 'public', 'data', 'tse', String(round));
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

async function getJson(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'apuracao-tse-2026 (github pages snapshot)' } });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= tries) throw new Error(`${url}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

const write = async (file, data) => {
  const path = join(OUT, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
  console.log('  ✓', path.replace(ROOT + '/', ''));
};

async function result(office, place, compact = false) {
  const raw = await getJson(tseResultUrl(round, office, place));
  return raw ? normalizeResult(raw, { compact }) : null;
}

const meta = office => ({
  source: 'TSE · resultados.tse.jus.br',
  election: electionCode(round, office),
  round,
  fetchedAt: new Date().toISOString(),
});

async function main() {
  console.log(`Baixando resultados oficiais do TSE · ${ROUNDS[round].label} (${ROUNDS[round].date})`);
  const offices = Object.entries(OFFICES).filter(([, office]) => office.rounds.includes(round)).map(([key]) => key);
  const summary = { generatedAt: new Date().toISOString(), round, offices: {} };

  for (const office of offices) {
    const isProportional = OFFICES[office].proportional;
    const places = [...(OFFICES[office].federal ? ['br', 'zz'] : []), ...UFS.map(uf => uf.toLowerCase())];
    const rows = await pool(places, 8, place => result(office, place, isProportional));
    const found = places.map((place, i) => [place, rows[i]]).filter(([, row]) => row);
    if (!found.length) { console.log(`  · ${office}: nenhum arquivo publicado ainda`); continue; }

    if (isProportional) {
      const seats = {};
      for (const [place, row] of found) {
        await write(`${office}/${place.toUpperCase()}.json`, { ...meta(office), result: row });
        const byParty = {};
        for (const c of row.candidates) if (c.kind === 'eleito') byParty[c.party] = (byParty[c.party] || 0) + 1;
        seats[place.toUpperCase()] = { seats: row.seats, elected: byParty, updated: row.updated, finished: row.finished };
      }
      summary.offices[office] = { states: found.length, seats };
    } else {
      const data = { ...meta(office), uf: {} };
      for (const [place, row] of found) {
        if (place === 'br') data.br = row;
        else if (place === 'zz') data.zz = row;
        else data.uf[place.toUpperCase()] = row;
      }
      await write(`${office}.json`, data);
      summary.offices[office] = { states: Object.keys(data.uf).length, updated: data.br?.updated };
    }
  }

  if (withMunicipalities && offices.includes('presidente')) await municipalities(summary);
  await write('index.json', summary);
}

/** Presidential results for every municipality, packed as arrays to keep the file small. */
async function municipalities(summary) {
  const ele = electionCode(round, 'presidente');
  const config = await getJson(`${TSE_BASE}/${ele}/config/mun-e${String(ele).padStart(6, '0')}-cm.json`);
  if (!config) return console.log('  · configuração de municípios indisponível');
  const codes = {};
  const list = [];
  for (const state of config.abr) {
    for (const m of state.mu) {
      if (state.cd === 'zz') continue;
      codes[m.cdi] = [m.cd, state.cd.toUpperCase()];
      list.push({ ibge: m.cdi, place: state.cd + m.cd });
    }
  }
  await mkdir(join(ROOT, 'public', 'data', 'tse'), { recursive: true });
  await writeFile(join(ROOT, 'public', 'data', 'tse', 'municipios.json'), JSON.stringify(codes));
  console.log(`  ✓ public/data/tse/municipios.json (${list.length} municípios)`);

  const national = (await result('presidente', 'br'));
  const order = national.candidates.map(c => c.n);
  let done = 0;
  const rows = await pool(list, 24, async item => {
    const row = await result('presidente', item.place);
    if (++done % 500 === 0) console.log(`    ${done}/${list.length}`);
    if (!row) return null;
    const byNumber = Object.fromEntries(row.candidates.map(c => [c.n, c.votes]));
    return [item.ibge, [row.sections.pct, row.electorate, row.turnout, row.valid, row.blank, row.null, ...order.map(n => byNumber[n] || 0)]];
  });
  const byState = {};
  for (const entry of rows.filter(Boolean)) {
    const uf = codes[entry[0]][1];
    (byState[uf] ||= {})[entry[0]] = entry[1];
  }
  // One file per state, so opening a state downloads only its own municipalities.
  for (const [uf, m] of Object.entries(byState)) {
    await write(`presidente-municipios/${uf}.json`, {
      ...meta('presidente'),
      updated: national.updated,
      fields: ['apuradoPct', 'eleitorado', 'comparecimento', 'validos', 'brancos', 'nulos', '...votos'],
      candidates: order,
      m,
    });
  }
  summary.municipalities = rows.filter(Boolean).length;
}

main().catch(error => { console.error(error); process.exit(1); });

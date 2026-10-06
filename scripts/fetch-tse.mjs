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
//
// Failure handling (so a bad night never publishes a half-written copy):
// - a file that cannot be downloaded after a few tries becomes null with a warning; if the previous
//   copy had that place, its last good result is kept and listed in "incomplete" of the file;
// - everything is written to a temporary folder, moved over public/data/tse/<round> only at the end;
// - if nothing at all could be downloaded, the previous copy is left untouched and the exit code is 1.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICES, ROUNDS, TSE_BASE, electionCode, tseResultUrl } from '../src/config.js';
import { normalizeResult } from '../src/data/normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const round = Number(args[args.indexOf('--round') + 1]) || 1;
const withMunicipalities = !args.includes('--no-municipios');
const FINAL = join(ROOT, 'public', 'data', 'tse', String(round));
const TMP = join(ROOT, 'public', 'data', 'tse', `.tmp-${round}-${process.pid}`);
const OUT = TMP;
const CODES_FILE = join(ROOT, 'public', 'data', 'tse', 'municipios.json');
const warnings = [];
const warn = message => {
  warnings.push(message);
  // GitHub Actions shows these as annotations on the run.
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `  ! ${message}`);
};
let downloaded = 0;
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const FAILED = Symbol('failed');
/** JSON of a TSE file; null when not published (404/403); FAILED (with a warning) after `tries` errors. */
async function getJson(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'apuracao-tse-2026 (github pages snapshot)' }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      downloaded++;
      return json;
    } catch (error) {
      if (attempt >= tries) { warn(`falha ao baixar ${url}: ${error.message}`); return FAILED; }
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
}

const readPrevious = async file => { try { return JSON.parse(await readFile(join(FINAL, file), 'utf8')); } catch { return null; } };

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

/** Normalized result, null if not published, FAILED if it could not be read. */
async function result(office, place, compact = false) {
  const raw = await getJson(tseResultUrl(round, office, place));
  if (raw === FAILED || !raw) return raw;
  try { return normalizeResult(raw, { compact }); }
  catch (error) { warn(`arquivo inválido ${office}/${place}: ${error.message}`); return FAILED; }
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
    const previous = isProportional ? null : await readPrevious(`${office}.json`);
    const incomplete = [];
    const found = [];
    for (const [i, place] of places.entries()) {
      let row = rows[i];
      if (row === FAILED) {
        // Keep the last good copy of this place, if any, and say so in the file.
        row = isProportional ? (await readPrevious(`${office}/${place.toUpperCase()}.json`))?.result || null
          : place === 'br' ? previous?.br : place === 'zz' ? previous?.zz : previous?.uf?.[place.toUpperCase()];
        incomplete.push(place.toUpperCase());
      }
      if (row) found.push([place, row]);
    }
    if (!found.length) { console.log(`  · ${office}: nenhum arquivo publicado ainda`); continue; }

    if (isProportional) {
      const seats = {};
      for (const [place, row] of found) {
        await write(`${office}/${place.toUpperCase()}.json`, { ...meta(office), ...(incomplete.includes(place.toUpperCase()) ? { incomplete: [place.toUpperCase()] } : {}), result: row });
        const byParty = {};
        for (const c of row.candidates) if (c.kind === 'eleito') byParty[c.party] = (byParty[c.party] || 0) + 1;
        seats[place.toUpperCase()] = { seats: row.seats, elected: byParty, updated: row.updated, finished: row.finished };
      }
      summary.offices[office] = { states: found.length, seats, ...(incomplete.length ? { incomplete } : {}) };
    } else {
      const data = { ...meta(office), ...(incomplete.length ? { incomplete } : {}), uf: {} };
      for (const [place, row] of found) {
        if (place === 'br') data.br = row;
        else if (place === 'zz') data.zz = row;
        else data.uf[place.toUpperCase()] = row;
      }
      await write(`${office}.json`, data);
      summary.offices[office] = { states: Object.keys(data.uf).length, updated: data.br?.updated, ...(incomplete.length ? { incomplete } : {}) };
    }
  }

  if (offices.includes('presidente')) {
    if (withMunicipalities) await municipalities(summary);
    else await keepPreviousMunicipalities(summary);
  }
  await write('index.json', summary);

  if (!downloaded) {
    await rm(TMP, { recursive: true, force: true });
    throw new Error('Nenhum arquivo do TSE pôde ser baixado; a cópia anterior foi mantida.');
  }
  // Swap the folders only now, so the site never sees a half-written copy.
  const OLD = `${FINAL}.old-${process.pid}`;
  await rename(FINAL, OLD).catch(() => {});
  await rename(TMP, FINAL);
  await rm(OLD, { recursive: true, force: true });
  if (pendingCodes) await writeFile(CODES_FILE, pendingCodes);
  console.log(warnings.length ? `Concluído com ${warnings.length} aviso(s).` : 'Concluído sem avisos.');
}

let pendingCodes = null;

/** --no-municipios: carry the previous municipal files over instead of dropping them. */
async function keepPreviousMunicipalities(summary) {
  const index = await readPrevious('index.json');
  if (!index?.municipalities) return;
  const { cp } = await import('node:fs/promises');
  await cp(join(FINAL, 'presidente-municipios'), join(OUT, 'presidente-municipios'), { recursive: true }).catch(() => {});
  summary.municipalities = index.municipalities;
  console.log('  · municípios: mantida a cópia anterior');
}

/** Presidential results for every municipality, packed as arrays to keep the file small. */
async function municipalities(summary) {
  const ele = electionCode(round, 'presidente');
  const config = await getJson(`${TSE_BASE}/${ele}/config/mun-e${String(ele).padStart(6, '0')}-cm.json`);
  if (!config || config === FAILED) { console.log('  · configuração de municípios indisponível'); return keepPreviousMunicipalities(summary); }
  const codes = {};
  const list = [];
  for (const state of config.abr) {
    for (const m of state.mu) {
      if (state.cd === 'zz') continue;
      codes[m.cdi] = [m.cd, state.cd.toUpperCase()];
      list.push({ ibge: m.cdi, place: state.cd + m.cd });
    }
  }
  pendingCodes = JSON.stringify(codes); // written with the folder swap at the end
  console.log(`  ✓ public/data/tse/municipios.json (${list.length} municípios)`);

  const national = await result('presidente', 'br');
  if (!national || national === FAILED) { console.log('  · resultado nacional indisponível'); return keepPreviousMunicipalities(summary); }
  const order = national.candidates.map(c => c.n);
  // Previous packs, to keep the last good row of a municipality that fails now.
  const previousPacks = {};
  let done = 0, failed = 0;
  const rows = await pool(list, 24, async item => {
    let row = await result('presidente', item.place);
    if (++done % 500 === 0) console.log(`    ${done}/${list.length}`);
    if (row === FAILED) {
      failed++;
      const uf = codes[item.ibge][1];
      previousPacks[uf] ||= readPrevious(`presidente-municipios/${uf}.json`);
      const pack = await previousPacks[uf];
      const old = pack?.m?.[item.ibge];
      // Only reuse an old row when the candidate order is the same.
      return old && JSON.stringify(pack.candidates) === JSON.stringify(order) ? [item.ibge, old] : null;
    }
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
  if (failed) summary.municipalitiesIncomplete = failed;
}

main().catch(async error => {
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  console.error(error.message || error);
  process.exit(1);
});

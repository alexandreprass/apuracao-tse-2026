#!/usr/bin/env node
// Downloads the official results published by the TSE (resultados.tse.jus.br) and writes a compact
// copy to public/data/tse/<round>/, which the site uses when the TSE servers are unreachable and,
// for a finished count, as its primary source (faster than ~30 requests to the TSE).
//
//   node scripts/fetch-tse.mjs                       # 1º turno, all offices, plus municipal results for president and governor
//   node scripts/fetch-tse.mjs --round 2             # 2º turno (president and the governors' runoffs)
//   node scripts/fetch-tse.mjs --cargos governador   # only some offices (comma separated); the other files are kept
//   node scripts/fetch-tse.mjs --no-municipios       # skip the municipal files (slowest part: ~5,600 files per office)
//
// Nothing here invents data: a file the TSE has not published is simply skipped.
//
// Failure handling (so a bad night never publishes a half-written copy):
// - a file that cannot be downloaded after a few tries becomes null with a warning; if the previous
//   copy had that place, its last good result is kept and listed in "incomplete" of the file;
// - everything is written to a temporary folder, moved over public/data/tse/<round> only at the end;
// - if nothing at all could be downloaded, the previous copy is left untouched and the exit code is 1.
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICES, ROUNDS, TSE_BASE, electionCode, tseResultUrl } from '../src/config.js';
import { normalizeResult } from '../src/data/normalize.js';
import { writeManifest } from './manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const round = Number(args[args.indexOf('--round') + 1]) || 1;
const withMunicipalities = !args.includes('--no-municipios');
const onlyOffices = args.includes('--cargos') ? args[args.indexOf('--cargos') + 1].split(',') : null;
// Offices with a municipal breakdown on the map (one small file per state).
const MUNICIPAL_OFFICES = ['presidente', 'governador'];
// Column order of the municipal files (same as PACK_FIELDS in src/data/analysis.js). "anuladosSubJudice"
// (TSE "vansj") is needed to reproduce the TSE's percentages: votes / (válidos + sub judice).
const PACK_FIELDS = ['apuradoPct', 'eleitorado', 'comparecimento', 'validos', 'brancos', 'nulos', 'anuladosSubJudice', '...votos'];
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
  const offices = Object.entries(OFFICES).filter(([key, office]) => office.rounds.includes(round) && (!onlyOffices || onlyOffices.includes(key))).map(([key]) => key);
  // Partial runs (--cargos) start from the previous copy, so the offices not asked for are kept as they are.
  const previousIndex = (await readPrevious('index.json')) || {};
  if (onlyOffices) await cp(FINAL, TMP, { recursive: true }).catch(() => {});
  const summary = onlyOffices
    ? { ...previousIndex, generatedAt: new Date().toISOString(), round, offices: { ...previousIndex.offices }, municipal: { ...previousIndex.municipal } }
    : { generatedAt: new Date().toISOString(), round, offices: {}, municipal: {} };
  const results = {};

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
      results[office] = data;
      summary.offices[office] = { states: Object.keys(data.uf).length, updated: data.br?.updated, ...(incomplete.length ? { incomplete } : {}) };
    }
  }

  for (const office of offices.filter(o => MUNICIPAL_OFFICES.includes(o))) {
    if (withMunicipalities && results[office]) await municipalities(office, results[office], summary, previousIndex);
    else await keepPreviousMunicipalities(office, summary, previousIndex);
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
  await writeManifest(); // the site asks only for bundle files listed here
  console.log(warnings.length ? `Concluído com ${warnings.length} aviso(s).` : 'Concluído sem avisos.');
}

let pendingCodes = null;

/** Municipal count of one office in an index (older indexes only have "municipalities", for president). */
const municipalCount = (index, office) => index?.municipal?.[office] ?? (office === 'presidente' ? index?.municipalities : undefined);

/** --no-municipios or a failed download: carry the previous municipal files over instead of dropping them. */
async function keepPreviousMunicipalities(office, summary, previousIndex) {
  const count = municipalCount(previousIndex, office);
  if (!count) return;
  await cp(join(FINAL, `${office}-municipios`), join(OUT, `${office}-municipios`), { recursive: true }).catch(() => {});
  summary.municipal[office] = count;
  if (office === 'presidente') summary.municipalities = count;
  console.log(`  · ${office}: mantida a cópia anterior dos municípios`);
}

/** Results of one office for every municipality, packed as arrays, one file per state. */
async function municipalities(office, officeData, summary, previousIndex) {
  const ele = electionCode(round, office);
  const config = await getJson(`${TSE_BASE}/${ele}/config/mun-e${String(ele).padStart(6, '0')}-cm.json`);
  if (!config || config === FAILED) { console.log(`  · ${office}: configuração de municípios indisponível`); return keepPreviousMunicipalities(office, summary, previousIndex); }
  const codes = {};
  const list = [];
  for (const state of config.abr) {
    if (state.cd === 'zz') continue;
    const uf = state.cd.toUpperCase();
    for (const m of state.mu) {
      codes[m.cdi] = [m.cd, uf];
      // Only states where this office was contested in this round (e.g. governor runoffs).
      if (officeData.uf[uf]) list.push({ ibge: m.cdi, uf, place: state.cd + m.cd });
    }
  }
  pendingCodes ||= JSON.stringify(codes); // written with the folder swap at the end
  console.log(`  ✓ public/data/tse/municipios.json (${Object.keys(codes).length} municípios)`);

  // Candidate order: national for president, each state's own list otherwise.
  const orderFor = uf => (officeData.br || officeData.uf[uf]).candidates.map(c => c.n);
  // Previous packs, to keep the last good row of a municipality that fails now.
  const previousPacks = {};
  let done = 0, failed = 0;
  const rows = await pool(list, 24, async item => {
    const row = await result(office, item.place);
    if (++done % 1000 === 0) console.log(`    ${office}: ${done}/${list.length}`);
    if (row === FAILED) {
      failed++;
      previousPacks[item.uf] ||= readPrevious(`${office}-municipios/${item.uf}.json`);
      const pack = await previousPacks[item.uf];
      const old = pack?.m?.[item.ibge];
      // Only reuse an old row when the columns and the candidate order are the same.
      const same = pack && JSON.stringify(pack.candidates) === JSON.stringify(orderFor(item.uf)) && JSON.stringify(pack.fields) === JSON.stringify(PACK_FIELDS);
      return old && same ? [item.ibge, item.uf, old] : null;
    }
    if (!row) return null;
    const byNumber = Object.fromEntries(row.candidates.map(c => [c.n, c.votes]));
    return [item.ibge, item.uf, [row.sections.pct, row.electorate, row.turnout, row.valid, row.blank, row.null, row.subJudice || 0, ...orderFor(item.uf).map(n => byNumber[n] || 0)]];
  });
  const byState = {};
  for (const entry of rows.filter(Boolean)) (byState[entry[1]] ||= {})[entry[0]] = entry[2];
  // One file per state, so opening a state downloads only its own municipalities.
  for (const [uf, m] of Object.entries(byState)) {
    await write(`${office}-municipios/${uf}.json`, {
      ...meta(office),
      updated: (officeData.br || officeData.uf[uf]).updated,
      fields: PACK_FIELDS,
      candidates: orderFor(uf),
      m,
    });
  }
  summary.municipal[office] = rows.filter(Boolean).length;
  if (office === 'presidente') summary.municipalities = summary.municipal[office];
  if (failed) (summary.municipalIncomplete ||= {})[office] = failed;
}

main().catch(async error => {
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  console.error(error.message || error);
  process.exit(1);
});

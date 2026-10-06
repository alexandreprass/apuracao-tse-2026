// Loads results either live from the TSE servers or from the copy shipped in public/data/tse.
import { OFFICES, ROUNDS, SOURCE_MODE, electionCode, tseResultUrl } from '../config.js';

export const TSE_ELECTIONS_URL = 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json';
import { normalizeResult } from './normalize.js';
import { UFS } from './states.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
export const bundleUrl = path => `${BASE}data/${path}`;

/** "tse", "local" or null (no override), from ?fonte= in the page URL. */
export function sourceOverride() {
  try {
    const value = new URLSearchParams(location.search).get('fonte') || new URLSearchParams(location.hash.split('?')[1] || '').get('fonte');
    return value === 'tse' || value === 'local' ? value : null;
  } catch { return null; }
}

export function modeFor(round) {
  const override = sourceOverride();
  if (override === 'tse') return 'live-only';
  if (override === 'local') return 'bundle-only';
  return SOURCE_MODE[round] || 'live-first';
}

class NotPublished extends Error {}

/** Fetches JSON; resolves null on 404/403 (file not published yet), throws on network/CORS errors. */
async function getJson(url, { live = false } = {}) {
  const response = await fetch(url, live ? { cache: 'no-cache' } : undefined);
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.json();
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); }
  }));
  return out;
}

const stamp = (data, source) => ({ ...data, source, checkedAt: new Date() });

/** Live: every place of one office (Brasil, abroad and the 27 states for president; the 27 states otherwise). */
/** Election codes the TSE has configured (true/false), or null if the list could not be read. */
export async function electionListed(code) {
  try {
    const config = await getJson(TSE_ELECTIONS_URL, { live: true });
    if (!config) return null;
    return (config.pl || []).some(p => (p.e || []).some(e => String(e.cd) === String(code)));
  } catch {
    return null;
  }
}

async function liveOffice(round, office) {
  const federal = OFFICES[office].federal;
  // Before a round exists, ask the TSE's election list first instead of requesting ~30 missing files.
  const listed = await electionListed(electionCode(round, office));
  if (listed === false) throw new NotPublished('O TSE ainda não publicou resultados deste turno.');
  let first = null;
  if (federal) {
    try { first = await getJson(tseResultUrl(round, office, 'br'), { live: true }); }
    catch { if (listed === null) throw new Error('Não foi possível acessar os servidores do TSE.'); }
    if (!first) throw new NotPublished('O TSE ainda não publicou resultados deste turno.');
  }
  const places = [...(federal ? ['zz'] : []), ...UFS.map(uf => uf.toLowerCase())];
  let networkErrors = 0;
  const rows = await pool(places, 8, async place => {
    try {
      const raw = await getJson(tseResultUrl(round, office, place), { live: true });
      return raw ? normalizeResult(raw) : null;
    } catch (error) {
      networkErrors++;
      return null;
    }
  });
  const data = { uf: {} };
  if (first) data.br = normalizeResult(first);
  places.forEach((place, i) => {
    if (!rows[i]) return;
    if (place === 'br') data.br = rows[i];
    else if (place === 'zz') data.zz = rows[i];
    else data.uf[place.toUpperCase()] = rows[i];
  });
  const found = rows.filter(Boolean).length + (first ? 1 : 0);
  if (!found && networkErrors) throw new Error('Não foi possível acessar os servidores do TSE.');
  if (!found) throw new NotPublished('O TSE ainda não publicou resultados deste turno.');
  return data;
}

async function bundleOffice(round, office) {
  const data = await getJson(bundleUrl(`tse/${round}/${office}.json`));
  if (!data) throw new NotPublished('Sem cópia local destes resultados.');
  return data;
}

/** Tries the sources in the order the mode asks for; remembers which one answered. */
async function withFallback(round, live, bundle) {
  const mode = modeFor(round);
  const order = mode === 'live-only' ? ['tse'] : mode === 'bundle-only' ? ['local']
    : mode === 'bundle-first' ? ['local', 'tse'] : ['tse', 'local'];
  let notPublished = null, failure = null;
  for (const source of order) {
    try {
      return stamp(await (source === 'tse' ? live() : bundle()), source);
    } catch (error) {
      if (error instanceof NotPublished) notPublished ||= error;
      else failure ||= error;
    }
  }
  const error = failure && !notPublished ? failure : notPublished || failure;
  return { status: error instanceof NotPublished ? 'not-published' : 'error', message: error?.message, source: null, checkedAt: new Date(), uf: {} };
}

/** President, governors or senators: every place for one round. */
export const loadOffice = (round, office) => withFallback(round, () => liveOffice(round, office), () => bundleOffice(round, office));

/** Proportional offices (deputies) are loaded one state at a time. */
export function loadProportional(round, office, uf) {
  return withFallback(round,
    async () => {
      let raw;
      try { raw = await getJson(tseResultUrl(round, office, uf.toLowerCase()), { live: true }); }
      catch { throw new Error('Não foi possível acessar os servidores do TSE.'); }
      if (!raw) throw new NotPublished('O TSE ainda não publicou este resultado.');
      return { result: normalizeResult(raw, { compact: true }) };
    },
    async () => {
      const data = await getJson(bundleUrl(`tse/${round}/${office}/${uf}.json`));
      if (!data) throw new NotPublished('Sem cópia local deste resultado.');
      return data;
    });
}

let codesPromise;
/** IBGE municipality code → [TSE code, UF]. */
export const loadMunicipalityCodes = () => (codesPromise ||= getJson(bundleUrl('tse/municipios.json')).then(data => data || {}).catch(() => ({})));

/** One municipality, straight from the TSE (any office), or null. */
export async function loadMunicipality(round, office, ibge) {
  const codes = await loadMunicipalityCodes();
  const hit = codes[ibge];
  if (!hit) return null;
  const [code, uf] = hit;
  try {
    const raw = await getJson(tseResultUrl(round, office, uf.toLowerCase() + code), { live: true });
    return raw ? { ...normalizeResult(raw), source: 'tse', checkedAt: new Date() } : null;
  } catch {
    return null;
  }
}

const packCache = new Map();
/** Presidential results of every municipality of a state (shipped copy). */
const indexCache = new Map();
export function loadMunicipalPack(round, uf) {
  const key = `${round}/${uf}`;
  if (!indexCache.has(round)) indexCache.set(round, loadIndex(round));
  // Only ask for the file when the shipped index says municipal results exist for this round.
  if (!packCache.has(key)) packCache.set(key, indexCache.get(round)
    .then(index => (index?.municipalities ? getJson(bundleUrl(`tse/${round}/presidente-municipios/${uf}.json`)) : null))
    .catch(() => null));
  return packCache.get(key);
}

const cache2022 = new Map();
export function load2022(path) {
  if (!cache2022.has(path)) cache2022.set(path, getJson(bundleUrl(`2022/${path}`)).catch(() => null));
  return cache2022.get(path);
}

export const loadIndex = round => getJson(bundleUrl(`tse/${round}/index.json`)).catch(() => null);

export const roundStarted = round => Date.now() >= new Date(ROUNDS[round].closesAt).getTime();

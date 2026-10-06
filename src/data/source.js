// Loads results either live from the TSE servers or from the copy shipped in public/data/tse.
//
// Rules for the live read (see README, "Leitura ao vivo"):
// - A network/CORS error or an HTTP error is "TSE unavailable", never "not published yet".
// - A missing file (404/403) only means "not published" while nothing was ever seen for that
//   office and round; after that it is treated as unavailable as well.
// - On any failure the last good data is kept (whole office or per state) and flagged as stale,
//   so a failure in the middle of a count never wipes the results off the screen.
import { MUNICIPAL_OFFICES, OFFICES, pollsClosed, SOURCE_MODE, tseResultUrl } from '../config.js';
import { normalizeResult, parseTseDate } from './normalize.js';
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

/** The file does not exist (yet). */
export class NotPublished extends Error {}
/** The server could not be reached, refused the request or answered garbage. */
export class Unavailable extends Error {}

const UNREACHABLE = 'Não foi possível acessar os servidores do TSE.';

/** Every request gives up after this long (a hanging connection must never freeze the polling). */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export let FETCH_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;
/** For tests: a shorter limit; no argument restores the default. */
export const setFetchTimeout = (ms = DEFAULT_FETCH_TIMEOUT_MS) => { FETCH_TIMEOUT_MS = ms; };

const inflight = new Map();

/**
 * Fetches JSON. Resolves null on 404/403 (file not published), throws Unavailable on network/CORS
 * errors, timeouts, other HTTP errors and invalid JSON. `cache: 'no-cache'` makes the browser revalidate
 * with the server (ETag → 304), so an unchanged file costs a few bytes. Identical requests already
 * under way are shared instead of repeated.
 */
export function getJson(url, { fresh = false } = {}) {
  const key = `${fresh ? 'f' : 'c'}|${url}`;
  if (inflight.has(key)) return inflight.get(key);
  const promise = fetchJson(url, fresh).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function fetchJson(url, fresh) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller?.abort(); reject(new Unavailable('O TSE demorou demais para responder.')); }, FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let response;
      try { response = await fetch(url, { ...(fresh ? { cache: 'no-cache' } : {}), signal: controller?.signal }); }
      catch { throw new Unavailable(UNREACHABLE); }
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Unavailable(`O TSE respondeu com erro (HTTP ${response.status}).`);
      try { return await response.json(); }
      catch { throw new Unavailable('O TSE enviou uma resposta incompleta.'); }
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); }
  }));
  return out;
}

/** Places of one office: Brasil and abroad for president, then the states (all 27 unless a list is given). */
const placesOf = (office, ufs = UFS) => [...(OFFICES[office].federal ? ['br', 'zz'] : []), ...ufs.map(uf => uf.toLowerCase())];
const getPlace = (data, place) => (place === 'br' ? data?.br : place === 'zz' ? data?.zz : data?.uf?.[place.toUpperCase()]);
const setPlace = (data, place, row) => {
  if (place === 'br') data.br = row; else if (place === 'zz') data.zz = row; else data.uf[place.toUpperCase()] = row;
};

/** Latest TSE totalization time among the places of a result set, as a Date (or null). */
export function latestUpdate(data) {
  if (!data) return null;
  const rows = data.result ? [data.result] : [data.br, data.zz, ...Object.values(data.uf || {})].filter(Boolean);
  let best = null;
  for (const row of rows) {
    const t = parseTseDate(row.updated);
    if (t && (!best || t > best)) best = t;
  }
  return best;
}

/**
 * Identity of a result set: changes only when the TSE publishes a new boletim (file generation
 * time of every place), or when the source or the warnings shown change. Polls that return the same
 * signature keep the previous object, so nothing is recomputed or redrawn.
 */
export function signature(data) {
  if (!data) return '';
  if (data.status) return `${data.status}|${data.message || ''}|${data.boletim ?? ''}`;
  const rows = data.result ? [['r', data.result]] : [['br', data.br], ['zz', data.zz], ...UFS.map(uf => [uf, data.uf?.[uf]])];
  const places = rows.map(([k, r]) => (r ? `${k}:${r.generated || ''}/${r.updated || ''}/${r.sections?.counted ?? ''}` : `${k}:-`)).join(',');
  return [data.source, data.boletim ?? '', data.stale ? `stale:${data.staleSince || ''}` : '', (data.staleUfs || []).join('.'), data.liveError ? 'live-error' : '', places].join('|');
}

/**
 * Live read of one office.
 * `previous` is the last good live data (or null). Returns a full result set; throws NotPublished
 * when nothing exists yet, Unavailable when the TSE cannot be read.
 *
 * President: each cycle asks only for the national file. The states and abroad are asked for only
 * when the national file changed (a new totalization), plus any place that failed last time.
 * That is 1 request per cycle while nothing changes, instead of 29.
 *
 * Governors (no national file): each cycle asks for the states in the race (in the 2º turno, only the
 * ones the TSE sent to a runoff: 7 in 2026). The browser revalidates them with ETag, so an unchanged
 * file is a 304 of a few bytes, and a state whose boletim did not change keeps its previous object
 * (same signature, nothing redrawn).
 */
export async function liveOffice(round, office, previous = null) {
  const federal = OFFICES[office].federal;
  const seenBefore = !!previous;
  let br = null;
  if (federal) {
    const raw = await getJson(tseResultUrl(round, office, 'br'), { fresh: true }); // throws Unavailable
    if (!raw) {
      if (seenBefore) throw new Unavailable('O TSE deixou de responder o arquivo nacional.');
      throw new NotPublished('O TSE ainda não publicou resultados deste turno.');
    }
    br = normalizeResult(raw);
  }
  const ufs = round > 1 && !federal ? await runoffUfs(office) : UFS;
  const allPlaces = placesOf(office, ufs).filter(p => p !== 'br');
  // State offices before the polls close (PR #1's pollsClosed, the same switch as the 5 min → 30 s cadence),
  // while nothing was seen yet: one state stands in for the others (like the national file for president),
  // so a waiting page costs 1 request, not 7 or 27.
  if (!federal && !seenBefore && !pollsClosed(round) && allPlaces.length > 1) {
    const probe = await getJson(tseResultUrl(round, office, allPlaces[0]), { fresh: true }); // throws Unavailable
    if (!probe) throw new NotPublished('O TSE ainda não publicou resultados deste turno.');
  }
  const unchanged = federal && previous?.br && previous.br.generated === br.generated && previous.br.updated === br.updated;
  const retry = new Set((previous?.staleUfs || []).map(p => p.toLowerCase()));
  const places = unchanged ? allPlaces.filter(p => retry.has(p)) : allPlaces;

  let failures = 0;
  const rows = await pool(places, 8, async place => {
    try {
      const raw = await getJson(tseResultUrl(round, office, place), { fresh: true });
      return raw ? normalizeResult(raw) : null;
    } catch (error) {
      failures++;
      return { failed: error };
    }
  });
  const fetched = new Map(places.map((p, i) => [p, rows[i]]));
  const data = { uf: {}, staleUfs: [] };
  if (br) data.br = unchanged ? previous.br : br;
  let found = br ? 1 : 0;
  for (const place of allPlaces) {
    if (!fetched.has(place)) { // not asked for: nothing changed since the last good read
      const old = getPlace(previous, place);
      if (old) setPlace(data, place, old);
      continue;
    }
    const row = fetched.get(place);
    if (row && !row.failed) {
      // Same boletim as last time: keep the previous object, so nothing downstream is recomputed.
      const old = getPlace(previous, place);
      setPlace(data, place, old && old.generated === row.generated && old.updated === row.updated ? old : row);
      found++;
      continue;
    }
    // Missing or failed: reuse the last good result of this place, and say so.
    const old = getPlace(previous, place);
    if (old) { setPlace(data, place, old); data.staleUfs.push(place.toUpperCase()); }
    else if (row?.failed) data.staleUfs.push(place.toUpperCase());
  }
  if (!found && !unchanged) {
    if (failures || seenBefore) throw new Unavailable(failures ? UNREACHABLE : 'O TSE deixou de responder os arquivos de resultado.');
    throw new NotPublished('O TSE ainda não publicou resultados deste turno.');
  }
  return data;
}

const runoffCache = new Map();
/**
 * States with a runoff for a state office, from the TSE "situação" in the shipped 1º turno copy
 * (all 27 if the copy cannot be read, so a missing file never hides a race).
 */
export function runoffUfs(office) {
  return cached(runoffCache, office, () => getJson(bundleUrl(`tse/1/${office}.json`)).catch(() => null))
    .then(first => (first?.uf ? UFS.filter(uf => (first.uf[uf]?.candidates || []).some(c => c.kind === 'segundo-turno')) : UFS));
}

async function bundleOffice(round, office, fresh = false) {
  // First load: a plain request, so the browser reuses the <link rel="preload"> of index.html.
  const data = await getJson(bundleUrl(`tse/${round}/${office}.json`), { fresh }).catch(() => null);
  if (!data) throw new NotPublished('Sem cópia local destes resultados.');
  return data;
}

const isNewer = (a, b) => (latestUpdate(a)?.getTime() || 0) > (latestUpdate(b)?.getTime() || 0);

/**
 * Tries the sources in the order the mode asks for. `previous` is what is on screen now: when the
 * TSE fails, the newest of (last good data, shipped copy) is kept, flagged with `liveError` and
 * `stale`, instead of an empty "not published" state.
 */
export async function loadWithFallback(round, live, bundle, previous = null, now = new Date()) {
  const mode = modeFor(round);
  const order = mode === 'live-only' ? ['tse'] : mode === 'bundle-only' ? ['local']
    : mode === 'bundle-first' ? ['local', 'tse'] : ['tse', 'local'];
  const lastLive = previous && !previous.status ? (previous.lastLive || (previous.source === 'tse' ? previous : null)) : null;
  let notPublished = null, failure = null, copy = null;
  for (const source of order) {
    try {
      if (source === 'tse') {
        const fresh = await live(lastLive);
        const data = { ...fresh, source: 'tse', checkedAt: now };
        if (data.staleUfs?.length) data.staleSince = previous?.staleSince || now; else delete data.staleUfs;
        return data;
      }
      copy = await bundle();
      if (!failure || mode === 'bundle-first') break;
    } catch (error) {
      if (error instanceof NotPublished) notPublished ||= error;
      else failure ||= error;
    }
  }
  if (copy && !failure) return { ...copy, source: 'local', checkedAt: now };
  if (failure && (copy || lastLive)) {
    // TSE unavailable: show the newest good data we have and keep trying.
    const keep = lastLive && (!copy || !isNewer(copy, lastLive)) ? lastLive : { ...copy, source: 'local' };
    return {
      ...keep,
      lastLive,
      stale: true,
      liveError: failure.message,
      staleSince: previous?.staleSince || now,
      checkedAt: now,
    };
  }
  if (copy) return { ...copy, source: 'local', checkedAt: now };
  const error = failure || notPublished;
  return { status: error instanceof NotPublished ? 'not-published' : 'error', message: error?.message, source: null, checkedAt: now, uf: {} };
}

/** President, governors or senators: every place for one round. */
export const loadOffice = (round, office, previous = null) =>
  loadWithFallback(round, last => liveOffice(round, office, last), () => bundleOffice(round, office, !!previous), previous);

/** Proportional offices (deputies) are loaded one state at a time. */
export function loadProportional(round, office, uf, previous = null) {
  return loadWithFallback(round,
    async last => {
      const raw = await getJson(tseResultUrl(round, office, uf.toLowerCase()), { fresh: true });
      if (!raw) {
        if (last) throw new Unavailable('O TSE deixou de responder este arquivo de resultado.');
        throw new NotPublished('O TSE ainda não publicou este resultado.');
      }
      return { result: normalizeResult(raw, { compact: true }) };
    },
    async () => {
      const data = await getJson(bundleUrl(`tse/${round}/${office}/${uf}.json`), { fresh: true }).catch(() => null);
      if (!data) throw new NotPublished('Sem cópia local deste resultado.');
      return data;
    }, previous);
}

// ---- Shipped files that change rarely: cached in memory with an expiry date. ----

/** Cache entries expire after this long, so a tab left open picks up a republished copy. */
export const STATIC_TTL_MS = 10 * 60_000;
export function cached(store, key, load, now = Date.now()) {
  const hit = store.get(key);
  if (hit && now - hit.at < STATIC_TTL_MS) return hit.promise;
  const promise = load().then(value => {
    // Keep a good value if the refresh fails.
    if (value == null && hit) return hit.promise;
    return value;
  });
  store.set(key, { at: now, promise });
  return promise;
}

const codesCache = new Map();
/** IBGE municipality code → [TSE code, UF]. */
export const loadMunicipalityCodes = () =>
  cached(codesCache, 'codes', () => getJson(bundleUrl('tse/municipios.json')).then(data => data || null).catch(() => null))
    .then(data => data || {});

/** One municipality, straight from the TSE (any office). Throws like liveOffice; null if unknown. */
export async function liveMunicipality(round, office, ibge, previous = null) {
  const codes = await loadMunicipalityCodes();
  const hit = codes[ibge];
  if (!hit) throw new NotPublished('Município sem código no TSE.');
  const [code, uf] = hit;
  const raw = await getJson(tseResultUrl(round, office, uf.toLowerCase() + code), { fresh: true });
  if (!raw) {
    if (previous) throw new Unavailable('O TSE deixou de responder o arquivo deste município.');
    throw new NotPublished('O TSE ainda não publicou o resultado deste município.');
  }
  return { result: normalizeResult(raw) };
}

/**
 * Boletim of the office that a municipality follows: the national file for president, the state
 * file otherwise (same generation/totalization times liveOffice compares). null while the office
 * has no results on screen.
 */
export function boletimKey(officeData, uf) {
  if (!officeData || officeData.status) return null;
  const row = officeData.br || officeData.uf?.[uf];
  return row ? `${officeData.source || ''}|${row.generated || ''}|${row.updated || ''}` : null;
}

/**
 * Municipality loader for the polled feeds: live only (there is no shipped per-municipality file).
 * `key` is the boletim of the office (see boletimKey). The municipality file is asked for only when
 * that boletim changes, or to retry after a failure, so a cycle with the same boletim costs no request
 * beyond the national file. Without `key` (undefined) it always asks.
 */
export async function loadMunicipality(round, office, ibge, previous = null, now = new Date(), key) {
  const lastLive = previous && !previous.status ? previous : null;
  if (key !== undefined) {
    // The office has nothing on screen yet (not published, or the TSE never answered): wait for it.
    if (key === null) return lastLive ? { ...lastLive, checkedAt: now } : { status: 'not-published', message: 'Aguardando o primeiro boletim do TSE.', checkedAt: now, boletim: null };
    // Same boletim and the last read was good: nothing new to fetch.
    if (previous && previous.boletim === key && !previous.liveError && previous.status !== 'error') return { ...previous, checkedAt: now };
  }
  try {
    const fresh = await liveMunicipality(round, office, ibge, lastLive);
    return { ...fresh, source: 'tse', checkedAt: now, boletim: key };
  } catch (error) {
    if (error instanceof NotPublished) return { status: 'not-published', message: error.message, checkedAt: now, boletim: key };
    if (lastLive) return { ...lastLive, stale: true, liveError: error.message, staleSince: lastLive.staleSince || now, checkedAt: now };
    return { status: 'error', message: error.message, checkedAt: now };
  }
}

const indexCache = new Map(), packCache = new Map();
/** Municipal results of an office exist in the shipped copy of this round (older indexes: president only). */
const hasMunicipal = (index, office) => !!(index?.municipal?.[office] || (office === 'presidente' && index?.municipalities));
export const loadIndex = round =>
  cached(indexCache, round, () => getJson(bundleUrl(`tse/${round}/index.json`), { fresh: true }).catch(() => null));

/** Results of one office in every municipality of a state (shipped copy, with its `fetchedAt`), or null. */
export function loadMunicipalPack(round, office, uf) {
  if (!MUNICIPAL_OFFICES.includes(office)) return Promise.resolve(null);
  return cached(packCache, `${round}/${office}/${uf}`, () => loadIndex(round)
    // Only ask for the file when the shipped index says it exists (no 404 noise before a round is copied).
    .then(index => (hasMunicipal(index, office) ? getJson(bundleUrl(`tse/${round}/${office}-municipios/${uf}.json`), { fresh: true }) : null))
    .catch(() => null));
}

const cache2022 = new Map();
export function load2022(path) {
  if (!cache2022.has(path)) cache2022.set(path, getJson(bundleUrl(`2022/${path}`)).catch(() => null));
  return cache2022.get(path);
}

/** For tests: forget every in-memory cache. */
export function resetCaches() { codesCache.clear(); runoffCache.clear(); indexCache.clear(); packCache.clear(); cache2022.clear(); }

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { POLL_ELECTION_DAY_MS, POLL_LIVE_MS, POLL_WAITING_MS, ROUNDS } from '../config.js';
import { loadMunicipality, loadMunicipalPack, loadOffice, loadProportional } from '../data/source.js';

const officeCache = new Map();

export function isFinished(data) {
  if (!data || data.status) return false;
  if (data.br) return data.br.finished;
  if (data.result) return data.result.finished;
  const states = Object.values(data.uf || {});
  return states.length > 0 && states.every(s => s.finished);
}

/** How long to wait before checking again, or null to stop polling. */
export function pollDelay(data, round, now = Date.now()) {
  if (!data) return null;
  if (data.status === 'not-published' || data.status === 'error') {
    const start = new Date(ROUNDS[round].closesAt).getTime();
    // From an hour before the polls close until a day later, check every minute.
    if (now >= start - 3600_000 && now <= start + 86400_000) return POLL_ELECTION_DAY_MS;
    return now < start ? POLL_WAITING_MS : null;
  }
  if (data.source === 'tse' && !isFinished(data)) return POLL_LIVE_MS;
  return null;
}

/** Generic loader with polling; `load` must be stable for a given `key`. */
function usePolledData(key, load, round, cache) {
  const [state, setState] = useState(() => ({ data: cache?.get(key) || null, loading: !cache?.get(key) }));
  const timer = useRef(), current = useRef(key);
  current.current = key;

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    setState(s => ({ ...s, loading: true }));
    const data = await load();
    if (current.current !== key) return;
    cache?.set(key, data);
    setState({ data, loading: false });
    const delay = pollDelay(data, round);
    if (delay) timer.current = setTimeout(function tick() {
      if (document.hidden) { timer.current = setTimeout(tick, 5000); return; }
      run();
    }, delay);
  }, [key]);

  useEffect(() => {
    const cached = cache?.get(key);
    setState({ data: cached || null, loading: true });
    run();
    return () => clearTimeout(timer.current);
  }, [key]);

  return { ...state, refresh: run };
}

export const useOffice = (round, office) =>
  usePolledData(`${round}|${office}`, () => loadOffice(round, office), round, officeCache);

const proportionalCache = new Map();
export const useProportional = (round, office, uf) =>
  usePolledData(`${round}|${office}|${uf}`, () => (uf ? loadProportional(round, office, uf) : Promise.resolve(null)), round, proportionalCache);

/** One value from a promise-returning function, re-run when `key` changes. */
export function useAsync(key, fn) {
  const [state, setState] = useState({ value: undefined, loading: true });
  useEffect(() => {
    let alive = true;
    setState(s => ({ value: s.key === key ? s.value : undefined, loading: true, key }));
    Promise.resolve(fn()).then(value => alive && setState({ value, loading: false, key }), () => alive && setState({ value: null, loading: false, key }));
    return () => { alive = false; };
  }, [key]);
  return state;
}

export const useMunicipalPack = (round, uf) => useAsync(`${round}|${uf}`, () => (uf && uf !== 'ZZ' ? loadMunicipalPack(round, uf) : null));
export const useLiveMunicipality = (round, office, ibge, enabled) =>
  useAsync(`${round}|${office}|${ibge}|${enabled}`, () => (enabled && ibge ? loadMunicipality(round, office, ibge) : null));

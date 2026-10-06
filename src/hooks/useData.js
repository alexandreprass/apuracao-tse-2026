import { useEffect, useReducer, useState } from 'preact/hooks';
import { Feed, getFeed, isFinished, pollDelay } from '../data/feed.js';
import { loadMunicipality, loadMunicipalPack, loadOffice, loadProportional, STATIC_TTL_MS } from '../data/source.js';

export { isFinished, pollDelay };

const EMPTY = { data: null, loading: false, checkedAt: null, refresh: () => {}, feed: null };

/**
 * Subscribes to a feed. By default the component only re-renders on a new boletim ("data");
 * the status bar also listens to "check" and "loading".
 */
export function useFeed(feed, events = ['data']) {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    if (!feed) return;
    const off = feed.subscribe(event => { if (events.includes(event)) force(); });
    force();
    return off;
  }, [feed]);
  if (!feed) return EMPTY;
  return { data: feed.data, loading: feed.loading || !feed.data, checkedAt: feed.checkedAt, refresh: feed.refresh, feed };
}

export const officeFeed = (round, office) => getFeed(`office|${round}|${office}`,
  () => new Feed(previous => loadOffice(round, office, previous), { delay: data => pollDelay(data, round) }));

export const useOffice = (round, office) => useFeed(officeFeed(round, office));

export const useProportional = (round, office, uf) => useFeed(uf ? getFeed(`prop|${round}|${office}|${uf}`,
  () => new Feed(previous => loadProportional(round, office, uf, previous), { delay: data => pollDelay(data, round) })) : null);

/** One municipality read live from the TSE, polled like the rest while the count runs. */
export const municipalityFeed = (round, office, ibge) => getFeed(`mu|${round}|${office}|${ibge}`,
  () => new Feed(previous => loadMunicipality(round, office, ibge, previous), { delay: data => pollDelay(data, round) }));

export const useLiveMunicipality = (round, office, ibge, enabled) =>
  useFeed(enabled && ibge ? municipalityFeed(round, office, ibge) : null);

/** One value from a promise-returning function, re-run when `key` changes (and every `every` ms). */
export function useAsync(key, fn, every = 0) {
  const [state, setState] = useState({ value: undefined, loading: true });
  useEffect(() => {
    let alive = true;
    setState(s => ({ value: s.key === key ? s.value : undefined, loading: true, key }));
    const run = () => Promise.resolve(fn()).then(
      value => alive && setState(s => (s.value === value && !s.loading ? s : { value, loading: false, key })),
      () => alive && setState(s => ({ value: s.key === key ? s.value ?? null : null, loading: false, key })));
    run();
    const timer = every ? setInterval(() => { if (!document.hidden) run(); }, every) : null;
    return () => { alive = false; clearInterval(timer); };
  }, [key]);
  return state;
}

/** Shipped municipal file of a state; re-read when its cache expires, for copies republished during a count. */
export const useMunicipalPack = (round, uf) =>
  useAsync(`${round}|${uf}`, () => (uf && uf !== 'ZZ' ? loadMunicipalPack(round, uf) : null), STATIC_TTL_MS);

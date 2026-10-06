import { useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import { Feed, followFeed, getFeed, isFinished, municipalityFeed as createMunicipalityFeed, pollDelay } from '../data/feed.js';
import { loadMunicipalPack, loadOffice, loadProportional, STATIC_TTL_MS } from '../data/source.js';

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

/** One office's feed; a null office loads nothing (e.g. governors on the president page until search opens). */
export const useOffice = (round, office) => useFeed(office ? officeFeed(round, office) : null);

export const useProportional = (round, office, uf) => useFeed(uf ? getFeed(`prop|${round}|${office}|${uf}`,
  () => new Feed(previous => loadProportional(round, office, uf, previous), { delay: data => pollDelay(data, round) })) : null);

/** Reads a proportional candidate's municipal result using the state's proportional bulletin as its version key. */
export function useProportionalMunicipality(round, office, ibge, proportionalFeed, uf) {
  const parent = useMemo(() => proportionalFeed ? {
    get data() {
      const current = proportionalFeed.data;
      return current?.result ? { source: current.source, uf: { [uf]: current.result } } : current;
    },
    subscribe: listener => proportionalFeed.subscribe(listener),
  } : null, [proportionalFeed, uf]);
  const feed = ibge && parent ? getFeed(`mu-prop|${round}|${office}|${ibge}`,
    () => createMunicipalityFeed(round, office, ibge, parent)) : null;
  useEffect(() => (feed && parent ? followFeed(feed, parent, feed.keyOf) : undefined), [feed, parent]);
  return useFeed(feed);
}

/** One municipality read live from the TSE; it reloads when the office's boletim changes. */
export const municipalityFeed = (round, office, ibge) => getFeed(`mu|${round}|${office}|${ibge}`,
  () => createMunicipalityFeed(round, office, ibge, officeFeed(round, office)));

export function useLiveMunicipality(round, office, ibge, enabled) {
  const feed = enabled && ibge ? municipalityFeed(round, office, ibge) : null;
  useEffect(() => (feed ? followFeed(feed, officeFeed(round, office), feed.keyOf) : undefined), [feed]);
  return useFeed(feed);
}

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

/** Shipped municipal file of one office and state; re-read when its cache expires, for copies republished during a count. */
export const useMunicipalPack = (round, office, uf) =>
  useAsync(`${round}|${office}|${uf}`, () => (uf && uf !== 'ZZ' ? loadMunicipalPack(round, office, uf) : null), STATIC_TTL_MS);

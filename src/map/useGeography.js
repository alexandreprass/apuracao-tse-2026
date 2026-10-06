import { useEffect, useState } from 'preact/hooks';
import { addMunicipalities, addPlaces, createStateGeography } from './geography.js';

const BASE = import.meta.env?.BASE_URL || '/';
const getJson = async path => {
  const response = await fetch(BASE + path);
  if (!response.ok) throw new Error(`Não foi possível carregar o mapa (HTTP ${response.status}).`);
  return response.json();
};

// One shared, growing geography: the states mesh (first visit), then each opened state's municipalities,
// then the list of municipality names (search, "Meu município"). Listeners re-render on every addition.
let geo = null, base = null;
const ufLoads = new Map();
let placesLoad = null;
const listeners = new Set();
const publish = next => { geo = next; for (const fn of listeners) fn(geo); };

/** States only (≈29 kB gzip): enough to draw Brazil. */
export function loadGeography() {
  base ||= getJson('data/geo/estados.json').then(mesh => { if (!geo) publish(createStateGeography(mesh)); return geo; })
    .catch(error => { base = null; throw error; });
  return base;
}

/** The municipalities of one state, downloaded the first time that state is opened. */
export function loadState(uf) {
  if (!uf || uf === 'ZZ') return Promise.resolve(geo);
  if (!ufLoads.has(uf)) {
    ufLoads.set(uf, Promise.all([loadGeography(), getJson(`data/geo/mun/${uf}.json`)])
      .then(([, topology]) => { if (!geo.states[uf]?.loaded) publish(addMunicipalities(geo, uf, topology)); return geo; })
      .catch(error => { ufLoads.delete(uf); throw error; }));
  }
  return ufLoads.get(uf);
}

/** Names and states of every municipality (search and the saved "Meu município"), on demand. */
export function loadPlaces() {
  placesLoad ||= Promise.all([loadGeography(), getJson('data/geo/municipios.json')])
    .then(([, rows]) => { if (!geo.places) publish(addPlaces(geo, rows)); return geo; })
    .catch(error => { placesLoad = null; throw error; });
  return placesLoad;
}

/** For tests: forget everything loaded. */
export function resetGeography() { geo = null; base = null; placesLoad = null; ufLoads.clear(); }

/**
 * The geography a page needs: `needed` loads the states; `uf` adds that state's municipalities;
 * `places` adds the names of all municipalities.
 */
export function useGeography(needed, { uf = null, places = false } = {}) {
  const [state, setState] = useState({ geo, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const on = next => setState({ geo: next, error: null });
    listeners.add(on);
    return () => listeners.delete(on);
  }, []);
  useEffect(() => {
    if (!needed) return;
    const fail = error => setState(s => ({ geo: s.geo, error }));
    loadGeography().then(on => setState({ geo, error: null }), fail);
    if (uf) loadState(uf).catch(fail);
    if (places) loadPlaces().catch(fail);
  }, [needed, uf, places, attempt]);
  return { ...state, retry: () => { setState({ geo, error: null }); setAttempt(a => a + 1); } };
}

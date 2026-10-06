import { useEffect, useState } from 'preact/hooks';
import { createGeography } from './geography.js';

const BASE = import.meta.env?.BASE_URL || '/';
let promise = null, value = null;

/** The municipal mesh (≈360 kB gzip), downloaded once and only when a page needs the map or the search. */
export function loadGeography() {
  promise ||= fetch(BASE + 'data/brasil.topo.json')
    .then(response => {
      if (!response.ok) throw new Error(`Não foi possível carregar o mapa (HTTP ${response.status}).`);
      return response.json();
    })
    .then(topology => (value = createGeography(topology, { m: {} })))
    .catch(error => { promise = null; throw error; });
  return promise;
}

export function useGeography(needed) {
  const [state, setState] = useState({ geo: value, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!needed || state.geo) return;
    let alive = true;
    loadGeography().then(geo => alive && setState({ geo, error: null }), error => alive && setState({ geo: null, error }));
    return () => { alive = false; };
  }, [needed, attempt]);
  return { ...state, retry: () => { setState({ geo: null, error: null }); setAttempt(a => a + 1); } };
}

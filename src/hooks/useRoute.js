import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CLOCK } from '../data/clock.js';
import { OFFICES, STATES } from '../data/mocks.js';
import { normalize } from '../lib/format.js';

export const MAP_UNITS = ['estados', 'municipios', 'eleitorado'];
export const MAP_METRICS = ['lider', 'apurado'];

// The whole view is a link: #UF/municipalityId/zone?cargo=senado&hora=20h15&mapa=municipios&cor=apurado
// Anything left out falls back to: Brasil, Presidente, ao vivo, estados, quem lidera.
function parse(geo) {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const [first, second, third] = path.split('/');
  const params = new URLSearchParams(query);
  const municipality = geo.byId.get(second);
  const zone = Number(third);
  const [, hours, minutes] = /^(\d{1,2})h(\d{2})$/.exec(params.get('hora') ?? '') ?? [];
  const replay = hours ? Math.max(CLOCK.start, Math.min(CLOCK.end, hours * 60 + +minutes)) : null;
  return {
    uf: municipality?.uf ?? (STATES[first] ? first : null),
    municipalityId: municipality?.id ?? null,
    zone: municipality && third && Number.isFinite(zone) ? zone : null,
    office: OFFICES.find(office => normalize(office) === params.get('cargo')) ?? OFFICES[0],
    unit: MAP_UNITS.includes(params.get('mapa')) ? params.get('mapa') : MAP_UNITS[0],
    metric: MAP_METRICS.includes(params.get('cor')) ? params.get('cor') : MAP_METRICS[0],
    replay,
  };
}

function toHash({ uf, municipalityId, zone, office, unit, metric, replay }) {
  const path = [uf, municipalityId, municipalityId && zone != null ? zone : null].filter(part => part != null).join('/');
  const params = new URLSearchParams();
  if (office !== OFFICES[0]) params.set('cargo', normalize(office));
  if (replay != null) params.set('hora', `${Math.floor(replay / 60)}h${String(replay % 60).padStart(2, '0')}`);
  if (unit !== MAP_UNITS[0]) params.set('mapa', unit);
  if (metric !== MAP_METRICS[0]) params.set('cor', metric);
  const query = params.toString();
  return path || query ? `#${path}${query ? '?' + query : ''}` : '';
}

export function useRoute(geo) {
  const [route, setRoute] = useState(() => parse(geo));
  const latest = useRef(route);
  latest.current = route;

  useEffect(() => {
    const sync = () => setRoute(parse(geo));
    addEventListener('popstate', sync);
    addEventListener('hashchange', sync);
    return () => {
      removeEventListener('popstate', sync);
      removeEventListener('hashchange', sync);
    };
  }, [geo]);

  const actions = useMemo(() => {
    // Moving to another place adds a history entry, so the browser's back button
    // steps out one level; everything else just rewrites the current entry.
    const go = (changes, { push = false } = {}) => {
      const next = { ...latest.current, ...changes };
      const url = toHash(next) || location.pathname + location.search;
      if (push) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
      latest.current = next;
      setRoute(next);
    };
    const openState = uf => go({ uf: uf || null, municipalityId: null, zone: null }, { push: true });
    return {
      openState,
      openMunicipality: id => {
        const municipality = geo.byId.get(id);
        if (municipality) go({ uf: municipality.uf, municipalityId: id, zone: null }, { push: true });
      },
      back: () => openState(latest.current.municipalityId ? latest.current.uf : null),
      selectZone: zone => go({ zone }),
      setOffice: office => go({ office }),
      setUnit: unit => go({ unit }),
      setMetric: metric => go({ metric }),
      setReplay: replay => go({ replay }),
    };
  }, [geo]);

  return { ...route, ...actions };
}

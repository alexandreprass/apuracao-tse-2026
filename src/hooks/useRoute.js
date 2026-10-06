import { useEffect, useMemo, useState } from 'preact/hooks';
import { OFFICES } from '../config.js';
import { STATES, ufOfIbge } from '../data/states.js';

// The whole view is a link: #/1turno/presidente/SP/3550308, #/2turno/governador/AC,
// #/comparar or #/sobre. Anything missing falls back to the 1º turno, president, Brasil.
export const PAGES = ['comparar', 'sobre'];

export function parseHash(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
  // A malformed escape ("%E0") must not take the app down: keep the raw text instead.
  const parts = path.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return part; } });
  let params;
  try { params = new URLSearchParams(query); } catch { params = new URLSearchParams(); }
  if (PAGES.includes(parts[0])) return { page: parts[0], round: 1, office: 'presidente', uf: null, ibge: null, focus: params.get('c') };
  const round = parts[0] === '2turno' ? 2 : 1;
  let office = OFFICES[parts[1]] ? parts[1] : 'presidente';
  if (!OFFICES[office].rounds.includes(round)) office = 'presidente';
  const code = (parts[2] || '').toUpperCase();
  let uf = (STATES[code] || (code === 'ZZ' && OFFICES[office].federal)) ? code : null;
  let ibge = uf && uf !== 'ZZ' && /^\d{7}$/.test(parts[3] || '') ? parts[3] : null;
  // The municipality must belong to the state in the address; if not, follow the municipality.
  if (ibge && ufOfIbge(ibge) !== uf) {
    if (ufOfIbge(ibge)) uf = ufOfIbge(ibge); else ibge = null;
  }
  return { page: 'resultados', round, office, uf, ibge, focus: params.get('c') };
}

export function toHash({ page = 'resultados', round = 1, office = 'presidente', uf = null, ibge = null, focus = null }) {
  if (PAGES.includes(page)) return `#/${page}`;
  const path = [`${round}turno`, office, uf, uf && ibge].filter(Boolean).join('/');
  return `#/${path}${focus ? `?c=${encodeURIComponent(focus)}` : ''}`;
}

/**
 * The address with the municipality's real state, or null when it is already right. A link like
 * #/1turno/presidente/SP/2927408 (Salvador) shows Bahia, so the address must say /BA/ too.
 * Everything else in the address (the query, e.g. ?c= or ?fonte=) is kept as it is.
 */
export function canonicalHash(hash) {
  const route = parseHash(hash);
  if (route.page !== 'resultados' || !route.ibge) return null;
  const [path, ...query] = String(hash || '').replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if ((parts[2] || '').toUpperCase() === route.uf) return null;
  parts[2] = route.uf;
  return `#/${parts.join('/')}${query.length ? `?${query.join('?')}` : ''}`;
}

/** Rewrites a wrong state in the address in place (replaceState: no extra history entry, no hashchange). */
export function fixAddress(loc = location, hist = history) {
  const fixed = canonicalHash(loc.hash);
  if (fixed) hist.replaceState(hist.state, '', `${loc.pathname}${loc.search}${fixed}`);
  return fixed;
}

export function useRoute() {
  const [route, setRoute] = useState(() => { fixAddress(); return parseHash(location.hash); });

  useEffect(() => {
    const sync = () => { fixAddress(); setRoute(parseHash(location.hash)); };
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);

  const actions = useMemo(() => ({
    go(changes) {
      const next = { ...parseHash(location.hash), focus: null, ...changes };
      if (!OFFICES[next.office].rounds.includes(next.round)) next.office = 'presidente';
      const hash = toHash(next);
      if (hash !== location.hash) location.hash = hash;
      else setRoute(parseHash(hash));
    },
  }), []);

  return { ...route, ...actions };
}

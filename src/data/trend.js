// "Evolução da apuração": shares of the leading candidates as the count advances, kept in this
// browser (localStorage) so the chart does not start empty when the reader comes back.
import { storage as defaultStorage } from '../lib/storage.js';

const PREFIX = 'apuracao:evolucao:v1:';
const INDEX = PREFIX + 'index';
export const MAX_POINTS = 300;
export const MAX_SERIES = 40;

const valid = point => point && Number.isFinite(point.counted) && Array.isArray(point.shares)
  && point.shares.every(s => s && typeof s.n === 'string' && Number.isFinite(s.pct));

export function readTrend(key, store = defaultStorage) {
  const list = store.get(PREFIX + key, []);
  return Array.isArray(list) ? list.filter(valid) : [];
}

/**
 * Adds a point when the share of sections counted moved; returns the full list.
 * Only official TSE results (live or copied) reach this function.
 */
export function recordTrend(key, result, store = defaultStorage) {
  const list = readTrend(key, store);
  if (!result?.sections) return list;
  const counted = result.sections.pct;
  const last = list[list.length - 1];
  if (last && last.counted === counted && last.time === result.updated) return list;
  if (last && counted < last.counted) return list; // older boletim (e.g. a stale copy): ignore
  list.push({
    counted,
    time: result.updated,
    shares: result.candidates.slice(0, 3).map(c => ({ n: String(c.n), name: c.name, party: c.party, pct: c.pct })),
  });
  while (list.length > MAX_POINTS) list.splice(1, 1); // keep the first point, drop the oldest after it
  store.set(PREFIX + key, list);
  // Keep at most MAX_SERIES places, most recently updated first.
  const index = [key, ...store.get(INDEX, []).filter(k => k !== key)];
  for (const old of index.splice(MAX_SERIES)) store.remove(PREFIX + old);
  store.set(INDEX, index);
  return list;
}

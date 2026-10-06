// "Evolução da apuração": shares of the leading candidates as the count advances, kept in this
// browser (localStorage) so the chart does not start empty when the reader comes back.
import { storage as defaultStorage } from '../lib/storage.js';
import { parseTseDate } from './normalize.js';

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
 * A newer boletim with the same % apurado replaces the last point instead of adding a duplicate.
 * An older boletim (fewer sections, or an earlier time) is ignored.
 * Only official TSE results (live or copied) reach this function.
 */
export function recordTrend(key, result, store = defaultStorage) {
  const list = readTrend(key, store);
  if (!result?.sections) return list;
  const counted = result.sections.pct;
  const last = list[list.length - 1];
  if (last && last.counted === counted && last.time === result.updated) return list;
  if (last && counted < last.counted) return list; // older boletim (e.g. a stale copy): ignore
  const point = {
    counted,
    time: result.updated,
    shares: result.candidates.slice(0, 3).map(c => ({ n: String(c.n), name: c.name, party: c.party, pct: c.pct })),
  };
  if (last && last.counted === counted) {
    // Same % apurado, another boletim time: an earlier one is ignored, a later one replaces the last point.
    const before = parseTseDate(last.time), now = parseTseDate(result.updated);
    if (before && now && now < before) return list;
    list[list.length - 1] = point;
  } else {
    list.push(point);
  }
  while (list.length > MAX_POINTS) list.splice(1, 1); // keep the first point, drop the oldest after it
  store.set(PREFIX + key, list);
  // Keep at most MAX_SERIES places, most recently updated first.
  const index = [key, ...store.get(INDEX, []).filter(k => k !== key)];
  for (const old of index.splice(MAX_SERIES)) store.remove(PREFIX + old);
  store.set(INDEX, index);
  return list;
}

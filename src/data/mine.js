import { hasRunoff, runoffCandidates } from './analysis.js';

/** Rows of the "Meu município" card: Presidente always; Governador only where the TSE marked a governor runoff. */
export const mineOffices = (uf, governorFirst) =>
  (governorFirst && !governorFirst.status && uf && hasRunoff(governorFirst, uf) ? ['presidente', 'governador'] : ['presidente']);

/** The two finalists of a race, from its 1º turno result (by number, as in the municipal files). */
export const finalistNumbers = race => runoffCandidates(race).map(c => c.n);

const pick = (result, numbers) => (numbers?.length
  ? numbers.map(n => result.candidates.find(c => c.n === n)).filter(Boolean)
  : result.candidates.filter(c => c.votes > 0).slice(0, 2));

/**
 * What one row shows. `published`: the office's 2º turno is out; `live`: the municipality feed data;
 * `copyRow`/`firstRow`: shipped 2º/1º turno rows of the city; `numbers`: the finalists.
 * Same rules as the national numbers: live first, else the shipped copy; the last good boletim stays, flagged as stale.
 */
export function mineRow({ published, live, copyRow, firstRow, numbers, loading = false }) {
  if (published) {
    const liveResult = live?.result;
    const result = liveResult || copyRow;
    if (result) {
      return { phase: liveResult ? 'live' : 'copy', candidates: pick(result, numbers), apurado: result.sections?.pct || 0,
        stale: !!(liveResult && live.liveError), updated: result.updated || null };
    }
    return { phase: loading ? 'loading' : live?.status === 'error' ? 'error' : 'not-published', candidates: [] };
  }
  // Still reading the files: "carregando", never "aguardando o TSE" for a result that is on its way.
  return firstRow ? { phase: 'first', candidates: pick(firstRow, numbers), apurado: firstRow.sections?.pct ?? null }
    : { phase: loading ? 'loading' : 'waiting', candidates: [] };
}

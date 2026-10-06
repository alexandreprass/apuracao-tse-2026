// "Dá pra virar?": the current gap and an ESTIMATE of the votes still to be counted.
// Nothing here is a result: the elected candidate always comes from the status published by the TSE.

/**
 * Estimate from the counted sections: remaining sections × average turnout per counted section,
 * times the share of valid votes so far. Returns null when there is nothing to estimate
 * (no sections counted yet, count finished, fewer than two candidates with votes).
 */
export function comebackEstimate(result) {
  const s = result?.sections;
  const [first, second] = (result?.candidates || []).filter(c => c.votes > 0);
  if (!s?.total || !s.counted || s.counted >= s.total || !first || !second || result.finished) return null;
  const sectionsLeft = s.total - s.counted;
  const turnoutPerSection = (result.turnout || 0) / s.counted;
  const validRate = result.turnout ? (result.validComputed || result.valid || 0) / result.turnout : 0;
  const remainingTurnout = Math.round(sectionsLeft * turnoutPerSection);
  const remainingValid = Math.round(remainingTurnout * validRate);
  const gap = first.votes - second.votes;
  // Share of the remaining valid votes the runner-up would need to tie (two-candidate race).
  const neededShare = remainingValid > 0 ? (100 * (remainingValid + gap)) / (2 * remainingValid) : Infinity;
  return {
    first, second, gap,
    sectionsLeft, turnoutPerSection, remainingTurnout, remainingValid,
    neededShare,
    reachable: remainingValid > gap,
  };
}

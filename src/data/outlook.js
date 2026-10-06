/**
 * What the uncounted sections can still change.
 * `runoff` only applies where a majority of valid votes is required to win outright.
 */
export function outlook(result, { majorityRule = false } = {}) {
  const validRate = result.cast ? result.valid / result.cast : 1;
  // turnout is cast / (electorate * completion), so this is the cast still expected.
  const remaining = Math.round(result.electorate * result.turnout * (1 - result.completion) * validRate);
  const gap = Math.abs(result.votes[0] - result.votes[1]);
  const leaderVotes = result.votes[result.winner];
  const finalValid = result.valid + remaining;

  const status = result.completion >= .9995 ? 'closed' : remaining < gap ? 'decided' : 'open';
  let runoff = null;
  if (majorityRule) {
    if (leaderVotes > finalValid / 2) runoff = 'outright';
    else if (leaderVotes + remaining <= finalValid / 2) runoff = 'certain';
  }
  return { remaining, gap, status, runoff };
}

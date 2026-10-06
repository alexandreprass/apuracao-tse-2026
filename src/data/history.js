import { CLOCK } from './clock.js';
import { share } from '../lib/format.js';
import { minuteAtProgress, municipalitySnapshot, progressAt, STATES } from './mocks.js';

// Past snapshots are sampled evenly along the share of sections counted (the chart's x axis),
// not along the clock, because most of the count happens in the first hour.
const PROGRESS_STEP = .04;
export const SAMPLE_MINUTES = [
  ...Array.from({ length: Math.floor(.98 / PROGRESS_STEP) }, (_, i) => minuteAtProgress((i + 1) * PROGRESS_STEP)),
  minuteAtProgress(.99), minuteAtProgress(.995),
].filter(minute => minute < CLOCK.end);

const STATE_CODES = Object.keys(STATES);

// Deterministic 0–1 noise that differs sharply between consecutive minutes.
function noise(minute, salt) {
  let x = Math.imul(minute * 31 + salt ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ x >>> 13, 0xc2b2ae35);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
}
const MAX_UPDATE_STATES = 3;

/** Keeps only what the trend needs from a full snapshot. */
export const toSample = (minute, { national, states, adjustments }) => ({ minute, national, states, adjustments });

function resultAt(geo, sample, { uf, municipality }, office) {
  if (municipality) return municipalitySnapshot(geo, municipality, sample.minute, office, sample.adjustments[uf]);
  return uf ? sample.states[uf] : sample.national;
}

const toPoint = (minute, result) => ({ minute, completion: result.completion, shares: [share(result, 0), share(result, 1)] });

/** Both candidates' shares over the count for one place, ending at the current result. */
export function buildTrend(geo, samples, place, office, minute, current) {
  return [
    ...samples.filter(sample => sample.minute < minute).map(sample => toPoint(sample.minute, resultAt(geo, sample, place, office))),
    toPoint(minute, current),
  ];
}

function sharesAt(trend, minute) {
  const after = trend.findIndex(point => point.minute >= minute);
  if (after <= 0) return (trend[after] ?? trend.at(-1)).shares;
  const a = trend[after - 1], b = trend[after], t = (minute - a.minute) / (b.minute - a.minute);
  return a.shares.map((value, i) => value + (b.shares[i] - value) * t);
}

/**
 * The last few minute-by-minute bulletins for a place: sections added and the shares after each.
 * Nationally, each bulletin also names the states that reported.
 */
export function recentUpdates(trend, current, minute, { national = false, count = 7 } = {}) {
  const updates = [];
  for (let m = Math.floor(minute); m > CLOCK.start && updates.length < count; m--) {
    const pace = .25 + 1.5 * noise(m, 1);
    const sections = Math.round(current.sections * (progressAt(m) - progressAt(m - 1)) * pace);
    if (sections < 1) continue;
    const states = national
      ? [...new Set(Array.from({ length: Math.floor(noise(m, 2) * (MAX_UPDATE_STATES + 1)) },
          (_, i) => STATE_CODES[Math.floor(noise(m, 3 + i) * STATE_CODES.length)]))]
      : [];
    updates.push({ minute: m, sections, states, shares: sharesAt(trend, m) });
  }
  return updates;
}

/** Every time a state changed hands between two known moments, newest first. */
export function stateFlips(samples, minute, currentStates) {
  const moments = [...samples.filter(sample => sample.minute < minute), { minute, states: currentStates }];
  const flips = [];
  for (let i = 1; i < moments.length; i++) {
    for (const uf of STATE_CODES) {
      const before = moments[i - 1].states[uf].winner, after = moments[i].states[uf].winner;
      if (before !== after) flips.push({ minute: Math.round(moments[i].minute), uf, winner: after });
    }
  }
  return flips.reverse();
}

/** How many places each candidate leads, and how much of the electorate those places hold. */
export function tally(results) {
  const sides = [0, 1].map(() => ({ places: 0, electorate: 0 }));
  let electorate = 0;
  for (const result of results) {
    electorate += result.electorate;
    sides[result.winner].places += 1;
    sides[result.winner].electorate += result.electorate;
  }
  return sides.map(side => ({ places: side.places, electorateShare: electorate ? side.electorate / electorate : 0 }));
}

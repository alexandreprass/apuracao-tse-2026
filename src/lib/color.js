// Party colours and the map ramps built from them (blended in OKLab so steps look even).

// Party and federation colours live in ONE place: src/lib/parties.js (central palette, generated and
// verified by the design team; tests/palette.test.js re-checks contrast and distances). Never hardcode a
// party colour elsewhere: marginColor/marginRamp throw on a colour outside the palette.
export { federationColor, marginColor, marginRamp, MARGIN_STEPS, party, partyColor, partyFill, partyKey } from './parties.js';
import { MAP_BASE as PALETTE_BASE, partyFill } from './parties.js';

function toLab(hex) {
  const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}

function fromLab([L, a, b]) {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return '#' + [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s]
    .map(v => Math.round(Math.max(0, Math.min(1, v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)) * 255).toString(16).padStart(2, '0')).join('');
}

export const mix = (from, to, t) => {
  const a = toLab(from), b = toLab(to);
  return fromLab(a.map((v, i) => v + (b[i] - v) * t));
};

export const MAP_BASE = PALETTE_BASE;
/** "Sem apuração" grey (reserved: no party uses it). */
export const MAP_EMPTY = { dark: '#272a30', light: '#d9dce3' };

const COMPLETION_END = { dark: '#f0bd4f', light: '#7a4d00' };
export const COMPLETION_STEPS = [.25, .5, .75, .99];
export function completionColor(ratio, theme = 'dark') {
  const step = COMPLETION_STEPS.findIndex(limit => ratio < limit);
  const t = [.3, .48, .64, .82, 1][step < 0 ? 4 : step];
  return mix(MAP_BASE[theme], COMPLETION_END[theme], t);
}
export const completionRamp = theme => [.3, .48, .64, .82, 1].map(t => mix(MAP_BASE[theme], COMPLETION_END[theme], t));

/**
 * "Situação" map (governors, later senators): every state takes the strongest colour of its winner's or
 * leader's party, with the ink to write on it. Runoffs are marked by hatching and a "2º turno" badge on
 * the label (from the TSE status), not by a lighter colour.
 */
/**
 * Background + ink for a badge in a party's colour (theme-independent): the strongest light step, which the
 * palette guarantees at ≥ 4.5:1 with its ink. The raw base is not always enough (MOBILIZA base + white = 4.4:1).
 */
export const partyBadge = x => partyFill(x, 1, 'light');

export function statusFill(row, theme = 'dark') {
  if (!row || row.empty || !row.leaderParty) return { fill: MAP_EMPTY[theme], ink: null };
  return partyFill(row.leaderParty, 1, theme);
}

// Party colours and the map ramps built from them (blended in OKLab so steps look even).

const PARTY_COLORS = {
  PL: '#2f55d4', PT: '#dc2630', PSD: '#d18f00', MDB: '#2c9f4b', 'UNIÃO': '#14a3c7', PP: '#6c4fd1',
  REPUBLICANOS: '#0e7490', PSDB: '#4f8ff7', PSB: '#f06a1d', PDT: '#c0266d', NOVO: '#ff8a00', PSOL: '#a3a300',
  'PC do B': '#9f1d1d', PCdoB: '#9f1d1d', PV: '#3f9b2f', REDE: '#21a59a', PODE: '#2b7a4b', AVANTE: '#e04f9a',
  SOLIDARIEDADE: '#ff6f61', CIDADANIA: '#d94f8f', 'MISSÃO': '#8a5cf6', DC: '#7c6f2c', PRD: '#365f9c', PMB: '#b5651d',
  AGIR: '#5f8f2f', MOBILIZA: '#5d7d8c', UP: '#8b1e3f', PSTU: '#b91c1c', PCB: '#7f1d1d', PCO: '#991b1b', DEMOCRATA: '#3b6ea5',
};

function hashHue(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export const partyColor = party => PARTY_COLORS[party] || hslToHex(hashHue(party || '?'), .55, .48);

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

export const MAP_BASE = { dark: '#1b1d22', light: '#e6e8ee' };
export const MAP_EMPTY = { dark: '#272a30', light: '#d9dce3' };
/** Lead over the runner-up (share of valid votes) where the colour steps up. */
export const MARGIN_STEPS = [.05, .15, .3];
// Even the closest races stay clearly visible on the map background in both themes.
const STRENGTH = { dark: [.45, .64, .82, 1], light: [.55, .7, .85, 1] };
const cache = new Map();

export function marginColor(color, margin, theme = 'dark') {
  const step = MARGIN_STEPS.findIndex(limit => margin < limit);
  const key = `${color}|${step}|${theme}`;
  if (!cache.has(key)) cache.set(key, mix(MAP_BASE[theme], color, STRENGTH[theme][step < 0 ? 3 : step]));
  return cache.get(key);
}

export const marginRamp = (color, theme) => STRENGTH[theme].map(t => mix(MAP_BASE[theme], color, t));

const COMPLETION_END = { dark: '#f0bd4f', light: '#7a4d00' };
export const COMPLETION_STEPS = [.25, .5, .75, .99];
export function completionColor(ratio, theme = 'dark') {
  const step = COMPLETION_STEPS.findIndex(limit => ratio < limit);
  const t = [.3, .48, .64, .82, 1][step < 0 ? 4 : step];
  return mix(MAP_BASE[theme], COMPLETION_END[theme], t);
}
export const completionRamp = theme => [.3, .48, .64, .82, 1].map(t => mix(MAP_BASE[theme], COMPLETION_END[theme], t));

/**
 * "Situação" map: every state takes the colour of its leader's party. Races the TSE marked as decided
 * use the full colour; runoffs (and counts still open) the lightest step, labelled "2ºT" on the map.
 */
export const STATUS_STEPS = { decidido: 1, 'segundo-turno': 0, 'em-apuracao': 0 };
export function statusColor(row, theme = 'dark') {
  if (!row || row.empty || !row.color) return MAP_EMPTY[theme];
  return marginColor(row.color, STATUS_STEPS[row.status] ?? 0, theme);
}

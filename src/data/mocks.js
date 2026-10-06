export const STATES = {
  RO: ['Rondônia', .675, 'Norte'], AC: ['Acre', .646, 'Norte'], AM: ['Amazonas', .44, 'Norte'],
  RR: ['Roraima', .711, 'Norte'], PA: ['Pará', .457, 'Norte'], AP: ['Amapá', .441, 'Norte'],
  TO: ['Tocantins', .504, 'Norte'], MA: ['Maranhão', .30, 'Nordeste'], PI: ['Piauí', .24, 'Nordeste'],
  CE: ['Ceará', .31, 'Nordeste'], RN: ['Rio Grande do Norte', .346, 'Nordeste'],
  PB: ['Paraíba', .331, 'Nordeste'], PE: ['Pernambuco', .303, 'Nordeste'],
  AL: ['Alagoas', .398, 'Nordeste'], SE: ['Sergipe', .315, 'Nordeste'], BA: ['Bahia', .28, 'Nordeste'],
  MG: ['Minas Gerais', .484, 'Sudeste'], ES: ['Espírito Santo', .548, 'Sudeste'],
  RJ: ['Rio de Janeiro', .53, 'Sudeste'], SP: ['São Paulo', .61, 'Sudeste'],
  PR: ['Paraná', .599, 'Sul'], SC: ['Santa Catarina', .667, 'Sul'], RS: ['Rio Grande do Sul', .556, 'Sul'],
  MS: ['Mato Grosso do Sul', .586, 'Centro-Oeste'], MT: ['Mato Grosso', .651, 'Centro-Oeste'],
  GO: ['Goiás', .536, 'Centro-Oeste'], DF: ['Distrito Federal', .513, 'Centro-Oeste'],
};

export const CANDIDATES = [
  { name: 'Flávio Bolsonaro', party: 'PL', number: 22, tone: 'blue', color: '#4162e2', photo: import.meta.env.BASE_URL + 'images/flavio.webp' },
  { name: 'Lula', party: 'PT', number: 13, tone: 'red', color: '#ee2d35', photo: import.meta.env.BASE_URL + 'images/lula.webp' },
  { name: 'Outros candidatos', party: '', tone: 'other', color: '#8c8577', photo: null },
];
export const OFFICES = ['Presidente', 'Governadores', 'Senado', 'Deputados'];
export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
// Hand-set results for some zones of São Paulo's capital in the presidential race:
// [leader's share of valid votes in %, leading candidate index].
export const ZONE_PRESETS = {
  1: [60.6, 1], 2: [50.1, 1], 3: [49.3, 1], 4: [52.6, 0], 5: [48.2, 0], 6: [45.2, 1],
  20: [56.8, 1], 246: [48.3, 0], 247: [46.6, 1], 248: [47.2, 1], 249: [51.6, 0],
  250: [46.0, 0], 251: [52.3, 1], 252: [51.4, 0], 253: [57.2, 0], 254: [56.1, 1],
};
export function hash(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}
// Share of sections counted `minute` minutes after midnight: fast at first, then a long tail.
const COUNT_START = 1018, COUNT_PACE = 62;
export function progressAt(minute) {
  return Math.max(.015, Math.min(1, 1 - Math.exp(-(minute - COUNT_START) / COUNT_PACE)));
}
/** Inverse of progressAt: the minute at which `progress` of the sections is counted. */
export const minuteAtProgress = progress => COUNT_START - COUNT_PACE * Math.log(1 - progress);
export function voteSplit(electorate, blueShare, turnout, completion) {
  const cast = Math.round(electorate * turnout * completion);
  const blank = Math.round(cast * .019);
  const nulls = Math.round(cast * .029);
  const valid = cast - blank - nulls;
  const other = Math.round(valid * .062);
  const blue = Math.round(valid * Math.max(.04, Math.min(.90, blueShare)));
  return { electorate, turnout, completion, cast, blank, nulls, valid, votes: [blue, valid - blue - other, other] };
}
// How fast a municipality counts relative to the country: most keep pace,
// a few (about 1 in 14) lag far behind and are the last places to report.
function countPace(id) {
  const h = hash(id + 'ritmo');
  return h < .07 ? 3 + h * 30 : .6 + h * 1.1;
}
export function municipalityResult(municipality, minute = 1269, office = 'Presidente', blueAdjustment = 0) {
  if (TSE && office === 'Presidente') {
    const hit = TSE.municipalities[municipality.id];
    if (hit) {
      const [flavio, lula, others, valid, counted] = hit;
      return rowFromVotes(municipality.id, municipality.name, municipality.uf, [flavio, lula, others], valid, Math.round(municipality.population * .71), counted, 0, 0, 0);
    }
  }
  const seed = hash(municipality.id);
  const electorate = Math.round(Math.max(800, municipality.population * .71));
  let blue = STATES[municipality.uf][1] + (seed - .5) * .36;
  if (municipality.uf === 'SP' && municipality.population > 300000) blue -= .14;
  if (municipality.id === '3550308') blue = .438;
  if (office === 'Governadores') blue += (hash(municipality.uf + 'gov') - .5) * .29;
  if (office === 'Senado') blue += (hash(municipality.id + 'sen') - .5) * .17;
  if (office === 'Deputados') blue += (hash(municipality.id + 'dep') - .5) * .28;
  blue += Math.sin(minute / 39 + seed * 7) * .013 * (1 - progressAt(minute));
  blue += blueAdjustment;
  const completion = Math.min(1, progressAt(minute) ** countPace(municipality.id));
  const result = voteSplit(electorate, blue, .755 + hash(municipality.id + 'turnout') * .065, completion);
  return { ...result, id: municipality.id, name: municipality.name, uf: municipality.uf,
    sections: Math.round(electorate / 340), winner: result.votes[0] >= result.votes[1] ? 0 : 1 };
}
export function aggregate(results) {
  const total = { electorate: 0, cast: 0, blank: 0, nulls: 0, valid: 0, sections: 0, done: 0, votes: [0, 0, 0] };
  for (const r of results) {
    for (const key of ['electorate', 'cast', 'blank', 'nulls', 'valid', 'sections']) total[key] += r[key] || 0;
    total.done += (r.sections || 0) * r.completion;
    r.votes.forEach((v, i) => total.votes[i] += v);
  }
  total.completion = total.sections ? total.done / total.sections : 0;
  total.turnout = total.electorate && total.completion ? total.cast / total.electorate / total.completion : 0;
  total.winner = total.votes[0] >= total.votes[1] ? 0 : 1;
  return total;
}
export function zoneResults(municipality, geometry, minute, office, blueAdjustment = 0) {
  const total = municipalityResult(municipality, minute, office, blueAdjustment);
  return geometry.numbers.map((number, i) => {
    const preset = municipality.id === '3550308' && office === 'Presidente' ? ZONE_PRESETS[number] : null;
    const simulatedBlue = Math.max(.05, Math.min(.88, total.votes[0] / Math.max(1,total.valid) + (hash(municipality.id + ':' + number) - .5) * .25));
    const blue = preset ? (preset[1] === 0 ? preset[0] / 100 : .938 - preset[0] / 100) : simulatedBlue;
    const winner = blue >= .938 - blue ? 0 : 1;
    const result = voteSplit(geometry.electorate[i], blue, total.turnout, total.completion);
    if(preset) {
      const [share,leader]=preset;
      const leading=Math.round(result.valid*share/100);
      const runnerUp=Math.round(result.valid*Math.min(.938-share/100,share/100-.03));
      result.votes[leader]=leading;result.votes[1-leader]=runnerUp;result.votes[2]=result.valid-leading-runnerUp;
    }
    return { ...result, number, name: geometry.names[i], sections: geometry.sections[i], winner:preset?preset[1]:winner };
  });
}

// The first sections to report lean towards candidate 0. The lean builds over the first third
// of the count, at a pace that differs by state, and fades to nothing as the count completes.
const EARLY_LEAN = .05;
function earlyLean(uf, minute) {
  const progress = progressAt(minute);
  const swell = .55 + (.5 + hash(uf + 'ritmo')) * Math.sin(Math.PI * progress);
  return EARLY_LEAN * (1 - progress) * swell;
}
const FIXED_CAPITAL = '3550308';

/** Share of valid votes candidate 0 holds in a state at `minute` (the calibration target). */
export function stateTarget(uf, office, minute) {
  let target = uf === 'SP' ? .519 : STATES[uf][1];
  if (office !== 'Presidente') target += (hash(uf + office) - .5) * .23;
  target += earlyLean(uf, minute);
  return Math.max(.12, Math.min(.82, target));
}

/** One municipality's result, summed from its zones when it has them. */
export function municipalitySnapshot(geo, municipality, minute, office, adjustment = 0) {
  const fixedCapital = municipality.id === FIXED_CAPITAL && office === 'Presidente';
  const correction = fixedCapital ? 0 : adjustment;
  const result = municipalityResult(municipality, minute, office, correction);
  const zones = geo.zoneMeta[municipality.id];
  if (!zones) return result;
  const rows = zoneResults(municipality, { numbers: zones.z, names: zones.nome, electorate: zones.el, sections: zones.sec }, minute, office, correction);
  return { ...result, ...aggregate(rows) };
}

let TSE = null;
export function setTse(data) { TSE = data; }

function rowFromVotes(id, name, uf, votes, valid, electorate, countedPct, turnoutPct, blank, nulls) {
  const completion = Math.max(0, Math.min(1, (countedPct || 100) / 100));
  const cast = valid + (blank || 0) + (nulls || 0);
  return {
    electorate: electorate || 0,
    turnout: turnoutPct ? turnoutPct / 100 : 0,
    completion,
    cast,
    blank: blank || 0,
    nulls: nulls || 0,
    valid: valid || 0,
    votes,
    id, name, uf,
    sections: Math.max(1, Math.round((electorate || valid || 1) / 340)),
    winner: votes[0] >= votes[1] ? 0 : 1,
  };
}

function officialScope(block, id, name, uf) {
  const others = Math.max(0, (block.v || 0) - (block.f || 0) - (block.l || 0));
  return rowFromVotes(id, name, uf, [block.f || 0, block.l || 0, others], block.v || 0, block.e || 0, block.c || 100, block.t || 0, block.b || 0, block.n || 0);
}

function buildOfficeSnapshot(geo, office) {
  const key = { Governadores: 'governadores', Senado: 'senado', Deputados: 'deputados' }[office] || 'governadores';
  const pack = (TSE.offices && TSE.offices[key]) || { states: {} };
  const results = new Map(), states = {}, adjustments = {};
  for (const [uf, state] of Object.entries(geo.states)) {
    const src = pack.states[uf];
    const cands = (src && src.candidates) || [];
    const first = cands[0] || { votes: 0, name: '—', party: '', n: '' };
    const second = cands[1] || { votes: 0, name: '—', party: '', n: '' };
    const others = Math.max(0, (src?.valid || 0) - first.votes - second.votes);
    const row = rowFromVotes(uf, STATES[uf][0], uf, [first.votes, second.votes, others], src?.valid || 0, src?.electorate || 0, src?.countedPct || 100, src?.turnoutPct || 0, src?.blank || 0, src?.null || 0);
    row.contenders = [first, second].map((c, i) => ({ name: c.name, party: c.party, number: c.n, tone: i ? 'red' : 'blue', photo: c.sq ? `https://resultados.tse.jus.br/oficial/ele2026/6259/fotos/br/${c.sq}.jpeg` : null }));
    states[uf] = { ...row, name: STATES[uf][0] };
    adjustments[uf] = 0;
    for (const m of state.municipalities) results.set(m.id, { ...row, id: m.id, name: m.name, uf });
  }
  return { results, states, adjustments, national: aggregate([...states.values()]) };
}

export function buildSnapshot(geo, minute, office) {
  if (!TSE) throw new Error('Boletim do TSE ainda não carregou.');
  if (office !== 'Presidente') return buildOfficeSnapshot(geo, office);

  const results = new Map(), states = {}, adjustments = {};
  for (const [uf, state] of Object.entries(geo.states)) {
    const rows = state.municipalities.map(m => municipalityResult(m, minute, office));
    for (const row of rows) results.set(row.id, row);
    const official = TSE.states[uf];
    states[uf] = official ? { ...officialScope(official, uf, STATES[uf][0], uf), name: STATES[uf][0] } : { ...aggregate(rows), name: STATES[uf][0] };
    adjustments[uf] = 0;
  }
  const national = TSE.national ? officialScope(TSE.national, 'br', 'Brasil', 'BR') : aggregate([...results.values()]);
  return { results, states, adjustments, national };
}

function unusedOriginalBuildSnapshot(geo, minute, office) {
  const results = new Map(), states = {}, adjustments = {};
  for (const [uf, state] of Object.entries(geo.states)) {
    const generate = adjustment => state.municipalities.map(m => municipalitySnapshot(geo, m, minute, office, adjustment));
    const target = stateTarget(uf, office, minute);
    let adjustment = 0, rows = generate(0);
    // Nudge every adjustable municipality until the state lands on its target share.
    for (let attempt = 0; attempt < 3; attempt++) {
      const total = aggregate(rows);
      const adjustable = rows.filter(r => r.id !== FIXED_CAPITAL || office !== 'Presidente').reduce((sum, r) => sum + r.valid, 0);
      if (!adjustable) break;
      adjustment += (target * total.valid - total.votes[0]) / adjustable;
      rows = generate(adjustment);
    }
    adjustments[uf] = adjustment;
    for (const row of rows) results.set(row.id, row);
    states[uf] = { ...aggregate(rows), name: STATES[uf][0] };
  }
  return { results, states, adjustments, national: aggregate([...results.values()]) };
}

function toLab(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const [r, g, b] = rgb;
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
function fromLab([L, a, b]) {
  const l = (L + .3963377774*a + .2158037573*b) ** 3;
  const m = (L - .1055613458*a - .0638541728*b) ** 3;
  const s = (L - .0894841775*a - 1.291485548*b) ** 3;
  return '#' + [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]
    .map(v => Math.round(Math.max(0, Math.min(1, v <= .0031308 ? v*12.92 : 1.055*v**(1/2.4)-.055))*255).toString(16).padStart(2,'0')).join('');
}
// Each theme blends its neutral map base toward the candidate colour; the
// four steps follow MARGIN_STEPS (lead over the runner-up, in share of valid votes).
const MAP_BASE = { dark: '#1b1d22', light: '#e6e8ee' };
const MAP_EMPTY = { dark: '#272a30', light: '#dcdfe6' };
export const MARGIN_STEPS = [.1, .25, .45];
const palettes = Object.fromEntries(Object.entries(MAP_BASE).map(([theme, baseHex]) => {
  const base = toLab(baseHex);
  return [theme, CANDIDATES.slice(0, 2).map(candidate => {
    const end = toLab(candidate.color);
    return [.4, .62, .82, 1].map(t => fromLab(base.map((v, i) => v + (end[i] - v) * t)));
  })];
}));
export const marginPalette = (theme = 'dark') => palettes[theme];

// "Apurado" metric: one hue, stepping from the map base to full strength as sections come in.
const COMPLETION_END = { dark: '#f0bd4f', light: '#7a4d00' };
export const COMPLETION_STEPS = [.4, .7, .9, .99];
const completionPalettes = Object.fromEntries(Object.entries(MAP_BASE).map(([theme, baseHex]) => {
  const base = toLab(baseHex), end = toLab(COMPLETION_END[theme]);
  return [theme, [.22, .42, .62, .82, 1].map(t => fromLab(base.map((v, i) => v + (end[i] - v) * t)))];
}));
export const completionPalette = (theme = 'dark') => completionPalettes[theme];

const stepOf = (value, limits) => {
  const step = limits.findIndex(limit => value < limit);
  return step < 0 ? limits.length : step;
};

/** Map fill for a result: who leads and by how much, or how much of it is counted. */
export function resultColor(result, theme = 'dark', metric = 'lider') {
  if (!result) return MAP_EMPTY[theme];
  if (metric === 'apurado') return completionPalettes[theme][stepOf(result.completion, COMPLETION_STEPS)];
  if (!result.valid || result.completion < .001) return MAP_EMPTY[theme];
  const margin = Math.abs(result.votes[0] - result.votes[1]) / result.valid;
  return palettes[theme][result.winner][stepOf(margin, MARGIN_STEPS)];
}

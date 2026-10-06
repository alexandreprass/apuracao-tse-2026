// Everything the site needs to know about the 2026 general election and where its data lives.
// To follow another election, change the codes below (they come from the TSE file
// https://resultados.tse.jus.br/oficial/comum/config/ele-c.json).

export const TSE_BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
export const TSE_SITE = 'https://resultados.tse.jus.br';

/** Offices, in the order of the tabs. `code` is the TSE "cargo"; `scope` says where results exist. */
export const OFFICES = {
  presidente: { code: 1, label: 'Presidente', plural: 'Presidente', scope: 'br', federal: true, rounds: [1, 2] },
  governador: { code: 3, label: 'Governador', plural: 'Governadores', scope: 'uf', rounds: [1, 2] },
  senador: { code: 5, label: 'Senador', plural: 'Senado', scope: 'uf', rounds: [1] },
  'deputado-federal': { code: 6, label: 'Deputado federal', plural: 'Dep. federais', tab: 'Dep. Fed.', scope: 'uf', rounds: [1], proportional: true },
  'deputado-estadual': { code: 7, label: 'Deputado estadual', plural: 'Dep. estaduais', tab: 'Dep. Est.', scope: 'uf', rounds: [1], proportional: true, dfCode: 8, dfLabel: 'Deputado distrital' },
};

/** TSE election codes per round: the presidential race is "federal", the others "estadual". */
export const ROUNDS = {
  1: { label: '1º turno', date: '04/10/2026', federal: 6257, state: 6259, closesAt: '2026-10-04T17:00:00-03:00' },
  2: { label: '2º turno', date: '25/10/2026', federal: 6258, state: 6260, closesAt: '2026-10-25T17:00:00-03:00' },
};

/**
 * How data is loaded, per round:
 * - "bundle-first": use the copy of the official files shipped with the site (public/data/tse),
 *   falling back to the TSE servers if a file is missing. Right for a finished count.
 * - "live-first": read straight from the TSE servers (they allow CORS), falling back to the
 *   shipped copy if the TSE cannot be reached.
 * The URL parameter ?fonte=tse or ?fonte=local overrides this for every round.
 */
export const SOURCE_MODE = { 1: 'bundle-first', 2: 'live-first' };

/**
 * Polling intervals. Before the polls close (ROUNDS[round].closesAt) the site checks for the first
 * boletim every 5 minutes; from the closing time on, and while a count runs or the TSE fails, every 30 s.
 */
export const POLL_LIVE_MS = 30_000;
export const POLL_WAITING_MS = 5 * 60_000;

/** True from the moment the polls close for that round (17h in Brasília on the round's date). */
export const pollsClosed = (round, now = Date.now()) => now >= new Date(ROUNDS[round].closesAt).getTime();

export const electionCode = (round, office) => ROUNDS[round][OFFICES[office].federal ? 'federal' : 'state'];

const pad = (value, size) => String(value).padStart(size, '0');

/** Office code for a place: the Federal District elects "deputados distritais" (code 8). */
export const officeCode = (office, uf) => (uf === 'DF' && OFFICES[office].dfCode) || OFFICES[office].code;

/** URL of a TSE results file. `place` is "br", a state ("sp"), "zz" (abroad) or a TSE municipality code with its state ("sp71072"). */
export function tseResultUrl(round, office, place) {
  const ele = electionCode(round, office);
  const uf = place.slice(0, 2).toUpperCase();
  return `${TSE_BASE}/${ele}/dados/${place.slice(0, 2)}/${place}-c${pad(officeCode(office, uf), 4)}-e${pad(ele, 6)}-u.json`;
}

export const tseProgressUrl = (round, office, area = 'br') => {
  const ele = electionCode(round, office);
  return `${TSE_BASE}/${ele}/dados/${area}/${area}-e${pad(ele, 6)}-ab.json`;
};

/** Candidate photo hosted by the TSE (federal candidates live under "br", the others under their state). */
export function photoUrl(round, office, sq, uf) {
  if (!sq) return null;
  const ele = ROUNDS[1][OFFICES[office].federal ? 'federal' : 'state'];
  const folder = OFFICES[office].federal ? 'br' : (uf || 'br').toLowerCase();
  return `${TSE_BASE}/${ele}/fotos/${folder}/${sq}.jpeg`;
}

/** Offices whose pages are ready. The others show as "em breve" until their stage ships. */
export const ENABLED_OFFICES = ['presidente', 'governador', 'senador', 'deputado-federal', 'deputado-estadual'];

/** Offices with results per municipality shipped in public/data/tse/<round>/<office>-municipios/<UF>.json. */
export const MUNICIPAL_OFFICES = ['presidente', 'governador'];

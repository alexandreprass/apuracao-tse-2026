// What the status bar says: where the numbers come from, whether they are current, and what a
// screen reader should hear when that changes. Pure functions (tested in Node); the markup lives in
// components/Header.js and the look in styles/components.css (.status-bar.is-stale and friends).
import { POLL_LIVE_MS, ROUNDS } from '../config.js';
import { brasiliaStamp } from '../lib/format.js';
import { isFinished } from './feed.js';
import { latestUpdate } from './source.js';
import { stateName } from './states.js';

export const RETRY_SECONDS = Math.round(POLL_LIVE_MS / 1000);
const placeName = code => (code === 'BR' ? 'Brasil' : code === 'ZZ' ? 'Exterior' : stateName(code));

/** "21:04" (or "05/10 21:04" on another day): the TSE totalization time of the newest place on screen. */
export const boletimTime = (data, now = new Date()) => brasiliaStamp(latestUpdate(data), now);

/**
 * kind: loading | waiting | error | stale | partial | done | live
 * tone: CSS modifier of the bar. `state` is the main text, `retry` and `partial` the secondary ones.
 */
export function statusInfo(data, { round = 1, now = new Date() } = {}) {
  if (!data) return { kind: 'loading', tone: 'is-loading', state: 'Carregando dados do TSE…' };
  if (data.status === 'not-published') {
    return { kind: 'waiting', tone: 'is-waiting', state: `Aguardando apuração do ${ROUNDS[round].label}`, source: 'TSE ao vivo · aguardando o 1º boletim' };
  }
  if (data.status === 'error') {
    return { kind: 'error', tone: 'is-stale', state: 'TSE indisponível · ainda sem boletim para mostrar',
      retry: `Tentando de novo a cada ${RETRY_SECONDS} s`, detail: data.message };
  }
  const boletim = boletimTime(data, now) || '—';
  if (data.liveError) {
    const copyTime = data.source === 'local' && data.fetchedAt ? brasiliaStamp(new Date(data.fetchedAt), now) : '';
    return {
      kind: 'stale', tone: 'is-stale', boletim,
      state: `TSE indisponível · mostrando o boletim das ${boletim}`,
      retry: `Tentando de novo a cada ${RETRY_SECONDS} s`,
      source: data.source === 'local' ? `cópia dos arquivos oficiais guardada neste site${copyTime ? ` às ${copyTime}` : ''}` : 'último boletim recebido do TSE',
      since: data.staleSince ? brasiliaStamp(new Date(data.staleSince), now) : '',
      detail: data.liveError,
    };
  }
  const base = isFinished(data)
    ? { kind: 'done', tone: 'is-done', state: 'Totalização finalizada', boletim }
    : { kind: 'live', tone: 'is-live', state: 'Apuração em andamento', boletim };
  if (data.staleUfs?.length) {
    const n = data.staleUfs.length;
    return { ...base, kind: 'partial', partial: {
      places: data.staleUfs,
      text: `${n} ${n === 1 ? (data.staleUfs[0] === 'BR' || data.staleUfs[0] === 'ZZ' ? 'lugar' : 'estado') : 'lugares'} com boletim atrasado`,
      names: data.staleUfs.map(placeName).join(', '),
    }, retry: `Tentando de novo a cada ${RETRY_SECONDS} s` };
  }
  return base;
}

/**
 * Warning for the page body when the TSE could not be read and there is no boletim at all to show
 * (no last good data, no shipped copy), e.g. ?fonte=tse with the TSE down. Amber, like the status
 * bar (.notice.is-warning uses --warn-bg/--warn-ink/--warn-line); never the red error style.
 * null in every other case.
 */
export function noBoletimNotice(data) {
  if (data?.status !== 'error') return null;
  return {
    tone: 'warning',
    title: 'TSE indisponível · nenhum boletim disponível ainda',
    text: `Não foi possível ler os resultados no TSE e não há boletim guardado para mostrar. O site continua tentando a cada ${RETRY_SECONDS} s e mostra os números assim que o TSE responder.`,
    detail: data.message || '',
  };
}

/**
 * Sentence for the screen reader, only when the kind of state changes (never on a routine poll).
 * Returns null when nothing should be announced.
 */
export function announcement(previous, info) {
  if (!previous || previous.kind === info.kind || info.kind === 'loading') return null;
  if (info.kind === 'stale') return `O TSE está indisponível. Mostrando o boletim das ${info.boletim}. O site continua tentando.`;
  if (info.kind === 'error') return 'O TSE está indisponível. O site continua tentando.';
  if (info.kind === 'partial') return `${info.partial.text}: ${info.partial.names}. O site continua tentando.`;
  if ((previous.kind === 'stale' || previous.kind === 'error' || previous.kind === 'partial') && (info.kind === 'live' || info.kind === 'done')) {
    return `Conexão com o TSE restabelecida. Boletim das ${info.boletim}.`;
  }
  if (info.kind === 'done' && previous.kind === 'live') return 'Totalização finalizada pelo TSE.';
  if (info.kind === 'live' && previous.kind === 'waiting') return 'O TSE publicou o primeiro boletim.';
  return null;
}

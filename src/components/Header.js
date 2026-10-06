import { html } from '../lib/html.js';
import { ENABLED_OFFICES, OFFICES, ROUNDS, TSE_SITE } from '../config.js';
import { brasiliaStamp, brasiliaTime } from '../lib/format.js';
import { isFinished, useFeed } from '../hooks/useData.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { announcement, statusInfo } from '../data/status.js';
import { Icon } from './Icon.js';

export function TopBar({ route, theme, onToggleTheme, onSearch, onShare }) {
  const nextTheme = theme === 'dark' ? 'claro' : 'escuro';
  const inResults = route.page === 'resultados';
  return html`<header class="topbar">
    <a class="brand" href="#/1turno/presidente" aria-label="Apuração 2026, página inicial">
      <span class="brand-mark" aria-hidden="true"></span>
      <span><b>Apuração 2026</b><small>Eleições gerais · dados oficiais do TSE</small></span>
    </a>
    <nav class="round-tabs" aria-label="Turno">
      ${[1, 2].map(round => html`<a key=${round} href=${`#/${round}turno/${OFFICES[route.office].rounds.includes(round) ? route.office : 'presidente'}`}
        aria-current=${inResults && route.round === round ? 'page' : undefined}>
        ${ROUNDS[round].label}<small>${ROUNDS[round].date.slice(0, 5)}</small></a>`)}
      <a href="#/comparar" aria-current=${route.page === 'comparar' ? 'page' : undefined}>Comparar</a>
    </nav>
    <div class="topbar-actions">
      <button class="search-trigger" onClick=${onSearch} aria-label="Buscar" title="Buscar candidato, município ou estado" aria-keyshortcuts="/">
        <${Icon} name="search" size=${16}/><span>Buscar</span><kbd>/</kbd>
      </button>
      <button class="icon-button" onClick=${onShare} aria-label="Compartilhar este resultado" title="Compartilhar"><${Icon} name="share"/></button>
      <button class="icon-button" onClick=${onToggleTheme} aria-label=${`Mudar para o tema ${nextTheme}`} title=${`Tema ${nextTheme}`}>
        <${Icon} name=${theme === 'dark' ? 'sun' : 'moon'}/>
      </button>
    </div>
  </header>`;
}

export function OfficeTabs({ route }) {
  if (route.page !== 'resultados') return null;
  // The five offices stay in the bar on both rounds, so its shape does not jump between pages.
  const keepUf = () => (route.uf && route.uf !== 'ZZ' ? '/' + route.uf : '');
  return html`<nav class="office-tabs" aria-label="Cargo">
    ${Object.keys(OFFICES).map(key => {
      const inRound = OFFICES[key].rounds.includes(route.round);
      const round = inRound ? route.round : 1;
      const href = `#/${round}turno/${key}${ENABLED_OFFICES.includes(key) ? keepUf() : ''}`;
      if (ENABLED_OFFICES.includes(key) && inRound) {
        return html`<a key=${key} href=${href} aria-current=${route.office === key ? 'page' : undefined}>${OFFICES[key].plural}</a>`;
      }
      const note = !inRound ? 'só 1º turno' : 'em breve';
      return html`<a key=${key} class="is-soon" href=${href} aria-label=${`${OFFICES[key].plural}, ${note}`}
        aria-current=${route.office === key && inRound ? 'page' : undefined}>${OFFICES[key].plural}<small>${note}</small></a>`;
    })}
  </nav>`;
}

function latestUpdated(data) {
  if (!data) return null;
  if (data.br) return data.br.updated;
  if (data.result) return data.result.updated;
  const times = Object.values(data.uf || {}).map(r => r.updated).filter(Boolean);
  // "dd/mm/yyyy hh:mm:ss": compare as yyyy-mm-dd hh:mm:ss.
  const key = t => t.slice(6, 10) + t.slice(3, 5) + t.slice(0, 2) + t.slice(11);
  return times.sort((a, b) => key(b).localeCompare(key(a)))[0] || null;
}

/** Where the numbers come from, when the TSE last updated them and whether they are current. */
export function StatusBar({ feed, round }) {
  // Listens to every poll ("check"), so only this bar re-renders when the boletim did not change.
  const { data, loading, checkedAt, refresh } = useFeed(feed, ['data', 'check', 'loading']);
  const info = statusInfo(data, { round });
  // The screen reader hears only changes of state (normal → TSE down → back), never each poll.
  const last = useRef(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const text = announcement(last.current, info);
    if (text) setAnnounce(text);
    if (info.kind !== 'loading') last.current = info;
  }, [info.kind, info.boletim]);

  if (!data) return html`<div class="status-bar"><span class="dot is-loading"></span>${info.state}</div>`;
  const updated = latestUpdated(data);
  const stale = info.tone === 'is-stale';
  const copyTime = data.fetchedAt ? brasiliaStamp(new Date(data.fetchedAt)) : '';
  const source = info.source
    ? html`<span>${info.source}</span>`
    : data.source === 'tse'
      ? html`<a href=${TSE_SITE} target="_blank" rel="noopener">TSE ao vivo · resultados.tse.jus.br</a>`
      : data.source === 'local'
        ? html`<span title="Arquivos oficiais do TSE copiados para este site pelo script scripts/fetch-tse.mjs">Cópia dos arquivos oficiais do TSE${copyTime ? ` (feita às ${copyTime})` : ''}</span>`
        : html`<span>TSE</span>`;
  const toTable = () => document.getElementById('tabela-estados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return html`<div class=${'status-bar ' + info.tone} title=${info.detail || undefined}>
    <span class="status-state">
      ${stale ? html`<${Icon} name="clock-alert" size=${16}/>` : html`<span class=${'dot ' + info.tone}></span>`}
      ${info.state}
    </span>
    ${info.partial && html`<button class="status-partial link-button" onClick=${toTable} title=${info.partial.names}>
      <${Icon} name="clock-alert" size=${14}/>${info.partial.text}</button>`}
    <span class="status-source">Fonte: ${source}</span>
    ${updated && !stale && html`<span class="status-updated">Atualizado pelo TSE em <time>${updated}</time> (Brasília)</span>`}
    ${info.since && html`<span class="status-since">TSE sem resposta desde ${info.since}</span>`}
    ${info.retry && checkedAt
      ? html`<span class="status-retry">${info.retry} · última tentativa às ${brasiliaTime(checkedAt)}</span>`
      : checkedAt && html`<span class="status-checked">Verificado às ${brasiliaTime(checkedAt)}</span>`}
    <button class="link-button" onClick=${refresh} disabled=${loading} aria-label="Atualizar dados agora">
      <${Icon} name="refresh" size=${14}/>${loading ? 'Atualizando…' : 'Atualizar'}
    </button>
    <p class="sr-only" aria-live=${info.kind === 'stale' || info.kind === 'error' ? 'assertive' : 'polite'}>${announce}</p>
  </div>`;
}

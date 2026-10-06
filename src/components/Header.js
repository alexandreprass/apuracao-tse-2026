import { html } from '../lib/html.js';
import { ENABLED_OFFICES, OFFICES, ROUNDS, TSE_SITE } from '../config.js';
import { brasiliaStamp, brasiliaTime } from '../lib/format.js';
import { isFinished, useFeed } from '../hooks/useData.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { liveRegionText, statusInfo } from '../data/status.js';
import { Icon } from './Icon.js';

export function TopBar({ route, theme, onToggleTheme, onSearch, onShare, status }) {
  const nextTheme = theme === 'dark' ? 'claro' : 'escuro';
  const inResults = route.page === 'resultados';
  return html`<header class="topbar">
    <a class="brand" href="#/1turno/presidente" aria-label="Apuração 2026, página inicial">
      <span class="brand-mark" aria-hidden="true"></span>
      <span><b>Apuração 2026</b><small>Eleições gerais · dados oficiais do TSE</small></span>
    </a>
    <${OfficeTabs} route=${route}/>
    <nav class="round-tabs" aria-label="Turno">
      ${[1, 2].map(round => html`<a key=${round} href=${`#/${round}turno/${OFFICES[route.office].rounds.includes(round) ? route.office : 'presidente'}`}
        aria-current=${inResults && route.round === round ? 'page' : undefined} title=${`${ROUNDS[round].label} · ${ROUNDS[round].date}`}
        aria-label=${ROUNDS[round].label}>${round}º<span class="round-word"> turno</span></a>`)}
    </nav>
    <div class="topbar-actions">
      <button class="search-trigger" onClick=${onSearch} aria-label="Buscar estado, município ou candidato" title="Buscar estado, município ou candidato (Ctrl K)" aria-keyshortcuts="Control+K /">
        <${Icon} name="search" size=${16}/><span>Buscar</span><kbd>Ctrl K</kbd>
      </button>
      <button class="icon-button" onClick=${onShare} aria-label="Compartilhar este resultado" title="Compartilhar"><${Icon} name="share"/></button>
      <button class="icon-button" onClick=${onToggleTheme} aria-label=${`Mudar para o tema ${nextTheme}`} title=${`Tema ${nextTheme}`}>
        <${Icon} name=${theme === 'dark' ? 'sun' : 'moon'}/>
      </button>
    </div>
    ${status && html`<div class="topbar-status">${status}</div>`}
  </header>`;
}

export function OfficeTabs({ route }) {
  // The five offices stay in the bar on both rounds, so its shape does not jump between pages.
  const keepPlace = () => (route.uf && route.uf !== 'ZZ' ? '/' + route.uf + (route.ibge ? '/' + route.ibge : '') : '');
  return html`<nav class="office-tabs" aria-label="Cargo">
    ${Object.keys(OFFICES).map(key => {
      const inRound = OFFICES[key].rounds.includes(route.round);
      const round = inRound ? route.round : 1;
      const href = `#/${round}turno/${key}${ENABLED_OFFICES.includes(key) ? keepPlace() : ''}`;
      if (ENABLED_OFFICES.includes(key) && inRound) {
        return html`<a key=${key} href=${href} aria-current=${route.office === key ? 'page' : undefined}
          title=${OFFICES[key].tab ? OFFICES[key].plural : undefined}>${OFFICES[key].tab || OFFICES[key].plural}</a>`;
      }
      // Not open yet (or no 2º turno): a plain tab at half opacity; the reason goes to the title and screen readers.
      const note = !inRound ? 'só 1º turno' : 'em breve';
      return html`<a key=${key} class="is-soon" href=${href} aria-label=${`${OFFICES[key].plural}, ${note}`} title=${`${OFFICES[key].plural} · ${note}`}
        aria-current=${route.office === key && inRound ? 'page' : undefined}>${OFFICES[key].tab || OFFICES[key].plural}</a>`;
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

/** Short state for the top bar: "Atualizado hh:mm", "Finalizada · hh:mm", or the amber/waiting text. */
export function shortState(info, updated) {
  const time = updated ? updated.slice(11, 16) : '';
  if (info.kind === 'live' || info.kind === 'partial') return time ? `Atualizado ${time}` : info.state;
  if (info.kind === 'done') return time ? `Finalizada · ${time}` : info.state;
  return info.state;
}

/** Top bar status: state at a glance (amber when the TSE is down), late states, refresh, screen-reader announcements. */
export function StatusBar({ feed, round }) {
  // Listens to every poll ("check"), so only this bar re-renders when the boletim did not change.
  const { data, loading, refresh } = useFeed(feed, ['data', 'check', 'loading']);
  const info = statusInfo(data, { round });
  // The screen reader hears only changes of state (normal → TSE down → back), never each poll.
  const last = useRef(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    setAnnounce(current => liveRegionText(last.current, info, current));
    if (info.kind !== 'loading') last.current = info;
  }, [info.kind, info.boletim]);

  const stale = info.tone === 'is-stale';
  const toTable = () => document.getElementById('tabela-estados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return html`<div class=${'status-bar ' + info.tone} title=${info.detail || info.state || undefined}>
    <span class="status-state">
      ${stale ? html`<${Icon} name="clock-alert" size=${16}/>` : html`<span class=${'dot ' + info.tone}></span>`}
      <span class="status-text">${data ? shortState(info, latestUpdated(data)) : info.state}</span>
    </span>
    ${info.partial && html`<button class="status-partial link-button" onClick=${toTable} title=${info.partial.names}>
      <${Icon} name="clock-alert" size=${14}/>${info.partial.text}</button>`}
    ${data && html`<button class="icon-button is-small" onClick=${refresh} disabled=${loading} aria-label="Atualizar dados agora" title=${loading ? 'Atualizando…' : 'Atualizar'}>
      <${Icon} name="refresh" size=${15}/></button>`}
    <p class="sr-only" aria-live=${info.kind === 'stale' || info.kind === 'error' ? 'assertive' : 'polite'}>${announce}</p>
  </div>`;
}

/** Source, TSE time, retries and last check, in small print (panel footer and page footer). */
export function StatusDetails({ feed, round }) {
  const { data, checkedAt } = useFeed(feed, ['data', 'check']);
  if (!data) return null;
  const info = statusInfo(data, { round });
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
  return html`<p class="status-details">
    <span class="status-source">Fonte: ${source}</span>
    ${updated && !stale && html`<span class="status-updated">Atualizado pelo TSE em <time>${updated}</time> (Brasília)</span>`}
    ${info.since && html`<span class="status-since">TSE sem resposta desde ${info.since}</span>`}
    ${info.retry && checkedAt
      ? html`<span class="status-retry">${info.retry} · última tentativa às ${brasiliaTime(checkedAt)}</span>`
      : checkedAt && html`<span class="status-checked">Verificado às ${brasiliaTime(checkedAt)}</span>`}
  </p>`;
}

/** Sources and disclaimer: end of the side panel on the dashboard, end of the page elsewhere. */
export function SiteFooter({ feed, round }) {
  return html`<footer class="site-footer">
    ${feed && html`<${StatusDetails} feed=${feed} round=${round}/>`}
    <p>Fonte: <a href=${TSE_SITE} target="_blank" rel="noopener">Tribunal Superior Eleitoral (TSE)</a> · resultados oficiais; estimativas só onde estiver escrito “estimativa”.${' '}<a href="#/sobre">Sobre os dados</a></p>
    <p class="muted">Site independente, sem vínculo com o TSE. Em caso de divergência, vale o resultado publicado pelo TSE.</p>
  </footer>`;
}

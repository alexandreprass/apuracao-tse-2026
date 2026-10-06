import { html } from '../lib/html.js';
import { ENABLED_OFFICES, OFFICES, ROUNDS, TSE_SITE } from '../config.js';
import { brasiliaTime } from '../lib/format.js';
import { isFinished } from '../hooks/useData.js';
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
      <button class="search-trigger" onClick=${onSearch} aria-label="Buscar candidato, município ou estado" aria-keyshortcuts="/">
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
  const keys = Object.keys(OFFICES).filter(key => OFFICES[key].rounds.includes(route.round));
  const keepUf = () => (route.uf && route.uf !== 'ZZ' ? '/' + route.uf : '');
  return html`<nav class="office-tabs" aria-label="Cargo">
    ${keys.map(key => ENABLED_OFFICES.includes(key)
      ? html`<a key=${key} href=${`#/${route.round}turno/${key}${keepUf(key)}`}
          aria-current=${route.office === key ? 'page' : undefined}>${OFFICES[key].plural}</a>`
      : html`<span key=${key} class="is-soon" aria-disabled="true" title="Disponível na próxima etapa">${OFFICES[key].plural}<small>em breve</small></span>`)}
  </nav>`;
}

function latestUpdate(data) {
  if (!data) return null;
  if (data.br) return data.br.updated;
  if (data.result) return data.result.updated;
  const times = Object.values(data.uf || {}).map(r => r.updated).filter(Boolean);
  // "dd/mm/yyyy hh:mm:ss": compare as yyyy-mm-dd hh:mm:ss.
  const key = t => t.slice(6, 10) + t.slice(3, 5) + t.slice(0, 2) + t.slice(11);
  return times.sort((a, b) => key(b).localeCompare(key(a)))[0] || null;
}

/** Where the numbers come from, when the TSE last updated them and whether the count is still running. */
export function StatusBar({ data, loading, onRefresh, round }) {
  if (!data) return html`<div class="status-bar" role="status"><span class="dot is-loading"></span>Carregando dados do TSE…</div>`;
  const finished = isFinished(data);
  const updated = latestUpdate(data);
  let state, tone;
  if (data.status === 'not-published') { state = `Aguardando apuração do ${ROUNDS[round].label}`; tone = 'is-waiting'; }
  else if (data.status === 'error') { state = 'Sem conexão com o TSE'; tone = 'is-error'; }
  else if (finished) { state = 'Totalização finalizada'; tone = 'is-done'; }
  else { state = 'Apuração em andamento'; tone = 'is-live'; }
  const source = data.source === 'tse'
    ? html`<a href=${TSE_SITE} target="_blank" rel="noopener">TSE ao vivo · resultados.tse.jus.br</a>`
    : data.source === 'local'
      ? html`<span title="Arquivos oficiais do TSE copiados para este site pelo script scripts/fetch-tse.mjs">Cópia dos arquivos oficiais do TSE</span>`
      : html`<span>TSE</span>`;
  return html`<div class=${'status-bar ' + tone} role="status" aria-live="polite">
    <span class="status-state"><span class=${'dot ' + tone}></span>${state}</span>
    <span class="status-source">Fonte: ${source}</span>
    ${updated && html`<span class="status-updated">Atualizado pelo TSE em <time>${updated}</time> (Brasília)</span>`}
    ${data.checkedAt && html`<span class="status-checked">Verificado às ${brasiliaTime(data.checkedAt)}</span>`}
    <button class="link-button" onClick=${onRefresh} disabled=${loading} aria-label="Atualizar dados agora">
      <${Icon} name="refresh" size=${14}/>${loading ? 'Atualizando…' : 'Atualizar'}
    </button>
  </div>`;
}

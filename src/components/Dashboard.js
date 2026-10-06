import { useEffect, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { int, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Icon } from './Icon.js';
import { ElectedBadge, Photo, StatusBadge } from './ui.js';

/**
 * One-screen dashboard (layout-pr2.md): map column (one-line strip, map, legend) and a side panel
 * (scoreboard, optional "Dá pra virar?", tabs). From 720px the page itself does not scroll, only the
 * panel does; on phones it stacks, with the scoreboard as the first tab and the top two stuck under the map.
 * `tabs`: [{ id, label, content }]. `drawer`: { title, content } shown over the panel (full screen on phones).
 */
export function Dashboard({ title, strip, crumbs, map, scoreboard, extra, leaders, tabs, drawer, onCloseDrawer, footer, scoreLabel = 'Placar', className = '' }) {
  const wide = useMediaQuery('(min-width: 720px)');
  const all = wide || !scoreboard ? tabs : [{ id: 'placar', label: scoreLabel, content: html`${scoreboard}${extra}` }, ...tabs];
  const [active, setActive] = useState(all[0]?.id);
  const current = all.find(t => t.id === active) || all[0];
  useEffect(() => {
    if (!drawer) return;
    const onKey = event => { if (event.key === 'Escape') onCloseDrawer?.(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [drawer]);
  return html`<div class=${'dash' + (className ? ' ' + className : '')}>
    <h1 class="sr-only">${title}</h1>
    <section class="dash-map" aria-label="Mapa e apuração">
      ${strip && html`<div class="dash-strip">${strip}</div>`}
      <div class="dash-stage">
        ${crumbs && html`<div class="dash-crumbs">${crumbs}</div>`}
        ${map}
      </div>
    </section>
    ${!wide && leaders?.length > 0 && html`<div class="dash-leaders" aria-label="Os dois primeiros">${leaders.slice(0, 2).map(c => html`<span key=${c.n}>
      <i class="swatch" style=${{ background: partyColor(c.party) }}></i><span class="dash-leader-name">${titleCase(c.name)}</span><b>${pct(c.pct)}</b></span>`)}</div>`}
    <aside class="dash-panel" aria-label="Resultados">
      ${wide && scoreboard && html`<div class="dash-score">${scoreboard}${extra}</div>`}
      ${all.length > 0 && html`<div class="dash-tabs" role="tablist" aria-label="Seções do painel">
        ${all.map(t => html`<button key=${t.id} role="tab" id=${'tab-' + t.id} aria-selected=${t.id === current.id} aria-controls="dash-tabpanel"
          onClick=${() => setActive(t.id)}>${t.label}</button>`)}
      </div>`}
      <div class="dash-tabpanel" id="dash-tabpanel" role="tabpanel" aria-labelledby=${current ? 'tab-' + current.id : undefined}>
        ${current?.content}
        ${footer}
      </div>
      ${drawer && html`<div class="dash-drawer" role="dialog" aria-modal="false" aria-label=${drawer.title}>
        <header class="dash-drawer-head"><b>${drawer.title}</b>
          <button class="icon-button" onClick=${onCloseDrawer} aria-label="Fechar"><${Icon} name="close" size=${18}/></button></header>
        <div class="dash-drawer-body">${drawer.content}</div>
      </div>`}
    </aside>
  </div>`;
}

/** The one-line count strip: % das seções apuradas, válidos, brancos/nulos, abstenção (+ actions). */
export function CountStrip({ result, actions }) {
  if (!result) return actions || null;
  const blankNull = (result.blankPct || 0) + (result.nullPct || 0);
  return html`<dl class="count-strip">
    <div><dt>Seções apuradas</dt><dd>${pct(result.sections?.pct || 0)}</dd></div>
    <div><dt>Válidos</dt><dd>${pct(result.validPct || 0)}</dd></div>
    <div><dt>Brancos/nulos</dt><dd>${pct(blankNull)}</dd></div>
    <div><dt>Abstenção</dt><dd>${pct(result.abstentionPct || 0)}</dd></div>
  </dl>${actions && html`<span class="strip-actions">${actions}</span>`}`;
}

/** Vice and coalition in one line (title of the row and its expandable detail). */
export const candidateExtra = c => [c.vice && `Vice: ${titleCase(c.vice)}`, c.coalition && `Coligação: ${titleCase(c.coalition)}${c.composition ? ` (${c.composition})` : ''}`,
  !c.coalition && c.composition && c.composition !== c.party && `Partidos: ${c.composition}`].filter(Boolean).join(' · ');

/** "Ver mais 1 candidato" / "Ver mais 3 candidatos". */
export const moreLabel = n => `Ver mais ${n} ${n === 1 ? 'candidato' : 'candidatos'}`;

/**
 * Scoreboard in thin rows: leader 48px (% in 20px), others 36px; 32px photo, party stripe, name · party, %, votes, bar.
 * The name is a button that opens the vice and coalition in a line under the row (also in the row's title).
 */
export function Scoreboard({ result, round, office, uf = null, show = 4, focus = null }) {
  const list = result.candidates;
  // A candidate picked in the search is always on screen (opened list if needed).
  const [open, setOpen] = useState(() => list.findIndex(c => c.n === focus) >= show);
  const [detail, setDetail] = useState(null);
  const visible = open ? list : list.slice(0, show);
  return html`<ol class="score">
    ${visible.map((c, i) => {
      const extra = candidateExtra(c), expanded = detail === c.n;
      return html`<li key=${c.n} id=${'cand-' + c.n} class=${'score-row' + (i === 0 ? ' is-leader' : '')} style=${{ '--party': partyColor(c.party) }} title=${extra || undefined}>
        <${Photo} candidate=${c} office=${office} uf=${uf} size=${32}/>
        <span class="score-name">${extra
          ? html`<button class="score-toggle" aria-expanded=${expanded} aria-controls=${'cand-extra-' + c.n} onClick=${() => setDetail(expanded ? null : c.n)}><b>${titleCase(c.name)}</b></button>`
          : html`<b>${titleCase(c.name)}</b>`} <small>${c.party}</small>
          ${round && c.kind === 'eleito' ? html`<${ElectedBadge} candidate=${c} round=${round}/>` : html`<${StatusBadge} candidate=${c}/>`}</span>
        <span class="score-pct">${pct(c.pct)}</span>
        <span class="score-votes">${int(c.votes)}</span>
        <span class="score-bar"><i style=${{ width: Math.min(100, c.pct) + '%' }}></i></span>
        ${extra && html`<span class="score-extra" id=${'cand-extra-' + c.n} hidden=${!expanded}>${c.n} · ${extra}</span>`}
      </li>`;
    })}
    ${list.length > show && html`<li class="score-more"><button class="link-button" onClick=${() => setOpen(!open)} aria-expanded=${open}>
      ${open ? 'Mostrar só os primeiros' : moreLabel(list.length - show)}</button></li>`}
  </ol>`;
}

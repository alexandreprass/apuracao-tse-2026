import { useEffect, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { compact, initials, int, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { photoUrl } from '../config.js';

const LOCAL_PHOTOS = { '280002551544': 'images/flavio.webp', '280002542548': 'images/lula.webp' };
const BASE = import.meta.env?.BASE_URL || '/';

/** Candidate portrait from the TSE, with initials while it loads or if it is missing. */
export function Photo({ candidate, office, uf, size = 56 }) {
  const [failed, setFailed] = useState(false);
  const local = LOCAL_PHOTOS[candidate.sq];
  const src = local ? BASE + local : photoUrl(1, office, candidate.sq, uf);
  const color = partyColor(candidate.party);
  return html`<span class="photo" style=${{ width: size + 'px', height: size + 'px', '--party': color }}>
    <span class="photo-initials" aria-hidden="true">${initials(candidate.name)}</span>
    ${src && !failed && html`<img src=${src} alt=${`Foto de ${titleCase(candidate.name)}`} width=${size} height=${size}
      loading="lazy" decoding="async" referrerpolicy="no-referrer" onError=${() => setFailed(true)}/>`}
  </span>`;
}

const STATUS = {
  eleito: ['Eleito', 'is-elected'],
  'segundo-turno': ['2º turno', 'is-runoff'],
  'nao-eleito': ['Não eleito', 'is-out'],
  suplente: ['Suplente', 'is-out'],
  pendente: ['Em apuração', 'is-pending'],
  outro: [null, 'is-out'],
};

export function StatusBadge({ candidate }) {
  if (!candidate.status && candidate.kind !== 'pendente') return null;
  const [label, tone] = STATUS[candidate.kind] || STATUS.outro;
  const text = candidate.kind === 'eleito' && /qp|média/i.test(candidate.status) ? candidate.status : (label || candidate.status);
  return html`<span class=${'badge ' + tone}>${text}</span>`;
}

export function Progress({ value, label, tone = '' }) {
  return html`<div class=${'progress ' + tone} role="progressbar" aria-valuemin="0" aria-valuemax="100"
    aria-valuenow=${Math.round(value * 100) / 100} aria-label=${label}>
    <i style=${{ width: Math.max(0, Math.min(100, value)) + '%' }}></i>
  </div>`;
}

/** Counting status, electorate, turnout, abstention and the vote breakdown of one place. */
export function Metrics({ result, compactMode = false }) {
  if (!result) return null;
  const items = [
    ['Eleitorado', int(result.electorate), result.electorate ? 'eleitores aptos' : ''],
    ['Comparecimento', int(result.turnout), pct(result.turnoutPct)],
    ['Abstenção', int(result.abstention), pct(result.abstentionPct)],
    ['Votos válidos', int(result.valid), pct(result.subJudice && result.totalVotes ? (100 * result.valid) / result.totalVotes : result.validPct) + ' do total'],
    ['Brancos', int(result.blank), pct(result.blankPct)],
    ['Nulos', int(result.null), pct(result.nullPct)],
  ];
  if (result.subJudice) items.push(['Anulados sub judice', int(result.subJudice), 'entram na base dos % do TSE até a decisão']);
  if (result.legend) items.push(['Votos de legenda', int(result.legend), 'no partido']);
  if (result.quotient) items.push(['Quociente eleitoral', int(result.quotient), 'votos por vaga']);
  return html`<div class=${'metrics' + (compactMode ? ' is-compact' : '')}>
    <div class="metric metric-progress">
      <span class="metric-label">Seções apuradas</span>
      <strong>${pct(result.sections?.pct || 0)}</strong>
      <${Progress} value=${result.sections?.pct || 0} label="Seções apuradas" tone="is-count"/>
      ${result.sections?.total ? html`<small>${int(result.sections.counted)} de ${int(result.sections.total)} seções</small>` : null}
    </div>
    ${items.map(([label, value, note]) => html`<div class="metric" key=${label}>
      <span class="metric-label">${label}</span><strong>${value}</strong>${note && html`<small>${note}</small>`}
    </div>`)}
  </div>`;
}

/** One candidate: portrait, name, number and party, votes, share and status. */
export function CandidateCard({ candidate, office, uf, rank, big = false, showVotes = true, placeholder = false, note }) {
  const color = partyColor(candidate.party);
  return html`<article class=${'candidate' + (big ? ' is-big' : '') + (placeholder ? ' is-placeholder' : '')}
      id=${'cand-' + candidate.n} style=${{ '--party': color }}>
    <${Photo} candidate=${candidate} office=${office} uf=${uf} size=${big ? 76 : 52}/>
    <div class="candidate-id">
      <h3>${titleCase(candidate.name)}</h3>
      <p class="candidate-party"><b>${candidate.party}</b> · ${candidate.n}${candidate.vice ? html`<span> · vice: ${titleCase(candidate.vice)}</span>` : null}</p>
      ${candidate.coalition ? html`<p class="candidate-coalition" title=${candidate.composition ? `Coligação: ${candidate.composition}` : undefined}>${titleCase(candidate.coalition)}</p>` : null}
      <${StatusBadge} candidate=${candidate}/>
      ${candidate.validity ? html`<span class=${'badge ' + (/sub judice/i.test(candidate.validity) ? 'is-subjudice' : 'is-out')}
        title=${/sub judice/i.test(candidate.validity) ? 'Candidatura com recurso pendente na Justiça Eleitoral: os votos ficam separados até a decisão, mas o TSE os inclui no cálculo dos percentuais.' : 'Situação da candidatura no TSE'}>${candidate.validity}</span>` : null}
    </div>
    <div class="candidate-score">
      ${placeholder
        ? html`<strong class="awaiting">aguardando</strong>${note && html`<span>${note}</span>`}`
        : html`<strong>${pct(candidate.pct)}</strong>${showVotes && html`<span>${int(candidate.votes)} votos</span>`}`}
    </div>
    ${!placeholder && html`<div class="candidate-bar" aria-hidden="true"><i style=${{ width: Math.min(100, candidate.pct) + '%' }}></i></div>`}
    ${rank != null && html`<span class="candidate-rank" aria-label=${`${rank}º lugar`}>${rank}º</span>`}
  </article>`;
}

/** Stacked bar of the leading candidates' shares. */
export function ShareBar({ candidates, max = 4 }) {
  const top = candidates.filter(c => c.votes > 0).slice(0, max);
  const rest = Math.max(0, 100 - top.reduce((s, c) => s + c.pct, 0));
  const label = top.map(c => `${titleCase(c.name)} ${pct(c.pct)}`).join(', ');
  return html`<div class="share-bar" role="img" aria-label=${label}>
    ${top.map(c => html`<i key=${c.n} style=${{ width: c.pct + '%', background: partyColor(c.party) }} title=${`${titleCase(c.name)} ${pct(c.pct)}`}></i>`)}
    ${rest > .05 && html`<i class="share-rest" style=${{ width: rest + '%' }} title=${`Outros ${pct(rest)}`}></i>`}
    <span class="share-mid" aria-hidden="true"></span>
  </div>`;
}

/** Horizontal bars of seats or counts per party. */
export function PartyBars({ rows, total, unit = 'cadeiras', limit = 30 }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return html`<ol class="party-bars">
    ${rows.slice(0, limit).map(r => html`<li key=${r.party}>
      <span class="party-name">${r.party}</span>
      <span class="party-track"><i style=${{ width: (100 * r.count) / max + '%', background: r.color }}></i></span>
      <b>${int(r.count)}</b>${total ? html`<small>${pct((100 * r.count) / total, 1)}</small>` : null}
    </li>`)}
    ${!rows.length && html`<li class="empty">Nenhum ${unit === 'cadeiras' ? 'eleito' : 'resultado'} ainda.</li>`}
  </ol>`;
}

/** A card with a heading (h2 by default; "h1" for pages whose main content is this card). */
export function Section({ title, subtitle, children, id, actions, className = '', heading = 'h2' }) {
  return html`<section class=${'card ' + className} id=${id} aria-labelledby=${id ? id + '-title' : undefined}>
    ${(title || actions) && html`<header class="card-head">
      <div>${title && html`<${heading} id=${id ? id + '-title' : undefined}>${title}</${heading}>`}${subtitle && html`<p>${subtitle}</p>`}</div>
      ${actions}
    </header>`}
    ${children}
  </section>`;
}

export function Segmented({ options, value, onChange, label }) {
  return html`<div class="segmented" role="group" aria-label=${label}>
    ${options.map(([key, text]) => html`<button key=${key} aria-pressed=${key === value} onClick=${() => onChange(key)}>${text}</button>`)}
  </div>`;
}

export function Loading({ text = 'Carregando resultados…' }) {
  return html`<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>${text}</div>`;
}

export function Notice({ tone = 'info', title, children }) {
  return html`<div class=${'notice is-' + tone} role=${tone === 'error' ? 'alert' : 'note'}>
    ${title && html`<strong>${title}</strong>`}<div>${children}</div>
  </div>`;
}

/** Days, hours and minutes until `target` (an ISO date), ticking every second. */
export function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  const ms = new Date(target).getTime() - now;
  const tick = ms > 3600_000 ? 30_000 : 1000;
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), tick); return () => clearInterval(t); }, [tick]);
  if (ms <= 0) return html`<span class="countdown">Urnas fechadas — aguardando os primeiros boletins do TSE</span>`;
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  // Seconds only distract days ahead: they appear in the last hour.
  const parts = ms > 3600_000 ? [[d, 'dias'], [h, 'h'], [m, 'min']] : [[m, 'min'], [s, 's']];
  return html`<span class="countdown" role="timer" aria-label=${`Faltam ${d} dias, ${h} horas e ${m} minutos`}>
    ${parts.map(([v, u]) => html`<span key=${u}><b>${String(v).padStart(2, '0')}</b>${u}</span>`)}
  </span>`;
}

export const CompactNumber = ({ value }) => html`<span title=${int(value)}>${compact(value)}</span>`;

/**
 * "⏱ boletim das 21:04": the number next to it is the last one received, not a live one.
 * `updated` is the TSE time "dd/mm/yyyy hh:mm:ss" (Brasília).
 */
export function StaleTag({ updated, text, short = false, title }) {
  const time = updated ? updated.slice(11, 16) : '';
  const label = text || (short ? time || 'atrasado' : `boletim das ${time || '—'}`);
  return html`<span class="stale-tag" title=${title || 'O TSE não respondeu na última consulta; mostrando o último boletim recebido'}>
    <span aria-hidden="true">⏱</span> ${label}${short ? html`<span class="sr-only"> (boletim atrasado)</span>` : ''}
  </span>`;
}

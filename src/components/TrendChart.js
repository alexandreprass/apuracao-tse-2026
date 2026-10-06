import { html } from '../lib/html.js';
import { pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';

/** Share of each leading candidate (y) against the share of sections counted (x). */
export function TrendChart({ points }) {
  const W = 600, H = 180, P = 28;
  const series = new Map();
  for (const point of points) for (const s of point.shares) {
    if (!series.has(s.n)) series.set(s.n, { ...s, values: [] });
    series.get(s.n).values.push([point.counted, s.pct]);
  }
  const all = [...series.values()].flatMap(s => s.values.map(v => v[1]));
  const lo = Math.max(0, Math.floor(Math.min(...all) - 2)), hi = Math.min(100, Math.ceil(Math.max(...all) + 2));
  const x = v => P + ((W - 2 * P) * v) / 100, y = v => H - P - ((H - 2 * P) * (v - lo)) / Math.max(1, hi - lo);
  return html`<figure class="trend">
    <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolução do percentual de cada candidato conforme a apuração avança">
      <line x1=${P} x2=${W - P} y1=${H - P} y2=${H - P} class="axis"/>
      <text x=${P} y=${H - 8} class="tick">0%</text><text x=${W - P} y=${H - 8} class="tick" text-anchor="end">100% apurado</text>
      <text x=${4} y=${y(hi) + 4} class="tick">${pct(hi, 0)}</text><text x=${4} y=${y(lo)} class="tick">${pct(lo, 0)}</text>
      ${[...series.values()].map(s => html`<polyline key=${s.n} fill="none" stroke=${partyColor(s.party)} stroke-width="2.5"
        points=${s.values.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')}/>`)}
    </svg>
    <figcaption>${[...series.values()].map(s => html`<span key=${s.n}><i class="swatch" style=${{ background: partyColor(s.party) }}></i>${titleCase(s.name)} ${pct(s.values.at(-1)[1])}</span>`)}</figcaption>
  </figure>`;
}

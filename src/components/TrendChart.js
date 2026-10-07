import { html } from '../lib/html.js';
import { pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { parseTseDate } from '../data/normalize.js';

/** Share of each leading candidate (y) against the share of sections counted (x). */
export function TrendChart({ points }) {
  const W = 600, H = 180, P = 28;
  const series = new Map();
  for (const point of points) for (const s of point.shares) {
    if (!series.has(s.n)) series.set(s.n, { ...s, values: [] });
    series.get(s.n).values.push([point.counted, s.pct]);
  }
  const all = [...series.values()].flatMap(s => s.values.map(v => v[1]));
  if (!all.length) return null;
  const lo = Math.max(0, Math.floor(Math.min(...all) - 2)), hi = Math.min(100, Math.ceil(Math.max(...all) + 2));
  const times = points.map(point => parseTseDate(point.time)?.getTime()).filter(Number.isFinite);
  const firstTime = Math.min(...times), lastTime = Math.max(...times);
  const xTime = time => P + ((W - 2 * P) * (time - firstTime)) / Math.max(60_000, lastTime - firstTime);
  const y = v => H - P - ((H - 2 * P) * (v - lo)) / Math.max(1, hi - lo);
  const timeLabel = value => {
    const date = new Date(value);
    return lastTime - firstTime >= 86_400_000
      ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  const xTicks = firstTime === lastTime ? [firstTime] : [firstTime, firstTime + (lastTime - firstTime) / 2, lastTime];
  return html`<figure class="trend">
    <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolução dos votos para presidente ao longo do tempo">
      <line x1=${P} x2=${W - P} y1=${H - P} y2=${H - P} class="axis"/>
      ${lo < 50 && hi > 50 && html`<line x1=${P} x2=${W - P} y1=${y(50)} y2=${y(50)} class="trend-majority"/><text x=${W - P} y=${y(50) - 4} class="tick" text-anchor="end">50%</text>`}
      ${xTicks.map((tick, i) => html`<text key=${i} x=${xTime(tick)} y=${H - 8} class="tick" text-anchor=${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>${timeLabel(tick)}</text>`)}
      <text x=${4} y=${y(hi) + 4} class="tick">${pct(hi, 0)}</text><text x=${4} y=${y(lo)} class="tick">${pct(lo, 0)}</text>
      ${[...series.values()].map(s => html`<g key=${s.n}>
        <polyline fill="none" stroke=${partyColor(s.party)} stroke-width="2.5"
          points=${points.flatMap(point => {
            const value = point.shares.find(item => item.n === s.n);
            const time = parseTseDate(point.time)?.getTime();
            return value && Number.isFinite(time) ? [`${xTime(time)},${y(value.pct)}`] : [];
          }).join(' ')}/>
        ${s.values.length === 1 && html`<circle cx=${xTime(firstTime)} cy=${y(s.values[0][1])} r="3" fill=${partyColor(s.party)}/>`}
      </g>`)}
    </svg>
    <figcaption>${[...series.values()].map(s => html`<span key=${s.n}><i class="swatch" style=${{ background: partyColor(s.party) }}></i>${titleCase(s.name)} ${pct(s.values.at(-1)[1])}</span>`)}</figcaption>
  </figure>`;
}

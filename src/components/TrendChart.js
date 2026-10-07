import { useRef } from 'preact/hooks';
import { html } from '../lib/html.js';
import { pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { parseTseDate } from '../data/normalize.js';

/** Share of each leading candidate (y) against the share of sections counted (x). */
function TrendPlot({ points, large = false }) {
  const W = large ? 1100 : 600, H = large ? 420 : 180, P = large ? 54 : 28;
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
    return `${String(date.getHours()).padStart(2, '0')}h`;
  };
  const firstHour = new Date(firstTime);
  firstHour.setMinutes(0, 0, 0);
  if (firstHour.getTime() <= firstTime) firstHour.setHours(firstHour.getHours() + 1);
  const xTicks = [];
  for (let tick = firstHour.getTime(); tick < lastTime; tick += 3_600_000) xTicks.push(tick);
  if (new Date(lastTime).getMinutes() === 0) xTicks.push(lastTime);
  if (xTicks.length < 3) xTicks.splice(0, xTicks.length, ...[firstTime, firstTime + (lastTime - firstTime) / 2, lastTime]);
  const hourlyPoints = points.filter(point => point.time?.slice(14, 16) === '00');
  const yTicks = [...new Set([lo, ...[40, 50, 60].filter(value => value > lo && value < hi), hi])].sort((a, b) => a - b);
  return html`<figure class="trend">
    <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Evolução dos votos para presidente ao longo do tempo">
      <line x1=${P} x2=${W - P} y1=${H - P} y2=${H - P} class="axis"/>
      ${yTicks.map(tick => html`<g key=${tick}>
        <line x1=${P} x2=${W - P} y1=${y(tick)} y2=${y(tick)} class=${tick === 50 ? 'trend-majority' : 'trend-grid'}/>
        <text x=${P - 8} y=${y(tick) + 4} class="tick" text-anchor="end">${pct(tick, 0)}</text>
      </g>`)}
      ${xTicks.map((tick, i) => html`<text key=${i} x=${xTime(tick)} y=${H - 8} class="tick" text-anchor=${i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>${timeLabel(tick)}</text>`)}
      ${[...series.values()].map((s, seriesIndex) => html`<g key=${s.n}>
        <polyline fill="none" stroke=${partyColor(s.party)} stroke-width=${large ? 4 : 2.5} stroke-linecap="round" stroke-linejoin="round" class="trend-line"
          points=${points.flatMap(point => {
            const value = point.shares.find(item => item.n === s.n);
            const time = parseTseDate(point.time)?.getTime();
            return value && Number.isFinite(time) ? [`${xTime(time)},${y(value.pct)}`] : [];
          }).join(' ')}/>
        ${large && hourlyPoints.map(point => {
          const value = point.shares.find(item => item.n === s.n);
          const time = parseTseDate(point.time)?.getTime();
          if (!value || !Number.isFinite(time)) return null;
          const labelY = Math.max(P + 12, Math.min(H - P - 6, y(value.pct) + (seriesIndex === 0 ? -10 : 16)));
          return html`<g key=${`${s.n}-${time}`}>
            <circle cx=${xTime(time)} cy=${y(value.pct)} r="4" fill=${partyColor(s.party)} stroke="var(--surface)" stroke-width="2"/>
            <text x=${xTime(time)} y=${labelY} class="hour-value" text-anchor="middle" style=${{ fill: partyColor(s.party) }}>${pct(value.pct, 1)}</text>
          </g>`;
        })}
        ${s.values.length === 1 && html`<circle cx=${xTime(firstTime)} cy=${y(s.values[0][1])} r=${large ? 6 : 3} fill=${partyColor(s.party)}/>`}
      </g>`)}
    </svg>
    <figcaption>${[...series.values()].map(s => html`<span key=${s.n}><i class="swatch" style=${{ background: partyColor(s.party) }}></i>${titleCase(s.name)} ${pct(s.values.at(-1)[1])}</span>`)}</figcaption>
  </figure>`;
}

/** Official vote evolution with an expanded view and a 20-second replay. */
export function TrendChart({ points }) {
  const dialog = useRef(null);
  const animationFrame = useRef(null);
  const open = () => dialog.current?.showModal();
  const play = () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    const lines = [...(dialog.current?.querySelectorAll('.trend-line') || [])].map(line => {
      const length = line.getTotalLength();
      line.style.strokeDasharray = `${length}px`;
      line.style.strokeDashoffset = `${length}px`;
      return { line, length };
    });
    const duration = 20_000;
    let started = null;
    const draw = now => {
      started ??= now;
      const progress = Math.min(1, (now - started) / duration);
      for (const { line, length } of lines) line.style.strokeDashoffset = `${length * (1 - progress)}px`;
      if (progress < 1) animationFrame.current = requestAnimationFrame(draw);
      else animationFrame.current = null;
    };
    animationFrame.current = requestAnimationFrame(draw);
  };
  const stop = () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
  };
  if (!points.length) return null;
  return html`<div class="trend-experience">
    <div class="trend-controls"><button class="button is-small" onClick=${open}>EXPANDIR</button></div>
    <${TrendPlot} points=${points}/>
    <dialog class="trend-dialog" ref=${dialog} aria-label="Evolução dos votos presidenciais" onClose=${stop}
      onClick=${event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div class="trend-dialog-head">
        <div><h2>Evolução dos votos</h2><p class="muted small">Totalização oficial do TSE · 1º turno</p></div>
        <button class="icon-button" aria-label="Fechar evolução" onClick=${() => dialog.current?.close()}>×</button>
      </div>
      <div class="trend-dialog-body">
        <div class="trend-dialog-controls">
          <button class="button" onClick=${play} aria-label="Reproduzir evolução desde o início">▶ Reproduzir</button>
          <span class="muted small">A linha percorre o histórico em cerca de 20 segundos.</span>
        </div>
        <${TrendPlot} points=${points} large=${true}/>
      </div>
    </dialog>
  </div>`;
}


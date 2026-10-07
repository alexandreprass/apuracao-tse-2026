import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { parseTseDate } from '../data/normalize.js';

/** Share of each leading candidate (y) against the share of sections counted (x). */
function TrendPlot({ points, visiblePoints, large = false }) {
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
      ${[...series.values()].map(s => {
        const visible = visiblePoints.flatMap(point => {
          const value = point.shares.find(item => item.n === s.n);
          const time = parseTseDate(point.time)?.getTime();
          return value && Number.isFinite(time) ? [{ x: xTime(time), y: y(value.pct), pct: value.pct }] : [];
        });
        return html`<g key=${s.n}>
          ${visible.length > 1 && html`<polyline fill="none" stroke=${partyColor(s.party)} stroke-width=${large ? 4 : 2.5}
            points=${visible.map(point => `${point.x},${point.y}`).join(' ')}/>`}
          ${visible.length === 1 && html`<circle cx=${visible[0].x} cy=${visible[0].y} r=${large ? 6 : 3} fill=${partyColor(s.party)}/>`}
        </g>`;
      })}
    </svg>
    <figcaption>${[...series.values()].map(s => {
      const last = [...visiblePoints].reverse().flatMap(point => point.shares.filter(item => item.n === s.n))[0];
      return html`<span key=${s.n}><i class="swatch" style=${{ background: partyColor(s.party) }}></i>${titleCase(s.name)} ${pct(last?.pct ?? s.values.at(-1)[1])}</span>`;
    })}</figcaption>
  </figure>`;
}

/** Official vote evolution with an expanded view and a 20-second replay. */
export function TrendChart({ points }) {
  const dialog = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playback, setPlayback] = useState(0);
  const [visibleCount, setVisibleCount] = useState(points.length);
  const visiblePoints = points.slice(0, visibleCount);

  useEffect(() => {
    if (expanded && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [expanded]);

  useEffect(() => {
    if (!playing) return undefined;
    const duration = 20_000;
    const started = performance.now();
    let frame;
    const animate = now => {
      const progress = Math.min(1, (now - started) / duration);
      setVisibleCount(Math.max(1, Math.ceil(progress * points.length)));
      if (progress < 1) frame = requestAnimationFrame(animate);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, playback, points.length]);

  if (!points.length) return null;
  const play = () => {
    setVisibleCount(1);
    setPlayback(value => value + 1);
    setPlaying(true);
  };
  const close = () => {
    setPlaying(false);
    setExpanded(false);
  };
  return html`<>
    <div class="trend-controls"><button class="button is-small" onClick=${() => setExpanded(true)}>EXPANDIR</button></div>
    <${TrendPlot} points=${points} visiblePoints=${points}/>
    <dialog class="trend-dialog" ref=${dialog} aria-label="Evolução dos votos presidenciais" onClose=${close}
      onClick=${event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div class="trend-dialog-head">
        <div><h2>Evolução dos votos</h2><p class="muted small">Totalização oficial do TSE · 1º turno</p></div>
        <button class="icon-button" aria-label="Fechar evolução" onClick=${() => dialog.current?.close()}>×</button>
      </div>
      <div class="trend-dialog-body">
        <div class="trend-dialog-controls">
          <button class="button" onClick=${play} aria-label="Reproduzir evolução desde o início">▶ ${playing ? 'Reiniciar' : 'Reproduzir'}</button>
          <span class="muted small">A linha percorre o histórico em cerca de 20 segundos.</span>
        </div>
        <${TrendPlot} points=${points} visiblePoints=${visiblePoints} large/>
      </div>
    </dialog>
  </>`;
}


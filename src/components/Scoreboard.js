import { html } from '../lib/html.js';
import { compact, int, marginShare, percent, points, share } from '../lib/format.js';
import { CANDIDATES } from '../data/mocks.js';
import { outlook } from '../data/outlook.js';

function Contender({ index, result }) {
  const candidate = (result.contenders || CANDIDATES)[index];
  return html`<div class=${'contender tone-' + candidate.tone}>
    <img src=${candidate.photo} alt="" width="44" height="44"/>
    <div class="contender-id">
      <strong>${candidate.name}</strong>
      <span><b class="party">${candidate.party} ${candidate.number}</b>${result.winner === index && html`<em class="lead-mark">na frente</em>`}</span>
    </div>
    <div class="contender-score">
      <b>${percent(share(result, index))}</b>
      <span>${int(result.votes[index])} votos</span>
    </div>
  </div>`;
}

/** Share bar anchored at both ends, so the 50% mark shows who is closer to winning outright. */
export function DuelBar({ result, marker = false }) {
  const a = share(result, 0), b = share(result, 1);
  const names = result.contenders || CANDIDATES;
  const label = `${names[0].name} ${percent(a)}, ${names[1].name} ${percent(b)}, outros ${percent(Math.max(0, 1 - a - b))}`;
  return html`<div class="duel-bar" role="img" aria-label=${label}>
    <i class="tone-blue" style=${{ width: a * 100 + '%' }}></i>
    <i class="tone-red" style=${{ width: b * 100 + '%' }}></i>
    ${marker && html`<span class="duel-mid"></span>`}
  </div>`;
}

/** One sentence answering "can this still change?" from what is left to count. */
function Outlook({ result, majorityRule }) {
  const { remaining, gap, status, runoff } = outlook(result, { majorityRule });
  const leader = (result.contenders || CANDIDATES)[result.winner].name;
  const verdict = {
    closed: html`<b>Apuração encerrada.</b>`,
    decided: html`<b>${leader} não pode mais ser alcançado.</b> Faltam cerca de ${compact(remaining)} votos, menos que a diferença de ${compact(gap)}.`,
    open: html`<b>Ainda pode virar.</b> Faltam cerca de ${compact(remaining)} votos, mais que a diferença de ${compact(gap)}.`,
  }[status];
  const second = { certain: 'Ninguém chega a 50%: haverá 2º turno.', outright: `${leader} vence no 1º turno.` }[runoff];
  return html`<p class="outlook" aria-live="polite">${verdict}${second && html` <span class="outlook-runoff">${second}</span>`}</p>`;
}

export function Scoreboard({ office, scope, result, majorityRule }) {
  return html`<section class="scoreboard" aria-label=${`${office}: resultado em ${scope}`}>
    <div class="duel">
      <${Contender} index=${0} result=${result}/>
      <${Contender} index=${1} result=${result}/>
    </div>
    <${DuelBar} result=${result} marker=${true}/>
    <div class="scoreboard-foot">
      <h2>${office}<span> em ${scope}</span></h2>
      <${Outlook} result=${result} majorityRule=${majorityRule}/>
      <p class="counting"><span>Diferença de ${points(marginShare(result))}</span><span><i class="pulse"></i>${percent(result.completion)} das seções</span></p>
    </div>
  </section>`;
}

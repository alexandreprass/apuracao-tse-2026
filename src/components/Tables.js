import { useMemo, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { int, normalize, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { REGIONS, regionOf, stateName, UFS } from '../data/states.js';
import { marginPoints } from '../data/analysis.js';
import { StatusBadge } from './ui.js';

const PAGE = 50;

function useSort(initial, initialDir = 'desc') {
  const [sort, setSort] = useState({ key: initial, dir: initialDir });
  const toggle = key => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const header = (key, label, className = '') => html`<th scope="col" class=${className}
    aria-sort=${sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
    <button class="th-button" onClick=${() => toggle(key)}>${label}${sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
  const apply = (rows, getters) => {
    const get = getters[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * sign;
    });
  };
  return { header, apply };
}

const Who = ({ c }) => c ? html`<span class="who"><i class="swatch" style=${{ background: partyColor(c.party) }}></i>${titleCase(c.name)} <small>${c.party}</small></span>` : html`<span class="muted">—</span>`;

/** All 27 states (and abroad, kept apart) with who leads, by how much and how much is counted. */
export function StatesTable({ data, onState, exterior }) {
  const [region, setRegion] = useState('');
  const [query, setQuery] = useState('');
  const { header, apply } = useSort('uf', 'asc');
  const rows = UFS.filter(uf => data.uf?.[uf])
    .filter(uf => !region || regionOf(uf) === region)
    .filter(uf => !query || normalize(stateName(uf) + ' ' + uf).includes(normalize(query)))
    .map(uf => ({ uf, r: data.uf[uf] }));
  const sorted = apply(rows, {
    uf: x => stateName(x.uf), lead: x => x.r.candidates[0]?.pct || 0, margin: x => marginPoints(x.r),
    count: x => x.r.sections.pct, turnout: x => x.r.turnoutPct, electorate: x => x.r.electorate,
  });
  const row = ({ uf, r }, label) => html`<tr key=${uf}>
    <th scope="row"><button class="link-button" onClick=${() => onState(uf)}>${label || stateName(uf)}</button> <small class="muted">${uf === 'ZZ' ? '' : uf}</small></th>
    <td><${Who} c=${r.candidates[0]}/></td>
    <td class="num">${pct(r.candidates[0]?.pct || 0)}</td>
    <td><${Who} c=${r.candidates[1]}/></td>
    <td class="num">${pct(marginPoints(r))}</td>
    <td class="num">${pct(r.sections.pct)}</td>
    <td class="num">${pct(r.turnoutPct)}</td>
    <td class="num">${int(r.electorate)}</td>
  </tr>`;
  return html`<div class="table-tools">
      <input type="search" placeholder="Filtrar estado" aria-label="Filtrar estado" value=${query} onInput=${e => setQuery(e.currentTarget.value)}/>
      <select aria-label="Filtrar por região" value=${region} onChange=${e => setRegion(e.currentTarget.value)}>
        <option value="">Todas as regiões</option>${REGIONS.map(r => html`<option key=${r} value=${r}>${r}</option>`)}
      </select>
    </div>
    <div class="table-wrap"><table class="data-table">
      <caption class="sr-only">Resultado por estado</caption>
      <thead><tr>${header('uf', 'Estado')}<th scope="col">1º colocado</th>${header('lead', '%', 'num')}<th scope="col">2º colocado</th>
        ${header('margin', 'Diferença', 'num')}${header('count', 'Apurado', 'num')}${header('turnout', 'Comparec.', 'num')}${header('electorate', 'Eleitorado', 'num')}</tr></thead>
      <tbody>${sorted.map(x => row(x))}</tbody>
      ${exterior && html`<tbody class="exterior-row"><tr><th colspan="8" scope="rowgroup" class="group-head">Fora do Brasil</th></tr>${row({ uf: 'ZZ', r: exterior }, 'Exterior')}</tbody>`}
    </table></div>`;
}

/** Every municipality of a state, searchable and sortable. */
export function MunicipalitiesTable({ rows, onMunicipality }) {
  const [query, setQuery] = useState('');
  const [party, setParty] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const { header, apply } = useSort('electorate');
  const all = useMemo(() => [...rows.entries()].map(([id, r]) => ({ id, r })), [rows]);
  const parties = [...new Set(all.map(x => x.r.candidates[0]?.party).filter(Boolean))].sort();
  const filtered = all.filter(x => (!party || x.r.candidates[0]?.party === party) && (!query || normalize(x.r.name).includes(normalize(query))));
  const sorted = apply(filtered, {
    name: x => x.r.name, lead: x => x.r.candidates[0]?.pct || 0, margin: x => marginPoints(x.r),
    electorate: x => x.r.electorate, turnout: x => x.r.turnoutPct, valid: x => x.r.valid,
  });
  return html`<div class="table-tools">
      <input type="search" placeholder="Buscar município" aria-label="Buscar município" value=${query} onInput=${e => { setQuery(e.currentTarget.value); setLimit(PAGE); }}/>
      <select aria-label="Filtrar por partido do líder" value=${party} onChange=${e => setParty(e.currentTarget.value)}>
        <option value="">Qualquer líder</option>${parties.map(p => html`<option key=${p} value=${p}>Lidera: ${p}</option>`)}
      </select>
      <span class="muted">${int(filtered.length)} municípios</span>
    </div>
    <div class="table-wrap"><table class="data-table">
      <caption class="sr-only">Resultado por município</caption>
      <thead><tr>${header('name', 'Município')}<th scope="col">1º colocado</th>${header('lead', '%', 'num')}<th scope="col">2º colocado</th>
        ${header('margin', 'Diferença', 'num')}${header('valid', 'Válidos', 'num')}${header('turnout', 'Comparec.', 'num')}${header('electorate', 'Eleitorado', 'num')}</tr></thead>
      <tbody>${sorted.slice(0, limit).map(({ id, r }) => html`<tr key=${id}>
        <th scope="row"><button class="link-button" onClick=${() => onMunicipality(id)}>${r.name}</button></th>
        <td><${Who} c=${r.candidates[0]}/></td><td class="num">${pct(r.candidates[0]?.pct || 0)}</td>
        <td><${Who} c=${r.candidates[1]}/></td><td class="num">${pct(marginPoints(r))}</td>
        <td class="num">${int(r.valid)}</td><td class="num">${pct(r.turnoutPct)}</td><td class="num">${int(r.electorate)}</td>
      </tr>`)}</tbody>
    </table></div>
    ${sorted.length > limit && html`<button class="button more" onClick=${() => setLimit(l => l + PAGE * 2)}>Mostrar mais (${int(sorted.length - limit)} restantes)</button>`}`;
}

const STATUS_FILTERS = [['', 'Todas as situações'], ['eleito', 'Eleitos'], ['suplente', 'Suplentes'], ['nao-eleito', 'Não eleitos']];

/** Long candidate lists (deputies): search by name or number, filter by party and status. */
export function CandidatesTable({ candidates, focus }) {
  const [query, setQuery] = useState(focus || '');
  const [party, setParty] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const ranked = useMemo(() => candidates.map((c, i) => ({ ...c, rank: i + 1 })), [candidates]);
  const parties = useMemo(() => [...new Set(candidates.map(c => c.party))].sort(), [candidates]);
  const needle = normalize(query.trim());
  const filtered = ranked.filter(c => (!party || c.party === party) && (!status || c.kind === status)
    && (!needle || normalize(c.name).includes(needle) || c.n.startsWith(needle)));
  return html`<div class="table-tools">
      <input type="search" placeholder="Nome ou número" aria-label="Buscar candidato por nome ou número" value=${query}
        onInput=${e => { setQuery(e.currentTarget.value); setLimit(PAGE); }}/>
      <select aria-label="Filtrar por partido" value=${party} onChange=${e => { setParty(e.currentTarget.value); setLimit(PAGE); }}>
        <option value="">Todos os partidos</option>${parties.map(p => html`<option key=${p} value=${p}>${p}</option>`)}
      </select>
      <select aria-label="Filtrar por situação" value=${status} onChange=${e => { setStatus(e.currentTarget.value); setLimit(PAGE); }}>
        ${STATUS_FILTERS.map(([k, label]) => html`<option key=${k} value=${k}>${label}</option>`)}
      </select>
      <span class="muted">${int(filtered.length)} candidatos</span>
    </div>
    <div class="table-wrap"><table class="data-table">
      <caption class="sr-only">Votação por candidato</caption>
      <thead><tr><th scope="col" class="num">#</th><th scope="col">Candidato</th><th scope="col" class="num">Número</th><th scope="col">Partido</th>
        <th scope="col" class="num">Votos</th><th scope="col" class="num">%</th><th scope="col">Situação</th></tr></thead>
      <tbody>${filtered.slice(0, limit).map(c => html`<tr key=${c.n + c.sq}>
        <td class="num muted">${c.rank}</td><th scope="row">${titleCase(c.name)}</th><td class="num">${c.n}</td>
        <td><span class="who"><i class="swatch" style=${{ background: partyColor(c.party) }}></i>${c.party}</span></td>
        <td class="num">${int(c.votes)}</td><td class="num">${pct(c.pct)}</td><td><${StatusBadge} candidate=${c}/></td>
      </tr>`)}</tbody>
    </table></div>
    ${filtered.length > limit && html`<button class="button more" onClick=${() => setLimit(l => l + PAGE * 2)}>Mostrar mais (${int(filtered.length - limit)} restantes)</button>`}`;
}

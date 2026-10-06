import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { normalize, titleCase } from '../lib/format.js';
import { STATES, UFS } from '../data/states.js';
import { OFFICES } from '../config.js';
import { Icon } from './Icon.js';

const MAX = 25;

/** Candidates (from the results already loaded), states and municipalities. */
export function findEntries(geo, candidates, query, only = null) {
  const needle = normalize(query.trim());
  if (only === 'municipality') {
    if (!needle) return [];
    return (geo.places || geo.municipalities).filter(m => normalize(m.name).includes(needle))
      .sort((a, b) => (normalize(a.name).startsWith(needle) ? 0 : 1) - (normalize(b.name).startsWith(needle) ? 0 : 1) || b.population - a.population)
      .slice(0, MAX).map(m => ({ type: 'municipality', id: m.id, name: m.name, detail: `Município · ${STATES[m.uf][0]}`, tag: m.uf }));
  }
  if (!needle) return [
    ...candidates.slice(0, 2).map(c => ({ type: 'candidate', ...c })),
    { type: 'state', id: 'SP', name: 'São Paulo', detail: 'Estado · Sudeste', tag: 'SP' },
    { type: 'municipality', id: '3550308', name: 'São Paulo', detail: 'Município · São Paulo', tag: 'SP' },
  ];
  const found = candidates.filter(c => normalize(c.name).includes(needle) || normalize(c.fullName || '').includes(needle) || c.n === needle)
    .slice(0, 12).map(c => ({ type: 'candidate', ...c }));
  const states = Object.entries(STATES)
    .filter(([uf, [name]]) => normalize(name).includes(needle) || uf.toLowerCase() === needle)
    .map(([uf, [name, region]]) => ({ type: 'state', id: uf, name, detail: `Estado · ${region}`, tag: uf }));
  if ('exterior'.startsWith(needle)) states.push({ type: 'state', id: 'ZZ', name: 'Exterior', detail: 'Eleitores fora do Brasil', tag: 'ZZ' });
  const municipalities = (geo.places || geo.municipalities).filter(m => normalize(m.name).includes(needle))
    .sort((a, b) => (normalize(a.name).startsWith(needle) ? 0 : 1) - (normalize(b.name).startsWith(needle) ? 0 : 1) || b.population - a.population)
    .slice(0, MAX).map(m => ({ type: 'municipality', id: m.id, name: m.name, detail: `Município · ${STATES[m.uf][0]}`, tag: m.uf }));
  return [...found, ...states, ...municipalities];
}

/** Every candidate of the offices already published: president nationally, governors per state. */
export function searchableCandidates(presidents, governors) {
  const list = (presidents?.br?.candidates || []).map(c => ({ ...c, office: 'presidente', uf: null }));
  for (const uf of UFS) for (const c of governors?.uf?.[uf]?.candidates || []) list.push({ ...c, office: 'governador', uf });
  return list.sort((a, b) => b.votes - a.votes);
}

export function SearchDialog({ geo, candidates, onPick, onClose, only = null }) {
  const dialog = useRef(), list = useRef();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const entries = useMemo(() => findEntries(geo, candidates, query, only), [geo, candidates, query, only]);

  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = entry => { onPick(entry); dialog.current.close(); };
  const onKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(i => entries.length ? (i + step + entries.length) % entries.length : 0);
    } else if (event.key === 'Enter' && entries[active]) {
      event.preventDefault();
      pick(entries[active]);
    }
  };

  return html`<dialog class="search-dialog" ref=${dialog} aria-label=${only ? 'Escolher meu município' : 'Buscar'} onClose=${onClose}
    onClick=${event => { if (event.target === dialog.current) dialog.current.close(); }}>
    <div class="search-field">
      <${Icon} name="search"/>
      <input type="text" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list"
        aria-activedescendant=${entries[active] ? 'search-option-' + active : undefined}
        placeholder=${only ? 'Nome do seu município' : 'Candidato, número, estado ou município'} aria-label=${only ? 'Buscar seu município' : 'Buscar candidato, estado ou município'} autocomplete="off" spellcheck=${false}
        value=${query} onInput=${event => { setQuery(event.currentTarget.value); setActive(0); }} onKeyDown=${onKeyDown}/>
      <button class="icon-button" aria-label="Fechar busca" onClick=${() => dialog.current.close()}><${Icon} name="close"/></button>
    </div>
    ${entries.length
      ? html`<ul class="search-results" id="search-results" role="listbox" ref=${list}>
          ${entries.map((e, index) => html`<li key=${e.type + (e.id || e.office + e.uf + e.n)} id=${'search-option-' + index} role="option"
            aria-selected=${index === active} onClick=${() => pick(e)} onPointerMove=${() => setActive(index)}>
            <span class=${'place-tag' + (e.type === 'state' ? ' is-state' : '')}>${e.type === 'candidate' ? e.n : e.type === 'state' ? e.tag : html`<${Icon} name="pin" size=${12}/> ${e.tag}`}</span>
            <span class="place-name"><strong>${e.type === 'candidate' ? titleCase(e.name) : e.name}</strong>
              <small>${e.type === 'candidate' ? `${OFFICES[e.office].label}${e.uf ? ' · ' + STATES[e.uf][0] : ''} · ${e.party} ${e.n} · ${e.status || ''}` : e.detail}</small></span>
            <${Icon} name="right" size=${16}/>
          </li>`)}
        </ul>`
      : only && !query.trim() ? html`<p class="empty">Digite o nome da sua cidade. Ela fica salva só neste navegador.</p>`
      : html`<p class="empty">Nada encontrado para “${query.trim()}”. Confira a grafia ou tente só o começo do nome.</p>`}
    <footer class="search-keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></footer>
  </dialog>`;
}

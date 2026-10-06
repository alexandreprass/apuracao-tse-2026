import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html } from '../lib/html.js';
import { normalize } from '../lib/format.js';
import { STATES } from '../data/mocks.js';
import { Icon } from './Icon.js';

const MAX_MUNICIPALITIES = 25;
const SUGGESTIONS = [
  { type: 'state', id: 'SP', name: 'São Paulo', detail: 'Estado · 645 municípios', tag: 'SP' },
  { type: 'municipality', id: '3550308', name: 'São Paulo', detail: 'Município · 57 zonas eleitorais', tag: 'SP' },
];

function findPlaces(geo, query) {
  const needle = normalize(query.trim());
  if (!needle) return SUGGESTIONS;
  const states = Object.entries(STATES)
    .filter(([uf, [name]]) => normalize(name).includes(needle) || uf.toLowerCase() === needle)
    .map(([uf, [name, , region]]) => ({ type: 'state', id: uf, name, detail: `Estado · ${region}`, tag: uf }));
  const municipalities = geo.municipalities
    .filter(m => normalize(m.name).includes(needle))
    .sort((a, b) => b.population - a.population)
    .slice(0, MAX_MUNICIPALITIES)
    .map(m => ({ type: 'municipality', id: m.id, name: m.name, detail: `Município · ${STATES[m.uf][0]}`, tag: m.uf }));
  return [...states, ...municipalities];
}

export function SearchDialog({ geo, onState, onMunicipality, onClose }) {
  const dialog = useRef(), list = useRef();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const places = useMemo(() => findPlaces(geo, query), [geo, query]);

  // showModal() gives focus trapping, Esc to close and focus restoration for free.
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = place => {
    if (place.type === 'state') onState(place.id);
    else onMunicipality(place.id);
    dialog.current.close();
  };

  const onKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(index => places.length ? (index + step + places.length) % places.length : 0);
    } else if (event.key === 'Enter' && places[active]) {
      event.preventDefault();
      pick(places[active]);
    }
  };

  return html`<dialog class="search-dialog" ref=${dialog} aria-label="Buscar no mapa" onClose=${onClose}
    onClick=${event => { if (event.target === dialog.current) dialog.current.close(); }}>
    <div class="search-field">
      <${Icon} name="search"/>
      <input type="text" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list"
        aria-activedescendant=${places[active] ? 'search-option-' + active : undefined}
        placeholder="Buscar estado ou município" aria-label="Buscar estado ou município" autocomplete="off" spellcheck=${false}
        value=${query} onInput=${event => { setQuery(event.currentTarget.value); setActive(0); }} onKeyDown=${onKeyDown}/>
      <button class="icon-button" aria-label="Fechar busca" onClick=${() => dialog.current.close()}><${Icon} name="close"/></button>
    </div>

    ${!query.trim() && html`<p class="search-caption">Sugestões</p>`}
    ${places.length
      ? html`<ul class="search-results" id="search-results" role="listbox" ref=${list}>
          ${places.map((place, index) => html`<li key=${place.type + place.id} id=${'search-option-' + index} role="option"
            aria-selected=${index === active} onClick=${() => pick(place)} onPointerMove=${() => setActive(index)}>
            <span class="place-tag">${place.tag}</span>
            <span class="place-name"><strong>${place.name}</strong><small>${place.detail}</small></span>
            <${Icon} name="right" size=${16}/>
          </li>`)}
        </ul>`
      : html`<p class="empty">Nenhum lugar com “${query.trim()}”. Confira a grafia ou tente só o começo do nome.</p>`}

    <footer class="search-keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></footer>
  </dialog>`;
}

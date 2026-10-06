import { useEffect, useMemo } from 'preact/hooks';
import { html } from '../lib/html.js';
import { pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { unpackMunicipalities } from '../data/analysis.js';
import { finalistNumbers, mineOffices, mineRow } from '../data/mine.js';
import { stateName, ufOfIbge } from '../data/states.js';
import { loadState } from '../map/useGeography.js';
import { OFFICES } from '../config.js';
import { officeFeed, useFeed, useLiveMunicipality, useMunicipalPack, useOffice } from '../hooks/useData.js';
import { useMyMunicipality } from '../hooks/useMyMunicipality.js';
import { Icon } from './Icon.js';
import { ShareBar } from './ui.js';

const RIGHT = {
  live: row => `${pct(row.apurado)} apurado`,
  copy: row => `${pct(row.apurado)} apurado`,
  first: () => '1º turno',
  error: () => 'TSE sem resposta',
  'not-published': () => 'aguardando o TSE',
  waiting: () => 'aguardando',
  loading: () => 'carregando…',
};

/** One compact row: office, the two finalists, a thin bar and the city's % apurado on the right. */
function MineRow({ office, place, ibge, officeData }) {
  const federal = !!OFFICES[office].federal;
  const published = !!officeData && !officeData.status;
  const live = useLiveMunicipality(2, office, ibge, published);
  const first = useOffice(1, office);
  const pack1 = useMunicipalPack(1, office, place.uf);
  const pack2 = useMunicipalPack(2, office, published ? place.uf : null);
  // Municipal files list candidates by number; names and parties come from the race itself.
  const race1 = federal ? first.data?.br : first.data?.uf?.[place.uf];
  const race2 = federal ? officeData?.br : officeData?.uf?.[place.uf];
  const firstRow = useMemo(() => unpackMunicipalities(pack1.value, race1, null).get(ibge), [pack1.value, race1, ibge]);
  const copyRow = useMemo(() => (published ? unpackMunicipalities(pack2.value, race2, null).get(ibge) : null), [pack2.value, race2, ibge, published]);
  // Loading until the office, the 1º turno race and the municipal file have answered (and the live read, once published).
  const loading = officeData === undefined || (published ? !live.data && pack2.value === undefined : !first.data || pack1.value === undefined);
  const row = mineRow({ published, live: live.data, copyRow, firstRow, numbers: finalistNumbers(race1), loading });
  const label = OFFICES[office].label || OFFICES[office].name;
  return html`<div class=${'mine-row is-' + row.phase + (row.stale ? ' is-stale' : '')} data-office=${office}>
    <span class="mine-office">${label}</span>
    <span class="mine-apurado">${RIGHT[row.phase](row)}${row.stale ? html` <small class="mine-stale" title="TSE sem resposta: último boletim recebido">· desatualizado</small>` : ''}</span>
    ${row.candidates.length ? html`
      <ol class="mine-finalists">${row.candidates.map(c => html`<li key=${c.n}>
        <i class="swatch" style=${{ background: partyColor(c.party) }}></i><span>${titleCase(c.name)}</span><b>${pct(c.pct)}</b></li>`)}</ol>
      <${ShareBar} candidates=${row.candidates} max=${2}/>`
    : html`<p class="mine-note muted small">${row.phase === 'loading' ? 'Carregando o resultado do município…'
      : row.phase === 'error' ? 'Não foi possível ler este município no TSE agora; tentando de novo.' : 'O resultado aparece aqui sozinho quando o TSE publicar.'}</p>`}
  </div>`;
}

/**
 * "Meu município": the reader's city pinned at the top of the runoff page. One card, one compact row per
 * 2º turno race of the city: Presidente, plus Governador in the states where the TSE marked a governor runoff.
 */
export function MyMunicipality({ geo, onChoose }) {
  const [ibge, save] = useMyMunicipality();
  const place = ibge ? geo.byId.get(ibge) : null;
  // The saved city's name comes with its state's mesh, downloaded only now (not on the first visit).
  useEffect(() => { if (ibge && !place) loadState(ufOfIbge(ibge)).catch(() => {}); }, [ibge, !place]);
  const officeData = useOffice(2, 'presidente').data; // the 2º turno of president, shared with its page
  const governorFirst = useOffice(1, 'governador').data;
  const offices = mineOffices(place?.uf, governorFirst);
  // The governor 2º turno feed (and its TSE probe) only runs when the reader's city has that race.
  const governors = useFeed(offices.includes('governador') ? officeFeed(2, 'governador') : null).data;

  if (!place) {
    return html`<section class="card mine is-empty" aria-label="Meu município">
      <div class="mine-head"><span class="mine-title"><${Icon} name="star" size=${16}/> Meu município</span></div>
      <p class="muted small">Marque a sua cidade para ver o resultado dela aqui no topo do 2º turno, atualizado sozinho. Fica salvo só neste navegador.</p>
      <button class="button" onClick=${onChoose}>Escolher meu município</button>
    </section>`;
  }

  return html`<section class="card mine" aria-label=${`Meu município: ${place.name}`}>
    <div class="mine-head">
      <span class="mine-title"><${Icon} name="star" size=${16}/> Meu município</span>
      <a class="mine-name" href=${`#/2turno/presidente/${place.uf}/${ibge}`}>${place.name} <small>${stateName(place.uf)}</small></a>
      <span class="mine-actions">
        <button class="link-button" onClick=${onChoose}>Trocar</button>
        <button class="link-button" onClick=${() => save(null)}>Remover</button>
      </span>
    </div>
    <div class="mine-rows">${offices.map(office => html`<${MineRow} key=${office} office=${office} place=${place} ibge=${ibge}
      officeData=${office === 'presidente' ? officeData : governors}/>`)}</div>
  </section>`;
}

import { useMemo } from 'preact/hooks';
import { html } from '../lib/html.js';
import { int, pct, titleCase } from '../lib/format.js';
import { partyColor } from '../lib/color.js';
import { runoffCandidates, unpackMunicipalities } from '../data/analysis.js';
import { stateName } from '../data/states.js';
import { useLiveMunicipality, useMunicipalPack, useOffice } from '../hooks/useData.js';
import { useMyMunicipality } from '../hooks/useMyMunicipality.js';
import { Icon } from './Icon.js';
import { ShareBar } from './ui.js';

function Shares({ result, numbers }) {
  const list = numbers?.length ? result.candidates.filter(c => numbers.includes(c.n)) : result.candidates.filter(c => c.votes > 0).slice(0, 2);
  return html`<ol class="mine-shares">
    ${list.map(c => html`<li key=${c.n}>
      <i class="swatch" style=${{ background: partyColor(c.party) }}></i>
      <span>${titleCase(c.name)}</span><b>${pct(c.pct)}</b><small>${int(c.votes)} votos</small>
    </li>`)}
  </ol>`;
}

/**
 * "Meu município": the reader's city pinned at the top of the runoff page, with its live result
 * (polled from the TSE like the national numbers) or, before the runoff count, its 1st-round result.
 */
export function MyMunicipality({ geo, office, officeData, onChoose }) {
  const [ibge, save] = useMyMunicipality();
  const place = ibge ? geo.byId.get(ibge) : null;
  const published = !!officeData && !officeData.status;
  const live = useLiveMunicipality(2, office, place ? ibge : null, published);
  const first = useOffice(1, office);
  const pack1 = useMunicipalPack(1, place?.uf);
  const pack2 = useMunicipalPack(2, published ? place?.uf : null);
  const firstRow = useMemo(() => (ibge ? unpackMunicipalities(pack1.value, first.data?.br, geo).get(ibge) : null), [pack1.value, first.data, ibge, geo]);
  const copyRow = useMemo(() => (ibge ? unpackMunicipalities(pack2.value, officeData?.br, geo).get(ibge) : null), [pack2.value, officeData, ibge, geo]);

  if (!place) {
    return html`<section class="card mine is-empty" aria-label="Meu município">
      <div class="mine-head"><span class="mine-title"><${Icon} name="star" size=${16}/> Meu município</span></div>
      <p class="muted small">Marque a sua cidade para ver o resultado dela aqui no topo do 2º turno, atualizado sozinho. Fica salvo só neste navegador.</p>
      <button class="button" onClick=${onChoose}>Escolher meu município</button>
    </section>`;
  }

  const liveResult = live.data?.result;
  const result = liveResult || copyRow;
  const href = `#/2turno/${office}/${place.uf}/${ibge}`;
  return html`<section class="card mine" aria-label=${`Meu município: ${place.name}`}>
    <div class="mine-head">
      <span class="mine-title"><${Icon} name="star" size=${16}/> Meu município</span>
      <a class="mine-name" href=${href}>${place.name} <small>${stateName(place.uf)}</small></a>
      <span class="mine-actions">
        <button class="link-button" onClick=${onChoose}>Trocar</button>
        <button class="link-button" onClick=${() => save(null)}>Remover</button>
      </span>
    </div>
    ${published && result ? html`
        <${ShareBar} candidates=${result.candidates}/>
        <${Shares} result=${result}/>
        <p class="muted small">${pct(result.sections?.pct || 0)} das seções apuradas ·
          ${liveResult ? (live.data.liveError ? ' TSE sem resposta, mostrando o último boletim recebido' : ' ao vivo do TSE') : ' cópia dos arquivos oficiais do TSE'}
          ${result.updated ? ` · boletim de ${result.updated.slice(0, 5)} ${result.updated.slice(11, 16)}` : ''}</p>`
      : published ? html`<p class="muted small">${live.data?.status === 'error' ? 'Não foi possível ler este município no TSE agora; tentando de novo.' : 'O TSE ainda não publicou o resultado deste município.'}</p>`
      : html`
        <p class="muted small">O resultado do 2º turno aparece aqui sozinho quando o TSE publicar.</p>
        ${firstRow && html`<div class="mine-first"><span class="eyebrow">1º turno em ${place.name}</span><${Shares} result=${firstRow} numbers=${runoffCandidates(first.data?.br).map(c => c.n)}/></div>`}`}
  </section>`;
}

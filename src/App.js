import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from './lib/html.js';
import { ENABLED_OFFICES, OFFICES, ROUNDS, TSE_SITE } from './config.js';
import { runoffCandidates, shareText } from './data/analysis.js';
import { useMyMunicipality } from './hooks/useMyMunicipality.js';
import { useOffice } from './hooks/useData.js';
import { useHotkey } from './hooks/useHotkey.js';
import { useRoute } from './hooks/useRoute.js';
import { useTheme } from './hooks/useTheme.js';
import { OfficeTabs, StatusBar, TopBar } from './components/Header.js';
import { SearchDialog } from './components/SearchDialog.js';
import { Loading, Notice, Section } from './components/ui.js';
import { placeTitle } from './components/Place.js';
import { MajoritarianView } from './views/Majoritarian.js';
import { useGeography } from './map/useGeography.js';

function About() {
  return html`<${Section} title="Sobre os dados" className="prose">
    <p>Todos os números vêm dos arquivos públicos de resultados do Tribunal Superior Eleitoral, em
      <a href=${TSE_SITE} target="_blank" rel="noopener">resultados.tse.jus.br</a>, os mesmos usados pelo app Resultados do TSE.
      Nenhum resultado é estimado nem simulado. A única estimativa do site é a do quadro “Dá pra virar?” no 2º turno
      (votos que ainda faltam apurar), sempre marcada como estimativa; quem está eleito vem só da situação publicada pelo TSE.</p>
    <ul class="bullets">
      <li><b>1º turno (04/10/2026):</b> a totalização terminou, então o site usa uma cópia dos arquivos oficiais guardada junto com ele
        (mais rápido e não depende do TSE). Para ler direto do TSE, abra o site com <code>?fonte=tse</code> no endereço.</li>
      <li><b>2º turno (25/10/2026):</b> o site consulta o TSE ao vivo. Antes da apuração ele confere de tempos em tempos (a cada minuto no dia da eleição)
        e, assim que o primeiro boletim sair, mostra os votos e passa a se atualizar a cada 30 segundos. A tela só é redesenhada quando o TSE publica um boletim novo.</li>
      <li><b>Se o TSE ficar fora do ar:</b> o site mantém o último boletim recebido (ou a cópia guardada aqui, se for mais nova), avisa no topo de quando são os números e continua tentando a cada 30 segundos.</li>
      <li><b>Evolução da apuração</b> e <b>meu município</b> ficam guardados só neste navegador (localStorage); nada é enviado a nenhum servidor.</li>
      <li>Percentuais de candidatos são sobre os votos válidos. Comparecimento e abstenção são sobre o eleitorado apto.</li>
      <li>O horário “Atualizado pelo TSE” é o da última totalização informada pelo próprio TSE, em horário de Brasília.</li>
      <li>Fotos dos candidatos: servidor de resultados do TSE. Malha municipal: IBGE.</li>
    </ul>
  </${Section}>`;
}

function ComingSoon({ what }) {
  return html`<${Notice} title="Em breve">${what} chega na próxima etapa do site. Por enquanto, veja <a href="#/1turno/presidente">Presidente</a>.</${Notice}>`;
}

function useToast() {
  const [message, setMessage] = useState(null);
  useEffect(() => { if (!message) return; const t = setTimeout(() => setMessage(null), 2600); return () => clearTimeout(t); }, [message]);
  return [message, setMessage];
}

export function App() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useToast();
  const enabled = ENABLED_OFFICES.includes(route.office);
  const officeState = useOffice(route.round, enabled ? route.office : 'presidente');
  const needsMap = (route.page === 'resultados' && enabled) || !!searching;
  const { geo, error: geoError, retry: retryGeo } = useGeography(needsMap);
  const presidents = useOffice(1, 'presidente');

  const title = route.page === 'resultados'
    ? `${OFFICES[route.office].label} · ${placeTitle(route, geo)} · ${ROUNDS[route.round].label}`
    : route.page === 'sobre' ? 'Sobre os dados' : 'Comparar resultados';
  const scopeResult = useMemo(() => {
    const d = officeState.data;
    if (!d || d.status || route.ibge) return null;
    return route.uf === 'ZZ' ? d.zz : route.uf ? d.uf?.[route.uf] : d.br;
  }, [officeState.data, route.uf, route.ibge]);

  useEffect(() => {
    document.title = `${title} | Apuração 2026 — resultados do TSE`;
    const description = scopeResult ? shareText(scopeResult, title) : 'Resultados oficiais das eleições de 2026 com dados do TSE: votos, percentuais, mapa por estado e município, 1º e 2º turno.';
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    window.scrollTo?.({ top: 0 });
  }, [title]);

  useHotkey('/', event => { event.preventDefault(); setSearching(true); }, { enabled: !searching });

  const share = async () => {
    const text = scopeResult ? shareText(scopeResult, title) : title;
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); setToast('Link e resumo copiados'); }
    } catch (error) {
      if (error?.name !== 'AbortError') setToast('Não foi possível compartilhar. Copie o endereço da página.');
    }
  };

  const candidates = presidents.data?.br?.candidates || [];
  const finalists = runoffCandidates(presidents.data?.br).map(c => c.n);
  const pick = entry => {
    if (entry.type === 'candidate') {
      // Stay on the 2º turno when the candidate is in it; otherwise the 1º turno is where they ran.
      const round = route.round === 2 && finalists.includes(entry.n) ? 2 : 1;
      route.go({ page: 'resultados', round, office: 'presidente', uf: null, ibge: null, focus: entry.n });
    }
    else if (entry.type === 'state') route.go({ page: 'resultados', uf: entry.id, ibge: null, office: entry.id === 'ZZ' ? 'presidente' : route.office });
    else route.go({ page: 'resultados', uf: geo?.byId.get(entry.id)?.uf, ibge: entry.id });
  };
  const [, saveMyMunicipality] = useMyMunicipality();
  const pickMine = entry => { if (entry.type === 'municipality') { saveMyMunicipality(entry.id); setToast(`${entry.name} marcado como seu município`); } };

  useEffect(() => {
    if (!route.focus) return;
    const t = setTimeout(() => {
      const el = document.getElementById('cand-' + route.focus);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('is-focus');
      setTimeout(() => el?.classList.remove('is-focus'), 2500);
    }, 300);
    return () => clearTimeout(t);
  }, [route.focus, officeState.data]);

  return html`<div class="app">
    <a class="skip-link" href="#conteudo">Pular para os resultados</a>
    <${TopBar} route=${route} theme=${theme} onToggleTheme=${toggleTheme} onSearch=${() => setSearching(true)} onShare=${share}/>
    <${OfficeTabs} route=${route}/>
    ${route.page === 'resultados' && enabled && html`<${StatusBar} feed=${officeState.feed} round=${route.round}/>
`}
    <main id="conteudo" tabindex="-1">
      ${route.page === 'sobre' ? html`<${About}/>`
        : route.page === 'comparar' ? html`<${ComingSoon} what="A comparação entre 1º e 2º turno e com 2022"/>`
        : !enabled ? html`<${ComingSoon} what=${`A página de ${OFFICES[route.office].plural}`}/>`
        : geoError ? html`<${Notice} tone="error" title="O mapa não carregou">${geoError.message}${' '}<button class="button" onClick=${retryGeo}>Tentar de novo</button></${Notice}>`
        : !geo ? html`<${Loading} text="Carregando resultados e mapa…"/>`
        : html`<${MajoritarianView} route=${route} geo=${geo} theme=${theme} office=${officeState} onChooseMunicipality=${() => setSearching('municipio')}/>`}
    </main>
    <footer class="site-footer">
      <p>Fonte: <a href=${TSE_SITE} target="_blank" rel="noopener">Tribunal Superior Eleitoral (TSE)</a> · resultados oficiais; estimativas só onde estiver escrito “estimativa”.${' '}<a href="#/sobre">Sobre os dados</a></p>
      <p class="muted">Site independente, sem vínculo com o TSE. Em caso de divergência, vale o resultado publicado pelo TSE.</p>
    </footer>
    ${searching && geo && (searching === 'municipio'
      ? html`<${SearchDialog} geo=${geo} candidates=${[]} only="municipality" onPick=${pickMine} onClose=${() => setSearching(false)}/>`
      : html`<${SearchDialog} geo=${geo} candidates=${candidates} onPick=${pick} onClose=${() => setSearching(false)}/>`)}
    ${toast && html`<div class="toast" role="status">${toast}</div>`}
  </div>`;
}

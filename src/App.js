import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from './lib/html.js';
import { ENABLED_OFFICES, OFFICES, ROUNDS, TSE_SITE } from './config.js';
import { shareText } from './data/analysis.js';
import { useOffice } from './hooks/useData.js';
import { useHotkey } from './hooks/useHotkey.js';
import { useRoute } from './hooks/useRoute.js';
import { useTheme } from './hooks/useTheme.js';
import { OfficeTabs, StatusBar, TopBar } from './components/Header.js';
import { SearchDialog } from './components/SearchDialog.js';
import { Notice, Section } from './components/ui.js';
import { placeTitle } from './components/Place.js';
import { MajoritarianView } from './views/Majoritarian.js';

function About() {
  return html`<${Section} title="Sobre os dados" className="prose">
    <p>Todos os números vêm dos arquivos públicos de resultados do Tribunal Superior Eleitoral, em
      <a href=${TSE_SITE} target="_blank" rel="noopener">resultados.tse.jus.br</a>, os mesmos usados pelo app Resultados do TSE.
      Nada é estimado nem simulado.</p>
    <ul class="bullets">
      <li><b>1º turno (04/10/2026):</b> a totalização terminou, então o site usa uma cópia dos arquivos oficiais guardada junto com ele
        (mais rápido e não depende do TSE). Para ler direto do TSE, abra o site com <code>?fonte=tse</code> no endereço.</li>
      <li><b>2º turno (25/10/2026):</b> o site consulta o TSE ao vivo. Antes da apuração ele confere de tempos em tempos (a cada minuto no dia da eleição)
        e, assim que o primeiro boletim sair, mostra os votos e passa a se atualizar a cada 30 segundos.</li>
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

export function App({ geo }) {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useToast();
  const enabled = ENABLED_OFFICES.includes(route.office);
  const officeState = useOffice(route.round, enabled ? route.office : 'presidente');
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
  const pick = entry => {
    if (entry.type === 'candidate') route.go({ page: 'resultados', round: 1, office: 'presidente', uf: null, ibge: null, focus: entry.n });
    else if (entry.type === 'state') route.go({ page: 'resultados', uf: entry.id, ibge: null, office: entry.id === 'ZZ' ? 'presidente' : route.office });
    else route.go({ page: 'resultados', uf: geo.byId.get(entry.id).uf, ibge: entry.id });
  };

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
    ${route.page === 'resultados' && enabled && html`<${StatusBar} data=${officeState.data} loading=${officeState.loading}
      onRefresh=${officeState.refresh} round=${route.round}/>`}
    <main id="conteudo" tabindex="-1">
      ${route.page === 'sobre' ? html`<${About}/>`
        : route.page === 'comparar' ? html`<${ComingSoon} what="A comparação entre 1º e 2º turno e com 2022"/>`
        : !enabled ? html`<${ComingSoon} what=${`A página de ${OFFICES[route.office].plural}`}/>`
        : html`<${MajoritarianView} route=${route} geo=${geo} theme=${theme} office=${officeState}/>`}
    </main>
    <footer class="site-footer">
      <p>Fonte: <a href=${TSE_SITE} target="_blank" rel="noopener">Tribunal Superior Eleitoral (TSE)</a> · resultados oficiais, sem estimativas.
        <a href="#/sobre">Sobre os dados</a></p>
      <p class="muted">Site independente, sem vínculo com o TSE. Em caso de divergência, vale o resultado publicado pelo TSE.</p>
    </footer>
    ${searching && html`<${SearchDialog} geo=${geo} candidates=${candidates} onPick=${pick} onClose=${() => setSearching(false)}/>`}
    ${toast && html`<div class="toast" role="status">${toast}</div>`}
  </div>`;
}

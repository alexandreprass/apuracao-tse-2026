# Apuração 2026

Site estático (GitHub Pages) com os **resultados oficiais das eleições gerais de 2026**, lidos dos arquivos públicos do
Tribunal Superior Eleitoral em [resultados.tse.jus.br](https://resultados.tse.jus.br). Nada é estimado ou simulado:
quando o TSE ainda não publicou um resultado, o site diz isso e não mostra números.

Publicado em: https://alexandreprass.github.io/apuracao-tse-2026/

## O que tem (etapa 1 · Presidente)

- **1º turno (04/10/2026)** com os números oficiais finais: votos e percentual de cada um dos 12 candidatos, foto, número,
  partido, coligação, vice e situação (2º turno / não eleito).
- **Apuração e participação:** % de seções apuradas, eleitorado, comparecimento, abstenção, válidos, brancos e nulos.
- **Mapa interativo** do Brasil por estado e, dentro de cada estado, por município (5.570 municípios), colorido pelo partido
  de quem lidera e pela vantagem, ou pelo % apurado. Clique num estado ou município para abrir o resultado dele.
- **Tabelas** por estado (com o **exterior separado**) e por município, com busca, filtro por região ou partido e ordenação.
- **Votos por região**, estados vencidos por candidato.
- **2º turno (25/10/2026)** pronto: mostra os finalistas, contagem regressiva e confere o TSE sozinho (a cada 5 minutos até
  as urnas fecharem às 17h de Brasília, depois a cada 30 s); quando sai o primeiro boletim, os votos aparecem e passam a se atualizar a cada 30 s (com gráfico da evolução desde que a página foi aberta).
- **Busca** (tecla `/`) por candidato, número, estado, município ou “exterior”; **compartilhar** (link + resumo);
  **tema claro/escuro**; links diretos para qualquer recorte.
- Governadores, Senado, Deputados e Comparações aparecem como “em breve” (próximas etapas). Os arquivos oficiais desses
  cargos já são baixados pelo script de dados.

## Como os dados chegam

| Turno | Fonte primária | Reserva |
| --- | --- | --- |
| 1º turno (finalizado) | cópia dos arquivos oficiais em `public/data/tse/1/` | TSE ao vivo |
| 2º turno | TSE ao vivo (o servidor do TSE libera CORS para qualquer origem) | cópia em `public/data/tse/2/`, se existir |

- Para forçar a fonte, use `?fonte=tse` ou `?fonte=local` no fim do endereço (ex.: `#/1turno/presidente?fonte=tse`).
- Arquivos usados (padrão do TSE para 2026): `oficial/ele2026/<eleição>/dados/<uf>/<uf>-c<cargo>-e<eleição>-u.json`.
  Eleições: 6257 (presidente, 1º turno), 6258 (presidente, 2º turno), 6259/6260 (cargos estaduais). Cargos: 1 presidente,
  3 governador, 5 senador, 6 dep. federal, 7 dep. estadual, 8 dep. distrital. Fotos: `.../6257/fotos/br/<sqcand>.jpeg`.
- Antes de pedir os resultados de um turno, o site consulta `oficial/comum/config/ele-c.json` para saber se o TSE já
  configurou aquela eleição (evita dezenas de pedidos com erro 404).
- O horário exibido (“Atualizado pelo TSE em…”) é o da última totalização informada pelo TSE, em horário de Brasília.

### Atualizar a cópia local

```sh
npm run dados          # 1º turno: todos os cargos + presidente por município (~5.600 arquivos, ~2 min)
npm run dados:2turno   # 2º turno (presidente e governadores), quando o TSE publicar
npm run verificar      # compara a cópia com o TSE ao vivo (Brasil, exterior, 6 UFs, 4 capitais) e com as somas
```

O workflow `.github/workflows/pages.yml` também pode rodar o download antes de publicar: manualmente (campo
“atualizar_dados”) e automaticamente na noite do 2º turno, a cada 20 minutos (no máximo 3 publicações por hora). Os dados
vão só no artefato publicado; **nada é commitado no git**, para o histórico não crescer.

## Como rodar

Requisitos: Node.js 20.19+ e npm.

```sh
npm ci
npm run dev        # desenvolvimento: http://127.0.0.1:5173/apuracao-tse-2026/
npm test           # testes (Node, sem navegador)
npm run build      # gera o site em dist/
npm run preview    # serve dist/ em http://127.0.0.1:8080/apuracao-tse-2026/
```

O caminho base `/apuracao-tse-2026/` (de `vite.config.js`) é o mesmo do GitHub Pages.

## Endereços

```
#/1turno/presidente                 Brasil
#/1turno/presidente/SP              São Paulo e seus municípios
#/1turno/presidente/SP/3550308      município (código IBGE)
#/1turno/presidente/ZZ              exterior
#/2turno/presidente                 2º turno
#/sobre                             sobre os dados
```

## Organização do código

```
src/config.js            códigos das eleições, cargos, URLs do TSE, modo da fonte, intervalos de atualização
src/data/normalize.js    converte os JSON do TSE num formato enxuto (usado pelo site e pelo script)
src/data/source.js       carrega do TSE ou da cópia local, com reserva
src/data/analysis.js     contas derivadas (regiões, estados vencidos, mapa, finalistas)
src/hooks/useData.js     carregamento + atualização automática (30 s ao vivo e depois que as urnas fecham; 5 min antes)
src/views/Majoritarian.js página de presidente (e base para governador/senado)
src/components/          cabeçalho, barra de status, cartões, mapa, tabelas, busca, gráfico
src/map/                 mapa em Canvas 2D (geografia IBGE em TopoJSON)
scripts/fetch-tse.mjs    baixa os arquivos oficiais para public/data/tse
scripts/verify-tse.mjs   confere a cópia com o TSE
```

Preact + htm (sem etapa de compilação de templates), CSS puro e Canvas 2D, empacotados com Vite. ~31 kB de JS gzip.

## Créditos

- Resultados e fotos: [Tribunal Superior Eleitoral](https://resultados.tse.jus.br). Site independente, sem vínculo com o TSE;
  em caso de divergência, vale o resultado publicado pelo TSE.
- Malha municipal: [IBGE](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html), simplificada
  em TopoJSON (`public/data/brasil.topo.json`, herdado do projeto original, que a obteve de seuimposto.com).
- Base do mapa interativo: projeto [open-apuracao-brazil](https://github.com/bpinheiroms/open-apuracao-brazil) (MIT).
- Fonte: [Geist](https://vercel.com/font), SIL Open Font License.

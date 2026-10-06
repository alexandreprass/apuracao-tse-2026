#!/usr/bin/env bash
# Rebuilds geo/brasil.topo.json (split for the site by scripts/geo-split.mjs) from the IBGE municipal mesh (malha municipal 2025, 5.571 municípios,
# with Boa Esperança do Norte/MT). Needs ~600 MB of disk and mapshaper (npx mapshaper@0.6).
#   https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/Brasil/BR_Municipios_2025.zip
# The two "Área Operacional" lagoons of RS are dropped. Coordinates go to SIRGAS 2000 / Brazil Polyconic
# (EPSG:5880), the projection the map was drawn in, simplified to ~51 mil vértices and quantized at ~230 m.
# Population ("p", used only to order the search) comes from the previous file (IBGE Censo 2022); Boa
# Esperança do Norte has no census figure yet, so it gets its electorate (TSE, 2026).
set -euo pipefail
SHP=${1:-BR_Municipios_2025.shp}
npx -y mapshaper@0.6 "$SHP" -filter 'CD_MUN !== "4300001" && CD_MUN !== "4300002"' \
  -proj '+proj=poly +lat_0=0 +lon_0=-54 +x_0=5000000 +y_0=10000000 +ellps=GRS80 +units=m +no_defs' \
  -each 'id=CD_MUN, n=NM_MUN, uf=SIGLA_UF' -filter-fields id,n,uf \
  -join pop.csv keys=id,id field-types=id:str,p:number \
  -simplify 0.18% keep-shapes -rename-layers municipios \
  -o format=topojson quantization=20000 brasil.topo.json

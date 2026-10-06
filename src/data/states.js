export const STATES = {
  AC: ['Acre', 'Norte'], AL: ['Alagoas', 'Nordeste'], AM: ['Amazonas', 'Norte'], AP: ['Amapá', 'Norte'],
  BA: ['Bahia', 'Nordeste'], CE: ['Ceará', 'Nordeste'], DF: ['Distrito Federal', 'Centro-Oeste'],
  ES: ['Espírito Santo', 'Sudeste'], GO: ['Goiás', 'Centro-Oeste'], MA: ['Maranhão', 'Nordeste'],
  MG: ['Minas Gerais', 'Sudeste'], MS: ['Mato Grosso do Sul', 'Centro-Oeste'], MT: ['Mato Grosso', 'Centro-Oeste'],
  PA: ['Pará', 'Norte'], PB: ['Paraíba', 'Nordeste'], PE: ['Pernambuco', 'Nordeste'], PI: ['Piauí', 'Nordeste'],
  PR: ['Paraná', 'Sul'], RJ: ['Rio de Janeiro', 'Sudeste'], RN: ['Rio Grande do Norte', 'Nordeste'],
  RO: ['Rondônia', 'Norte'], RR: ['Roraima', 'Norte'], RS: ['Rio Grande do Sul', 'Sul'], SC: ['Santa Catarina', 'Sul'],
  SE: ['Sergipe', 'Nordeste'], SP: ['São Paulo', 'Sudeste'], TO: ['Tocantins', 'Norte'],
};
export const UFS = Object.keys(STATES);
export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
export const stateName = uf => STATES[uf]?.[0] ?? uf;
export const regionOf = uf => STATES[uf]?.[1];

/** First two digits of the IBGE municipality codes of each state. */
export const IBGE_PREFIX = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};
const UF_BY_PREFIX = Object.fromEntries(Object.entries(IBGE_PREFIX).map(([uf, p]) => [p, uf]));
/** State of a 7-digit IBGE municipality code, or null. */
export const ufOfIbge = ibge => UF_BY_PREFIX[String(ibge || '').slice(0, 2)] || null;

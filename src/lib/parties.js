// Paleta central de partidos e federações — Presidente, Governador, Senado e Deputados.
// GERADO por design-review/palette/emit.mjs (verificado por verify.mjs). Não editar à mão: mude a cor-base lá e gere de novo.
//
// Rampa de vantagem = mesmo método de src/lib/color.js: mix OKLab de MAP_BASE[tema] → cor-base com STRENGTH[tema],
// degraus definidos por MARGIN_STEPS. Os hexes já vêm prontos; um degrau só foi deslocado em L (OKLCH) quando a melhor
// tinta não chegava a 4,5:1 ou o degrau mais forte não chegava a 3:1 contra o fundo do mapa.
// ink[tema][i] = tinta de rótulo (#141821 ou #ffffff) de maior contraste sobre ramp[tema][i]; todas >= 4,5:1.

export const MAP_BASE = {"dark":"#1b1d22","light":"#e6e8ee"};
export const MAP_BG = {"dark":"#101216","light":"#f6f7f9"};
export const MARGIN_STEPS = [.05, .15, .3];
export const STRENGTH = {"dark":[0.45,0.64,0.82,1],"light":[0.55,0.7,0.85,1]};
export const INK = {"dark":"#141821","light":"#ffffff"};
/** Cores que nenhum partido pode usar: âmbar = aviso "TSE indisponível"/camada de apuração; cinza = "sem apuração". */
export const RESERVED = { amber: {"warn-line dark":"#b37903","warn-line light":"#b66d00","warn-ink dark":"#ffd077","warn-ink light":"#764100","apuração escuro":"#f0bd4f","apuração claro":"#7a4d00"}, gray: {"sem apuração escuro":"#272a30","sem apuração claro":"#d9dce3","outros":"#6b6f78"} };

export const PARTIES = {
  "PL": { acronym: "PL", number: 22, name: "Partido Liberal", base: '#2f55d4', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#7d9be4","#6285df","#476eda","#2f55d4"], dark: ["#24386d","#28428f","#2b4cb1","#2f55d4"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PT": { acronym: "PT", number: 13, name: "Partido dos Trabalhadores", base: '#dc2630', baseInk: '#ffffff', federation: 101,
    ramp: { light: ["#ea8b87","#e7706b","#e2514f","#dc2630"], dark: ["#6e2c2d","#932e2f","#b72c30","#dc2630"] },
    ink: { light: ["#141821","#141821","#141821","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "UNIÃO": { acronym: "UNIÃO", number: 44, name: "União Brasil", base: '#2d90ae', baseInk: '#141821', federation: 104,
    ramp: { light: ["#89b8cb","#6eaac1","#519db8","#2d90ae"], dark: ["#2a4d5d","#2d6478","#2e7992","#2d90ae"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "PSD": { acronym: "PSD", number: 55, name: "Partido Social Democrático", base: '#7d4486', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#ad8cb5","#9d74a5","#8d5c95","#7d4486"], dark: ["#452f4d","#583660","#6a3d73","#854b8e"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PP": { acronym: "PP", number: 11, name: "Progressistas", base: '#807cff', baseInk: '#141821', federation: 104,
    ramp: { light: ["#aaaffb","#9b9ffd","#8d8efe","#807cff"], dark: ["#45467d","#5859a8","#6c6ad3","#807cff"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "REPUBLICANOS": { acronym: "REPUBLICANOS", number: 10, name: "Republicanos", base: '#005356', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#719397","#517d81","#31686b","#005356"], dark: ["#1a3438","#163f42","#0f494c","#256a6d"] },
    ink: { light: ["#141821","#ffffff","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "MDB": { acronym: "MDB", number: 15, name: "Movimento Democrático Brasileiro", base: '#59b25f', baseInk: '#141821', federation: null,
    ramp: { light: ["#9ccba0","#87c38b","#71bb75","#48a14f"], dark: ["#385b3f","#43784a","#4e9555","#59b25f"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#141821","#141821"] } },
  "PODE": { acronym: "PODE", number: 20, name: "Podemos", base: '#008154', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#7daf97","#5ea080","#3d906a","#008154"], dark: ["#204838","#1e5b42","#166e4b","#008154"] },
    ink: { light: ["#141821","#141821","#141821","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PSB": { acronym: "PSB", number: 40, name: "Partido Socialista Brasileiro", base: '#ed5600', baseInk: '#141821', federation: null,
    ramp: { light: ["#f19e82","#f18863","#f07140","#ed5600"], dark: ["#743a28","#9c4525","#c44e1c","#ed5600"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "PSOL": { acronym: "PSOL", number: 50, name: "Partido Socialismo e Liberdade", base: '#888e00', baseInk: '#141821', federation: 102,
    ramp: { light: ["#b0b781","#a2a962","#959c3f","#888e00"], dark: ["#484d28","#5d6324","#72781c","#888e00"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "PSDB": { acronym: "PSDB", number: 45, name: "Partido da Social Democracia Brasileira", base: '#76b1f4', baseInk: '#141821', federation: 100,
    ramp: { light: ["#a9caf3","#99c2f3","#87baf4","#5892d3"], dark: ["#425b79","#5477a1","#6594ca","#76b1f4"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#141821","#141821"] } },
  "NOVO": { acronym: "NOVO", number: 30, name: "Partido Novo", base: '#ffa167', baseInk: '#141821', federation: null,
    ramp: { light: ["#f7c2a7","#fab892","#fdad7d","#d2783e"], dark: ["#795543","#a06a4c","#d1875b","#ffa167"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#141821","#141821"] } },
  "PDT": { acronym: "PDT", number: 12, name: "Partido Democrático Trabalhista", base: '#b90056', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#d77f97","#ce6181","#c43f6b","#b90056"], dark: ["#602439","#7e2143","#9b194c","#bd0c59"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PCDOB": { acronym: "PCDOB", number: 65, name: "Partido Comunista do Brasil", base: '#681718', baseInk: '#ffffff', federation: 101,
    ramp: { light: ["#a57472","#915653","#7d3835","#681718"], dark: ["#3e1f20","#4d1e1e","#5a1b1b","#9b4742"] },
    ink: { light: ["#141821","#ffffff","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PV": { acronym: "PV", number: 43, name: "Partido Verde", base: '#4e5d0e', baseInk: '#ffffff', federation: 101,
    ramp: { light: ["#8e9a76","#798658","#637137","#4e5d0e"], dark: ["#313922","#3a451e","#445119","#58671c"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "AVANTE": { acronym: "AVANTE", number: 70, name: "Avante", base: '#e04f9a', baseInk: '#141821', federation: null,
    ramp: { light: ["#e999bf","#e782b3","#e46aa6","#e04f9a"], dark: ["#6e3754","#94406c","#b94882","#e04f9a"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "PRD": { acronym: "PRD", number: 25, name: "Partido Renovação Democrática", base: '#365f9c', baseInk: '#ffffff', federation: 103,
    ramp: { light: ["#839cc2","#6987b6","#4f73a9","#365f9c"], dark: ["#283a56","#2d466d","#325384","#38619e"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "SOLIDARIEDADE": { acronym: "SOLIDARIEDADE", number: 77, name: "Solidariedade", base: '#ff6f61', baseInk: '#141821', federation: 103,
    ramp: { light: ["#faaaa1","#fd978c","#fe8477","#ef6053"], dark: ["#7a433f","#a6524b","#d26156","#ff6f61"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#141821","#141821"] } },
  "REDE": { acronym: "REDE", number: 18, name: "Rede Sustentabilidade", base: '#21a59a', baseInk: '#141821', federation: 102,
    ramp: { light: ["#8ac4bf","#6eb9b2","#4fafa6","#17a095"], dark: ["#295654","#2a706c","#2e8f86","#21a59a"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#141821","#141821"] } },
  "CIDADANIA": { acronym: "CIDADANIA", number: 23, name: "Cidadania", base: '#d94f8f', baseInk: '#141821', federation: 100,
    ramp: { light: ["#e598b9","#e281ab","#de699d","#d94f8f"], dark: ["#6c3650","#903f65","#b4477a","#d94f8f"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "MISSÃO": { acronym: "MISSÃO", number: 14, name: "Partido Missão", base: '#8a5cf6', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#b0a0f6","#a28bf7","#9674f7","#8657f1"], dark: ["#493b7a","#5e47a3","#7451cc","#8657f1"] },
    ink: { light: ["#141821","#141821","#141821","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "AGIR": { acronym: "AGIR", number: 36, name: "Agir", base: '#5f8f2f', baseInk: '#141821', federation: null,
    ramp: { light: ["#9ab789","#86aa6d","#739d50","#5f8f2f"], dark: ["#384d2e","#456330","#527931","#5f8f2f"] },
    ink: { light: ["#141821","#141821","#141821","#141821"], dark: ["#ffffff","#ffffff","#ffffff","#141821"] } },
  "MOBILIZA": { acronym: "MOBILIZA", number: 33, name: "Mobilização Nacional", base: '#5d7d8c', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#99acb7","#859ca9","#718c9a","#5b7b8a"], dark: ["#37464f","#445863","#506a77","#5b7b8a"] },
    ink: { light: ["#141821","#141821","#141821","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "DEMOCRATA": { acronym: "DEMOCRATA", number: 35, name: "Democrata (ex-PMB)", base: '#3b6ea5', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#87a4c7","#6e92bc","#5984b4","#3b6ea5"], dark: ["#2b4059","#314f72","#365e8b","#3b6ea5"] },
    ink: { light: ["#141821","#141821","#141821","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "DC": { acronym: "DC", number: 27, name: "Democracia Cristã", base: '#7c6f2c', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#aaa484","#9a9268","#8b814b","#7c6f2c"], dark: ["#44402b","#57502d","#695f2d","#7c6f2c"] },
    ink: { light: ["#141821","#141821","#141821","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PRTB": { acronym: "PRTB", number: 28, name: "Partido Renovador Trabalhista Brasileiro", base: '#4b6b2a', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#8ea281","#778f65","#617d48","#4b6b2a"], dark: ["#303f29","#394e2b","#425c2b","#4b6b2a"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PCB": { acronym: "PCB", number: 21, name: "Partido Comunista Brasileiro", base: '#7f1d1d', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#b37a77","#a35d58","#913f3b","#7f1d1d"], dark: ["#482222","#5b2221","#6d2120","#a4413c"] },
    ink: { light: ["#141821","#ffffff","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PCO": { acronym: "PCO", number: 29, name: "Partido da Causa Operária", base: '#991b1b', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#c37e78","#b35e57","#a8423c","#991b1b"], dark: ["#532423","#6b2422","#82211f","#b0342f"] },
    ink: { light: ["#141821","#ffffff","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "PSTU": { acronym: "PSTU", number: 16, name: "Partido Socialista dos Trabalhadores Unificado", base: '#b91c1c', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#d6847c","#ce675e","#c4473f","#b91c1c"], dark: ["#602725","#7e2824","#9b2422","#bc201f"] },
    ink: { light: ["#141821","#141821","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
  "UP": { acronym: "UP", number: 80, name: "Unidade Popular", base: '#8b1e3f', baseInk: '#ffffff', federation: null,
    ramp: { light: ["#ba7c89","#ac5f6f","#9c4157","#8b1e3f"], dark: ["#4d232f","#622335","#76223a","#a73a56"] },
    ink: { light: ["#141821","#ffffff","#ffffff","#ffffff"], dark: ["#ffffff","#ffffff","#ffffff","#ffffff"] } },
};
/** Número TSE (2 dígitos) → sigla. */
export const BY_NUMBER = {"10":"REPUBLICANOS","11":"PP","12":"PDT","13":"PT","14":"MISSÃO","15":"MDB","16":"PSTU","18":"REDE","20":"PODE","21":"PCB","22":"PL","23":"CIDADANIA","25":"PRD","27":"DC","28":"PRTB","29":"PCO","30":"NOVO","33":"MOBILIZA","35":"DEMOCRATA","36":"AGIR","40":"PSB","43":"PV","44":"UNIÃO","45":"PSDB","50":"PSOL","55":"PSD","65":"PCDOB","70":"AVANTE","77":"SOLIDARIEDADE","80":"UP"};
/** Grafias alternativas vistas no código/TSE → sigla canônica (os arquivos do TSE usam "PCDOB"; a lista de federações usa "PC do B"). */
export const ALIASES = {"UNIAO":"UNIÃO","PC do B":"PCDOB","PCdoB":"PCDOB","MISSAO":"MISSÃO"};
/** Federações 2026 (lista "federations" do TSE). Cor da federação = cor do partido-âncora (maior bancada eleita em 2026). */
export const FEDERATIONS = {"100":{"number":100,"acronym":"PSDB/CIDADANIA","name":"Federação PSDB Cidadania","parties":["PSDB","CIDADANIA"],"anchor":"PSDB","base":"#76b1f4"},"101":{"number":101,"acronym":"PT/PC do B/PV","name":"Federação Brasil da Esperança","parties":["PT","PCDOB","PV"],"anchor":"PT","base":"#dc2630"},"102":{"number":102,"acronym":"PSOL/REDE","name":"Federação PSOL REDE","parties":["PSOL","REDE"],"anchor":"PSOL","base":"#888e00"},"103":{"number":103,"acronym":"PRD/SOLIDARIEDADE","name":"Federação Renovação Solidária","parties":["PRD","SOLIDARIEDADE"],"anchor":"PRD","base":"#365f9c"},"104":{"number":104,"acronym":"UNIÃO/PP","name":"Federação União Progressista","parties":["UNIÃO","PP"],"anchor":"UNIÃO","base":"#2d90ae"}};
/** Fallback para partido fora da lista: FNV-1a(sigla em maiúsculas) % 8. */
export const FALLBACK = [{"base":"#575d2d","baseInk":"#ffffff","ramp":{"light":["#949981","#7f8565","#6b7149","#575d2d"],"dark":["#343929","#40452b","#4b512d","#5f6535"]},"ink":{"light":["#141821","#141821","#ffffff","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}},{"base":"#8d5954","baseInk":"#ffffff","ramp":{"light":["#b69796","#a98280","#996b68","#8d5954"],"dark":["#4c3738","#624342","#774e4b","#8d5954"]},"ink":{"light":["#141821","#141821","#ffffff","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}},{"base":"#794753","baseInk":"#ffffff","ramp":{"light":["#ab8c95","#9c7780","#8a5e68","#794753"],"dark":["#443037","#563841","#673f4a","#85525e"]},"ink":{"light":["#141821","#141821","#ffffff","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}},{"base":"#50537f","baseInk":"#ffffff","ramp":{"light":["#9093b0","#7b7ea1","#64688f","#50537f"],"dark":["#32344a","#3c3f5c","#46496d","#5a5d8a"]},"ink":{"light":["#141821","#141821","#ffffff","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}},{"base":"#43623c","baseInk":"#ffffff","ramp":{"light":["#899c88","#71886e","#5a7555","#43623c"],"dark":["#2d3b2f","#344833","#3c5538","#4a6943"]},"ink":{"light":["#141821","#141821","#ffffff","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}},{"base":"#aa7584","baseInk":"#141821","ramp":{"light":["#c6a8b2","#bd97a3","#b48693","#aa7584"],"dark":["#57434c","#73545e","#8e6471","#aa7584"]},"ink":{"light":["#141821","#141821","#141821","#141821"],"dark":["#ffffff","#ffffff","#ffffff","#141821"]}},{"base":"#32766e","baseInk":"#ffffff","ramp":{"light":["#85a8a5","#6a9792","#538a84","#32766e"],"dark":["#284342","#2c5451","#30655f","#32766e"]},"ink":{"light":["#141821","#141821","#141821","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}},{"base":"#285f78","baseInk":"#ffffff","ramp":{"light":["#7d9bac","#62869a","#467289","#285f78"],"dark":["#243947","#264657","#275267","#306780"]},"ink":{"light":["#141821","#141821","#ffffff","#ffffff"],"dark":["#ffffff","#ffffff","#ffffff","#ffffff"]}}];

const norm = x => String(x ?? '').trim().normalize('NFC');
export function partyKey(x) {
  const s = norm(x); if (PARTIES[s]) return s; if (ALIASES[s]) return ALIASES[s];
  const up = s.toUpperCase(); if (PARTIES[up]) return up;
  const n = s.match(/^\d{2}/); return n && BY_NUMBER[+n[0]] ? BY_NUMBER[+n[0]] : null; // aceita 22, "22", "2222" (nº de candidato)
}
export function fallbackIndex(x) { let h = 0x811c9dc5; for (const ch of norm(x).toUpperCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h % FALLBACK.length; }
/** Entrada da paleta (partido conhecido ou fallback determinístico). */
export const party = x => PARTIES[partyKey(x)] || FALLBACK[fallbackIndex(x)];
export const partyColor = x => party(x).base;
export const marginStep = margin => { const i = MARGIN_STEPS.findIndex(l => margin < l); return i < 0 ? 3 : i; };
/** Preenchimento + tinta para um partido, pela vantagem sobre o 2º colocado (fração dos válidos). */
export function partyFill(x, margin, theme = 'dark') { const p = party(x), i = marginStep(margin); return { fill: p.ramp[theme][i], ink: p.ink[theme][i] }; }
export const partyRamp = (x, theme = 'dark') => party(x).ramp[theme];
export function federationOf(x) { const k = partyKey(x); return Object.values(FEDERATIONS).find(f => f.parties.includes(k)) || null; }
/** Visões por federação (cadeiras de deputado): usa a cor do âncora; partido sem federação usa a própria. */
export const federationColor = x => { const f = federationOf(x); return f ? PARTIES[f.anchor].base : partyColor(x); };

// Compatibilidade com src/lib/color.js: marginColor(cor, margem, tema) continua recebendo um hex.
const BY_BASE = Object.fromEntries([...Object.values(PARTIES), ...FALLBACK].map(p => [p.base, p]));
export function marginColor(color, margin, theme = 'dark') {
  const p = BY_BASE[String(color).toLowerCase()]; if (p) return p.ramp[theme][marginStep(margin)];
  throw new Error('marginColor: cor fora da paleta central (use partyColor/partyFill): ' + color);
}
export const marginRamp = (color, theme) => { const p = BY_BASE[String(color).toLowerCase()]; if (!p) throw new Error('cor fora da paleta: ' + color); return p.ramp[theme]; };

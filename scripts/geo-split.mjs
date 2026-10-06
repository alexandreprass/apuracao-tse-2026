#!/usr/bin/env node
// Splits the municipal mesh (geo/brasil.topo.json) for lazy loading:
//   public/data/geo/estados.json      states only (boundary arcs, ~6x lighter): the first visit draws Brazil from it
//   public/data/geo/mun/<UF>.json     the municipalities of one state, downloaded only when the state is opened
//   public/data/geo/municipios.json   names and states of the 5.571 municipalities (search, "Meu município"), on demand
// Same quantized coordinates and transform as the source, so every file lines up exactly. Run by `npm run build`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'geo');
const NORONHA = '2605459'; // drawn, but kept out of the camera boxes (as in createGeography)

export async function splitMesh(topology) {
  const { scale, translate } = topology.transform;
  const geoms = topology.objects.municipios.geometries;
  const rings = g => (g.type === 'Polygon' ? [g.arcs] : g.arcs);
  // Absolute (quantized) points of each arc, and who uses it.
  const abs = topology.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => [x += dx, y += dy]); });
  const owners = topology.arcs.map(() => new Set());
  geoms.forEach((g, i) => { for (const poly of rings(g)) for (const ring of poly) for (const a of ring) owners[a < 0 ? ~a : a].add(i); });
  const ufOf = i => geoms[i].properties.uf;

  // Projected point, as the client computes it (before its origin shift).
  const P = ([x, y]) => [(x * scale[0] + translate[0]) / 1000, -(y * scale[1] + translate[1]) / 1000];
  // Centres and boxes with the client's own math (area-weighted mean of municipality centroids), so labels stay put.
  const states = {};
  geoms.forEach(g => {
    const p = g.properties, st = states[p.uf] ||= { uf: p.uf, box: [Infinity, Infinity, -Infinity, -Infinity], cx: 0, cy: 0, area: 0, rings: [] };
    let area = 0, center = [0, 0], biggest = 0;
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of rings(g)) poly.forEach((ring, r) => {
      const pts = [];
      for (const a of ring) { const seg = a < 0 ? [...abs[~a]].reverse() : abs[a]; pts.push(...seg.slice(pts.length ? 1 : 0).map(P)); }
      for (const q of pts) { bounds[0] = Math.min(bounds[0], q[0]); bounds[1] = Math.min(bounds[1], q[1]); bounds[2] = Math.max(bounds[2], q[0]); bounds[3] = Math.max(bounds[3], q[1]); }
      if (r === 0) {
        let t = 0, cx = 0, cy = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; t += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f; }
        const a = Math.abs(t / 2); area += a;
        if (a > biggest) { biggest = a; center = t ? [cx / (3 * t), cy / (3 * t)] : pts[0]; }
      }
    });
    st.cx += center[0] * area; st.cy += center[1] * area; st.area += area;
    if (p.id !== NORONHA) { st.box[0] = Math.min(st.box[0], bounds[0]); st.box[1] = Math.min(st.box[1], bounds[1]); st.box[2] = Math.max(st.box[2], bounds[2]); st.box[3] = Math.max(st.box[3], bounds[3]); }
  });

  // State outlines: the directed boundary arcs of each state's municipalities, chained into closed rings.
  const boundary = a => { const o = [...owners[a]]; return o.length < 2 || ufOf(o[0]) !== ufOf(o[1]); };
  const usedArcs = new Map(); // old arc id -> new id (states file)
  const keep = old => { if (!usedArcs.has(old)) usedArcs.set(old, usedArcs.size); return usedArcs.get(old); };
  const byUf = {};
  geoms.forEach(g => { for (const poly of rings(g)) for (const ring of poly) for (const a of ring) if (boundary(a < 0 ? ~a : a)) (byUf[g.properties.uf] ||= []).push(a); });
  const key = p => p.join(',');
  for (const [uf, directed] of Object.entries(byUf)) {
    const start = new Map();
    for (const a of directed) { const pts = a < 0 ? [...abs[~a]].reverse() : abs[a]; start.set(key(pts[0]), [...(start.get(key(pts[0])) || []), a]); }
    const left = new Set(directed);
    while (left.size) {
      const first = left.values().next().value, ring = [];
      let a = first;
      do {
        left.delete(a); ring.push(a);
        const pts = a < 0 ? [...abs[~a]].reverse() : abs[a];
        const next = (start.get(key(pts[pts.length - 1])) || []).find(b => left.has(b) || b === first);
        if (next === undefined || next === first) break;
        a = next;
      } while (true);
      states[uf].rings.push(ring.map(x => (x < 0 ? ~keep(~x) : keep(x))));
    }
  }
  const pick = ids => ids.map(old => topology.arcs[old]);
  const statesFile = {
    type: 'StateMesh', transform: topology.transform,
    arcs: pick([...usedArcs.keys()]),
    states: Object.values(states).sort((a, b) => a.uf.localeCompare(b.uf)).map(s => ({
      uf: s.uf, rings: s.rings, box: s.box.map(v => +v.toFixed(3)), center: [+(s.cx / s.area).toFixed(3), +(s.cy / s.area).toFixed(3)], area: +s.area.toFixed(3),
    })),
  };
  // One file per state: its municipalities, with only the arcs they use.
  const perUf = {};
  for (const uf of Object.keys(states)) {
    const map = new Map(), ids = old => { if (!map.has(old)) map.set(old, map.size); return map.get(old); };
    const list = geoms.filter(g => g.properties.uf === uf).map(g => ({
      type: g.type, properties: g.properties,
      arcs: g.type === 'Polygon' ? g.arcs.map(r => r.map(a => (a < 0 ? ~ids(~a) : ids(a)))) : g.arcs.map(poly => poly.map(r => r.map(a => (a < 0 ? ~ids(~a) : ids(a))))),
    }));
    perUf[uf] = { type: 'Topology', transform: topology.transform, arcs: pick([...map.keys()]), objects: { municipios: { type: 'GeometryCollection', geometries: list } } };
  }
  const names = geoms.map(g => [String(g.properties.id), g.properties.n, g.properties.uf, g.properties.p || 0]);
  return { statesFile, perUf, names };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const topology = JSON.parse(await readFile(join(ROOT, 'geo', 'brasil.topo.json'), 'utf8'));
  const { statesFile, perUf, names } = await splitMesh(topology);
  await mkdir(join(OUT, 'mun'), { recursive: true });
  await writeFile(join(OUT, 'estados.json'), JSON.stringify(statesFile));
  for (const [uf, file] of Object.entries(perUf)) await writeFile(join(OUT, 'mun', `${uf}.json`), JSON.stringify(file));
  await writeFile(join(OUT, 'municipios.json'), JSON.stringify(names));
  console.log(`geo: estados.json (${statesFile.arcs.length} arcos), ${Object.keys(perUf).length} arquivos de municípios, ${names.length} nomes`);
}

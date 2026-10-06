const emptyBox = () => [Infinity, Infinity, -Infinity, -Infinity];
export const extend = (box, x, y) => {
  box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
  box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
};
export function createGeography(topology, zoneData) {
  const { scale, translate } = topology.transform;
  const box = emptyBox();
  const arcs = topology.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      const p = [(x*scale[0]+translate[0])/1000, -(y*scale[1]+translate[1])/1000];
      extend(box, ...p); return p;
    });
  });
  const origin = [box[0], box[1]];
  for (const arc of arcs) for (const p of arc) { p[0] -= origin[0]; p[1] -= origin[1]; }
  const arcOwners = arcs.map(() => []);
  const allBox = emptyBox();
  const municipalities = topology.objects.municipios.geometries.map((geometry, index) => {
    const path = new Path2D(), bounds = emptyBox();
    const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
    let area = 0, center = [0,0], biggestArea = 0;
    for (const polygon of polygons) for (const [ringIndex, ring] of polygon.entries()) {
      const points = [];
      for (const arcId of ring) {
        const id = arcId < 0 ? ~arcId : arcId;
        arcOwners[id].push(index);
        const p = arcId < 0 ? [...arcs[id]].reverse() : arcs[id];
        points.push(...p.slice(points.length ? 1 : 0));
      }
      path.moveTo(...points[0]);
      for (const point of points.slice(1)) path.lineTo(...point);
      path.closePath();
      for (const p of points) extend(bounds, ...p);
      if (ringIndex === 0) {
        let twiceArea = 0, cx = 0, cy = 0;
        for (let i=0,j=points.length-1;i<points.length;j=i++) {
          const f=points[j][0]*points[i][1]-points[i][0]*points[j][1];
          twiceArea += f; cx += (points[j][0]+points[i][0])*f; cy += (points[j][1]+points[i][1])*f;
        }
        const a = Math.abs(twiceArea/2); area += a;
        if (a > biggestArea) { biggestArea=a; center=twiceArea?[cx/(3*twiceArea),cy/(3*twiceArea)]:points[0]; }
      }
    }
    const p = geometry.properties;
    // Fernando de Noronha is drawn, but should not expand the mainland camera.
    if (p.id !== '2605459') { extend(allBox,bounds[0],bounds[1]);extend(allBox,bounds[2],bounds[3]); }
    return { index, id: String(p.id), name: p.n, uf: p.uf, population:p.p, path, box:bounds, center, area };
  });
  const states = {};
  for (const muni of municipalities) {
    const state=states[muni.uf] ||= { uf:muni.uf, municipalities:[], box:emptyBox(), center:[0,0], area:0, outline:new Path2D(), fill:new Path2D() };
    state.municipalities.push(muni);state.area+=muni.area;
    state.fill.addPath(muni.path);
    state.center[0]+=muni.center[0]*muni.area;state.center[1]+=muni.center[1]*muni.area;
    if (muni.id !== '2605459') { extend(state.box,muni.box[0],muni.box[1]);extend(state.box,muni.box[2],muni.box[3]); }
  }
  for (const state of Object.values(states)) state.center=state.center.map(n=>n/state.area);
  const borders={ state:new Path2D(), municipality:new Path2D(), coast:new Path2D() };
  for (let i=0;i<arcs.length;i++) {
    const owners=[...new Set(arcOwners[i])];
    const kind=owners.length<2?'coast':municipalities[owners[0]].uf!==municipalities[owners[1]].uf?'state':'municipality';
    const draw=path=>{path.moveTo(...arcs[i][0]);for(const p of arcs[i].slice(1))path.lineTo(...p);};
    draw(borders[kind]);
    if(kind!=='municipality') for(const owner of owners)draw(states[municipalities[owner].uf].outline);
  }
  const zoneCache=new Map();
  const zonesFor=id=>{
    if(zoneCache.has(id))return zoneCache.get(id);
    const source=zoneData.m[id];if(!source)return null;
    const bounds=emptyBox();
    const paths=source.a.map(rings=>{
      const path=new Path2D();
      for(const ring of rings) {
        let x=0,y=0;
        for(let i=0;i<ring.length;i+=2) {
          x+=ring[i];y+=ring[i+1];
          const p=[x/1000-origin[0],-y/1000-origin[1]];
          i===0?path.moveTo(...p):path.lineTo(...p);extend(bounds,...p);
        }
        path.closePath();
      }
      return path;
    });
    const points=(source.p||source.c).map(([x,y])=>[x/1000-origin[0],-y/1000-origin[1]]);
    const active=source.a.map((rings,i)=>rings.length?i:null).filter(i=>i!=null);
    const total=active.reduce((sum,i)=>sum+source.el[i],0)||1;
    const weightedCenter=active.reduce((center,i)=>[center[0]+points[i][0]*source.el[i]/total,center[1]+points[i][1]*source.el[i]/total],[0,0]);
    const central=[];let electorate=0;
    for(const i of [...active].sort((a,b)=>Math.hypot(points[a][0]-weightedCenter[0],points[a][1]-weightedCenter[1])-Math.hypot(points[b][0]-weightedCenter[0],points[b][1]-weightedCenter[1]))) {
      central.push(i);electorate+=source.el[i];if(electorate>=total*.7)break;
    }
    const pointBounds=indices=>{const b=emptyBox();for(const i of indices)extend(b,...points[i]);return b;};
    const extent=b=>Math.max(b[2]-b[0],b[3]-b[1]);
    const whole=pointBounds(active),core=pointBounds(central);
    const focusBox=active.length?(extent(whole)>2.2*Math.max(extent(core),4)?core:whole):bounds;
    const value={paths,box:bounds,focusBox,points,numbers:source.z,names:source.nome,electorate:source.el,sections:source.sec,
      centers:source.c.map(([x,y])=>[x/1000-origin[0],-y/1000-origin[1]])};
    zoneCache.set(id,value);return value;
  };
  return { municipalities, states, borders, box:allBox, zonesFor, zoneMeta:zoneData.m, byId:new Map(municipalities.map(m=>[m.id,m])) };
}
export function cameraFor(geo, uf, municipality, width, height) {
  let box=municipality?.box || (uf ? geo.states[uf].box : geo.box);
  const zones=municipality && geo.zonesFor(municipality.id);
  if(zones) {
    const focus=zones.focusBox;
    const radius=Math.min(Math.max(zones.box[2]-zones.box[0],zones.box[3]-zones.box[1])*.6,
      Math.max(focus[2]-focus[0],focus[3]-focus[1])*.8+6);
    const x=(focus[0]+focus[2])/2,y=(focus[1]+focus[3])/2;
    box=[x-radius,y-radius,x+radius,y+radius];
  } else if(uf&&!municipality) {
    // An open state fills its area, with ~8px of margin on the tightest side.
    const bx=box[2]-box[0],by=box[3]-box[1],k=Math.min((width-16)/bx,(height-16)/by);
    return { k, x:width/2-(box[0]+box[2])/2*k, y:height/2-(box[1]+box[3])/2*k };
  }
  const padding=zones?0:municipality?.12:uf?0:.025;
  const bx=box[2]-box[0],by=box[3]-box[1],cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2;
  const usableWidth=width*(uf ? 1 : .89),usableHeight=height*(uf ? 1 : .94);
  const k=Math.min(usableWidth/(bx*(1+padding*2)),usableHeight/(by*(1+padding*2)));
  const screenX=uf?width*.5:width*.44,screenY=height*.5;
  return { k, x:screenX-cx*k, y:screenY-cy*k };
}

// ---- Lazy mesh (public/data/geo, from scripts/geo-split.mjs): states first, municipalities per state on demand ----

const decode = (topology, origin) => {
  const { scale, translate } = topology.transform;
  return topology.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [(x * scale[0] + translate[0]) / 1000 - origin[0], -(y * scale[1] + translate[1]) / 1000 - origin[1]]; });
  });
};
const ringPoints = (arcs, ring) => {
  const points = [];
  for (const arcId of ring) {
    const p = arcId < 0 ? [...arcs[~arcId]].reverse() : arcs[arcId];
    points.push(...p.slice(points.length ? 1 : 0));
  }
  return points;
};
const trace = (path, points) => { path.moveTo(...points[0]); for (const p of points.slice(1)) path.lineTo(...p); path.closePath(); };

/** The states-only mesh: Brazil drawn by state, with no municipality until a state's file is added. */
export function createStateGeography(mesh) {
  const { scale, translate } = mesh.transform;
  const box = emptyBox();
  for (const arc of mesh.arcs) { let x = 0, y = 0; for (const [dx, dy] of arc) { x += dx; y += dy; extend(box, (x * scale[0] + translate[0]) / 1000, -(y * scale[1] + translate[1]) / 1000); } }
  const origin = [box[0], box[1]];
  const arcs = decode(mesh, origin);
  const owners = arcs.map(() => []);
  const states = {}, allBox = emptyBox();
  for (const s of mesh.states) {
    const state = states[s.uf] = { uf: s.uf, municipalities: [], loaded: false, box: [s.box[0] - origin[0], s.box[1] - origin[1], s.box[2] - origin[0], s.box[3] - origin[1]],
      center: [s.center[0] - origin[0], s.center[1] - origin[1]], area: s.area, outline: new Path2D(), fill: new Path2D(), municipalBorders: null };
    for (const ring of s.rings) {
      trace(state.fill, ringPoints(arcs, ring));
      for (const a of ring) owners[a < 0 ? ~a : a].push(s.uf);
    }
    extend(allBox, state.box[0], state.box[1]); extend(allBox, state.box[2], state.box[3]);
  }
  const borders = { state: new Path2D(), municipality: new Path2D(), coast: new Path2D() };
  arcs.forEach((arc, i) => {
    const draw = path => { path.moveTo(...arc[0]); for (const p of arc.slice(1)) path.lineTo(...p); };
    draw(owners[i].length < 2 ? borders.coast : borders.state);
    for (const uf of new Set(owners[i])) draw(states[uf].outline);
  });
  return snapshot({ origin, states, borders, box: allBox, places: null });
}

/** A new geography object with one more state's municipalities (paths, names, inner borders). */
export function addMunicipalities(geo, uf, topology) {
  const arcs = decode(topology, geo.origin);
  const owners = arcs.map(() => 0);
  const municipalities = topology.objects.municipios.geometries.map((geometry, index) => {
    const path = new Path2D(), bounds = emptyBox();
    const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
    let area = 0, center = [0, 0], biggest = 0;
    for (const polygon of polygons) for (const [r, ring] of polygon.entries()) {
      for (const a of ring) owners[a < 0 ? ~a : a]++;
      const points = ringPoints(arcs, ring);
      trace(path, points);
      for (const p of points) extend(bounds, ...p);
      if (r === 0) {
        let t = 0, cx = 0, cy = 0;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const f = points[j][0] * points[i][1] - points[i][0] * points[j][1]; t += f; cx += (points[j][0] + points[i][0]) * f; cy += (points[j][1] + points[i][1]) * f; }
        const a = Math.abs(t / 2); area += a;
        if (a > biggest) { biggest = a; center = t ? [cx / (3 * t), cy / (3 * t)] : points[0]; }
      }
    }
    const p = geometry.properties;
    return { index, id: String(p.id), name: p.n, uf: p.uf, population: p.p, path, box: bounds, center, area };
  });
  const inner = new Path2D();
  arcs.forEach((arc, i) => { if (owners[i] > 1) { inner.moveTo(...arc[0]); for (const q of arc.slice(1)) inner.lineTo(...q); } });
  const states = { ...geo.states, [uf]: { ...geo.states[uf], municipalities, loaded: true, municipalBorders: inner } };
  return snapshot({ ...geo, states });
}

/** Adds the light list of every municipality (id, name, state, population) for search and "Meu município". */
export function addPlaces(geo, rows) {
  return snapshot({ ...geo, places: rows.map(([id, name, uf, population]) => ({ id, name, uf, population })) });
}

function snapshot({ origin, states, borders, box, places }) {
  const municipalities = Object.values(states).flatMap(s => s.municipalities);
  const byId = new Map((places || []).map(m => [m.id, m]));
  for (const m of municipalities) byId.set(m.id, m);
  return { origin, states, borders, box, places, municipalities, byId, zonesFor: () => null, zoneMeta: {} };
}

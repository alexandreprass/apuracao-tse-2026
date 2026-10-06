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
    const margin=Math.max(box[2]-box[0],box[3]-box[1])*.08;
    box=[box[0]-margin,box[1]-margin,box[2]+margin,box[3]+margin];
  }
  const padding=zones?0:municipality?.12:uf?0:.025;
  const bx=box[2]-box[0],by=box[3]-box[1],cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2;
  const usableWidth=width*(uf ? 1 : .89),usableHeight=height*(uf ? 1 : .94);
  const k=Math.min(usableWidth/(bx*(1+padding*2)),usableHeight/(by*(1+padding*2)));
  const screenX=uf?width*.5:width*.44,screenY=height*.5;
  return { k, x:screenX-cx*k, y:screenY-cy*k };
}

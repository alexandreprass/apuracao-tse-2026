import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSnapshot, aggregate, zoneResults, progressAt, stateTarget, resultColor } from '../src/data/mocks.js';
import { createGeography, cameraFor } from '../src/map/geography.js';
import { outlook } from '../src/data/outlook.js';
import { stateFlips, tally } from '../src/data/history.js';

// Node has no Canvas. Geometry tests only need to collect bounds and membership;
// actual Path2D rendering and pointer selection are verified in the browser.
globalThis.Path2D=class { moveTo(){} lineTo(){} closePath(){} addPath(){} };
const atlas=JSON.parse(readFileSync(new URL('../public/data/brasil.topo.json',import.meta.url),'utf8'));
const zones=JSON.parse(readFileSync(new URL('../public/data/zonas.json',import.meta.url),'utf8'));
const geo=createGeography(atlas,zones);

test('the complete atlas has 5,570 municipalities, 27 states and 57 zones in São Paulo',()=>{
  assert.equal(geo.municipalities.length,5570);
  assert.equal(Object.keys(geo.states).length,27);
  assert.equal(geo.states.SP.municipalities.length,645);
  assert.equal(geo.zonesFor('3550308').numbers.length,57);
  for(const m of geo.municipalities){assert.ok(m.box.every(Number.isFinite));assert.ok(m.box[2]>m.box[0]);assert.ok(m.box[3]>m.box[1]);assert.ok(geo.states[m.uf]);}
});

test('mock votes conserve totals across zones, municipalities, states and Brazil',()=>{
  for(const minute of [1020,1140,1269,1380]){
    const snap=buildSnapshot(geo,minute,'Presidente');
    for(const r of snap.results.values()){
      assert.equal(r.votes.reduce((a,b)=>a+b,0),r.valid);
      assert.equal(r.valid+r.blank+r.nulls,r.cast);
      assert.ok(r.votes.every(v=>Number.isInteger(v)&&v>=0));
      assert.ok(r.completion>=0&&r.completion<=1);
      assert.match(resultColor(r),/^#[0-9a-f]{6}$/);
    }
    const stateTotals=aggregate(Object.values(snap.states));
    assert.deepEqual(stateTotals.votes,snap.national.votes);
    assert.equal(stateTotals.valid,snap.national.valid);
    const capital=geo.byId.get('3550308');
    const zoneTotals=aggregate(zoneResults(capital,geo.zonesFor(capital.id),minute,'Presidente'));
    assert.deepEqual(zoneTotals.votes,snap.results.get(capital.id).votes);
    for(const [uf,r] of Object.entries(snap.states)){
      const target=stateTarget(uf,'Presidente',minute);
      assert.ok(Math.abs(r.votes[0]/r.valid-target)<.002,uf+' share follows the mock scenario');
    }
  }
});

test('timeline changes results deterministically and progresses forward',()=>{
  const early=buildSnapshot(geo,1050,'Presidente');
  const late=buildSnapshot(geo,1269,'Presidente');
  assert.ok(late.national.valid>early.national.valid);
  assert.deepEqual(late.national,buildSnapshot(geo,1269,'Presidente').national);
  assert.ok(progressAt(1269)>progressAt(1050));
  assert.notDeepEqual(late.national.votes,buildSnapshot(geo,1269,'Governadores').national.votes);
});

test('cameras fit states and centre city views on populated zones',()=>{
  for(const [width,height] of [[358,358],[650,650]]){
    for(const uf of Object.keys(geo.states)){
      const camera=cameraFor(geo,uf,null,width,height),box=geo.states[uf].box;
      assert.ok(camera.k>0&&Number.isFinite(camera.k));
      assert.ok(box[0]*camera.k+camera.x>=0);
      assert.ok(box[2]*camera.k+camera.x<=width);
      assert.ok(box[1]*camera.k+camera.y>=0);
      assert.ok(box[3]*camera.k+camera.y<=height);
    }
    const capital=geo.byId.get('3550308'),camera=cameraFor(geo,'SP',capital,width,height),focus=geo.zonesFor(capital.id).focusBox;
    assert.ok(focus[0]*camera.k+camera.x>=0&&focus[2]*camera.k+camera.x<=width);
    assert.ok(camera.k>cameraFor(geo,'SP',null,width,height).k*5);
  }
});

test('every municipality, including smaller cities and available zone cuts, has a finite camera',()=>{
  for(const municipality of geo.municipalities){
    const camera=cameraFor(geo,municipality.uf,municipality,358,358);
    assert.ok(Object.values(camera).every(Number.isFinite),municipality.name);
    assert.ok(camera.k>0,municipality.name);
  }
});

test('the outlook compares what is left to count with the current gap',()=>{
  const base={electorate:1000,turnout:.8,cast:400,valid:380,blank:8,nulls:12,completion:.5,winner:0};
  const open=outlook({...base,votes:[180,170,30]},{majorityRule:true});
  assert.equal(open.remaining,380);
  assert.equal(open.status,'open');
  assert.equal(open.runoff,null);
  assert.equal(outlook({...base,completion:.99,cast:792,valid:752,votes:[400,330,22]}).status,'decided');
  assert.equal(outlook({...base,completion:1,votes:[180,170,30]}).status,'closed');
  // 20 votes left of 780: the leader's 300 cannot reach half of 780, a runoff is certain.
  assert.equal(outlook({...base,completion:.975,cast:780,valid:760,votes:[300,290,170]},{majorityRule:true}).runoff,'certain');
  assert.equal(outlook({...base,completion:.975,cast:780,valid:760,votes:[420,290,50]},{majorityRule:true}).runoff,'outright');
});

test('tallies and flips summarise who leads where',()=>{
  const snap=buildSnapshot(geo,1269,'Presidente');
  const sides=tally(Object.values(snap.states));
  assert.equal(sides[0].places+sides[1].places,27);
  assert.ok(Math.abs(sides[0].electorateShare+sides[1].electorateShare-1)<1e-9);
  const early=buildSnapshot(geo,1030,'Presidente');
  const flips=stateFlips([{minute:1030,states:early.states}],1269,snap.states);
  for(const flip of flips){
    assert.notEqual(early.states[flip.uf].winner,snap.states[flip.uf].winner);
    assert.equal(flip.winner,snap.states[flip.uf].winner);
  }
});

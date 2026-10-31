import test from 'node:test';
import assert from 'node:assert/strict';
import {toGeo} from '../dist/parcel.js';
import {footprintDistance,modelSiteFootprint,analyzeSiteContext,compactSiteContext} from '../dist/site-analysis.js';

const site={lat:1.2996,lng:103.7875};
const tower={width:32,depth:22,offset:{x:8,z:-16.5},basis:'native-tower-footprint'};
const at=(x,z)=>{const p=toGeo({x,z},site);return[p.lng,p.lat];};
const close=points=>[...points,points[0]];
const road=(id,points,tags={})=>({id,kind:'road',name:id,geometry:{type:'LineString',coordinates:points.map(([x,z])=>at(x,z))},tags:{highway:'residential',...tags}});
const polygon=(id,kind,points,tags={})=>({id,kind,name:id,geometry:{type:'Polygon',coordinates:close(points.map(([x,z])=>at(x,z)))},tags});
const data=features=>({source:'OpenStreetMap',status:'live',center:site,radius:500,fetchedAt:'2026-10-31T07:00:00Z',dataTimestamp:'2026-10-31T06:59:00Z',features,complete:true});
const analyze=(features,extra={})=>analyzeSiteContext({site,placement:{x:0,z:0,rotation:0},model:tower,data:data(features),...extra});
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);

test('native tower footprint rotates its real offset before applying placement',()=>{
 const original=modelSiteFootprint({x:0,z:0,rotation:0},tower);
 assert.deepEqual(original.center,{x:8,z:-16.5});
 assert.deepEqual(original.points,[{x:-8,z:-27.5},{x:24,z:-27.5},{x:24,z:-5.5},{x:-8,z:-5.5}]);
 const moved=modelSiteFootprint({x:10,z:20,rotation:90},tower);
 near(moved.center.x,26.5);near(moved.center.z,28);
 near(Math.min(...moved.points.map(p=>p.x)),15.5);near(Math.max(...moved.points.map(p=>p.x)),37.5);
 near(Math.min(...moved.points.map(p=>p.z)),12);near(Math.max(...moved.points.map(p=>p.z)),44);
 assert.equal(moved.width,32);assert.equal(moved.depth,22);assert.equal(moved.basis,'native-tower-footprint');
});

test('road relationship measures footprint edge to mapped centreline, not model centre distance',()=>{
 const result=analyze([road('way/100',[[-100,-40],[100,-40]])]);
 const relation=result.relations.find(r=>r.id==='CTX-road');
 assert.equal(result.status,'ready');assert.equal(relation.distanceM,12.5);
 assert.notEqual(relation.distanceM,23.5,'The 23.5 m centre distance is not the edge clearance');
 assert.match(relation.observation.en,/centreline/i);
 const local=modelSiteFootprint({x:0,z:0,rotation:0},tower);
 near(footprintDistance(local.points,[{x:-100,z:-40},{x:100,z:-40}]).distance,12.5);
});

test('moving and rotating the tower recalculates the same mapped road relationship',()=>{
 const feature=road('way/101',[[60,-100],[60,100]]);
 const before=analyze([feature]);
 const after=analyze([feature],{placement:{x:10,z:20,rotation:90}});
 assert.equal(before.relations.find(r=>r.id==='CTX-road').distanceM,36);
 const relation=after.relations.find(r=>r.id==='CTX-road');
 assert.equal(relation.distanceM,22.5);assert.equal(relation.bearingDeg,90);assert.equal(relation.frontAngleDeg,0);
 assert.equal(after.model.placement.rotation,90);
});

test('an intersecting mapped building is a review relationship rather than a compliance failure',()=>{
 const neighbour=polygon('way/102','building',[[20,-10],[40,-10],[40,10],[20,10]],{building:'yes'});
 const result=analyze([neighbour]);
 const relation=result.relations.find(r=>r.id==='CTX-building');
 assert.equal(relation.distanceM,0);assert.equal(relation.overlap,true);assert.equal(relation.status,'review');
 assert.match(relation.observation.en,/intersect/i);assert.ok(!result.relations.some(r=>r.status==='fail'||r.status==='pass'));
 assert.match(result.limitations.en,/not surveyed|not.*code compliance/i);
});

test('a nearer footway remains pedestrian context and does not become the vehicle road',()=>{
 const footway=road('way/103',[[25,-100],[25,100]],{highway:'footway'});
 const vehicleRoad=road('way/104',[[60,-100],[60,100]],{highway:'service'});
 const together=analyze([footway,vehicleRoad]);
 assert.equal(together.relations.find(r=>r.id==='CTX-road').featureId,'way/104');
 assert.equal(together.relations.find(r=>r.id==='CTX-walk').featureId,'way/103');
 assert.equal(together.counts.pedestrianWays,1);
 const pedestrianOnly=analyze([footway]);
 assert.ok(!pedestrianOnly.relations.some(r=>r.id==='CTX-road'));
 assert.ok(pedestrianOnly.relations.some(r=>r.id==='CTX-walk'));
});

test('missing OSM width and access tags do not become verified driveable or fire-access dimensions',()=>{
 const result=analyze([road('way/105',[[-100,-40],[100,-40]])]);
 const relation=result.relations.find(r=>r.id==='CTX-road');
 assert.equal(relation.width,'not tagged');assert.equal(relation.access,'not tagged');assert.equal(relation.status,'review');
 assert.match(relation.observation.en,/access is not confirmed/i);
 assert.match(relation.recommendation.en,/verify.*actual width/i);
 assert.equal(relation.requiredWidthM,undefined);assert.equal(relation.compliant,undefined);
});

test('missing data and a changed site never reuse the preceding site relationships',()=>{
 const observed=data([road('way/106',[[-100,-40],[100,-40]])]);
 const missing=analyzeSiteContext({site,placement:{x:0,z:0,rotation:0},model:tower});
 assert.equal(missing.status,'unavailable');assert.deepEqual(missing.relations,[]);assert.equal(missing.counts.roads,0);
 const changedSite=toGeo({x:20,z:0},site);
 const stale=analyzeSiteContext({site:changedSite,placement:{x:0,z:0,rotation:0},model:tower,data:observed});
 assert.equal(stale.status,'stale');assert.deepEqual(stale.relations,[]);assert.equal(stale.counts.roads,0);assert.ok(stale.warnings.length);
 const empty=analyze([]);assert.equal(empty.status,'ready');assert.deepEqual(empty.relations,[]);
 assert.match(empty.limitations.en,/Missing mapped features do not prove absence/i);
});

test('approximate relationships retain OSM provenance and compact AI context excludes bulk geometry',()=>{
 const result=analyze([
  road('way/107',[[-100,-40],[100,-40]],{width:'6',access:'private'}),
  polygon('way/108','building',[[40,30],[50,30],[50,40],[40,40]],{building:'yes'}),
  polygon('way/109','green',[[-70,-40],[-50,-40],[-50,-20],[-70,-20]],{leisure:'park'}),
 ]);
 assert.equal(result.source,'OpenStreetMap');assert.equal(result.fetchedAt,'2026-10-31T07:00:00Z');
 assert.ok(result.relations.length>=3);
 for(const relation of result.relations){assert.equal(relation.sourceUrl,'https://www.openstreetmap.org/'+relation.featureId);assert.equal(relation.status,'review');}
 const compact=compactSiteContext(result);
 assert.equal(compact.source,'OpenStreetMap');assert.equal(compact.attribution,'© OpenStreetMap contributors');
 assert.equal(compact.dataTimestamp,'2026-10-31T06:59:00Z');assert.deepEqual(compact.limitations,result.limitations);
 assert.equal(Object.hasOwn(compact,'features'),false);assert.equal(Object.hasOwn(compact.model,'footprint'),false);
 assert.ok(compact.relations.every(relation=>!Object.hasOwn(relation,'geometry')&&!Object.hasOwn(relation,'nearby')));
 assert.ok(compact.relations.some(relation=>relation.featureId==='way/107'&&relation.width==='6'));
});

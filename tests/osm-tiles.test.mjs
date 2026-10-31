import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchOsmTileContext} from '../server/osm-tiles.mjs';

const utf8=new TextEncoder(),join=chunks=>Uint8Array.from(chunks.flatMap(chunk=>[...chunk]));
function varint(value){let n=BigInt(value);const out=[];do{let byte=Number(n&127n);n>>=7n;if(n)byte|=128;out.push(byte);}while(n);return Uint8Array.from(out);}
const scalar=(tag,value)=>join([varint(tag*8),varint(value)]);
const bytes=(tag,value)=>join([varint(tag*8+2),varint(value.length),value]);
const string=(tag,value)=>bytes(tag,utf8.encode(value));
const packed=(tag,values)=>bytes(tag,join(values.map(varint)));
const zigzag=value=>value<0?-value*2-1:value*2;
function geometry(paths,type){let x=0,y=0;const out=[];for(const path of paths){const points=path.slice();const first=points.shift();out.push(9,zigzag(first[0]-x),zigzag(first[1]-y));[x,y]=first;if(type!==1&&points.length){out.push(points.length*8+2);for(const point of points){out.push(zigzag(point[0]-x),zigzag(point[1]-y));[x,y]=point;}}if(type===3)out.push(15);}return out;}
function layer(name,entries){const keys=[],values=[],features=[];for(const entry of entries){const tags=[];for(const [key,value]of Object.entries(entry.tags||{})){let k=keys.indexOf(key);if(k<0){k=keys.length;keys.push(key);}let v=values.indexOf(String(value));if(v<0){v=values.length;values.push(String(value));}tags.push(k,v);}features.push(bytes(2,join([scalar(1,entry.id??1),packed(2,tags),scalar(3,entry.type),packed(4,geometry(entry.paths,entry.type))])));}return bytes(3,join([string(1,name),...features,...keys.map(k=>string(3,k)),...values.map(v=>bytes(4,string(1,v))),scalar(5,4096),scalar(15,2)]));}
const tile=(...layers)=>join(layers);
const template='https://tiles.openfreemap.org/planet/20261025_080012_pt/{z}/{x}/{y}.pbf';
const center={lat:Math.atan(Math.sinh(Math.PI*(1-2*(8192.5/16384))))*180/Math.PI,lng:(8192.5/16384)*360-180};
const point={id:1,type:1,tags:{class:'cafe',name:'Fixture cafe'},paths:[[[2048,2048]]]};
const road={id:2,type:2,tags:{class:'path',subclass:'footway',name:'Fixture walk'},paths:[[[1800,2048],[2300,2048]]]};
const square={id:3,type:3,tags:{render_height:999,name:'Fixture building'},paths:[[[2020,2020],[2070,2020],[2070,2070],[2020,2070]]]};
function fixtureFetcher(data){return async url=>String(url)==='https://tiles.openfreemap.org/planet'?Response.json({tiles:[template],maxzoom:14}):new Response(data,{headers:{'content-type':'application/x-protobuf'}});}

test('MVT geometry, classification and provenance remain separate from raw OSM identity and heights',async()=>{
 const data=tile(layer('transportation',[road]),layer('building',[square]),layer('park',[{...square,id:4,tags:{class:'park'}}]),layer('water',[{...square,id:5,tags:{class:'lake'}}]),layer('poi',[point]));
 const result=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(data)});
 assert.equal(result.source,'OpenStreetMap / OpenFreeMap');assert.equal(result.dataTimestamp,'2026-10-25T08:00:12Z');assert.equal(result.features.length,5);
 assert.deepEqual(result.counts,{roads:1,buildings:1,green:1,water:1,pois:1,pedestrianWays:1});
 for(const feature of result.features){assert.match(feature.id,/^mvt\/14\/8192\/8192\//);assert.match(feature.sourceUrl,/^https:\/\/www\.openstreetmap\.org\/\?mlat=/);assert.equal('width'in feature.tags,false);assert.equal('height'in feature.tags,false);assert.equal('render_height'in feature.tags,false);}
 assert.equal(result.features.find(f=>f.kind==='road').tags.highway,'footway');assert.ok(result.features.find(f=>f.kind==='building').geometry.coordinates.length>=4);
 const mapped=result.features.find(f=>f.kind==='poi').geometry.coordinates;assert.ok(Math.abs(mapped[0]-center.lng)<1e-7&&Math.abs(mapped[1]-center.lat)<1e-7);
});

test('a crossing line is retained even when its endpoints are outside the requested radius',async()=>{
 const data=tile(layer('transportation',[{...road,tags:{class:'primary'},paths:[[[0,2048],[4096,2048]]]}]));
 const result=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(data)});assert.equal(result.features.length,1);assert.equal(result.features[0].kind,'road');
});

test('empty tiles and distant geometry do not create nearby observations or imply physical absence',async()=>{
 const data=tile(layer('poi',[{...point,paths:[[[0,0]]]}]));const result=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(data)});
 assert.deepEqual(result.features,[]);assert.equal(result.counts.pois,0);assert.ok(result.warnings.some(w=>/does not prove absence/.test(w)));
});

test('64-bit feature ids are preserved only in the tile namespace',async()=>{
 const id=2n**60n+7n;const result=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(tile(layer('poi',[{...point,id}])))});
 assert.ok(result.features[0].id.includes('/'+id.toString()+'/'));assert.ok(!result.features[0].sourceUrl.includes('/node/'));
});

test('interior-hole polygons are omitted rather than filled as solid buildings',async()=>{
 const hole=[[2030,2030],[2030,2060],[2060,2060],[2060,2030]];const result=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(tile(layer('building',[{...square,paths:[...square.paths,hole]}])))});
 assert.deepEqual(result.features,[]);assert.equal(result.complete,false);assert.ok(result.warnings.some(w=>/interior holes/.test(w)));
});

test('the returned context respects the 500-feature and 24,000-vertex limits',async()=>{
 const many=Array.from({length:510},(_,i)=>({...point,id:i+1}));const capped=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(tile(layer('poi',many)))});assert.equal(capped.features.length,500);assert.equal(capped.complete,false);
 const circle=Array.from({length:1000},(_,i)=>[Math.round(2048+60*Math.cos(i/1000*2*Math.PI)),Math.round(2048+60*Math.sin(i/1000*2*Math.PI))]);
 const polygons=Array.from({length:30},(_,i)=>({...square,id:i+1,paths:[circle]}));const limited=await fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(tile(layer('building',polygons)))});
 assert.ok(limited.features.reduce((sum,f)=>sum+f.geometry.coordinates.length,0)<=24000);assert.equal(limited.complete,false);
});

test('input validation stops invalid requests before any network access',async()=>{
 let called=false;const fetcher=async()=>{called=true;throw Error('Should not fetch');};
 for(const values of [{lat:86,lng:0,radius:500},{lat:0,lng:181,radius:500},{lat:0,lng:0,radius:149},{lat:NaN,lng:0,radius:500}])await assert.rejects(fetchOsmTileContext({...values,fetcher}),e=>e.status===400);
 assert.equal(called,false);
});

test('malformed protobuf and oversized transfers are rejected with bounded reads',async()=>{
 await assert.rejects(fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(Uint8Array.from([26,255]))}),e=>e.status===502);
 const oversized=async url=>String(url)==='https://tiles.openfreemap.org/planet'?Response.json({tiles:[template],maxzoom:14}):new Response('x',{headers:{'content-length':String(4*1024*1024+1)}});
 await assert.rejects(fetchOsmTileContext({...center,radius:150,fetcher:oversized}),e=>e.status===413);
 const malformedTags=bytes(3,join([string(1,'poi'),bytes(2,join([scalar(1,1),packed(2,[1,0]),scalar(3,1),packed(4,[9,4096,4096])])),string(3,'class'),bytes(4,string(1,'cafe')),scalar(5,4096)]));
 await assert.rejects(fetchOsmTileContext({...center,radius:150,fetcher:fixtureFetcher(malformedTags)}),e=>e.status===502);
});

test('only the covering tiles are fetched, with no more than four requests concurrently',async()=>{
 let active=0,peak=0,requests=0;const fetcher=async url=>{if(String(url)==='https://tiles.openfreemap.org/planet')return Response.json({tiles:[template],maxzoom:14});active++;peak=Math.max(peak,active);requests++;await new Promise(resolve=>setTimeout(resolve,2));active--;return new Response(new Uint8Array());};
 const result=await fetchOsmTileContext({lat:0,lng:0,radius:500,fetcher});assert.ok(requests>=1&&requests<=4);assert.ok(peak<=4);assert.deepEqual(result.features,[]);
});

test('partial tile failure is labelled incomplete, while total throttling remains an error',async()=>{
 let n=0;const partial=async url=>String(url)==='https://tiles.openfreemap.org/planet'?Response.json({tiles:[template],maxzoom:14}):++n===1?new Response('Unavailable',{status:503}):new Response(new Uint8Array());
 const result=await fetchOsmTileContext({lat:0,lng:0,radius:500,fetcher:partial});assert.equal(result.complete,false);assert.ok(result.warnings.some(w=>/could not be read/.test(w)));
 const throttled=async url=>String(url)==='https://tiles.openfreemap.org/planet'?Response.json({tiles:[template],maxzoom:14}):new Response('Wait',{status:429});await assert.rejects(fetchOsmTileContext({...center,radius:150,fetcher:throttled}),e=>e.status===429);
});

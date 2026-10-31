import test from 'node:test';
import assert from 'node:assert/strict';

let moduleNumber=0;
const freshApi=async()=>await import(`../server/api.mjs?osm-test=${++moduleNumber}`);
const request=(path,input)=>new Request('http://127.0.0.1:4173'+path,input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
const responseJSON=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const center={lat:1.2996,lng:103.7875};
const ring=[{lat:1.299,lng:103.787},{lat:1.299,lon:103.788},{lat:1.300,lon:103.788},{lat:1.300,lon:103.787},{lat:1.299,lon:103.787}].map(p=>({...p,lon:p.lon??p.lng}));
const fixture={osm3s:{timestamp_osm_base:'2026-10-31T06:00:00Z'},elements:[
  {type:'way',id:10,tags:{highway:'residential',name:'Local Road',width:'4.2',access:'destination',secret:'DO_NOT_INCLUDE'},geometry:[{lat:1.2996,lon:103.787},{lat:1.3000,lon:103.788}]},
  {type:'way',id:11,tags:{highway:'footway'},geometry:[{lat:1.2998,lon:103.787},{lat:1.3002,lon:103.788}]},
  {type:'way',id:20,tags:{building:'apartments','building:levels':'8'},geometry:ring},
  {type:'way',id:30,tags:{leisure:'park'},geometry:ring},
  {type:'way',id:40,tags:{waterway:'stream'},geometry:[{lat:1.2996,lon:103.786},{lat:1.3000,lon:103.788}]},
  {type:'node',id:50,tags:{amenity:'school',name:'Mapped School'},lat:1.2996,lon:103.789},
]};

test('OSM requests validate coordinates and bounded radius before contacting a provider',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not fetch invalid coordinates');};
  for(const input of [{lat:86,lng:0},{lat:1,lng:181},{lat:' ',lng:1},{lat:true,lng:1},{...center,radius:149},{...center,radius:1001},{...center,radius:'nonsense'}]){
    const result=await handleApi(request('/api/osm',input));assert.equal(result.status,400);
  }
  assert.equal(calls,0);
});

test('OSM geometry, source tags and provenance survive normalization; cache never changes its center',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let calls=0;globalThis.fetch=async(url,options)=>{
    calls++;assert.match(String(url),/overpass-api/);assert.match(options.headers['User-Agent'],/SiteCodeAI.*github/);
    const query=new URLSearchParams(options.body).get('data');assert.match(query,/out body geom/);assert.match(query,/around:500/);
    assert.equal(options.headers.Authorization,undefined);return responseJSON(fixture);
  };
  const first=await(await handleApi(request('/api/osm',{...center,radius:500}))).json();
  assert.equal(first.source,'OpenStreetMap');assert.equal(first.status,'live');assert.deepEqual(first.center,center);
  assert.equal(first.complete,true);assert.equal(first.dataTimestamp,fixture.osm3s.timestamp_osm_base);
  assert.equal(first.attribution,'© OpenStreetMap contributors');assert.match(first.licenceUrl,/openstreetmap.org\/copyright/);
  assert.deepEqual(first.counts,{roads:2,buildings:1,green:1,water:1,pois:1,pedestrianWays:1});
  const road=first.features.find(f=>f.id==='way/10'),building=first.features.find(f=>f.id==='way/20');
  assert.equal(road.tags.width,'4.2');assert.equal(road.tags.secret,undefined);assert.equal(road.geometry.type,'LineString');
  assert.deepEqual(road.geometry.coordinates[0],[103.787,1.2996]);
  assert.equal(building.geometry.type,'Polygon');assert.equal(building.tags['building:levels'],'8');
  assert.equal(building.tags.height,undefined,'An untagged height must remain unknown');
  const same=await(await handleApi(request('/api/osm',{...center,radius:500}))).json();assert.equal(same.cached,true);assert.equal(calls,1);
  const moved={lat:1.32,lng:103.80};const second=await(await handleApi(request('/api/osm',{...moved,radius:500}))).json();
  assert.deepEqual(second.center,moved);assert.equal(calls,2);
});

test('oversized or invalid OSM geometries are omitted with an explicit incomplete marker',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const elements=Array.from({length:652},(_,i)=>({type:'way',id:i+1,tags:{highway:'service'},geometry:[{lon:103.78,lat:1.29},{lon:103.79,lat:1.30}]}));
  elements.push({type:'way',id:9999,tags:{building:'yes'},geometry:[{lon:103.78,lat:1.29},{lon:103.79,lat:1.30}]});
  globalThis.fetch=async()=>responseJSON({elements});
  const result=await(await handleApi(request('/api/osm',center))).json();
  assert.equal(result.features.length,650);assert.equal(result.complete,false);
  assert.ok(result.warnings.some(warning=>/omitted/.test(warning)));
  assert.ok(!result.features.some(feature=>feature.id==='way/9999'));
});

test('a provider failure uses only one fallback and never substitutes simulated map features',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return new Response('busy',{status:429});};
  const failed=await handleApi(request('/api/osm',center));assert.equal(failed.status,429);
  const error=await failed.json();assert.equal(error.error.code,'osm-unavailable');assert.equal(error.features,undefined);
  assert.equal(calls.length,2);assert.notEqual(calls[0],calls[1]);
});

const protobufVarint=n=>{const bytes=[];do{let byte=n%128;n=Math.floor(n/128);if(n)byte|=128;bytes.push(byte);}while(n);return bytes;};
const protobufNumber=(field,n)=>[...protobufVarint(field*8),...protobufVarint(n)];
const protobufBytes=(field,bytes)=>[...protobufVarint(field*8+2),...protobufVarint(bytes.length),...bytes];
const protobufText=(field,value)=>protobufBytes(field,new TextEncoder().encode(value));
function roadTile(){
  const feature=[...protobufNumber(1,1),...protobufBytes(2,[0,0,1,1]),...protobufNumber(3,2),...protobufBytes(4,[9,0,0,10,...protobufVarint(8192),...protobufVarint(8192)])];
  const layer=[...protobufText(1,'transportation'),...protobufBytes(2,feature),...protobufText(3,'class'),...protobufText(3,'name'),...protobufBytes(4,protobufText(1,'primary')),...protobufBytes(4,protobufText(1,'Fixture Road')),...protobufNumber(5,4096),...protobufNumber(15,2)];
  return Uint8Array.from(protobufBytes(3,layer));
}

test('one unavailable Overpass request falls back to real decoded vector geometry with distinct tile identity',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const calls=[];globalThis.fetch=async(url,options)=>{
    const target=String(url);calls.push(target);assert.equal(options.headers.Authorization,undefined);
    if(target.includes('overpass-api.de'))return new Response('not available',{status:503});
    if(target==='https://tiles.openfreemap.org/planet')return responseJSON({tiles:['https://tiles.openfreemap.org/planet/20261025_080012_pt/{z}/{x}/{y}.pbf'],maxzoom:14});
    assert.match(target,/^https:\/\/tiles\.openfreemap\.org\/planet\/.+\.pbf$/);
    return new Response(roadTile(),{headers:{'Content-Type':'application/x-protobuf'}});
  };
  const response=await handleApi(request('/api/osm',{lat:0.001,lng:0.001,radius:500}));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.source,'OpenStreetMap / OpenFreeMap');assert.ok(result.features.length>0);
  assert.ok(result.features.every(feature=>feature.id.startsWith('mvt/')&&feature.geometry.type==='LineString'));
  assert.ok(result.features.every(feature=>feature.sourceUrl.startsWith('https://www.openstreetmap.org/?')));
  assert.ok(result.warnings.some(warning=>/Overpass was unavailable/.test(warning)));
  assert.equal(calls.filter(url=>url.includes('overpass-api.de')).length,1);assert.ok(calls.filter(url=>url.endsWith('.pbf')).length<=4);
  assert.ok(!calls.some(url=>url.includes('openstreetmap.org/api/')),'Never use the map-editing API as a read-only fallback');
});

test('Photon results normalize extent to west-south-east-north and search is cached and rate limited',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let calls=0;globalThis.fetch=async(url,options)=>{
    calls++;const parsed=new URL(url);assert.equal(parsed.host,'photon.example.test');
    assert.equal(parsed.searchParams.get('q'),'One North');assert.equal(parsed.searchParams.get('limit'),'5');
    assert.match(options.headers['User-Agent'],/SiteCodeAI/);assert.equal(options.headers.Authorization,undefined);
    return responseJSON({features:[{geometry:{type:'Point',coordinates:[103.8,1.3]},properties:{name:'One North',city:'Singapore',country:'Singapore',extent:[103.7,1.4,103.9,1.2]}}]});
  };
  const env={PHOTON_URL:'https://photon.example.test/api/'};
  const first=await(await handleApi(request('/api/geocode?q=One%20North'),env)).json();
  assert.equal(first.source,'OpenStreetMap / Photon');assert.deepEqual(first.results[0].bbox,[103.7,1.2,103.9,1.4]);
  assert.deepEqual({lat:first.results[0].lat,lng:first.results[0].lng},{lat:1.3,lng:103.8});
  const same=await(await handleApi(request('/api/geocode?q=one%20north'),env)).json();assert.equal(same.cached,true);assert.equal(calls,1);
  const limited=await handleApi(request('/api/geocode?q=Other%20Town'),env);assert.equal(limited.status,429);assert.equal(calls,1);
});

test('map search errors contain no invented results',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async()=>new Response('upstream unavailable',{status:503});
  assert.equal((await handleApi(request('/api/geocode?q=x'))).status,400);
  const failed=await handleApi(request('/api/geocode?q=Sentosa'));assert.equal(failed.status,502);
  const result=await failed.json();assert.equal(result.error.code,'geocode-unavailable');assert.equal(result.results,undefined);
});

const surroundings=()=>({status:'ready',source:'OpenStreetMap',center,radius:500,fetchedAt:new Date().toISOString(),dataTimestamp:'2026-10-31T06:00:00Z',attribution:'© OpenStreetMap contributors',licenceUrl:'https://www.openstreetmap.org/copyright',counts:{roads:2,buildings:1,green:1,water:0,pois:2,pedestrianWays:1},model:{basis:'Declared model envelope',width:100,depth:86,placement:{x:0,z:0,rotation:12}},relations:[{id:'CTX-road',kind:'road',featureId:'way/10',name:'Local Road',title:{en:'Road relationship',zh:'道路关系'},observation:{en:'Mapped road is approximately 20 m from the declared envelope.',zh:'地图道路距申报范围约20米。'},recommendation:{en:'Review the entrance connection; road width is not tagged.',zh:'核对入口连接；道路宽度尚无标注。'},distanceM:20,bearingDeg:90,sourceUrl:'https://www.openstreetmap.org/way/10'}],limitations:{en:'Approximate geographic relationships, not surveyed boundaries or code findings.',zh:'近似地理关系，不是实测边界或规范检查。'},warnings:[]});
const aiResponse=()=>responseJSON({output:[{content:[{type:'output_text',text:'Review the mapped road relationship. / 请核对地图道路关系。'}]}]});
const fakeAI={OPENAI_API_KEY:'sk-test-only-not-a-real-key',OPENAI_MODEL:'gpt-6.1-sol'};

test('site chat sends OSM relations separately from legal evidence and can discuss them without code excerpts',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let captured;globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.openai.com/v1/responses');captured=JSON.parse(options.body);return aiResponse();};
  const answer=await handleApi(request('/api/chat',{findings:[],project:{intent:'site',question:'How does this building relate to its surroundings?',site:center,surroundings:surroundings(),retrievedSources:[],history:[]}}),fakeAI);
  assert.equal(answer.status,200);const result=await answer.json();assert.equal(result.provider,'openai');assert.equal(result.grounding.status,'geographic-context-provided');
  const context=JSON.parse(captured.input[0].content[0].text.split('\n').slice(1).join('\n'));
  assert.equal(context.intent,'site');assert.equal(context.surroundings.relations[0].featureId,'way/10');
  assert.equal(context.surroundings.relations[0].distanceM,20);assert.deepEqual(context.retrievedSources,[]);
  assert.match(captured.instructions,/NOT a building-code source/);assert.match(captured.instructions,/untagged road widths/);
  assert.deepEqual(result.linkedIssues,[]);assert.equal(result.mapContext.source,'OpenStreetMap');
});

test('moving the selected site invalidates old OSM relations rather than answering from the old center',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let calls=0;globalThis.fetch=async()=>{calls++;return aiResponse();};
  const result=await(await handleApi(request('/api/chat',{findings:[],project:{intent:'site',question:'周围建筑关系怎么样',site:{lat:1.4,lng:103.9},surroundings:surroundings()}}),fakeAI)).json();
  assert.equal(result.provider,'local-site-context');assert.equal(result.grounding.mapContextStatus,'stale');assert.equal(result.grounding.status,'missing-map-context');assert.equal(calls,0);
});

test('missing, unavailable or empty site relationships produce a map-specific retry prompt without an AI call',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let calls=0;globalThis.fetch=async()=>{calls++;return aiResponse();};
  for(const map of [null,{...surroundings(),status:'unavailable'},{...surroundings(),relations:[]}]){
    const result=await(await handleApi(request('/api/chat',{findings:[],project:{intent:'site',question:'分析周边道路和建筑关系',site:center,surroundings:map}}),fakeAI)).json();
    assert.equal(result.provider,'local-site-context');assert.equal(result.grounding.status,'missing-map-context');
    assert.match(result.text,/周边地图关系/);assert.doesNotMatch(result.text,/未在已导入规范中/);
  }
  assert.equal(calls,0);
});

test('vector-tile relationships retain their source namespace and invalid feature identifiers are refused',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const map=surroundings();map.source='OpenStreetMap / OpenFreeMap';map.attribution+='; OpenMapTiles';map.relations[0].featureId='mvt/15/25831/16267/transportation/1010984734/0';
  let calls=0,captured;globalThis.fetch=async(url,options)=>{calls++;captured=JSON.parse(options.body);return aiResponse();};
  const answer=await(await handleApi(request('/api/chat',{findings:[],project:{intent:'site',question:'周边道路与模型关系',site:center,surroundings:map}}),fakeAI)).json();
  assert.equal(answer.provider,'openai');assert.equal(answer.mapContext.source,'OpenStreetMap / OpenFreeMap');
  const context=JSON.parse(captured.input[0].content[0].text.split('\n').slice(1).join('\n'));
  assert.equal(context.surroundings.relations[0].featureId,map.relations[0].featureId);assert.match(context.surroundings.attribution,/OpenMapTiles/);
  map.relations[0].featureId='mvt/15/../../unmapped';
  const rejected=await(await handleApi(request('/api/chat',{findings:[],project:{intent:'site',question:'周边道路与模型关系',site:center,surroundings:map}}),fakeAI)).json();
  assert.equal(rejected.provider,'local-site-context');assert.equal(calls,1);
});

test('code excerpts remain legal sources while large map context is independently bounded',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let captured;globalThis.fetch=async(url,options)=>{captured=JSON.parse(options.body);return aiResponse();};
  const map=surroundings();map.relations=Array.from({length:8},(_,i)=>({...map.relations[0],id:'CTX-'+i,observation:{en:'Mapped observation '.repeat(90),zh:'地理观测。'.repeat(90)},recommendation:{en:'Verify on site. '.repeat(90),zh:'现场核对。'.repeat(90)}}));
  const sources=Array.from({length:5},(_,i)=>({sourceType:'local-pdf',docId:'CODE-'+i,page:20+i,title:'Actual code evidence',agency:'BCA',excerpt:'A supported threshold is 4.0 m. '+('PDF source text '.repeat(170)),pdfUrl:'https://example.org/code.pdf'}));
  const response=await handleApi(request('/api/chat',{findings:[],project:{intent:'site',question:'Explain mapped context and applicable code evidence',site:center,surroundings:map,retrievedSources:sources,history:[{role:'user',content:'Earlier context '.repeat(70)}]}}),fakeAI);
  assert.equal(response.status,200);const context=JSON.parse(captured.input[0].content[0].text.split('\n').slice(1).join('\n'));
  assert.ok(JSON.stringify(context).length<=20000);assert.equal(context.retrievedSources.length,5);
  assert.ok(context.retrievedSources.every(source=>source.sourceType==='local-pdf'&&source.excerpt.includes('4.0 m')));
  assert.equal(context.surroundings.source,'OpenStreetMap');assert.ok(context.surroundings.relations.length>0);
});

test('design brief receives map relations outside the clipped project summary',async t=>{
  const {handleApi}=await freshApi();const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let captured;globalThis.fetch=async(url,options)=>{captured=JSON.parse(options.body);return aiResponse();};
  const response=await handleApi(request('/api/explain',{findings:[{id:'local-check',status:'review',title:{en:'Review',zh:'复核'},measured:{en:'Not measured',zh:'未测量'},requirement:{en:'Verify',zh:'核对'}}],project:{model:'Local model',site:center,longProjectText:'x'.repeat(4000),surroundings:surroundings()}}),fakeAI);
  assert.equal(response.status,200);const input=JSON.parse(captured.input);
  assert.ok(input.project.length<=2500);assert.equal(input.surroundings.relations[0].id,'CTX-road');
  assert.equal(input.surroundings.counts.roads,2);assert.match(captured.instructions,/OpenStreetMap as a geographic context source/);
});

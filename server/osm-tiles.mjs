// Small, read-only OpenMapTiles context reader. This is map geometry, not raw
// OSM object identity, surveyed dimensions, access rights or regulatory evidence.
const OFM_TILEJSON='https://tiles.openfreemap.org/planet';
const OFM_MAX_BYTES=4*1024*1024,OFM_MAX_FEATURES=500,OFM_MAX_VERTICES=24000;
const OFM_ALLOWED_LAYERS=new Set(['transportation','building','park','landuse','landcover','water','waterway','poi']);
const OFM_GREEN_CLASSES=new Set(['park','grass','wood','forest','meadow','grassland','farmland','wetland','scrub','heath','recreation_ground','village_green','allotments','cemetery','greenfield','garden','orchard','nature_reserve']);
const ofmMetadataCache=new WeakMap();
const ofmText=new TextDecoder('utf-8',{fatal:true});
function ofmError(message,status=502){const error=new Error(message);error.status=status;return error;}

class OfmPbf {
 constructor(bytes){this.bytes=bytes;this.position=0;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
 get done(){return this.position===this.bytes.length;}
 ensure(n){if(!Number.isInteger(n)||n<0||this.position+n>this.bytes.length)throw ofmError('Malformed vector tile');}
 bigint(){let value=0n;for(let i=0;i<10;i++){this.ensure(1);const byte=this.bytes[this.position++];if(i===9&&byte>1)throw ofmError('Oversized vector-tile integer');value|=BigInt(byte&127)<<BigInt(i*7);if(!(byte&128))return value;}throw ofmError('Malformed vector-tile integer');}
 number(){const value=this.bigint();if(value>BigInt(Number.MAX_SAFE_INTEGER))throw ofmError('Unsafe vector-tile integer');return Number(value);}
 field(){const value=this.number(),tag=Math.floor(value/8),wire=value&7;if(!tag)throw ofmError('Invalid vector-tile tag');return {tag,wire};}
 bytesValue(){const length=this.number();this.ensure(length);const value=this.bytes.subarray(this.position,this.position+length);this.position+=length;return value;}
 string(){return ofmText.decode(this.bytesValue());}
 skip(wire){if(wire===0)this.bigint();else if(wire===1){this.ensure(8);this.position+=8;}else if(wire===2)this.bytesValue();else if(wire===5){this.ensure(4);this.position+=4;}else throw ofmError('Unsupported vector-tile wire type');}
}
function ofmValue(bytes){const p=new OfmPbf(bytes);let value=null;while(!p.done){const {tag,wire}=p.field();if(tag===1&&wire===2)value=p.string();else if(tag===2&&wire===5){p.ensure(4);value=p.view.getFloat32(p.position,true);p.position+=4;}else if(tag===3&&wire===1){p.ensure(8);value=p.view.getFloat64(p.position,true);p.position+=8;}else if([4,5,6,7].includes(tag)&&wire===0){const v=p.bigint(),signed=tag===6?(v>>1n)^-(v&1n):v;value=tag===7?v!==0n:signed<=BigInt(Number.MAX_SAFE_INTEGER)&&signed>=BigInt(Number.MIN_SAFE_INTEGER)?Number(signed):signed.toString();}else p.skip(wire);}return typeof value==='string'?value.slice(0,250):value;}
function ofmGeometry(bytes,type,extent,budget){
 const p=new OfmPbf(bytes),paths=[];let x=0,y=0,current=null,vertices=0;
 const delta=()=>{const v=p.number();return v%2?-(v+1)/2:v/2;};
 while(!p.done){const command=p.number(),id=command&7,count=Math.floor(command/8);if(!count||count>20000)throw ofmError('Invalid vector geometry');
  if(id===1||id===2){for(let i=0;i<count;i++){x+=delta();y+=delta();if(Math.abs(x)>extent*32||Math.abs(y)>extent*32)throw ofmError('Vector geometry outside tile bounds');if(++vertices>10000||++budget.decodedVertices>300000)throw ofmError('Vector geometry too dense',413);if(id===1){current=[];paths.push(current);}else if(!current||type===1)throw ofmError('Invalid vector line');current.push([x,y]);if(type===1)current=null;}}
  else if(id===7&&type===3&&current&&count===1){if(current.length<3)throw ofmError('Invalid vector polygon');if(current[0][0]!==current.at(-1)[0]||current[0][1]!==current.at(-1)[1])current.push([...current[0]]);current=null;}
  else throw ofmError('Unsupported vector geometry command');
 }
 return paths.filter(path=>path.length>=(type===1?1:type===2?2:4));
}
function ofmArea(ring){let sum=0;for(let i=1;i<ring.length;i++)sum+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];return sum/2;}
function ofmFeature(bytes,keys,values,extent,budget,index){
 const p=new OfmPbf(bytes),tags=[];let id='index-'+index,type=0,geometry=null;
 while(!p.done){const f=p.field();if(f.tag===1&&f.wire===0)id=p.bigint().toString();else if(f.tag===2&&f.wire===2){const pairs=new OfmPbf(p.bytesValue());while(!pairs.done){if(tags.length>2000)throw ofmError('Too many vector properties');tags.push(pairs.number());}}else if(f.tag===3&&f.wire===0)type=p.number();else if(f.tag===4&&f.wire===2)geometry=p.bytesValue();else p.skip(f.wire);}
 if(![1,2,3].includes(type)||!geometry)return null;if(tags.length%2)throw ofmError('Invalid vector properties');const properties=Object.create(null);
 for(let i=0;i<tags.length;i+=2){if(tags[i]>=keys.length||tags[i+1]>=values.length)throw ofmError('Invalid vector property index');properties[keys[tags[i]]]=values[tags[i+1]];}
 try{return {id,type,properties,paths:ofmGeometry(geometry,type,extent,budget)};}catch(error){if(error.status===413&&budget.decodedVertices<=300000)return {id,type,properties,paths:[],omitted:true};throw error;}
}
function ofmLayers(bytes,budget){
 const tile=new OfmPbf(bytes),layers=[];
 while(!tile.done){const field=tile.field();if(field.tag!==3||field.wire!==2){tile.skip(field.wire);continue;}const p=new OfmPbf(tile.bytesValue()),features=[],keys=[],values=[];let name='',extent=4096;
  while(!p.done){const f=p.field();if(f.tag===1&&f.wire===2)name=p.string();else if(f.tag===2&&f.wire===2){if(features.length>=30000)throw ofmError('Too many vector features',413);features.push(p.bytesValue());}else if(f.tag===3&&f.wire===2){if(keys.length>=10000)throw ofmError('Too many vector keys');keys.push(p.string());}else if(f.tag===4&&f.wire===2){if(values.length>=40000)throw ofmError('Too many vector values');values.push(ofmValue(p.bytesValue()));}else if(f.tag===5&&f.wire===0)extent=p.number();else p.skip(f.wire);}
  if(!OFM_ALLOWED_LAYERS.has(name))continue;if(!Number.isInteger(extent)||extent<1||extent>65536)throw ofmError('Invalid vector-tile extent');
  const decoded=[];for(let i=0;i<features.length;i++){const feature=ofmFeature(features[i],keys,values,extent,budget,i);if(feature)decoded.push(feature);}layers.push({name,extent,features:decoded});
 }
 return layers;
}
function ofmTilePosition(lat,lng,z){const n=2**z,s=Math.sin(lat*Math.PI/180);return {x:(lng+180)/360*n,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n};}
function ofmTileSet(lat,lng,radius,z){const n=2**z,center=ofmTilePosition(lat,lng,z),dx=radius/(111320*Math.cos(lat*Math.PI/180))/360*n,dy=radius/(40075016.686*Math.cos(lat*Math.PI/180))*n,tiles=[];for(let x=Math.floor(center.x-dx);x<=Math.floor(center.x+dx);x++)for(let y=Math.max(0,Math.floor(center.y-dy));y<=Math.min(n-1,Math.floor(center.y+dy));y++)tiles.push({z,x:(x%n+n)%n,y});return [...new Map(tiles.map(t=>[t.x+'/'+t.y,t])).values()];}
function ofmCoordinate(point,tile,extent){const n=2**tile.z,x=(tile.x+point[0]/extent)/n,y=(tile.y+point[1]/extent)/n;return [((x*360-180+180)%360+360)%360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];}
function ofmLocal(coordinate,center){return {x:((coordinate[0]-center.lng+540)%360-180)*111320*Math.cos(center.lat*Math.PI/180),y:(coordinate[1]-center.lat)*111320};}
function ofmDistance(coordinates,type,center){const points=coordinates.map(p=>ofmLocal(p,center));if(type==='Point')return Math.hypot(points[0].x,points[0].y);let best=Infinity,inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];if(type==='Polygon'&&((a.y>0)!==(b.y>0))&&0<(b.x-a.x)*(-a.y)/(b.y-a.y)+a.x)inside=!inside;if(i===0&&type!=='Polygon')continue;const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/den)):0;best=Math.min(best,Math.hypot(a.x+t*dx,a.y+t*dy));}return inside?0:best;}
function ofmKind(layer,properties,type){
 const cls=String(properties.class||''),sub=String(properties.subclass||'');
 if(layer==='transportation'&&type===2&&!['rail','transit','ferry','aerialway','pier'].includes(cls))return 'road';
 if(layer==='building'&&type===3)return 'building';
 if(type===3&&(layer==='park'||['landuse','landcover'].includes(layer)&&(OFM_GREEN_CLASSES.has(cls)||OFM_GREEN_CLASSES.has(sub))))return 'green';
 if(layer==='water'&&type===3||layer==='waterway'&&type===2)return 'water';
 if(layer==='poi'&&type===1)return 'poi';return null;
}
function ofmProperties(layer,properties,kind){
 const tags={'source:geometry':'OpenFreeMap / OpenMapTiles vector tiles','tile:layer':layer};for(const key of ['class','subclass','brunnel','surface'])if(properties[key]!==undefined)tags['tile:'+key]=String(properties[key]).slice(0,120);
 if(kind==='road'){const cls=String(properties.class||''),sub=String(properties.subclass||'');tags.highway=sub||cls||'unknown';tags['classification:source']='OpenMapTiles class/subclass, not raw OSM tags';}
 if(kind==='building')tags.building='mapped-footprint';
 if(kind==='green')tags.landuse=String(properties.class||'mapped-green-space');if(kind==='water')tags[layer==='waterway'?'waterway':'natural']=String(properties.class||'water');
 if(kind==='poi')tags.amenity=String(properties.class||properties.subclass||'mapped-facility');
 return tags;
}
async function ofmRead(response,budget,limit){
 if(!response.ok)throw ofmError('Map tiles unavailable',response.status===429?429:502);const length=Number(response.headers.get('content-length')||0);if(length>limit||budget.bytes+length>OFM_MAX_BYTES)throw ofmError('Mapped area exceeds the transfer limit',413);
 const chunks=[];let size=0;if(response.body?.getReader){const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;budget.bytes+=value.byteLength;if(size>limit||budget.bytes>OFM_MAX_BYTES){await reader.cancel();throw ofmError('Mapped area exceeds the transfer limit',413);}chunks.push(value);}}finally{reader.releaseLock();}}
 else{const value=new Uint8Array(await response.arrayBuffer());size=value.length;budget.bytes+=size;if(size>limit||budget.bytes>OFM_MAX_BYTES)throw ofmError('Mapped area exceeds the transfer limit',413);chunks.push(value);}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

export async function fetchOsmTileContext({lat,lng,radius=500,fetcher=fetch}){
 if(!Number.isFinite(lat)||Math.abs(lat)>85||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isFinite(radius)||radius<150||radius>1000||typeof fetcher!=='function')throw ofmError('Invalid map coordinates or radius',400);
 const center={lat,lng},budget={bytes:0,decodedVertices:0},controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),26000),headers={'User-Agent':'SiteCodeAI/1.0 (https://github.com/churi919/SiteCode-AI)','Accept':'application/x-protobuf, application/json;q=0.9, */*;q=0.1'};
 try{
  let metadata=ofmMetadataCache.get(fetcher);if(!metadata||metadata.expires<Date.now()){const response=await fetcher(OFM_TILEJSON,{headers,signal:controller.signal});const bytes=await ofmRead(response,budget,65536);let json;try{json=JSON.parse(ofmText.decode(bytes));}catch{throw ofmError('Invalid map metadata');}const template=json.tiles?.find(value=>typeof value==='string'&&/^https:\/\/tiles\.openfreemap\.org\/planet\//.test(value)&&['{z}','{x}','{y}'].every(token=>value.includes(token)));if(!template)throw ofmError('Map tile source unavailable');metadata={template,maxzoom:Math.min(14,Number.isInteger(json.maxzoom)?json.maxzoom:14),expires:Date.now()+1200000};ofmMetadataCache.set(fetcher,metadata);}
  let zoom=Math.max(0,metadata.maxzoom),tiles=ofmTileSet(lat,lng,radius,zoom);while(tiles.length>4&&zoom>0)tiles=ofmTileSet(lat,lng,radius,--zoom);if(tiles.length>4)throw ofmError('Requested area is too wide',413);
  const requests=tiles.map(async tile=>{const url=metadata.template.replace('{z}',tile.z).replace('{x}',tile.x).replace('{y}',tile.y);const response=await fetcher(url,{headers,signal:controller.signal});return {tile,layers:ofmLayers(await ofmRead(response,budget,OFM_MAX_BYTES),budget)};});
  const settled=await Promise.allSettled(requests),succeeded=settled.filter(r=>r.status==='fulfilled').map(r=>r.value),failed=settled.filter(r=>r.status==='rejected');if(budget.bytes>OFM_MAX_BYTES)throw ofmError('Mapped area exceeds the transfer limit',413);if(!succeeded.length)throw failed[0]?.reason||ofmError('Map tiles unavailable');
  const candidates=[];let omitted=0,holeFeatures=0;
  for(const {tile,layers}of succeeded)for(const layer of layers)for(const feature of layer.features){if(feature.omitted){omitted++;continue;}const kind=ofmKind(layer.name,feature.properties,feature.type);if(!kind)continue;if(feature.type===3&&feature.paths.some(path=>ofmArea(path)<0)){holeFeatures++;continue;}let part=0;for(const path of feature.paths){const coordinates=path.map(p=>ofmCoordinate(p,tile,layer.extent)),type=feature.type===1?'Point':feature.type===2?'LineString':'Polygon',d=ofmDistance(coordinates,type,center);if(!Number.isFinite(d)||d>radius){part++;continue;}if(path.length>2500){omitted++;part++;continue;}const representative=coordinates[Math.floor(coordinates.length/2)],name=String(feature.properties['name:en']||feature.properties.name||feature.properties.name_en||feature.properties.subclass||feature.properties.class||({building:'Mapped building',green:'Mapped green space',water:'Mapped water',poi:'Mapped facility',road:'Mapped road'})[kind]).slice(0,180);candidates.push({id:`mvt/${tile.z}/${tile.x}/${tile.y}/${layer.name}/${feature.id}/${part++}`,kind,name,geometry:{type,coordinates:type==='Point'?coordinates[0]:coordinates},tags:ofmProperties(layer.name,feature.properties,kind),sourceUrl:`https://www.openstreetmap.org/?mlat=${representative[1].toFixed(6)}&mlon=${representative[0].toFixed(6)}#map=17/${representative[1].toFixed(6)}/${representative[0].toFixed(6)}`,distance:d,vertices:coordinates.length});}}
  candidates.sort((a,b)=>a.distance-b.distance);const features=[],counts={roads:0,buildings:0,green:0,water:0,pois:0,pedestrianWays:0};let vertices=0;
  for(const candidate of candidates){if(features.length>=OFM_MAX_FEATURES||vertices+candidate.vertices>OFM_MAX_VERTICES){omitted++;continue;}vertices+=candidate.vertices;const {distance,vertices:unused,...feature}=candidate;features.push(feature);if(feature.kind==='road'){counts.roads++;if(/^(?:footway|path|pedestrian|steps|cycleway|bridleway)$/.test(feature.tags.highway))counts.pedestrianWays++;}else counts[({building:'buildings',poi:'pois'})[feature.kind]||feature.kind]++;}
  const timestamp=metadata.template.match(/\/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/),dataTimestamp=timestamp?`${timestamp[1]}-${timestamp[2]}-${timestamp[3]}T${timestamp[4]}:${timestamp[5]}:${timestamp[6]}Z`:null;
  const warnings=['OSM-derived vector-tile geometry; features may be clipped or split at tile boundaries. Tile identifiers are not OSM object IDs. / 使用 OSM 派生矢量瓦片几何；图形可能在瓦片边界裁切或分割，瓦片编号不是 OSM 对象编号。','Tile classes are cartographic categories. Untagged widths, actual heights, access rights and current site conditions are not inferred; the data time is the tile build date. / 瓦片分类用于地图表达，未推断未标注的宽度、真实高度、通行权或现场现状；数据时间为瓦片构建日期。'];
  if(!features.length)warnings.push('No nearby features were available in these map tiles; this does not prove absence on site. / 这些地图瓦片没有提供附近要素，不代表现场不存在。');if(failed.length)warnings.push(`${failed.length} map tiles could not be read; context is incomplete. / ${failed.length} 个瓦片未读取，环境数据不完整。`);if(omitted)warnings.push(`${omitted} oversized or excess geometry pieces were omitted. / 已略过 ${omitted} 个超大或超限图形片段。`);if(holeFeatures)warnings.push(`${holeFeatures} polygons with interior holes were omitted to avoid treating holes as solid land/buildings. / 已略过 ${holeFeatures} 个含内环的面，避免把中空区域误判为实体。`);
  return {source:'OpenStreetMap / OpenFreeMap',status:'live',center,radius,fetchedAt:new Date().toISOString(),dataTimestamp,attribution:'OpenFreeMap © OpenMapTiles · Data from OpenStreetMap',licenceUrl:'https://www.openstreetmap.org/copyright',sourceUrl:'https://openfreemap.org/',features,counts,warnings,complete:!failed.length&&!omitted&&!holeFeatures};
 }catch(error){if(controller.signal.aborted)throw ofmError('Map tile request timed out',504);throw error;}finally{clearTimeout(timeout);controller.abort();}
}

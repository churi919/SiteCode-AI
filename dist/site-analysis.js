import {toLocal,toGeo,footprint,inPolygon,polygonContainsPolygon} from './parcel.js';

const KINDS=new Set(['road','building','green','water','poi']);
const PEDESTRIAN=new Set(['footway','pedestrian','path','steps','cycleway','bridleway']);
const round=value=>Number(value.toFixed(1));
const bilingual=(en,zh)=>({en,zh});
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const validGeo=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=85&&Math.abs(p.lng)<=180;
const sourceUrl=id=>/^(?:node|way|relation)\/\d+$/.test(id)?'https://www.openstreetmap.org/'+id:'https://www.openstreetmap.org/copyright';
const direction=angle=>{const i=Math.round(angle/45)%8;return {en:['north','northeast','east','southeast','south','southwest','west','northwest'][i],zh:['北','东北','东','东南','南','西南','西','西北'][i]};};

function projectToSegment(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
 const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den)):0;
 return {x:a.x+t*dx,z:a.z+t*dz};
}
function cross(a,b,c){return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}
function onSegment(p,a,b){return Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.z>=Math.min(a.z,b.z)-1e-7&&p.z<=Math.max(a.z,b.z)+1e-7;}
function intersects(a,b,c,d){
 const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
 return (x*y<0&&z*w<0)||onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);
}
function edges(points,closed){const pairs=[];for(let i=1;i<points.length;i++)pairs.push([points[i-1],points[i]]);if(closed&&points.length>2)pairs.push([points.at(-1),points[0]]);return pairs;}

/** Minimum planar distance, not a route length, road width or legal setback. */
export function footprintDistance(polygon,geometry,closed=false){
 if(!Array.isArray(polygon)||polygon.length<3||!polygon.every(validPoint)||!Array.isArray(geometry)||!geometry.length||!geometry.every(validPoint))return null;
 const a=edges(polygon,true),b=edges(geometry,closed);
 if(geometry.some(p=>inPolygon(p,polygon))||closed&&polygon.some(p=>inPolygon(p,geometry))||a.some(([p,q])=>b.some(([r,s])=>intersects(p,q,r,s))))return {distance:0,point:geometry[0]};
 let best={distance:Infinity,point:geometry[0]};
 const check=(p,q,point)=>{const d=Math.hypot(p.x-q.x,p.z-q.z);if(d<best.distance)best={distance:d,point};};
 for(const p of polygon)for(const [c,d]of b){const q=projectToSegment(p,c,d);check(p,q,q);}
 for(const q of geometry)for(const [c,d]of a){const p=projectToSegment(q,c,d);check(p,q,q);}
 return Number.isFinite(best.distance)?best:null;
}

export function modelSiteFootprint(placement={},model={}){
 const width=Number(model.width),depth=Number(model.depth),rotation=Number(placement.rotation)||0,a=rotation*Math.PI/180;
 if(!(width>0&&depth>0&&width<10000&&depth<10000))return null;
 const offset=model.offset||{},ox=Number(offset.x)||0,oz=Number(offset.z)||0;
 const position={x:(Number(placement.x)||0)+ox*Math.cos(a)-oz*Math.sin(a),z:(Number(placement.z)||0)+ox*Math.sin(a)+oz*Math.cos(a),rotation};
 return {center:{x:position.x,z:position.z},points:footprint(position,width,depth),width,depth,rotation,basis:model.basis||'model-envelope'};
}

function localFeature(feature,site,model){
 if(!feature||!KINDS.has(feature.kind)||!feature.geometry||!['Point','LineString','Polygon'].includes(feature.geometry.type))return null;
 const geometry=feature.geometry,raw=geometry.type==='Point'?[geometry.coordinates]:geometry.coordinates;
 if(!Array.isArray(raw)||!raw.length||raw.length>2500||!raw.every(p=>Array.isArray(p)&&p.length>=2&&validGeo({lng:p[0],lat:p[1]})))return null;
 if(geometry.type==='Polygon'&&raw.length<4||geometry.type==='LineString'&&raw.length<2)return null;
 const points=raw.map(p=>toLocal({lng:p[0],lat:p[1]},site)),measurement=footprintDistance(model.points,points,geometry.type==='Polygon');
 if(!measurement)return null;
 let featureSource=sourceUrl(feature.id);try{const url=new URL(feature.sourceUrl);if(url.protocol==='https:'&&['openstreetmap.org','www.openstreetmap.org'].includes(url.hostname))featureSource=url.href;}catch{}
 return {id:String(feature.id||''),kind:feature.kind,name:String(feature.name||feature.tags?.name||feature.tags?.highway||feature.tags?.building||feature.kind).slice(0,180),sourceUrl:featureSource,tags:feature.tags||{},points,closed:geometry.type==='Polygon',...measurement};
}

/** Recalculate after a move/rotation using the same observed OSM geometry. */
export function analyzeSiteContext({site,placement,model,parcel=[],data}={}){
 const limitations=bilingual('Approximate planar relationships to mapped OSM geometry, not surveyed clearances, connected access routes or code compliance. Missing mapped features do not prove absence; widths, boundaries and applicability require verification.','基于 OSM 图形的近似平面关系，不是实测净距、已连通通行路线或规范合规判断。地图未标注不代表现场不存在；道路宽度、边界及适用条件须核实。');
 const base={status:'unavailable',source:data?.source||'OpenStreetMap',center:site,radius:data?.radius||500,fetchedAt:data?.fetchedAt||null,dataTimestamp:data?.dataTimestamp||null,attribution:data?.attribution||'© OpenStreetMap contributors',licenceUrl:'https://www.openstreetmap.org/copyright',counts:{roads:0,buildings:0,green:0,water:0,pois:0,pedestrianWays:0},relations:[],limitations,warnings:[]};
 if(!validGeo(site)||!validGeo(data?.center)||!Array.isArray(data?.features))return base;
 if(Math.hypot(...Object.values(toLocal(data.center,site)))>2)return {...base,status:'stale',warnings:['The site changed; refresh surrounding data. / 场地已变更，请重新读取周边。']};
 const shape=modelSiteFootprint(placement,model);if(!shape)return base;
 const items=data.features.map(f=>localFeature(f,site,shape)).filter(Boolean),counts=base.counts;
 for(const f of items){counts[({road:'roads',building:'buildings',poi:'pois'})[f.kind]||f.kind]++;if(f.kind==='road'&&PEDESTRIAN.has(f.tags.highway))counts.pedestrianWays++;}
 const nearest=predicate=>items.filter(predicate).sort((a,b)=>a.distance-b.distance).slice(0,3);
 const roads=nearest(f=>f.kind==='road'&&!PEDESTRIAN.has(f.tags.highway));
 const buildings=nearest(f=>f.kind==='building'),green=nearest(f=>f.kind==='green'),water=nearest(f=>f.kind==='water'),walk=nearest(f=>f.kind==='road'&&PEDESTRIAN.has(f.tags.highway)),pois=nearest(f=>f.kind==='poi');
 const relations=[];
 const add=(id,feature,title,observation,recommendation,extra={})=>{if(feature)relations.push({id,kind:feature.kind,featureId:feature.id,name:feature.name,status:'review',distanceM:round(feature.distance),title,observation,recommendation,sourceUrl:feature.sourceUrl,...extra});};
 const road=roads[0];
 if(road){
  const projected=edges(road.points,road.closed).map(([a,b])=>projectToSegment(shape.center,a,b)).sort((a,b)=>Math.hypot(a.x-shape.center.x,a.z-shape.center.z)-Math.hypot(b.x-shape.center.x,b.z-shape.center.z))[0]||road.point;
  const dx=projected.x-shape.center.x,dz=projected.z-shape.center.z,bearing=road.distance>0?(Math.atan2(dx,-dz)*180/Math.PI+360)%360:null,front=(shape.rotation%360+360)%360,angle=bearing===null?null:Math.min(Math.abs(bearing-front),360-Math.abs(bearing-front)),side=bearing===null?null:direction(bearing),restricted=['no','private'].includes(road.tags.access)||['no','private'].includes(road.tags.vehicle);
  const alignment=side?`Toward ${side.en}; model front differs by about ${Math.round(angle)}°.`:'The road line crosses the footprint; entrance orientation is not assessed.';
  const alignmentZh=side?`位于${side.zh}侧；示意正面与该方向相差约 ${Math.round(angle)}°。`:'道路线与轮廓相交，暂不判断入口朝向。';
  add('CTX-road',road,bilingual('Road interface and orientation','道路界面与朝向'),bilingual(`${road.name}: approximately ${round(road.distance)} m from the model footprint to the mapped road centreline. ${alignment} ${restricted?'OSM records restricted access.':'Legal vehicle access is not confirmed.'}`,`${road.name}：模型轮廓至地图道路线约 ${round(road.distance)} 米。${alignmentZh}${restricted?'OSM 标有通行限制。':'合法车辆接入尚未确认。'}`),bilingual(road.distance===0?'The proposed footprint intersects the mapped road line. Recheck placement and the site boundary before defining an entrance.':'Review an entrance connection on this road side; verify kerbs, ownership, actual width, turning and continuous access before designating vehicle/fire access.',road.distance===0?'候选建筑轮廓与地图道路线相交，先核对选址和地块边界，再确定入口。':'可将此侧作为入口连接候选，核实路缘、权属、实测宽度、转弯及连续性后再确定车辆或消防接入。'),{bearingDeg:bearing===null?null:Math.round(bearing),frontAngleDeg:angle===null?null:Math.round(angle),roadClass:road.tags.highway||'unknown',access:road.tags.access||'not tagged',width:road.tags.width||'not tagged',overlap:road.distance===0});
 }
 const neighbour=buildings[0];
 add('CTX-building',neighbour,bilingual('Neighbouring building relationship','周边建筑关系'),neighbour&&bilingual(neighbour.distance===0?`${neighbour.name}: the candidate model footprint intersects a mapped building polygon.`:`${neighbour.name}: approximately ${round(neighbour.distance)} m between mapped/model footprint edges.`,neighbour.distance===0?`${neighbour.name}：候选模型轮廓与已标注建筑面相交。`:`${neighbour.name}：地图建筑与模型轮廓边缘近似相距 ${round(neighbour.distance)} 米。`),bilingual('Confirm the existing-building identity and proposed site. Review separation, daylight and fire-access conditions using surveyed boundaries and applicable clauses; this map distance is not a prescribed setback.','先确认既有建筑身份和候选地块，再依据测绘边界及适用条款核对间距、采光和消防接入；地图距离不是法定退界。'),{overlap:neighbour?.distance===0,nearby:buildings.map(f=>({id:f.id,name:f.name,distanceM:round(f.distance)}))});
 const greenSpace=green[0];
 add('CTX-green',greenSpace,bilingual('Green and open-space interface','绿地与开放空间界面'),greenSpace&&bilingual(`${greenSpace.name}: mapped green/open-space edge about ${round(greenSpace.distance)} m away.`,`${greenSpace.name}：地图绿地或开放空间边缘约距 ${round(greenSpace.distance)} 米。`),bilingual('Explore pedestrian and visual connections while checking public access, trees and conservation constraints; mapped greenery is not a verified planted-area calculation.','可研究步行和视线联系，同时确认开放权限、树木及保育限制；地图绿地不等于已核实的种植面积。'));
 const waterBody=water[0];
 add('CTX-water',waterBody,bilingual('Water-edge relationship','水体边界关系'),waterBody&&bilingual(`${waterBody.name}: mapped water edge/line about ${round(waterBody.distance)} m away.`,`${waterBody.name}：地图水体边界或水线约距 ${round(waterBody.distance)} 米。`),bilingual('Review drainage connections, water-edge access and any applicable buffer with the relevant source data. OSM does not establish flood levels or a mandatory buffer.','结合相应资料复核排水联系、水边通行及适用缓冲要求；OSM 不能给出洪水标高或法定缓冲值。'));
 const path=walk[0];
 add('CTX-walk',path,bilingual('Pedestrian connection candidate','步行连接候选'),path&&bilingual(`${path.name}: mapped ${path.tags.highway} about ${round(path.distance)} m from the footprint.`,`${path.name}：地图步行要素（${path.tags.highway}）约距建筑轮廓 ${round(path.distance)} 米。`),bilingual('Check whether a continuous, permitted and accessible path can connect to the entrance. Straight-line proximity does not establish connectivity or accessible gradient.','核对入口是否能通过连续、允许通行且无障碍的路径连接；直线接近不能证明连通性或无障碍坡度满足。'));
 const poi=pois[0];
 add('CTX-poi',poi,bilingual('Nearby facility','周边设施'),poi&&bilingual(`${poi.name}: mapped facility about ${round(poi.distance)} m from the footprint.`,`${poi.name}：地图设施约距建筑轮廓 ${round(poi.distance)} 米。`),bilingual('Review the relationship to the entrance and actual walking route; opening hours, service status and walking distance are not verified.','结合入口及实际步行路线研究联系；开放时间、服务状态和步行距离尚未核实。'));
 const localParcel=parcel.length>=3?parcel.map(p=>toLocal(p,site)):[];
 return {...base,status:'ready',counts,relations,model:{basis:shape.basis,width:shape.width,depth:shape.depth,placement:{x:Number(placement?.x)||0,z:Number(placement?.z)||0,rotation:shape.rotation},footprint:shape.points.map(p=>toGeo(p,site)),withinUserParcel:localParcel.length>=3?polygonContainsPolygon(shape.points,localParcel):null},warnings:[...(data.warnings||[]).slice(0,4),...(data.complete===false?['Response limited; additional nearby features may be missing. / 响应受限，可能遗漏其他周边要素。']:[])]};
}

export function compactSiteContext(analysis){
 if(!analysis)return null;
 return {status:analysis.status,source:analysis.source,center:analysis.center,radius:analysis.radius,fetchedAt:analysis.fetchedAt,dataTimestamp:analysis.dataTimestamp,attribution:analysis.attribution,licenceUrl:analysis.licenceUrl,counts:analysis.counts,model:analysis.model?{basis:analysis.model.basis,width:analysis.model.width,depth:analysis.model.depth,placement:analysis.model.placement,withinUserParcel:analysis.model.withinUserParcel}:null,relations:analysis.relations.slice(0,8).map(({nearby,...r})=>r),limitations:analysis.limitations,warnings:analysis.warnings.slice(0,4)};
}

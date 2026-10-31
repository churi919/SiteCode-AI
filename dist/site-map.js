import './vendor/leaflet/leaflet.js';
import {footprint,toGeo} from './parcel.js';

const L=globalThis.L;
const DEFAULT_ZOOM=18;
const TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const latitude=value=>Math.max(-85,Math.min(85,Number(value)));
const longitude=value=>((Number(value)+180)%360+360)%360-180;
const point=value=>({lat:latitude(value.lat),lng:longitude(value.lng)});
const pair=value=>[value.lat,value.lng];
const validPoint=value=>value&&Number.isFinite(Number(value.lat))&&Number.isFinite(Number(value.lng));
const samePoint=(a,b)=>a&&b&&Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lng-b.lng)<1e-7;

/** A freely navigable map. Viewport navigation never changes the site anchor. */
export function createSiteMap({container,onPick,onSearchSelect}){
 if(!L)throw new Error('The local map library could not load. / 本地地图组件未能加载。');
 const element=typeof container==='string'?document.querySelector(container):container;
 if(!element)throw new Error('Map container missing / 地图容器不存在');
 const map=L.map(element,{center:[1.2996,103.7875],zoom:DEFAULT_ZOOM,minZoom:2,maxZoom:20,worldCopyJump:true,scrollWheelZoom:true,zoomControl:true,attributionControl:true});
 element.setAttribute('aria-label','Interactive site map. Arrow keys pan, plus and minus zoom. / 自由选址地图，方向键平移，加减键缩放。');
 const tiles=L.tileLayer(TILE_URL,{maxNativeZoom:19,maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map);
 L.control.scale({imperial:false,position:'bottomleft',maxWidth:110}).addTo(map);
 const shapes=L.layerGroup().addTo(map);
 const host=element.closest('#siteDialog')||document;
 const searchInput=host.querySelector('#siteSearchInput'),searchButton=host.querySelector('#siteSearchBtn'),searchResults=host.querySelector('#siteSearchResults');
 const status=host.querySelector('#siteMapStatus'),pickCenter=host.querySelector('#siteMapPickCenter'),recenter=host.querySelector('#siteMapRecenter');
 let state={site:{lat:1.2996,lng:103.7875},parcel:[],placement:{x:0,z:0,rotation:0},dimensions:{x:38,z:26},mode:'site'},openedSite=null,hasOpened=false,controller=null,destroyed=false,searchVersion=0;
 const announce=(message,error=false)=>{if(status){status.textContent=message;status.classList.toggle('error',error);}};
 const ready=()=>announce('Drag to explore · scroll or +/− to zoom · click to select. / 拖拽浏览，滚轮或加减缩放，点击选择。');
 tiles.on('tileerror',()=>announce('Some map tiles could not load. You can retry by moving the map, or enter coordinates below. / 部分地图瓦片未加载；可移动地图重试，或在下方输入坐标。',true));
 tiles.on('tileload',ready);
 function draw(){
  shapes.clearLayers();
  if(!validPoint(state.site))return;
  const anchor=point(state.site),position={x:0,z:0,rotation:0,...state.placement},dimensions={x:38,z:26,...state.dimensions};
  const offset=dimensions.offset||{},a=position.rotation*Math.PI/180,ox=Number(offset.x)||0,oz=Number(offset.z)||0;
  position.x+=ox*Math.cos(a)-oz*Math.sin(a);position.z+=ox*Math.sin(a)+oz*Math.cos(a);
  const parcel=(state.parcel||[]).filter(validPoint).map(p=>pair(point(p)));
  if(parcel.length>1){const fn=parcel.length>=3?L.polygon:L.polyline;fn(parcel,{color:'#d0783c',weight:2,dashArray:'6 5',fillColor:'#d0783c',fillOpacity:.07,interactive:false}).addTo(shapes);}
  parcel.forEach((p,index)=>{L.circleMarker(p,{radius:4,color:'#b65f2e',weight:2,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(shapes);if(state.mode==='plot')L.tooltip({permanent:true,direction:'top',className:'site-map-vertex-label',offset:[0,-5]}).setLatLng(p).setContent(String(index+1)).addTo(shapes);});
  const building=footprint(position,dimensions.x,dimensions.z).map(p=>pair(toGeo(p,anchor)));
  L.polygon(building,{color:'#fff',weight:2,fillColor:'#286c63',fillOpacity:.72,interactive:false}).addTo(shapes);
  const center=toGeo(position,anchor),angle=position.rotation*Math.PI/180,length=Math.max(12,Math.min(30,dimensions.z*.5));
  const front=toGeo({x:position.x+Math.sin(angle)*length,z:position.z-Math.cos(angle)*length},anchor);
  L.polyline([pair(center),pair(front)],{color:'#fff',weight:3,interactive:false}).addTo(shapes);
  L.circleMarker(pair(front),{radius:3,color:'#fff',weight:1,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(shapes);
  L.circleMarker(pair(anchor),{radius:6,color:'#fff',weight:2,fillColor:'#171717',fillOpacity:1,interactive:false}).addTo(shapes);
  element.dataset.mode=state.mode;
 }
 function setState(next={}){state={...state,...next};draw();}
 function setView(location,zoom){if(!validPoint(location))return;map.setView(pair(point(location)),Number.isFinite(zoom)?zoom:map.getZoom(),{animate:false});}
 function invalidateSize(){if(!destroyed)map.invalidateSize({animate:false,pan:false});}
 function open(next={}){
  setState(next);invalidateSize();
  if(!hasOpened){setView(state.site,DEFAULT_ZOOM);hasOpened=true;}
  else if(!samePoint(openedSite,state.site))setView(state.site);
  openedSite=point(state.site);
  // A dialog has no dimensions until it opens; one frame also covers showModal().
  requestAnimationFrame(invalidateSize);
 }
 const choose=(location)=>{if(validPoint(location)&&typeof onPick==='function')onPick(point(location),state.mode);};
 map.on('click',event=>choose(event.latlng));
 const chooseCenter=()=>choose(map.getCenter());
 const centerOnSite=()=>setView(state.site);
 pickCenter?.addEventListener('click',chooseCenter);
 recenter?.addEventListener('click',centerOnSite);
 function selectResult(result){
  const location={...result,...point(result)};
  onSearchSelect?.(location);
  const bbox=result.bbox;
  if(Array.isArray(bbox)&&bbox.length===4&&bbox.every(Number.isFinite)&&bbox[0]<bbox[2]&&bbox[1]<bbox[3]&&Math.abs(bbox[0])<=180&&Math.abs(bbox[2])<=180&&Math.abs(bbox[1])<=85&&Math.abs(bbox[3])<=85){map.fitBounds([[bbox[1],bbox[0]],[bbox[3],bbox[2]]],{padding:[30,30],maxZoom:DEFAULT_ZOOM,animate:false});}
  else setView(location,Math.max(16,map.getZoom()));
  if(searchInput)searchInput.value=result.name||'';
  searchResults?.replaceChildren();
  announce('Place found. Click to set the site, or continue drawing and positioning. / 已定位地点；可点选场地，继续绘制地块与放置建筑。');
 }
 async function search(){
  const query=searchInput?.value.trim();
  if(!query||query.length<2){announce('Enter at least two characters for a place or address. / 请输入至少两个字符的地名或地址。',true);searchInput?.focus();return;}
  const version=++searchVersion;controller?.abort();controller=new AbortController();
  if(searchButton)searchButton.disabled=true;
  searchResults?.replaceChildren();announce('Finding places… / 正在查找地点…');
  try{
   const response=await fetch('/api/geocode?q='+encodeURIComponent(query),{signal:controller.signal});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error?.zh||data.error?.en||'Place search unavailable / 地点搜索暂不可用');
   if(version!==searchVersion||destroyed)return;
   const results=Array.isArray(data.results)?data.results.filter(validPoint).slice(0,6):[];
   if(!results.length){announce('No matching place found. Try a fuller address or enter coordinates. / 未找到匹配地点，请尝试更完整的地址或输入坐标。',true);return;}
   if(searchResults){for(const result of results){const button=document.createElement('button');button.type='button';button.className='site-search-result';const name=document.createElement('span');name.textContent=result.name||`${Number(result.lat).toFixed(5)}, ${Number(result.lng).toFixed(5)}`;const source=document.createElement('small');source.textContent=`${Number(result.lat).toFixed(5)}, ${Number(result.lng).toFixed(5)}${data.source?' · '+(typeof data.source==='string'?data.source:data.source.name||'OpenStreetMap'):''}`;button.append(name,source);button.addEventListener('click',()=>selectResult(result));searchResults.append(button);}}
   announce(`${results.length} places found. Choose a result. / 找到 ${results.length} 个地点，请选择。`);
  }catch(error){if(version!==searchVersion||destroyed||error.name==='AbortError')return;announce(error.message+' · You can also pan the map or enter coordinates. / 也可直接拖动地图或输入坐标。',true);}
  finally{if(version===searchVersion&&!destroyed&&searchButton)searchButton.disabled=false;}
 }
 const searchKey=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();search();}};
 searchButton?.addEventListener('click',search);searchInput?.addEventListener('keydown',searchKey);
 function destroy(){destroyed=true;controller?.abort();searchButton?.removeEventListener('click',search);searchInput?.removeEventListener('keydown',searchKey);pickCenter?.removeEventListener('click',chooseCenter);recenter?.removeEventListener('click',centerOnSite);map.remove();}
 ready();draw();
 return {open,setState,setView,invalidateSize,destroy};
}

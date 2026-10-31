import {createSiteMap} from './site-map.js';
import {toLocal,toGeo,inPolygon,isSimplePolygon} from './parcel.js';
import {analyzeSiteContext,compactSiteContext} from './site-analysis.js';
import {renderSiteContext,renderSiteContextSummary} from './site-context-ui.js';

const $=selector=>document.querySelector(selector);
const valid=point=>point&&Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&Math.abs(point.lat)<=85&&Math.abs(point.lng)<=180;
const same=(a,b)=>a&&b&&Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lng-b.lng)<1e-7;
const copyPoints=points=>points.map(p=>({...p}));
async function requestJSON(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw Error([data.error?.zh,data.error?.en].filter(Boolean).join(' / ')||'Request failed');return data;}

/** Own the map draft and source freshness separately from model placement. */
export function createSiteController({getState,getViewer,applyState,showInfo,notify}){
 let map=null,draft=null,mode='site',data=null,analysis=null,inFlight=null,requestVersion=0,fetchController=null;
 const dialog=$('#siteDialog'),contextButton=$('#contextBtn'),summary=$('#contextResult');
 function plotAt(anchor){const dimensions=getState().dimensions;return [[-dimensions.x/2-15,-dimensions.z/2-15],[dimensions.x/2+15,-dimensions.z/2-15],[dimensions.x/2+15,dimensions.z/2+15],[-dimensions.x/2-15,dimensions.z/2+15]].map(([x,z])=>toGeo({x,z},anchor));}
 function mapState(){const model=getState().model;return {site:draft.site,parcel:draft.parcel,placement:draft.placement,dimensions:{x:model.width,z:model.depth,offset:model.offset},mode};}
 function drawDraft(){
  if(!draft)return;
  const points=draft.parcel.map(p=>toLocal(p,draft.site));
  const area=points.length<3?0:Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0))/2;
  $('#parcelStats').textContent=`${draft.parcel.length} corners / 个角点 · ${Math.round(area).toLocaleString()} m²`;
  $('#siteRotation').value=draft.placement.rotation;$('#siteRotationOut').textContent=draft.placement.rotation+'°';
  map?.setState(mapState());
 }
 function coordinateFields(){if(!draft)return;$('#latitude').value=draft.site.lat.toFixed(6);$('#longitude').value=draft.site.lng.toFixed(6);$('#siteNameInput').value=draft.site.name||'';drawDraft();}
 function setMode(next){mode=next;document.querySelectorAll('[data-map-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mapMode===mode));$('#parcelHelp').textContent=mode==='plot'?'Click 3+ corners. Change mode when finished. / 点击至少3个角点，完成后切换模式。':mode==='building'?'Click inside your parcel to position the model. / 点击地块内部放置模型。':'Drag and zoom anywhere; click to select the site. / 自由拖拽缩放，点击地图选择场地。';drawDraft();}
 function chooseSite(point,{name='Custom site / 自选场地',moveView=false}={}){if(!valid(point))return;draft.site={lat:point.lat,lng:point.lng,name:String(name).slice(0,150)};draft.parcel=plotAt(draft.site);draft.placement={x:0,z:0,rotation:0};coordinateFields();if(moveView)map?.setView(draft.site);}
 function pick(point,pickedMode){
  if(!draft||!valid(point))return;
  if(pickedMode==='plot'){if(draft.parcel.length>=12){notify('地块最多12个角点 / Up to 12 parcel corners');return;}draft.parcel.push(point);drawDraft();}
  else if(pickedMode==='building'){const local=toLocal(point,draft.site);if(draft.parcel.length>=3&&!inPolygon(local,draft.parcel.map(p=>toLocal(p,draft.site)))){notify('请在圈选地块内放置模型 / Select a point inside the parcel');return;}const offset=getState().model.offset||{},angle=draft.placement.rotation*Math.PI/180,ox=offset.x||0,oz=offset.z||0;draft.placement={...draft.placement,x:local.x-ox*Math.cos(angle)+oz*Math.sin(angle),z:local.z-ox*Math.sin(angle)-oz*Math.cos(angle)};drawDraft();}
  else chooseSite(point);
 }
 function open(){
  const state=getState();draft={site:{...state.site},parcel:copyPoints(state.parcel),placement:{...state.placement}};
  dialog.showModal();
  if(!map)map=createSiteMap({container:$('#siteMapCanvas'),onPick:pick,onSearchSelect:place=>{chooseSite(place,{name:place.name});setMode('site');}});
  setMode('site');coordinateFields();map.open(mapState());
 }
 $('#siteBtn').onclick=open;$('#editSite').onclick=open;
 document.querySelectorAll('[data-lat]').forEach(button=>button.onclick=()=>chooseSite({lat:Number(button.dataset.lat),lng:Number(button.dataset.lng)},{name:button.dataset.name,moveView:true}));
 document.querySelectorAll('[data-map-mode]').forEach(button=>button.onclick=()=>{if(button.dataset.mapMode==='plot'&&mode!=='plot')draft.parcel=[];setMode(button.dataset.mapMode);});
 $('#clearParcel').onclick=()=>{draft.parcel=plotAt(draft.site);setMode('building');};
 $('#siteRotation').oninput=event=>{draft.placement.rotation=Number(event.target.value);drawDraft();};
 document.querySelectorAll('[data-bearing]').forEach(button=>button.onclick=()=>{draft.placement.rotation=Number(button.dataset.bearing);drawDraft();});
 for(const id of ['latitude','longitude'])$('#'+id).addEventListener('change',()=>{
  if(!draft)return;const point={lat:Number($('#latitude').value),lng:Number($('#longitude').value)};if(!valid(point))return;
  draft.parcel=draft.parcel.map(p=>toGeo(toLocal(p,draft.site),point));draft.site={...draft.site,...point};drawDraft();map?.setView(point);
 });
 $('#siteForm').onsubmit=event=>{
  event.preventDefault();const entered={lat:Number($('#latitude').value),lng:Number($('#longitude').value)};
  if(!valid(entered)){notify('请输入有效经纬度 / Enter valid latitude and longitude');return;}
  if(!same(entered,draft.site)){draft.parcel=draft.parcel.map(p=>toGeo(toLocal(p,draft.site),entered));draft.site={...draft.site,...entered};}
  if(!isSimplePolygon(draft.parcel.map(p=>toLocal(p,draft.site)))){notify('请圈选至少3个角点且边界不得交叉 / Draw a simple parcel with at least 3 corners');return;}
  clearContext();
  applyState({site:{...draft.site,name:$('#siteNameInput').value.trim().slice(0,150)||'Custom site / 自选场地'},parcel:copyPoints(draft.parcel),placement:{...draft.placement}});
  dialog.close();notify('场地、地块与朝向已更新，正在读取周边 / Site updated; reading surroundings');
  ensureContext({silent:true});
 };
 function refreshSummary(){
  renderSiteContextSummary(summary,analysis,{onOpen:showContext,onRefresh:()=>ensureContext({force:true}).then(showContext)});
  contextButton.innerHTML='<span>Analyse surroundings<small>分析真实周边关系</small></span><span>↗</span>';
  const credit=$('#osmSceneCredit');if(credit){credit.hidden=analysis?.status!=='ready';credit.textContent=analysis?.status==='ready'?analysis.attribution:'';credit.href='https://www.openstreetmap.org/copyright';}
 }
 function update(){
  analysis=analyzeSiteContext({...getState(),data});refreshSummary();return analysis;
 }
 function clearContext(){requestVersion++;fetchController?.abort();inFlight=null;data=null;analysis=null;getViewer()?.clearSiteContext?.();refreshSummary();}
 function focusFeature(id,snapshot){
  if(snapshot&&(!same(snapshot.center,getState().site)||snapshot.fetchedAt!==data?.fetchedAt)||!data?.features.some(f=>f.id===id)){notify('场地或数据已变化，请刷新周边分析 / Refresh the changed site context');return {located:false};}
  const result=getViewer()?.focusSiteFeature?.(id);if(!result?.located){notify('未找到对应的地图要素 / Mapped feature unavailable');return result;}
  if($('#infoDialog').open)$('#infoDialog').close();$('#chatPanel').hidden=true;$('#chatLauncher').setAttribute('aria-expanded','false');$('#sceneWrap').scrollIntoView({behavior:'smooth',block:'center'});return result;
 }
 function orient(bearing){if(!Number.isFinite(bearing))return;const rotation=bearing>180?bearing-360:bearing;const state=getState();applyState({site:state.site,parcel:state.parcel,placement:{...state.placement,rotation}});notify('已调整示意朝向；请核实实际入口 / Model front adjusted; verify the entrance');showContext();}
 function showContext(){
  update();showInfo('Surrounding relationships / 建筑与周边关系','<div id="siteContextDetails"></div>','OSM → SPATIAL RELATIONSHIPS · 周边关系分析');
  renderSiteContext($('#siteContextDetails'),analysis,{onLocate:id=>focusFeature(id),onOrient:orient,onRefresh:()=>ensureContext({force:true}).then(showContext),onAsk:question=>{$('#infoDialog').close();if($('#chatPanel').hidden)$('#chatLauncher').click();$('#chatInput').value=question;$('#chatInput').focus();}});
 }
 async function ensureContext({force=false,silent=false}={}){
  const current={...getState().site};
  if(!force&&data&&same(data.center,current)&&Date.now()-Date.parse(data.fetchedAt)<600000)return update();
  if(!force&&inFlight&&same(inFlight.site,current))return inFlight.promise;
  fetchController?.abort();fetchController=new AbortController();const version=++requestVersion;
  summary.replaceChildren();const loading=document.createElement('span');loading.className='site-context-loading';loading.textContent='Reading OSM roads, buildings and open spaces… / 正在读取 OSM 道路、建筑与开放空间…';summary.append(loading);contextButton.disabled=true;
  const promise=(async()=>{try{
   const response=await requestJSON('/api/osm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:current.lat,lng:current.lng,radius:500}),signal:fetchController.signal});
   if(version!==requestVersion||!same(current,getState().site))return analysis;
   data=response;getViewer()?.setSiteContext?.(data);update();return analysis;
  }catch(error){
   if(version!==requestVersion)return analysis;
   if(!same(data?.center,current)){data=null;getViewer()?.clearSiteContext?.();}
   else data={...data,warnings:[...(data.warnings||[]),'Refresh failed; showing the last retrieved geometry and timestamp. / 刷新失败，当前显示上次读取的图形与时间。']};
   update();if(!silent)notify(error.message);return analysis;
  }finally{if(version===requestVersion){contextButton.disabled=false;inFlight=null;}}})();
  inFlight={site:current,promise};return promise;
 }
 contextButton.onclick=()=>ensureContext().then(showContext);
 update();
 return {open,ensureContext,showContext,update,clearContext,focusFeature,compactContext:()=>compactSiteContext(analyzeSiteContext({...getState(),data})),get analysis(){return analysis;},get data(){return data;}};
}

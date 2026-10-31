const FEATURE_ID=/^(?:(?:node|way|relation)\/\d+|mvt\/\d+\/\d+\/\d+\/[a-z_]+\/[\w.-]+\/\d+)$/i;
const RELATION_ID=/^CTX-[a-z0-9-]+$/i;
const KINDS=new Set(['road','building','green','water','poi']);
const KIND_LABELS={road:{en:'Roads and paths',zh:'道路与路径'},building:{en:'Buildings',zh:'建筑'},green:{en:'Green / open space',zh:'绿地与开放空间'},water:{en:'Water',zh:'水体'},poi:{en:'Facilities',zh:'设施'}};
const ASK_TOPICS={road:'周边道路、入口连接与建筑朝向',building:'周边建筑与当前方案的空间关系',green:'附近绿地和开放空间的连接机会',water:'周边水体与排水、水边通行的关系',poi:'周边设施与入口、步行路线的关系'};
const fallbackLimit={en:'OSM gives approximate mapped relationships. It does not establish surveyed clearance, legal access, flood level or code compliance. Missing mapped features do not prove absence.',zh:'OSM 提供近似地图关系，不能证明实测净距、合法通行、洪水标高或规范合规。地图未标注不代表现场不存在。'};
const text=(value,lang='zh')=>typeof value==='string'?value:typeof value?.[lang]==='string'?value[lang]:typeof value?.en==='string'?value.en:'';
const clipped=(value,max=1200)=>String(value??'').slice(0,max);
const el=(tag,className,value)=>{const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const count=value=>finite(value)&&value>=0?String(Math.floor(value)):'—';
const distance=value=>finite(value)&&value>=0?'≈ '+new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(value)+' m':'Not measured / 未计算';
function time(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'UTC',timeZoneName:'short'}).format(date):'Not fetched / 尚未读取';}
function osmLink(value){try{const url=new URL(String(value||''));return url.protocol==='https:'&&(url.hostname==='openstreetmap.org'||url.hostname==='www.openstreetmap.org')?url.href:null;}catch{return null;}}
function button(label,action,className='site-context-button'){const node=el('button',className,label);node.type='button';node.addEventListener('click',action);return node;}
function paired(parent,value,className='site-context-paired'){const p=el('p',className),zh=text(value,'zh'),en=text(value,'en');if(zh)p.append(el('span','',clipped(zh)));if(en&&en!==zh)p.append(el('small','',clipped(en)));parent.append(p);return p;}
function statusOf(analysis){return ['ready','stale','loading','unavailable'].includes(analysis?.status)?analysis.status:'unavailable';}
function setSourceState(container,analysis){container.dataset.contextStatus=statusOf(analysis);container.dataset.contextSource='OpenStreetMap';if(analysis?.fetchedAt)container.dataset.contextFetchedAt=String(analysis.fetchedAt);else delete container.dataset.contextFetchedAt;}
function knownRelations(analysis,max=6){return (Array.isArray(analysis?.relations)?analysis.relations:[]).filter(r=>r&&typeof r==='object'&&KINDS.has(r.kind)&&RELATION_ID.test(r.id||'')).slice(0,max);}
function statusMessage(status){return status==='stale'?{zh:'场地已改变，请重新读取周边数据。旧位置的关系不会用于当前分析。',en:'The site changed. Refresh surroundings before using relationships at this location.'}:status==='loading'?{zh:'正在读取真实周边数据…',en:'Reading mapped surroundings…'}:{zh:'暂未读取到当前场地的 OSM 数据，可点击重新读取。',en:'OSM data is not available for the current site. Try reading the surroundings again.'};}
function sourceFooter(parent,analysis){
 const footer=el('footer','site-context-source'),copyright=el('a','',clipped(analysis?.attribution||'© OpenStreetMap contributors',200));copyright.href=osmLink(analysis?.licenceUrl)||'https://www.openstreetmap.org/copyright';copyright.target='_blank';copyright.rel='noopener noreferrer';footer.append(copyright);
 paired(footer,analysis?.limitations||fallbackLimit,'site-context-limitations');parent.append(footer);
}
function refreshButton(parent,onRefresh,label='重新读取 / Refresh'){if(typeof onRefresh==='function')parent.append(button(label,onRefresh,'site-context-button secondary'));}

/** Source-based observations are separate from the model's code findings. */
export function renderSiteContext(container,analysis,actions={}){
 if(!container)return 0;setSourceState(container,analysis);container.replaceChildren();
 const status=statusOf(analysis),panel=el('section','site-context');panel.dataset.contextStatus=status;panel.setAttribute('aria-label','周边关系分析 / Surrounding relationships');panel.setAttribute('aria-busy',String(status==='loading'));
 const heading=el('div','site-context-heading'),title=el('div','');title.append(el('span','site-context-kicker','OSM · SITE RELATIONSHIPS'),el('h3','','周边关系分析'));
 title.append(el('small','','Mapped surroundings and design relationships'));heading.append(title);refreshButton(heading,actions.onRefresh);panel.append(heading);
 if(status!=='ready'){
  paired(panel,statusMessage(status),'site-context-state');sourceFooter(panel,analysis);container.append(panel);return 0;
 }
 const provenance=el('div','site-context-provenance');provenance.append(el('span','','来源 / Source: '+clipped(analysis?.source||'OpenStreetMap',120)),el('span','','读取 / Fetched: '+time(analysis?.fetchedAt)));
 if(analysis?.dataTimestamp)provenance.append(el('span','','地图数据时间 / Snapshot: '+time(analysis.dataTimestamp)));panel.append(provenance);
 panel.append(el('p','site-context-radius',(finite(analysis?.radius)?String(Math.round(analysis.radius))+' m · ':'')+'地图标注范围 / Mapped context area'));
 const counts=analysis?.counts||{},metrics=el('div','site-context-counts');for(const [key,label]of [['roads','道路段 / Road segments'],['buildings','建筑轮廓 / Footprints'],['green','绿地 / Green'],['water','水体 / Water'],['pois','设施 / Facilities']]){const metric=el('div','site-context-count');metric.append(el('strong','',count(counts[key])),el('span','',label));metrics.append(metric);}panel.append(metrics);
 const warnings=(Array.isArray(analysis?.warnings)?analysis.warnings:[]).filter(Boolean).slice(0,3);if(warnings.length){const note=el('div','site-context-warnings');for(const warning of warnings)paired(note,warning);panel.append(note);}
 const relations=knownRelations(analysis),cards=el('div','site-context-cards');
 if(!relations.length)paired(cards,{zh:'本次范围内没有可用于关系计算的地图要素。地图未标注不代表现场不存在，可扩大范围或补充现场资料。',en:'No mapped features in this response support a relationship calculation. Missing data does not prove absence; review a wider area or add site evidence.'},'site-context-empty');
 for(const relation of relations){
  const card=el('article','site-context-card');card.dataset.contextId=relation.id;card.dataset.featureId=String(relation.featureId||'');
  const top=el('div','site-context-card-top'),label=el('div','');label.append(el('h4','',clipped(text(relation.title,'zh')||KIND_LABELS[relation.kind].zh,180)),el('small','',clipped(text(relation.title,'en')||KIND_LABELS[relation.kind].en,180)));top.append(label,el('span','site-context-distance',distance(relation.distanceM)));card.append(top);
  if(relation.name)card.append(el('div','site-context-feature-name',clipped(relation.name,220)));
  paired(card,relation.observation,'site-context-observation');const recommendation=el('div','site-context-recommendation');recommendation.append(el('span','site-context-action-label','设计建议 / Design action'));paired(recommendation,relation.recommendation);card.append(recommendation);
  const controls=el('div','site-context-actions');
  if(FEATURE_ID.test(relation.featureId||'')&&typeof actions.onLocate==='function'){const locate=button('定位周边要素 / Locate ↗',()=>actions.onLocate(relation.featureId));locate.dataset.featureId=relation.featureId;locate.dataset.contextId=relation.id;controls.append(locate);}
  if(relation.kind==='road'&&relation.distanceM>0&&finite(relation.bearingDeg)&&typeof actions.onOrient==='function'){const orient=button('朝向道路（示意）/ Face road',()=>actions.onOrient(relation.bearingDeg),'site-context-button secondary');orient.title='仅调整模型示意朝向，通行条件仍需核实。 / Changes model orientation only; access still needs verification.';controls.append(orient);}
  if(typeof actions.onAsk==='function')controls.append(button('询问 AI / Ask AI',()=>actions.onAsk('请结合当前模型和已读取的 OSM 周边信息，分析'+ASK_TOPICS[relation.kind]+'，给出具体设计建议，并区分地图观察与仍需补充的规范依据。'),'site-context-button secondary'));
  const href=osmLink(relation.sourceUrl);if(href){const source=el('a','site-context-map-source','地图来源 / Source ↗');source.href=href;source.target='_blank';source.rel='noopener noreferrer';controls.append(source);}card.append(controls);cards.append(card);
 }
 panel.append(cards);sourceFooter(panel,analysis);container.append(panel);return relations.length;
}

/** A compact, honest summary for the left project panel. */
export function renderSiteContextSummary(container,analysis,actions={}){
 if(!container)return;setSourceState(container,analysis);container.classList.add('has-site-context-summary');container.replaceChildren();
 const status=statusOf(analysis),summary=el('section','site-context-summary');summary.dataset.contextStatus=status;summary.setAttribute('aria-live','polite');summary.setAttribute('aria-busy',String(status==='loading'));
 const title=el('div','site-context-summary-title');title.append(el('span','site-context-dot '+(status==='ready'?'ready':'')),el('strong','','OSM 周边关系 / Surroundings'));summary.append(title);
 if(status!=='ready'){
  paired(summary,statusMessage(status),'site-context-summary-message');refreshButton(summary,actions.onRefresh,status==='stale'?'更新周边 / Refresh':'读取周边 / Read surroundings');container.append(summary);return;
 }
 const counts=analysis.counts||{},meta=el('p','site-context-summary-meta');meta.textContent=`${count(counts.roads)} 道路段 · ${count(counts.buildings)} 建筑轮廓 · ${count(counts.green)} 绿地`;summary.append(meta);
 const relations=knownRelations(analysis),nearest=[relations.find(r=>r.id==='CTX-road'),relations.find(r=>r.kind==='building')].filter(Boolean);
 const distances=el('div','site-context-summary-distances');for(const relation of nearest){const row=el('div','');row.append(el('span','',relation.id==='CTX-road'?'道路 / Road':'建筑 / Building'),el('strong','',distance(relation.distanceM)));distances.append(row);}summary.append(distances);
 if(!nearest.length)summary.append(el('p','site-context-summary-message','未标注可计算的道路或建筑；不代表现场没有。 / No mapped road/building relationship; absence is not established.'));
 summary.append(el('small','site-context-summary-time',(finite(analysis.radius)?Math.round(analysis.radius)+' m · ':'')+time(analysis.fetchedAt)));
 const controls=el('div','site-context-summary-actions');if(typeof actions.onOpen==='function')controls.append(button('查看周边分析 / Open analysis ↗',actions.onOpen));refreshButton(controls,actions.onRefresh);summary.append(controls);container.append(summary);
}

/** Only actual relations from this request can generate a map-location action. */
export function appendSiteChatActions(container,surroundings,onLocate){
 if(!container||statusOf(surroundings)!=='ready'||typeof onLocate!=='function')return 0;
 const seen=new Set(),relations=knownRelations(surroundings,8).filter(r=>{if(!FEATURE_ID.test(r.featureId||'')||seen.has(r.featureId))return false;seen.add(r.featureId);return true;}).slice(0,4);
 if(!relations.length)return 0;
 const region=el('section','site-chat-actions');region.setAttribute('aria-label','本次 OSM 关系定位 / Locate mapped surroundings');region.dataset.contextStatus='ready';region.append(el('div','site-chat-actions-heading','本次 OSM 关系定位 / Locate mapped surroundings'));
 for(const relation of relations){const locate=button('',()=>onLocate(relation.featureId),'site-chat-action');locate.dataset.contextId=relation.id;locate.dataset.featureId=relation.featureId;locate.append(el('span','',clipped(text(relation.title,'zh')||KIND_LABELS[relation.kind].zh,180)),el('small','',clipped(relation.name||text(relation.title,'en'),180)+' · '+distance(relation.distanceM)),el('b','','↗'));region.append(locate);}
 region.append(el('p','site-chat-action-note','地图关系观察，需核实现场条件。 / Mapped relationships; site conditions need verification.'));container.append(region);return relations.length;
}

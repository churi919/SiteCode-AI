import {loadLocalCodes,searchLocalCodes} from './local-search.js';
const TOPICS=[
 {id:'accessibility',match:/无障碍|轮椅|坡道|扶手|盲道|accessib|wheelchair|\bramp|handrail/i,query:'accessible ramp gradient',agency:'BCA'},
 {id:'drainage',match:/排水|雨水|积水|径流|drain|runoff|stormwater|flood/i,query:'surface water drainage development requirements',agency:'PUB'},
 {id:'greenery',match:/绿化|树木|植被|种植|greenery|landscap|vegetation|\btree/i,query:'greenery provision tree conservation',agency:'NParks'},
 {id:'parking',match:/停车|车位|车库|parking|car park/i,query:'vehicle parking provision dimensions',agency:'LTA'},
 {id:'fire',match:/消防|防火|疏散|救援|消火栓|fire|egress|escape|hydrant/i,query:'fire access',agency:'SCDF'},
 {id:'energy',match:/节能|能耗|绿色建筑|energy|sustainab|green mark/i,query:'environmental sustainability buildings energy',agency:'BCA'},
];
const MODEL=/这个模型|当前模型|本模型|我们的模型|这个方案|当前方案|本方案|本项目|这个项目|当前项目|我的设计|我们的设计|这个设计|先改|model|my design|our design|our project|this project|this design|current design|current issue|flagged|(?:我们|咱们|我方).{0,30}(?:不符合|不合规|违规|违反|不满足|未满足|哪里有问题|哪些问题|哪些不足)|^(?:哪些|哪几|哪里|哪儿|什么地方).{0,25}(?:违规|违反|不符合|不合规|不满足)|^(?:不符合|不合规|违规|未满足).{0,25}(?:条款|规范|地方|位置)|(?:we|our).{0,40}(?:violat|non.?complian|fail|issue|not comply)/i;
const CODE=/规范|条文|条款|要求|标准|\bcode|regulat|requirement|坡度|净宽|净空|平台|楼梯|电梯|中庭|栏杆|护栏|走廊|门宽|厕所|卫生间|采光|通风|退界|建筑|施工|landing|stair|lift|corridor|toilet|ventila|setback|building/i;
const SELECTED=/选中|这条|该条|这份|这一条|此条|selected|this clause|this provision|this source|this section|this document/i;
const ISSUE_ID=/(^|[^a-z0-9_-])FEA-\d{2}(?=$|[^a-z0-9_-])/i;
const SITE=/周边|周围|附近|旁边|邻近|邻里|街区|场地关系|选址|地块|建筑朝向|道路.{0,12}(?:关系|连接|接入)|(?:入口|朝向).{0,12}(?:道路|街道)|最近.{0,8}(?:道路|建筑|绿地|水体|设施)|osm|openstreetmap|surround|neighbou?r|site context|site relationship|orientation|nearest (?:road|building|park)/i;
const NORMATIVE=/规范|条款|条文|规定|法定|合规|违规|标准|强制|code|regulat|compliance|statutory/i;
function shortFollowUp(q){
 if(q.length>120)return false;
 if(/^(?:怎么(?:改|调整|解决)|如何(?:改|调整|解决)|怎么办|还有呢|依据是什么|依据呢|how (?:to )?(?:fix|change|improve)|what about that)[\s\S]*$/i.test(q))return true;
 return /^(?:那|那么|这个|这里|这些|这条|这项|这处|它|其|还有|具体|对应|相关|依据|根据|按哪|哪一条|哪几条|哪些规范|哪些条款|多长|多宽|what about\b|and\b|how (?:long|wide)\b|which (?:codes?|clauses?|regulations?|standards?)\b|what (?:codes?|clauses?|regulations?|standards?)\b)/i.test(q)&&
  (CODE.test(q)||/问题|依据|修改|调整|解决|定位|高亮|怎么改|如何改|多长|多宽|fix|change|improve|that|these|those/i.test(q));
}
const text=value=>typeof value==='string'?value:value?.en||value?.zh||'';
function ruleSources(findings){return findings.map(r=>({docId:r.id,title:r.title?.en||r.clause,agency:'SCDF',page:null,clause:r.clause,sourceType:'verified-clause-summary',evidenceOrigin:'model-rule-evidence',excerpt:`Verified screening criterion summary (not a quotation of the complete code).\n${r.clause}\nRequirement: ${text(r.requirement)}\n${r.requirement?.zh||''}\nApplicability and limitations: ${text(r.explanation)}\n${r.explanation?.zh||''}\nEvidence: ${text(r.evidence)}\nThis finding is ${r.status}; the pool review envelope is manually nominated where stated.`,officialUrl:r.sourceUrl,pdfUrl:'',versionNote:'Selected criterion checked against the stated source; complete applicability remains for review.',sourceChecked:r.sourceChecked||'2026-10-31'}));}
async function selectedSource(selected){
 if(selected.sourceType==='local-pdf'&&selected.docId&&selected.page){const corpus=await loadLocalCodes();const doc=corpus.documents.find(d=>d.id===selected.docId),page=corpus.pages.find(p=>p.docId===selected.docId&&p.page===Number(selected.page));if(doc&&page)return {...doc,docId:doc.id,page:page.page,sourceType:'local-pdf',excerpt:page.text.slice(0,3000)};throw new Error('Selected PDF page is not available in the imported corpus. / 已导入资料中没有该 PDF 页。');}
 return {docId:selected.id,title:text(selected.title),agency:'SCDF',page:null,clause:selected.clause,sourceType:'verified-clause-summary',excerpt:[text(selected.summary),text(selected.requirements),selected.requirements?.zh||''].join('\n'),officialUrl:selected.sourceUrl,pdfUrl:'',versionNote:selected.versionNote||'Clause summary; consult complete source and applicability.'};
}
export function classifyChatQuestion(question,history=[],baseContext={}){
 const q=question.trim(),modelQuestion=MODEL.test(q)||/我们模型/.test(q)||ISSUE_ID.test(q),siteQuestion=SITE.test(q)&&!NORMATIVE.test(q);
 let topic=siteQuestion?null:TOPICS.find(t=>t.match.test(q)),intent=siteQuestion?'site':modelQuestion?'model':topic||CODE.test(q)?'code':'general',followUp=false,previousQuery='',contextOrigin='question';
 const priorUsers=history.filter(t=>t.role==='user'&&typeof t.content==='string').slice(-8);
 const followUpQuestion=shortFollowUp(q);
 if(!siteQuestion&&!topic&&!modelQuestion&&followUpQuestion){
  const last=priorUsers.at(-1);
  if(last){
   // Use the most recent user scope. Assistant prose and older unrelated topics
   // must never pull a fresh question back into the fire-model review.
   const saved=last.scope,prior=saved&&['model','code','general','site'].includes(saved.intent)?saved:classifyChatQuestion(last.content,priorUsers.slice(0,-1));
   if(['model','code','site'].includes(prior.intent)){
    intent=prior.intent;topic=TOPICS.find(t=>t.id===prior.topic);followUp=true;previousQuery=prior.query||last.content;contextOrigin='conversation';
    if(intent==='site'&&NORMATIVE.test(q)){intent=(baseContext.findings||[]).some(f=>f.id===baseContext.project?.selectedFindingId)?'model':'code';}
   }
  }else{
   const selectedId=baseContext.project?.selectedFindingId,knownSelection=(baseContext.findings||[]).some(f=>f.id===selectedId);
   const unrelatedSubject=/平台|楼梯|电梯|中庭|栏杆|护栏|走廊|门宽|厕所|卫生间|采光|通风|退界|施工|landing|stair|lift|corridor|toilet|ventila|setback/i.test(q);
   if(knownSelection&&!unrelatedSubject){intent='model';followUp=true;contextOrigin='model-selection';}
  }
 }
 const detailedQuestion=/平台|landing|宽|width|坡度|gradient/i.test(q),queryText=followUp&&previousQuery&&!detailedQuestion?previousQuery+' '+q:q;
 let query=topic?.query||queryText;
 if(topic?.id==='accessibility')query=/平台|landing|多长|how long/i.test(queryText)?'ramp landing 4.6.5.2':/宽|width/i.test(queryText)?'accessible ramp clear width':'ramp gradient 4.6.2 Table 4';
 if(topic?.id==='fire')query=queryText;
 return {intent,topic:topic?.id||null,agency:topic?.agency||'all',query,followUp,contextOrigin,needsClarification:intent==='code'&&!topic&&followUpQuestion&&!followUp};
}
export async function buildChatContext(question,history=[],baseContext={}){
 const classification=classifyChatQuestion(question,history,baseContext),base=baseContext.project||{};
 let retrievedSources=[],retrievalError=null,selectedOnly=false;
 if(SELECTED.test(question)&&base.selectedCode){
  const explicitTopic=TOPICS.find(t=>t.match.test(question));
  try{const source=await selectedSource(base.selectedCode);if(!explicitTopic||source.agency===explicitTopic.agency){classification.intent='code';classification.needsClarification=false;retrievedSources=[source];selectedOnly=true;}}
  catch(error){retrievalError=String(error.message).slice(0,200);selectedOnly=true;classification.intent='code';}
 }
 if(!selectedOnly&&(classification.intent==='code'&&!classification.needsClarification||classification.intent==='model'&&classification.topic)){
  try{
   const found=await searchLocalCodes(classification.query,{agency:classification.agency,limit:5});
   const corpus=await loadLocalCodes();let picks=found.results;
   if(classification.topic==='accessibility'&&/坡道|ramp|平台|landing|follow/i.test(question+' '+classification.query)){
    const preferred=/平台|landing|多长|how long/i.test(question)?[47,46]:[46,43,47];
    const doc=corpus.documents.find(d=>d.id==='SG-004');
    if(doc){const sources=preferred.map(page=>{const item=corpus.pages.find(p=>p.docId===doc.id&&p.page===page);return item?{...doc,docId:doc.id,page,excerpt:item.text.slice(0,3000)}:null;}).filter(Boolean);picks=[...sources,...picks.filter(p=>p.docId!==doc.id||!preferred.includes(p.page))].slice(0,5);}
   }
   retrievedSources=picks.map(p=>({docId:p.docId,title:p.title,agency:p.agency,page:p.page,sourceType:'local-pdf',excerpt:p.excerpt.slice(0,3000),officialUrl:p.officialUrl,pdfUrl:p.pdfUrl,versionNote:p.versionNote,sourceChecked:p.sourceChecked}));
  }catch(error){retrievalError=String(error.message).slice(0,200);}
 }
 const modelRelevant=classification.intent==='model'&&(!classification.topic||classification.topic==='fire');
 if(modelRelevant){const summaries=ruleSources(baseContext.findings||[]);retrievedSources=[...summaries,...retrievedSources].slice(0,5);}
 return {findings:modelRelevant?(baseContext.findings||[]):[],project:{question,intent:classification.intent,topic:classification.topic,followUp:classification.followUp,contextOrigin:classification.contextOrigin,retrievalQuery:classification.query,needsClarification:classification.needsClarification,groundingMode:'local-source-first',retrievedSources,retrievalError,surroundings:['model','site'].includes(classification.intent)?base.surroundings||null:null,modelContext:classification.intent==='model'?{...base,surroundings:undefined,selectedCode:modelRelevant?base.selectedCode:null}:null,history:history.slice(-6).map(t=>({role:t.role,content:t.content.slice(0,1000)})),selectedCode:modelRelevant?base.selectedCode:null}};
}

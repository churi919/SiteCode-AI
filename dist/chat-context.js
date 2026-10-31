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
const text=value=>typeof value==='string'?value:value?.en||value?.zh||'';
function ruleSources(findings){return findings.map(r=>({docId:r.id,title:r.title?.en||r.clause,agency:'SCDF',page:null,clause:r.clause,sourceType:'verified-clause-summary',evidenceOrigin:'model-rule-evidence',excerpt:`Verified screening criterion summary (not a quotation of the complete code).\n${r.clause}\nRequirement: ${text(r.requirement)}\n${r.requirement?.zh||''}\nApplicability and limitations: ${text(r.explanation)}\n${r.explanation?.zh||''}\nEvidence: ${text(r.evidence)}\nThis finding is ${r.status}; the pool review envelope is manually nominated where stated.`,officialUrl:r.sourceUrl,pdfUrl:'',versionNote:'Selected criterion checked against the stated source; complete applicability remains for review.',sourceChecked:r.sourceChecked||'2026-10-31'}));}
async function selectedSource(selected){
 if(selected.sourceType==='local-pdf'&&selected.docId&&selected.page){const corpus=await loadLocalCodes();const doc=corpus.documents.find(d=>d.id===selected.docId),page=corpus.pages.find(p=>p.docId===selected.docId&&p.page===Number(selected.page));if(doc&&page)return {...doc,docId:doc.id,page:page.page,sourceType:'local-pdf',excerpt:page.text.slice(0,3000)};throw new Error('Selected PDF page is not available in the imported corpus. / 已导入资料中没有该 PDF 页。');}
 return {docId:selected.id,title:text(selected.title),agency:'SCDF',page:null,clause:selected.clause,sourceType:'verified-clause-summary',excerpt:[text(selected.summary),text(selected.requirements),selected.requirements?.zh||''].join('\n'),officialUrl:selected.sourceUrl,pdfUrl:'',versionNote:selected.versionNote||'Clause summary; consult complete source and applicability.'};
}
export function classifyChatQuestion(question,history=[]){
 const q=question.trim(),modelQuestion=MODEL.test(q)||/我们模型|(^|[^a-z0-9_-])FEA-\d{2}(?=$|[^a-z0-9_-])/i.test(q);let topic=TOPICS.find(t=>t.match.test(q)),followUp=false;
 const priorUsers=history.filter(t=>t.role==='user'&&typeof t.content==='string');
 if(!topic&&!modelQuestion&&/^(那|那么|这个|它|其|还有|多长|多宽|what about|and |how long|how wide)|平台|landing/i.test(q)){
  for(const turn of [...priorUsers].reverse()){topic=TOPICS.find(t=>t.match.test(turn.content));if(topic){followUp=true;break;}}
 }
 const intent=modelQuestion?'model':topic||CODE.test(q)?'code':'general';
 let query=topic?.query||q;
 if(topic?.id==='accessibility')query=/平台|landing|多长|how long/i.test(q)?'ramp landing 4.6.5.2':/宽|width/i.test(q)?'accessible ramp clear width':'ramp gradient 4.6.2 Table 4';
 if(topic?.id==='fire')query=q;
 return {intent,topic:topic?.id||null,agency:topic?.agency||'all',query,followUp,needsClarification:intent==='code'&&!topic&&/^(那|那么|这个|它)|平台/i.test(q)};
}
export async function buildChatContext(question,history=[],baseContext={}){
 const classification=classifyChatQuestion(question,history),base=baseContext.project||{};
 let retrievedSources=[],retrievalError=null;
 if(SELECTED.test(question)&&base.selectedCode){
  classification.intent='code';classification.needsClarification=false;
  try{retrievedSources=[await selectedSource(base.selectedCode)];}catch(error){retrievalError=String(error.message).slice(0,200);}
 }else if(classification.intent==='code'&&!classification.needsClarification||classification.intent==='model'&&classification.topic){
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
 return {findings:modelRelevant?(baseContext.findings||[]):[],project:{question,intent:classification.intent,topic:classification.topic,followUp:classification.followUp,needsClarification:classification.needsClarification,groundingMode:'local-source-first',retrievedSources,retrievalError,modelContext:classification.intent==='model'?{...base,selectedCode:modelRelevant?base.selectedCode:null}:null,history:history.slice(-6).map(t=>({role:t.role,content:t.content.slice(0,1000)})),selectedCode:modelRelevant?base.selectedCode:null}};
}

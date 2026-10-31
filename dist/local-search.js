// Browser-local keyword retrieval over actual indexed PDF pages. No LLM call.
const CORPUS_URL = '/assets/local-codes.json.gz';
const WARNING = Object.freeze({
  en: 'Locally indexed PDF text. Search results are source excerpts, not compliance findings; current version, applicability and missing location evidence require verification.',
  zh: '本地索引的 PDF 文本。检索结果为原文摘录，不代表合规判断；须核实当前版本、适用条件及缺失的位置证据。',
});
const SYNONYMS = [
  ['fire','firefighting','消防','防火'],
  ['access','fire access','fire engine access','消防通道','消防车通道','消防车道','通行'],
  ['road','roads','lane','道路','车道'],
  ['accessibility','accessible','barrier-free','barrier free','无障碍'],
  ['ramp','ramps','坡道'],
  ['wheelchair','wheelchairs','轮椅'],
  ['gradient','gradients','slope','slopes','坡度'],
  ['width','clear width','宽度','净宽'],
  ['clearance','headroom','净空'],
  ['overhead','overhead structure','上方结构','顶部结构'],
  ['canopy','canopies','雨棚','顶棚'],
  ['egress','escape','evacuation','疏散'],
  ['exit','exits','出口'],
  ['door','doors','doorway','doorways','门','门洞'],
  ['entrance','entry','entrances','入口'],
  ['stair','stairs','staircase','staircases','楼梯'],
  ['hydrant','hydrants','消火栓','消防栓'],
  ['turning','turnaround','cul-de-sac','cul de sac','转弯','回车'],
  ['dead-end','dead end','尽端'],
  ['facade','façade','external wall','外墙','立面'],
  ['setback','setbacks','退界'],
  ['signage','marking','markings','标识','标记'],
  ['handrail','handrails','扶手'],
  ['tactile','触觉','盲道'],
  ['amendment','amendments','revision','修订','修改'],
  ['greenery','landscape','landscaping','vegetation','绿化','景观','植被'],
  ['tree','trees','树木','树'],
  ['drainage','drain','drains','排水','排水沟'],
];
const STOP = new Set('a an the of to for in on at is are be by with and or what how which does do can must shall minimum maximum requirement requirements please show find me code clause clauses'.split(' '));
let corpusPromise, index;
const wordPatterns=new Map(),headingPatterns=new Map();
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const compactClause = value => normalize(value).replace(/\s+/g,'').replace(/\.(?=\()/g,'');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function contains(text, term) {
  if (!term) return false;
  if (/^[a-z0-9]+$/.test(term)) {
    if(!wordPatterns.has(term))wordPatterns.set(term,new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}(?=$|[^a-z0-9])`,'i'));
    return wordPatterns.get(term).test(text);
  }
  return text.includes(term);
}
function isHeading(text,term) {
  if(!headingPatterns.has(term))headingPatterns.set(term,new RegExp(`^\\s*(?:[a-z]?\\d+(?:\\.\\d+)*[a-z]?\\.?\\s+)?${escapeRegex(term)}\\s*$`,'im'));
  return headingPatterns.get(term).test(text);
}
function queryGroups(query) {
  const q=normalize(query), groups=[], seen=new Set();
  const add = terms => {const key=terms.join('|');if(!seen.has(key)){seen.add(key);groups.push(terms);}};
  for(const aliases of SYNONYMS) if(aliases.some(alias=>contains(q,alias))) add(aliases);
  const tokens=q.match(/[a-z0-9]+(?:[.()-][a-z0-9]+)*|[\u3400-\u9fff]+/g)||[];
  for(const token of tokens) {
    if(STOP.has(token))continue;
    if(SYNONYMS.some(aliases=>aliases.some(alias=>alias===token || (/[\u3400-\u9fff]/.test(token)&&token.includes(alias)))))continue;
    add([token]);
  }
  return groups;
}
function allMeta(corpus) {
  return {documentCount:corpus.documents.length,pageCount:corpus.pages.length,warning:WARNING};
}
function pageStructure(text) {
  const listings=(text.match(/^\s*(?:figure|table)\s+\d+[^\n]*\s\d+\s*$/gim)||[]).length;
  const contents=listings>=5||/(?:^|\n)\s*(?:\d+\s+)?(?:table\s+of\s+contents|list\s+of\s+(?:figures|tables)|c\s*o\s*n\s*t\s*e\s*n\s*t\s*s)\s*(?:\n|$)/i.test(text);
  const definitions=(text.match(/^[“"][^”"\n]+[”"]\s+(?:is|means|refers|describes)/gim)||[]).length;
  return {contents,definitions,short:text.trim().length<200,provisions:Math.min(5,(text.match(/\b(?:shall|must|required|minimum|maximum)\b/gi)||[]).length)};
}

export async function loadLocalCodes() {
  if(!corpusPromise) corpusPromise=(async()=>{
    const response=await fetch(CORPUS_URL,{cache:'no-cache'});
    if(!response.ok)throw new Error('The local PDF index is unavailable. / 本地 PDF 索引暂不可用。');
    const bytes=new Uint8Array(await response.arrayBuffer());
    let text;
    if(bytes[0]===0x1f&&bytes[1]===0x8b) {
      if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot open the compressed index; use a recent Chrome or Edge. / 请使用新版 Chrome 或 Edge 读取压缩索引。');
      text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else text=new TextDecoder().decode(bytes);
    const raw=JSON.parse(text.replace(/^\uFEFF/,''));
    if(!Array.isArray(raw.documents)||!Array.isArray(raw.pages))throw new Error('The local PDF index has an unsupported format. / 本地 PDF 索引格式不受支持。');
    const documents=raw.documents.filter(d=>d&&d.id!=null).map(d=>({...d,id:String(d.id)}));
    const docs=new Map(documents.map(d=>[d.id,d]));
    const pages=raw.pages.filter(p=>p&&docs.has(String(p.docId))&&typeof p.text==='string').map(p=>({...p,docId:String(p.docId)}));
    const corpus={...raw,documents,pages,...allMeta({documents,pages})};
    index={docs,pages:pages.map((page,order)=>({page,order,text:normalize(page.text),clause:compactClause(page.text),title:normalize([docs.get(page.docId).title,docs.get(page.docId).fileName].join(' ')),structure:pageStructure(page.text)}))};
    return corpus;
  })().catch(error=>{corpusPromise=null;index=null;throw error;});
  return corpusPromise;
}

function excerpt(text, terms, max=900) {
  let first=-1;
  for(const term of terms) {const at=normalize(text).indexOf(term);if(at>=0&&(first<0||at<first))first=at;}
  // Normalised whitespace can shift positions, so find a matching raw fragment when possible.
  let rawAt=-1;
  const lower=String(text).normalize('NFKC').toLowerCase();
  for(const term of terms) {const at=lower.indexOf(term);if(at>=0&&(rawAt<0||at<rawAt))rawAt=at;}
  const position=rawAt>=0?rawAt:Math.max(0,first),start=Math.max(0,position-180);
  const trimmed=String(text).slice(start,start+max-(start?1:0)-1).trim();
  return `${start?'…':''}${trimmed}${start+trimmed.length<String(text).length?'…':''}`.slice(0,max);
}
function inferAnchor(text, query) {
  // A hydrant has no corresponding sample geometry: never invent a hydrant pin.
  if(/hydrant|消火栓|消防栓/.test(query))return null;
  const types=[
    ['road',/fire\s+engine\s+access\s+(?:road|way)|fire\s+access\s+(?:road|lane)|消防(?:车)?通道|消防车道/i,/road|lane|access|消防通道|消防车道|通道净宽|尽端|坡度|turning|gradient/i],
    ['canopy',/canop(?:y|ies)|overhead\s+(?:structure|clearance)|雨棚|顶棚|上方(?:结构|净空)/i,/canop|overhead|clearance|headroom|雨棚|净空|上方结构/i],
    ['entry',/door(?:way)?s?|entrance|\bentry\b|门洞|入口|出口门/i,/door|entrance|entry|门|入口/i],
    ['building',/fa[cç]ade|external\s+wall|外墙|立面/i,/fa[cç]ade|external\s+wall|building|外墙|立面|建筑/i],
  ];
  for(const [anchor,evidence,relevant] of types) if(evidence.test(text)&&relevant.test(query))return anchor;
  return null;
}
function resultFor(item,doc,score,terms,query) {
  return {id:`${item.page.docId}-p${item.page.page}`,docId:item.page.docId,title:String(doc.title||doc.fileName||doc.id),agency:String(doc.agency||''),fileName:String(doc.fileName||''),officialUrl:String(doc.officialUrl||''),pdfUrl:String(doc.pdfUrl||''),versionNote:doc.versionNote??'',sourceChecked:doc.sourceChecked??'',page:item.page.page,excerpt:excerpt(item.page.text,terms),score:Math.round(score*100)/100,anchor:inferAnchor(item.text,query),matchedTerms:[...new Set(terms)]};
}
function agencyMatches(doc,agency) {return agency==='all'||normalize(doc.agency).replace(/[_\s]+/g,' ')===normalize(agency).replace(/[_\s]+/g,' ');}

export async function searchLocalCodes(query,{limit=10,agency='all'}={}) {
  const corpus=await loadLocalCodes();
  const q=normalize(String(query??'').slice(0,200)),take=Math.max(1,Math.min(10,Math.floor(Number(limit)||10)));
  const pool=index.pages.filter(item=>agencyMatches(index.docs.get(item.page.docId),agency));
  if(!q) {
    const firstPages=new Map();
    for(const item of pool) {
      const previous=firstPages.get(item.page.docId);
      if(item.page.text.trim().length<30)continue;
      if(!previous||Number(item.page.page)<Number(previous.page.page))firstPages.set(item.page.docId,item);
    }
    const priority=doc=>{const title=normalize(`${doc.title} ${doc.fileName}`);return /accessib|barrier.free|无障碍/.test(title)?3:/amend|circular|修订/.test(title)&&/scdf|fire/.test(normalize(`${doc.agency} ${title}`))?2:1;};
    const picks=[...firstPages.values()].sort((a,b)=>priority(index.docs.get(b.page.docId))-priority(index.docs.get(a.page.docId))||a.order-b.order).slice(0,take);
    return {results:picks.map(item=>resultFor(item,index.docs.get(item.page.docId),0,[],'')),...allMeta(corpus)};
  }
  const groups=queryGroups(q),clauses=q.match(/\d+(?:\.\d+){1,5}[a-z]?(?:\.?\([a-z0-9]+\))*/gi)||[];
  const accessibleRamp=/\bramps?\b|坡道/.test(q)&&!/vehic|parking|car\s*park|vehicle|车辆|车库|停车/.test(q);
  const scored=[];
  for(const item of pool) {
    let score=0,covered=0;const matched=[];
    for(const aliases of groups) {
      const inTitle=aliases.filter(term=>contains(item.title,term));
      const inText=aliases.filter(term=>contains(item.text,term));
      if(inTitle.length||inText.length) {
        covered++;score+=(inTitle.length?7:0)+(inText.length?3:0);
        matched.push(...inText,...inTitle);
        if(inText.length) {
          const frequency=Math.max(...inText.map(term=>item.text.split(term).length-1));
          score+=Math.min(8,Math.log2(1+frequency)*2.4);
          if(inText.some(term=>isHeading(item.page.text,term)))score+=6;
        }
        // Prefer the user's actual language/wording over a synonym-only match.
        if([...inTitle,...inText].some(term=>contains(q,term)))score+=2;
      }
    }
    if(q.length>1&&item.text.includes(q)){score+=12;matched.push(q);}
    if(q.length>1&&item.title.includes(q))score+=15;
    for(const clause of clauses)if(item.clause.includes(compactClause(clause))){score+=30;matched.push(clause);}
    if(score<=0)continue;
    score+=groups.length?8*covered/groups.length:0;
    if(groups.length&&covered===groups.length)score+=8;
    // Prefer actual provisions over navigation/definition pages. Explicit definition
    // searches keep their normal rank, and exact clause matches remain strongly boosted.
    if(!/contents|figure\s*list|目录|图表索引/.test(q)&&item.structure.contents)score-=24;
    if(!/defin|meaning|定义|释义/.test(q)&&item.structure.definitions>=3)score-=8;
    if(item.structure.short)score-=7;
    score+=item.structure.provisions;
    if(accessibleRamp&&/accessib|barrier.free|无障碍/.test(item.title)) {
      score+=5;
      if(/^code on accessibility/.test(item.title))score+=3;
    }
    if(accessibleRamp&&/vehicle parking|car parking|vehicular/.test(item.title))score-=8;
    scored.push({item,score,matched});
  }
  scored.sort((a,b)=>b.score-a.score||a.item.order-b.item.order);
  const seen=new Set(),results=[];
  for(const {item,score,matched} of scored) {
    const id=`${item.page.docId}-p${item.page.page}`;if(seen.has(id))continue;seen.add(id);
    results.push(resultFor(item,index.docs.get(item.page.docId),score,matched,q));if(results.length>=take)break;
  }
  return {results,...allMeta(corpus)};
}

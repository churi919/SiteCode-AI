import {decorateIssueAnswer} from './issue-action-ui.js';
import {buildChatContext} from './chat-context.js';

export function setupChat({getContext,onOpenCodes,onFocusIssue}){
 const panel=document.getElementById('chatPanel'),launch=document.getElementById('chatLauncher'),form=document.getElementById('chatForm'),input=document.getElementById('chatInput'),messages=document.getElementById('chatMessages'),send=document.getElementById('chatSend');
 let history=[],busy=false,requestVersion=0,activeController=null;
 const greeting='I will search your imported regulations first, then answer from the relevant clauses. If I cannot find supporting evidence, I will say so.\n先检索你们导入的规范，再据相关条款回答；找不到依据会说明。';
 function add(role,text){const m=document.createElement('div');m.className='chat-message '+role;const label=document.createElement('small');label.textContent=role==='user'?'YOU / 你':'SITECODE AI · GPT-6.1 SOL';const body=document.createElement('p');body.textContent=text;m.append(label,body);messages.append(m);messages.scrollTop=messages.scrollHeight;return m;}
 function toggle(open){panel.hidden=!open;launch.setAttribute('aria-expanded',String(open));if(open)input.focus();}
 function sourceText(value){return typeof value==='string'?value:typeof value==='number'?String(value):value?.en||value?.zh||'';}
 function attachSources(message,sources){
  if(!Array.isArray(sources)||!sources.length)return;
  const entries=sources.slice(0,8),status=document.createElement('div');status.className='chat-evidence-status';
  const agencies=[...new Set(entries.map(s=>sourceText(s.agency||s.authority)).filter(Boolean))];
  status.textContent=entries.length+' excerpts supplied for this answer / 本次提供 '+entries.length+' 条依据'+(agencies.length?' · '+agencies.join(', '):'');
  const details=document.createElement('details');details.className='chat-sources';const summary=document.createElement('summary');summary.textContent='本次提供给 AI 的规范原文 / Source text supplied for this answer';details.append(summary);
  const list=document.createElement('ol');
  for(const source of entries){
   const id=sourceText(source.docId||source.documentId||source.fileId||source.document_id||source.id),page=sourceText(source.page||source.pageNumber||source.page_number),clause=sourceText(source.clause||source.clauseId),title=sourceText(source.title||source.documentTitle||source.name);
   const label=[id,page?'p. '+page:clause,title].filter(Boolean).join(' · ').slice(0,330)||'Source / 规范来源';
   let href=null;try{const candidate=new URL(source.pdfUrl||source.officialUrl||source.sourceUrl||source.url||source.link||'');if(candidate.protocol==='https:'){if(source.pdfUrl&&page)candidate.hash='page='+encodeURIComponent(page);href=candidate.href;}}catch{}
   const item=document.createElement('li'),kind=document.createElement('div');kind.className='chat-source-kind';kind.textContent=source.sourceType==='verified-clause-summary'?'已核对条款摘要 / Verified clause summary':'PDF 原文摘录 / PDF text excerpt';item.append(kind);
   const reference=document.createElement(href?'a':'span');reference.textContent=label;if(href){reference.href=href;reference.target='_blank';reference.rel='noopener noreferrer';reference.referrerPolicy='no-referrer';}item.append(reference);
   const excerpt=sourceText(source.excerpt||source.text||source.sourceText).slice(0,2300);
   if(excerpt){const quote=document.createElement('blockquote');quote.textContent=excerpt.length>450?excerpt.slice(0,450)+'…':excerpt;item.append(quote);if(excerpt.length>450){const full=document.createElement('details');full.className='chat-source-full';const expand=document.createElement('summary');expand.textContent='展开本次提供的完整摘录 / Expand supplied excerpt';const pre=document.createElement('pre');pre.textContent=excerpt;full.append(expand,pre);item.append(full);}}
   else{const missing=document.createElement('div');missing.className='chat-source-unavailable';missing.textContent='No source text was returned with this reference. / 此条引用未附规范原文。';item.append(missing);}
   list.append(item);
  }
  details.append(list);message.append(status,details);messages.scrollTop=messages.scrollHeight;
 }
 function newChat(){requestVersion++;activeController?.abort();activeController=null;history=[];busy=false;send.disabled=false;input.value='';messages.replaceChildren();add('assistant',greeting);if(!panel.hidden)input.focus();}
 launch.onclick=()=>toggle(panel.hidden);document.getElementById('chatClose').onclick=()=>toggle(false);document.getElementById('chatCodes').onclick=()=>{toggle(false);onOpenCodes();};
 document.getElementById('chatNew').onclick=newChat;
 add('assistant',greeting);
 async function ask(question){if(busy||!question.trim())return;const version=requestVersion,controller=new AbortController();activeController=controller;busy=true;send.disabled=true;input.value='';add('user',question);const pending=add('assistant','Searching relevant sources… / 正在检索相关规范…');let timeout;
  try{const context=await buildChatContext(question,history,getContext());if(version!==requestVersion)return;pending.querySelector('p').textContent='Reading the retrieved evidence… / 正在结合检索依据作答…';timeout=setTimeout(()=>controller.abort(),55000);const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(context),signal:controller.signal});const data=await response.json();if(version!==requestVersion)return;if(!response.ok)throw Error((data.error?.en||'Request failed')+' / '+(data.error?.zh||'请求失败'));if(typeof data.text!=='string'||!data.text.trim())throw Error('No answer returned / 未收到回答');pending.remove();const answer=add('assistant',data.text);decorateIssueAnswer({container:answer,textElement:answer.querySelector('p'),answerText:data.text,linkedIssues:data.linkedIssues,findings:context.findings,onFocusIssue});attachSources(answer,Array.isArray(data.retrievedSources)?data.retrievedSources:context.project?.retrievedSources);history.push({role:'user',content:question},{role:'assistant',content:data.text});}
  catch(error){if(version!==requestVersion)return;pending.querySelector('p').textContent=(error.name==='AbortError'?'The request timed out. / 请求超时。':error.message)+'\nYou can retry. / 可以重试。';}
  finally{clearTimeout(timeout);if(version===requestVersion){busy=false;send.disabled=false;activeController=null;if(!panel.hidden)input.focus();}}
 }
 form.onsubmit=e=>{e.preventDefault();ask(input.value.trim());};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};document.querySelectorAll('[data-chat-question]').forEach(b=>b.onclick=()=>ask(b.dataset.chatQuestion));panel.onkeydown=e=>{if(e.key==='Escape')toggle(false);};
}

import {resolveIssueActions,getIssueActionPlan} from './issue-actions.js';
const label=value=>typeof value==='string'?value:value?.zh||value?.en||'';
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function decorateIssueAnswer({container,textElement,answerText,linkedIssues,findings,onFocusIssue}){
 const issues=resolveIssueActions(answerText,linkedIssues,findings);
 if(!issues.length||typeof onFocusIssue!=='function')return 0;
 const activate=issue=>onFocusIssue(issue.id,issue.objectId);
 if(textElement){
  const lookup=new Map(issues.map(issue=>[issue.id.toUpperCase(),issue])),pattern=new RegExp('(?<![a-z0-9_-])(?:'+issues.map(issue=>escapeRegExp(issue.id)).join('|')+')(?![a-z0-9_-])','gi');let previous=0;const fragment=document.createDocumentFragment();
  for(const match of answerText.matchAll(pattern)){fragment.append(document.createTextNode(answerText.slice(previous,match.index)));const issue=lookup.get(match[0].toUpperCase()),button=document.createElement('button');button.type='button';button.className='chat-inline-issue';button.dataset.issueId=issue.id;button.textContent=match[0]+' ↗';button.setAttribute('aria-label','定位模型 / Locate '+issue.id+' '+label(issue.title));button.onclick=()=>activate(issue);fragment.append(button);previous=match.index+match[0].length;}
  fragment.append(document.createTextNode(answerText.slice(previous)));textElement.replaceChildren(fragment);
 }
 const region=document.createElement('section');region.className='chat-model-actions';region.setAttribute('aria-label','模型问题定位与修改建议 / Model issues and design actions');
 const heading=document.createElement('div');heading.className='chat-model-actions-heading';heading.textContent='点击问题 → 定位模型与修改建议 / Locate & improve';region.append(heading);
 for(const issue of issues){const plan=getIssueActionPlan(issue),button=document.createElement('button');button.type='button';button.className='chat-issue-action '+(plan.reviewOnly?'review':'');button.dataset.issueId=issue.id;button.dataset.objectId=issue.objectId;const top=document.createElement('span');top.className='chat-issue-action-title';top.textContent=issue.id+' · '+label(issue.title);const detail=document.createElement('small');detail.textContent=plan.reviewOnly?'待核实布局 · 查看定位与建议 / Review location':label(plan.current)+' → '+label(plan.target);const arrow=document.createElement('span');arrow.className='chat-issue-action-arrow';arrow.textContent='↗';button.append(top,detail,arrow);button.onclick=()=>activate(issue);region.append(button);}
 container.append(region);return issues.length;
}

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { classifyChatQuestion, buildChatContext } from '../dist/chat-context.js';
import { CODE_LIBRARY } from '../dist/code-library.js';

const corpusBytes = await readFile(new URL('../dist/assets/local-codes.json.gz', import.meta.url));
const actualCorpus = JSON.parse(gunzipSync(corpusBytes));
const garden = JSON.parse(await readFile(new URL('../dist/assets/garden-condo-review.json', import.meta.url), 'utf8'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  assert.equal(String(url), '/assets/local-codes.json.gz', 'Context construction must only fetch the local corpus');
  return new Response(corpusBytes, { headers: { 'Content-Type': 'application/octet-stream' } });
};
after(() => { globalThis.fetch = originalFetch; });
const base = {
  findings: garden.findings,
  project: { model: garden.project, purposeGroup: 'II', selectedCode: { id: 'unrelated-fire-code', clause: '4.2.1c' } },
};
const rampHistory = [
  { role: 'user', content: '无障碍坡道坡度怎么确定' },
  { role: 'assistant', content: 'Review the accessible ramp evidence. The model also has a fire road issue.' },
];

test('classifies Chinese accessibility, drainage, model-priority and general questions separately', () => {
  const accessible = classifyChatQuestion('无障碍坡道坡度怎么确定');
  assert.equal(accessible.intent, 'code');
  assert.equal(accessible.topic, 'accessibility');
  assert.equal(accessible.agency, 'BCA');
  assert.equal(accessible.needsClarification, false);
  const drainage = classifyChatQuestion('场地排水需要核对哪些信息');
  assert.equal(drainage.intent, 'code');
  assert.equal(drainage.topic, 'drainage');
  assert.equal(drainage.agency, 'PUB');
  const model = classifyChatQuestion('这个模型先改哪里');
  assert.equal(model.intent, 'model');
  assert.equal(model.topic, null);
  assert.equal(classifyChatQuestion('你好').intent, 'general');
});

test('short landing follow-up uses the previous user topic rather than an assistant fire aside', () => {
  for (const question of ['那平台多长', 'How long is that landing?']) {
    const result = classifyChatQuestion(question, rampHistory);
    assert.equal(result.intent, 'code');
    assert.equal(result.topic, 'accessibility');
    assert.equal(result.agency, 'BCA');
    assert.equal(result.followUp, true);
    assert.equal(result.needsClarification, false);
    assert.match(result.query, /landing/i);
  }
});

test('ambiguous platform question without history requests clarification', async () => {
  const classification = classifyChatQuestion('那平台多长');
  assert.equal(classification.needsClarification, true);
  assert.equal(classification.topic, null);
  const context = await buildChatContext('那平台多长', [], base);
  assert.equal(context.project.needsClarification, true);
  assert.deepEqual(context.project.retrievedSources, []);
  assert.deepEqual(context.findings, []);
});

test('explicit drainage question resets an earlier ramp discussion', () => {
  const result = classifyChatQuestion('场地排水需要核对哪些信息', rampHistory);
  assert.equal(result.topic, 'drainage');
  assert.equal(result.agency, 'PUB');
  assert.equal(result.followUp, false);
  assert.equal(result.needsClarification, false);
});

test('accessibility context contains actual general-ramp and rise-band evidence without unrelated fire findings', async () => {
  const context = await buildChatContext('无障碍坡道坡度怎么确定', [], base);
  assert.deepEqual(context.findings, []);
  assert.equal(context.project.modelContext, null);
  assert.equal(context.project.selectedCode, null);
  assert.equal(context.project.retrievalError, null);
  assert.ok(context.project.retrievedSources.length > 0);
  const sources = context.project.retrievedSources;
  assert.ok(sources.every(source => source.agency === 'BCA'));
  const generalRamp = sources.find(source => source.docId === 'SG-004' && source.page === 46);
  const riseBands = sources.find(source => source.docId === 'SG-004' && source.page === 43);
  assert.ok(generalRamp && riseBands, 'General ramp gradient must not rely only on the kerb-ramp figure');
  assert.match(generalRamp.excerpt, /4\.6\.2\.1/);
  assert.match(riseBands.excerpt, /Changes in Levels/);
  assert.ok(generalRamp.versionNote && generalRamp.officialUrl && generalRamp.pdfUrl);
  assert.equal(context.project.question, '无障碍坡道坡度怎么确定');
});

test('landing follow-up retrieves the actual landing provision and drainage uses PUB evidence', async () => {
  const landing = await buildChatContext('那平台多长', rampHistory, base);
  assert.deepEqual(landing.findings, []);
  const landingPage = landing.project.retrievedSources.find(source => source.docId === 'SG-004' && source.page === 47);
  assert.ok(landingPage);
  assert.match(landingPage.excerpt, /4\.6\.5\.2/);
  const drainage = await buildChatContext('场地排水需要核对哪些信息', rampHistory, base);
  assert.deepEqual(drainage.findings, []);
  assert.equal(drainage.project.topic, 'drainage');
  assert.equal(drainage.project.followUp, false);
  assert.ok(drainage.project.retrievedSources.length > 0);
  assert.ok(drainage.project.retrievedSources.every(source => source.agency === 'PUB'));
  assert.ok(drainage.project.retrievedSources.some(source => source.docId === 'SG-035'));
});

test('model-priority context carries source summaries while preserving four findings and pool review status', async () => {
  const before = JSON.stringify(base);
  const context = await buildChatContext('这个模型先改哪里', [], base);
  assert.equal(context.project.intent, 'model');
  assert.deepEqual(context.findings, garden.findings);
  assert.equal(context.findings.length, 4);
  assert.equal(context.findings.find(finding => finding.id === 'FEA-04').status, 'review');
  const sources = context.project.retrievedSources;
  assert.equal(context.project.groundingMode, 'local-source-first');
  assert.equal(sources.length, 4);
  assert.ok(sources.every(source => source.sourceType === 'verified-clause-summary' && source.evidenceOrigin === 'model-rule-evidence'));
  assert.ok(sources.every(source => source.page === null && source.officialUrl.startsWith('https://www.scdf.gov.sg/')),
    'Model-rule summaries must not masquerade as extracted PDF pages');
  for (const finding of garden.findings) {
    const source = sources.find(item => item.clause === finding.clause);
    assert.ok(source, `Missing criterion source for ${finding.id}`);
    assert.ok(source.excerpt.includes(finding.requirement.en));
  }
  const highRise = sources.find(source => /Table 4\.2A/.test(source.clause));
  assert.ok(highRise && /7 m/.test(highRise.excerpt), 'Retain the height-specific accessway criterion, not the office demo rule');
  const pool = sources.find(source => /4\.2\.2h/.test(source.clause));
  assert.match(pool.excerpt, /review|candidate/i);
  assert.equal(context.project.modelContext.model, garden.project);
  assert.equal(JSON.stringify(base), before, 'Context construction must preserve model evidence');
});

test('selected local PDF question retrieves its actual page rather than a stale preview or unrelated model rule', async () => {
  const doc = actualCorpus.documents.find(item => item.id === 'SG-004');
  const selectedCode = {
    id: 'SG-004-p47', sourceType: 'local-pdf', docId: 'SG-004', page: 47,
    title: { en: doc.title, zh: '本地规范检索片段' },
    summary: { en: 'STALE_PREVIEW_DO_NOT_TRUST', zh: '过期预览' },
    sourceUrl: doc.pdfUrl, versionNote: doc.versionNote,
  };
  const context = await buildChatContext('这条规范怎么应用', [], {
    ...base, project: { ...base.project, selectedCode },
  });
  assert.equal(context.project.intent, 'code');
  assert.equal(context.project.needsClarification, false);
  assert.deepEqual(context.findings, []);
  assert.equal(context.project.retrievedSources.length, 1);
  const source = context.project.retrievedSources[0];
  assert.equal(source.sourceType, 'local-pdf');
  assert.equal(source.docId, 'SG-004');
  assert.equal(source.page, 47);
  assert.equal(source.agency, 'BCA');
  assert.match(source.excerpt, /4\.6\.5\.2/);
  assert.ok(!source.excerpt.includes('STALE_PREVIEW_DO_NOT_TRUST'));
  assert.equal(source.versionNote, doc.versionNote);
  assert.equal(source.pdfUrl, doc.pdfUrl);
});

test('selected curated clause stays a labelled summary without invented PDF location or model measurement', async () => {
  const selectedCode = CODE_LIBRARY.find(code => code.id === 'road-width');
  const context = await buildChatContext('这条规范怎么应用', [], {
    ...base, project: { ...base.project, selectedCode },
  });
  assert.deepEqual(context.findings, []);
  const source = context.project.retrievedSources[0];
  assert.equal(source.sourceType, 'verified-clause-summary');
  assert.equal(source.page, null);
  assert.equal(source.clause, selectedCode.clause);
  assert.equal(source.officialUrl, selectedCode.sourceUrl);
  assert.ok(source.excerpt.includes(selectedCode.requirements.en));
});

test('model-specific accessibility question clears unrelated selected fire evidence at both levels', async () => {
  const context = await buildChatContext('这个模型的无障碍坡道坡度怎么确定', [], base);
  assert.deepEqual(context.findings, []);
  assert.equal(context.project.selectedCode, null);
  assert.equal(context.project.modelContext.selectedCode, null);
  assert.ok(context.project.retrievedSources.every(source => source.agency === 'BCA'));
});

for (const question of [
  '我们不符合的具体条款是哪些',
  '我们哪里不合规',
  '哪些地方违规',
  '我们的模型违反了哪几条规范',
]) {
  test(`implicit current-model compliance question retains actual findings: ${question}`, async () => {
    assert.equal(classifyChatQuestion(question).intent, 'model');
    const context = await buildChatContext(question, [], base);
    assert.equal(context.project.intent, 'model');
    assert.equal(context.project.question, question);
    assert.equal(context.project.needsClarification, false);
    assert.deepEqual(context.findings, garden.findings);
    assert.equal(context.findings.length, 4);
    assert.equal(context.findings.find(finding => finding.id === 'FEA-04').status, 'review');
    const evidence = context.project.retrievedSources.filter(source => source.evidenceOrigin === 'model-rule-evidence');
    assert.equal(evidence.length, 4, 'An implicit model question must carry the existing criterion evidence');
    assert.ok(evidence.every(source => source.sourceType === 'verified-clause-summary' && source.officialUrl));
    assert.ok(evidence.some(source => /Table 4\.2A/.test(source.clause)));
  });
}

test('standalone accessibility-code question remains code retrieval without unrelated fire findings', async () => {
  const question = '无障碍规范有哪些';
  assert.equal(classifyChatQuestion(question).intent, 'code');
  const context = await buildChatContext(question, [], base);
  assert.equal(context.project.intent, 'code');
  assert.equal(context.project.topic, 'accessibility');
  assert.deepEqual(context.findings, []);
  assert.equal(context.project.selectedCode, null);
  assert.ok(context.project.retrievedSources.length > 0);
  assert.ok(context.project.retrievedSources.every(source => source.agency === 'BCA'));
  assert.ok(context.project.retrievedSources.every(source => source.evidenceOrigin !== 'model-rule-evidence'));
});

test('current-model accessibility requirements do not convert fire findings into accessibility evidence', async () => {
  const context = await buildChatContext('当前模型的无障碍要求有哪些', [], base);
  assert.equal(context.project.intent, 'model');
  assert.equal(context.project.topic, 'accessibility');
  assert.deepEqual(context.findings, []);
  assert.equal(context.project.selectedCode, null);
  assert.equal(context.project.modelContext.selectedCode, null);
  assert.ok(context.project.retrievedSources.some(source => source.docId === 'SG-004'));
  assert.ok(context.project.retrievedSources.every(source => source.agency === 'BCA'));
});

test('missing selected PDF page does not become a verified clause summary', async () => {
  const context = await buildChatContext('这条规范怎么应用', [], {
    ...base,
    project: { ...base.project, selectedCode: {
      id: 'missing-pdf', sourceType: 'local-pdf', docId: 'SG-NOT-IMPORTED', page: 999,
      summary: { en: 'Unverified stale text' }, sourceUrl: 'https://example.invalid/',
    } },
  });
  assert.deepEqual(context.findings, []);
  assert.deepEqual(context.project.retrievedSources, []);
  assert.ok(context.project.retrievalError);
});
test('numbered model questions retain model findings and evidence',async()=>{
 for(const question of ['我们模型中的 FEA-02 需要怎么修改？','FEA-02 怎么改？']){
  assert.equal(classifyChatQuestion(question).intent,'model');
  const context=await buildChatContext(question,[],{findings:garden.findings,project:{model:'Canopy Garden Residences'}});
  assert.equal(context.findings.length,4);
  assert.equal(context.project.retrievedSources.length,4);
 }
});

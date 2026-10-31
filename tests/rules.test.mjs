import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../dist/rules.js', import.meta.url), 'utf8');
const { BASELINE, PROPOSED, evaluateDesign, summarizeResults, getRecommendations } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const result = (input, id) => evaluateDesign(input).find((r) => r.id === id);

test('demo comparison has four to zero selected failures', () => {
  assert.deepEqual(summarizeResults(evaluateDesign(BASELINE)), { pass: 1, fail: 4, review: 0, na: 0, total: 5, screeningOnly: true, note: summarizeResults([]).note });
  assert.equal(summarizeResults(evaluateDesign(PROPOSED)).pass, 5);
  assert.equal(getRecommendations(evaluateDesign(BASELINE)).length, 4);
});
test('exact thresholds are inclusive and slope direction is correct', () => {
  const boundary = { ...BASELINE, clearWidth: 4, outdoorPath: 45, deadEndLength: 46, gradientDenominator: 8.3, overheadClearance: 4.5 };
  assert.ok(evaluateDesign(boundary).every((r) => r.status === 'pass'));
  assert.equal(result({ ...boundary, gradientDenominator: 8.29 }, 'gradient').status, 'fail');
  assert.equal(result({ ...boundary, clearWidth: 3.99 }, 'width').status, 'fail');
});
test('unknown and missing measurements never become passes', () => {
  assert.ok(evaluateDesign({ ...PROPOSED, source: 'unknown' }).every((r) => r.status === 'review'));
  assert.ok(evaluateDesign({}).every((r) => r.status === 'review'));
  assert.equal(result({ ...PROPOSED, clearWidth: null }, 'width').status, 'review');
  assert.equal(result({ ...PROPOSED, clearWidth: '' }, 'width').status, 'review');
  assert.equal(result({ ...PROPOSED, clearWidth: true }, 'width').status, 'review');
  assert.equal(result({ ...PROPOSED, clearWidth: -2 }, 'width').status, 'review');
  assert.equal(result({ ...PROPOSED, clearWidth: 0 }, 'width').status, 'fail');
});
test('coverage is bounded by PG IV and habitable height', () => {
  assert.equal(result({ ...BASELINE, purposeGroup: 'II' }, 'path').status, 'na');
  assert.equal(result({ ...BASELINE, habitableHeight: 10.01 }, 'path').status, 'na');
  assert.equal(result({ ...BASELINE, habitableHeight: null }, 'path').status, 'review');
  assert.equal(result({ ...PROPOSED, purposeGroup: 'PG IV', habitableHeight: 10 }, 'path').status, 'pass');
});
test('turning needs evidence when dead end is longer than 46 m', () => {
  assert.equal(result({ ...BASELINE, turningFacility: true }, 'turning').status, 'review');
  assert.equal(result({ ...BASELINE, turningFacility: null }, 'turning').status, 'review');
  assert.equal(result({ ...BASELINE, turningFacility: true, turningVerified: true }, 'turning').status, 'pass');
});
test('overhead absence and accessway thresholds are not treated as road passes', () => {
  assert.equal(result({ ...PROPOSED, hasOverhead: false }, 'clearance').status, 'na');
  assert.equal(result({ ...PROPOSED, hasOverhead: null }, 'clearance').status, 'review');
  assert.ok(evaluateDesign({ ...BASELINE, accessType: 'accessway' }).every((r) => r.status === 'na'));
});
test('explicit evidence field list gates numerical conclusions', () => {
  const results = evaluateDesign({ ...PROPOSED, verifiedFields: ['clearWidth'] });
  assert.equal(results.find((r) => r.id === 'width').status, 'pass');
  assert.ok(results.filter((r) => r.id !== 'width').every((r) => r.status === 'review'));
});
test('all results are bilingual, source-linked, and criterion-level', () => {
  const results = evaluateDesign(PROPOSED);
  assert.ok(results.every((r) => r.screeningOnly && r.title.en && r.title.zh && r.sourceUrl.startsWith('https://www.scdf.gov.sg/')));
  assert.ok(results.every((r) => !/approved|building compliant/i.test(r.statusLabel.en)));
  assert.equal(summarizeResults(results).screeningOnly, true);
});

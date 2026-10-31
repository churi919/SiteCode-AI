import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveIssueActions, getIssueActionPlan } from '../dist/issue-actions.js';
const findings = JSON.parse(await readFile(new URL('../dist/assets/garden-condo-review.json', import.meta.url), 'utf8')).findings;
const [road, pergola, accessway, pool] = findings;
const ref = finding => ({ id: finding.id, objectId: finding.objectId, status: finding.status });

test('exact answer IDs link original known findings and never invented IDs', () => {
  const result = resolveIssueActions('Review FEA-01 and FEA-03, then unknown FEA-99.', undefined, findings);
  assert.equal(result.length, 2);
  assert.strictEqual(result[0], road);
  assert.strictEqual(result[1], accessway);
  assert.deepEqual(resolveIssueActions('FEA-010, XFEA-01, FEA-01-extra and FEA-01_foo', null, findings), []);
  assert.strictEqual(resolveIssueActions('请检查 FEA-02。', null, findings)[0], pergola);
});

test('explicit links require exact object identity and preserve original status and measurements', () => {
  assert.strictEqual(resolveIssueActions('FEA-01', [{ ...ref(road), value: 99, target: 999 }], findings)[0], road);
  assert.deepEqual(resolveIssueActions('FEA-01', [{ ...ref(road), objectId: pool.objectId }], findings), []);
  assert.deepEqual(resolveIssueActions('FEA-01', [{ id: road.id }], findings), []);
  assert.deepEqual(resolveIssueActions('FEA-04', [{ ...ref(pool), status: 'fail' }], findings), []);
  assert.strictEqual(resolveIssueActions('FEA-04', [ref(pool)], findings)[0], pool);
  assert.strictEqual(resolveIssueActions('FEA-04', [{ id: pool.id, objectId: pool.objectId }], findings)[0].status, 'review');
});

test('explicit links still need a mentioned issue or unique actual clause', () => {
  assert.strictEqual(resolveIssueActions('SCDF 4.2.1c requires a wider road.', [ref(road)], findings)[0], road);
  assert.strictEqual(resolveIssueActions('Review cl. 4.2.2f(1) at the pergola.', [ref(pergola)], findings)[0], pergola);
  assert.strictEqual(resolveIssueActions('Table 4.2A applies to this height band.', [ref(accessway)], findings)[0], accessway);
  assert.strictEqual(resolveIssueActions('按表 4.2A 复核。', [ref(accessway)], findings)[0], accessway);
  assert.deepEqual(resolveIssueActions('BCA accessible ramps need further dimensions.', findings.map(ref), findings), []);
  assert.deepEqual(resolveIssueActions('4.2.1c', undefined, findings), [], 'Clause-only inference requires an explicit validated reference');
  const shared = { ...pergola, clause: road.clause };
  assert.deepEqual(resolveIssueActions('4.2.1c', [ref(road)], [road, shared]), [], 'An ambiguous shared clause cannot select an object');
});

test('explicit empty or invalid lists never fall back to every finding or other answer IDs', () => {
  assert.deepEqual(resolveIssueActions('FEA-01', [], findings), []);
  assert.deepEqual(resolveIssueActions('FEA-01', 'FEA-01', findings), []);
  assert.deepEqual(resolveIssueActions('FEA-02', [ref(road)], findings), []);
  assert.deepEqual(resolveIssueActions('A general source question', undefined, findings), []);
  assert.deepEqual(resolveIssueActions('', findings.map(ref), findings), []);
  assert.deepEqual(resolveIssueActions('FEA-01', undefined, [{ ...road, sourceUrl: null }]), []);
});

test('duplicate references deduplicate; ambiguous known identifiers do not select geometry', () => {
  assert.equal(resolveIssueActions('FEA-01', [ref(road), ref(road)], findings).length, 1);
  assert.deepEqual(resolveIssueActions('FEA-01', undefined, [road, { ...road, objectId: pool.objectId }]), []);
});

test('three dimensional redesign cards show exact evidence-based increases', () => {
  for (const [finding, amount, target] of [[road, '1.2', '4'], [pergola, '1.5', '4.5'], [accessway, '4', '7']]) {
    const snapshot = JSON.stringify(finding);
    const plan = getIssueActionPlan(finding);
    assert.equal(plan.reviewOnly, false);
    assert.deepEqual(plan.current, finding.measured);
    assert.deepEqual(plan.target, finding.requirement);
    assert.deepEqual(plan.action, finding.recommendation);
    assert.ok(plan.delta.en.includes(`+${amount} m`));
    assert.ok(plan.delta.en.includes(`at least ${target} m`));
    assert.ok(plan.delta.zh.includes(`增加 ${amount} 米`));
    assert.equal(JSON.stringify(finding), snapshot);
  }
});

test('pool review has no invented numeric redesign or automatic geometry change', () => {
  const plan = getIssueActionPlan(pool);
  assert.equal(plan.reviewOnly, true);
  assert.equal(plan.delta, null);
  assert.deepEqual(plan.action, pool.recommendation);
  assert.match(plan.action.en, /First establish a valid accessway alignment/);
  assert.equal(getIssueActionPlan({ ...pool, target: 0 }).delta, null);
  assert.equal(getIssueActionPlan({ ...road, target: null }).delta, null);
  assert.equal(getIssueActionPlan({ ...road, value: '2.8' }).delta, null);
  assert.equal(getIssueActionPlan().reviewOnly, true);
});

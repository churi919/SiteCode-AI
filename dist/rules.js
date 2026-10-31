/** FireSite AI: five input-based screening checks, not a building approval. */
export const SOURCE_URL = 'https://www.scdf.gov.sg/fire-safety-services-listing/fire-code-2023/table-of-content/chapter-4-site-planning-external-firefighting-provision/clause-4.2-provision-for-external-access-to-building-for-firefighting-and-accessibility-of-site-to-firefighting-appliances';
export const SOURCE_CHECKED = '2026-10-31';
const bi = (en, zh) => ({ en, zh });

export const BASELINE = Object.freeze({
  purposeGroup: 'IV', habitableHeight: 9, accessType: 'road',
  clearWidth: 3.2, outdoorPath: 52, deadEndLength: 58,
  turningFacility: false, turningVerified: false,
  gradientDenominator: 10, hasOverhead: true, overheadClearance: 4.1,
  source: 'demo',
});
export const PROPOSED = Object.freeze({
  ...BASELINE, clearWidth: 4.5, outdoorPath: 41, deadEndLength: 44,
  overheadClearance: 4.8,
});

export const SCREENING_NOTE = bi(
  'Five selected checks on declared inputs. Survey, turning geometry, loading and remaining provisions need separate review.',
  '依据申报输入筛查五项指标；测绘、转弯几何、承载及其余条文仍需另行审查。',
);
export const STATUS_LABELS = Object.freeze({
  pass: bi('Meets selected criterion', '满足本项指标'),
  fail: bi('Outside selected criterion', '不满足本项指标'),
  review: bi('Needs evidence', '待补充证据'),
  na: bi('Outside this check', '本项不适用'),
});

export const RULES = Object.freeze([
  { id: 'width', field: 'clearWidth', title: bi('Clear road width', '消防车道净宽'), clause: '4.2.1c', requirement: bi('At least 4.0 m', '至少 4.0 米'), target: 4, unit: 'm' },
  { id: 'path', field: 'outdoorPath', title: bi('Outdoor access distance', '室外消防可达距离'), clause: '4.2.2a.(4)', requirement: bi('Every projected-plan point within 45 m travel', '建筑投影各点的行走距离不超过 45 米'), target: 45, unit: 'm' },
  { id: 'turning', field: 'deadEndLength', title: bi('Dead-end turning', '尽端转弯条件'), clause: '4.2.2e.(1)', requirement: bi('Above 46 m: prescribed turning facility', '超过 46 米须设规定的回车设施'), target: 46, unit: 'm' },
  { id: 'gradient', field: 'gradientDenominator', title: bi('Road gradient', '消防车道坡度'), clause: '4.2.2d', requirement: bi('No steeper than 1:8.3', '不陡于 1:8.3'), target: 8.3, unit: 'ratio' },
  { id: 'clearance', field: 'overheadClearance', title: bi('Overhead clearance', '上方结构净空'), clause: '4.2.2f.(1)', requirement: bi('At least 4.5 m under structures', '上方结构下净空至少 4.5 米'), target: 4.5, unit: 'm' },
]);

const number = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean') ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
const fmt = (v) => v === null ? '—' : Number(v.toFixed(2)).toString();
const hasEvidence = (input, field) => input.source !== 'unknown' && (!Array.isArray(input.verifiedFields) || input.verifiedFields.includes(field));
const pg = (value) => String(value ?? '').toUpperCase().replace(/PURPOSE\s*GROUP|PG|\s/g, '');

/** Returns five criterion-level results. An imported shell supplies no measurements by itself. */
export function evaluateDesign(input = {}) {
  return RULES.map((rule) => {
    const value = number(input[rule.field]);
    const result = {
      ...rule, value, sourceUrl: SOURCE_URL, sourceChecked: SOURCE_CHECKED,
      status: 'review', measured: bi(value === null ? 'Not provided' : `${rule.unit === 'ratio' ? '1:' : ''}${fmt(value)}${rule.unit === 'm' ? ' m' : ''}`, value === null ? '未提供' : `${rule.unit === 'ratio' ? '1:' : ''}${fmt(value)}${rule.unit === 'm' ? ' 米' : ''}`),
      explanation: bi('Measurement required.', '需补充测量。'),
      recommendation: bi('Confirm the measurement and its source.', '确认测量值及其来源。'),
      evidence: input.source === 'demo' ? bi('Illustrative input', '示例输入') : bi('Declared input', '申报输入'),
      screeningOnly: true,
    };
    const set = (status, en, zh, recEn, recZh) => {
      result.status = status;
      result.explanation = bi(en, zh);
      result.recommendation = bi(recEn, recZh);
    };
    // These checks implement access ROAD thresholds. Accessway requirements differ.
    if (input.accessType && input.accessType !== 'road') {
      set('na', 'Accessway thresholds differ.', '消防车作业场地的要求不同。', 'Select the applicable accessway provisions.', '核对适用的消防车作业场地条文。');
    } else if (rule.id === 'path' && pg(input.purposeGroup) && pg(input.purposeGroup) !== 'IV') {
      set('na', 'This demo selects PG IV only.', '本演示仅选择 PG IV 办公用途。', 'Review the applicable purpose group.', '核对适用的建筑用途组别。');
    } else if (rule.id === 'path' && number(input.habitableHeight) !== null && number(input.habitableHeight) > 10) {
      set('na', 'Habitable height exceeds this scope.', '居住高度超出本项范围。', 'Review the higher-building accessway provisions.', '核对较高建筑的作业场地条文。');
    } else if (rule.id === 'clearance' && input.hasOverhead === false && hasEvidence(input, 'hasOverhead')) {
      set('na', 'No overhead structure declared.', '申报无上方结构。', 'Check the full route for obstructions.', '检查全程是否存在障碍。');
    } else if (value === null || !hasEvidence(input, rule.field)) {
      // Keep unknown provenance or missing values out of numerical pass/fail results.
    } else if (rule.id === 'width') {
      set(value >= 4 ? 'pass' : 'fail', `${fmt(value)} m against 4 m.`, `${fmt(value)} 米，对照 4 米。`, value >= 4 ? 'Keep the route clear.' : 'Widen the clear route to at least 4 m.', value >= 4 ? '保持通道畅通。' : '将通道净宽增至至少 4 米。');
    } else if (rule.id === 'path') {
      if (pg(input.purposeGroup) !== 'IV' || number(input.habitableHeight) === null || !hasEvidence(input, 'habitableHeight')) {
        set('review', 'Purpose group and height required.', '需确认用途组别及居住高度。', 'Confirm PG IV and habitable height ≤10 m.', '确认 PG IV 且居住高度不超过 10 米。');
      } else {
        set(value <= 45 ? 'pass' : 'fail', 'Uses the declared maximum outdoor path.', '采用申报的最长室外路径。', value <= 45 ? 'Verify every projected-plan point.' : 'Extend access or shorten the outdoor path.', value <= 45 ? '核实建筑投影各点的路径。' : '延伸消防车道或缩短室外路径。');
      }
    } else if (rule.id === 'turning') {
      if (value <= 46) {
        set('pass', 'Length does not trigger this provision.', '长度未触发本项回车设施要求。', 'Check turning radii separately.', '另行检查转弯半径。');
      } else if (input.turningFacility === false && hasEvidence(input, 'turningFacility')) {
        set('fail', 'Long dead end; no facility declared.', '尽端超长，且申报无回车设施。', 'Shorten to ≤46 m or provide prescribed turning.', '缩短至不超过 46 米或设置规定回车设施。');
      } else if (input.turningFacility === true && input.turningVerified === true && hasEvidence(input, 'turningFacility')) {
        set('pass', 'Prescribed turning reported as verified.', '申报规定回车设施已核实。', 'Retain turning verification evidence.', '保留回车条件核实依据。');
      } else {
        set('review', 'Turning provision is unverified.', '回车条件尚未核实。', 'Verify against Diagram 4.2.2e.', '按图 4.2.2e 核实。');
      }
    } else if (rule.id === 'gradient') {
      set(value >= 8.3 ? 'pass' : 'fail', `Declared slope 1:${fmt(value)}.`, `申报坡度 1:${fmt(value)}。`, value >= 8.3 ? 'Confirm the steepest road segment.' : 'Reduce the steepest road gradient.', value >= 8.3 ? '确认最陡路段。' : '减缓最陡路段的坡度。');
    } else if (rule.id === 'clearance') {
      if (input.hasOverhead !== true || !hasEvidence(input, 'hasOverhead')) {
        set('review', 'Overhead condition is unknown.', '上方结构情况未知。', 'Confirm overhead structures along the route.', '确认沿线是否存在上方结构。');
      } else {
        set(value >= 4.5 ? 'pass' : 'fail', 'Only vertical clearance is screened.', '本项仅筛查竖向净空。', value >= 4.5 ? 'Check the remaining overhead conditions.' : 'Raise or remove the overhead obstruction.', value >= 4.5 ? '检查上方结构的其余条件。' : '抬高或移除上方障碍。');
      }
    }
    result.statusLabel = STATUS_LABELS[result.status];
    return result;
  });
}

export function getRecommendations(results = []) {
  return results.filter((result) => result.status === 'fail' || result.status === 'review').map((result) => ({
    id: result.id, status: result.status, title: result.title,
    recommendation: result.recommendation, clause: result.clause, sourceUrl: result.sourceUrl,
  }));
}

export function summarizeResults(results = []) {
  const counts = { pass: 0, fail: 0, review: 0, na: 0 };
  for (const result of results) if (result.status in counts) counts[result.status]++;
  return { ...counts, total: results.length, screeningOnly: true, note: SCREENING_NOTE };
}

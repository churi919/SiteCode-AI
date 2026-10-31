/** Link AI prose to existing source-model findings; never create geometry or findings. */
const VALID_STATUS = new Set(['fail', 'review', 'pass']);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase();
const exactMention = (text, identifier) => new RegExp(`(^|[^a-z0-9_-])${escapeRegex(normalized(identifier))}(?=$|[^a-z0-9_-])`, 'i').test(text);
const clauseText = value => normalized(value).replace(/\.(?=\s*\()/g, '').replace(/\s+\(/g, '(');

function clauseTokens(finding) {
  const found = String(finding.clause ?? '').match(/(?:table\s+)?\d+(?:\.\d+){1,4}[a-z]?(?:\.?\([a-z0-9]+\))*/gi) || [];
  return [...new Set(found.map(token => clauseText(token).replace(/\s+/g, ' ')))];
}
function clauseMention(answer, token) {
  const table = token.startsWith('table ');
  const number = table ? token.slice(6) : token;
  const prefix = table ? '(?:table\\s*|表\\s*)' : '';
  return new RegExp(`(^|[^a-z0-9_.-])${prefix}${escapeRegex(number)}(?=$|[^a-z0-9_.-])`, 'i').test(clauseText(answer));
}
function knownFinding(finding) {
  return finding && typeof finding.id === 'string' && finding.id.length > 0 &&
    typeof finding.objectId === 'string' && finding.objectId.length > 0 &&
    VALID_STATUS.has(finding.status) && typeof finding.sourceUrl === 'string' && /^https:\/\//.test(finding.sourceUrl);
}

/**
 * Explicit references need a matching id/objectId, unchanged status if supplied,
 * and an answer mention of that id or a unique actual clause. An explicit empty
 * reference list stays empty. With no list, only exact answer issue IDs link.
 * Returns the original known finding instances; AI-provided fields are ignored.
 */
export function resolveIssueActions(answerText, linkedIssues, knownFindings = []) {
  if (typeof answerText !== 'string' || !answerText.trim() || !Array.isArray(knownFindings)) return [];
  const valid = knownFindings.filter(knownFinding), byId = new Map(), ambiguous = new Set();
  for (const finding of valid) {
    if (byId.has(finding.id)) ambiguous.add(finding.id);
    else byId.set(finding.id, finding);
  }
  for (const id of ambiguous) byId.delete(id);
  const answer = normalized(answerText);
  if (linkedIssues == null) return [...byId.values()].filter(finding => exactMention(answer, finding.id));
  if (!Array.isArray(linkedIssues)) return [];
  const clauseOwners = new Map();
  for (const finding of byId.values()) for (const token of clauseTokens(finding)) {
    if (!clauseOwners.has(token)) clauseOwners.set(token, new Set());
    clauseOwners.get(token).add(finding.id);
  }
  const used = new Set(), output = [];
  for (const ref of linkedIssues) {
    if (!ref || typeof ref !== 'object') continue;
    const finding = byId.get(ref.id);
    if (!finding || ref.objectId !== finding.objectId || used.has(finding.id)) continue;
    if (ref.status !== undefined && ref.status !== finding.status) continue;
    const mentioned = exactMention(answer, finding.id) || clauseTokens(finding).some(token => clauseOwners.get(token)?.size === 1 && clauseMention(answerText, token));
    if (!mentioned) continue;
    used.add(finding.id); output.push(finding);
  }
  return output;
}

const bilingual = (value, fallback) => ({
  en: typeof value === 'string' ? value : value?.en || fallback.en,
  zh: value?.zh || fallback.zh,
});
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const fmt = value => String(Number(value.toFixed(3)));

/** A proposal card from existing evidence. It never changes a model or a status. */
export function getIssueActionPlan(issue = {}) {
  const reviewOnly = issue.status === 'review' || !VALID_STATUS.has(issue.status) || !knownFinding(issue);
  const current = bilingual(issue.measured, { en: 'Not measured', zh: '未测量' });
  const target = bilingual(issue.requirement, { en: 'Confirm the applicable criterion', zh: '确认适用指标' });
  const action = bilingual(issue.recommendation, { en: 'Confirm the source, geometry and applicability before revising.', zh: '先核实来源、几何及适用条件，再修改设计。' });
  let delta = null;
  const value = number(issue.value), limit = number(issue.target);
  if (!reviewOnly && issue.status === 'fail' && issue.unit === 'm' && value !== null && limit !== null && value !== limit) {
    const difference = Number((limit - value).toFixed(3));
    const amount = fmt(Math.abs(difference));
    delta = difference > 0
      ? { en: `Increase from ${fmt(value)} m to at least ${fmt(limit)} m (+${amount} m).`, zh: `由 ${fmt(value)} 米增至至少 ${fmt(limit)} 米，增加 ${amount} 米。` }
      : { en: `Reduce from ${fmt(value)} m to at most ${fmt(limit)} m (−${amount} m).`, zh: `由 ${fmt(value)} 米减至不超过 ${fmt(limit)} 米，减少 ${amount} 米。` };
  }
  return { current, target, action, delta, reviewOnly };
}

/**
 * Lens - cd-manager (v3.53)
 *
 * Read-only "can this plan be closed?" for /cd and the /ct batch close (D1).
 * It writes nothing: the batch close shows every verdict first and asks once.
 *
 *   inspectTask(docPath, {root}) → {closable, reasons[], remaining[], ledger, waitingOn}
 *
 *   reasons   — why it cannot be closed now (empty ⇔ closable)
 *   remaining — what is still open or must be confirmed by a person
 *               (unticked boxes · manual verification rows · open ledger gates · 재개 포인트)
 *   ledger    — 'none' | 'met' | 'unmet' | 'abandoned' | 'invalid' for the plan's own ledger
 *
 * The ledger is judged with gateState/summarize only. The Stop hook's
 * evaluate() drops stale and manual gates on purpose (it must not block a turn
 * on them); a close decision must not drop them, so it is not used here.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { loadLedgers, gateState, summarize } = require('./gate-ledger');

const unquote = v => String(v == null ? '' : v).trim().replace(/^["']|["']$/g, '');
const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

function frontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fields = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0 && !/^\s/.test(line)) fields[line.slice(0, i).trim()] = unquote(line.slice(i + 1));
    }
  }
  return fields;
}

/** Text of one `## <heading>` section, up to the next `## `. */
function section(content, heading) {
  const parts = content.split(/\r?\n(?=## )/);
  const hit = parts.find(p => p.replace(/^\r?\n/, '').startsWith(`## ${heading}`));
  return hit || '';
}

/** The newest ledger whose planDoc is this document, or null. */
function planLedger(root, docPath) {
  const target = path.resolve(docPath);
  const mine = loadLedgers(root).ledgers.filter(l => l.planDoc && path.resolve(root, l.planDoc) === target);
  mine.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return mine[0] || null;
}

function inspectTask(docPath, { root } = {}) {
  const out = { closable: false, reasons: [], remaining: [], ledger: 'none', waitingOn: null };
  let content;
  try {
    content = fs.readFileSync(docPath, 'utf-8');
  } catch (err) {
    out.reasons.push(`계획서를 읽을 수 없다: ${err.message}`);
    return out;
  }
  // docs/tasks/<id>.md → the repo root that holds .lens/gates
  const repoRoot = path.resolve(root || path.join(path.dirname(docPath), '..', '..'));
  const fm = frontmatter(content);

  if (fm.waiting_on) {
    out.waitingOn = fm.waiting_on;
    out.reasons.push(`대기 중(${fm.waiting_on})`);
  }
  if (fm.status === 'blocked') out.reasons.push(`멈춤(blocked)${fm.blocked_reason ? ` — ${fm.blocked_reason}` : ''}`);
  if (fm.status === 'parked') out.reasons.push('보관(parked)');

  // checkboxes
  const boxes = [...content.matchAll(/^\s*- \[([ xX])\]\s*(.*)$/gm)];
  // partial approval (v3.53): a box tagged only with held inventory rows is not approved work
  const { heldRowNumbers, taggedRows } = require('./plan-manager');
  const held = heldRowNumbers(content);
  const approvedBox = b => { const rows = taggedRows(b[2]); return !rows || !held.size || !rows.every(n => held.has(n)); };
  const counted = boxes.filter(approvedBox);
  const open = counted.filter(b => b[1] === ' ');
  if (open.length) out.reasons.push(`체크 미완 ${counted.length - open.length}/${counted.length}`);
  for (const b of open) out.remaining.push(`체크 — ${short(b[2].trim())}`);

  // verification table: a failed row blocks, a manual row is a person's check
  // /cp writes 「✅ 검증」, older and /cc-side plans call it 「✅ Review」 — read either
  const verify = section(content, '✅ 검증') || section(content, '✅ Review');
  for (const line of verify.split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2 || !/^\d+$/.test(cells[0])) continue;
    if (!approvedBox([null, null, cells[1]])) continue; // a check for held (partially-unapproved) rows only
    // judge the 통과 cell only — a check command may itself contain "FAIL" (`--expect FAIL`)
    const pass = cells.length >= 4 ? cells[cells.length - 2] : line;
    if (/❌|\bFAIL\b|미통과/.test(pass)) out.reasons.push(`검증 #${cells[0]} 실패 표시 — ${short(cells[1])}`);
    else if (cells[cells.length - 1].toLowerCase() === 'manual') out.remaining.push(`검증 #${cells[0]} 수동 확인 — ${short(cells[1])}`);
  }

  // the plan's own ledger
  const ledger = planLedger(repoRoot, docPath);
  if (ledger) {
    const counts = summarize(ledger);
    out.ledger = counts.invalid ? 'invalid' : counts.unmet ? 'unmet' : counts.abandoned ? 'abandoned' : 'met';
    if (counts.invalid) out.reasons.push(`원장 무효 ${counts.invalid}`);
    if (counts.unmet) out.reasons.push(`원장 미충족 ${counts.unmet}`);
    if (counts.abandoned) out.reasons.push(`원장 포기 ${counts.abandoned}`);
    for (const g of ledger.gates || []) {
      const st = gateState(g, ledger.schema);
      if (st !== 'met') out.remaining.push(`원장 ${(g && g.id) || '?'} ${st} — ${short(String((g && g.criterion) || ''))}`);
    }
  } else if (!boxes.length) {
    out.reasons.push('체크박스·원장 없음 — 완료 판정 근거 없음');
  }

  const resume = (section(content, '진행상황').match(/^- \*\*재개 포인트\*\*:\s*(.+)$/m) || [])[1];
  if (resume) out.remaining.push(`재개 포인트 — ${short(resume.replace(/\*\*/g, '').trim())}`);

  out.closable = out.reasons.length === 0;
  return out;
}

module.exports = { inspectTask };

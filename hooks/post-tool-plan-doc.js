/**
 * Lens - PostToolUse Hook (matcher: Write|Edit)
 * Checks a plan document the moment it is written and reports what is missing.
 *
 * Why this shape (v3.34). The coverage ledger and the structure check were real
 * code with real tests, but their *invocation* was a `node -e` line in SKILL.md
 * prose — the model had to choose to run it. The audit measured what that is
 * worth: /cp's own gate text warns that "컨텍스트가 길어지면 자기점검은 조용히
 * 건너뛰어진다 (실측: 필수 섹션 존재율 28%)". A hook cannot be skipped.
 *
 * Why it injects instead of blocking. Three measurements ruled a hard block out:
 *   1. 78 of the workspace's 82 in-flight plans (95.1%) fail the coverage check —
 *      `validatePlanCoverage` has no grandfathering (`isPreCoverageDoc` is only
 *      consulted inside `validatePlanStructure`). Blocking would freeze the repo.
 *   2. /cp writes the document in Phase 2.5 and validates it in Phase 5.0. A
 *      PreToolUse(Write) block is therefore chronologically impossible to satisfy.
 *   3. The audit's own finding: visible output gets acted on (board.html exists in
 *      18 repos with no hook at all); silent self-restraint is what needs code.
 *      A message the model must read is enough — a refusal is not required.
 *
 * So: advisory context, cutoff-respecting, never blocking.
 *
 * Triggered: after each Write/Edit
 * Reads:     the written file (docs/tasks/*.md only)
 * Output:    { hookSpecificOutput: { additionalContext } } — or nothing at all
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-plan-doc');

const { validatePlanCoverage, validatePlanStructure } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-manager'));

// Plan documents only. History entries have a different skeleton by design, and
// rules/ is not a plan at all — checking either would produce noise on every edit.
const PLAN_DOC = /[\\/]docs[\\/]tasks[\\/][^\\/]+\.md$/i;

// Same cutoff as lib/plan-manager.js COVERAGE_LEDGER_SINCE. A plan written before
// the ledger existed cannot be back-filled by its author — the research that would
// populate it is over — so nagging about it every edit is pure noise.
const LEDGER_SINCE = '2026-08-17';

/** Read the document's own date; unknown provenance counts as current. */
function isLegacy(content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const dated = fm[1].match(/^(?:created|date|plan_id|id)\s*:\s*"?(\d{4}-\d{2}-\d{2})/m);
  return dated ? dated[1] < LEDGER_SINCE : false;
}

function grade(content) {
  return (content.match(/^grade\s*:\s*(\S+)/m) || [])[1];
}

function main() {
  const input = readJsonInput();
  const filePath = input?.tool_input?.file_path || input?.tool_input?.filePath || '';
  if (!filePath || !PLAN_DOC.test(filePath)) return writeJson({});

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return writeJson({}); // deleted or unreadable between write and hook — not our business
  }

  if (isLegacy(content)) return writeJson({});

  const structure = validatePlanStructure(content, grade(content));
  const coverage = validatePlanCoverage(content);
  if (structure.valid && coverage.valid) {
    // Say so. A silent pass is indistinguishable from a hook that never ran, and
    // the count is the one number the approval screen is supposed to show.
    return writeJson({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `[Lens] 계획서 게이트 통과 — 커버리지: 인벤토리 ${coverage.total}건 → 포함 ${coverage.included} / 제외 ${coverage.excluded}. ` +
          `승인 화면에 이 카운트를 그대로 표시하라.`,
      },
    });
  }

  const parts = [];
  if (!structure.valid && structure.missing.length) {
    parts.push(`필수 섹션 누락: ${structure.missing.join(', ')}`);
  }
  if (!coverage.valid) {
    parts.push(
      coverage.total === 0
        ? '작업 인벤토리(📋)가 없거나 비었다 — 요청·조사에서 나온 항목을 전수 나열하라'
        : `커버리지 원장 문제 ${coverage.problems.length}건: ${coverage.problems.slice(0, 3).join(' / ')}` +
            (coverage.problems.length > 3 ? ` 외 ${coverage.problems.length - 3}건` : ''),
    );
  }

  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `[Lens] 계획서 ${path.basename(filePath)} 가 게이트를 통과하지 못한다. ${parts.join(' · ')}. ` +
        `승인을 요청하기 전에 고쳐라 — 이 검사는 /cp Phase 5.0 과 /cc 실행 진입에서 다시 돈다. ` +
        `(차단하지 않는다: 진행 중인 계획서 대다수가 이 원장 도입 전에 쓰였다.)`,
    },
  });
}

main();

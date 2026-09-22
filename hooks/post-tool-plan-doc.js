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
 *   3. The audit's own finding: visible output gets acted on; silent
 *      self-restraint is what needs code. A message the model must read is enough.
 *
 * So: advisory context, cutoff-respecting, never blocking.
 *
 * v3.39 — the hook was itself noise (owner, 2026-09-14). Measured in one turn:
 *   - it looked for the show record in the WORKSPACE `.lens/` (CLAUDE_PROJECT_DIR
 *     is the workspace in a multi-repo session) and repeated "띄워라" on ten edits
 *     of a plan that had been shown;
 *   - it repeated the approval-screen instructions on progress edits made while
 *     the plan was already executing;
 *   - it re-injected the identical message on every edit.
 * Now: the repo root comes from the file path, approval hints stop once the plan
 * is approved, an identical message is not injected twice in a row, and a
 * 조사보고 (research report) is not asked for an execution ledger.
 *
 * Triggered: after each Write/Edit
 * Reads:     the written file (docs/tasks/*.md only)
 * Writes:    .lens/plan-doc-hook.json (last message hash per plan)
 * Output:    { hookSpecificOutput: { additionalContext } } — or nothing at all
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const {
  installFailSoftHandlers, readJsonInput, writeJson, resolveProjectRoot, safeReadJson, safeWriteJson, ensureLensDir,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-plan-doc');

const {
  validatePlanCoverage,
  validatePlanStructure,
  findRelatedDocs,
  readKind,
} = require(path.join(PLUGIN_ROOT, 'lib', 'plan-manager'));

const { wasShown } = require(path.join(PLUGIN_ROOT, 'lib', 'report-viewer'));

// Plan documents only. History entries have a different skeleton by design, and
// rules/ is not a plan at all — checking either would produce noise on every edit.
const PLAN_DOC = /[\\/]docs[\\/]tasks[\\/][^\\/]+\.md$/i;

// Same cutoff as lib/plan-manager.js COVERAGE_LEDGER_SINCE. A plan written before
// the ledger existed cannot be back-filled by its author — the research that would
// populate it is over — so nagging about it every edit is pure noise.
const LEDGER_SINCE = '2026-08-17';

// Once approved, the document is the executor's to update. Approval-screen
// instructions on those edits are noise.
const PAST_APPROVAL = /^(approved|executing|in_progress|blocked|done|completed|superseded)$/i;

// A path that only exists on this machine. `~/…` and repo-relative paths are fine.
const MACHINE_PATH = /(?:\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s`'"]+|\/Users\/[^/\s`'"]+\/|\/home\/[^/\s`'"]+\/)/;

/** Read the document's own date; unknown provenance counts as current. */
function isLegacy(content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const dated = fm[1].match(/^(?:created|date|plan_id|id)\s*:\s*"?(\d{4}-\d{2}-\d{2})/m);
  return dated ? dated[1] < LEDGER_SINCE : false;
}

function frontmatterField(content, key) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return '';
  const m = fm[1].match(new RegExp(`^${key}\\s*:\\s*"?([^"\\r\\n]*)"?\\s*$`, 'm'));
  return m ? m[1].trim() : '';
}

/** `grade: deep` / `grade: "deep"` → 'deep' (v3.48: the quoted form read as '"deep"'). */
function grade(content) {
  return (content.match(/^grade\s*:\s*["']?([^"'\s]+)/m) || [])[1];
}

/** Lines outside code fences that name a path only this machine has. */
function machinePathCount(content) {
  let fence = false;
  let count = 0;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (!fence && MACHINE_PATH.test(line)) count += 1;
  }
  return count;
}

/**
 * Inject nothing when this exact message was the last one for this plan in this
 * session. v3.48: keyed by session too — another session editing the same plan
 * never saw the message and must not be silenced by it.
 */
function isRepeat(projectRoot, relPath, message, sessionId) {
  const statePath = path.join(projectRoot, '.lens', 'plan-doc-hook.json');
  const hash = crypto.createHash('sha256').update(message).digest('hex').slice(0, 16);
  const key = sessionId ? `${sessionId}:${relPath}` : relPath;
  const state = safeReadJson(statePath, {}) || {};
  if (state[key] === hash) return true;
  state[key] = hash;
  ensureLensDir(projectRoot);
  safeWriteJson(statePath, state);
  return false;
}

function emit(projectRoot, relPath, message, sessionId) {
  if (!message || isRepeat(projectRoot, relPath, message, sessionId)) return writeJson({});
  return writeJson({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } });
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

  const projectRoot = resolveProjectRoot({ filePath, cwd: input?.cwd });
  const planId = path.basename(filePath, '.md');
  const relPath = path.relative(projectRoot, filePath).split(path.sep).join('/') || filePath;
  const sessionId = typeof input?.session_id === 'string' ? input.session_id : '';
  const approved = PAST_APPROVAL.test(frontmatterField(content, 'status'));
  const kind = readKind(content) || '신규';

  const structure = validatePlanStructure(content, grade(content));
  const coverage = kind === '조사보고'
    ? { valid: true, total: 0, included: 0, excluded: 0, problems: [] }
    : validatePlanCoverage(content);
  const machinePaths = machinePathCount(content);

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
  if (machinePaths) {
    parts.push(`이 컴퓨터에만 있는 절대경로 ${machinePaths}줄 — 다른 머신·엔진에서 못 쓴다. 레포 기준 경로나 ~ 로 바꿔라`);
  }

  // While executing, speak only when something is actually wrong.
  if (approved) {
    return emit(projectRoot, relPath, parts.length
      ? `[Lens] 계획서 ${path.basename(filePath)} (실행 중) — ${parts.join(' · ')}.`
      : '', sessionId);
  }

  let shown = null;
  try {
    shown = wasShown(projectRoot, planId);
  } catch {
    shown = null; // a broken record must not change the gate report
  }
  // The hook knows the plugin root at runtime; the model's shell may not.
  const cli = `node "${PLUGIN_ROOT.split(path.sep).join('/')}/scripts/show-report.js"`;
  const showHint = shown
    ? ''
    : ' 승인을 묻기 전에 계획서를 띄워라 — Artifact 도구가 있으면 읽히는 페이지로 발행하고 '
      + `${cli} --shown artifact <URL> ${planId}, `
      + `없으면 ${cli} ${relPath}. 경로만 적고 승인을 묻지 마라.`;
  const modelHint = /^planner_model\s*:/m.test(content)
    ? ''
    : ' frontmatter 에 planner_model 이 없다 — 이 계획서를 쓴 모델을 기록하라.';

  // Prior work on the same subject — the one thing here that serves the original
  // reason the skills exist ("앞뒤 상황, 과거 히스토리, 문서를 꼼꼼히 보게").
  let related = [];
  try {
    related = findRelatedDocs(projectRoot, planId, { exclude: filePath });
  } catch {
    related = []; // discovery is a courtesy — never let it break the gate report
  }
  const priorWork = related.length
    ? ` 같은 주제의 기존 문서 ${related.length}건: ${related.map(r => r.file).join(' · ')}.`
      + ' 계획을 굳히기 전에 열어보고, 겹치거나 이미 결정된 것이 있으면 📋 인벤토리에 반영하라.'
    : '';

  if (!parts.length) {
    const count = kind === '조사보고'
      ? '조사보고 — 실행 원장 대상 아님.'
      : `커버리지: 인벤토리 ${coverage.total}건 → 포함 ${coverage.included} / 제외 ${coverage.excluded}.`;
    return emit(projectRoot, relPath, `[Lens] 계획서 게이트 통과 — ${count}` + showHint + modelHint + priorWork, sessionId);
  }

  return emit(projectRoot, relPath,
    `[Lens] 계획서 ${path.basename(filePath)} 가 게이트를 통과하지 못한다. ${parts.join(' · ')}. ` +
    '승인을 요청하기 전에 고쳐라 — 이 검사는 /cp 승인 전과 /cc 실행 진입에서 다시 돈다. ' +
    '(차단하지 않는다.)' + showHint + modelHint + priorWork, sessionId);
}

main();

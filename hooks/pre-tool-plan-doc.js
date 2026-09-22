/**
 * Lens - PreToolUse Hook (matcher: Write|Edit)
 * The plan is written by the top model tier, or it is not written at all.
 *
 * WHY THIS IS CODE (v3.42)
 * ------------------------
 * The rule has existed as prose since v3.37 (`/cp` "계획은 TOP 티어가 쓴다",
 * docs/rules/harness-rules.md §4.1): a session below the top tier delegates
 * Phase 1~2.5 to `Agent(model: "fable")`. On 2026-09-15 the owner watched an
 * Opus session write a plan for a 443,680-row reclassification — irreversible,
 * production DB, four systems — and record the violation in its own frontmatter
 * (`planner_model: opus-5 (세션 자체)`) instead of obeying it.
 *
 * The check that existed only asked whether the `planner_model:` LINE was
 * present. A field the author fills in cannot police the author. This hook reads
 * the model from the transcript instead — the harness writes it, the model does
 * not — and refuses the write.
 *
 * WHAT COUNTS AS DELEGATED
 * ------------------------
 * Either is enough:
 *   1. the acting model is the top tier (the session itself, or a top-tier
 *      subagent whose entry the transcript carries), or
 *   2. this session has spawned a top-tier agent (the dashboard `pre-tool-task.js`
 *      writes) — the delegate is the one holding the pen, and whether its own
 *      entries are attributable in the transcript is a harness detail.
 *
 * v3.48 — WHO is acting (E1·E2·E3). On 2026-09-21 a fable subagent was refused as
 * "claude-opus-5" (the parent transcript's model), spent 4 minutes reading this
 * hook, and copied the delegation record into another repo to get through.
 *   - A call with `agent_id` is a subagent's. Its model is read from its own
 *     transcript `<transcript dir>/<session>/subagents/agent-<agent_id>.jsonl`
 *     (layout measured on this machine); when that says a model, it decides.
 *     The parent's model is read only when there is no `agent_id`.
 *   - "Delegated" is read from THIS session's dashboard in the session store —
 *     another session's or another repo's record, or an errored delegation, is
 *     not visible or does not count. `launched` counts (a background planner).
 *     No session id → the legacy repo dashboard.
 *
 * WHEN IT STAYS OUT OF THE WAY
 * ----------------------------
 *   - the plan is already approved/executing — progress edits belong to the executor;
 *   - `kind: 조사보고` — a research report is not a plan that workers execute;
 *   - anything unreadable (no transcript, broken JSON, missing file) — fail open;
 *   - LENS_PLANNER_GATE=0.
 *
 * Input (stdin): { tool_name, tool_input: { file_path, content? }, transcript_path, session_id, agent_id?, cwd }
 * Output: {} | { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason } }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const {
  installFailSoftHandlers, readJsonInput, writeJson, resolveProjectRoot, safeReadJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('pre-tool-plan-doc');
const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));

// SoT: hooks/pre-tool-task.js TOP_TIER · docs/rules/harness-rules.md §4.1.
// Matched against the harness's model id (`claude-fable-5-1`), not equality.
const TOP_TIER = 'fable';

const PLAN_DOC = /[\\/]docs[\\/]tasks[\\/][^\\/]+\.md$/i;
const PAST_APPROVAL = /^(approved|executing|in_progress|blocked|done|completed|superseded)$/i;
const TAIL_BYTES = 512 * 1024;

/** The model of the last assistant turn in the transcript, or null. */
function actingModel(file) {
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  const size = Math.min(stat.size, TAIL_BYTES);
  const fd = fs.openSync(file, 'r');
  let text;
  try {
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, stat.size - size);
    text = buf.toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
  const lines = text.split('\n');
  if (stat.size > size) lines.shift(); // first line is probably cut
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    // `<synthetic>` is the harness's own line (API error, session limit), not a model.
    if (e && e.type === 'assistant' && e.message && typeof e.message.model === 'string'
      && e.message.model !== '<synthetic>') return e.message.model;
  }
  return null;
}

/** The subagent's own transcript, or null when the id is unusable as a file name. */
function subagentTranscript(transcriptPath, agentId) {
  const id = store.cleanId(agentId);
  if (!transcriptPath || !id) return null;
  const name = id.startsWith('agent-') ? id : `agent-${id}`;
  return path.join(path.dirname(transcriptPath), path.basename(transcriptPath, '.jsonl'), 'subagents', `${name}.jsonl`);
}

/** Legacy (no session id): did this session spawn a top-tier agent? (the pen may be in its hand) */
function topTierDelegated(projectRoot) {
  const board = safeReadJson(path.join(projectRoot, '.lens', 'agent-dashboard.json'), null);
  const agents = board && Array.isArray(board.agents) ? board.agents : [];
  if (agents.some(a => String(a && a.model || '').includes(TOP_TIER))) return true;
  return Number(board && board.topTierTotal) > 0;
}

/** frontmatter value, from the content being written or the file on disk. */
function field(content, key) {
  const fm = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return '';
  const m = fm[1].match(new RegExp(`^${key}\\s*:\\s*"?([^"\\r\\n]*)"?\\s*$`, 'm'));
  return m ? m[1].trim() : '';
}

function main() {
  const input = readJsonInput();
  const tool = input && input.tool_name;
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') return writeJson({});
  if (/^(0|false|off|no)$/i.test(String(process.env.LENS_PLANNER_GATE || ''))) return writeJson({});

  const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.filePath)) || '';
  if (!filePath || !PLAN_DOC.test(filePath)) return writeJson({});

  // What the document will say: the new content for a Write, the file for an Edit.
  let text = (input.tool_input && input.tool_input.content) || '';
  if (!text) {
    try { text = fs.readFileSync(filePath, 'utf-8'); } catch { text = ''; }
  }
  if (PAST_APPROVAL.test(field(text, 'status'))) return writeJson({});
  if (/조사보고/.test(field(text, 'kind'))) return writeJson({});

  try { store.bind(input); } catch { /* no store → the legacy repo dashboard below */ }
  const agentId = store.isSubagentCall(input) ? input.agent_id.trim() : null;

  // A subagent is judged by its own transcript; the parent's model is not its model.
  let model;
  try {
    model = actingModel(agentId ? subagentTranscript(input.transcript_path, agentId) : input.transcript_path);
  } catch {
    if (!agentId) return writeJson({}); // an unreadable transcript must never trap a session
    model = null;                       // a subagent falls back to the delegation record
  }
  if (model && model.includes(TOP_TIER)) return writeJson({});
  if (!agentId && !model) return writeJson({}); // unknown model → fail open

  // A subagent whose transcript names its model has been judged by it already.
  if (!(agentId && model)) {
    try {
      const delegated = store.current().sessionId
        ? store.topTierDelegated(TOP_TIER)
        : topTierDelegated(resolveProjectRoot({ filePath, cwd: input.cwd }));
      if (delegated) return writeJson({});
    } catch { /* a broken board is not evidence either way — fall through to deny */ }
  }

  let who = `이 세션은 ${model} 이고 ${TOP_TIER} 위임 기록도 없다.`;
  if (agentId) {
    who = (model
      ? `이 서브에이전트(${agentId})는 ${model} 이다.`
      : `이 서브에이전트(${agentId})의 모델을 기록에서 읽지 못했고 이 세션의 ${TOP_TIER} 위임 기록도 없다.`)
      + ' 서브에이전트는 결과를 리더에게 넘기고, 위임은 리더가 한다.';
  }

  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `[Lens] 계획서는 최상위 티어(${TOP_TIER})가 쓴다 — ${who} `
        + `계획서는 되돌리기 어려운 결정을 문서에 박는 일이라, 여기서 틀리면 워커 전원이 틀린 것을 정확하게 만든다(harness-rules §4.1). `
        + `Agent(model: "${TOP_TIER}") 에 Phase 1~2.5 를 위임하되 **컨텍스트를 통째로** 실어 보내라 — 원본 요청 전문 · 목표/왜 · 조사 결과 · 인벤토리 전량 · 관련 docs/rules·docs/history 경로. `
        + `컨텍스트 없는 위임은 상위 모델이 아니라 무지한 모델을 쓰는 것이다. 그 에이전트가 이 파일을 쓰면 통과한다. `
        + `계획서가 아닌 문서(조사보고)는 frontmatter 에 kind: 조사보고 를 적는다. `
        + 'Agent 를 부를 수 없는 컨텍스트면 `LENS_PLANNER_GATE=0` 으로 끄고 계획서 `planner_model` 에 사유를 적어라.',
    },
  });
}

main();

/**
 * Lens - PreToolUse Hook (matcher: AskUserQuestion)
 * Two refusals, both about questions the owner said should not reach them.
 *
 * 1. REPORT FIRST (v3.39). Owner, 2026-09-14: "지금도 승인 받기 전에 그냥 질문만 하면
 *    되? 계획서를 보고도 하지 않고 그냥 질문부터 띄우는거야?" — twice in one turn the
 *    approval dialog opened straight after tool calls with no report in front of it.
 *    Rule: since the last tool result or user message, the assistant must have
 *    written at least MIN_CHARS non-space characters.
 *
 *    v3.48 — WHEN it can judge. The transcript is written asynchronously (official
 *    hook docs), so at PreToolUse the report and the call itself may not be in the
 *    file yet. Measured: 1 of 31 dialogs passed since 09-16, and 26 of 34 refusals
 *    had the report in front of them. So the hook first looks for the call being
 *    judged (`tool_use_id`) in the transcript; not there → no verdict (allow).
 *    There → the report window ends at that call, not at the file's last line.
 *
 * 2. NO STOPS DURING AN APPROVED RUN (v3.40). Owner, 2026-09-04: "1,2,3 다 해. 싹다 해
 *    멀 자꾸 하나하나 할라그래 싹 다 하라고." / 2026-08-14: "이제 그만 물어보고 구현하지?"
 *    Once /cc has opened its gate ledger (Phase 0.5) for THIS session and not closed
 *    it (Phase 7.2.5), a run is in progress. During it, a question dialog is allowed
 *    only under one of six headers: the approval before the run, the three stop
 *    kinds, the batched manual-verification check, and the end of the run.
 *
 *    What this enforces is the LABEL. The header is written by the model; a mid-run
 *    "이어서 갈까요?" filed under `실행 승인` passes. The hook turns the rule from
 *    something the model can forget into something it has to misstate on purpose —
 *    the definitions of each label live in skills/cc/SKILL.md 「무정지 실행」.
 *
 * Both rules existed as prose first; prose is what the owner watched fail. A refused
 * tool call with a reason is not skippable.
 *
 * Fail-open on anything unreadable — a broken transcript or ledger must never trap
 * a session. Kill switch: LENS_ASK_GUARD=0
 *
 * Input (stdin): { tool_name, tool_input: { questions: [{ header, … }] }, tool_use_id, transcript_path, session_id, cwd }
 * Output: {} | { hookSpecificOutput: { hookEventName, permissionDecision: 'deny', permissionDecisionReason } }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson, resolveProjectRoot } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('pre-tool-ask');
const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));

const MIN_CHARS = 40;
const TAIL_BYTES = 768 * 1024;

// SoT: skills/cc/SKILL.md 「무정지 실행」. Keep the two in step.
const RUN_HEADERS = ['실행 승인', '정지:비가역', '정지:외부영향', '정지:범위변경', '검증 확인', '실행 종료'];
const normHeader = h => String(h || '').replace(/\s+/g, '').replace(/：/g, ':');
const ALLOWED_HEADERS = new Set(RUN_HEADERS.map(normHeader));

/** The last TAIL_BYTES of the transcript as parsed JSONL entries (oldest first). */
function readTail(file) {
  const stat = fs.statSync(file);
  const size = Math.min(stat.size, TAIL_BYTES);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, stat.size - size);
    const lines = buf.toString('utf-8').split('\n');
    if (stat.size > size) lines.shift(); // first line is probably cut
    return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}

/** Visible text the assistant wrote since the last tool result or user message. */
function recentAssistantText(entries) {
  let text = '';
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.type === 'user') break; // a tool_result or a prompt — the report window ends here
    if (e.type !== 'assistant') continue;
    const content = e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') text = block.text + text;
    }
  }
  return text;
}

/** Index of the assistant entry carrying the tool_use block `id`, or -1. */
function toolUseIndex(entries, id) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.type !== 'assistant') continue;
    const content = e.message && e.message.content;
    if (Array.isArray(content) && content.some(b => b && b.type === 'tool_use' && b.id === id)) return i;
  }
  return -1;
}

/** null when the report is there (or unreadable, or not written yet); otherwise the refusal text. */
function reportProblem(input) {
  const file = input.transcript_path;
  if (!file || !fs.existsSync(file)) return null;
  let entries = readTail(file);
  const callId = typeof input.tool_use_id === 'string' && input.tool_use_id ? input.tool_use_id : null;
  if (callId) {
    const at = toolUseIndex(entries, callId);
    if (at < 0) return null; // this call is not in the transcript yet — nothing to judge
    entries = entries.slice(0, at + 1);
  }
  const written = recentAssistantText(entries);
  if (written.replace(/\s+/g, '').length >= MIN_CHARS) return null;
  return '질문창보다 보고가 먼저다 — 이 질문 앞에 사용자에게 보인 글이 없다. '
    + '먼저 한 메시지로 쓴다: 무엇을 발견·결정했나 · 계획서 링크(있으면) · 선택지마다 무엇이 일어나나 · 추천과 이유. '
    + '사용자가 던진 질문이 있으면 그 답도 여기서.';
}

/**
 * { scope, root } of an open gate ledger created by THIS session, or null.
 *
 * Only this session's ledgers count — a ledger with no session id, or another
 * session's, says nothing about what this session is doing. Stale ledgers (untouched
 * past STALE_HOURS) are dead-run debris.
 */
function activeRun(input) {
  const sessionId = input.session_id;
  if (!sessionId) return null;
  const ledger = require(path.join(PLUGIN_ROOT, 'lib', 'gate-ledger'));
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : undefined;
  const roots = [resolveProjectRoot({ cwd })].concat(ledger.indexedRoots());
  const seen = new Set();
  const now = Date.now();
  for (const root of roots) {
    const key = path.resolve(root).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    for (const l of ledger.loadLedgers(root).ledgers) {
      if (l.sessionId !== sessionId || l.closedAt) continue;
      const stamp = Date.parse(l.updatedAt || l.createdAt || '');
      if (!Number.isNaN(stamp) && now - stamp > ledger.STALE_HOURS * 3600 * 1000) continue;
      return { scope: l.scope, root: path.resolve(root) };
    }
  }
  return null;
}

/** null when the question may be asked during the run; otherwise the refusal text. */
function runProblem(input) {
  const questions = (input.tool_input && Array.isArray(input.tool_input.questions)) ? input.tool_input.questions : [];
  const offending = questions.filter(q => !ALLOWED_HEADERS.has(normHeader(q && q.header)));
  if (!offending.length) return null;
  const run = activeRun(input);
  if (!run) return null;
  const root = run.root.split(path.sep).join('/');
  const pluginRoot = PLUGIN_ROOT.split(path.sep).join('/');
  const closeCmd = `node "${pluginRoot}/scripts/lens-gate.js" close ${run.scope} --root "${root}"`;
  const evidenceCmd = `node "${pluginRoot}/scripts/lens-gate.js" evidence ${run.scope} <id> --note '<답 원문>' --confirmed-by 대표 --root "${root}"`;
  return `이 세션에 승인된 실행이 열려 있다(게이트 원장 ${run.scope}) — 승인 한 번이면 끝까지 묻지 않고 간다. `
    + `이 질문("${String(offending[0].header || '').slice(0, 20)}")의 header 는 허용된 여섯 개가 아니다. `
    + '① 되돌리기 어려운 행동(배포·머지=배포·DB 변경·대량 삭제·force push)이면 `정지:비가역`, 발송·외부 게시·유료 대량 호출이면 `정지:외부영향`, '
    + '승인 범위를 넘어야 하면 `정지:범위변경`, 자동 검증을 끝낸 뒤 manual 행 확인이면 `검증 확인`, 실행이 끝났으면 `실행 종료`, 실행 전 승인이면 `실행 승인` 으로 다시 부른다. '
    + '② 그 어느 것도 아니면 묻지 말고 목표 기준으로 판단해 진행하고 편차 기록에 적는다. '
    + `③ 실행을 취소했거나 이미 끝났는데 원장이 남은 것이면 먼저 닫는다: ${closeCmd} (급하면 LENS_ASK_GUARD=0). `
    + `④ 사용자가 글로 답하면 그 답이 확인이다 — ${evidenceCmd} 으로 기록한다.`;
}

function main() {
  const input = readJsonInput();
  try { store.bind(input); } catch { /* fail-open */ }
  if ((input && input.tool_name) !== 'AskUserQuestion') return writeJson({});
  if (/^(0|false|off|no)$/i.test(String(process.env.LENS_ASK_GUARD || ''))) return writeJson({});

  const problems = [];
  try {
    const p = reportProblem(input);
    if (p) problems.push(p);
  } catch { /* fail-open */ }
  try {
    const p = runProblem(input);
    if (p) problems.push(p);
  } catch { /* fail-open */ }

  if (!problems.length) return writeJson({});
  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[Lens] ${problems.join(' / ')} 그 다음에 AskUserQuestion 을 다시 부른다.`,
    },
  });
}

main();

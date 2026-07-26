/**
 * Lens - PostToolUse Hook (all tools)
 * Mechanically enforces the 2-minute progress report rule.
 *
 * Why a hook: the rule already exists in prose (docs/rules/harness-rules.md §4.4)
 * and in every skill body, and it still gets silently skipped — a background
 * workflow died and "진행 중" was reported twice without any survival check
 * (2026-07-20). The user's VS Code extension has no progress pane, so the user
 * cannot self-check. Prose is not enforcement; an injected reminder is.
 *
 * Triggered: after EVERY tool call (no matcher)
 * Reads/Writes: .lens/progress-report-state.json
 *
 * False-positive suppression: the reminder only fires while background /
 * long-running work is actually in flight. "In flight" = an *async* launch (an
 * explicit run_in_background flag, or async-launch phrasing in a Task/Agent return)
 * or a polling tool was seen within ARM_TTL_MS. A spawn tool's NAME alone never
 * arms: a foreground Task/Agent has already finished by the time PostToolUse fires,
 * so arming on the name made the reminder announce "백그라운드 작업 대기 중" with
 * nothing running at all. A short chat turn with no background work never arms the
 * state, so it stays silent.
 *
 * Suppression must not become evasion: a signal arriving LATER than ARM_TTL_MS no
 * longer wipes the state and restarts the report clock (polling slower than the TTL
 * used to dodge the 2-minute rule indefinitely — Codex 7차 리뷰 P2). The elapsed
 * report time survives; only the decision to fire waits for proof that the signals
 * are still coming. See decide().
 *
 * Why NOT .lens/agent-dashboard.json as the in-flight signal: it cannot be trusted
 * for this. PostToolUse fires ~130ms after an async spawn, so the tracker used to
 * flip every background agent straight to 'done' (실측 2026-07-25 — 10 agents all
 * "done" at launch while two of them ran 311s and 567s). A dashboard that reports
 * "0 running" right after a fan-out would silence this hook permanently. The tool
 * call stream is observed first-hand here, so that is what arms the state.
 *
 * Known limit: a *blocking* tool call emits no PostToolUse until it returns, so
 * nothing can be injected mid-wait for it. Background spawn + poll is the shape
 * this hook covers (and the shape /c·/cc·/ccp actually use).
 *
 * Input (stdin): { tool_name, tool_input, tool_response }
 * Output (stdout): { hookSpecificOutput: { additionalContext } } when a report is
 * due, otherwise {} (silent).
 */

const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const {
  installFailSoftHandlers,
  readJsonInput,
  safeReadJson,
  safeWriteJson,
  withFileLock,
  writeJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-progress');

// ── Constants ────────────────────────────────────────────

// SoT: docs/rules/harness-rules.md §4.4 (2 minutes).
const REPORT_INTERVAL_MS = 120000;
// Dormancy window. Deliberately just longer than the report interval: an agent that
// obeys the rule keeps polling and stays live, while work that actually finished
// goes dormant after at most one extra reminder. Dormant ≠ deleted (see decide()).
const ARM_TTL_MS = 180000;
// How late a signal may be and still count as the SAME polling loop. A gap this
// size means the loop has already blown up to three report windows — slow, but
// unmistakably a loop, so it is judged on the spot. A longer gap is ambiguous
// (see decide()) and needs a second signal before anything fires.
const CONTINUITY_MS = REPORT_INTERVAL_MS * 3;

// Tools that CAN spawn background work. Membership alone proves nothing — an async
// launch has to be evidenced per call (see isBackgroundSignal).
const SPAWN_TOOLS = new Set(['Task', 'Agent']);
// Async-launch phrasing in the spawn tool's own return text. Same discrimination as
// hooks/post-tool-task.js isAsyncLaunch() (실측 2026-07-25: an async launch returns
// "Async agent launched successfully." + "The agent is working in the background.").
// This signal is not redundant: the Agent tool spawns in the background by DEFAULT and
// then carries no run_in_background field at all, so the text is the only evidence.
// 문구 하나로는 부족하다 — 임의의 결과 텍스트가 인용할 수 있다. 실제 async 반환은
// 문장과 함께 `agentId:` / `output_file:` 를 항상 싣는다(실측). 둘 다 요구한다.
// post-tool-task.js 의 isAsyncLaunchEnvelope() 와 같은 모양이다.
// ⚠️ 두 철자를 모두 받는다. 같은 async 런치가 **산문 봉투**로도, **구조화 결과**로도
// 온다(실측 2026-07-26: 이 세션의 async Agent 런치 41건 전부가 toolUseResult
// `{status:'async_launched', isAsync:true, agentId, outputFile, …}`). 산문 철자만
// 요구하면 구조화 payload 에서는 문장이 아예 없어 봉투가 영영 성립하지 않고,
// 백그라운드 런치가 조용히 done 으로 기록된다 — §4.4 강제가 통째로 죽는 경로다.
const ASYNC_LAUNCH_SENTENCE_RE = /Async agent launched|working in the background|"status"\s*:\s*"async_launched"/i;
const ASYNC_LAUNCH_ID_RE = /\bagentId:\s*\S|\boutput_file:\s*\S|"(?:agentId|outputFile|output_file)"\s*:\s*"\S/i;
function isAsyncLaunchEnvelope(text) {
  return !!text && ASYNC_LAUNCH_SENTENCE_RE.test(text) && ASYNC_LAUNCH_ID_RE.test(text);
}
// Workflow runs in the background and notifies on completion — exactly the workload
// §4.4 exists for — but it never arms above: it carries no run_in_background field,
// and its return uses none of the agent wording, so the agent envelope cannot match.
// Its own envelope (실측 2026-07-25, 24/25 launches across 4 sessions) is either the
// launch text "Workflow launched in background. Task ID: <id> … Run ID: wf_<id>" or the
// structured result { status: 'async_launched', taskId, runId, taskType }. Both
// spellings are accepted because which of the two reaches tool_response is not settled.
// 여기서도 문구 하나로는 부족하다 — 마커와 식별자를 함께 요구한다. 산문 인용은 식별자를
// 갖추지 못하고, 실제로 관측된 실패 반환(권한 거부로 아예 뜨지 못한 런치 1건)도 마커·식별자
// 어느 쪽도 싣지 않아 통과하지 못한다.
const WORKFLOW_LAUNCH_RE = /Workflow launched in background|"status"\s*:\s*"async_launched"/i;
const WORKFLOW_ID_RE = /\b(?:Task|Run) ID:\s*\S|"(?:taskId|runId)"\s*:\s*"\S/i;
function isWorkflowLaunchEnvelope(text) {
  return !!text && WORKFLOW_LAUNCH_RE.test(text) && WORKFLOW_ID_RE.test(text);
}
// Calling these means the agent is checking on background work right now.
const POLL_TOOLS = new Set([
  'TaskOutput', 'AgentOutput', 'BashOutput', 'SendMessage', 'KillShell', 'KillTask', 'TaskStop',
]);

// ── Helpers ──────────────────────────────────────────────

function getStatePath() {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(projectRoot, '.lens', 'progress-report-state.json');
}

/**
 * Flatten a tool response into searchable text.
 * The payload is a string, a content-block array, or an object.
 * (Mirrors hooks/post-tool-task.js responseText() — same hook event, same shapes.)
 */
function responseText(input) {
  const raw = input?.tool_response ?? input?.tool_output ?? input?.tool_result ?? input?.response;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // A content-block array carries its payload in .text — flatten it instead of
  // escaping it. JSON.stringify turns every newline into the two characters
  // `\` and `n`, which puts a WORD character immediately before `agentId:` and
  // breaks the \b in ASYNC_LAUNCH_ID_RE. 실측: 배열형 payload 에서 sentence=true
  // 인데 id=false 라 봉투가 성립하지 않고, 진짜 백그라운드 런치가 done 으로 샌다.
  if (Array.isArray(raw)) {
    const flat = raw.map((b) => (typeof b === 'string' ? b : b?.text || '')).join('\n');
    if (flat.trim()) return flat;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return '';
  }
}

/**
 * Is background / long-running work actually in flight?
 *
 * Two failure modes have to be avoided at once:
 *  - false alarm: arming on a spawn tool's NAME fires a "waiting on background work"
 *    reminder after a FOREGROUND Task/Agent, which PostToolUse only sees once the
 *    sub-agent has already finished. So a spawn must show async evidence per call.
 *  - silent skip: the original defect this hook exists for. The Stop hook wipes the
 *    state every turn, so a turn that BEGINS mid-flight has no launch call left to
 *    observe — only polls. That is why the poll signal is kept as-is.
 */
function isBackgroundSignal(toolName, toolInput, input) {
  // 1. Explicit async flag on the call itself. A tool *input* cannot be forged by
  //    whatever text some tool happened to return, so this is the strongest signal.
  if (toolInput && toolInput.run_in_background === true) return true;

  if (SPAWN_TOOLS.has(toolName)) {
    // Declared foreground → the sub-agent is already done. Nothing is in flight.
    if (toolInput && toolInput.run_in_background === false) return false;
    // Name-gated on purpose: other tools' output can merely *quote* the phrase
    // (docs/rules/harness-rules.md §4.5 does), and reading a file must not arm.
    return isAsyncLaunchEnvelope(responseText(input));
  }

  // Name-gated for the same reason as the spawn block: only a Workflow call may
  // present the Workflow envelope, so a doc or report that quotes it cannot arm.
  if (toolName === 'Workflow') return isWorkflowLaunchEnvelope(responseText(input));

  // 2. A poll is a deliberate act of checking work the agent believes is running.
  //    Unlike a spawn name it is not systematically stale; its worst case is the
  //    final collect-the-output call, which self-disarms within one ARM_TTL and
  //    where a one-line "it finished" report is what the reminder itself asks for.
  //    Narrowing it further would mean guessing undocumented poll-response shapes
  //    (§4.5: do not wire what has not been measured) at the cost of the silent skip.
  if (POLL_TOOLS.has(toolName)) return true;
  return false;
}

function toMs(iso) {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? 0 : ms;
}

function buildReminder({ sinceReportSec, waitingSec }) {
  return [
    `[Lens 진행보고 강제 · 2분 규칙] 마지막 보고 기점 이후 ${sinceReportSec}초 경과(기준 120초), 백그라운드 작업 대기 ${waitingSec}초째.`,
    '지금 사용자에게 진행보고를 내라. 세 요소 전부 — 하나라도 빠지면 위반이다:',
    '① 생존확인 실측 — TaskOutput(block=false)·BashOutput·산출물 mtime 으로 실제 확인한 결과를 쓴다. 확인 없이 "진행 중"이라 쓰지 마라.',
    '② 끝난 것/남은 것 N/M.',
    '③ 부분 산출물 먼저 제출 — 대기 중이라도 지금 낼 수 있는 것(초안·확정된 결정·부분 결과)은 지금 낸다.',
    '"아직입니다"·"진행 중입니다"만 적는 보고는 위반이다. 백그라운드 작업이 이미 전부 끝났다면 그 종료 사실을 한 줄로 알리면 된다.',
    '(SoT: docs/rules/harness-rules.md §4.4)',
  ].join('\n');
}

// ── Main ─────────────────────────────────────────────────

function main() {
  const input = readJsonInput();
  const toolName = input?.tool_name || '';
  const toolInput = input?.tool_input || {};
  const signal = isBackgroundSignal(toolName, toolInput, input);
  const statePath = getStatePath();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const decide = () => {
    const state = safeReadJson(statePath, null);

    // Not armed and nothing background about this call → silent (false-positive guard).
    if (!state) {
      if (!signal) return null;
      safeWriteJson(statePath, {
        armedAt: nowIso, lastSignalAt: nowIso, lastReportAt: nowIso, reminders: 0,
      });
      return null;
    }

    // Dormant = no background signal for longer than the TTL, so the work most
    // likely ended. The state is NOT discarded here. Discarding it and re-arming
    // with lastReportAt = now was an unlimited escape hatch: an agent polling
    // slower than ARM_TTL_MS reset its own report clock on every poll, so the
    // reminder never fired and breaking the rule bought silence (Codex 7차 P2).
    // The clock is kept; only the decision to fire is deferred.
    const sinceSignalMs = now - toMs(state.lastSignalAt);
    const dormant = sinceSignalMs > ARM_TTL_MS;

    if (dormant) {
      // An ordinary tool never sees a dormant state — that is exactly what the
      // TTL is for, and it is why a plain Read long after the work ended is silent.
      if (!signal) return null;

      // "Still polling, just slowly" vs "one call out of the blue" are identical
      // in the tool stream at this instant (the final collect-the-output call on
      // finished work looks exactly like a slow poll), and the sources that could
      // separate them are off limits: poll-response shapes are unmeasured (§4.5)
      // and agent-dashboard.json is untrustworthy (see header). So continuity is
      // judged by what the stream does over time — a live job keeps emitting
      // signals, a finished one emits one and stops.
      const continuing = sinceSignalMs <= CONTINUITY_MS || !!state.lateSignalAt;
      if (!continuing) {
        // Stay silent this once and remember it. lastSignalAt is deliberately NOT
        // refreshed: the state stays dormant, so an ordinary tool right after this
        // stray call still cannot fire. Only a second signal revives it — and
        // lastReportAt is untouched, so that second signal is judged on the real
        // elapsed time, not on a clock this call reset.
        state.lateSignalAt = nowIso;
        safeWriteJson(statePath, state);
        return null;
      }
    }

    if (signal) {
      state.lastSignalAt = nowIso;
      // Marker means "the last signal was a late one". A signal at a healthy
      // cadence clears it, so a stray call after a healthy episode is treated as
      // the first ambiguous one again (silent) rather than inheriting old lateness.
      state.lateSignalAt = dormant ? nowIso : null;
    }

    const sinceReportMs = now - toMs(state.lastReportAt);
    if (sinceReportMs < REPORT_INTERVAL_MS) {
      if (signal) safeWriteJson(statePath, state);
      return null;
    }

    state.lastReportAt = nowIso;
    state.reminders = (state.reminders || 0) + 1;
    safeWriteJson(statePath, state);
    return {
      sinceReportSec: Math.round(sinceReportMs / 1000),
      waitingSec: Math.round((now - toMs(state.armedAt)) / 1000),
    };
  };

  let due = null;
  try {
    due = withFileLock(`${statePath}.lock`, decide);
  } catch {
    // Lock contention must never block a tool call.
    due = decide();
  }

  if (!due) {
    writeJson({});
    process.exit(0);
  }

  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: buildReminder(due),
    },
  });
  process.exit(0);
}

main();

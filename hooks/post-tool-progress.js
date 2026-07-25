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
 * long-running work is actually in flight. "In flight" = a background spawn or a
 * polling tool was seen within ARM_TTL_MS. A short chat turn with no background
 * work never arms the state, so it stays silent.
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
 * Input (stdin): { tool_name, tool_input }
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
// Disarm window. Deliberately just longer than the report interval: an agent that
// obeys the rule keeps polling and stays armed, while work that actually finished
// disarms after at most one extra reminder.
const ARM_TTL_MS = 180000;

// Spawning a sub-agent means background work exists (subagents default to background).
const SPAWN_TOOLS = new Set(['Task', 'Agent']);
// Calling these means the agent is checking on background work right now.
const POLL_TOOLS = new Set([
  'TaskOutput', 'AgentOutput', 'BashOutput', 'SendMessage', 'KillShell', 'KillTask', 'TaskStop',
]);

// ── Helpers ──────────────────────────────────────────────

function getStatePath() {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(projectRoot, '.lens', 'progress-report-state.json');
}

function isBackgroundSignal(toolName, toolInput) {
  if (toolInput && toolInput.run_in_background === true) return true;
  if (SPAWN_TOOLS.has(toolName)) return true;
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
  const signal = isBackgroundSignal(toolName, toolInput);
  const statePath = getStatePath();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const decide = () => {
    let state = safeReadJson(statePath, null);

    // Stale armed state = background work finished a while ago → drop it.
    if (state && now - toMs(state.lastSignalAt) > ARM_TTL_MS) state = null;

    // Not armed and nothing background about this call → silent (false-positive guard).
    if (!state) {
      if (!signal) return null;
      safeWriteJson(statePath, {
        armedAt: nowIso, lastSignalAt: nowIso, lastReportAt: nowIso, reminders: 0,
      });
      return null;
    }

    if (signal) state.lastSignalAt = nowIso;

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

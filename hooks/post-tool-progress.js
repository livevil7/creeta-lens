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
 * Reads/Writes: the session store's progress.json (lib/session-store.js); only
 * without a session id, the legacy `<repo>/.lens/progress-report-state.json`.
 *
 * v3.48: one clock per session, and a subagent's calls (`agent_id`) never touch
 * it — the shared repo-level file printed "19914초 경과" for a real 985 s gap and
 * put 29 reminders into 22 worker transcripts. The baseline is the later of the
 * last contact (turn end / user message — stamped by stop.js and
 * scripts/user-prompt-handler.js) and the last reminder.
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
  ensureLensDir,
  installFailSoftHandlers,
  readJsonInput,
  resolveProjectRoot,
  safeReadJson,
  safeWriteJson,
  withFileLock,
  writeJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));
const { classify } = require(path.join(PLUGIN_ROOT, 'lib', 'spawn-envelope'));
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

// Calling these means the agent is checking on background work right now.
// v3.39: SendMessage is not a poll (it talks to a teammate, nothing is awaited),
// and stopping work is the opposite of waiting on it — both used to arm the
// "백그라운드 작업 대기 중" reminder on turns that were waiting on nothing.
const POLL_TOOLS = new Set(['TaskOutput', 'AgentOutput', 'BashOutput']);
const DISARM_TOOLS = new Set(['KillShell', 'KillTask', 'TaskStop']);

// ── Helpers ──────────────────────────────────────────────

/**
 * The session's clock file; without a session id, the legacy repo-level file
 * (then `.lens` is made through ensureLensDir so it stays out of git).
 */
function getStatePath(input) {
  const own = store.filePath('progress');
  if (own) return own;
  const projectRoot = resolveProjectRoot({ cwd: input && typeof input.cwd === 'string' ? input.cwd : undefined });
  ensureLensDir(projectRoot);
  return path.join(projectRoot, '.lens', 'progress-report-state.json');
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
 *
 * v3.48 (D3): spawn tools are judged by lib/spawn-envelope.js classify(), which
 * reads the Workflow envelope before the Agent one. Here the Agent check used to
 * run first and swallowed every Workflow, so a background Workflow never armed.
 */
function isBackgroundSignal(toolName, toolInput, input) {
  const kind = classify(input).kind;
  if (kind === 'workflow-async' || kind === 'agent-async') return true;
  // A spawn tool that did not start background work (finished, denied, failed).
  if (kind !== 'none') return false;

  // Explicit async flag on the call itself (Bash etc.). A tool *input* cannot be
  // forged by whatever text some tool happened to return.
  if (toolInput && toolInput.run_in_background === true) return true;

  // A poll is a deliberate act of checking work the agent believes is running.
  // Unlike a spawn name it is not systematically stale; its worst case is the
  // final collect-the-output call, which self-disarms within one ARM_TTL and
  // where a one-line "it finished" report is what the reminder itself asks for.
  // Narrowing it further would mean guessing undocumented poll-response shapes
  // (§4.5: do not wire what has not been measured) at the cost of the silent skip.
  if (POLL_TOOLS.has(toolName)) return true;
  return false;
}

function toMs(iso) {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? 0 : ms;
}

function buildReminder({ sinceContactSec, sinceSignalSec }) {
  // v3.39: the second number used to be "since this state was first armed" —
  // "대기 4767초째" printed hours after the work had ended. The honest number is
  // how long ago the last background signal was seen.
  return [
    `[Lens 진행보고 강제 · 2분 규칙] 마지막 접점 이후 ${sinceContactSec}초 경과(기준 120초), 마지막 백그라운드 신호 ${sinceSignalSec}초 전.`,
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
  store.bind(input);
  // A worker's tool calls are not the lead's silence (C1): 29 reminders landed in
  // 22 worker transcripts when workers shared the lead's clock.
  if (store.isSubagentCall(input)) {
    writeJson({});
    process.exit(0);
  }
  const toolName = input?.tool_name || '';
  const toolInput = input?.tool_input || {};
  const signal = isBackgroundSignal(toolName, toolInput, input);
  const statePath = getStatePath(input);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const locked = fn => {
    try {
      return withFileLock(`${statePath}.lock`, fn);
    } catch {
      return fn(); // Lock contention must never block a tool call.
    }
  };

  if (DISARM_TOOLS.has(toolName)) {
    // Disarm only: lastContactAt belongs to the user-facing clock and stays.
    locked(() => {
      const s = safeReadJson(statePath, null);
      if (s && s.armedAt) safeWriteJson(statePath, { ...s, armedAt: null, lastSignalAt: null, lateSignalAt: null });
    });
    writeJson({});
    process.exit(0);
  }

  const decide = () => {
    const state = safeReadJson(statePath, null);

    // Not armed and nothing background about this call → silent (false-positive guard).
    // The file may exist unarmed: stop.js and the prompt hook stamp lastContactAt.
    if (!state || !state.armedAt) {
      if (!signal) return null;
      safeWriteJson(statePath, {
        armedAt: nowIso,
        lastSignalAt: nowIso,
        lastContactAt: (state && state.lastContactAt) || null,
        lastReminderAt: (state && state.lastReminderAt) || null,
        reminders: (state && state.reminders) || 0,
        lateSignalAt: null,
      });
      return null;
    }

    // Dormant = no background signal for longer than the TTL, so the work most
    // likely ended. The state is NOT discarded here. Discarding it and re-arming
    // with a fresh clock was an unlimited escape hatch: an agent polling slower
    // than ARM_TTL_MS reset its own report clock on every poll, so the reminder
    // never fired and breaking the rule bought silence (Codex 7차 P2).
    // The clock is kept; only the decision to fire is deferred.
    const prevSignalMs = toMs(state.lastSignalAt);
    const sinceSignalMs = now - prevSignalMs;
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
        // stray call still cannot fire. Only a second signal revives it — and the
        // clock is untouched, so that second signal is judged on the real
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

    // C2: measured from the later of the last contact (turn end / user message),
    // the last reminder, and the arming itself — a reminder is not a contact.
    const baseMs = Math.max(toMs(state.lastContactAt), toMs(state.lastReminderAt), toMs(state.armedAt));
    const sinceContactMs = now - baseMs;
    if (sinceContactMs < REPORT_INTERVAL_MS) {
      if (signal) safeWriteJson(statePath, state);
      return null;
    }

    state.lastReminderAt = nowIso;
    state.reminders = (state.reminders || 0) + 1;
    safeWriteJson(statePath, state);
    return {
      sinceContactSec: Math.round(sinceContactMs / 1000),
      sinceSignalSec: Math.round((signal ? 0 : now - prevSignalMs) / 1000),
    };
  };

  const due = locked(decide);

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

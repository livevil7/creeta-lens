/**
 * Lens - PostToolUse Hook (matcher: Task)
 * Tracks when a sub-agent (Task tool) completes execution.
 *
 * Triggered: After each Task tool invocation completes
 * Writes: .lens/agent-dashboard.json
 *
 * ⚠️ A background (async) launch is NOT a completion. PostToolUse fires as soon as
 * the spawn call returns — measured ~130ms after launch for agents that then ran
 * 311s and 567s (실측 2026-07-25). Marking those 'done' emitted a false
 * "All N agents complete" while every agent was still working. See isAsyncLaunch().
 *
 * ⚠️ …and it fires only once, at launch. No hook observes the completion of a
 * background agent, so this hook cannot ever resolve one. Async launches are
 * therefore parked in the 'launched' status (= unknown), which is excluded from
 * the done count AND from the Stop hook's orphan→error sweep. Neither a false
 * 'done' nor a false 'error'. SoT: docs/rules/harness-rules.md §4.5.
 *
 * Input (stdin): { tool_name, tool_input, tool_response, tool_output, tool_error }
 * Output (stdout): { hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-task');

// Load agent tracker
const {
  completeAgentByDescription,
  markAgentLaunchedByDescription,
  loadDashboard,
  LAUNCHED_STATUS,
} = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

/**
 * Flatten a tool response into searchable text.
 * The payload is a string, or a content-block array [{type:'text',text}], or an object.
 */
function responseText(input) {
  const raw = input?.tool_response ?? input?.tool_output ?? input?.tool_result ?? input?.response;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return '';
  }
}

/**
 * Was this spawn an async (background) launch rather than a finished agent?
 *
 * Evidence (실측 2026-07-25, session transcript): every background spawn carried
 * `tool_input.run_in_background === true`, and the tool result text began with
 * "Async agent launched successfully." plus "agentId: …" / "output_file: …" and
 * the sentence "The agent is working in the background." Two independent signals,
 * so the check does not depend on either one alone.
 */
function isAsyncLaunch(input) {
  if (input?.tool_input?.run_in_background === true) return true;
  // 전경 선언은 조기 거부한다. 텍스트 매칭보다 먼저 와야 한다 — 전경 Task 가
  // 보고문에 "working in the background" 를 인용하면(비동기 동작을 주제로 일하는
  // 에이전트에서 실제로 일어난다) 이미 끝난 Task 가 'launched' 로 찍히고,
  // 그 레코드는 영영 done 이 되지 않아 대시보드가 미해결로 남는다.
  // post-tool-progress.js 의 무장 조건과 같은 순서다 (harness-rules §4.4·§4.5).
  if (input?.tool_input?.run_in_background === false) return false;
  // 필드가 아예 없는 경우(Agent 도구는 기본이 백그라운드라 필드를 안 실는다)에만
  // 텍스트를 본다. 단 **문구 하나로는 부족하다** — 임의의 결과 텍스트가 그 문구를
  // 인용할 수 있고(이 훅 문서를 다루는 에이전트가 실제로 그런다), 그러면 이미 끝난
  // 전경 Task 가 'launched' 로 찍혀 세션 내내 미해결로 남는다.
  // 그래서 **구조화된 봉투**를 요구한다: 실제 async 반환은 "Async agent launched
  // successfully." 와 함께 `agentId:` / `output_file:` 를 항상 싣는다(실측). 산문
  // 인용은 그 조합을 갖추지 못한다.
  return isAsyncLaunchEnvelope(responseText(input));
}

/**
 * Structured async-launch envelope — the launch sentence AND a launch identifier.
 * Shared shape with post-tool-progress.js; if the harness changes this envelope
 * both hooks lose their signal at once (harness-rules §4.4·§4.5).
 */
function isAsyncLaunchEnvelope(text) {
  if (!text) return false;
  const sentence = /Async agent launched|working in the background/i.test(text);
  const identifier = /\bagentId:\s*\S/i.test(text) || /\boutput_file:\s*\S/i.test(text);
  return sentence && identifier;
}

function main() {
  try {
    // Read tool output from stdin
    const input = readJsonInput();

    // Determine completion status
    const hasError = !!(input?.tool_error) || !!(input?.error);
    const status = hasError ? 'error' : 'done';
    const errorMsg = input?.tool_error || input?.error || null;

    // Claude Code does not pass a hook correlation ID, so match by the Task
    // description first and fall back to the most recent running agent.
    const toolInput = input?.tool_input || {};
    const description = toolInput.description || toolInput.prompt || toolInput.task || '';

    // Async launch: the agent has only STARTED. Park it in the dedicated
    // 'launched' status — not 'done' (false completion), and not left 'running'
    // either: the Stop hook fires at the end of every turn and sweeps 'running'
    // into 'error', which would turn a successful background agent into a false
    // failure within seconds. 'launched' says "unknown" and is exempt from that
    // sweep. (durationMs here is the spawn call's own duration, which is why the
    // old path reported "done (132ms)" for agents that ran for minutes.)
    if (!hasError && isAsyncLaunch(input)) {
      const agent = markAgentLaunchedByDescription(description);
      const s = loadDashboard().summary;
      const launched = s.launched ?? 0; // pre-1.1.0 dashboards have no counter
      const name = agent?.name
        || (description ? String(description).split('\n')[0].slice(0, 40) : 'task');
      writeJson({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          matcher: 'Task',
          additionalContext: `[Lens] sub-agent "${name}" 백그라운드 실행 시작 — 상태 '${LAUNCHED_STATUS}'(완료 미관측, done 아님). 이 훅은 완료를 관측할 수 없다: 완료 알림 또는 TaskOutput(block=false)/SendMessage 로 실측하기 전에는 완료로 간주·보고 금지. 대시보드: ${s.running} running / ${launched} ${LAUNCHED_STATUS}(미확정) / ${s.done} done / ${s.error} error. '${LAUNCHED_STATUS}' 는 성공도 실패도 아니며 턴/세션 종료 시 error 로 바뀌지 않는다 — 실패 증거로도 쓰지 마라. 지금부터 2분 주기 진행보고 의무 (docs/rules/harness-rules.md §4.4).`,
          agentId: agent?.id || 'unknown',
          agentName: name,
          status: LAUNCHED_STATUS,
          launch: 'async',
          resolved: false,
          durationMs: null,
          dashboardSummary: {
            total: s.total, running: s.running, launched, done: s.done, error: s.error,
          },
        },
      });
      process.exit(0);
    }

    const agent = completeAgentByDescription(description, status, errorMsg);

    // Build summary for context
    const dashboard = loadDashboard();
    const summary = dashboard.summary;

    // additionalContext is the ONLY field the model actually reads. Surface the
    // just-completed agent's status (and any error) so the orchestrator/Supervisor
    // sees failures without having to cat .lens/agent-dashboard.json. Keep it terse;
    // emphasize errors, stay quiet-ish on routine success.
    const finalStatus = agent?.status || status;

    // Unobserved background launches must poison every "everything is finished"
    // claim, otherwise the false completion just moves from the per-agent status
    // into the aggregate sentence. "All N agents complete" is only printable when
    // nothing is running AND nothing is unresolved.
    const launched = summary.launched ?? 0; // pre-1.1.0 dashboards have no counter
    const launchedNote = launched > 0
      ? ` ⚠️ ${launched} background agent(s) unresolved ('${LAUNCHED_STATUS}' = completion never observed, NOT failed) — verify with TaskOutput(block=false)/completion notice before declaring done.`
      : '';

    let additionalContext;
    if (finalStatus === 'error') {
      additionalContext = `[Lens] sub-agent "${agent?.name || description || 'task'}" FAILED${errorMsg ? `: ${String(errorMsg).slice(0, 200)}` : ''}. Dashboard: ${summary.running} running / ${launched} ${LAUNCHED_STATUS} / ${summary.done} done / ${summary.error} error.`;
    } else if (summary.error > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). ⚠️ ${summary.error} earlier agent(s) errored — check before declaring done. ${summary.running} still running.${launchedNote}`;
    } else if (summary.running > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done. ${summary.running} still running, ${summary.done} done.${launchedNote}`;
    } else if (launched > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). ${summary.done} observed complete, 0 running — NOT "all complete".${launchedNote}`;
    } else {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). All ${summary.done} agents complete.`;
    }

    const response = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        matcher: 'Task',
        additionalContext,
        agentId: agent?.id || 'unknown',
        agentName: agent?.name || 'unknown',
        status: finalStatus,
        durationMs: agent?.durationMs || null,
        dashboardSummary: {
          total: summary.total,
          running: summary.running,
          launched,
          done: summary.done,
          error: summary.error,
        },
      },
    };

    writeJson(response);
    process.exit(0);
  } catch (err) {
    // Never fail loudly
    writeJson({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        matcher: 'Task',
        error: err.message,
      },
    });
    process.exit(0);
  }
}

main();

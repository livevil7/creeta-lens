/**
 * Lens - PostToolUse Hook (matcher: Task)
 * Tracks when a sub-agent (Task tool) completes execution.
 *
 * Triggered: After each Task tool invocation completes
 * Writes: the session dashboard (lib/agent-tracker.js)
 *
 * ⚠️ A background (async) launch is NOT a completion. PostToolUse fires as soon as
 * the spawn call returns — measured ~130ms after launch for agents that then ran
 * 311s and 567s (실측 2026-07-25). Marking those 'done' emitted a false
 * "All N agents complete" while every agent was still working. See lib/spawn-envelope.js.
 *
 * ⚠️ …and it fires only once, at launch. This hook never observes the completion
 * of a background agent, so it cannot resolve one. Async launches are
 * therefore parked in the 'launched' status (= unknown), which is excluded from
 * the done count AND from the Stop hook's orphan→error sweep. Neither a false
 * 'done' nor a false 'error'. SoT: docs/rules/harness-rules.md §4.5.
 *
 * v3.48: the launch is classified by lib/spawn-envelope.js (shared with
 * post-tool-progress.js) — a background Workflow was recorded as "done (102ms).
 * All 1 agents complete" on 24 of 24 launches (D1) — and linked by tool_use_id,
 * the description only as a fallback (D4). A launch is resolved later by
 * hooks/subagent-stop.js (SubagentStop, by agentId) or by this hook's --failed
 * mode (PostToolUseFailure, by tool_use_id → error).
 *
 * Input (stdin): { session_id, tool_name, tool_input, tool_response, tool_use_id }
 *                (--failed: PostToolUseFailure — { …, error, is_interrupt })
 * Output (stdout): { hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-task');

const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));
const { classify, responseText } = require(path.join(PLUGIN_ROOT, 'lib', 'spawn-envelope'));

// Load agent tracker
const {
  completeAgentByToolUseId,
  markAgentLaunched,
  claimLaunchedNotice,
  loadDashboard,
  LAUNCHED_STATUS,
} = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

const FAILED_MODE = process.argv.includes('--failed');

/** One line, only when the unresolved count moved since it was last said (C4). */
function launchedNote() {
  const { launched, changed } = claimLaunchedNotice();
  return launched > 0 && changed
    ? ` 백그라운드 미확정 ${launched}건 — 완료 알림 전에는 완료로 보지 마라.`
    : '';
}

/** PostToolUseFailure: the spawn failed after starting — record it as error. */
function recordFailure(input, description) {
  const errorMsg = String(input?.error || 'tool failed');
  const agent = completeAgentByToolUseId(input?.tool_use_id || null, 'error', errorMsg, description);
  const name = agent?.name || description || 'task';
  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext: `[Lens] sub-agent "${String(name).split('\n')[0].slice(0, 40)}" FAILED: ${errorMsg.slice(0, 200)}`,
    },
  });
  process.exit(0);
}

function main() {
  try {
    // Read tool output from stdin
    const input = readJsonInput();
    store.bind(input);

    // Determine completion status
    const hasError = !!(input?.tool_error) || !!(input?.error);
    const status = hasError ? 'error' : 'done';
    const errorMsg = input?.tool_error || input?.error || null;

    // tool_use_id links this call to its PreToolUse entry; the description is
    // only the fallback for an entry registered without one.
    const toolInput = input?.tool_input || {};
    const toolUseId = input?.tool_use_id || null;
    const description = toolInput.description || toolInput.prompt || toolInput.task || toolInput.name || '';
    if (FAILED_MODE) recordFailure(input, description);
    const spawn = classify(input);

    // Async launch: the agent has only STARTED. Park it in the dedicated
    // 'launched' status — not 'done' (false completion), and not left 'running'
    // either: the Stop hook fires at the end of every turn and sweeps 'running'
    // into 'error', which would turn a successful background agent into a false
    // failure within seconds. 'launched' says "unknown" and is exempt from that
    // sweep. (durationMs here is the spawn call's own duration, which is why the
    // old path reported "done (132ms)" for agents that ran for minutes.)
    // 'unknown' (a Workflow whose result shows neither a launch nor a finished run)
    // is parked as launched too: recording it done is the D1 false completion.
    const background = spawn.kind === 'agent-async' || spawn.kind === 'workflow-async' || spawn.kind === 'unknown';
    if (!hasError && background) {
      const agent = markAgentLaunched({
        toolUseId, description, agentId: spawn.agentId, runId: spawn.runId, name: spawn.name,
      });
      const s = loadDashboard().summary;
      const launched = s.launched ?? 0; // pre-1.1.0 dashboards have no counter
      const name = agent?.name
        || (spawn.name || (description ? String(description).split('\n')[0].slice(0, 40) : 'task'));
      // Its SubagentStop may have landed first — then the tracker already recorded done.
      const earlyDone = agent?.status === 'done';
      writeJson({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          matcher: 'Task',
          additionalContext: earlyDone
            ? `[Lens] "${name}" 백그라운드 실행이 이미 끝났다(종료 이벤트가 먼저 도착).${launchedNote()}`
            : `[Lens] "${name}" 백그라운드 실행 시작('${LAUNCHED_STATUS}' — 완료 아님).${launchedNote()}`,
          agentId: agent?.id || 'unknown',
          agentName: name,
          status: earlyDone ? 'done' : LAUNCHED_STATUS,
          launch: 'async',
          resolved: earlyDone,
          durationMs: null,
          dashboardSummary: {
            total: s.total, running: s.running, launched, done: s.done, error: s.error,
          },
        },
      });
      process.exit(0);
    }

    const agent = completeAgentByToolUseId(toolUseId, status, errorMsg, description);

    // Build summary for context
    const dashboard = loadDashboard();
    const summary = dashboard.summary;

    // additionalContext is the ONLY field the model actually reads. Surface the
    // just-completed agent's status (and any error) so the orchestrator/Supervisor
    // sees failures without having to cat .lens/agent-dashboard.json. Keep it terse;
    // emphasize errors, stay quiet-ish on routine success.
    // Skill-invocation audit (v3.34). The dispatch template makes the worker
    // open with `Skill invoked: {name}` when a skill was assigned, and the
    // Supervisor fails the subtask if that line is missing. Both halves were
    // prose. The contract is worth keeping — transcripts carry 590 real
    // `Skill invoked: ui-ux-pro-max` lines, and it is the only thing enforcing
    // the owner's hard rule that any visual work goes through ui-ux-pro-max —
    // but the check ran only if the Supervisor remembered to look. Here it is
    // mechanical: the prompt says a skill was required, so the report must say
    // it ran. Advisory, because a worker can legitimately report a blocker
    // before reaching its first action.
    const promptText = String(input?.tool_input?.prompt || '');
    const requiredSkill = (promptText.match(/필수 실행 스킬[\s\S]{0,200}?할당된 스킬:\s*`?([\w-]+)`?/) || [])[1];
    const skillAudit = requiredSkill && requiredSkill !== 'general'
      && !/Skill invoked:\s*`?[\w-]+/.test(responseText(input))
      ? ` ⚠️ 이 Worker 에는 필수 스킬 \`${requiredSkill}\` 이 할당됐는데 보고에 \`Skill invoked: ${requiredSkill}\` 이 없다`
        + ` — 스킬을 건너뛴 정황이다. Supervisor 채점에서 해당 서브태스크를 fail 로 두고 재할당하라.`
      : '';

    const finalStatus = agent?.status || status;

    // Unobserved background launches must poison every "everything is finished"
    // claim, otherwise the false completion just moves from the per-agent status
    // into the aggregate sentence. "All N agents complete" is only printable when
    // nothing is running AND nothing is unresolved.
    const launched = summary.launched ?? 0; // pre-1.1.0 dashboards have no counter
    const launchedLine = launchedNote(); // also records a drop to 0

    let additionalContext;
    if (finalStatus === 'error') {
      additionalContext = `[Lens] sub-agent "${agent?.name || description || 'task'}" FAILED${errorMsg ? `: ${String(errorMsg).slice(0, 200)}` : ''}. Dashboard: ${summary.running} running / ${launched} ${LAUNCHED_STATUS} / ${summary.done} done / ${summary.error} error.` + skillAudit;
    } else if (summary.error > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). ⚠️ ${summary.error} earlier agent(s) errored — check before declaring done. ${summary.running} still running.${launchedLine}` + skillAudit;
    } else if (summary.running > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done. ${summary.running} still running, ${summary.done} done.${launchedLine}` + skillAudit;
    } else if (launched > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). ${summary.done} observed complete, 0 running — NOT "all complete".${launchedLine}` + skillAudit;
    } else {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). All ${summary.done} agents complete.` + skillAudit;
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
        hookEventName: FAILED_MODE ? 'PostToolUseFailure' : 'PostToolUse',
        matcher: 'Task',
        error: err.message,
      },
    });
    process.exit(0);
  }
}

main();

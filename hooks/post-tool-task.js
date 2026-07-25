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
 * Input (stdin): { tool_name, tool_input, tool_response, tool_output, tool_error }
 * Output (stdout): { hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-task');

// Load agent tracker
const { completeAgentByDescription, loadDashboard } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

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
  const text = responseText(input);
  if (/Async agent launched/i.test(text)) return true;
  if (/working in the background/i.test(text)) return true;
  return false;
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

    // Async launch: the agent has only STARTED. Leave it 'running' — do not
    // complete it and do not count it as done. An honest "unresolved" beats a
    // false completion. (durationMs here is the spawn call's own duration, which
    // is why the old path reported "done (132ms)" for agents that ran for minutes.)
    if (!hasError && isAsyncLaunch(input)) {
      const s = loadDashboard().summary;
      const name = description ? String(description).split('\n')[0].slice(0, 40) : 'task';
      writeJson({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          matcher: 'Task',
          additionalContext: `[Lens] sub-agent "${name}" 백그라운드 실행 시작 — 상태 미확정(done 아님). 이 훅은 완료를 관측할 수 없다: 완료 알림 또는 TaskOutput(block=false)/SendMessage 로 실측하기 전에는 완료로 간주·보고 금지. 대시보드: ${s.running} running / ${s.done} done / ${s.error} error. 지금부터 2분 주기 진행보고 의무 (docs/rules/harness-rules.md §4.4).`,
          agentName: name,
          status: 'running',
          launch: 'async',
          resolved: false,
          durationMs: null,
          dashboardSummary: {
            total: s.total, running: s.running, done: s.done, error: s.error,
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
    let additionalContext;
    if (finalStatus === 'error') {
      additionalContext = `[Lens] sub-agent "${agent?.name || description || 'task'}" FAILED${errorMsg ? `: ${String(errorMsg).slice(0, 200)}` : ''}. Dashboard: ${summary.running} running / ${summary.done} done / ${summary.error} error.`;
    } else if (summary.error > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done (${agent?.durationMs ?? '?'}ms). ⚠️ ${summary.error} earlier agent(s) errored — check before declaring done. ${summary.running} still running.`;
    } else if (summary.running > 0) {
      additionalContext = `[Lens] sub-agent "${agent?.name || 'task'}" done. ${summary.running} still running, ${summary.done} done.`;
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

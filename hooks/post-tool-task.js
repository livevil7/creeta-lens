/**
 * Lens - PostToolUse Hook (matcher: Task)
 * Tracks when a sub-agent (Task tool) completes execution.
 *
 * Triggered: After each Task tool invocation completes
 * Writes: .lens/agent-dashboard.json
 *
 * Input (stdin): { tool_name, tool_input, tool_output, tool_error }
 * Output (stdout): { hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('post-tool-task');

// Load agent tracker
const { completeAgentByDescription, loadDashboard } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

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

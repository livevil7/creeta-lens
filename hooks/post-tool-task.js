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
const { completeAgent, loadDashboard } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    // Read tool output from stdin
    const input = readJsonInput();

    // Determine completion status
    const hasError = !!(input?.tool_error) || !!(input?.error);
    const status = hasError ? 'error' : 'done';
    const errorMsg = input?.tool_error || input?.error || null;

    // Try to find agent ID from the corresponding PreToolUse hook
    // Claude Code doesn't pass correlation IDs between hooks, so we match
    // the most recent running agent.
    const agentId = null; // Will match last running agent
    const agent = completeAgent(agentId, status, errorMsg);

    // Build summary for context
    const dashboard = loadDashboard();
    const summary = dashboard.summary;

    const response = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        matcher: 'Task',
        agentId: agent?.id || 'unknown',
        agentName: agent?.name || 'unknown',
        status: agent?.status || status,
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

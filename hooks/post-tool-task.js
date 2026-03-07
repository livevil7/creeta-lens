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

// Load agent tracker
const { completeAgent, loadDashboard } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    // Read tool output from stdin
    const input = readStdin();

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

    console.log(JSON.stringify(response));
    process.exit(0);
  } catch (err) {
    // Never fail loudly
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        matcher: 'Task',
        error: err.message,
      },
    }));
    process.exit(0);
  }
}

/**
 * Read JSON input from stdin (cross-platform).
 */
function readStdin() {
  try {
    const data = fs.readFileSync(0, 'utf-8');
    if (data) return JSON.parse(data);
  } catch {
    // stdin not available or not JSON
  }

  if (process.argv[2]) {
    try {
      return JSON.parse(process.argv[2]);
    } catch {}
  }

  return {};
}

main();

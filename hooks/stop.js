/**
 * Lens - Stop Hook
 * Records final session state when Claude Code's main agent stops.
 *
 * Triggered: When the main agent finishes (Stop event)
 * Writes: .lens/agent-dashboard.json (marks session complete, orphaned agents as error)
 *
 * Input (stdin): { stop_reason }
 * Output (stdout): { hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');

// Load agent tracker
const { endSession, loadDashboard, getDashboardPath } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    // Read stop reason from stdin
    const input = readStdin();
    const stopReason = input?.stop_reason || 'unknown';

    // Determine session end status
    const sessionStatus = stopReason === 'error' ? 'error' : 'completed';

    // End the session and mark orphaned agents
    const dashboard = endSession(sessionStatus);
    const summary = dashboard.summary;

    // Log final state
    const response = {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        sessionId: dashboard.session.id,
        sessionStatus: dashboard.session.status,
        stopReason,
        finalSummary: {
          total: summary.total,
          done: summary.done,
          error: summary.error,
          sessionDuration: calculateDuration(dashboard.session.startedAt, dashboard.session.endedAt),
        },
        dashboardPath: getDashboardPath(),
      },
    };

    console.log(JSON.stringify(response));
    process.exit(0);
  } catch (err) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        error: err.message,
      },
    }));
    process.exit(0);
  }
}

/**
 * Calculate human-readable duration string.
 */
function calculateDuration(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Read JSON input from stdin (cross-platform).
 */
function readStdin() {
  try {
    const data = fs.readFileSync(0, 'utf-8');
    if (data) return JSON.parse(data);
  } catch {}

  if (process.argv[2]) {
    try {
      return JSON.parse(process.argv[2]);
    } catch {}
  }

  return {};
}

main();

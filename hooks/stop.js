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

const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('stop');

// Load agent tracker
const { endSession, loadDashboard, getDashboardPath } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    // Read stop reason from stdin
    const input = readJsonInput();
    const stopReason = input?.stop_reason || 'unknown';

    // Determine session end status
    const sessionStatus = stopReason === 'error' ? 'error' : 'completed';

    // End the session and mark orphaned agents
    const dashboard = endSession(sessionStatus);
    const summary = dashboard.summary;

    // Stop hook does not support hookSpecificOutput in Claude Code schema
    // Dashboard is already saved by endSession() above
    writeJson({});
    process.exit(0);
  } catch (err) {
    writeJson({});
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

main();

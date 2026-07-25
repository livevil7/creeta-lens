/**
 * Lens - Stop Hook
 * Records final session state when Claude Code's main agent stops.
 *
 * Triggered: When the main agent finishes (Stop event — i.e. at the end of EVERY
 * turn, not only once per session)
 * Writes: .lens/agent-dashboard.json (marks session complete, orphaned agents as error)
 *
 * ⚠️ "Orphaned" means `running`/`pending` only. Background agents parked in
 * `launched` are exempt from the error sweep by endSession(): the hooks never
 * observe their completion, and because this hook runs at every turn boundary the
 * sweep would otherwise declare a healthy background agent failed seconds after
 * launch. Unobserved ≠ failed. SoT: docs/rules/harness-rules.md §4.5.
 *
 * Input (stdin): { stop_reason }
 * Output (stdout): { hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
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

    // Reset the 2-minute progress-report clock: the turn just ended, so the user
    // has received a message. Re-arms on the next background spawn/poll.
    // (See hooks/post-tool-progress.js)
    clearProgressReportState();

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
 * Delete the progress-report state file (fail-soft).
 */
function clearProgressReportState() {
  try {
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const statePath = path.join(projectRoot, '.lens', 'progress-report-state.json');
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  } catch {}
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

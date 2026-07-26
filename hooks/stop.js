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

    // Stamp the 2-minute progress-report clock: the turn just ended, so the user
    // has received a message. The state itself is kept — deleting it would let a
    // later poll re-arm with a fresh clock and postpone the reminder.
    // (See hooks/post-tool-progress.js)
    resetProgressReportClock();

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
 * Reset the report clock without discarding the state (fail-soft).
 *
 * Deleting the file loses the timestamp of the message that just reached the
 * user. If background work is still running and the next poll lands more than
 * 120s later, that poll creates fresh state with `lastReportAt = now` and the
 * reminder is pushed out another two minutes — the same "late signal resets the
 * clock" evasion that post-tool-progress.js was fixed to close (harness-rules
 * §4.4). So stamp the report time instead: the turn just ended, so the user
 * *has* been told something, and the 2-minute window starts from here.
 *
 * The arming fields are left alone. If work is still in flight the next signal
 * finds a live state and measures against this stamp; if nothing is in flight
 * the TTL lets it go dormant on its own.
 */
function resetProgressReportClock() {
  try {
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const statePath = path.join(projectRoot, '.lens', 'progress-report-state.json');
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.lastReportAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    // Unreadable/corrupt state: fall back to removing it rather than leaving a
    // broken file that the next hook cannot parse.
    try {
      const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      fs.unlinkSync(path.join(projectRoot, '.lens', 'progress-report-state.json'));
    } catch {}
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

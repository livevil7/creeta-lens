/**
 * Lens - Stop Hook
 * Records final session state when Claude Code's main agent stops, and refuses
 * the stop while gates are unmet (v3.35).
 *
 * Triggered: When the main agent finishes (Stop event — i.e. at the end of EVERY
 * turn, not only once per session)
 * Writes: .lens/agent-dashboard.json (marks session complete, orphaned agents as error)
 *         .lens/gate-block-state.json (consecutive-block counter, per session)
 *
 * ⚠️ "Orphaned" means `running`/`pending` only. Background agents parked in
 * `launched` are exempt from the error sweep by endSession(): the hooks never
 * observe their completion, and because this hook runs at every turn boundary the
 * sweep would otherwise declare a healthy background agent failed seconds after
 * launch. Unobserved ≠ failed. SoT: docs/rules/harness-rules.md §4.5.
 *
 * GATE ENFORCEMENT (v3.35)
 * ------------------------
 * This hook has sat on the Stop event since v3.x and never once refused a stop —
 * both its success and its failure path wrote `{}`. Every "do not report done
 * while a criterion is unmet" rule in /cc was therefore prose the model graded
 * itself against. It now reads `.lens/gates/*.json` and returns
 * `{decision:"block", reason}` while anything is outstanding.
 *
 * No ledger → byte-identical to the old behavior. That is the no-regression
 * floor: only a run that deliberately created a ledger can be blocked.
 *
 * Input (stdin): { stop_reason, session_id, cwd }
 * Output (stdout): {} | { systemMessage } | { decision: "block", reason }
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const {
  installFailSoftHandlers, readJsonInput, writeJson,
  safeLog, safeReadJson, safeWriteJson, withFileLock,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
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

    // Gate enforcement runs AFTER the bookkeeping above: the dashboard and the
    // report clock must be correct whether or not this turn is allowed to end.
    const verdict = gateVerdict(input);
    if (verdict) {
      writeJson(verdict);
      process.exit(0);
    }

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
 * Decide whether this stop is refused.
 *
 * Returns the object to print, or null to fall through to the old `{}`.
 * Never throws: a bug in gate logic costs one sloppy turn, a trapped session
 * costs the machine. Every failure path here returns null (= allow).
 */
function gateVerdict(input) {
  try {
    if (!gateEnforcementEnabled()) return null;

    const projectRoot = process.env.CLAUDE_PROJECT_DIR
      || (input && typeof input.cwd === 'string' && input.cwd ? input.cwd : null)
      || process.cwd();

    const ledger = require(path.join(PLUGIN_ROOT, 'lib', 'gate-ledger'));
    const loaded = ledger.loadLedgers(projectRoot);

    // Fast path — no ledger anywhere means this hook behaves exactly as it did
    // before v3.35. Most turns in most repos land here.
    if (!loaded.ledgers.length && !loaded.invalid.length) return null;

    const evaluation = ledger.evaluate(loaded);
    const statePath = ledger.blockStatePath(projectRoot);
    const sessionKey = crypto.createHash('sha256')
      .update(String((input && input.session_id) || 'anonymous'))
      .digest('hex').slice(0, 24);

    const decide = () => {
      const previous = safeReadJson(statePath, null);
      const decision = ledger.decideBlock(evaluation, previous, { sessionKey });
      safeWriteJson(statePath, decision.state);
      return decision;
    };

    let decision;
    try {
      decision = withFileLock(`${statePath}.lock`, decide, { timeoutMs: 1500 });
    } catch (lockErr) {
      // A contended counter is not worth trapping a turn over, but it is also
      // not a reason to skip the gate: decide unlocked and accept a possible
      // lost increment (the cap only ever undercounts this way).
      safeLog(`gate lock unavailable (${lockErr.message}); deciding unlocked`);
      decision = decide();
    }

    if (decision.block) return { decision: 'block', reason: decision.reason };
    if (decision.released && decision.systemMessage) return { systemMessage: decision.systemMessage };
    return null;
  } catch (err) {
    safeLog(`gate verdict skipped: ${err && err.message}`);
    return null;
  }
}

/**
 * Kill switch. `lens.config.json` decides by default; the env var overrides it
 * for one shell (`LENS_GATE_ENFORCEMENT=0 claude ...`) without editing config.
 */
function gateEnforcementEnabled() {
  const env = process.env.LENS_GATE_ENFORCEMENT;
  if (env !== undefined && env !== '') return !/^(0|false|off|no)$/i.test(env);
  const config = safeReadJson(path.join(PLUGIN_ROOT, 'lens.config.json'), {}) || {};
  return config.gateEnforcement !== false;
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

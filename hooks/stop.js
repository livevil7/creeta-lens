/**
 * Lens - Stop Hook
 * Refuses the stop while this session's gates are unmet, and otherwise records
 * the turn end (session dashboard + progress-report contact clock).
 *
 * Triggered: at the end of EVERY main-agent turn (Stop event).
 * Reads:  .lens/gates/*.json (this repo + repos in the ledger index), filtered to this session
 * Writes: session store blocks.json (block counter), progress.json (lastContactAt),
 *         dashboard via agent-tracker endSession() — all per session_id (lib/session-store);
 *         without a session id the legacy repo files are used.
 *
 * v3.48 — WHY: 3.47 blocked turns that ended while a worker was still running
 * (2a412ea0: 6/6 blocks), blocked on manual gates only the user can meet, printed
 * "이어서 작업합니다" / its release notice on the user's screen (09-21: 52 times),
 * and marked the session completed BEFORE deciding to block.
 *
 * Order:
 *  1. Background work in flight (`background_tasks` has a subagent / workflow /
 *     teammate / cloud session) → pass silently. The turn ended but the run did
 *     not: stamp the contact clock, do NOT mark the session completed. `shell`,
 *     `monitor` and `MCP task` do not count — a dev server or a Monitor lives for
 *     the whole session and would switch the gate off for good. Nor does an entry
 *     whose status says it is finished or idle (an idle teammate lingers too).
 *     Field absent (older Claude Code; an empty array means "none", not "unknown")
 *     → an armed progress clock (signal < 180 s ago) or a launched/running agent
 *     on this session's dashboard counts as waiting.
 *  2. Gate verdict. Block → `{decision, reason}` only (model-facing) and nothing
 *     else is recorded. Release after MAX_BLOCKS is SILENT (`{}`): a Stop
 *     `additionalContext` continues the conversation (official contract), so a
 *     notice would force a third turn after two blocks already said it all.
 *  3. Pass → endSession() and the contact stamp.
 * Any exception → `{}` (pass). Kill switch: LENS_GATE_ENFORCEMENT=0.
 *
 * ⚠️ endSession() sweeps `running`/`pending` agents into error but leaves
 * `launched` alone — unobserved ≠ failed (docs/rules/harness-rules.md §4.5).
 *
 * Input (stdin): official Stop payload { session_id, cwd, stop_hook_active, background_tasks, ... }
 * Output (stdout): {} | { decision: "block", reason }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const {
  installFailSoftHandlers, readJsonInput, writeJson,
  safeLog, safeReadJson, safeWriteJson, withFileLock, resolveProjectRoot,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('stop');

const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));
const { endSession, loadDashboard } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

/** `background_tasks[].type` labels that mean "the run is waiting on work that will come back". */
const WAIT_TYPES = new Set(['subagent', 'workflow', 'teammate', 'cloud session']);
/**
 * A task in one of these states is not work in flight — an idle teammate can sit
 * in the list for the whole session and would switch the gate off for good. A
 * missing or unknown status still counts as waiting (the list is "in-flight" by
 * contract; only a known finished/idle state overrides that).
 */
const NOT_WAITING_STATUS = /^(completed|complete|done|failed|error|killed|stopped|cancelled|canceled|idle)$/i;
/** Same as hooks/post-tool-progress.js ARM_TTL_MS. */
const ARM_TTL_MS = 180000;

function main() {
  try {
    const input = readJsonInput() || {};
    store.bind(input);

    if (waitingOnBackground(input)) {
      stampContact(input);
      writeJson({});
      process.exit(0);
    }

    const verdict = gateVerdict(input);
    if (verdict && verdict.decision === 'block') {
      writeJson(verdict);
      process.exit(0);
    }

    try {
      endSession(input.stop_reason === 'error' ? 'error' : 'completed');
    } catch (err) {
      safeLog(`endSession skipped: ${err && err.message}`);
    }
    stampContact(input);
    writeJson(verdict || {});
    process.exit(0);
  } catch (err) {
    writeJson({});
    process.exit(0);
  }
}

function projectRootOf(input) {
  return resolveProjectRoot({ cwd: input && typeof input.cwd === 'string' ? input.cwd : undefined });
}

function toMs(value) {
  return typeof value === 'number' ? value : Date.parse(value || '');
}

function waitingOnBackground(input) {
  if (Array.isArray(input.background_tasks)) {
    return input.background_tasks.some(t => t
      && WAIT_TYPES.has(String(t.type || '').toLowerCase())
      && !(typeof t.status === 'string' && NOT_WAITING_STATUS.test(t.status.trim())));
  }
  // Field absent: judge from what Lens itself observed.
  const progress = store.filePath('progress')
    ? store.read('progress', null)
    : safeReadJson(path.join(projectRootOf(input), '.lens', 'progress-report-state.json'), null);
  if (progress && typeof progress === 'object' && progress.armedAt) {
    const last = toMs(progress.lastSignalAt);
    if (Number.isFinite(last) && Date.now() - last < ARM_TTL_MS) return true;
  }
  const board = loadDashboard();
  return !!(board && Array.isArray(board.agents)
    // Workflow entries are excluded: no hook observes a Workflow finishing, so one
    // launched Workflow would read as "waiting" for the rest of the session.
    && board.agents.some(a => a && a.tool !== 'Workflow' && (a.status === 'launched' || a.status === 'running')));
}

/**
 * The user has just been shown this turn's text: that is the progress-report
 * contact (docs/rules/harness-rules.md §4.4). The rest of the clock state is
 * kept — deleting it would let a late poll re-arm with a fresh clock.
 */
function stampContact(input) {
  try {
    const nowIso = new Date().toISOString();
    const stamp = s => ({ ...(s && typeof s === 'object' && !Array.isArray(s) ? s : {}), lastContactAt: nowIso });
    if (store.filePath('progress')) {
      store.update('progress', stamp, null);
      return;
    }
    // Legacy (no session id): only an existing repo file — never create `.lens/` here.
    const legacy = path.join(projectRootOf(input), '.lens', 'progress-report-state.json');
    if (fs.existsSync(legacy)) safeWriteJson(legacy, stamp(safeReadJson(legacy, null)));
  } catch (err) {
    safeLog(`contact stamp skipped: ${err && err.message}`);
  }
}

/**
 * Decide whether this stop is refused. Returns the object to print, or null.
 * Never throws: a bug in gate logic costs one sloppy turn, a trapped session
 * costs the machine. Every failure path here returns null (= allow).
 */
function gateVerdict(input) {
  try {
    if (!gateEnforcementEnabled()) return null;

    const projectRoot = projectRootOf(input);
    const ledger = require(path.join(PLUGIN_ROOT, 'lib', 'gate-ledger'));
    // v3.39: /cc creates its ledger in the repo it works in, while a workspace
    // session's cwd is the workspace. Ledgers register their repo in a user-level
    // index; this session's own ledgers are loaded from every registered repo.
    const loaded = ledger.loadLedgers(projectRoot);
    const roots = typeof ledger.indexedRoots === 'function' ? ledger.indexedRoots() : [];
    const seen = new Set([path.resolve(projectRoot).toLowerCase()]);
    for (const root of roots) {
      const key = path.resolve(root).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const other = ledger.loadLedgers(root);
      loaded.ledgers.push(...other.ledgers);
      // An unparseable file carries no session id, so it cannot be tied to this
      // session — only the current repo's broken ledgers are a reason to block.
      for (const bad of other.invalid) safeLog(`unreadable ledger ignored: ${root} ${bad.file} (${bad.error})`);
    }
    // A ledger another session opened is not this turn's obligation.
    const sessionId = input && input.session_id;
    if (sessionId) loaded.ledgers = loaded.ledgers.filter(l => !l.sessionId || l.sessionId === sessionId);

    // Fast path — no ledger anywhere. Most turns in most repos land here.
    if (!loaded.ledgers.length && !loaded.invalid.length) return null;

    const evaluation = ledger.evaluate(loaded);
    const cli = path.join(PLUGIN_ROOT, 'scripts', 'lens-gate.js');
    let decision = null;

    if (store.filePath('blocks')) {
      // Per-session counter; a store that cannot be written leaves decision null → pass.
      store.update('blocks', (previous) => {
        decision = ledger.decideBlock(evaluation, previous, { cli });
        return decision.state;
      }, null);
    } else {
      const statePath = ledger.blockStatePath(projectRoot);
      const decide = () => {
        decision = ledger.decideBlock(evaluation, safeReadJson(statePath, null), { cli });
        safeWriteJson(statePath, decision.state);
      };
      try {
        withFileLock(`${statePath}.lock`, decide, { timeoutMs: 1500 });
      } catch (lockErr) {
        safeLog(`gate lock unavailable (${lockErr.message}); deciding unlocked`);
        decide();
      }
    }

    if (!decision) return null;
    if (decision.block) return { decision: 'block', reason: decision.reason };
    if (decision.notice) safeLog(`gate released: ${String(decision.notice).slice(0, 200)}`);
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

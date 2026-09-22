/**
 * Lens - Session Store (v3.48.0)
 *
 * Per-session runtime state for Lens hooks, keyed by the hook input's
 * `session_id` and kept in the user's config dir — never in the repo.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 3.47 the progress-report clock, the agent dashboard and the Stop-gate
 * block counter lived in `<repo>/.lens/*.json`, the repo being whatever the
 * hook's cwd resolved to. Two consequences, both measured on 2026-09-21/22:
 *  - Sessions started from the workspace folder (not a git repo) all shared one
 *    set of files: one session's SessionStart wiped another's dashboard, a
 *    worker's tool call spent the lead's report clock ("19914초 경과" when the
 *    real gap was 985 s), and the TOP-tier cap counted other sessions' spawns.
 *  - A session that changed cwd read a different, stale set of files, so the
 *    Stop gate's "2 blocks then release" cap restarted per folder.
 * Keying by session id removes both at once. The files are:
 *   progress.json  — progress-report clock (hooks/post-tool-progress.js)
 *   dashboard.json — agent dashboard (lib/agent-tracker.js); also the record of
 *                    top-tier delegations read by hooks/pre-tool-plan-doc.js
 *   blocks.json    — Stop-gate block counter (hooks/stop.js)
 *
 * Gate ledgers (`.lens/gates/`) are NOT moved: a ledger belongs to a plan and
 * stays in the repo so /cd can close it.
 *
 * FALLBACK
 * --------
 * No usable session id (external runner, old Claude Code) → every accessor
 * returns null and the caller keeps its legacy repo-level path. Nothing here
 * throws; a broken store must never trap a session.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { safeEnsureDir, safeReadJson, safeWriteJson, withFileLock } = require('./hook-utils');

const FILES = {
  progress: 'progress.json',
  dashboard: 'dashboard.json',
  blocks: 'blocks.json',
};

const RETENTION_DAYS = 7;

let bound = { sessionId: null, agentId: null };

/** Session ids become directory names, so they are validated, not escaped. */
function cleanId(id) {
  const s = String(id == null ? '' : id).trim();
  return /^[A-Za-z0-9._-]{1,128}$/.test(s) && !/^\.+$/.test(s) ? s : null;
}

/** `CLAUDE_CONFIG_DIR` relocates settings, sessions and plugins — honour it. */
function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function sessionsRoot() {
  return process.env.LENS_SESSION_STORE || path.join(configDir(), 'lens', 'sessions');
}

/**
 * Bind this hook process to the session in its input. Hooks are one process per
 * event, so a module-level binding is safe and spares every caller a parameter.
 */
function bind(input) {
  const agentId = input && typeof input.agent_id === 'string' && input.agent_id.trim() ? input.agent_id.trim() : null;
  bound = {
    sessionId: cleanId(input && input.session_id) || cleanId(process.env.CLAUDE_CODE_SESSION_ID),
    agentId,
  };
  return bound;
}

function current() {
  return bound;
}

/** A call made inside a subagent carries `agent_id` (official hook contract). */
function isSubagentCall(input) {
  if (input && typeof input.agent_id === 'string' && input.agent_id.trim()) return true;
  return !input && !!bound.agentId;
}

function sessionDir(sessionId) {
  const id = cleanId(sessionId === undefined ? bound.sessionId : sessionId);
  return id ? path.join(sessionsRoot(), id) : null;
}

/** Path of one state file for the (bound) session, or null → use the legacy path. */
function filePath(kind, sessionId) {
  if (!FILES[kind]) return null;
  const dir = sessionDir(sessionId);
  return dir ? path.join(dir, FILES[kind]) : null;
}

function read(kind, fallback = null, sessionId) {
  const file = filePath(kind, sessionId);
  return file ? safeReadJson(file, fallback) : fallback;
}

function write(kind, data, sessionId) {
  const file = filePath(kind, sessionId);
  if (!file) return false;
  if (!safeEnsureDir(path.dirname(file))) return false;
  return safeWriteJson(file, data);
}

/** Read-modify-write under the file lock. Returns the written value, or null. */
function update(kind, mutate, fallback = null, sessionId) {
  const file = filePath(kind, sessionId);
  if (!file || !safeEnsureDir(path.dirname(file))) return null;
  const run = () => {
    const next = mutate(safeReadJson(file, fallback));
    if (next !== undefined) safeWriteJson(file, next);
    return next === undefined ? null : next;
  };
  try {
    return withFileLock(`${file}.lock`, run, { timeoutMs: 1500 });
  } catch (err) {
    // A contended lock is not worth a trapped hook — decide unlocked. Any other
    // error came from `mutate` itself: running it again would apply it twice.
    if (err && /^Timed out waiting for lock/.test(err.message)) {
      try { return run(); } catch { return null; }
    }
    return null;
  }
}

/**
 * Did this session hand work to a top-tier model? Read from the session's own
 * dashboard, so another session's or another repo's spawn can never count, and
 * a delegation that errored does not qualify. `launched`/`running` count: the
 * pen may still be in the delegate's hand (a background planner).
 */
function topTierDelegated(tier = 'fable', sessionId) {
  const board = read('dashboard', null, sessionId);
  const agents = board && Array.isArray(board.agents) ? board.agents : [];
  return agents.some(a => a && String(a.model || '').includes(tier) && a.status !== 'error');
}

/** Delete session folders untouched for `days`. Called from SessionStart. */
function prune(days = RETENTION_DAYS, nowMs = Date.now()) {
  let removed = 0;
  try {
    const root = sessionsRoot();
    if (!fs.existsSync(root)) return 0;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      try {
        const stat = fs.statSync(dir);
        if (!stat.isDirectory() || nowMs - stat.mtimeMs < days * 86400000) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        removed += 1;
      } catch { /* one bad entry must not stop the sweep */ }
    }
  } catch { /* fail-soft */ }
  return removed;
}

module.exports = {
  FILES,
  RETENTION_DAYS,
  bind,
  cleanId,
  configDir,
  current,
  filePath,
  isSubagentCall,
  prune,
  read,
  sessionDir,
  sessionsRoot,
  topTierDelegated,
  update,
  write,
};

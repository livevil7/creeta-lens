/**
 * Lens - Agent Tracker Module
 * Tracks Task (sub-agent) lifecycle for real-time dashboard updates.
 *
 * State file: .lens/agent-dashboard.json (relative to project root)
 * Cross-platform: Windows (Git Bash) + macOS
 *
 * Lifecycle:
 *   pending → running → done | error            (synchronous agent, fully observed)
 *   pending → running → launched                (background agent, end NOT observable)
 * `launched` is terminal for the hooks and means "unknown", not "finished" and not
 * "failed". See LAUNCHED_STATUS below.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeEnsureDir, safeWriteJson, withFileLock } = require('./hook-utils');

// ── Constants ────────────────────────────────────────────

const DASHBOARD_DIR = '.lens';
const DASHBOARD_FILE = 'agent-dashboard.json';
const MAX_COMPLETED_AGENTS = 50;
const MAX_ERROR_LOG = 20;

/**
 * Status for a background (async) spawn whose completion the hooks CANNOT observe.
 *
 * `PostToolUse` fires the moment the spawn call returns and never again, so there
 * is no hook that can later flip the record to done/error (실측 2026-07-25). This
 * status means exactly one thing: **the agent started and nothing has been observed
 * since.** It is neither success nor failure, therefore:
 *   - it must NOT be counted as `done` (that was the false "All N agents complete"), and
 *   - `endSession()` must NOT sweep it into `error` (unobserved ≠ failed).
 * SoT: docs/rules/harness-rules.md §4.5.
 */
const LAUNCHED_STATUS = 'launched';

/** Statuses the hooks will never transition again — safe to trim as history. */
const TERMINAL_STATUSES = new Set(['done', 'error', LAUNCHED_STATUS]);

// ── Path Resolution ──────────────────────────────────────

/**
 * Resolve the dashboard file path.
 * Priority: CWD/.lens/ (project-local)
 */
function getDashboardPath() {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(projectRoot, DASHBOARD_DIR, DASHBOARD_FILE);
}

/**
 * Ensure the .lens/ directory exists.
 */
function ensureDashboardDir() {
  const dashboardPath = getDashboardPath();
  const dir = path.dirname(dashboardPath);
  return safeEnsureDir(dir) ? dashboardPath : null;
}

// ── Schema ───────────────────────────────────────────────

/**
 * Create a fresh dashboard state.
 * @returns {DashboardState}
 */
function createDefaultDashboard() {
  return {
    // 1.1.0 added summary.launched + the 'launched' agent status. loadDashboard()
    // does not gate on the version, so 1.0.0 files still load; recalculateSummary()
    // fills the new counter on the next save. Readers must treat a missing
    // summary.launched as 0.
    $schema: 'lens-agent-dashboard/1.1.0',
    session: {
      id: generateSessionId(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'active', // active | completed | error
    },
    agents: [],
    summary: {
      total: 0,
      pending: 0,
      running: 0,
      launched: 0,
      done: 0,
      error: 0,
    },
    errors: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Create a new agent entry.
 * @param {string} description - Task description from tool input
 * @param {{model?: string, agentType?: string}} [meta] - Spawn metadata (v3.25+)
 * @returns {AgentEntry}
 */
function createAgentEntry(description, meta) {
  return {
    id: generateAgentId(),
    name: extractAgentName(description),
    description: (description || '').substring(0, 200),
    // v3.25 model accounting. `null` means the spawn omitted an explicit model,
    // so the agent inherited the session model — the hook cannot observe which
    // one that was. Skills are required to always specify a model, so this
    // stays null only for legacy or non-Lens spawns.
    model: (meta && meta.model) || null,
    agentType: (meta && meta.agentType) || null,
    // pending | running | launched | done | error  (see LAUNCHED_STATUS)
    status: 'pending',
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: null,
    error: null,
  };
}

// ── State Operations ─────────────────────────────────────

/**
 * Load the current dashboard state from disk.
 * Returns default state if file doesn't exist or is corrupted.
 */
function loadDashboard() {
  const dashboardPath = getDashboardPath();
  try {
    if (fs.existsSync(dashboardPath)) {
      const raw = fs.readFileSync(dashboardPath, 'utf-8');
      const data = JSON.parse(raw);
      // Validate basic structure
      if (data && data.$schema && data.agents && data.session) {
        return data;
      }
    }
  } catch {
    // Corrupted file, start fresh
  }
  return createDefaultDashboard();
}

/**
 * Save dashboard state to disk atomically.
 * Uses write-to-temp + rename for crash safety.
 */
function saveDashboard(dashboard) {
  const dashboardPath = ensureDashboardDir();
  if (!dashboardPath) return false;
  dashboard.lastUpdatedAt = new Date().toISOString();
  recalculateSummary(dashboard);

  try {
    return safeWriteJson(dashboardPath, dashboard, { atomic: true });
  } catch (err) {
    // Fallback: direct write
    try {
      fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }
}

function mutateDashboard(mutator) {
  const dashboardPath = ensureDashboardDir();
  const lockPath = dashboardPath ? `${dashboardPath}.lock` : null;

  const runMutation = () => {
    const dashboard = loadDashboard();
    const result = mutator(dashboard);
    saveDashboard(dashboard);
    return result;
  };

  if (!lockPath) return runMutation();

  try {
    return withFileLock(lockPath, runMutation);
  } catch {
    // One short retry before falling back. Reduces dashboard.json clobber risk
    // when two hooks race for the same lock, without blocking the tool call.
    try {
      return withFileLock(lockPath, runMutation);
    } catch {
      // Hooks must stay fail-soft. If the lock still cannot be acquired, keep
      // tracking best-effort instead of blocking the user's tool call.
      return runMutation();
    }
  }
}

/**
 * Initialize dashboard for a new session.
 * Preserves previous session's completed agents as history.
 */
function initSession() {
  const dashboard = createDefaultDashboard();
  saveDashboard(dashboard);
  return dashboard;
}

/**
 * Register a new agent as pending/running.
 * Called from PreToolUse hook (matcher: Task).
 * @param {string} description - Task description
 * @param {{model?: string, agentType?: string}} [meta] - Spawn metadata (v3.25+)
 * @returns {AgentEntry} The created agent entry
 */
function registerAgent(description, meta) {
  return mutateDashboard((dashboard) => {
    const agent = createAgentEntry(description, meta);
    agent.status = 'running';
    dashboard.agents.push(agent);
    return agent;
  });
}

/**
 * Complete an agent (mark as done or error).
 * Called from PostToolUse hook (matcher: Task).
 * @param {string|null} agentId - Specific agent ID to complete (null = last running)
 * @param {'done'|'error'} status - Final status
 * @param {string|null} errorMsg - Error message if status is 'error'
 * @returns {AgentEntry|null} The updated agent entry
 */
function completeAgent(agentId, status, errorMsg) {
  return completeAgentMatching(
    (agent) => agentId ? agent.id === agentId : agent.status === 'running',
    status,
    errorMsg
  );
}

/**
 * Complete the running agent whose original task description best matches.
 * Falls back to the most recent running agent when Claude Code omits tool_input.
 * @param {string} description
 * @param {'done'|'error'} status
 * @param {string|null} errorMsg
 */
function completeAgentByDescription(description, status, errorMsg) {
  const normalized = normalizeDescription(description);
  return completeAgentMatching((agent) => {
    if (agent.status !== 'running') return false;
    if (!normalized) return true;
    return normalizeDescription(agent.description) === normalized;
  }, status, errorMsg);
}

/**
 * Mark a spawn as an unobserved background launch (status `launched`).
 * Called from PostToolUse hook (matcher: Task) when the tool call was an async
 * launch rather than a finished agent.
 *
 * Deliberately leaves `endedAt`/`durationMs` null: no end was observed, and
 * inventing one is precisely what produced the false "done (132ms)" for agents
 * that went on to run 311s and 567s.
 * @param {string} description
 * @returns {AgentEntry|null}
 */
function markAgentLaunchedByDescription(description) {
  const normalized = normalizeDescription(description);
  return mutateDashboard((dashboard) => {
    const agent = [...dashboard.agents].reverse().find((a) => {
      if (a.status !== 'running' && a.status !== 'pending') return false;
      if (!normalized) return true;
      return normalizeDescription(a.description) === normalized;
    });

    if (!agent) return null;

    agent.status = LAUNCHED_STATUS;
    agent.endedAt = null;
    agent.durationMs = null;
    agent.error = null;

    trimCompletedAgents(dashboard);
    return agent;
  });
}

function completeAgentMatching(predicate, status, errorMsg) {
  return mutateDashboard((dashboard) => {
    const runningAgents = [...dashboard.agents].reverse();
    const agent = runningAgents.find(predicate);

    if (!agent) return null;

    agent.status = status || 'done';
    agent.endedAt = new Date().toISOString();
    agent.durationMs = new Date(agent.endedAt) - new Date(agent.startedAt);

    if (status === 'error' && errorMsg) {
      agent.error = errorMsg.substring(0, 500);
      dashboard.errors.push({
        agentId: agent.id,
        agentName: agent.name,
        error: errorMsg.substring(0, 500),
        at: agent.endedAt,
      });
      if (dashboard.errors.length > MAX_ERROR_LOG) {
        dashboard.errors = dashboard.errors.slice(-MAX_ERROR_LOG);
      }
    }

    trimCompletedAgents(dashboard);
    return agent;
  });
}

/**
 * Mark session as ended.
 * Called from Stop hook.
 */
function endSession(status) {
  return mutateDashboard((dashboard) => {
    dashboard.session.endedAt = new Date().toISOString();
    dashboard.session.status = status || 'completed';

    // Mark any still-running agents as error (orphaned).
    //
    // `launched` is exempt: `error` asserts "this failed", and a background agent
    // whose completion the hooks cannot observe has not failed — we simply never
    // saw the end. Sweeping it here would trade the old false `done` for an
    // equally false `error`. Note the Stop hook fires at the end of every turn,
    // so without this exemption a background agent would be declared failed
    // seconds after launch. SoT: docs/rules/harness-rules.md §4.5.
    for (const agent of dashboard.agents) {
      if (agent.status === LAUNCHED_STATUS) continue;
      if (agent.status === 'running' || agent.status === 'pending') {
        agent.status = 'error';
        agent.endedAt = dashboard.session.endedAt;
        agent.error = 'Session ended while agent was still running';
        agent.durationMs = new Date(agent.endedAt) - new Date(agent.startedAt);
      }
    }
    return dashboard;
  });
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Recalculate summary counts from agent list.
 */
function recalculateSummary(dashboard) {
  const agents = dashboard.agents || [];
  dashboard.summary = {
    total: agents.length,
    pending: agents.filter(a => a.status === 'pending').length,
    running: agents.filter(a => a.status === 'running').length,
    // Counted separately from both done and error on purpose: it is the "we do
    // not know" bucket, and folding it into either one makes the dashboard lie.
    launched: agents.filter(a => a.status === LAUNCHED_STATUS).length,
    done: agents.filter(a => a.status === 'done').length,
    error: agents.filter(a => a.status === 'error').length,
  };
}

function trimCompletedAgents(dashboard) {
  const completed = dashboard.agents.filter(a => TERMINAL_STATUSES.has(a.status));
  if (completed.length <= MAX_COMPLETED_AGENTS) return;

  const toRemove = completed.slice(0, completed.length - MAX_COMPLETED_AGENTS);
  const removeIds = new Set(toRemove.map(a => a.id));
  dashboard.agents = dashboard.agents.filter(a => !removeIds.has(a.id));
}

function normalizeDescription(description) {
  return (description || '').trim().replace(/\s+/g, ' ').substring(0, 200);
}

/**
 * Generate a short, unique session ID.
 */
function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString('hex');
  return `sess_${ts}_${rand}`;
}

/**
 * Generate a short, unique agent ID.
 */
function generateAgentId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(2).toString('hex');
  return `agent_${ts}_${rand}`;
}

/**
 * Extract a short agent name from the task description.
 * Uses the first line or first meaningful phrase.
 */
function extractAgentName(description) {
  if (!description) return 'unnamed-task';

  // Take first line, strip markdown, truncate
  const firstLine = description.split('\n')[0]
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .trim();

  if (firstLine.length <= 40) return firstLine || 'unnamed-task';
  return firstLine.substring(0, 37) + '...';
}

// ── Module Exports ───────────────────────────────────────

module.exports = {
  // Core operations
  loadDashboard,
  saveDashboard,
  initSession,
  registerAgent,
  completeAgent,
  completeAgentByDescription,
  markAgentLaunchedByDescription,
  endSession,

  // Status vocabulary
  LAUNCHED_STATUS,

  // Schema creators
  createDefaultDashboard,
  createAgentEntry,

  // Utilities
  getDashboardPath,
  ensureDashboardDir,
  recalculateSummary,
  generateSessionId,
  generateAgentId,
  extractAgentName,
};

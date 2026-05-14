/**
 * Lens - Agent Tracker Module
 * Tracks Task (sub-agent) lifecycle for real-time dashboard updates.
 *
 * State file: .lens/agent-dashboard.json (relative to project root)
 * Cross-platform: Windows (Git Bash) + macOS
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
    $schema: 'lens-agent-dashboard/1.0.0',
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
 * @returns {AgentEntry}
 */
function createAgentEntry(description) {
  return {
    id: generateAgentId(),
    name: extractAgentName(description),
    description: (description || '').substring(0, 200),
    status: 'pending', // pending | running | done | error
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
    // Hooks must stay fail-soft. If the lock cannot be acquired quickly, keep
    // tracking best-effort instead of blocking the user's tool call.
    return runMutation();
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
 * @returns {AgentEntry} The created agent entry
 */
function registerAgent(description) {
  return mutateDashboard((dashboard) => {
    const agent = createAgentEntry(description);
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

    // Mark any still-running agents as error (orphaned)
    for (const agent of dashboard.agents) {
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
    done: agents.filter(a => a.status === 'done').length,
    error: agents.filter(a => a.status === 'error').length,
  };
}

function trimCompletedAgents(dashboard) {
  const completed = dashboard.agents.filter(a => a.status === 'done' || a.status === 'error');
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
  endSession,

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

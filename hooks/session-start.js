/**
 * Lens - SessionStart Hook
 * Scans installed skills, loads memory, and injects context into the session.
 */

const path = require('path');
const fs = require('fs');

// Resolve plugin root (hooks/ is one level deep)
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, safeEnsureDir, safeReadJson, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('session-start');

// Load modules
const { scanInstalledSkills } = require(path.join(PLUGIN_ROOT, 'lib', 'skill-scanner'));
const { loadMemory, saveMemory, recordSessionStart, formatMemorySummary } = require(path.join(PLUGIN_ROOT, 'lib', 'memory-store'));
const { initSession, loadDashboard, saveDashboard, getDashboardPath } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));
const { formatPlanSummary, ensurePlansDir } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-manager'));
const { formatAuditNudge } = require(path.join(PLUGIN_ROOT, 'lib', 'capability-audit'));

// Load config
const config = safeReadJson(path.join(PLUGIN_ROOT, 'lens.config.json'), {}) || {};

// ── Main ──────────────────────────────────────────────────

function main() {
  try {
    // stdin is a one-shot stream: readJsonInput() consumes it, so the second
    // caller gets {} and its source check silently passes. Read once, pass down.
    const source = readJsonInput()?.source;
    const newConversation = NEW_CONVERSATION_SOURCES.has(source);

    // 0a. Drop the previous session's progress-report clock. Done before anything
    //     else so that a failure further down still leaves an honest clock.
    clearPreviousSessionProgressClock(newConversation);

    // 0. Initialize agent dashboard + plans + results directories for this session.
    //    Gated by the same allowlist as 0a. This hook runs on EVERY SessionStart
    //    event — the `once: true` in hooks.json is ignored (see the note above
    //    NEW_CONVERSATION_SOURCES) — so an unconditional initSession() wiped the
    //    dashboard on every auto-compact and fork. That reset summary.launched to
    //    0, and the next PostToolUse then printed "All N agents complete" past a
    //    still-unresolved background launch: the exact false completion this
    //    module exists to prevent. Measured across ~3,000 transcripts before this
    //    fix: "All N agents complete" 238 vs the guard firing 1.
    //    Compact lands precisely during long multi-agent runs, i.e. when the
    //    guard matters most. On a continuation keep the live dashboard; only a
    //    genuinely new conversation starts a fresh one.
    //    loadDashboard() never returns null — a missing or corrupt file yields a
    //    default in memory — so the continuation branch has to save it explicitly
    //    or the hook can finish leaving no dashboard on disk at all.
    let dashboard;
    if (newConversation) {
      dashboard = initSession();
    } else {
      dashboard = loadDashboard();
      saveDashboard(dashboard);
    }
    ensurePlansDir(config.planDir || null);
    // Ensure results directory for /cc synthesis output
    if (config.saveSynthesisResults) {
      const resultsDir = config.resultsDir
        ? path.resolve(config.resultsDir)
        : path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.lens', 'results');
      safeEnsureDir(resultsDir);
    }

    // 1. Scan installed skills — used ONLY for the one-line systemMessage count.
    // The inventory table is NOT injected into context (v3.29): the host already
    // lists every available skill, with better descriptions, in its own prompt.
    // Duplicating it cost ~2K tokens per session for zero added information.
    const skills = scanInstalledSkills();

    // 2. Load and update memory
    const memoryPath = config.memoryPath || null;
    const memory = loadMemory(memoryPath);
    recordSessionStart(memory);
    saveMemory(memory, memoryPath);
    const memorySummary = formatMemorySummary(memory);

    // 3. Build plan history for context
    const planSummary = formatPlanSummary(config.planDir || null);

    // 3b. /crv capability-audit staleness nudge — Lens repo only, NO network.
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const auditNudge = formatAuditNudge({ root: projectRoot, config });

    // 4. Build additional context
    const additionalContext = buildAdditionalContext({
      memorySummary,
      planSummary,
      auditNudge,
    });

    // 6. Output response
    const response = {
      systemMessage: `Lens v3.37.0 activated - ${skills.length} skills from ${[...new Set(skills.map(s => s.plugin))].length} plugins detected | Agent Dashboard + Plan System ready`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        skillCount: skills.length,
        sessionNumber: memory.sessionCount,
        agentDashboard: {
          sessionId: dashboard.session.id,
          dashboardPath: getDashboardPath(),
          status: 'initialized',
        },
        additionalContext,
      },
    };

    writeJson(response);
    process.exit(0);
  } catch (err) {
    // Fail gracefully - don't break the session
    const fallback = {
      systemMessage: 'Lens v3.37.0 activated (scan skipped)',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        error: err.message,
        additionalContext: buildFallbackContext(),
      },
    };
    writeJson(fallback);
    process.exit(0);
  }
}

/**
 * Delete the previous session's 2-minute progress-report clock (fail-soft).
 *
 * hooks/stop.js deliberately STAMPS that state instead of deleting it, because a
 * turn boundary is not a work boundary: deleting there lets a later poll re-create
 * the state with `lastReportAt = now` and buy another two minutes of silence — an
 * evasion the agent itself controls (docs/rules/harness-rules.md §4.4). A session
 * boundary differs on both counts:
 *
 *  - It is the user's action (launching / resuming / clearing a conversation), not
 *    a cadence the agent can trigger, so it is no evasion vector.
 *  - The state holds clocks only (`armedAt` / `lastSignalAt` / `lastReportAt` /
 *    `reminders`) — never a job identity. So there is no still-running work being
 *    "forgotten" by deleting it. A background job left over from a previous session
 *    cannot reach this hook anyway: every arming signal is a handle owned by the CLI
 *    process (run_in_background, TaskOutput/BashOutput/…), and a new process holds
 *    none of the old ones. Whatever this session does start re-arms with honest
 *    timestamps on its first signal.
 *
 * Kept, those stale clocks make the new session's first poll fire immediately and
 * report a nonsense elapsed time (실측: "마지막 보고 기점 이후 7201초 경과, 백그라운드
 * 작업 대기 7201초째" — from a session seconds old). Absent state is precisely how
 * this hook says "nothing is known to be in flight", which is the truth at startup.
 *
 * Only the sources that mean "a new conversation begins here" reset it. The
 * SessionStart source enum is startup|resume|clear|compact|fork (실측: strings in
 * the claude binary); `compact` and `fork` fire MID-conversation with the parent's
 * background work still in flight, and neither needs the user — auto-compact lands
 * during exactly the long waits this rule exists for, and a fork can be agent-
 * spawned. Resetting there would be the stop.js failure mode itself. An allowlist,
 * not a denylist: an unknown (or unreadable) source keeps the old clock, which at
 * worst makes the hook noisy, whereas wiping a live clock buys silence.
 *
 * NOTE: the `once: true` in hooks/hooks.json does NOT make this a startup-only
 * hook — the harness schema puts `once` on a hook entry, not on the matcher group
 * where this repo has it (실측), so it is ignored and this hook runs on EVERY
 * SessionStart event. The source check is load-bearing.
 */
const NEW_CONVERSATION_SOURCES = new Set(['startup', 'resume', 'clear']);

function clearPreviousSessionProgressClock(newConversation) {
  try {
    if (!newConversation) return;
    // Same resolution as hooks/stop.js and hooks/post-tool-progress.js — diverging
    // here would point the hooks at different files.
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    fs.unlinkSync(path.join(projectRoot, '.lens', 'progress-report-state.json'));
  } catch {
    // No state file (the normal case) or an unreadable one — nothing to reset.
  }
}

// ── Context Builder ───────────────────────────────────────

// Injects ONLY what the host does not already provide (v3.29 additive-only).
// Removed in v3.29 — all of it duplicated native capability:
//   - "Installed Skills (Auto-Scanned)" table  → host lists skills in its own prompt
//   - "Auto-Recommendation Rules" + keyword table → native Skills auto-discovery routes
//   - "Quick Commands"                         → the skill list carries this
//   - "Lens Suggestion Line"                   → a per-response nag on top of auto-discovery
// What remains is Lens-only state the host cannot know: session memory, plan
// history, and the /crv staleness nudge.
function buildAdditionalContext({ memorySummary, planSummary, auditNudge }) {
  let ctx = `# Lens v3.37.0 - Session Startup\n\n`;

  // /crv capability-audit nudge (Lens repo only; muted single line)
  if (auditNudge) {
    ctx += `> ${auditNudge}\n\n`;
  }

  // Session memory
  ctx += `## Session Memory\n\n`;
  ctx += memorySummary + '\n\n';

  // Plan history
  if (planSummary) {
    ctx += `## Recent Plans\n\n`;
    ctx += planSummary + '\n';
  }

  return ctx;
}

function buildFallbackContext() {
  return `# Lens v3.37.0 - Session Startup

Session memory could not be loaded (scan or read error). Lens skills still work; run \`/cp\` or \`/cc\` directly.
`;
}

// ── Run ───────────────────────────────────────────────────

main();

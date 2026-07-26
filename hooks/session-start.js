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
const { scanInstalledSkills, formatSkillTable } = require(path.join(PLUGIN_ROOT, 'lib', 'skill-scanner'));
const { loadMemory, saveMemory, recordSessionStart, formatMemorySummary } = require(path.join(PLUGIN_ROOT, 'lib', 'memory-store'));
const { formatKeywordTable, saveScanCache } = require(path.join(PLUGIN_ROOT, 'lib', 'keyword-matcher'));
const { initSession, getDashboardPath } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));
const { formatPlanSummary, ensurePlansDir } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-manager'));
const { formatAuditNudge } = require(path.join(PLUGIN_ROOT, 'lib', 'capability-audit'));

// Load config
const config = safeReadJson(path.join(PLUGIN_ROOT, 'lens.config.json'), {}) || {};

// ── Main ──────────────────────────────────────────────────

function main() {
  try {
    // 0a. Drop the previous session's progress-report clock. Done before anything
    //     else so that a failure further down still leaves an honest clock.
    clearPreviousSessionProgressClock();

    // 0. Initialize agent dashboard + plans + results directories for this session
    const dashboard = initSession();
    ensurePlansDir(config.planDir || null);
    // Ensure results directory for /cc synthesis output
    if (config.saveSynthesisResults) {
      const resultsDir = config.resultsDir
        ? path.resolve(config.resultsDir)
        : path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.lens', 'results');
      safeEnsureDir(resultsDir);
    }

    // 1. Scan installed skills and cache for UserPromptSubmit hook
    const skills = scanInstalledSkills();
    saveScanCache(skills);
    const skillTable = formatSkillTable(skills);

    // 2. Load and update memory
    const memoryPath = config.memoryPath || null;
    const memory = loadMemory(memoryPath);
    recordSessionStart(memory);
    saveMemory(memory, memoryPath);
    const memorySummary = formatMemorySummary(memory);

    // 3. Build keyword table from scan results (dynamic, not hardcoded)
    const keywordTable = formatKeywordTable(skills);

    // 4. Build plan history for context
    const planSummary = formatPlanSummary(config.planDir || null);

    // 4b. /crv capability-audit staleness nudge — Lens repo only, NO network.
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const auditNudge = formatAuditNudge({ root: projectRoot, config });

    // 5. Build additional context
    const additionalContext = buildAdditionalContext({
      skillTable,
      memorySummary,
      keywordTable,
      planSummary,
      auditNudge,
      skillCount: skills.length,
      pluginCount: [...new Set(skills.map(s => s.plugin))].length,
      config,
    });

    // 6. Output response
    const response = {
      systemMessage: `Lens v3.25.0 activated - ${skills.length} skills from ${[...new Set(skills.map(s => s.plugin))].length} plugins detected | Agent Dashboard + Plan System ready`,
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
      systemMessage: 'Lens v3.25.0 activated (scan skipped)',
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

function clearPreviousSessionProgressClock() {
  try {
    if (!NEW_CONVERSATION_SOURCES.has(readJsonInput()?.source)) return;
    // Same resolution as hooks/stop.js and hooks/post-tool-progress.js — diverging
    // here would point the hooks at different files.
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    fs.unlinkSync(path.join(projectRoot, '.lens', 'progress-report-state.json'));
  } catch {
    // No state file (the normal case) or an unreadable one — nothing to reset.
  }
}

// ── Context Builder ───────────────────────────────────────

function buildAdditionalContext({ skillTable, memorySummary, keywordTable, planSummary, auditNudge, skillCount, pluginCount, config: cfg }) {
  const autoRecommend = cfg.autoRecommend !== false;
  const showReport = cfg.showReport !== false;

  let ctx = '';

  // Header
  ctx += `# Lens v3.25.0 - Session Startup\n\n`;

  // /crv capability-audit nudge (Lens repo only; muted single line)
  if (auditNudge) {
    ctx += `> ${auditNudge}\n\n`;
  }

  // Skill inventory
  ctx += `## Installed Skills (Auto-Scanned)\n\n`;
  ctx += skillTable + '\n\n';

  // Session memory
  ctx += `## Session Memory\n\n`;
  ctx += memorySummary + '\n\n';

  // Auto-recommendation rules
  if (autoRecommend) {
    ctx += `## Auto-Recommendation Rules\n\n`;
    ctx += `When the user's message matches keywords below, proactively suggest the matching skill.\n`;
    ctx += `Do NOT auto-execute - just mention: "This task matches /skill-name. Want me to run it?"\n\n`;
    ctx += keywordTable + '\n\n';
    ctx += `### Recommendation Behavior\n`;
    ctx += `- Only suggest if confidence is high (multiple keyword matches)\n`;
    ctx += `- If user already specified a skill (e.g., /commit), do NOT re-recommend\n`;
    ctx += `- Maximum 2 skill suggestions per message\n`;
    ctx += `- Use the user's language for suggestions\n\n`;
  }

  // Plugin Discovery Registry — removed (v3.13): KNOWN_PLUGINS is empty, so this
  // only ever emitted an empty table. Native Skills auto-discovery handles routing.

  // Plan history
  if (planSummary) {
    ctx += `## Recent Plans\n\n`;
    ctx += planSummary + '\n\n';
  }

  // Lens usage guide
  ctx += `## Quick Commands\n\n`;
  ctx += `- \`/c <request>\` - Scan + Recommend + Execute (pick the best skill)\n`;
  ctx += `- \`/cc <request>\` - Run ALL relevant skills in parallel + synthesize results\n`;
  ctx += `- \`/cp <request>\` - Plan-first execution: generate work plan, get approval, then execute\n`;
  ctx += `- \`/c\`, \`/cc\`, or \`/cp\` (no args) - Show full skill inventory\n\n`;

  // Report rule
  if (showReport) {
    ctx += `## Lens Suggestion Line (Recommended for all responses)\n\n`;
    ctx += `When a user's request clearly matches an installed skill but they didn't use /c,\n`;
    ctx += `add a single-line suggestion at the end of your response:\n\n`;
    ctx += '```\n';
    ctx += `── Lens ──────────────────────────────\n`;
    ctx += `Tip: /skill-name can help with this task\n`;
    ctx += `─────────────────────────────────────────\n`;
    ctx += '```\n\n';
    ctx += `Rules:\n`;
    ctx += `- Only show when there's a clear skill match\n`;
    ctx += `- Don't show if user already used /c or a specific skill\n`;
    ctx += `- Don't show for simple questions or chat\n`;
    ctx += `- Maximum 1 suggestion per response\n`;
  }

  return ctx;
}

function buildFallbackContext() {
  return `# Lens v3.25.0 - Session Startup

Skill scan was skipped (no plugins cache found or scan error).
Use \`/c <request>\` to manually scan and get recommendations.
`;
}

// ── Run ───────────────────────────────────────────────────

main();

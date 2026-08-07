/**
 * Lens - SessionStart Hook
 * Scans installed skills, loads memory, and injects context into the session.
 */

const path = require('path');
const fs = require('fs');

// Resolve plugin root (hooks/ is one level deep)
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const { installFailSoftHandlers, safeEnsureDir, safeReadJson, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('session-start');

// Load modules
const { scanInstalledSkills } = require(path.join(PLUGIN_ROOT, 'lib', 'skill-scanner'));
const { loadMemory, saveMemory, recordSessionStart, formatMemorySummary } = require(path.join(PLUGIN_ROOT, 'lib', 'memory-store'));
const { initSession, getDashboardPath } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));
const { formatPlanSummary, ensurePlansDir } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-manager'));
const { formatAuditNudge } = require(path.join(PLUGIN_ROOT, 'lib', 'capability-audit'));

// Load config
const config = safeReadJson(path.join(PLUGIN_ROOT, 'lens.config.json'), {}) || {};

// ── Main ──────────────────────────────────────────────────

function main() {
  try {
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
      systemMessage: `Lens v3.29.0 activated - ${skills.length} skills from ${[...new Set(skills.map(s => s.plugin))].length} plugins detected | Agent Dashboard + Plan System ready`,
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
      systemMessage: 'Lens v3.29.0 activated (scan skipped)',
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
  let ctx = `# Lens v3.29.0 - Session Startup\n\n`;

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
  return `# Lens v3.29.0 - Session Startup

Session memory could not be loaded (scan or read error). Lens skills still work; run \`/cp\` or \`/cc\` directly.
`;
}

// ── Run ───────────────────────────────────────────────────

main();

/**
 * Lens - SessionStart Hook
 * Scans installed skills, loads memory, and injects context into the session.
 */

const path = require('path');
const fs = require('fs');

// Resolve plugin root (hooks/ is one level deep)
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const {
  installFailSoftHandlers,
  readJsonInput,
  safeEnsureDir,
  safeReadJson,
  writeJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
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
const IS_CODEX = Boolean(process.env.PLUGIN_ROOT);

// ── Main ──────────────────────────────────────────────────

function main() {
  try {
    const hookInput = readJsonInput();
    const projectRoot = hookInput?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

    // 0. Initialize agent dashboard + plans + results directories for this session
    const dashboard = initSession();
    ensurePlansDir(config.planDir || null);
    // Ensure results directory for /cc synthesis output
    if (config.saveSynthesisResults) {
      const resultsDir = config.resultsDir
        ? path.resolve(config.resultsDir)
        : path.join(projectRoot, '.lens', 'results');
      safeEnsureDir(resultsDir);
    }

    // 1. Scan installed skills and cache for UserPromptSubmit hook
    // Codex already injects its active skill catalog into the agent. Its cache
    // layout is not the Claude plugin registry, so scan only this plugin's
    // canonical skills and let `$lens:c` use the native catalog for routing.
    const skills = IS_CODEX ? scanBundledCodexSkills() : scanInstalledSkills();
    if (!IS_CODEX) saveScanCache(skills);
    const skillTable = formatSkillTable(skills);

    // 2. Load and update memory
    const memoryPath = config.memoryPath || null;
    const memory = loadMemory(memoryPath);
    recordSessionStart(memory);
    saveMemory(memory, memoryPath);
    const memorySummary = formatMemorySummary(memory);

    // 3. Build keyword table from scan results (dynamic, not hardcoded)
    const keywordTable = IS_CODEX ? '' : formatKeywordTable(skills);

    // 4. Build plan history for context
    const planSummary = formatPlanSummary(config.planDir || null);

    // 4b. /crv capability-audit staleness nudge — Lens repo only, NO network.
    const auditNudge = formatAuditNudge({ root: projectRoot, config });

    // 5. Build additional context
    const pluginCount = [...new Set(skills.map(s => s.plugin))].length;
    const additionalContext = IS_CODEX
      ? buildCodexContext({ memorySummary, planSummary, auditNudge, skillCount: skills.length })
      : buildAdditionalContext({
          skillTable,
          memorySummary,
          keywordTable,
          planSummary,
          auditNudge,
          skillCount: skills.length,
          pluginCount,
          config,
        });

    // 6. Output response
    const response = {
      systemMessage: IS_CODEX
        ? `Lens v3.26.0 for Codex activated - ${skills.length} native skills ready. Invoke with $lens:c, $lens:cc, or $lens:cp.`
        : `Lens v3.26.0 activated - ${skills.length} skills from ${pluginCount} plugins detected | Agent Dashboard + Plan System ready`,
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
      systemMessage: IS_CODEX
        ? 'Lens v3.26.0 for Codex activated (startup context skipped)'
        : 'Lens v3.26.0 activated (scan skipped)',
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

function scanBundledCodexSkills() {
  const root = path.join(PLUGIN_ROOT, 'skills');
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const skillPath = path.join(root, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf8');
    const description = content.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] || '';
    skills.push({
      name: entry.name,
      plugin: 'lens',
      description: description.replace(/^["']|["']$/g, '').substring(0, 160),
      triggers: [],
      domain: 'Lens',
      type: 'skill',
    });
  }
  return skills;
}

// ── Context Builder ───────────────────────────────────────

function buildAdditionalContext({ skillTable, memorySummary, keywordTable, planSummary, auditNudge, skillCount, pluginCount, config: cfg }) {
  const autoRecommend = cfg.autoRecommend !== false;
  const showReport = cfg.showReport !== false;

  let ctx = '';

  // Header
  ctx += `# Lens v3.26.0 - Session Startup\n\n`;

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

function buildCodexContext({ memorySummary, planSummary, auditNudge, skillCount }) {
  let ctx = `# Lens v3.26.0 for Codex\n\n`;
  ctx += `${skillCount} dual-runtime Lens skills are installed. Codex invocation uses `;
  ctx += '`$lens:c`, `$lens:cc`, `$lens:cp`, and the other plugin-qualified names.\n\n';
  ctx += 'Use the active Codex skill catalog for discovery; do not scan `~/.claude`.\n\n';
  if (auditNudge) ctx += `> ${auditNudge.replace(/`\/crv`/g, '`$lens:crv`')}\n\n`;
  if (memorySummary) ctx += `## Lens session state\n\n${memorySummary}\n\n`;
  if (planSummary) ctx += `## Recent Lens plans\n\n${planSummary}\n\n`;
  return ctx;
}

function buildFallbackContext() {
  if (IS_CODEX) {
    return `# Lens v3.26.0 for Codex

The startup scan was skipped. Invoke a native skill such as \`$lens:c\`.
`;
  }
  return `# Lens v3.26.0 - Session Startup

Skill scan was skipped (no plugins cache found or scan error).
Use \`/c <request>\` to manually scan and get recommendations.
`;
}

// ── Run ───────────────────────────────────────────────────

main();

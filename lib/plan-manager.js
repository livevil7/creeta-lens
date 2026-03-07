/**
 * Lens - Plan Manager Module
 * Generates, saves, and manages work plan documents (작업계획서).
 *
 * Plan files: docs/YYYY-MM-DD-{slug}.md (configurable via planDir)
 * State file: .lens/plan-state.json
 * Cross-platform: Windows (Git Bash) + macOS
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Constants ────────────────────────────────────────────

const LENS_DIR = '.lens';
const PLANS_DIR = 'plans';
const DEFAULT_DOCS_DIR = 'docs';
const STATE_FILE = 'plan-state.json';
const MAX_SLUG_LENGTH = 50;
const MAX_PLANS_RETAINED = 50;
const MAX_TASK_LENGTH = 100;

// ── Path Resolution ──────────────────────────────────────

/**
 * Get plans directory path.
 * Priority: config planDir override → project docs/ (default, create if missing)
 * @param {string|null} configDir - Optional override from lens.config.json
 */
function getPlansDir(configDir) {
  if (configDir) {
    return path.resolve(configDir);
  }
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // Always use project's docs/ directory (create if missing)
  return path.join(projectRoot, DEFAULT_DOCS_DIR);
}

/**
 * Ensure the plans directory exists.
 * @param {string|null} configDir
 */
function ensurePlansDir(configDir) {
  const dir = getPlansDir(configDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get plan state file path.
 */
function getStatePath() {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(projectRoot, LENS_DIR, STATE_FILE);
}

// ── Slug & File Naming ───────────────────────────────────

/**
 * Generate a URL-safe slug from task description.
 * Keeps all Unicode letters (Korean, Japanese, Chinese, Latin extended, etc.) alongside ASCII.
 * @param {string} taskDescription
 * @returns {string}
 */
function generateSlug(taskDescription) {
  if (!taskDescription || !taskDescription.trim()) {
    return 'plan-' + crypto.randomBytes(3).toString('hex');
  }

  const slug = taskDescription
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 5)
    .join('-');

  if (!slug || slug.length < 2) {
    return 'plan-' + crypto.randomBytes(3).toString('hex');
  }

  return slug.substring(0, MAX_SLUG_LENGTH);
}

/**
 * Generate file name: YYYY-MM-DD-{slug}.md
 * @param {string} taskDescription
 * @returns {string}
 */
function generateFileName(taskDescription) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = generateSlug(taskDescription);
  return `${date}-${slug}.md`;
}

// ── Plan ID Generation ───────────────────────────────────

/**
 * Generate a unique plan ID.
 * @returns {string}
 */
function generatePlanId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(2).toString('hex');
  return `plan_${ts}_${rand}`;
}

// ── Plan State Tracking ──────────────────────────────────

/**
 * Save plan state to .lens/plan-state.json.
 * @param {object} plan
 */
function savePlanState(plan) {
  const statePath = getStatePath();
  try {
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let states = {};
    if (fs.existsSync(statePath)) {
      try {
        states = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      } catch (parseErr) {
        console.error(`[lens] plan-state.json corrupted, resetting: ${parseErr.message}`);
        states = {};
      }
    }

    states[plan.id] = {
      id: plan.id,
      task: (plan.task || '').substring(0, MAX_TASK_LENGTH),
      status: plan.status,
      filePath: plan.filePath,
      createdAt: plan.createdAt,
      approvedAt: plan.approvedAt,
      completedAt: plan.completedAt,
    };

    // Retain only recent plans (sorted by createdAt, oldest removed first)
    const entries = Object.entries(states);
    if (entries.length > MAX_PLANS_RETAINED) {
      entries.sort((a, b) => (a[1].createdAt || '').localeCompare(b[1].createdAt || ''));
      const toRemove = entries.slice(0, entries.length - MAX_PLANS_RETAINED);
      toRemove.forEach(([k]) => delete states[k]);
    }

    fs.writeFileSync(statePath, JSON.stringify(states, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error(`[lens] savePlanState failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Load plan state(s) from disk.
 * @param {string|null} planId - Specific plan ID, or null for all
 * @returns {object|null}
 */
function loadPlanState(planId) {
  const statePath = getStatePath();
  try {
    if (fs.existsSync(statePath)) {
      const states = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      return planId ? (states[planId] || null) : states;
    }
  } catch (err) {
    console.error(`[lens] loadPlanState failed: ${err.message}`);
  }
  return planId ? null : {};
}

/**
 * List all plan files in the plans directory.
 * @param {string|null} configDir
 * @returns {string[]} File names sorted newest first
 */
function listPlans(configDir) {
  const dir = getPlansDir(configDir);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Get recent plans summary for session context injection.
 * @param {string|null} configDir
 * @returns {string}
 */
function formatPlanSummary(configDir) {
  const states = loadPlanState(null);
  const entries = Object.values(states);
  if (entries.length === 0) return '';

  const recent = entries
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5);

  let summary = '| Date | Task | Status |\n';
  summary += '|------|------|--------|\n';
  for (const p of recent) {
    const date = (p.createdAt || '').slice(0, 10);
    summary += `| ${date} | ${p.task} | ${p.status} |\n`;
  }
  return summary;
}

// ── Document Generation ─────────────────────────────────

const REQUIRED_SECTIONS = [
  'Task',
  'Matched Skills',
  'Execution Plan',
  'Expected Outcomes',
  'Risks',
  'Execution Mode',
  'Status',
];

/**
 * Generate plan document content from structured data.
 * @param {object} planData
 * @param {string} planData.id - Plan ID
 * @param {string} planData.task - User's original request
 * @param {Array} planData.skills - Matched skills [{name, type, domain, reason}]
 * @param {Array} planData.steps - Execution steps [{description, skill, input, output}]
 * @param {Array} planData.outcomes - Expected outcomes (strings)
 * @param {Array} planData.risks - Risks [{description, severity, mitigation}]
 * @param {string} planData.mode - Execution mode description
 * @param {string} planData.language - Document language code (e.g., 'ko', 'en')
 * @returns {string} Markdown content
 */
function generatePlanContent(planData) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const isoDate = now.toISOString();
  const lang = planData.language || 'en';

  const headers = {
    en: { task: 'Task', skills: 'Matched Skills', plan: 'Execution Plan', outcomes: 'Expected Outcomes', risks: 'Risks & Considerations', mode: 'Execution Mode', result: 'Execution Result', status: 'Status' },
    ko: { task: '요청사항', skills: '매칭된 스킬', plan: '실행 계획', outcomes: '기대 결과', risks: '위험 요소', mode: '실행 방식', result: '실행 결과', status: '상태' },
    ja: { task: '要請事項', skills: 'マッチしたスキル', plan: '実行計画', outcomes: '期待結果', risks: 'リスク', mode: '実行方式', result: '実行結果', status: 'ステータス' },
    zh: { task: '请求事项', skills: '匹配的技能', plan: '执行计划', outcomes: '预期结果', risks: '风险', mode: '执行方式', result: '执行结果', status: '状态' },
    es: { task: 'Tarea', skills: 'Skills Seleccionados', plan: 'Plan de Ejecución', outcomes: 'Resultados Esperados', risks: 'Riesgos', mode: 'Modo de Ejecución', result: 'Resultado', status: 'Estado' },
    fr: { task: 'Tâche', skills: 'Skills Sélectionnés', plan: "Plan d'Exécution", outcomes: 'Résultats Attendus', risks: 'Risques', mode: "Mode d'Exécution", result: 'Résultat', status: 'Statut' },
    de: { task: 'Aufgabe', skills: 'Ausgewählte Skills', plan: 'Ausführungsplan', outcomes: 'Erwartete Ergebnisse', risks: 'Risiken', mode: 'Ausführungsmodus', result: 'Ergebnis', status: 'Status' },
    it: { task: 'Compito', skills: 'Skills Selezionati', plan: 'Piano di Esecuzione', outcomes: 'Risultati Attesi', risks: 'Rischi', mode: 'Modalità di Esecuzione', result: 'Risultato', status: 'Stato' },
  };
  const h = headers[lang] || headers.en;

  // YAML frontmatter
  let content = '---\n';
  content += `id: ${planData.id}\n`;
  content += `type: plan\n`;
  content += `version: 1\n`;
  content += `created: ${isoDate}\n`;
  content += `updated: ${isoDate}\n`;
  content += `status: draft\n`;
  content += `generator: lens/plan\n`;
  content += `language: ${lang}\n`;
  content += `parent: null\n`;
  content += `refs: []\n`;
  content += '---\n\n';

  // Title
  content += `# Work Plan / ${h.task === 'Task' ? '작업계획서' : h.task}\n\n`;
  content += `> Generated by Lens Plan on ${dateStr}\n`;
  content += `> Plan ID: ${planData.id}\n\n---\n\n`;

  // Task
  content += `## Task / ${h.task}\n\n${planData.task}\n\n`;

  // Matched Skills
  content += `## Matched Skills / ${h.skills}\n\n`;
  content += '| # | Skill | Type | Domain | Why Selected |\n';
  content += '|---|-------|------|--------|--------------|\n';
  (planData.skills || []).forEach((s, i) => {
    content += `| ${i + 1} | /${s.name} | ${s.type} | ${s.domain} | ${s.reason} |\n`;
  });
  content += '\n';

  // Execution Plan
  content += `## Execution Plan / ${h.plan}\n\n`;
  (planData.steps || []).forEach((step, i) => {
    content += `### Step ${i + 1}: ${step.description}\n`;
    content += `- **Skill**: /${step.skill}\n`;
    content += `- **Input**: ${step.input}\n`;
    content += `- **Expected output**: ${step.output}\n\n`;
  });

  // Expected Outcomes
  content += `## Expected Outcomes / ${h.outcomes}\n\n`;
  (planData.outcomes || []).forEach(o => {
    content += `- [ ] ${o}\n`;
  });
  content += '\n';

  // Risks
  content += `## Risks & Considerations / ${h.risks}\n\n`;
  if (!planData.risks || planData.risks.length === 0) {
    content += 'N/A\n\n';
  } else {
    content += '| # | Risk | Severity | Mitigation |\n';
    content += '|---|------|----------|------------|\n';
    planData.risks.forEach((r, i) => {
      content += `| ${i + 1} | ${r.description} | ${r.severity || 'M'} | ${r.mitigation || '-'} |\n`;
    });
    content += '\n';
  }

  // Execution Mode
  content += `## Execution Mode / ${h.mode}\n\n`;
  content += `- **Mode**: ${planData.mode || 'Single skill (/c)'}\n`;
  content += `- **Skills to execute**: ${(planData.skills || []).length}\n\n`;

  content += '---\n\n**Status**: draft\n';

  return content;
}

/**
 * Parse YAML frontmatter from a plan markdown file.
 * @param {string} filePath
 * @returns {object|null} Parsed frontmatter fields, or null on failure
 */
function parsePlanFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const fields = {};
    match[1].split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      // Handle array syntax: [item1, item2]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(v => v.trim()).filter(Boolean);
      } else if (val === 'null') {
        val = null;
      } else if (val === 'true') {
        val = true;
      } else if (val === 'false') {
        val = false;
      } else if (/^\d+$/.test(val)) {
        val = parseInt(val, 10);
      }
      fields[key] = val;
    });
    return fields;
  } catch (err) {
    console.error(`[lens] parsePlanFrontmatter failed: ${err.message}`);
    return null;
  }
}

/**
 * Update plan status in both the markdown frontmatter and plan-state.json.
 * plan-state.json is the single source of truth; frontmatter is updated to match.
 * @param {string} filePath - Path to the plan markdown file
 * @param {string} newStatus - New status (draft|approved|executing|completed|failed|cancelled)
 * @returns {{success: boolean, error?: string}}
 */
function updatePlanStatus(filePath, newStatus) {
  const validStatuses = ['draft', 'approved', 'executing', 'completed', 'failed', 'cancelled'];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `Invalid status: ${newStatus}` };
  }

  try {
    // Read file and extract frontmatter for safe replacement
    let content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
    if (fmMatch) {
      // Replace within frontmatter only (avoids matching body content)
      let frontmatter = fmMatch[2];
      frontmatter = frontmatter.replace(/(status:\s*)\S+/, `$1${newStatus}`);
      frontmatter = frontmatter.replace(/(updated:\s*)\S+/, `$1${new Date().toISOString()}`);
      content = fmMatch[1] + frontmatter + fmMatch[3] + content.slice(fmMatch[0].length);
    }
    // Update trailing Status line in body
    content = content.replace(
      /\*\*Status\*\*:\s*\S+/,
      `**Status**: ${newStatus}`
    );
    fs.writeFileSync(filePath, content, 'utf-8');

    // Sync plan-state.json
    const parsedFm = parsePlanFrontmatter(filePath);
    if (parsedFm && parsedFm.id) {
      const state = loadPlanState(parsedFm.id);
      if (state) {
        state.status = newStatus;
        const now = new Date().toISOString();
        if (newStatus === 'approved') state.approvedAt = now;
        if (newStatus === 'completed' || newStatus === 'failed') state.completedAt = now;
        if (newStatus === 'cancelled') state.cancelledAt = now;
        savePlanState(state);
      }
    }

    return { success: true };
  } catch (err) {
    console.error(`[lens] updatePlanStatus failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Validate that a plan document contains all required sections.
 * @param {string} content - Markdown content
 * @returns {{valid: boolean, missing: string[]}}
 */
function validatePlanStructure(content) {
  const missing = [];
  for (const section of REQUIRED_SECTIONS) {
    // Check for section header (## ... Section Name)
    const pattern = new RegExp(`##\\s+.*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    if (!pattern.test(content)) {
      missing.push(section);
    }
  }
  // Check for leftover template placeholders
  const hasPlaceholders = /\{[a-z_]+\}/i.test(content);
  if (hasPlaceholders) {
    missing.push('(contains unresolved {placeholder} variables)');
  }
  return { valid: missing.length === 0, missing };
}

// ── Module Exports ───────────────────────────────────────

module.exports = {
  // Path
  getPlansDir,
  ensurePlansDir,
  getStatePath,

  // Naming
  generateSlug,
  generateFileName,
  generatePlanId,

  // State
  savePlanState,
  loadPlanState,
  listPlans,
  formatPlanSummary,

  // Document Generation
  generatePlanContent,
  parsePlanFrontmatter,
  updatePlanStatus,
  validatePlanStructure,
  REQUIRED_SECTIONS,
};

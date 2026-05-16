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
const { safeEnsureDir, safeReadJson, safeWriteJson } = require('./hook-utils');

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
  safeEnsureDir(dir);
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
    safeEnsureDir(path.dirname(statePath));

    let states = safeReadJson(statePath, {}) || {};

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

    return safeWriteJson(statePath, states, { atomic: true })
      ? { success: true }
      : { success: false, error: 'write failed' };
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
    const states = safeReadJson(statePath, {}) || {};
    return planId ? (states[planId] || null) : states;
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

// v3.4+ Goal-first structure. Goal is the absolute priority — every other
// section is supporting material. Order matters: Goal → Plan A → Plan B → Risks.
const REQUIRED_SECTIONS = [
  'Goal',
  'Plan A',
  'Plan B',
  'Risks',
  'Status',
];

/**
 * Generate plan document content from structured data (v3.4+ Goal-first).
 * Goal is the absolute priority. Plan A/B/Risks are supporting sections.
 *
 * @param {object} planData
 * @param {string} planData.id - Plan ID
 * @param {string} planData.task - User's original request (kept as context only)
 * @param {object} planData.goal - Goal definition
 * @param {string[]} planData.goal.deliverables - Concrete artifacts that must exist on completion
 * @param {string[]} planData.goal.successCriteria - Verifiable yes/no checks
 * @param {string} planData.goal.doneDefinition - One-sentence "Done = ?"
 * @param {object} planData.planA - Recommended path
 * @param {string} planData.planA.rationale - Why this is the first choice
 * @param {string[]} planData.planA.steps - Plan A checklist items
 * @param {Array} planData.planA.failureTriggers - [{point, signal}] — feeds Plan B
 * @param {object} [planData.planB] - Fallback path (optional for small tasks)
 * @param {string} planData.planB.trigger - Concrete switch condition
 * @param {string} planData.planB.rationale - Trade-off vs Plan A
 * @param {string[]} planData.planB.steps - Plan B checklist items
 * @param {Array} planData.risks - Risks [{description, severity, mitigation}]
 * @param {string} planData.language - Document language code
 * @returns {string} Markdown content
 */
function generatePlanContent(planData) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const isoDate = now.toISOString();
  const todayDate = isoDate.slice(0, 10);
  const lang = planData.language || 'en';

  const headers = {
    en: { goal: 'Goal — Deliverables', deliverables: 'Deliverables', criteria: 'Success Criteria (verifiable)', done: 'Definition of Done', planA: 'Plan A — Recommended Path', planB: 'Plan B — Fallback Path', rationale: 'Why this first', steps: 'Steps', failPoints: 'Where it may break (→ Plan B triggers)', trigger: 'Trigger', tradeoff: 'Why this fallback', risks: 'Risks & Pre-mortem', progress: 'Progress', currentPath: 'Current path', resume: 'Resume from', status: 'Status', noPlanB: 'Plan B not required — single-command task' },
    ko: { goal: 'Goal — 결과물', deliverables: '완료 시점에 존재해야 하는 것', criteria: '성공 기준 (검증 가능)', done: '완료의 정의 (Done = ?)', planA: 'Plan A — 권장 경로', planB: 'Plan B — Fallback 경로', rationale: '왜 이게 1순위인가', steps: '단계', failPoints: '막힐 수 있는 지점 (→ Plan B 트리거)', trigger: 'Trigger', tradeoff: '왜 이 대안인가', risks: '사전 리스크 (Pre-mortem)', progress: '진행상황', currentPath: '현재 경로', resume: '재개 포인트', status: '상태', noPlanB: 'Plan B 불필요 — 단일 명령 작업' },
    ja: { goal: 'Goal — 成果物', deliverables: '完了時点で存在すべきもの', criteria: '成功基準 (検証可能)', done: '完了の定義 (Done = ?)', planA: 'Plan A — 推奨パス', planB: 'Plan B — フォールバック', rationale: 'なぜこれが1番か', steps: 'ステップ', failPoints: '詰まる可能性のある箇所 (→ Plan Bトリガー)', trigger: 'トリガー', tradeoff: 'なぜこの代替案', risks: '事前リスク (Pre-mortem)', progress: '進捗', currentPath: '現在のパス', resume: '再開ポイント', status: 'ステータス', noPlanB: 'Plan B 不要 — 単一コマンドタスク' },
    zh: { goal: 'Goal — 交付物', deliverables: '完成时必须存在的内容', criteria: '成功标准 (可验证)', done: '完成定义 (Done = ?)', planA: 'Plan A — 推荐路径', planB: 'Plan B — 备用路径', rationale: '为什么这是首选', steps: '步骤', failPoints: '可能受阻的环节 (→ Plan B 触发器)', trigger: '触发条件', tradeoff: '为什么选择此备选', risks: '风险预案 (Pre-mortem)', progress: '进度', currentPath: '当前路径', resume: '恢复点', status: '状态', noPlanB: 'Plan B 不必要 — 单一命令任务' },
    es: { goal: 'Goal — Entregables', deliverables: 'Lo que debe existir al finalizar', criteria: 'Criterios de éxito (verificables)', done: 'Definición de Done', planA: 'Plan A — Ruta recomendada', planB: 'Plan B — Ruta alternativa', rationale: 'Por qué esto primero', steps: 'Pasos', failPoints: 'Dónde puede fallar (→ disparadores de Plan B)', trigger: 'Disparador', tradeoff: 'Por qué este respaldo', risks: 'Riesgos & Pre-mortem', progress: 'Progreso', currentPath: 'Ruta actual', resume: 'Reanudar desde', status: 'Estado', noPlanB: 'Plan B no requerido — tarea de comando único' },
    fr: { goal: 'Goal — Livrables', deliverables: 'Ce qui doit exister à la fin', criteria: 'Critères de succès (vérifiables)', done: 'Définition de Done', planA: 'Plan A — Voie recommandée', planB: 'Plan B — Voie de repli', rationale: 'Pourquoi cela en premier', steps: 'Étapes', failPoints: "Points de blocage possibles (→ déclencheurs Plan B)", trigger: 'Déclencheur', tradeoff: 'Pourquoi ce repli', risks: 'Risques & Pre-mortem', progress: 'Progression', currentPath: 'Voie actuelle', resume: 'Reprendre depuis', status: 'Statut', noPlanB: 'Plan B non requis — tâche à commande unique' },
    de: { goal: 'Goal — Ergebnisse', deliverables: 'Was nach Abschluss existieren muss', criteria: 'Erfolgskriterien (überprüfbar)', done: 'Definition von Done', planA: 'Plan A — Empfohlener Pfad', planB: 'Plan B — Ausweichpfad', rationale: 'Warum dies zuerst', steps: 'Schritte', failPoints: 'Mögliche Engstellen (→ Plan-B-Trigger)', trigger: 'Auslöser', tradeoff: 'Warum dieser Rückfall', risks: 'Risiken & Pre-mortem', progress: 'Fortschritt', currentPath: 'Aktueller Pfad', resume: 'Fortsetzen ab', status: 'Status', noPlanB: 'Plan B nicht erforderlich — Single-Command-Aufgabe' },
    it: { goal: 'Goal — Risultati', deliverables: 'Cosa deve esistere al termine', criteria: 'Criteri di successo (verificabili)', done: 'Definizione di Done', planA: 'Plan A — Percorso consigliato', planB: 'Plan B — Percorso di ripiego', rationale: 'Perché questo per primo', steps: 'Passi', failPoints: 'Dove può bloccarsi (→ trigger Plan B)', trigger: 'Trigger', tradeoff: 'Perché questa alternativa', risks: 'Rischi & Pre-mortem', progress: 'Progresso', currentPath: 'Percorso attuale', resume: 'Riprendi da', status: 'Stato', noPlanB: 'Plan B non necessario — attività a comando singolo' },
  };
  const h = headers[lang] || headers.en;
  const goal = planData.goal || {};
  const planA = planData.planA || {};
  const planB = planData.planB;

  // YAML frontmatter (kept compatible with v3.3.x consumers)
  let content = '---\n';
  content += `id: ${planData.id}\n`;
  content += `type: plan\n`;
  content += `version: 2\n`;
  content += `created: ${isoDate}\n`;
  content += `updated: ${isoDate}\n`;
  content += `status: draft\n`;
  content += `generator: lens/plan\n`;
  content += `language: ${lang}\n`;
  content += `parent: null\n`;
  content += `refs: []\n`;
  content += '---\n\n';

  // Title + original request as context
  content += `# Work Plan / ${planData.task || ''}\n\n`;
  content += `> Generated by Lens Plan on ${dateStr}\n`;
  content += `> Plan ID: ${planData.id}\n\n---\n\n`;

  // === Goal (top-priority, absolute) ===
  content += `## 🎯 Goal — ${h.goal}\n\n`;
  content += `**${h.deliverables}:**\n`;
  (goal.deliverables || []).forEach(d => { content += `- ${d}\n`; });
  content += '\n';
  content += `**${h.criteria}:**\n`;
  (goal.successCriteria || []).forEach(c => { content += `- [ ] ${c}\n`; });
  content += '\n';
  if (goal.doneDefinition) {
    content += `**${h.done}:**\n\n> ${goal.doneDefinition}\n\n`;
  }

  // === Plan A ===
  content += `## ${h.planA}\n\n`;
  if (planA.rationale) {
    content += `### ${h.rationale}\n${planA.rationale}\n\n`;
  }
  content += `### ${h.steps}\n`;
  (planA.steps || []).forEach(s => { content += `- [ ] ${s}\n`; });
  content += '\n';
  if (planA.failureTriggers && planA.failureTriggers.length > 0) {
    content += `### ${h.failPoints}\n`;
    planA.failureTriggers.forEach(t => {
      const point = typeof t === 'string' ? t : `${t.point || ''}: ${t.signal || ''}`;
      content += `- ${point}\n`;
    });
    content += '\n';
  }

  // === Plan B (optional for small tasks) ===
  content += `## ${h.planB}\n\n`;
  if (!planB) {
    content += `${h.noPlanB}\n\n`;
  } else {
    if (planB.trigger) content += `### ${h.trigger}\n${planB.trigger}\n\n`;
    if (planB.rationale) content += `### ${h.tradeoff}\n${planB.rationale}\n\n`;
    content += `### ${h.steps}\n`;
    (planB.steps || []).forEach(s => { content += `- [ ] ${s}\n`; });
    content += '\n';
  }

  // === Risks / Pre-mortem ===
  content += `## ⚠️ ${h.risks}\n\n`;
  if (!planData.risks || planData.risks.length === 0) {
    content += '(Pre-mortem 미실행 — Phase 3 에서 채움)\n\n';
  } else {
    content += '| # | Risk | Severity | Mitigation |\n';
    content += '|---|------|----------|------------|\n';
    planData.risks.forEach((r, i) => {
      content += `| ${i + 1} | ${r.description} | ${r.severity || 'M'} | ${r.mitigation || '-'} |\n`;
    });
    content += '\n';
  }

  // === Progress ===
  content += `## ${h.progress}\n\n`;
  content += `- **Updated**: ${todayDate}\n`;
  content += `- **${h.currentPath}**: Plan A\n`;
  content += `- **${h.resume}**: -\n\n`;

  // === Status (terminal marker for status updates) ===
  content += `## ${h.status}\n\n`;
  content += '**Status**: draft\n';

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
 * Extract Goal section from a plan markdown body (v3.4+).
 * Best-effort parser — returns null on shape it doesn't recognize so callers
 * can fall back to direct Read of the plan file.
 *
 * @param {string} content - Full markdown content
 * @returns {{deliverables: string[], successCriteria: string[], doneDefinition: string|null, raw: string}|null}
 */
function extractGoal(content) {
  const goalHeader = content.match(/^##\s+(?:🎯\s+)?Goal[^\n]*$/m);
  if (!goalHeader) return null;
  const start = goalHeader.index + goalHeader[0].length;
  const nextHeader = content.slice(start).search(/^##\s+/m);
  const raw = nextHeader === -1 ? content.slice(start) : content.slice(start, start + nextHeader);

  const deliverables = [];
  const successCriteria = [];
  // Lines starting with "- [ ]" or "- [x]" are success criteria; plain "- " before
  // the first checkbox block are deliverables.
  const lines = raw.split('\n');
  let sawCriteria = false;
  for (const line of lines) {
    const checkbox = line.match(/^\s*-\s*\[[ xX]\]\s*(.+?)\s*$/);
    if (checkbox) {
      successCriteria.push(checkbox[1]);
      sawCriteria = true;
      continue;
    }
    if (sawCriteria) continue;
    const bullet = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bullet) deliverables.push(bullet[1]);
  }

  const doneMatch = raw.match(/>\s*(.+?)\s*$/m);
  const doneDefinition = doneMatch ? doneMatch[1] : null;

  return { deliverables, successCriteria, doneDefinition, raw: raw.trim() };
}

/**
 * Extract Plan A failure triggers from a plan markdown body.
 * These are the keys /cc uses to match Supervisor failure signals against
 * Plan B Trigger conditions for auto-switching.
 *
 * @param {string} content - Full markdown content
 * @returns {string[]} Trigger descriptions (one per bullet)
 */
function extractPlanBTriggers(content) {
  // Find the "막힐 수 있는 지점" / "Where it may break" subheader under Plan A.
  const re = /^###\s+.*(?:Plan B|막힐|trigger|break|詰まる|受阻|fallar|blocage|Engstellen|bloccarsi)[^\n]*$/im;
  const match = content.match(re);
  if (!match) return [];
  const start = match.index + match[0].length;
  const nextHeader = content.slice(start).search(/^#{2,3}\s+/m);
  const block = nextHeader === -1 ? content.slice(start) : content.slice(start, start + nextHeader);
  const triggers = [];
  for (const line of block.split('\n')) {
    const bullet = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bullet) triggers.push(bullet[1]);
  }
  return triggers;
}

// Multi-lingual aliases for REQUIRED_SECTIONS so validatePlanStructure works
// against any of the 8 supported languages. generatePlanContent keeps English
// keywords for Goal/Plan A/Plan B but translates Risks/Status — these aliases
// recognize the translations.
const SECTION_ALIASES = {
  'Goal': ['Goal', '🎯', 'Ziel', 'Objectif', 'Objetivo', 'Obiettivo', '목표', '目標', '目标'],
  'Plan A': ['Plan A'],
  'Plan B': ['Plan B'],
  'Risks': ['Risks', 'Pre-mortem', '⚠️', '리스크', 'リスク', '风险', 'Riesgos', 'Risques', 'Risiken', 'Rischi'],
  'Status': ['Status', '상태', 'ステータス', '状态', 'Estado', 'Statut', 'Stato'],
};

/**
 * Validate that a plan document contains all required sections.
 * @param {string} content - Markdown content
 * @returns {{valid: boolean, missing: string[]}}
 */
function validatePlanStructure(content) {
  const missing = [];
  for (const section of REQUIRED_SECTIONS) {
    const aliases = SECTION_ALIASES[section] || [section];
    const escaped = aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const pattern = new RegExp(`^##\\s+.*(?:${escaped})`, 'im');
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

  // v3.4+ Goal-first extractors (used by /cc handoff entry)
  extractGoal,
  extractPlanBTriggers,
};

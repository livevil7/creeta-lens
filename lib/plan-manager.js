/**
 * Creet - Plan Manager Module
 * Generates, saves, and manages work plan documents (작업계획서).
 *
 * Plan files: .creet/plans/YYYY-MM-DD-{slug}.md
 * State file: .creet/plan-state.json
 * Cross-platform: Windows (Git Bash) + macOS
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Constants ────────────────────────────────────────────

const CREET_DIR = '.creet';
const PLANS_DIR = 'plans';
const STATE_FILE = 'plan-state.json';
const MAX_SLUG_LENGTH = 50;
const MAX_PLANS_RETAINED = 50;
const MAX_TASK_LENGTH = 100;

// ── Path Resolution ──────────────────────────────────────

/**
 * Get plans directory path.
 * Priority: config override → .creet/plans/ (project-local)
 * @param {string|null} configDir - Optional override from creet.config.json
 */
function getPlansDir(configDir) {
  if (configDir) {
    return path.resolve(configDir);
  }
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(projectRoot, CREET_DIR, PLANS_DIR);
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
  return path.join(projectRoot, CREET_DIR, STATE_FILE);
}

// ── Slug & File Naming ───────────────────────────────────

/**
 * Generate a URL-safe slug from task description.
 * Keeps Korean, Japanese, Chinese characters alongside ASCII.
 * @param {string} taskDescription
 * @returns {string}
 */
function generateSlug(taskDescription) {
  if (!taskDescription || !taskDescription.trim()) {
    return 'plan-' + crypto.randomBytes(3).toString('hex');
  }

  const slug = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ぁ-んァ-ヶー一-龥\s-]/g, '')
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
 * Save plan state to .creet/plan-state.json.
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
      states = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
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

    // Retain only recent plans
    const keys = Object.keys(states);
    if (keys.length > MAX_PLANS_RETAINED) {
      const toRemove = keys.slice(0, keys.length - MAX_PLANS_RETAINED);
      toRemove.forEach(k => delete states[k]);
    }

    fs.writeFileSync(statePath, JSON.stringify(states, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
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
  } catch {}
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
};

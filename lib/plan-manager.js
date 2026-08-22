/**
 * Lens - Plan Manager Module
 * Generates, saves, and manages work plan documents (작업계획서).
 *
 * Plan files: docs/YYYY-MM-DD-{slug}.md (configurable via planDir)
 * State file: .lens/plan-state.json
 * Cross-platform: Windows (Git Bash) + macOS
 *
 * ── RUNTIME SURFACE (v3.13+) ─────────────────────────────────────────────
 * LIVE (called by hooks/session-start.js): `formatPlanSummary`, `ensurePlansDir`
 *   (+ their internal helper `getPlansDir`). These are the only functions
 *   exercised at runtime — keep them in sync.
 *
 * LIVE (v3.32+): `validatePlanCoverage` — the /cp Phase 5.0 coverage gate.
 * LIVE (v3.25+): `validatePlanStructure`, `REQUIRED_SECTIONS`,
 *   `GRADE_REQUIRED_SECTIONS` — now called for real by the /cp Phase 5.0 gate and
 *   by the /c and /cc execution-entry gates. These MUST stay in sync with the
 *   /cp document template. Between v3.4 and v3.24 they had zero callers, so the
 *   required-section list silently drifted three releases behind the template;
 *   that is the drift this wiring exists to prevent.
 *
 * @deprecated The plan-document GENERATION half is still NOT called at runtime —
 *   the /cp SKILL.md authors plan docs directly (the 8-language dict here is a
 *   reference scaffold, not executed). Kept as a reference/backup, but DO NOT
 *   treat as a release-blocking sync target:
 *     generatePlanContent, extractGoal, extractPlanBTriggers,
 *     updatePlanStatus, savePlanState, loadPlanState, parsePlanFrontmatter
 *   Before re-using any of these, confirm against /cp SKILL.md (the SoT).
 * ─────────────────────────────────────────────────────────────────────────
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
// v3.8+: Goal is human language ("what becomes possible"); technical evidence
// lives only in the Verification section (signal / how-to-verify / pass / kind).
// v3.25: aligned with the /cp document template (SKILL.md is the SoT).
// Previously frozen at the v3.4 skeleton, which no longer matched the sections
// the skill actually writes — the validator checked a shape that had not
// existed for several releases.
// v3.32: `Inventory` added. It is the one section that can be checked for
// *omission* rather than presence, so it is required at every grade — dropped
// work items are exactly as likely in a fast plan as in a deep one.
// v3.34: 11 → 6. The audit measured which sections /cp's own output actually
// carries, and the four most-missing were Non-Goals (17), OpenQuestions (17),
// Alternatives (16) and DoNotChange (16). Three of them are dropped from the
// floor; DoNotChange stays because it is the one section the harness cannot
// substitute — its Surgical rule does not know which paths *this* task must not
// touch. Status is /cc's to write (Phase 7.4), so gating the planner on it made
// the planner responsible for a field it does not own. OpenQuestions survives as
// prose ("차단 질문 0"), not as a required heading: forcing the section produced
// empty ceremony rather than surfaced uncertainty.
//
// The floor is a floor, never a ceiling — a plan adds whatever sections its
// subject needs. What is checked here is only what no plan may omit.
const REQUIRED_SECTIONS = [
  'Goal',
  'Why',
  'Inventory',
  'Plan A',
  'Verification',
  'DoNotChange',
];

// Grade-specific ADDITIONS (v3.34, inverted from the old exemption model).
// Exemptions read backwards: they made the strictest grade the default and then
// carved holes, so every new section silently applied to quick fixes too. Stating
// what deep adds keeps the default light and the escalation explicit.
// Irreversible work is where an unexamined alternative or an unlisted risk costs
// the most, so those three are required exactly there.
const GRADE_REQUIRED_SECTIONS = {
  deep: ['Non-Goals', 'Alternatives', 'Risks'],
};

// v3.26+ branch-lifecycle frontmatter fields (1 task = 1 doc = 1 branch = 1 PR).
// Documents written before v3.26 do not carry them, so parsePlanFrontmatter
// defaults them to null instead of leaving them undefined — consumers can read
// `fm.branch` unconditionally without a hasOwnProperty dance.
const BRANCH_LIFECYCLE_FIELDS = ['repo', 'base', 'branch', 'pr'];

/**
 * Render a frontmatter scalar: unset → literal `null` (round-trips through
 * parsePlanFrontmatter back to null).
 * @param {*} v
 * @returns {string}
 */
function fmValue(v) {
  return (v === undefined || v === null || v === '') ? 'null' : String(v);
}

/**
 * Generate plan document content from structured data (v3.4+ Goal-first).
 * Goal is the absolute priority. Plan A/B/Risks are supporting sections.
 *
 * @param {object} planData
 * @param {string} planData.id - Plan ID
 * @param {string} planData.task - User's original request (kept as context only)
 * @param {object} planData.goal - Goal definition (human language, v3.8+)
 * @param {string[]} planData.goal.successCriteria - Human-language goals ("what becomes possible") — rendered as plain bullets, no technical tokens
 * @param {string[]} [planData.goal.deliverables] - Legacy fallback used only when successCriteria is absent
 * @param {Array} [planData.goal.verification] - [{signal, method, expected, kind}] — machine evidence (kind: 'auto' = run command, 'manual' = human check). Evidence must surface in transcript
 * @param {string} planData.goal.doneDefinition - One-sentence "Done = ?" (human language)
 * @param {object} planData.planA - Recommended path
 * @param {string} planData.planA.rationale - Why this is the first choice
 * @param {string[]} planData.planA.steps - Plan A checklist items
 * @param {Array} planData.planA.failureTriggers - [{point, signal}] — feeds Plan B
 * @param {object} [planData.planB] - Fallback path (optional for small tasks)
 * @param {string} planData.planB.trigger - Concrete switch condition
 * @param {string} planData.planB.rationale - Trade-off vs Plan A
 * @param {string[]} planData.planB.steps - Plan B checklist items
 * @param {Array} planData.risks - Risks [{description, severity, mitigation}]
 * @param {object} [planData.dualSynthesis] - v3.9+ Claude‖Codex synthesis (optional). {agreements: string[], divergences: [{point, claude, codex, chosen, rationale}]}
 * @param {string} planData.language - Document language code
 * @param {string} [planData.repo] - Repo directory name the task belongs to (branch lifecycle)
 * @param {string} [planData.base] - Detected base branch of that repo (never guessed here — see lib/git-branch.js)
 * @param {string} [planData.branch] - Task branch name, e.g. `feat/<slug>`
 * @param {number|string} [planData.pr] - PR number once one exists (null until then)
 * @returns {string} Markdown content
 */
function generatePlanContent(planData) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const isoDate = now.toISOString();
  const todayDate = isoDate.slice(0, 10);
  const lang = planData.language || 'en';

  const headers = {
    en: { goal: 'Goal — what becomes possible (human language)', deliverables: 'What becomes possible after this', done: 'Definition of Done', planA: 'Plan A — Recommended Path', planB: 'Plan B — Fallback Path', rationale: 'Why this first', steps: 'Steps', failPoints: 'Where it may break (→ Plan B triggers)', trigger: 'Trigger', tradeoff: 'Why this fallback', risks: 'Risks & Pre-mortem', progress: 'Progress', currentPath: 'Current path', resume: 'Resume from', status: 'Status', verification: 'Verification — evidence of completion', vCriterion: 'Signal of success', vMethod: 'How to verify', vExpected: 'Expected (pass)', vKind: 'Kind', noPlanB: 'Plan B not required — single-command task' },
    ko: { goal: '목표 — 무엇이 가능해지는가 (사람 언어)', deliverables: '이 작업이 끝나면 가능해지는 것', done: '완료의 정의 (Done = ?)', planA: 'Plan A — 권장 경로', planB: 'Plan B — Fallback 경로', rationale: '왜 이게 1순위인가', steps: '단계', failPoints: '막힐 수 있는 지점 (→ Plan B 트리거)', trigger: 'Trigger', tradeoff: '왜 이 대안인가', risks: '사전 리스크 (Pre-mortem)', progress: '진행상황', currentPath: '현재 경로', resume: '재개 포인트', status: '상태', verification: '검증 — 이게 됐다는 증거 (기계가 판정)', vCriterion: '목표가 됐다는 신호', vMethod: '확인 방법 (명령/관측)', vExpected: '통과 판정', vKind: '종류', noPlanB: 'Plan B 불필요 — 단일 명령 작업' },
    ja: { goal: '目標 — 何ができるようになるか (人間の言葉)', deliverables: 'この作業が終わると可能になること', done: '完了の定義 (Done = ?)', planA: 'Plan A — 推奨パス', planB: 'Plan B — フォールバック', rationale: 'なぜこれが1番か', steps: 'ステップ', failPoints: '詰まる可能性のある箇所 (→ Plan Bトリガー)', trigger: 'トリガー', tradeoff: 'なぜこの代替案', risks: '事前リスク (Pre-mortem)', progress: '進捗', currentPath: '現在のパス', resume: '再開ポイント', status: 'ステータス', verification: '検証 — 完了の証拠 (機械が判定)', vCriterion: '完了のシグナル', vMethod: '確認方法 (コマンド/観測)', vExpected: '合格判定', vKind: '種類', noPlanB: 'Plan B 不要 — 単一コマンドタスク' },
    zh: { goal: '目标 — 完成后能做什么 (人话)', deliverables: '完成后能够做到的事', done: '完成定义 (Done = ?)', planA: 'Plan A — 推荐路径', planB: 'Plan B — 备用路径', rationale: '为什么这是首选', steps: '步骤', failPoints: '可能受阻的环节 (→ Plan B 触发器)', trigger: '触发条件', tradeoff: '为什么选择此备选', risks: '风险预案 (Pre-mortem)', progress: '进度', currentPath: '当前路径', resume: '恢复点', status: '状态', verification: '验证 — 完成的证据 (机器判定)', vCriterion: '完成的信号', vMethod: '验证方法 (命令/观测)', vExpected: '通过判定', vKind: '类型', noPlanB: 'Plan B 不必要 — 单一命令任务' },
    es: { goal: 'Objetivo — qué se vuelve posible (lenguaje humano)', deliverables: 'Lo que se vuelve posible al terminar', done: 'Definición de Done', planA: 'Plan A — Ruta recomendada', planB: 'Plan B — Ruta alternativa', rationale: 'Por qué esto primero', steps: 'Pasos', failPoints: 'Dónde puede fallar (→ disparadores de Plan B)', trigger: 'Disparador', tradeoff: 'Por qué este respaldo', risks: 'Riesgos & Pre-mortem', progress: 'Progreso', currentPath: 'Ruta actual', resume: 'Reanudar desde', status: 'Estado', verification: 'Verificación — evidencia de finalización', vCriterion: 'Señal de éxito', vMethod: 'Cómo verificar', vExpected: 'Esperado (pass)', vKind: 'Tipo', noPlanB: 'Plan B no requerido — tarea de comando único' },
    fr: { goal: 'Objectif — ce qui devient possible (langage humain)', deliverables: 'Ce qui devient possible une fois terminé', done: 'Définition de Done', planA: 'Plan A — Voie recommandée', planB: 'Plan B — Voie de repli', rationale: 'Pourquoi cela en premier', steps: 'Étapes', failPoints: "Points de blocage possibles (→ déclencheurs Plan B)", trigger: 'Déclencheur', tradeoff: 'Pourquoi ce repli', risks: 'Risques & Pre-mortem', progress: 'Progression', currentPath: 'Voie actuelle', resume: 'Reprendre depuis', status: 'Statut', verification: 'Vérification — preuve de complétion', vCriterion: 'Signal de réussite', vMethod: 'Comment vérifier', vExpected: 'Attendu (pass)', vKind: 'Type', noPlanB: 'Plan B non requis — tâche à commande unique' },
    de: { goal: 'Ziel — was möglich wird (menschliche Sprache)', deliverables: 'Was danach möglich wird', done: 'Definition von Done', planA: 'Plan A — Empfohlener Pfad', planB: 'Plan B — Ausweichpfad', rationale: 'Warum dies zuerst', steps: 'Schritte', failPoints: 'Mögliche Engstellen (→ Plan-B-Trigger)', trigger: 'Auslöser', tradeoff: 'Warum dieser Rückfall', risks: 'Risiken & Pre-mortem', progress: 'Fortschritt', currentPath: 'Aktueller Pfad', resume: 'Fortsetzen ab', status: 'Status', verification: 'Verifizierung — Nachweis des Abschlusses', vCriterion: 'Signal für Erfolg', vMethod: 'Prüfmethode', vExpected: 'Erwartet (pass)', vKind: 'Art', noPlanB: 'Plan B nicht erforderlich — Single-Command-Aufgabe' },
    it: { goal: 'Obiettivo — cosa diventa possibile (linguaggio umano)', deliverables: 'Cosa diventa possibile al termine', done: 'Definizione di Done', planA: 'Plan A — Percorso consigliato', planB: 'Plan B — Percorso di ripiego', rationale: 'Perché questo per primo', steps: 'Passi', failPoints: 'Dove può bloccarsi (→ trigger Plan B)', trigger: 'Trigger', tradeoff: 'Perché questa alternativa', risks: 'Rischi & Pre-mortem', progress: 'Progresso', currentPath: 'Percorso attuale', resume: 'Riprendi da', status: 'Stato', verification: 'Verifica — prova di completamento', vCriterion: 'Segnale di successo', vMethod: 'Come verificare', vExpected: 'Atteso (pass)', vKind: 'Tipo', noPlanB: 'Plan B non necessario — attività a comando singolo' },
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
  // Branch lifecycle (v3.26+). The document frontmatter is the source of truth
  // for these four — `.lens/plan-state.json` stays status-only, and `pr` is
  // mutated outside Lens (gh), so a second copy would drift. Emitted as `null`
  // when the caller has not resolved them; the values themselves are decided by
  // lib/git-branch.js, never guessed here.
  content += `repo: ${fmValue(planData.repo)}\n`;
  content += `base: ${fmValue(planData.base)}\n`;
  content += `branch: ${fmValue(planData.branch)}\n`;
  content += `pr: ${fmValue(planData.pr)}\n`;
  content += '---\n\n';

  // Title + original request as context
  content += `# Work Plan / ${planData.task || ''}\n\n`;
  content += `> Generated by Lens Plan on ${dateStr}\n`;
  content += `> Plan ID: ${planData.id}\n\n---\n\n`;

  // === Goal (top-priority, human language — no technical tokens) ===
  // The human goals (what becomes possible) are the success criteria, rendered
  // as plain bullets. Technical evidence lives in the Verification table only.
  const outcomes = (goal.successCriteria && goal.successCriteria.length)
    ? goal.successCriteria
    : (goal.deliverables || []);
  content += `## 🎯 ${h.goal}\n\n`;
  content += `**${h.deliverables}:**\n`;
  outcomes.forEach(o => { content += `- ${o}\n`; });
  content += '\n';
  if (goal.doneDefinition) {
    content += `**${h.done}:**\n\n> ${goal.doneDefinition}\n\n`;
  }

  // === Verification (machine evidence; auto = run command, manual = human check) ===
  content += `## ✅ ${h.verification}\n\n`;
  content += `| # | ${h.vCriterion} | ${h.vMethod} | ${h.vExpected} | ${h.vKind} |\n`;
  content += `|---|---|---|---|---|\n`;
  const verification = goal.verification || [];
  if (verification.length > 0) {
    verification.forEach((v, i) => {
      content += `| ${i + 1} | ${v.signal || v.criterion || '-'} | ${v.method || '-'} | ${v.expected || '-'} | ${v.kind || 'manual'} |\n`;
    });
  } else {
    outcomes.forEach((o, i) => {
      content += `| ${i + 1} | ${o} | - | - | manual |\n`;
    });
  }
  content += '\n';

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

  // === Dual synthesis (Claude ‖ Codex) — optional, only when provided (v3.9+) ===
  if (planData.dualSynthesis) {
    const ds = planData.dualSynthesis;
    const dsTitle = { ko: '듀얼 합성 (Claude ‖ Codex)', ja: 'デュアル統合 (Claude ‖ Codex)', zh: '双重综合 (Claude ‖ Codex)' }[lang] || 'Dual Synthesis (Claude ‖ Codex)';
    const dsAgree = { ko: '합의 (고신뢰)', ja: '合意 (高信頼)', zh: '共识 (高可信)' }[lang] || 'Agreement (high confidence)';
    const dsDiverge = { ko: '분기 → 해소', ja: '相違 → 解消', zh: '分歧 → 解决' }[lang] || 'Divergence → Resolution';
    content += `## 🔀 ${dsTitle}\n\n`;
    content += `**${dsAgree}:**\n`;
    (ds.agreements || []).forEach(a => { content += `- ${a}\n`; });
    content += '\n';
    content += `**${dsDiverge}:**\n`;
    (ds.divergences || []).forEach(d => {
      const line = typeof d === 'string'
        ? d
        : `${d.point || ''}: Claude=${d.claude || ''} / Codex=${d.codex || ''} → ${d.chosen || ''} (${d.rationale || ''})`;
      content += `- ${line}\n`;
    });
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
 * Branch-lifecycle fields (repo/base/branch/pr) are always present in the
 * result — `null` when the document predates them (backward compatible with
 * the pre-v3.26 documents already in docs/tasks/ and docs/history/).
 * @param {string} filePath
 * @returns {object|null} Parsed frontmatter fields, or null on failure
 */
function parsePlanFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // `\r?` — half of the existing docs/tasks + docs/history documents were
    // written on Windows with CRLF frontmatter; an LF-only anchor returned null
    // for them, so their fields (branch-lifecycle ones included) were invisible.
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;

    const fields = {};
    BRANCH_LIFECYCLE_FIELDS.forEach(k => { fields[k] = null; });
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
    // CRLF 도 받는다. parsePlanFrontmatter 가 CRLF 문서를 파싱하게 된 뒤로는
    // 여기가 LF 전용이면 더 나쁜 상태가 된다 — 본문과 plan-state.json 은 갱신되는데
    // frontmatter 의 status/updated 만 낡은 값으로 남고, 파싱은 성공하므로 아무도 눈치채지 못한다.
    const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
    if (fmMatch) {
      // Replace within frontmatter only (avoids matching body content).
      // Every other key is rewritten verbatim — that is what preserves the
      // branch-lifecycle fields (repo/base/branch/pr) across status changes.
      // `pr` in particular is filled in later (PR number) and must survive a
      // draft→executing→completed walk untouched.
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
  // Match the Goal header in any supported language (🎯 emoji, "Goal", or a
  // localized word like 목표/目標/目标/Ziel/Objectif/Objetivo/Obiettivo).
  const goalHeader = content.match(/^##\s+.*(?:🎯|Goal|목표|目標|目标|Ziel|Objectif|Objetivo|Obiettivo)[^\n]*$/m);
  if (!goalHeader) return null;
  const start = goalHeader.index + goalHeader[0].length;
  const nextHeader = content.slice(start).search(/^##\s+/m);
  const raw = nextHeader === -1 ? content.slice(start) : content.slice(start, start + nextHeader);

  const plainBullets = [];
  const checkboxCriteria = [];
  for (const line of raw.split('\n')) {
    const checkbox = line.match(/^\s*-\s*\[[ xX]\]\s*(.+?)\s*$/);
    if (checkbox) { checkboxCriteria.push(checkbox[1]); continue; }
    const bullet = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bullet) plainBullets.push(bullet[1]);
  }
  // v3.8+ human-centric: the Goal section holds plain-bullet human goals (no
  // checkboxes) — these ARE the success criteria. Legacy (v3.4–3.7): checkboxes
  // were the success criteria and plain bullets were deliverables.
  const successCriteria = checkboxCriteria.length ? checkboxCriteria : plainBullets;
  const deliverables = checkboxCriteria.length ? plainBullets : [];

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
  'Verification': ['Verification', '✅', '검증', '検証', '验证', 'Verificación', 'Vérification', 'Verifizierung', 'Verifica'],
  'Plan A': ['Plan A', 'How', '🛠'],
  'Plan B': ['Plan B'],
  'Risks': ['Risks', 'Pre-mortem', '⚠️', '리스크', 'リスク', '风险', 'Riesgos', 'Risques', 'Risiken', 'Rischi'],
  'Status': ['Status', '상태', 'ステータス', '状态', 'Estado', 'Statut', 'Stato', '진행상황'],
  // v3.25 additions
  'Non-Goals': ['Non-Goals', 'Non Goals', '🚧', '비목표', '非目標', '非目标', 'No Objetivos', 'Non-objectifs', 'Nicht-Ziele'],
  'Why': ['Why', '❓', '왜', 'なぜ', '为什么', 'Por qué', 'Pourquoi', 'Warum', 'Perché'],
  'Alternatives': ['Alternatives', 'Alternatives Considered', '검토된 대안', '検討した代替', '备选方案', 'Alternativas', 'Alternativen', 'Alternative'],
  'DoNotChange': ['DO NOT CHANGE', 'DO NOT TOUCH', '🚫', '건드리지'],
  'OpenQuestions': ['Open Questions', '미해결 질문', '미결 질문', '未解決', '未解决', 'Preguntas abiertas', 'Questions ouvertes', 'Offene Fragen'],
  // v3.32
  'Inventory': ['Inventory', 'Work Inventory', '📋', '작업 인벤토리', '인벤토리', '作業インベントリ', '工作清单', 'Inventario', 'Inventaire'],
};

// ── Coverage ledger (v3.32) ──────────────────────────────
//
// Why this exists: every earlier attempt to stop /cp from compressing plans was
// prose ("전량 적어라", 원칙 0, v3.21). Prose lost, twice. A plan can satisfy
// every structural check while silently dropping half the work that the
// research phases surfaced, because nothing ever compared "what was found"
// against "what got written" — omission had zero cost. The ledger gives it a
// cost: the discovered items are enumerated in the document itself, and every
// one of them must resolve to either a place in the plan or a written reason
// for being left out.
//
// This is deliberately NOT a length check. Length as a pass criterion produces
// padding; the ledger only asks that nothing found goes unaccounted for.

const INVENTORY_COLUMNS = {
  item: ['작업 항목', '항목', 'item', 'work item', 'task', '作業項目', '任务'],
  source: ['출처', 'source', 'origin', '出典', '来源'],
  where: ['반영 위치', '반영', '위치', 'where', 'location', 'mapped to', '反映位置', '位置'],
  status: ['상태', 'status', 'ステータス', '状态'],
};

const EXCLUDED_MARKERS = ['제외', 'excluded', 'exclude', 'drop', 'dropped', '除外', '排除'];
const INCLUDED_MARKERS = ['포함', 'included', 'include', 'in', '含む', '包含'];

// Cells that look filled but say nothing. A bare dash is the canonical way a
// model "fills" a column it has no answer for.
const EMPTY_CELL = /^(?:[-–—―]|n\/?a|없음|tbd|\?+|\.+)?$/i;

/** Split one markdown table row into trimmed cells (respects \| escapes). */
function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.replace(/\\\|/g, '|').trim());
}

const isSeparatorRow = line => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/** Extract the body of a `##`-or-deeper section whose heading matches aliases. */
function sliceSection(content, aliases) {
  const escaped = aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const head = content.match(new RegExp(`^#{2,4}\\s+.*(?:${escaped}).*$`, 'im'));
  if (!head) return null;
  const start = head.index + head[0].length;
  const rest = content.slice(start);
  const next = rest.search(/^#{1,4}\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Validate the coverage ledger of a plan document.
 *
 * Checks, in order:
 *   1. the inventory section exists and holds a parseable table;
 *   2. the table has at least one work item;
 *   3. every item declares a status;
 *   4. every included item names where in the plan it landed;
 *   5. every excluded item carries a written reason (not just the word "제외").
 *
 * Like validatePlanStructure this is mechanical, not semantic: it proves each
 * discovered item was consciously placed or consciously dropped. It cannot
 * prove the inventory itself was complete — that stays with the research
 * phases and human approval.
 *
 * @param {string} content - Full markdown content
 * @returns {{valid: boolean, total: number, included: number, excluded: number,
 *            problems: string[]}}
 */
function validatePlanCoverage(rawContent) {
  const result = { valid: false, total: 0, included: 0, excluded: 0, problems: [] };
  const content = String(rawContent).replace(/\r\n/g, '\n');

  const body = sliceSection(content, SECTION_ALIASES.Inventory);
  if (body === null) {
    result.problems.push('작업 인벤토리 섹션이 없다 (## 📋 작업 인벤토리)');
    return result;
  }

  const lines = body.split('\n').filter(l => l.trim().startsWith('|'));
  const headerIdx = lines.findIndex((l, i) => !isSeparatorRow(l) && isSeparatorRow(lines[i + 1] || ''));
  if (headerIdx === -1) {
    result.problems.push('작업 인벤토리에 표가 없다 (헤더 + 구분행 필요)');
    return result;
  }

  const header = splitRow(lines[headerIdx]).map(h => h.toLowerCase().replace(/\*/g, ''));
  const col = {};
  for (const [key, aliases] of Object.entries(INVENTORY_COLUMNS)) {
    col[key] = header.findIndex(h => aliases.some(a => h.includes(a.toLowerCase())));
  }
  const missingCols = Object.entries(col).filter(([, i]) => i === -1).map(([k]) => k);
  if (missingCols.length) {
    result.problems.push(`인벤토리 표에 필수 칼럼 누락: ${missingCols.join(', ')} (작업 항목·출처·반영 위치·상태)`);
    return result;
  }

  const rows = lines.slice(headerIdx + 2).filter(l => !isSeparatorRow(l)).map(splitRow);
  const cell = (row, key) => (row[col[key]] || '').replace(/\*/g, '').trim();

  for (const row of rows) {
    const item = cell(row, 'item');
    // Skip template leftovers and blank spacer rows.
    if (EMPTY_CELL.test(item) || /^\{.*\}$/.test(item)) continue;

    result.total += 1;
    const label = `"${item}"`;
    const status = cell(row, 'status');
    const where = cell(row, 'where');
    const lowered = status.toLowerCase();

    if (EMPTY_CELL.test(status)) {
      result.problems.push(`${label}: 상태가 비었다 — 포함인지 제외인지 정해야 한다`);
      continue;
    }

    const isExcluded = EXCLUDED_MARKERS.some(m => lowered.includes(m.toLowerCase()));
    const isIncluded = !isExcluded && INCLUDED_MARKERS.some(m => lowered.includes(m.toLowerCase()));

    if (isExcluded) {
      result.excluded += 1;
      // "제외" alone is not an answer. Require prose past the marker.
      const reason = status.replace(new RegExp(`^\\s*(?:${EXCLUDED_MARKERS.join('|')})\\s*[:：-]?\\s*`, 'i'), '').trim();
      if (reason.length < 2) {
        result.problems.push(`${label}: 제외 사유가 없다 — "제외: {왜 이번 범위 밖인가}" 형태로 적는다`);
      }
    } else if (isIncluded) {
      result.included += 1;
      if (EMPTY_CELL.test(where)) {
        result.problems.push(`${label}: 포함인데 반영 위치가 비었다 — 계획서 어느 단계·섹션에 실렸는지 적는다`);
      }
    } else {
      result.problems.push(`${label}: 상태 "${status}" 를 해석할 수 없다 — "포함" 또는 "제외: {사유}"`);
    }
  }

  if (result.total === 0) {
    result.problems.push('작업 인벤토리가 비었다 — 요청·조사에서 나온 항목을 전수 나열한다');
  }

  result.valid = result.problems.length === 0;
  return result;
}

// Documents authored before this release predate the coverage ledger.
const COVERAGE_LEDGER_SINCE = '2026-08-17';

/**
 * Was this plan written before the coverage ledger existed?
 *
 * Read from the document's own frontmatter rather than from mtime — a plan
 * copied between machines keeps its frontmatter but not its file timestamps.
 * Four field spellings appear in the wild (`created`, `date`, and the date
 * prefix of `plan_id`/`id`); deep-grade plans in this repo use `date:`, so
 * checking only `created`/`plan_id` misses them. A document with no readable
 * date is treated as current: unknown provenance should not buy an exemption.
 *
 * @param {string} content - Full markdown content
 * @returns {boolean}
 */
function isPreCoverageDoc(content) {
  // \r? throughout: plan docs checked out on Windows are CRLF, and an
  // LF-only fence match silently reports every one of them as "not legacy".
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const dated = fm[1].match(/^(?:created|date|plan_id|id)\s*:\s*"?(\d{4}-\d{2}-\d{2})/m);
  return dated ? dated[1] < COVERAGE_LEDGER_SINCE : false;
}

/**
 * Validate that a plan document contains all required sections.
 *
 * v3.25: called for real by the /cp Phase 5.0 gate and by the /c and /cc
 * execution-entry gates. Before that this had zero runtime callers, so the
 * required-section list silently drifted away from what the skill wrote.
 *
 * The check is structural only — it proves a section exists, never that its
 * content is any good. Semantic quality stays with human approval and the
 * adversarial review pass; do not report a pass here as "the plan is good".
 *
 * @param {string} content - Markdown content
 * @param {string} [grade] - 'deep' adds GRADE_REQUIRED_SECTIONS; anything else
 *   (including undefined) checks the REQUIRED_SECTIONS floor only.
 * @returns {{valid: boolean, missing: string[]}}
 */
function validatePlanStructure(content, grade) {
  const missing = [];
  const warnings = [];
  const required = REQUIRED_SECTIONS.concat(GRADE_REQUIRED_SECTIONS[grade] || []);
  const legacy = isPreCoverageDoc(content);
  for (const section of required) {
    const aliases = SECTION_ALIASES[section] || [section];
    const escaped = aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // Accept `##` and deeper (`###`, `####`): the /cp template nests some
    // required sections under a parent — `### 🔀 검토된 대안` lives under
    // `## 🛠 How` — so an h2-only check failed documents that followed the
    // skill exactly. Still anchored to a heading line (`^#{2,4}\s+`), so body
    // prose that merely mentions the word does not count as a section.
    const pattern = new RegExp(`^#{2,4}\\s+.*(?:${escaped})`, 'im');
    if (!pattern.test(content)) {
      // `Inventory` landed in v3.32, after these documents were written. Hard
      // -failing them would make the /cc entry gate refuse to execute plans that
      // are mid-flight — the section cannot be back-filled by their authors
      // because the research that would populate it is long over. Same call as
      // the v3.4 and v3.25 skeleton changes: advisory for legacy, hard for new.
      if (section === 'Inventory' && legacy) {
        warnings.push('Inventory (v3.32 이전 문서 — 커버리지 원장 없음, 실행은 허용)');
        continue;
      }
      missing.push(section);
    }
  }
  // Check for leftover template placeholders. Exclude shell/git syntax
  // (%{http_code}, ${VAR}, @{u}/@{upstream}/@{push}) which legitimately appears
  // in Verification methods and in branch-lifecycle plans.
  const hasPlaceholders = /(?<![%$@])\{[a-z_]+\}/i.test(content);
  if (hasPlaceholders) {
    missing.push('(contains unresolved {placeholder} variables)');
  }
  return { valid: missing.length === 0, missing, warnings };
}


// ── Prior-work discovery (v3.34) ─────────────────────────
//
// The reason /cp and /cc exist, in the owner's words, is to stop work that
// reviews only the conversation in front of it and proceeds carelessly. The
// audit found that intent was the thinnest thing in both skills: /cp gave it
// five bullets (Phase 0.1) and /cc gave it one (fan-out 전 인라인 정찰).
// Neither mentions docs/history/ even once — grep across /cc returns zero.
//
// Reading cannot be verified. Availability can. If the list of prior documents
// on the same subject is never put in front of the model, it does not know they
// exist to skip. This surfaces them; the model still has to open them.

// Words that overlap between unrelated documents and would match everything.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'plan', 'task', 'docs', 'lens',
  '작업', '계획', '문서', '수정', '추가', '개선', '정리', '구현', '적용', '변경',
]);

/** Tokens worth matching on: length >= 2, not a stopword, not a bare date. */
function keywordsOf(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Find previously written documents that overlap this task's subject.
 *
 * Scans docs/history/ and docs/tasks/ by filename only — opening every document
 * would cost more than a hook budget allows, and the slug already carries the
 * subject. Ranked by shared-keyword count, so a near-duplicate of an old task
 * sorts above a coincidental single-word hit.
 *
 * @param {string} projectRoot
 * @param {string} subject - slug, title, or task description
 * @param {{limit?: number, exclude?: string}} [opts] - exclude: path to skip (usually the doc just written)
 * @returns {Array<{file: string, dir: string, score: number, shared: string[]}>}
 */
function findRelatedDocs(projectRoot, subject, opts) {
  const { limit = 5, exclude = null } = opts || {};
  const want = new Set(keywordsOf(subject));
  if (want.size === 0) return [];

  const hits = [];
  for (const sub of ['history', 'tasks']) {
    const dir = path.join(projectRoot, DEFAULT_DOCS_DIR, sub);
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue; // repo may have neither folder — not an error
    }
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      if (exclude && path.resolve(full) === path.resolve(exclude)) continue;
      const shared = [...new Set(keywordsOf(f))].filter(w => want.has(w));
      // Forward slashes: the path is shown to the user as a clickable link, and
      // a Windows backslash form breaks that in every renderer we target.
      if (shared.length) hits.push({ file: [DEFAULT_DOCS_DIR, sub, f].join('/'), dir: sub, score: shared.length, shared });
    }
  }

  // Highest overlap first; history before tasks on a tie, because a finished
  // record of the same subject is the more useful thing to have missed.
  hits.sort((a, b) => b.score - a.score || (a.dir === 'history' ? -1 : 1));
  return hits.slice(0, limit);
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
  GRADE_REQUIRED_SECTIONS,
  REQUIRED_SECTIONS,

  // v3.32 coverage ledger
  validatePlanCoverage,
  findRelatedDocs,

  // v3.4+ Goal-first extractors (used by /cc handoff entry)
  extractGoal,
  extractPlanBTriggers,
};

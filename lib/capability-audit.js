/**
 * Lens - Capability Audit State (for /crv modernization audit)
 *
 * Tracks when the last /crv self-audit ran, scoped to the Lens repo so the
 * SessionStart staleness nudge only fires here (never nags other projects).
 * State: <repo>/.lens/capability-audit-state.json  { lastAuditAt, registryHash }
 *
 * Pure-local, NO network. Used by:
 *   - hooks/session-start.js  → formatAuditNudge() (read-only nudge)
 *   - skills/crv/SKILL.md     → `node lib/capability-audit.js stamp` (on audit done)
 *
 * Fail-soft: every public fn swallows errors and returns a safe default so a
 * hook can never break a session.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeEnsureDir, safeReadJson, safeWriteJson } = require('./hook-utils');

const REGISTRY_REL = path.join('docs', 'rules', 'capability-assumptions.json');
const STATE_REL = path.join('.lens', 'capability-audit-state.json');
const PLUGIN_MANIFEST_REL = path.join('.claude-plugin', 'plugin.json');
const DEFAULT_INTERVAL_DAYS = 30;

function getProjectRoot(projectDir) {
  return projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function getRegistryPath(root) {
  return path.join(root, REGISTRY_REL);
}

function getStatePath(root) {
  return path.join(root, STATE_REL);
}

/**
 * Is `root` the Lens source repo? Requires BOTH the capability registry AND a
 * plugin manifest named "lens" — avoids false positives in unrelated repos and
 * sub-directories that merely happen to hold a same-named file.
 */
function isLensRepo(root) {
  try {
    if (!fs.existsSync(getRegistryPath(root))) return false;
    const manifest = safeReadJson(path.join(root, PLUGIN_MANIFEST_REL), null);
    return !!(manifest && manifest.name === 'lens');
  } catch {
    return false;
  }
}

/** sha256 (first 12) of the registry file content, or null if unreadable. */
function computeRegistryHash(root) {
  try {
    const buf = fs.readFileSync(getRegistryPath(root));
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

function readAuditState(root) {
  return safeReadJson(getStatePath(root), null);
}

/** Record an audit run. Called by /crv at the end via the `stamp` CLI. */
function stamp(root, nowIso) {
  try {
    const statePath = getStatePath(root);
    safeEnsureDir(path.dirname(statePath));
    const state = {
      lastAuditAt: nowIso || new Date().toISOString(),
      registryHash: computeRegistryHash(root),
    };
    safeWriteJson(statePath, state, { atomic: true });
    return state;
  } catch {
    return null;
  }
}

function _daysSince(iso, now) {
  try {
    const then = new Date(iso).getTime();
    if (!then || Number.isNaN(then)) return null;
    return Math.floor((now.getTime() - then) / 86400000);
  } catch {
    return null;
  }
}

/**
 * One-line muted staleness nudge string, or null if not due / not the Lens repo
 * / nudge disabled. NO network. Fires when: never audited, registry changed
 * since last audit, or interval days elapsed.
 *
 * @param {object} opts { root, config, now }
 */
function formatAuditNudge({ root, config, now } = {}) {
  try {
    root = getProjectRoot(root);
    if (!isLensRepo(root)) return null;
    const cfg = config || {};
    if (cfg.capabilityAuditNudge === false) return null;

    const intervalDays = Number(cfg.capabilityAuditIntervalDays) > 0
      ? Number(cfg.capabilityAuditIntervalDays)
      : DEFAULT_INTERVAL_DAYS;
    const nowD = now || new Date();
    const state = readAuditState(root);

    if (!state || !state.lastAuditAt) {
      return '🩺 Lens 자가 현대화 감사를 아직 실행한 적 없음 — `/crv` 로 첫 감사 권장.';
    }

    const currentHash = computeRegistryHash(root);
    if (currentHash && state.registryHash && currentHash !== state.registryHash) {
      return '🩺 Lens 기능 레지스트리가 마지막 감사 이후 변경됨 — `/crv` 재감사 권장.';
    }

    const days = _daysSince(state.lastAuditAt, nowD);
    if (days != null && days >= intervalDays) {
      return `🩺 마지막 Lens 자가 감사 후 ${days}일 경과 (기준 ${intervalDays}일) — \`/crv\` 재감사 권장.`;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  getProjectRoot,
  getRegistryPath,
  getStatePath,
  isLensRepo,
  computeRegistryHash,
  readAuditState,
  stamp,
  formatAuditNudge,
  DEFAULT_INTERVAL_DAYS,
};

// CLI: `node lib/capability-audit.js stamp [projectRoot]`
if (require.main === module) {
  const cmd = process.argv[2];
  const root = getProjectRoot(process.argv[3]);
  if (cmd === 'stamp') {
    const s = stamp(root);
    console.log(s ? `[lens] capability audit stamped: ${s.lastAuditAt} (registry ${s.registryHash})` : '[lens] stamp failed');
    process.exit(s ? 0 : 1);
  } else if (cmd === 'nudge') {
    const cfgPath = path.join(root, 'lens.config.json');
    const config = safeReadJson(cfgPath, {});
    const n = formatAuditNudge({ root, config });
    console.log(n || '(no nudge due)');
    process.exit(0);
  } else {
    console.log('usage: node lib/capability-audit.js stamp|nudge [projectRoot]');
    process.exit(1);
  }
}

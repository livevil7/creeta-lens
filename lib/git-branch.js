/**
 * Lens - Git Branch Judgment Module
 * Single source of truth for branch decisions: what the base branch is,
 * whether committing here is allowed, and whether a branch is merged.
 *
 * Read-only by design: every git call is a query (rev-parse, for-each-ref,
 * symbolic-ref, merge-base, cherry, status, rev-list). This module never
 * checks out, commits, pushes, fetches, or creates/deletes branches.
 *
 * Why this exists: the old `/cc` auto-commit guard compared the branch name
 * against the literal strings main|master, so a repo whose working branch is
 * `staging` (Returns_ERP_v20 — where a staging commit IS a deploy) fell
 * through the guard. Base is therefore always *resolved* (config → upstream →
 * origin/HEAD), never guessed from a name.
 *
 * Config: reads `<PLUGIN_ROOT>/lens.config.json` where PLUGIN_ROOT is the
 * parent directory of this lib/ folder (path.resolve(__dirname, '..')) —
 * i.e. the copy that ships next to the executing code, same convention as
 * hooks/session-start.js. It does NOT probe any other install location, so
 * the answer is deterministic per code copy. Missing file → empty config.
 *
 * Cross-platform: Windows (Git Bash) + macOS. No shell interpolation —
 * git is invoked via execFileSync with an argument array.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { safeReadJson } = require('./hook-utils');

// ── Constants ────────────────────────────────────────────

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PLUGIN_ROOT, 'lens.config.json');

// Fallback until lens.config.json grows a `branchPrefixes` key.
const DEFAULT_BRANCH_PREFIXES = ['feat', 'fix', 'ops', 'docs'];

// YYYY-MM-DD or YYYYMMDD anywhere in a slug — dates belong to commits, not
// branch names.
const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})|(\d{8})/;

// ── Git Runners (read-only) ──────────────────────────────

/**
 * Run a read-only git command and return trimmed stdout, or null on any
 * failure. Failures are absorbed — this library reports judgments, it does
 * not throw on repo state.
 * @param {string} repoPath
 * @param {string[]} args
 * @returns {string|null}
 */
function git(repoPath, args) {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Run a git command for its exit code only (e.g. merge-base --is-ancestor,
 * rev-parse --verify). 0 = yes, 1 = no, -1 = execution failure.
 * @param {string} repoPath
 * @param {string[]} args
 * @returns {number}
 */
function gitExitCode(repoPath, args) {
  try {
    execFileSync('git', ['-C', repoPath, ...args], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    return 0;
  } catch (err) {
    return typeof err.status === 'number' ? err.status : -1;
  }
}

// ── Config ───────────────────────────────────────────────

/**
 * Read lens.config.json (repo copy next to this code — see module header).
 * @returns {object}
 */
function readConfig() {
  return safeReadJson(CONFIG_PATH, {}) || {};
}

/**
 * Allowed work-branch prefixes. Config `branchPrefixes` overrides the default.
 * @returns {string[]}
 */
function getBranchPrefixes() {
  const config = readConfig();
  return Array.isArray(config.branchPrefixes) && config.branchPrefixes.length > 0
    ? config.branchPrefixes
    : DEFAULT_BRANCH_PREFIXES;
}

// ── Base Branch Resolution ───────────────────────────────

/**
 * Resolve the base (integration) branch of a repo.
 *
 * Priority:
 *   1. lens.config.json `baseBranch[<repo directory name>]` explicit value
 *   2. Upstream of the current branch (for-each-ref %(upstream:short),
 *      remote prefix stripped) — a checked-out `staging` tracking
 *      origin/staging resolves to `staging`
 *   3. origin/HEAD (symbolic-ref refs/remotes/origin/HEAD)
 *
 * NEVER guesses main|master from branch names — a wrong guess on a repo
 * like Returns_ERP_v20 (base=staging, commits deploy) is a deploy incident.
 * When nothing resolves, returns base=null and the caller must fail closed.
 *
 * @param {string} repoPath
 * @returns {{base: string|null, source: 'config'|'upstream'|'origin-head'|null, reason: string}}
 */
function resolveBase(repoPath) {
  const abs = path.resolve(repoPath);
  if (!fs.existsSync(path.join(abs, '.git'))) {
    return { base: null, source: null, reason: `git 레포 아님 (${abs})` };
  }

  // ① explicit config
  const repoName = path.basename(abs);
  const config = readConfig();
  const configured = config.baseBranch && config.baseBranch[repoName];
  if (configured) {
    return { base: configured, source: 'config', reason: `lens.config.json baseBranch["${repoName}"] 명시값` };
  }

  // ② upstream of the current branch
  const current = git(abs, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current && current !== 'HEAD') {
    const upstream = git(abs, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${current}`]);
    if (upstream) {
      const stripped = upstream.split('/').slice(1).join('/');
      if (stripped) {
        return { base: stripped, source: 'upstream', reason: `현재 브랜치(${current})의 upstream ${upstream}` };
      }
    }
  }

  // ③ origin/HEAD
  const originHead = git(abs, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
  if (originHead) {
    const stripped = originHead.replace(/^refs\/remotes\/origin\//, '');
    if (stripped) {
      return { base: stripped, source: 'origin-head', reason: `origin/HEAD → ${stripped}` };
    }
  }

  return {
    base: null,
    source: null,
    reason: 'config 명시 없음 + 현재 브랜치 upstream 없음 + origin/HEAD 미설정 — base 판정 불가 (main/master 추정 금지)',
  };
}

// ── Commit Permission ────────────────────────────────────

/**
 * Judge whether committing on the currently checked-out branch is allowed.
 *
 * Rules — order matters and is contractual:
 *   0. current branch unreadable (detached HEAD 등) → false
 *   1. planBranch given AND current === planBranch → true IMMEDIATELY,
 *      regardless of base. The plan document naming this branch is the
 *      top-priority evidence. (Why base must NOT gate this: a pushed task
 *      branch tracks origin/<itself>, so resolveBase reports base=itself —
 *      a base===current check here would reject every commit after the
 *      first push.)
 *   2. planBranch given AND current !== planBranch → false (사유에 어느
 *      브랜치여야 하는지 명시)
 *   3. planBranch absent (null/undefined) → true only when current has an
 *      allowed branchPrefixes prefix AND current !== base. base
 *      unresolvable → false (모르는 상태에서 커밋 허용 금지).
 *      "current === base → 항상 false" 는 이 규칙 3 에서만 적용된다.
 *
 * Returns_ERP_v20 protection holds: staging 이 체크아웃된 채 planBranch
 * 'feat/...' 가 오면 규칙 2 에서 false, planBranch 없이 오면 규칙 3 의
 * current===base 에서 false.
 *
 * @param {string} repoPath
 * @param {string|null|undefined} planBranch - Branch the plan declared, if any
 * @returns {{allowed: boolean, current: string|null, base: string|null, reason: string}}
 */
function canCommitTo(repoPath, planBranch) {
  const current = git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!current || current === 'HEAD') {
    return { allowed: false, current: current || null, base: null, reason: 'detached HEAD 또는 git 조회 실패 — 커밋 대상 브랜치를 알 수 없음' };
  }

  const resolved = resolveBase(repoPath);
  const base = resolved.base;

  // 규칙 1·2 — 계획 브랜치 명시가 최상위 근거. base 판정 결과와 무관.
  if (planBranch != null) {
    return current === planBranch
      ? { allowed: true, current, base, reason: `현재 브랜치가 계획 브랜치(${planBranch})와 일치 — 계획 명시가 최상위 근거` }
      : { allowed: false, current, base, reason: `현재 브랜치(${current})가 계획 브랜치(${planBranch})와 다름 — ${planBranch} 체크아웃 필요` };
  }

  // 규칙 3 — planBranch 없을 때만 base 게이트 적용
  if (base === null) {
    return { allowed: false, current, base: null, reason: `base 판정 불가 — ${resolved.reason}. 모르는 상태에서 커밋 허용 금지` };
  }
  if (current === base) {
    return { allowed: false, current, base, reason: `현재 브랜치(${current})가 base 브랜치 — base 직접 커밋 금지 (staging 류 배포 브랜치 보호)` };
  }
  const prefixes = getBranchPrefixes();
  const hasPrefix = prefixes.some(p => current.startsWith(`${p}/`));
  return hasPrefix
    ? { allowed: true, current, base, reason: `작업 브랜치(${current}) — 허용 접두사(${prefixes.join('|')}) + base 아님` }
    : { allowed: false, current, base, reason: `브랜치(${current})에 허용 접두사(${prefixes.join('|')}) 없음` };
}

// ── Merged State ─────────────────────────────────────────

/**
 * Judge whether origin/<branch> has been merged into origin/<base>.
 *
 * Order:
 *   1. origin/<branch> missing → 'unpushed'
 *   2. origin/<branch> is ancestor of origin/<base> → 'merged'
 *   3. no common ancestor (merge-base fails) → 'unknown' (계보가 다르면
 *      ahead 커밋 수는 병합 근거가 못 된다 — 수백이어도 의미 없음)
 *   4. git cherry origin/<base> origin/<branch> has no '+' lines →
 *      'patch-merged' (rebase/squash 병합은 커밋을 새로 쓰므로 조상 관계로는
 *      영원히 미병합으로 보인다 — patch-id 검사가 이를 잡는다)
 *   5. '+' lines present → 'unmerged', unmergedPatches = 개수
 *
 * @param {string} repoPath
 * @param {string} branch - Branch name (without origin/ prefix)
 * @param {string} base - Base branch name (without origin/ prefix)
 * @returns {{state: 'unpushed'|'merged'|'patch-merged'|'unmerged'|'unknown', unmergedPatches: number|null, reason: string}}
 */
function mergedState(repoPath, branch, base) {
  if (!branch || !base) {
    return { state: 'unknown', unmergedPatches: null, reason: 'branch/base 미지정' };
  }

  if (gitExitCode(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]) !== 0) {
    return { state: 'unpushed', unmergedPatches: null, reason: `origin/${branch} 없음 — 원격에 push 되지 않음` };
  }
  if (gitExitCode(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]) !== 0) {
    return { state: 'unknown', unmergedPatches: null, reason: `origin/${base} 없음 — 비교 기준 부재` };
  }

  if (gitExitCode(repoPath, ['merge-base', '--is-ancestor', `origin/${branch}`, `origin/${base}`]) === 0) {
    return { state: 'merged', unmergedPatches: 0, reason: `origin/${branch} 가 origin/${base} 의 조상 — 병합됨` };
  }

  if (git(repoPath, ['merge-base', `origin/${base}`, `origin/${branch}`]) === null) {
    return { state: 'unknown', unmergedPatches: null, reason: '공통 조상 없음(계보 다름) — 병합 여부 판정 불가' };
  }

  const cherry = git(repoPath, ['cherry', `origin/${base}`, `origin/${branch}`]);
  if (cherry === null) {
    return { state: 'unknown', unmergedPatches: null, reason: 'git cherry 실패' };
  }
  const unmerged = cherry.split('\n').filter(line => line.startsWith('+')).length;
  if (unmerged === 0) {
    return { state: 'patch-merged', unmergedPatches: 0, reason: 'rebase/squash 병합 — 모든 patch-id 가 base 에 존재' };
  }
  return { state: 'unmerged', unmergedPatches: unmerged, reason: `base 에 없는 패치 ${unmerged}개` };
}

// ── Branch Naming ────────────────────────────────────────

/**
 * Build a work branch name `${prefix}/${slug}`.
 * Throws when prefix is not an allowed branchPrefix, or slug contains a date
 * pattern (YYYYMMDD / YYYY-MM-DD) — dates belong to commits, not branches.
 *
 * @param {string} prefix
 * @param {string} slug
 * @returns {string}
 */
function branchName(prefix, slug) {
  const prefixes = getBranchPrefixes();
  if (!prefixes.includes(prefix)) {
    throw new Error(`허용되지 않은 브랜치 접두사: "${prefix}" (허용: ${prefixes.join(', ')})`);
  }
  if (!slug || !String(slug).trim()) {
    throw new Error('slug 가 비어 있음');
  }
  if (DATE_PATTERN.test(slug)) {
    throw new Error(`slug 에 날짜 패턴 금지: "${slug}" — 날짜는 커밋이 이미 갖고 있다`);
  }
  return `${prefix}/${slug}`;
}

// ── Preflight ────────────────────────────────────────────

/**
 * Pre-work repo health check (read-only — no fetch; diverged is judged
 * against the last-fetched remote state).
 *
 * ok = !diverged && base !== null. dirty does NOT block ok — it is recorded
 * in issues for the caller to surface.
 *
 * @param {string} repoPath
 * @returns {{ok: boolean, dirty: boolean, diverged: boolean, base: string|null, issues: string[]}}
 */
function preflight(repoPath) {
  const issues = [];

  const status = git(repoPath, ['status', '--porcelain']);
  const dirty = status !== null && status.length > 0;
  if (status === null) issues.push('git status 실패 — 레포 상태 확인 불가');
  if (dirty) issues.push('working tree dirty — 커밋되지 않은 변경 있음');

  const resolved = resolveBase(repoPath);
  if (resolved.base === null) issues.push(`base 판정 불가: ${resolved.reason}`);

  // upstream 없으면 rev-list 가 실패 → diverged=false (갈라질 대상이 없음)
  let diverged = false;
  const counts = git(repoPath, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
  if (counts !== null) {
    const [behind, ahead] = counts.split(/\s+/).map(Number);
    diverged = behind > 0 && ahead > 0;
    if (diverged) issues.push(`upstream 과 양방향 분기 (behind=${behind}, ahead=${ahead}) — 수동 해결 필요`);
  }

  return {
    ok: !diverged && resolved.base !== null,
    dirty,
    diverged,
    base: resolved.base,
    issues,
  };
}

// ── Module Exports ───────────────────────────────────────

module.exports = { resolveBase, canCommitTo, mergedState, branchName, preflight };

/**
 * Lens - Git Branch Judgment Module
 * Single source of truth for branch decisions: what the base branch is,
 * whether committing here is allowed, and whether a branch is merged.
 *
 * Read-only by design: every git call is a query (rev-parse, for-each-ref,
 * symbolic-ref, merge-base, cherry, status, rev-list, config --get,
 * merge-tree --write-tree — 병합 시뮬레이션, ref/index/워크트리 불변). This
 * module never checks out, commits, pushes, or creates/deletes branches. 단
 * 하나의 예외: mergedState 에 `{fetch: true}` 를 명시적으로 넘긴 호출자에
 * 한해 판정 직전 `git fetch --prune origin` 을 수행한다 (opt-in — 낡은
 * tracking ref 로 "머지됨" 오판 후 현재 원격 tip 을 지우는 사고 방지.
 * --prune 은 branch-lifecycle 규정 흐름(skills/cp Phase 1.5 — 삭제된 원격
 * 브랜치까지 반영하는 fetch)과 일치시키기 위한 것. fetch 실패는 조용히
 * 넘기지 않고 판정 불가로 떨어진다).
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

/**
 * Is this branch name shaped like a task/work branch — i.e. something that can
 * never be an integration base? True for `<branchPrefix>/...` (기본
 * feat/fix/ops/docs) and `sync/...` (/cs throwaway).
 *
 * 왜 이름 검사인가: pushed task 브랜치는 origin/<자기자신> 을 tracking 하므로
 * upstream 경로가 task 브랜치 자신을 base 후보로 내놓는다. 반면 staging 이
 * origin/staging 을 tracking 하는 것(Returns_ERP_v20)은 똑같은 self-tracking
 * 이지만 base 가 맞다 — self 여부로는 둘을 구분할 수 없고, task 명명 규칙
 * (접두사) 만이 구분자다.
 *
 * @param {string} name - Branch name (remote prefix stripped)
 * @returns {boolean}
 */
function isTaskShapedBranch(name) {
  const prefixes = getBranchPrefixes();
  return prefixes.some(p => name.startsWith(`${p}/`)) || name.startsWith('sync/');
}

// ── Base Branch Resolution ───────────────────────────────

/**
 * Resolve the base (integration) branch of a repo.
 *
 * Priority:
 *   1. lens.config.json `baseBranch[<repo directory name>]` explicit value
 *   2. Upstream of the current branch (for-each-ref %(upstream:short),
 *      remote prefix stripped) — a checked-out `staging` tracking
 *      origin/staging resolves to `staging`. BUT a task-shaped upstream
 *      (branchPrefixes/`sync/` — pushed task 브랜치는 origin/<자기자신> 을
 *      tracking) is never a base → rejected, fall through to 3. The
 *      rejection is recorded in `reason` (조용한 폴백 금지).
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

  // ② upstream of the current branch — task 형태(branchPrefixes/sync/)의
  //    upstream 은 base 로 채택하지 않고 ③으로 폴백 (pushed task 브랜치가
  //    자기 자신을 base 로 보고하는 P1 결함 방지)
  let rejectedUpstream = null;
  const current = git(abs, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current && current !== 'HEAD') {
    const upstream = git(abs, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${current}`]);
    if (upstream) {
      const stripped = upstream.split('/').slice(1).join('/');
      if (stripped) {
        if (isTaskShapedBranch(stripped)) {
          rejectedUpstream = upstream;
        } else {
          return { base: stripped, source: 'upstream', reason: `현재 브랜치(${current})의 upstream ${upstream}` };
        }
      }
    }
  }

  // ③ origin/HEAD
  const originHead = git(abs, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
  if (originHead) {
    const stripped = originHead.replace(/^refs\/remotes\/origin\//, '');
    if (stripped) {
      const fallbackNote = rejectedUpstream
        ? `upstream ${rejectedUpstream} 는 task 브랜치라 base 로 채택 안 함 → origin/HEAD 폴백 — `
        : '';
      return { base: stripped, source: 'origin-head', reason: `${fallbackNote}origin/HEAD → ${stripped}` };
    }
  }

  return {
    base: null,
    source: null,
    reason: rejectedUpstream
      ? `config 명시 없음 + upstream ${rejectedUpstream} 는 task 브랜치라 배제 + origin/HEAD 미설정 — base 판정 불가 (main/master 추정 금지)`
      : 'config 명시 없음 + 현재 브랜치 upstream 없음 + origin/HEAD 미설정 — base 판정 불가 (main/master 추정 금지)',
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
 *      top-priority evidence. (Why base must NOT gate this: base 판정이
 *      어떤 이유로든 current 와 같게 나오거나 실패해도, 계획이 이 브랜치를
 *      지명했다는 사실이 우선한다. resolveBase 는 이제 task 형태 upstream
 *      을 base 로 채택하지 않지만, 이 규칙은 그와 독립적으로 유지된다.)
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
 * origin/<branch> 가 없을 때의 2차 판정 (mergedState 내부 전용).
 *
 * "한 번도 push 안 됨"과 "머지 후 원격 브랜치 삭제됨"을 구분한다. 머지
 * 직후 소스 브랜치 삭제는 branch-lifecycle.md §1 이 규정한 정상 흐름이므로
 * (GitHub auto-delete 포함), fetch --prune 뒤 origin/<branch> 부재는
 * 'unpushed' 의 증거가 못 된다. 로컬 refs/heads/<branch> 가 남아 있으면 그
 * tip 의 내용이 origin/<base> 에 들어갔는지를 조상 검사 → merge-tree 병합
 * 시뮬레이션으로 **로컬 ref 기준** 증명할 수 있다.
 *
 * 증명 성공 → 'merged-deleted'. 증명 실패는 절대 merged 계열이 되지
 * 않는다 — 거짓 "머지됨"이 이 모듈의 최악 실패다(판정 결과로 브랜치가
 * 삭제된다). 로컬 ref 도 없으면 내용 증명이 원천 불가능하므로, 호출자가
 * PR 병합 사실을 명시적으로 주입한 경우(opts.prMerged === true)에만
 * 'merged-deleted' 로 판정한다 — 이때는 지울 ref 자체가 없어 오판이 ref
 * 삭제로 이어질 수 없고, 주입값의 진위 책임은 gh 로 조회한 호출자에 있다.
 *
 * upstream 설정(branch.<branch>.merge)은 fetch --prune 후에도 남는 "과거
 * push 흔적"이다 — 있으면 reason 에 활용하고, 없다고 해서 미푸시를
 * 단정하는 근거로는 쓰지 않는다 (plain push 는 흔적을 남기지 않는다).
 *
 * @param {string} repoPath
 * @param {string} branch
 * @param {string} base
 * @param {{prMerged?: boolean}} [opts]
 * @returns {{state: 'unpushed'|'merged-deleted'|'unknown', unmergedPatches: number|null, branchSha: null, baseSha: string|null, localSha: string|null, reason: string}}
 */
function judgeRemoteMissing(repoPath, branch, base, opts) {
  const localSha = git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);

  if (localSha === null || localSha === '') {
    if (opts && opts.prMerged === true) {
      return { state: 'merged-deleted', unmergedPatches: 0, branchSha: null, baseSha: null, localSha: null, reason: `origin/${branch}·refs/heads/${branch} 모두 부재 + 호출자 제공 PR 병합 상태(prMerged) — 머지 후 로컬·원격 정리까지 끝난 브랜치로 판정 (지울 ref 없음)` };
    }
    return { state: 'unpushed', unmergedPatches: null, branchSha: null, baseSha: null, localSha: null, reason: `origin/${branch} 없음 — 원격에 push 되지 않음 (로컬 refs/heads/${branch} 도 없음)` };
  }

  const baseSha = git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]);
  if (baseSha === null || baseSha === '') {
    return { state: 'unknown', unmergedPatches: null, branchSha: null, baseSha: null, localSha, reason: `origin/${branch} 없음 + origin/${base} 도 없음 — 비교 기준 부재, 판정 불가` };
  }

  // 내용 증명 ① — 로컬 tip 이 base 의 조상이면 그대로 병합됨 (일반 머지 후 원격 삭제)
  if (gitExitCode(repoPath, ['merge-base', '--is-ancestor', localSha, `origin/${base}`]) === 0) {
    return { state: 'merged-deleted', unmergedPatches: 0, branchSha: null, baseSha, localSha, reason: `origin/${branch} 는 삭제됐지만 로컬 tip(refs/heads/${branch})이 origin/${base} 의 조상 — 머지 후 원격 브랜치가 삭제된 정상 흐름 (branch-lifecycle §1)` };
  }

  if (git(repoPath, ['merge-base', `origin/${base}`, localSha]) === null) {
    return { state: 'unknown', unmergedPatches: null, branchSha: null, baseSha, localSha, reason: `origin/${branch} 없음 + 로컬 tip 과 origin/${base} 의 공통 조상 없음(계보 다름) — 병합 여부 판정 불가, 사람 확인 필요` };
  }

  // 내용 증명 ② — squash/rebase 머지 대응: 병합 시뮬레이션 tree == base tree
  // (merge-ort, 읽기 전용 — ref/index/워크트리 불변. mergedState 본판정과 동일 원리)
  const mergedTree = git(repoPath, ['merge-tree', '--write-tree', `origin/${base}`, localSha]);
  const baseTree = git(repoPath, ['rev-parse', `origin/${base}^{tree}`]);
  if (mergedTree !== null && baseTree !== null && mergedTree === baseTree) {
    return { state: 'merged-deleted', unmergedPatches: 0, branchSha: null, baseSha, localSha, reason: `origin/${branch} 는 삭제됐지만 로컬 tip(refs/heads/${branch}) 기준 병합 시뮬레이션(merge-tree) 결과가 origin/${base} tree 와 동일 — squash/rebase 머지 후 원격 브랜치가 삭제된 정상 흐름, 내용 전부 base 에 반영됨` };
  }

  // 여기부터는 병합 증명 실패 — merged 계열 단정 금지.
  const upstreamTrace = git(repoPath, ['config', '--get', `branch.${branch}.merge`]);
  if (mergedTree === null || baseTree === null) {
    // merge-tree 실패(충돌·구버전 git<2.38) — 내용이 base 에 있는지 없는지조차 증명 불가
    if (upstreamTrace) {
      return { state: 'unknown', unmergedPatches: null, branchSha: null, baseSha, localSha, reason: `origin/${branch} 없음 + merge-tree 검사 실패(충돌·구버전 git)로 로컬 tip 내용 증명 불가 + upstream 설정(branch.${branch}.merge) 흔적 — 과거 push 후 원격에서 삭제된 브랜치일 수 있어 병합 단정도 미푸시 단정도 금지, 사람 확인 필요` };
    }
    return { state: 'unpushed', unmergedPatches: null, branchSha: null, baseSha: null, localSha, reason: `origin/${branch} 없음 — 원격에 push 되지 않음 (로컬 tip 내용의 base 반영 여부는 merge-tree 실패로 증명 불가 — 병합 단정 금지)` };
  }
  const traceNote = upstreamTrace ? ` upstream 설정(branch.${branch}.merge) 흔적 있음 — 과거 push 됐다가 병합 없이 원격에서 삭제됐을 수 있음, push 전 사람 확인 권장.` : '';
  return { state: 'unpushed', unmergedPatches: null, branchSha: null, baseSha: null, localSha, reason: `origin/${branch} 없음 — 원격에 push 되지 않음. 로컬 tip 에 origin/${base} 미반영 내용 있음(merge-tree 상이).${traceNote}` };
}

/**
 * Judge whether origin/<branch> has been merged into origin/<base>.
 *
 * Order:
 *   0. opts.fetch === true → 판정 직전 `git fetch --prune origin`. 실패 시
 *      즉시 'unknown' ("원격 상태 확인 불가 — 삭제 보류") — 낡은 tracking
 *      ref 로 "머지됨" 판정 후 현재 원격 tip 을 지우는 사고 방지. 기본값
 *      false (기존 호출자 무변경, 모듈은 읽기 전용 유지).
 *   1. origin/<branch> missing → 곧바로 'unpushed' 가 아니라 2차 판정
 *      (judgeRemoteMissing). 머지 후 원격 브랜치 삭제는 branch-lifecycle §1
 *      이 규정한 정상 흐름이라, 원격 ref 부재만으로 "한 번도 push 안 됨"
 *      을 단정하면 /cp done 이 이미 끝난 작업에 push+PR 재생성을 제안한다:
 *      a. 로컬 refs/heads/<branch> 가 남아 있고 그 tip 이 origin/<base> 의
 *         조상이거나 병합 시뮬레이션(merge-tree) tree 가 base tree 와 동일
 *         → 'merged-deleted' (내용 증명 — 로컬 ref 기준)
 *      b. 로컬 ref 도 없음 → 내용 증명 불가. 호출자가 PR 병합 사실을
 *         명시적으로 주입한 경우(opts.prMerged === true)에만
 *         'merged-deleted', 아니면 'unpushed' (기존 동작 유지)
 *      c. 로컬 tip 에 base 미반영 내용이 확인되면 'unpushed' (upstream 설정
 *         흔적이 있으면 "병합 없이 원격에서 삭제됐을 수 있음" 경고 포함),
 *         증명 수단 실패(merge-tree 불가·계보 다름)는 병합도 미푸시도
 *         단정하지 않는다 — 거짓 "머지됨" 금지가 최우선 계약
 *   2. origin/<branch> is ancestor of origin/<base> → 'merged'
 *   3. no common ancestor (merge-base fails) → 'unknown' (계보가 다르면
 *      ahead 커밋 수는 병합 근거가 못 된다 — 수백이어도 의미 없음)
 *   4. git cherry origin/<base> origin/<branch> 의 '+' 행 수(patch-id 상
 *      미병합)와, 병합 시뮬레이션(git merge-tree --write-tree, merge-ort·
 *      읽기 전용 — ref/워크트리 불변) 결과 tree 를 함께 본다. cherry 는
 *      머지 커밋을 아예 열거하지 않으므로 '+' 0개는 병합의 증거가 못 된다
 *      — 머지 커밋으로만 들어온 변경(충돌 해결분·evil merge)은 '+' 없이도
 *      base 에 없는 내용을 갖는다. 판정:
 *      a. 시뮬레이션 tree == origin/<base> tree → 'patch-merged' (브랜치가
 *         base 에 더할 내용이 없음 — rebase/squash/다중 커밋 squash 병합
 *         전부 이 내용 증명으로 잡는다)
 *      b. '+' 0개 + tree 다름 → 'unmerged' (머지 커밋에만 존재하는 변경 —
 *         삭제하면 그 변경을 담은 유일한 ref 가 사라진다)
 *      c. '+' 0개 + merge-tree 실패(충돌·구버전 git<2.38) → 'unknown' —
 *         내용 증명이 불가능하면 병합을 단정하지 않는다 (거짓 "머지됨" 이
 *         이 함수의 최악 실패 — 판정 결과로 브랜치가 삭제된다)
 *   5. 그 외 → 'unmerged', unmergedPatches = 개수 ('+' > 0 + merge-tree
 *      실패도 여기 — 병합 단정 금지 폴백 유지)
 *
 * SHA lease: 판정에 실제로 사용한 origin/<branch> tip(`branchSha`)과
 * origin/<base> tip(`baseSha`)을 반환한다. 삭제 실행측은 판정 SHA 가 현재
 * 원격 tip 과 일치할 때만 지워야 하며, SHA 부재(null)면 삭제 금지.
 * 'merged-deleted' 는 원격에 지울 ref 가 없으므로 branchSha 는 항상 null
 * 이고, 대신 판정에 쓴 로컬 tip 을 `localSha` 로 반환한다 — 로컬 브랜치를
 * 지우는 쪽은 refs/heads/<branch> 가 여전히 localSha 일 때만 지워야 한다.
 *
 * @param {string} repoPath
 * @param {string} branch - Branch name (without origin/ prefix)
 * @param {string} base - Base branch name (without origin/ prefix)
 * @param {{fetch?: boolean, prMerged?: boolean}} [opts] - fetch: true 면 판정
 *   직전 git fetch --prune origin (opt-in). prMerged: true 는 호출자가 이
 *   브랜치의 PR 이 병합됐음을 외부 증거(계획 문서의 pr 번호 → gh 조회)로
 *   확인했다는 주입값 — 로컬·원격 ref 가 모두 없어 내용 증명이 불가능할
 *   때만 참조한다 (ref 가 하나라도 있으면 내용 증거가 호출자 주장보다
 *   우선한다. 이때는 지울 ref 자체가 없어 오판이 ref 삭제로 이어질 수 없다)
 * @returns {{state: 'unpushed'|'merged'|'patch-merged'|'merged-deleted'|'unmerged'|'unknown', unmergedPatches: number|null, branchSha: string|null, baseSha: string|null, localSha?: string|null, reason: string}}
 */
function mergedState(repoPath, branch, base, opts) {
  if (!branch || !base) {
    return { state: 'unknown', unmergedPatches: null, branchSha: null, baseSha: null, reason: 'branch/base 미지정' };
  }

  if (opts && opts.fetch === true) {
    if (gitExitCode(repoPath, ['fetch', '--quiet', '--prune', 'origin']) !== 0) {
      return { state: 'unknown', unmergedPatches: null, branchSha: null, baseSha: null, reason: 'git fetch --prune origin 실패 — 원격 상태 확인 불가, 삭제 보류' };
    }
  }

  const branchSha = git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
  if (branchSha === null || branchSha === '') {
    return judgeRemoteMissing(repoPath, branch, base, opts);
  }
  const baseSha = git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]);
  if (baseSha === null || baseSha === '') {
    return { state: 'unknown', unmergedPatches: null, branchSha, baseSha: null, reason: `origin/${base} 없음 — 비교 기준 부재` };
  }

  if (gitExitCode(repoPath, ['merge-base', '--is-ancestor', `origin/${branch}`, `origin/${base}`]) === 0) {
    return { state: 'merged', unmergedPatches: 0, branchSha, baseSha, reason: `origin/${branch} 가 origin/${base} 의 조상 — 병합됨` };
  }

  if (git(repoPath, ['merge-base', `origin/${base}`, `origin/${branch}`]) === null) {
    return { state: 'unknown', unmergedPatches: null, branchSha, baseSha, reason: '공통 조상 없음(계보 다름) — 병합 여부 판정 불가' };
  }

  const cherry = git(repoPath, ['cherry', `origin/${base}`, `origin/${branch}`]);
  if (cherry === null) {
    return { state: 'unknown', unmergedPatches: null, branchSha, baseSha, reason: 'git cherry 실패' };
  }
  const unmerged = cherry.split('\n').filter(line => line.startsWith('+')).length;

  // 내용(tree) 수준 검사 — patch-id(cherry)만으로는 양방향 모두 못 잡는다:
  //   · unmerged === 0 이어도 병합 단정 금지. git cherry 는 머지 커밋을
  //     열거하지 않으므로 머지 커밋으로만 들어온 변경(충돌 해결분·evil
  //     merge)은 '+' 0개로 보인다. 그대로 patch-merged 를 반환하면 그
  //     변경을 담은 유일한 ref 가 삭제된다.
  //   · unmerged > 0 이어도 미병합 단정 금지. 다중 커밋 squash 병합은
  //     원본 커밋들의 patch-id 가 합쳐진 단일 커밋과 다르다.
  // merge-tree 병합 시뮬레이션 결과가 base tree 와 같으면 브랜치가 base
  // 에 더할 내용이 없다 = 병합 완료의 내용 증명. 충돌(exit 1)·구버전
  // git(<2.38)·실패는 null → 병합 단정 금지.
  const mergedTree = git(repoPath, ['merge-tree', '--write-tree', `origin/${base}`, `origin/${branch}`]);
  const baseTree = git(repoPath, ['rev-parse', `origin/${base}^{tree}`]);
  const treeProvedMerged = mergedTree !== null && baseTree !== null && mergedTree === baseTree;

  if (treeProvedMerged) {
    return unmerged === 0
      ? { state: 'patch-merged', unmergedPatches: 0, branchSha, baseSha, reason: 'rebase/squash 병합 — 모든 patch-id 가 base 에 존재하고 병합 시뮬레이션(merge-tree) 결과도 base tree 와 동일' }
      : { state: 'patch-merged', unmergedPatches: 0, branchSha, baseSha, reason: `squash 병합 — patch-id 상 미병합 ${unmerged}개지만 병합 시뮬레이션(merge-tree) 결과가 base tree 와 동일, 브랜치 내용 전부 base 에 반영됨` };
  }

  if (unmerged === 0) {
    // patch-id 는 전부 base 에 있는데 내용 증명이 안 됐다. 거짓 "머지됨"
    // 을 만들지 않는 것이 이 함수의 최우선 계약 — 안전한 쪽으로 남긴다.
    if (mergedTree !== null && baseTree !== null) {
      return { state: 'unmerged', unmergedPatches: 0, branchSha, baseSha, reason: 'patch-id 상 미병합 0개지만 병합 시뮬레이션(merge-tree) 결과가 base tree 와 다름 — 머지 커밋으로만 들어온 변경(충돌 해결분 등)이 base 에 없음, 삭제 금지' };
    }
    return { state: 'unknown', unmergedPatches: null, branchSha, baseSha, reason: 'patch-id 상 미병합 0개지만 merge-tree 검사 실패(충돌·구버전 git 등) — 머지 커밋에만 존재하는 변경 가능성을 배제할 수 없어 병합 단정 금지' };
  }

  return { state: 'unmerged', unmergedPatches: unmerged, branchSha, baseSha, reason: `base 에 없는 패치 ${unmerged}개` };
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
 * ok = base 확정(원격 ref 실존 포함) && !diverged && 분기 판정 가능.
 * dirty does NOT block ok — it is recorded in issues for the caller to
 * surface.
 *
 * base 는 이름 판정(resolveBase)에 원격 ref 실존 확인을 더한 값이다
 * (docs/rules/branch-lifecycle.md §4.3 — 이름 판정과 ref 존재는 별개 층).
 * 이름이 해석돼도 refs/remotes/origin/<base> 가 없으면 유효한 PR base 가
 * 아니므로 base=null 취급 + issue 기록. docs 레포 실측: 빈 원격을
 * tracking 하는 로컬 main 때문에 이름은 나오지만 원격 ref 가 없다 — /cc
 * 는 브랜치를 만들기 전에 이 preflight 를 쓰므로 여기서 걸러야 한다.
 *
 * divergence: rev-list 실패는 "갈라지지 않음"이 아니다. upstream 미설정
 * (갈라질 대상 없음 — 정상, diverged=false)과 upstream 설정 + 비교 실패
 * (tracking ref 부재 등 — 판정 불가, issue 기록 + ok 차단)를 구분한다.
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
  let base = resolved.base;
  if (base === null) {
    issues.push(`base 판정 불가: ${resolved.reason}`);
  } else {
    // branch-lifecycle §4.3 — 판정이 이름을 돌려줬더라도 원격에 그 ref 가
    // 없으면 base=null 과 같이 취급한다 (fail-closed).
    const remoteRef = git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]);
    if (remoteRef === null || remoteRef === '') {
      issues.push(`base(${base}) 의 원격 ref refs/remotes/origin/${base} 부재 — 유효한 PR base 없음, base=null 취급 (branch-lifecycle §4.3)`);
      base = null;
    }
  }

  // divergence — rev-list 실패를 "갈라지지 않음"으로 흡수하지 않는다:
  //   · upstream 미설정 → 갈라질 대상이 없음 (정상)
  //   · upstream 설정 + rev-list 실패 → 분기 여부 판정 불가 (ok 차단)
  let diverged = false;
  let divergenceUnknown = false;
  const counts = git(repoPath, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
  if (counts !== null) {
    const [behind, ahead] = counts.split(/\s+/).map(Number);
    diverged = behind > 0 && ahead > 0;
    if (diverged) issues.push(`upstream 과 양방향 분기 (behind=${behind}, ahead=${ahead}) — 수동 해결 필요`);
  } else {
    const current = git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const configuredUpstream = current && current !== 'HEAD'
      ? git(repoPath, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${current}`])
      : null;
    if (configuredUpstream) {
      divergenceUnknown = true;
      issues.push(`upstream(${configuredUpstream}) 이 설정돼 있으나 rev-list 분기 비교 실패 — tracking ref 부재 등, 분기 여부 판정 불가`);
    }
  }

  return {
    ok: !diverged && !divergenceUnknown && base !== null,
    dirty,
    diverged,
    base,
    issues,
  };
}

// ── Module Exports ───────────────────────────────────────

module.exports = { resolveBase, canCommitTo, mergedState, branchName, preflight };

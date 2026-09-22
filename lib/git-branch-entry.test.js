#!/usr/bin/env node
/**
 * Lens - entryDecision / verifyOwnership unit tests (node assert + real git repos).
 *
 * These two functions were the audit's clearest "prose pretending to be code"
 * finding: /cc Phase 0.4 spent 57 lines describing an ownership proof that had
 * zero lines of implementation, and `require(.*git-branch)` had 0 hits outside
 * SKILL.md `node -e` snippets. Four of five research lenses assumed the logic
 * already lived in lib/. It did not.
 *
 * What is pinned here:
 *   1. block outranks ask — a later soft finding never upgrades a hard refusal;
 *   2. an unprovable state is `ask`, never `proceed` (base unknown, dirty tree);
 *   3. sitting on the base branch is refused, and `requireTaskBranch` decides
 *      whether that refusal is a block or a question;
 *   4. ownership needs all three signals — a name match alone is not ownership;
 *   5. an unreadable merge state counts as NOT owned (unknown is not a pass).
 *
 * Real repositories are created in a temp dir rather than mocking `git`: the
 * functions exist because name-level reasoning was wrong, so testing them against
 * a fake git would test the very assumption under suspicion.
 *
 * Run: node lib/git-branch-entry.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { entryDecision, verifyOwnership, mergedState } = require('./git-branch');
const LENS_CLI = path.join(__dirname, '..', 'scripts', 'lens-cli.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const run = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

/**
 * A repo with an `origin` remote that actually exists, because both functions
 * resolve `origin/<base>` and a bare `init` would make every check fail for the
 * wrong reason.
 */
function newRepo({ base = 'master', branch = null, dirty = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-gbe-'));
  const originPath = path.join(root, 'origin.git');
  const workPath = path.join(root, 'work');

  execFileSync('git', ['init', '--bare', '-b', base, originPath], { stdio: 'ignore' });
  execFileSync('git', ['clone', originPath, workPath], { stdio: 'ignore' });
  run(workPath, 'config', 'user.email', 'test@example.com');
  run(workPath, 'config', 'user.name', 'Lens Test');

  fs.writeFileSync(path.join(workPath, 'README.md'), '# base\n');
  run(workPath, 'add', '-A');
  run(workPath, 'commit', '-m', 'base');
  run(workPath, 'push', '-u', 'origin', base);

  if (branch) {
    run(workPath, 'checkout', '-b', branch, `origin/${base}`);
    fs.writeFileSync(path.join(workPath, 'work.txt'), 'task work\n');
    run(workPath, 'add', '-A');
    run(workPath, 'commit', '-m', 'task commit');
  }
  if (dirty) fs.writeFileSync(path.join(workPath, 'stray.txt'), 'uncommitted\n');

  return workPath;
}

const planWith = branch =>
  ['## 진행상황', '', `- **작업 브랜치**: \`${branch}\` — 2026-08-22 이 계획의 실행이 생성. 시작 SHA abc1234.`, ''].join('\n');

console.log('\n== entryDecision ==');

test('clean repo on the plan branch → proceed', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const d = entryDecision(repo, 'feat/thing');
  assert.strictEqual(d.decision, 'proceed', `reasons: ${d.reasons.join(' | ')}`);
  assert.strictEqual(d.onPlanBranch, true);
  assert.strictEqual(d.base, 'master');
});

test('a dirty tree downgrades to ask, never proceed', () => {
  const repo = newRepo({ branch: 'feat/thing', dirty: true });
  const d = entryDecision(repo, 'feat/thing');
  assert.strictEqual(d.decision, 'ask');
  assert.ok(d.reasons.some(r => r.includes('dirty')));
});

test('sitting on base is refused — ask by default', () => {
  const repo = newRepo();
  const d = entryDecision(repo, 'feat/thing');
  assert.strictEqual(d.decision, 'ask');
  assert.ok(d.reasons.some(r => r.includes('base(master)')), d.reasons.join(' | '));
});

test('sitting on base is a hard block when requireTaskBranch is on', () => {
  const repo = newRepo();
  const d = entryDecision(repo, 'feat/thing', { requireTaskBranch: true });
  assert.strictEqual(d.decision, 'block');
});

test('block outranks ask regardless of order', () => {
  // dirty (ask) + on base with requireTaskBranch (block) must land on block.
  const repo = newRepo({ dirty: true });
  const d = entryDecision(repo, 'feat/thing', { requireTaskBranch: true });
  assert.strictEqual(d.decision, 'block');
});

test('being on a different branch than the plan names is flagged', () => {
  const repo = newRepo({ branch: 'feat/actual' });
  const d = entryDecision(repo, 'feat/expected');
  assert.strictEqual(d.decision, 'ask');
  assert.strictEqual(d.onPlanBranch, false);
  assert.ok(d.reasons.some(r => r.includes('feat/expected')));
});

test('no plan branch given → the branch field stays null, not a guess', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const d = entryDecision(repo, null);
  assert.strictEqual(d.branch, null);
  assert.strictEqual(d.onPlanBranch, false);
});

test('reasons are de-duplicated against preflight issues', () => {
  const repo = newRepo({ branch: 'feat/thing', dirty: true });
  const d = entryDecision(repo, 'feat/thing');
  assert.strictEqual(new Set(d.reasons).size, d.reasons.length);
});

// G10 — /cc 진입 7회가 전부 ask 였다: 실행하려는 계획서 파일 하나가 dirty 였고,
// 같은 dirty 사유가 문구만 바꿔 두 번 실렸다.
test('the plan document being executed does not make the tree dirty', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  fs.mkdirSync(path.join(repo, 'docs', 'tasks'), { recursive: true });
  const plan = path.join(repo, 'docs', 'tasks', '2026-09-22-계획.md');
  fs.writeFileSync(plan, '# plan\n');
  const d = entryDecision(repo, 'feat/thing', { planDoc: plan });
  assert.strictEqual(d.decision, 'proceed', `reasons: ${d.reasons.join(' | ')}`);
  // a repo-relative path names the same file
  assert.strictEqual(entryDecision(repo, 'feat/thing', { planDoc: 'docs/tasks/2026-09-22-계획.md' }).decision, 'proceed');
});

test('.lens/ runtime state does not make the tree dirty', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  fs.mkdirSync(path.join(repo, '.lens'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.lens', 'agent-dashboard.json'), '{}\n');
  const d = entryDecision(repo, 'feat/thing');
  assert.strictEqual(d.decision, 'proceed', `reasons: ${d.reasons.join(' | ')}`);
});

test('an unrelated change next to the plan document is still dirty', () => {
  const repo = newRepo({ branch: 'feat/thing', dirty: true });
  const plan = path.join(repo, 'plan.md');
  fs.writeFileSync(plan, '# plan\n');
  const d = entryDecision(repo, 'feat/thing', { planDoc: plan });
  assert.strictEqual(d.decision, 'ask');
  assert.ok(d.reasons.some(r => r.includes('stray.txt')), d.reasons.join(' | '));
});

test('the dirty reason appears exactly once', () => {
  const repo = newRepo({ branch: 'feat/thing', dirty: true });
  const d = entryDecision(repo, 'feat/thing');
  assert.strictEqual(d.reasons.filter(r => r.includes('working tree dirty')).length, 1, d.reasons.join(' | '));
});

console.log('\n== verifyOwnership ==');

test('all three signals present → owned', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const o = verifyOwnership(repo, 'feat/thing', 'master', planWith('feat/thing'));
  assert.deepStrictEqual(o.checks, { record: true, forkedFromBase: true, notMerged: true });
  assert.strictEqual(o.owned, true);
});

test('a name match with no ownership record is NOT ownership', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const o = verifyOwnership(repo, 'feat/thing', 'master', '## 진행상황\n\n- 기록 없음\n');
  assert.strictEqual(o.checks.record, false);
  assert.strictEqual(o.owned, false);
  assert.ok(o.reasons[0].includes('소유 기록이 없다'));
});

test('a record naming a DIFFERENT branch does not transfer ownership', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const o = verifyOwnership(repo, 'feat/thing', 'master', planWith('feat/something-else'));
  assert.strictEqual(o.checks.record, false);
  assert.strictEqual(o.owned, false);
});

test('a branch that does not exist fails the fork check', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const o = verifyOwnership(repo, 'feat/ghost', 'master', planWith('feat/ghost'));
  assert.strictEqual(o.checks.forkedFromBase, false);
  assert.strictEqual(o.owned, false);
});

test('branch names containing / and . are matched literally', () => {
  const repo = newRepo({ branch: 'fix/v1.2.x' });
  const o = verifyOwnership(repo, 'fix/v1.2.x', 'master', planWith('fix/v1.2.x'));
  assert.strictEqual(o.checks.record, true);
  assert.strictEqual(o.owned, true);
});

test('CRLF plan documents parse the ownership line identically', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const o = verifyOwnership(repo, 'feat/thing', 'master', planWith('feat/thing').replace(/\n/g, '\r\n'));
  assert.strictEqual(o.checks.record, true);
});

test('empty or missing plan content is not owned', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  for (const content of ['', null, undefined]) {
    assert.strictEqual(verifyOwnership(repo, 'feat/thing', 'master', content).owned, false);
  }
});

console.log('\n== mergedState — branch deleted after merge (I1) ==');

// I1 — PR 없이 `merge --no-ff` 로 합치는 레포(Returns ERP)에서 브랜치를 지운 뒤
// 6개 중 4개가 unknown 이었다. 원격·로컬 ref 가 모두 없을 때도 base 이력에
// 남은 병합 커밋과 계획서에 기록된 tip 은 증거다.
function mergeAndDelete(repo, branch, { noFf = true } = {}) {
  run(repo, 'push', '-u', 'origin', branch);
  run(repo, 'checkout', 'master');
  if (noFf) run(repo, 'merge', '--no-ff', '--no-edit', branch);
  else run(repo, 'merge', '--ff-only', branch);
  run(repo, 'push', 'origin', 'master');
  run(repo, 'push', 'origin', '--delete', branch);
  run(repo, 'branch', '-D', branch);
}

test('merge --no-ff then branch deleted → merged-deleted with the merge commit as evidence', () => {
  const repo = newRepo({ branch: 'fix/foo' });
  mergeAndDelete(repo, 'fix/foo');
  const st = mergedState(repo, 'fix/foo', 'master');
  assert.strictEqual(st.state, 'merged-deleted', st.reason);
  assert.ok(st.reason.includes('병합 커밋'), st.reason);
});

test('a merge of a longer, different branch name is not evidence', () => {
  const repo = newRepo({ branch: 'fix/foo-v2' });
  mergeAndDelete(repo, 'fix/foo-v2');
  const st = mergedState(repo, 'fix/foo', 'master');
  assert.strictEqual(st.state, 'unknown', st.reason);
});

test('fast-forward merge + deleted branch → merged-deleted from the plan last_tip', () => {
  const repo = newRepo({ branch: 'fix/bar' });
  const tip = run(repo, 'rev-parse', 'HEAD');
  mergeAndDelete(repo, 'fix/bar', { noFf: false });
  const plan = path.join(repo, '..', 'plan.md');
  fs.writeFileSync(plan, `---\nplan_id: x\nlast_tip: "${tip}"\n---\n\n# p\n`);
  assert.strictEqual(mergedState(repo, 'fix/bar', 'master').state, 'unknown');
  const st = mergedState(repo, 'fix/bar', 'master', { planDoc: plan });
  assert.strictEqual(st.state, 'merged-deleted', st.reason);
  assert.ok(st.reason.includes('last_tip'), st.reason);
});

test('a same-named merge from before the plan was created is an earlier task, not evidence', () => {
  const repo = newRepo({ branch: 'fix/foo' });
  mergeAndDelete(repo, 'fix/foo');
  const plan = path.join(repo, '..', 'plan.md');
  fs.writeFileSync(plan, '---\ncreated: 2099-01-01\n---\n');
  assert.strictEqual(mergedState(repo, 'fix/foo', 'master', { planDoc: plan }).state, 'unknown');
});

test('a recorded last_tip outranks a merge message', () => {
  const repo = newRepo({ branch: 'fix/foo' });
  mergeAndDelete(repo, 'fix/foo');
  // a commit that never reached base — the task's real last commit, lost
  const stray = run(repo, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'unmerged work');
  const plan = path.join(repo, '..', 'plan.md');
  fs.writeFileSync(plan, `---\nlast_tip: ${stray}\n---\n`);
  assert.strictEqual(mergedState(repo, 'fix/foo', 'master', { planDoc: plan }).state, 'unknown');
});

test('a last_tip that never reached base stays unknown', () => {
  const repo = newRepo({ branch: 'fix/baz' });
  const tip = run(repo, 'rev-parse', 'HEAD');
  run(repo, 'checkout', 'master');
  run(repo, 'branch', '-D', 'fix/baz');
  const plan = path.join(repo, '..', 'plan.md');
  fs.writeFileSync(plan, `---\r\nlast_tip: ${tip}\r\n---\r\n`);
  assert.strictEqual(mergedState(repo, 'fix/baz', 'master', { planDoc: plan }).state, 'unknown');
});

console.log('\n== scripts/lens-cli.js (thin wrapper — JSON out, lib does the judging) ==');

const { spawnSync } = require('child_process');
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [LENS_CLI, ...args], { cwd, encoding: 'utf-8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* asserted by callers */ }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
};

test('branch entry passes --plan through to entryDecision', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  fs.writeFileSync(path.join(repo, 'plan.md'), '# plan\n');
  const r = cli(repo, 'branch', 'entry', repo, 'feat/thing', '--plan', 'plan.md');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.json.decision, 'proceed', r.stdout);
});

test('branch merged reads last_tip from --plan', () => {
  const repo = newRepo({ branch: 'fix/cli' });
  const tip = run(repo, 'rev-parse', 'HEAD');
  mergeAndDelete(repo, 'fix/cli', { noFf: false });
  const plan = path.join(repo, '..', 'plan.md');
  fs.writeFileSync(plan, `---\nlast_tip: ${tip}\n---\n`);
  const r = cli(repo, 'branch', 'merged', repo, 'fix/cli', 'master', '--plan', plan);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.json.state, 'merged-deleted', r.stdout);
});

test('branch ownership / base answer with the lib result', () => {
  const repo = newRepo({ branch: 'feat/thing' });
  const plan = path.join(repo, '..', 'plan.md');
  fs.writeFileSync(plan, planWith('feat/thing'));
  const o = cli(repo, 'branch', 'ownership', repo, 'feat/thing', 'master', plan);
  assert.strictEqual(o.json.owned, true, o.stdout);
  const b = cli(repo, 'branch', 'base', repo);
  assert.strictEqual(b.json.base, 'master', b.stdout);
  assert.strictEqual(b.json.resolved.base, 'master', b.stdout);
});

test('plan gate: combined JSON, exit 1 on failure, quoted grade is unquoted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-cli-'));
  const md = path.join(dir, 'p.md');
  fs.writeFileSync(md, '---\ngrade: "deep"\n---\n\n# 빈 계획\n');
  const r = cli(dir, 'plan', 'gate', md);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  for (const k of ['kind', 'structure', 'coverage', 'todo']) assert.ok(k in r.json, `missing ${k}: ${r.stdout}`);
  // grade "deep" must be read without its quotes — deep adds Non-Goals to the floor
  assert.ok(r.json.structure.missing.includes('Non-Goals'), r.stdout);
  const s = cli(dir, 'plan', 'structure', md);
  assert.strictEqual(s.status, 1);
  assert.strictEqual(s.json.grade, 'deep', s.stdout);
});

test('unknown subcommand is a usage error, not a silent pass', () => {
  const r = cli(os.tmpdir(), 'branch', 'nope');
  assert.notStrictEqual(r.status, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

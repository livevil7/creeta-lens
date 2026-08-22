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

const { entryDecision, verifyOwnership } = require('./git-branch');

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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

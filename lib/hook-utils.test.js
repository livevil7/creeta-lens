#!/usr/bin/env node
/**
 * Lens - hook-utils resolveProjectRoot tests (node assert only).
 *
 * Pins the root every hook shares (v3.39). In a workspace session both
 * CLAUDE_PROJECT_DIR and the cwd are the workspace, not the repo being worked on;
 * the hooks then read and wrote `.lens/` state in the wrong place.
 *
 * Run: node lib/hook-utils.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveProjectRoot } = require('./hook-utils');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

/** workspace/ (not a repo) holding repo/ (has .git) */
function workspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ws-'));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
  return { ws, repo };
}

function withEnv(key, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, key);
  const old = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return fn(); } finally { if (had) process.env[key] = old; else delete process.env[key]; }
}

console.log('\n[Lens] hook-utils tests\n');

test('a docs/tasks plan names its repo even from the workspace cwd', () => {
  const { ws, repo } = workspace();
  const file = path.join(repo, 'docs', 'tasks', '2026-09-14-x.md');
  withEnv('CLAUDE_PROJECT_DIR', ws, () => {
    assert.strictEqual(resolveProjectRoot({ filePath: file, cwd: ws }), path.resolve(repo));
  });
});

test('a relative plan path resolves against the cwd', () => {
  const { ws, repo } = workspace();
  assert.strictEqual(resolveProjectRoot({ filePath: 'repo/docs/tasks/x.md', cwd: ws }), path.resolve(repo));
});

test('any other file resolves to its git repo', () => {
  const { ws, repo } = workspace();
  assert.strictEqual(resolveProjectRoot({ filePath: path.join(repo, 'src', 'deep', 'a.js'), cwd: ws }), path.resolve(repo));
});

test('a cwd inside a repo resolves to the repo', () => {
  const { repo } = workspace();
  assert.strictEqual(resolveProjectRoot({ cwd: path.join(repo, 'src', 'deep') }), path.resolve(repo));
});

test('a non-repo cwd stays where it is (the workspace), not the home directory', () => {
  const { ws } = workspace();
  withEnv('CLAUDE_PROJECT_DIR', undefined, () => {
    assert.strictEqual(resolveProjectRoot({ cwd: ws }), ws);
  });
});

test('with no cwd, CLAUDE_PROJECT_DIR is the base', () => {
  const { repo } = workspace();
  withEnv('CLAUDE_PROJECT_DIR', path.join(repo, 'src'), () => {
    assert.strictEqual(resolveProjectRoot({}), path.resolve(repo));
  });
});

// ── v3.48 J3a: `.lens/` never shows up in git ─────────────────
// 실측: snapholo 41개 등 9개 레포에서 `.lens` 상태 파일이 추적되거나 늘 "수정됨".

const { execFileSync } = require('child_process');
const { ensureLensDir, safeWriteJson } = require('./hook-utils');

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-git-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

const excludeLines = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').split(/\r?\n/) : []).filter(l => l.trim() === '.lens/');

test('ensureLensDir registers .lens/ in info/exclude once — git status stays clean', () => {
  const repo = gitRepo();
  const dir = ensureLensDir(repo);
  assert.strictEqual(dir, path.join(repo, '.lens'));
  fs.writeFileSync(path.join(dir, 'agent-dashboard.json'), '{}');
  ensureLensDir(repo); // idempotent
  assert.strictEqual(excludeLines(path.join(repo, '.git', 'info', 'exclude')).length, 1);
  assert.strictEqual(git(repo, 'status', '--porcelain').trim(), '');
});

test('ensureLensDir handles a worktree (.git is a file) via the common exclude', () => {
  const repo = gitRepo();
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-wt-')), 'wt');
  git(repo, 'worktree', 'add', '-q', '-b', 'side', wt);
  assert.ok(fs.statSync(path.join(wt, '.git')).isFile(), 'fixture: worktree .git must be a file');
  const dir = ensureLensDir(wt);
  fs.writeFileSync(path.join(dir, 'progress-report-state.json'), '{}');
  assert.strictEqual(git(wt, 'status', '--porcelain').trim(), '');
});

test('ensureLensDir outside git just makes the folder', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plain-'));
  assert.strictEqual(ensureLensDir(plain), path.join(plain, '.lens'));
  assert.ok(fs.existsSync(path.join(plain, '.lens')));
});

test('a hook that writes legacy .lens state leaves git status empty', () => {
  const repo = gitRepo();
  const env = { ...process.env, CLAUDE_HOOK_INPUT: '', CLAUDE_PROJECT_DIR: repo, LENS_SESSION_STORE: fs.mkdtempSync(path.join(os.tmpdir(), 'lens-store-')) };
  delete env.CLAUDE_CODE_SESSION_ID; // no session id → legacy repo-level path
  execFileSync(process.execPath, [path.join(__dirname, '..', 'hooks', 'post-tool-progress.js')], {
    cwd: repo,
    env,
    input: JSON.stringify({ cwd: repo, tool_name: 'Bash', tool_input: { command: 'sleep 1', run_in_background: true } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.ok(fs.existsSync(path.join(repo, '.lens', 'progress-report-state.json')), 'fixture: the hook must have written legacy state');
  assert.strictEqual(git(repo, 'status', '--porcelain').trim(), '');
});

// ── v3.48 row 74: a failed atomic replace leaves no `.tmp` behind ──
test('safeWriteJson leaves no .tmp when the replace fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-tmp-'));
  const target = path.join(dir, 'board.json');
  fs.mkdirSync(target); // a directory in the way: rename and the direct-write fallback both fail
  assert.strictEqual(safeWriteJson(target, { a: 1 }), false);
  assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), []);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

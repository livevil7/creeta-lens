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

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Lens - SessionStart dashboard-continuity tests (node assert only, no deps).
 *
 * Why this file exists. hooks/post-tool-task.js only withholds the sentence
 * "All N agents complete" while summary.launched > 0 — that counter is the sole
 * evidence that a background spawn was never observed finishing. session-start.js
 * called initSession() unconditionally, and the `once: true` in hooks/hooks.json
 * does NOT make the hook startup-only (the harness puts `once` on a hook entry,
 * not on the matcher group where this repo has it — 실측, see the note above
 * NEW_CONVERSATION_SOURCES). So every auto-compact and fork re-ran the hook and
 * wrote a fresh dashboard, resetting launched to 0 mid-run. Compact lands during
 * exactly the long multi-agent waits the guard is for. Measured across ~3,000
 * transcripts before the fix: "All N agents complete" 238 vs the guard firing 1.
 *
 * The invariants pinned here:
 *   1. a genuinely new conversation (startup/resume/clear) starts a fresh board;
 *   2. every other source (compact/fork/unknown/absent) keeps the live board —
 *      an allowlist, not a denylist, so an unknown source never wipes state;
 *   3. an in-flight `launched` agent survives a continuation, which is the whole
 *      point: the guard must still fire after a compact;
 *   4. a continuation with no readable board still yields one (fail-soft).
 *
 * The hook is exercised as a subprocess because the source gate reads stdin, and
 * stdin is one-shot — the in-process seam cannot reproduce the double-read that
 * silently defeated the earlier gate.
 *
 * Run: node hooks/session-start.test.js  → prints results, exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'session-start.js');
const tracker = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

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

/** Fresh project dir so tests never touch the real workspace dashboard. */
function newProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-sessionstart-'));
  fs.mkdirSync(path.join(dir, '.lens'), { recursive: true });
  return dir;
}

const boardPath = dir => path.join(dir, '.lens', 'agent-dashboard.json');
const readBoard = dir => JSON.parse(fs.readFileSync(boardPath(dir), 'utf-8'));

/** Write a board that looks like a run already in flight. */
function seedInFlightBoard(dir, sessionId = 'sess_seeded_0001') {
  const board = tracker.createDefaultDashboard();
  board.session.id = sessionId;
  board.agents = [
    { ...tracker.createAgentEntry('background worker'), status: tracker.LAUNCHED_STATUS },
  ];
  tracker.recalculateSummary(board);
  fs.writeFileSync(boardPath(dir), JSON.stringify(board, null, 2));
  return board;
}

/** Run the hook exactly as the harness does: payload on stdin, own project dir. */
function runHook(dir, payload) {
  execFileSync(process.execPath, [HOOK], {
    input: payload === undefined ? '' : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_HOOK_INPUT: '' },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
}

console.log('\n== new conversation → fresh board ==');

for (const source of ['startup', 'resume', 'clear']) {
  test(`source "${source}" starts a new session`, () => {
    const dir = newProject();
    seedInFlightBoard(dir);
    runHook(dir, { source });
    const after = readBoard(dir);
    assert.notStrictEqual(after.session.id, 'sess_seeded_0001', 'seeded session should be replaced');
    assert.strictEqual(after.summary.launched, 0);
    assert.strictEqual(after.agents.length, 0);
  });
}

console.log('\n== continuation → live board survives (the 238:1 regression) ==');

for (const source of ['compact', 'fork', 'sometotallynewsource']) {
  test(`source "${source}" keeps the in-flight board`, () => {
    const dir = newProject();
    seedInFlightBoard(dir);
    runHook(dir, { source });
    const after = readBoard(dir);
    assert.strictEqual(after.session.id, 'sess_seeded_0001', 'continuation must not reset the session');
    assert.strictEqual(after.summary.launched, 1, 'launched counter is the guard — it must survive');
  });
}

test('absent source is treated as a continuation, not a new conversation', () => {
  const dir = newProject();
  seedInFlightBoard(dir);
  runHook(dir, {});
  assert.strictEqual(readBoard(dir).summary.launched, 1);
});

test('empty stdin does not wipe the board', () => {
  const dir = newProject();
  seedInFlightBoard(dir);
  runHook(dir, undefined);
  assert.strictEqual(readBoard(dir).summary.launched, 1);
});

test('repeated compacts leave the launched agent untouched', () => {
  const dir = newProject();
  seedInFlightBoard(dir);
  for (let i = 0; i < 3; i += 1) runHook(dir, { source: 'compact' });
  const after = readBoard(dir);
  assert.strictEqual(after.session.id, 'sess_seeded_0001');
  assert.strictEqual(after.summary.launched, 1);
});

console.log('\n== fail-soft ==');

test('continuation with no board still produces one', () => {
  const dir = newProject();
  runHook(dir, { source: 'compact' });
  assert.ok(fs.existsSync(boardPath(dir)), 'hook must leave a usable dashboard');
  assert.strictEqual(readBoard(dir).summary.launched, 0);
});

test('continuation with a corrupt board recovers instead of throwing', () => {
  const dir = newProject();
  fs.writeFileSync(boardPath(dir), '{ not json');
  runHook(dir, { source: 'compact' });
  assert.ok(fs.existsSync(boardPath(dir)));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

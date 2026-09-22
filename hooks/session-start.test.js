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

/**
 * v3.48: the board is the session's own file in the session store (keyed by
 * session_id), so these run with a session id and a scratch store. Added:
 *   5. two sessions start → two folders; one session's start never touches the
 *      other's board (C3 — a second session's startup wiped the first's);
 *   6. without a session id the shared legacy board is never reset;
 *   7. startup sweeps session folders untouched for 7 days;
 *   8. compact/fork re-inject the answer-language line; startup does not (F6).
 */
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-sessionstart-store-'));
let seq = 0;

/** Fresh project dir + session id so tests never touch the real workspace or store. */
function newProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-sessionstart-'));
  seq += 1;
  return { dir, sid: `sess-test-${process.pid}-${seq}` };
}

const boardPath = sid => path.join(STORE, sid, 'dashboard.json');
const readBoard = sid => JSON.parse(fs.readFileSync(boardPath(sid), 'utf-8'));

/** Write a board that looks like a run already in flight. */
function seedInFlightBoard(file, sessionId = 'sess_seeded_0001') {
  const board = tracker.createDefaultDashboard();
  board.session.id = sessionId;
  board.agents = [
    { ...tracker.createAgentEntry('background worker'), status: tracker.LAUNCHED_STATUS },
  ];
  tracker.recalculateSummary(board);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(board, null, 2));
  return board;
}

/** Run the hook exactly as the harness does: payload on stdin, own project dir. */
function runHook(project, payload) {
  const env = {
    ...process.env, CLAUDE_PROJECT_DIR: project.dir, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_HOOK_INPUT: '',
    LENS_SESSION_STORE: STORE, CLAUDE_HOME: project.dir,
  };
  delete env.CLAUDE_CODE_SESSION_ID;
  const out = execFileSync(process.execPath, [HOOK], {
    input: payload === undefined ? '' : JSON.stringify(payload),
    env,
    cwd: project.dir,
    stdio: ['pipe', 'pipe', 'ignore'],
  }).toString().trim();
  try { return JSON.parse(out); } catch { return {}; }
}

const payload = (p, source) => ({ session_id: p.sid, cwd: p.dir, hook_event_name: 'SessionStart', ...(source === undefined ? {} : { source }) });
const context = out => String((out.hookSpecificOutput && out.hookSpecificOutput.additionalContext) || '');

console.log('\n== new conversation → fresh board ==');

for (const source of ['startup', 'resume', 'clear']) {
  test(`source "${source}" starts a new session`, () => {
    const p = newProject();
    seedInFlightBoard(boardPath(p.sid));
    runHook(p, payload(p, source));
    const after = readBoard(p.sid);
    assert.notStrictEqual(after.session.id, 'sess_seeded_0001', 'seeded session should be replaced');
    assert.strictEqual(after.summary.launched, 0);
    assert.strictEqual(after.agents.length, 0);
  });
}

console.log('\n== continuation → live board survives (the 238:1 regression) ==');

for (const source of ['compact', 'fork', 'sometotallynewsource']) {
  test(`source "${source}" keeps the in-flight board`, () => {
    const p = newProject();
    seedInFlightBoard(boardPath(p.sid));
    runHook(p, payload(p, source));
    const after = readBoard(p.sid);
    assert.strictEqual(after.session.id, 'sess_seeded_0001', 'continuation must not reset the session');
    assert.strictEqual(after.summary.launched, 1, 'launched counter is the guard — it must survive');
  });
}

test('absent source is treated as a continuation, not a new conversation', () => {
  const p = newProject();
  seedInFlightBoard(boardPath(p.sid));
  runHook(p, payload(p, undefined));
  assert.strictEqual(readBoard(p.sid).summary.launched, 1);
});

test('empty stdin does not wipe any board', () => {
  const p = newProject();
  seedInFlightBoard(boardPath(p.sid));
  const legacy = path.join(p.dir, '.lens', 'agent-dashboard.json');
  seedInFlightBoard(legacy);
  runHook(p, undefined);
  assert.strictEqual(readBoard(p.sid).summary.launched, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(legacy, 'utf-8')).summary.launched, 1);
});

test('repeated compacts leave the launched agent untouched', () => {
  const p = newProject();
  seedInFlightBoard(boardPath(p.sid));
  for (let i = 0; i < 3; i += 1) runHook(p, payload(p, 'compact'));
  const after = readBoard(p.sid);
  assert.strictEqual(after.session.id, 'sess_seeded_0001');
  assert.strictEqual(after.summary.launched, 1);
});

console.log('\n== sessions are separate (v3.48) ==');

test('two sessions start → two folders; the first board is untouched by the second start', () => {
  const a = newProject();
  const b = { dir: a.dir, sid: `${a.sid}-b` };
  seedInFlightBoard(boardPath(a.sid));
  const before = fs.readFileSync(boardPath(a.sid), 'utf-8');
  runHook(b, payload(b, 'startup'));
  assert.strictEqual(fs.readFileSync(boardPath(a.sid), 'utf-8'), before, 'session A board changed');
  assert.ok(fs.existsSync(boardPath(b.sid)), 'session B got its own board');
  assert.notStrictEqual(path.dirname(boardPath(a.sid)), path.dirname(boardPath(b.sid)));
});

test('no session id: startup does not reset the shared legacy board', () => {
  const p = newProject();
  const legacy = path.join(p.dir, '.lens', 'agent-dashboard.json');
  seedInFlightBoard(legacy);
  runHook(p, { cwd: p.dir, hook_event_name: 'SessionStart', source: 'startup' });
  assert.strictEqual(JSON.parse(fs.readFileSync(legacy, 'utf-8')).summary.launched, 1);
});

test('resume clears this session\'s progress clock only', () => {
  const a = newProject();
  const b = { dir: a.dir, sid: `${a.sid}-other` };
  for (const sid of [a.sid, b.sid]) {
    fs.mkdirSync(path.join(STORE, sid), { recursive: true });
    fs.writeFileSync(path.join(STORE, sid, 'progress.json'), JSON.stringify({ armedAt: '2026-09-22T00:00:00.000Z' }));
  }
  runHook(a, payload(a, 'resume'));
  assert.ok(!fs.existsSync(path.join(STORE, a.sid, 'progress.json')));
  assert.ok(fs.existsSync(path.join(STORE, b.sid, 'progress.json')));
});

test('startup sweeps session folders untouched for 7 days, keeps fresh ones', () => {
  const p = newProject();
  const old = path.join(STORE, 'sess-stale-old');
  const fresh = path.join(STORE, 'sess-stale-fresh');
  for (const d of [old, fresh]) fs.mkdirSync(d, { recursive: true });
  const eightDaysAgo = new Date(Date.now() - 8 * 86400000);
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
  runHook(p, payload(p, 'startup'));
  assert.ok(!fs.existsSync(old), 'stale folder kept');
  assert.ok(fs.existsSync(fresh), 'fresh folder removed');
});

console.log('\n== answer language after compaction (F6) ==');

for (const source of ['compact', 'fork']) {
  test(`source "${source}" re-injects the answer-language line`, () => {
    const p = newProject();
    assert.match(context(runHook(p, payload(p, source))), /사용자 언어로 답한다/);
  });
}

test('startup output is unchanged (no language line)', () => {
  const p = newProject();
  const out = runHook(p, payload(p, 'startup'));
  assert.ok(!/사용자 언어로 답한다/.test(context(out)));
  assert.match(String(out.systemMessage || ''), /activated/);
});

console.log('\n== fail-soft ==');

test('continuation with no board still produces one', () => {
  const p = newProject();
  runHook(p, payload(p, 'compact'));
  assert.ok(fs.existsSync(boardPath(p.sid)), 'hook must leave a usable dashboard');
  assert.strictEqual(readBoard(p.sid).summary.launched, 0);
});

test('continuation with a corrupt board recovers instead of throwing', () => {
  const p = newProject();
  fs.mkdirSync(path.dirname(boardPath(p.sid)), { recursive: true });
  fs.writeFileSync(boardPath(p.sid), '{ not json');
  runHook(p, payload(p, 'compact'));
  assert.ok(fs.existsSync(boardPath(p.sid)));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

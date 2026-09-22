#!/usr/bin/env node
/**
 * Lens - session-store tests (node assert only).
 *
 * Pins the v3.48 contract every hook builds on: state is keyed by session id in
 * the user's config dir, two sessions never share a file, a subagent call is
 * recognisable, and a missing id falls back (null path) instead of throwing.
 *
 * Run: node lib/session-store.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-sessions-'));
process.env.LENS_SESSION_STORE = root;
const oldSessionEnv = process.env.CLAUDE_CODE_SESSION_ID;
delete process.env.CLAUDE_CODE_SESSION_ID;
const store = require('./session-store');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

test('two sessions get two different files', () => {
  store.bind({ session_id: 'aaa-111' });
  store.write('progress', { who: 'a' });
  store.bind({ session_id: 'bbb-222' });
  store.write('progress', { who: 'b' });
  assert.strictEqual(store.read('progress', null, 'aaa-111').who, 'a');
  assert.strictEqual(store.read('progress', null, 'bbb-222').who, 'b');
  assert.notStrictEqual(store.filePath('progress', 'aaa-111'), store.filePath('progress', 'bbb-222'));
});

test('files live under the store root, not the cwd', () => {
  store.bind({ session_id: 'aaa-111' });
  assert.ok(store.filePath('dashboard').startsWith(root));
});

test('no session id → null path (caller keeps its legacy path)', () => {
  store.bind({});
  assert.strictEqual(store.filePath('progress'), null);
  assert.strictEqual(store.write('progress', { x: 1 }), false);
  assert.deepStrictEqual(store.read('progress', { fb: true }), { fb: true });
});

test('a traversal-shaped id is rejected, not escaped', () => {
  store.bind({ session_id: '../../etc' });
  assert.strictEqual(store.filePath('progress'), null);
  assert.strictEqual(store.cleanId('..'), null);
});

test('a subagent call is recognised by agent_id', () => {
  assert.strictEqual(store.isSubagentCall({ session_id: 'x', agent_id: 'agent-1' }), true);
  assert.strictEqual(store.isSubagentCall({ session_id: 'x' }), false);
});

test('update is read-modify-write', () => {
  store.bind({ session_id: 'ccc-333' });
  store.update('blocks', s => ({ n: ((s && s.n) || 0) + 1 }), null);
  store.update('blocks', s => ({ n: ((s && s.n) || 0) + 1 }), null);
  assert.strictEqual(store.read('blocks').n, 2);
});

test('a throwing mutate runs once, returns null, and does not trap', () => {
  store.bind({ session_id: 'ggg-777' });
  let calls = 0;
  const out = store.update('blocks', () => { calls += 1; throw new Error('boom'); }, null);
  assert.strictEqual(out, null);
  assert.strictEqual(calls, 1);
});

test('top-tier delegation counts only this session and not errored ones', () => {
  store.write('dashboard', { agents: [{ model: 'fable', status: 'launched' }] }, 'ddd-444');
  store.write('dashboard', { agents: [{ model: 'fable', status: 'error' }] }, 'eee-555');
  assert.strictEqual(store.topTierDelegated('fable', 'ddd-444'), true);
  assert.strictEqual(store.topTierDelegated('fable', 'eee-555'), false);
  assert.strictEqual(store.topTierDelegated('fable', 'fff-666'), false);
});

test('prune removes only folders older than the retention', () => {
  const oldDir = store.sessionDir('old-777');
  fs.mkdirSync(oldDir, { recursive: true });
  const past = (Date.now() - 10 * 86400000) / 1000;
  fs.utimesSync(oldDir, past, past);
  const removed = store.prune(7);
  assert.ok(removed >= 1);
  assert.ok(!fs.existsSync(oldDir));
  assert.ok(fs.existsSync(store.sessionDir('aaa-111')));
});

if (oldSessionEnv !== undefined) process.env.CLAUDE_CODE_SESSION_ID = oldSessionEnv;
try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/**
 * Lens - user-prompt-handler tests (subprocess, official payload on stdin, node assert only).
 *
 * v3.48 (J2): the hook read `input.userMessage` while UserPromptSubmit sends
 * `prompt`, so it never ran (0 OVERRIDE lines in the transcripts). Fixed, its
 * "Do NOT call AskUserQuestion" override would block the question dialog again,
 * so the override is gone. Its one job now: a user message is a contact — stamp
 * the session's progress clock (C2).
 *
 * Run: node scripts/user-prompt-handler.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'user-prompt-handler.js');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-prompt-store-'));
const ENV = { ...process.env, LENS_SESSION_STORE: STORE, CLAUDE_HOOK_INPUT: '', CLAUDE_PROJECT_DIR: STORE };
delete ENV.CLAUDE_CODE_SESSION_ID;
delete ENV.CLAUDE_USER_MESSAGE;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const raw = payload => execFileSync(process.execPath, [HOOK], { input: JSON.stringify(payload), env: ENV, cwd: STORE, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
const progress = sid => path.join(STORE, sid, 'progress.json');
const payload = (sid, prompt) => ({
  session_id: sid, transcript_path: '/x/t.jsonl', cwd: STORE, permission_mode: 'default',
  hook_event_name: 'UserPromptSubmit', prompt,
});

console.log('\n[Lens] user-prompt-handler tests\n');

for (const prompt of ['/cp 로그인 화면 개선 계획 세워줘', '/cs', '계획 세워줘', '/cp 결과가 이상한데 이게 맞아?']) {
  test(`"${prompt}" → stdout {} — no OVERRIDE, no systemMessage`, () => {
    const out = raw(payload('sess-p1', prompt));
    assert.ok(!/OVERRIDE/.test(out));
    assert.deepStrictEqual(JSON.parse(out), {});
  });
}

test('a user message stamps lastContactAt in the session store', () => {
  const before = Date.now();
  raw(payload('sess-p2', '어디까지 됐어?'));
  const s = JSON.parse(fs.readFileSync(progress('sess-p2'), 'utf-8'));
  assert.ok(Date.parse(s.lastContactAt) >= before - 1000, s.lastContactAt);
});

test('an armed clock keeps its arming fields; only lastContactAt moves', () => {
  fs.mkdirSync(path.join(STORE, 'sess-p3'), { recursive: true });
  const seeded = { armedAt: '2026-09-22T00:00:00.000Z', lastSignalAt: '2026-09-22T00:01:00.000Z', lastContactAt: '2026-09-22T00:00:00.000Z', lastReminderAt: null, reminders: 2 };
  fs.writeFileSync(progress('sess-p3'), JSON.stringify(seeded));
  raw(payload('sess-p3', '계속해'));
  const s = JSON.parse(fs.readFileSync(progress('sess-p3'), 'utf-8'));
  assert.strictEqual(s.armedAt, seeded.armedAt);
  assert.strictEqual(s.reminders, 2);
  assert.notStrictEqual(s.lastContactAt, seeded.lastContactAt);
});

test('a subagent payload (agent_id) changes nothing', () => {
  const out = raw({ ...payload('sess-p4', 'x'), agent_id: 'a1b2c3', agent_type: 'Explore' });
  assert.deepStrictEqual(JSON.parse(out), {});
  assert.ok(!fs.existsSync(progress('sess-p4')));
});

test('empty stdin → {} (fail-open)', () => {
  const out = execFileSync(process.execPath, [HOOK], { input: '', env: ENV, cwd: STORE, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  assert.deepStrictEqual(JSON.parse(out), {});
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

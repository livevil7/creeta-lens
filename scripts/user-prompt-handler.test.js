#!/usr/bin/env node
/**
 * Lens - user-prompt-handler tests (subprocess, node assert only).
 *
 * Pins: an explicit `/skill args` order still forces the Skill tool; a question
 * or complaint that happens to start with `/skill` does not (v3.39).
 *
 * Run: node scripts/user-prompt-handler.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'user-prompt-handler.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const run = message => JSON.parse(execFileSync(process.execPath, [HOOK], {
  input: '',
  env: { ...process.env, CLAUDE_USER_MESSAGE: message, CLAUDE_HOOK_INPUT: '' },
}).toString().trim());

const forced = r => /OVERRIDE/.test(r.systemMessage || '');

console.log('\n[Lens] user-prompt-handler tests\n');

test('an order is forced', () => {
  assert.ok(forced(run('/cp 로그인 화면 개선 계획 세워줘')));
  assert.ok(forced(run('/cs')));
});

for (const q of [
  '/cp 결과가 이상한데 이게 맞아?',
  '/cp 양식이 왜 이래?',
  '/cc 이거 맞아',
  '/cp 왜 매번 html 을 만드는 거지',
  '/cp 어떻게 수정하지',
]) {
  test(`a question is not forced: "${q}"`, () => {
    assert.ok(!forced(run(q)), q);
  });
}

test('a plain message is untouched', () => {
  assert.deepStrictEqual(run('계획 세워줘'), { systemMessage: '' });
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

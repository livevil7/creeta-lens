#!/usr/bin/env node
/**
 * Lens - pre-tool-ask hook tests (subprocess, node assert only).
 *
 * Pins: a question with no report in front of it is denied; a question that
 * follows a real report passes; an earlier report does not cover a question that
 * comes after more tool calls; any unreadable transcript fails open.
 *
 * Run: node hooks/pre-tool-ask.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'pre-tool-ask.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const REPORT = '계획서를 띄웠습니다: https://claude.ai/code/artifact/abc — 인벤토리 41건, 가장 큰 리스크는 훅 수정 범위입니다. 선택지마다 결과를 아래에 적었습니다.';

const user = text => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const toolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
const say = text => ({ type: 'assistant', message: { id: 'm', content: [{ type: 'text', text }] } });
const think = () => ({ type: 'assistant', message: { id: 'm', content: [{ type: 'thinking', thinking: '...' }] } });
const call = name => ({ type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', id: 't', name, input: {} }] } });

function transcript(entries) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ask-')), 't.jsonl');
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return file;
}

function run(payload, env = {}) {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_HOOK_INPUT: '', LENS_ASK_GUARD: '', ...env },
  }).toString().trim();
  return JSON.parse(out || '{}');
}

const denied = r => r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny';

console.log('\n[Lens] pre-tool-ask tests\n');

test('a question straight after tool results is denied, with what to write', () => {
  const t = transcript([user('해줘'), call('Bash'), toolResult(), think(), call('AskUserQuestion')]);
  const r = run({ tool_name: 'AskUserQuestion', transcript_path: t });
  assert.ok(denied(r), JSON.stringify(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /보고가 먼저/);
});

test('a question that follows a real report passes', () => {
  const t = transcript([user('해줘'), call('Bash'), toolResult(), say(REPORT), call('AskUserQuestion')]);
  assert.deepStrictEqual(run({ tool_name: 'AskUserQuestion', transcript_path: t }), {});
});

test('the report counts even if the tool_use line is not written yet', () => {
  const t = transcript([user('해줘'), toolResult(), say(REPORT)]);
  assert.deepStrictEqual(run({ tool_name: 'AskUserQuestion', transcript_path: t }), {});
});

test('an earlier report does not cover a question after more tool calls', () => {
  const t = transcript([user('해줘'), say(REPORT), call('Bash'), toolResult(), call('AskUserQuestion')]);
  assert.ok(denied(run({ tool_name: 'AskUserQuestion', transcript_path: t })));
});

test('a one-word line is not a report', () => {
  const t = transcript([user('해줘'), toolResult(), say('확인합니다.'), call('AskUserQuestion')]);
  assert.ok(denied(run({ tool_name: 'AskUserQuestion', transcript_path: t })));
});

test('other tools are never touched', () => {
  const t = transcript([user('해줘'), toolResult(), call('Bash')]);
  assert.deepStrictEqual(run({ tool_name: 'Bash', transcript_path: t }), {});
});

test('a missing transcript fails open', () => {
  assert.deepStrictEqual(run({ tool_name: 'AskUserQuestion', transcript_path: path.join(os.tmpdir(), 'nope-lens.jsonl') }), {});
});

test('LENS_ASK_GUARD=0 turns it off', () => {
  const t = transcript([user('해줘'), toolResult(), call('AskUserQuestion')]);
  assert.deepStrictEqual(run({ tool_name: 'AskUserQuestion', transcript_path: t }, { LENS_ASK_GUARD: '0' }), {});
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

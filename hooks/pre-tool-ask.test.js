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

// v3.40 run-guard tests create real ledgers; never touch the user's real index.
process.env.LENS_LEDGER_INDEX = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ask-index-')), 'active-ledgers.json');
const ledger = require(path.join(PLUGIN_ROOT, 'lib', 'gate-ledger'));

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

// ── v3.40 — no stops during an approved run ─────────────────

console.log('\n  -- 무정지 실행 --');

/** A repo with an open ledger for `sessionId`; returns { root, workspace }. */
function runRepo(sessionId, { close = false } = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ask-ws-'));
  const root = path.join(workspace, 'repo');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const made = ledger.createLedger(root, { scope: '2026-09-14-x', sessionId, gates: [{ id: 'G1', criterion: '가입 완료', kind: 'manual' }] });
  assert.ok(made.ok, JSON.stringify(made));
  if (close) assert.ok(ledger.closeLedger(root, '2026-09-14-x').ok);
  return { root, workspace };
}

const reported = () => transcript([user('해줘'), toolResult(), say(REPORT)]);
const ask = (header, { cwd, session = 'S1', env } = {}) => run({
  tool_name: 'AskUserQuestion',
  transcript_path: reported(),
  session_id: session,
  cwd,
  tool_input: { questions: [{ question: '어떻게 할까요?', header, options: [] }] },
}, env);

test('during this session\'s run, an ordinary question is denied and names the stop kinds', () => {
  const { root } = runRepo('S1');
  const r = ask('경로 전환', { cwd: root });
  assert.ok(denied(r), JSON.stringify(r));
  const reason = r.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /정지:범위변경/);
  assert.match(reason, /검증 확인/);
});

test('the refusal gives a way out for a cancelled run: the exact closeLedger call and the kill switch', () => {
  // its own session — the index still lists S1 runs left open by the other tests
  const { root } = runRepo('S4');
  const reason = ask('작업 완료 — 정리', { cwd: root, session: 'S4' }).hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /closeLedger\('[^']+','2026-09-14-x'\)/);
  assert.match(reason, /LENS_ASK_GUARD=0/);
  // …and the command it prints actually closes the run.
  const cmd = reason.match(/node -e "([^"]+)"/)[1];
  execFileSync(process.execPath, ['-e', cmd]);
  assert.deepStrictEqual(ask('작업 완료 — 정리', { cwd: root, session: 'S4' }), {});
});

for (const header of ['정지:비가역', '정지:외부영향', '정지:범위변경', '검증 확인', '실행 종료', '실행 승인', '정지 : 범위변경']) {
  test(`during the run, header "${header}" is allowed`, () => {
    const { root } = runRepo('S1');
    assert.deepStrictEqual(ask(header, { cwd: root }), {});
  });
}

test('the run is found through the ledger index when the session cwd is the workspace', () => {
  const { workspace } = runRepo('S1');
  assert.ok(denied(ask('이어서 할까요', { cwd: workspace })));
});

test('another session\'s open ledger does not stop this session\'s questions', () => {
  const { root } = runRepo('S2');
  assert.deepStrictEqual(ask('이어서 할까요', { cwd: root, session: 'S9' }), {});
});

test('a closed ledger means the run is over', () => {
  const { root } = runRepo('S3', { close: true });
  assert.deepStrictEqual(ask('다음 작업', { cwd: root, session: 'S3' }), {});
});

test('no session id in the hook input fails open', () => {
  const { root } = runRepo('S1');
  const r = run({ tool_name: 'AskUserQuestion', transcript_path: reported(), cwd: root, tool_input: { questions: [{ header: '아무거나' }] } });
  assert.deepStrictEqual(r, {});
});

test('both problems at once are reported together', () => {
  const { root } = runRepo('S1');
  const r = run({
    tool_name: 'AskUserQuestion',
    transcript_path: transcript([user('해줘'), toolResult()]),
    session_id: 'S1',
    cwd: root,
    tool_input: { questions: [{ header: '다음 단계' }] },
  });
  assert.ok(denied(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /보고가 먼저/);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /승인된 실행이 열려 있다/);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

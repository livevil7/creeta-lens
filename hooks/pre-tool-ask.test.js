#!/usr/bin/env node
/**
 * Lens - pre-tool-ask hook tests (subprocess, node assert only).
 *
 * Pins: a question with no report in front of it is denied; a question that
 * follows a real report passes; an earlier report does not cover a question that
 * comes after more tool calls; any unreadable transcript fails open.
 * v3.48: the transcript is written asynchronously — when the call being judged
 * (`tool_use_id`) is not in it yet, there is no verdict (allow).
 * All transcripts here are synthetic, the "1,835-char report" one included: it only
 * copies the line layout of a real one (2a412ea0 lines 495~497), never its content.
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

const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ask-store-'));

function run(payload, env = {}) {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: {
      ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_HOOK_INPUT: '', LENS_ASK_GUARD: '',
      LENS_SESSION_STORE: STORE, CLAUDE_CODE_SESSION_ID: '', ...env,
    },
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

// ── v3.48 — the transcript is written asynchronously (B1) ─────────
// Synthetic, but shaped like a real transcript (2a412ea0 lines 495~497): the
// thinking, text and tool_use of ONE message are separate lines sharing a
// message.id, and an `attachment` line can sit between the tool result and the
// reply. The hook input carries `tool_use_id` of the call being judged.

console.log('\n  -- 기록 지연 --');

const ASK_ID = 'toolu_01TESTaskUserQuestion';
const part = (msgId, block) => ({ type: 'assistant', message: { id: msgId, model: 'claude-opus-5', role: 'assistant', content: [block] } });
const attachment = () => ({ type: 'attachment', attachment: { type: 'hook_additional_context', content: ['…'] } });
const LONG_REPORT = `${REPORT} `.repeat(40).slice(0, 1835);
const before = () => [
  user('해줘'),
  part('msg_1', { type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: {} }),
  toolResult(),
  attachment(),
];
const askLine = () => part('msg_2', { type: 'tool_use', id: ASK_ID, name: 'AskUserQuestion', input: {} });
const askNow = t => run({ tool_name: 'AskUserQuestion', transcript_path: t, tool_use_id: ASK_ID });

test('a 1,835-char report written on its own line before the question passes', () => {
  const t = transcript([...before(), part('msg_2', { type: 'thinking', thinking: '…' }), part('msg_2', { type: 'text', text: LONG_REPORT }), askLine()]);
  assert.deepStrictEqual(askNow(t), {});
});

test('the current call is not in the transcript yet → no verdict: allow, no reason', () => {
  const t = transcript(before()); // neither the report nor the question has been written
  assert.deepStrictEqual(askNow(t), {});
});

test('the current call is in the transcript with no report before it → denied', () => {
  const t = transcript([...before(), part('msg_2', { type: 'thinking', thinking: '…' }), askLine()]);
  const r = askNow(t);
  assert.ok(denied(r), JSON.stringify(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /보고가 먼저/);
});

test('a line written after the current call (a parallel tool result) does not cut the report off', () => {
  const t = transcript([
    ...before(),
    part('msg_2', { type: 'text', text: LONG_REPORT }),
    part('msg_2', { type: 'tool_use', id: 'toolu_read', name: 'Read', input: {} }),
    askLine(),
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_read', content: 'ok' }] } },
  ]);
  assert.deepStrictEqual(askNow(t), {});
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

test('the refusal gives a way out for a cancelled run: the exact lens-gate close call and the kill switch', () => {
  // its own session — the index still lists S1 runs left open by the other tests
  const { root } = runRepo('S4');
  const reason = ask('작업 완료 — 정리', { cwd: root, session: 'S4' }).hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /lens-gate\.js" close 2026-09-14-x --root "[^"]+"/);
  assert.match(reason, /LENS_ASK_GUARD=0/);
  // B3 — a typed answer is a confirmation too; the refusal says how to record it.
  assert.match(reason, /lens-gate\.js" evidence 2026-09-14-x /);
  assert.match(reason, /--confirmed-by 대표/);
  // …and the command it prints actually closes the run.
  const [, cli, scope, closeRoot] = reason.match(/node "([^"]+lens-gate\.js)" close (\S+) --root "([^"]+)"/);
  execFileSync(process.execPath, [cli, 'close', scope, '--root', closeRoot]);
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

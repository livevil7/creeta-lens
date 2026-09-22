#!/usr/bin/env node
/**
 * Lens — pre-tool-plan-doc hook (planner-model gate) tests.
 *
 * The defect this gate exists for, measured in the owner's session 2026-09-15:
 * an Opus session wrote the plan for an irreversible 443,680-row reclassification
 * and recorded the violation in its own frontmatter (`planner_model: opus-5
 * (세션 자체)`). The check that existed only asked whether that line was present —
 * a field the author fills in cannot police the author.
 *
 * Run: node hooks/pre-tool-plan-doc.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.join(__dirname, '..');
const HOOK = path.join(__dirname, 'pre-tool-plan-doc.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

/** A transcript whose last assistant turn ran on `model`. */
function transcript(model) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plan-')), 't.jsonl');
  const entries = [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '계획 세워줘' }] } },
    { type: 'assistant', message: { id: 'm', model, content: [{ type: 'text', text: '쓰겠습니다' }] } },
  ];
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return file;
}

/** A repo with a plan doc; returns { root, plan }. */
function repo(body, { agents = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plan-repo-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'tasks'), { recursive: true });
  const plan = path.join(root, 'docs', 'tasks', '2026-09-16-x.md');
  fs.writeFileSync(plan, body);
  if (agents) {
    fs.mkdirSync(path.join(root, '.lens'), { recursive: true });
    fs.writeFileSync(path.join(root, '.lens', 'agent-dashboard.json'), JSON.stringify({ agents }));
  }
  return { root, plan };
}

// The session store lives in a temp folder; the real session id of the shell
// running these tests must not leak into payloads that carry none.
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plan-store-'));

function run(payload, env = {}) {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: {
      ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_HOOK_INPUT: '', LENS_PLANNER_GATE: '',
      LENS_SESSION_STORE: STORE, CLAUDE_CODE_SESSION_ID: '', ...env,
    },
  }).toString().trim();
  return JSON.parse(out || '{}');
}

const denied = r => r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny';
const write = (plan, model, extra = {}) => run({
  tool_name: 'Write',
  tool_input: { file_path: plan, content: extra.content },
  transcript_path: extra.transcript === null ? undefined : transcript(model),
  cwd: extra.cwd,
});

const DRAFT = '---\nplan_id: 2026-09-16-x\nkind: 개선\nstatus: draft\n---\n\n# 계획\n';

console.log('\n[Lens] pre-tool-plan-doc tests\n');

test('최상위가 아닌 모델이 계획서를 쓰면 거부한다', () => {
  const { plan } = repo(DRAFT);
  const r = write(plan, 'claude-opus-5', { content: DRAFT });
  assert.ok(denied(r), JSON.stringify(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /fable/);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /컨텍스트를 통째로/);
});

test('최상위 모델(fable) 세션은 통과한다', () => {
  const { plan } = repo(DRAFT);
  assert.deepStrictEqual(write(plan, 'claude-fable-5-1', { content: DRAFT }), {});
});

test('fable 위임 기록이 있으면 통과한다 (에이전트 대시보드)', () => {
  const { root, plan } = repo(DRAFT, { agents: [{ id: 'a1', model: 'fable', status: 'running' }] });
  assert.deepStrictEqual(write(plan, 'claude-opus-5', { content: DRAFT, cwd: root }), {});
});

test('sonnet 만 띄운 세션은 위임으로 치지 않는다', () => {
  const { root, plan } = repo(DRAFT, { agents: [{ id: 'a1', model: 'sonnet', status: 'running' }] });
  assert.ok(denied(write(plan, 'claude-opus-5', { content: DRAFT, cwd: root })));
});

test('승인된 계획서의 진행 갱신은 막지 않는다', () => {
  const body = DRAFT.replace('status: draft', 'status: executing');
  const { plan } = repo(body);
  assert.deepStrictEqual(write(plan, 'claude-opus-5', { content: body }), {});
});

test('조사보고는 계획서가 아니다 — 통과', () => {
  const body = DRAFT.replace('kind: 개선', 'kind: 조사보고');
  const { plan } = repo(body);
  assert.deepStrictEqual(write(plan, 'claude-opus-5', { content: body }), {});
});

test('Edit 는 디스크의 frontmatter 로 판정한다', () => {
  const { plan } = repo(DRAFT.replace('status: draft', 'status: approved'));
  const r = run({ tool_name: 'Edit', tool_input: { file_path: plan }, transcript_path: transcript('claude-opus-5') });
  assert.deepStrictEqual(r, {});
});

test('docs/tasks 밖의 파일은 건드리지 않는다', () => {
  const { root } = repo(DRAFT);
  const other = path.join(root, 'src', 'a.ts');
  fs.mkdirSync(path.dirname(other), { recursive: true });
  fs.writeFileSync(other, 'x');
  assert.deepStrictEqual(run({ tool_name: 'Write', tool_input: { file_path: other, content: 'x' }, transcript_path: transcript('claude-opus-5') }), {});
});

test('대화 기록이 없으면 통과시킨다 (fail-open)', () => {
  const { plan } = repo(DRAFT);
  assert.deepStrictEqual(run({ tool_name: 'Write', tool_input: { file_path: plan, content: DRAFT } }), {});
});

test('LENS_PLANNER_GATE=0 이면 끈다', () => {
  const { plan } = repo(DRAFT);
  const r = run({ tool_name: 'Write', tool_input: { file_path: plan, content: DRAFT }, transcript_path: transcript('claude-opus-5') }, { LENS_PLANNER_GATE: '0' });
  assert.deepStrictEqual(r, {});
});

// ── v3.48 — subagents and the session store (E1 · E2 · E3 · E6) ──
// Layout measured on this machine 2026-09-22: the main transcript is
// `<dir>/<session>.jsonl`, a subagent's is `<dir>/<session>/subagents/agent-<agent_id>.jsonl`,
// and a subagent's hook call carries `agent_id` with the MAIN transcript_path.

console.log('\n  -- 서브에이전트 · 세션 저장소 --');

const assistantLine = model => ({ type: 'assistant', message: { id: 'm', model, role: 'assistant', content: [{ type: 'text', text: '쓰겠습니다' }] } });

/** Main transcript `<dir>/<sid>.jsonl` on `model`, plus `{ agentId: [models…] }` subagent transcripts. */
function session(sid, model, subagents = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plan-sess-'));
  const main = path.join(dir, `${sid}.jsonl`);
  fs.writeFileSync(main, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '계획 세워줘' }] } },
    assistantLine(model),
  ].map(e => JSON.stringify(e)).join('\n') + '\n');
  for (const [agentId, models] of Object.entries(subagents)) {
    const file = path.join(dir, sid, 'subagents', `agent-${agentId}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = [{ type: 'user', isSidechain: true, agentId, sessionId: sid, message: { role: 'user', content: '계획서 작성' } }]
      .concat([].concat(models).map(assistantLine));
    fs.writeFileSync(file, lines.map(e => JSON.stringify(e)).join('\n') + '\n');
  }
  return main;
}

/** This session's dashboard in the session store (what pre-tool-task writes). */
function board(sid, agents) {
  fs.mkdirSync(path.join(STORE, sid), { recursive: true });
  fs.writeFileSync(path.join(STORE, sid, 'dashboard.json'), JSON.stringify({ session: sid, agents }));
}

const writeAs = (plan, { sid, t, agentId, cwd }) => run({
  tool_name: 'Write',
  tool_input: { file_path: plan, content: DRAFT },
  transcript_path: t,
  session_id: sid,
  agent_id: agentId,
  cwd,
});

test('E1: fable 서브에이전트가 쓰면 부모가 opus 여도 통과한다 (서브에이전트 기록의 모델)', () => {
  const { plan } = repo(DRAFT);
  const t = session('s-e1', 'claude-opus-5', { a2df502b97f9845c5: 'claude-fable-5-1' });
  assert.deepStrictEqual(writeAs(plan, { sid: 's-e1', t, agentId: 'a2df502b97f9845c5' }), {});
});

test('E1: 서브에이전트 기록이 읽히면 그 모델로 판정한다 — opus 서브에이전트는 부모 fable·위임 기록과 무관하게 거부', () => {
  const { plan } = repo(DRAFT);
  const t = session('s-e1b', 'claude-fable-5-1', { a0opus: 'claude-opus-5' });
  board('s-e1b', [{ id: 'x', model: 'fable', status: 'running' }]);
  const r = writeAs(plan, { sid: 's-e1b', t, agentId: 'a0opus' });
  assert.ok(denied(r), JSON.stringify(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /claude-opus-5/);
});

test('E1: 서브에이전트 기록 끝의 <synthetic>(API 오류 줄)은 모델이 아니다', () => {
  const { plan } = repo(DRAFT);
  const t = session('s-syn', 'claude-opus-5', { a0syn: ['claude-fable-5-1', '<synthetic>'] });
  assert.deepStrictEqual(writeAs(plan, { sid: 's-syn', t, agentId: 'a0syn' }), {});
});

test('E1 폴백: 서브에이전트 기록이 없어도 이 세션의 fable 위임(진행 중)이 있으면 통과', () => {
  const { plan } = repo(DRAFT);
  const t = session('s-fb', 'claude-opus-5');
  board('s-fb', [{ id: 'p', model: 'fable', status: 'launched' }]);
  assert.deepStrictEqual(writeAs(plan, { sid: 's-fb', t, agentId: 'a0missing' }), {});
});

test('E1 폴백: 서브에이전트 기록도 위임 기록도 없으면 거부 (부모 모델로 대신 판정하지 않는다)', () => {
  const { plan } = repo(DRAFT);
  const t = session('s-none', 'claude-fable-5-1');
  const r = writeAs(plan, { sid: 's-none', t, agentId: 'a0missing' });
  assert.ok(denied(r), JSON.stringify(r));
});

test('E2: 메인이 opus 여도 이 세션에서 띄운 fable 이 아직 launched 면 통과', () => {
  const { plan } = repo(DRAFT);
  const t = session('s-e2', 'claude-opus-5');
  board('s-e2', [{ id: 'p', model: 'claude-fable-5-1', status: 'launched' }]);
  assert.deepStrictEqual(writeAs(plan, { sid: 's-e2', t }), {});
});

test('E3: 다른 세션 저장소의 fable 위임은 자격이 아니다', () => {
  const { plan } = repo(DRAFT);
  board('s-other', [{ id: 'p', model: 'fable', status: 'done' }]);
  const r = writeAs(plan, { sid: 's-mine', t: session('s-mine', 'claude-opus-5') });
  assert.ok(denied(r), JSON.stringify(r));
});

test('E3: error 로 끝난 fable 위임은 자격이 아니다', () => {
  const { plan } = repo(DRAFT);
  board('s-err', [{ id: 'p', model: 'fable', status: 'error' }]);
  const r = writeAs(plan, { sid: 's-err', t: session('s-err', 'claude-opus-5') });
  assert.ok(denied(r), JSON.stringify(r));
});

test('E3: 세션 id 가 있으면 레포 .lens 현황판(복사된 위임 기록)은 읽지 않는다', () => {
  const { root, plan } = repo(DRAFT, { agents: [{ id: 'mirrored', model: 'fable', status: 'done' }] });
  const r = writeAs(plan, { sid: 's-repo', t: session('s-repo', 'claude-opus-5'), cwd: root });
  assert.ok(denied(r), JSON.stringify(r));
});

test('E6: 거부 문구가 Agent 를 못 부르는 컨텍스트의 탈출구(LENS_PLANNER_GATE=0 + planner_model 사유)를 알려 준다', () => {
  const { plan } = repo(DRAFT);
  const r = write(plan, 'claude-opus-5', { content: DRAFT });
  assert.ok(denied(r));
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /Agent 를 부를 수 없는 컨텍스트면 `LENS_PLANNER_GATE=0` 으로 끄고 계획서 `planner_model` 에 사유를 적어라/);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

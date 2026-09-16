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

function run(payload, env = {}) {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_HOOK_INPUT: '', LENS_PLANNER_GATE: '', ...env },
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

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

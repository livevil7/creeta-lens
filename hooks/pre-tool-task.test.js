#!/usr/bin/env node
/**
 * Lens — pre-tool-task hook invariants (no external deps, node assert only).
 *
 * This file exists because of a defect that shipped inside the change that
 * created it (v3.38, caught by the Grok review lane): the /cc TOP-tier cap was
 * tightened from 3 to 2 in skills/cc/SKILL.md and in docs/rules/harness-rules.md
 * §4.1, and the constant the hook actually enforces stayed at 3. The warning
 * would then have fired on the 4th fable spawn while the 3rd — the one now over
 * budget — passed in silence.
 *
 * That is precisely the failure this hook was built to prevent, one level up: a
 * cap that lives only in prose is not a cap. So the number is pinned to the SoT
 * document rather than merely written down twice.
 *
 * Run: node hooks/pre-tool-task.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOOK = fs.readFileSync(path.join(__dirname, 'pre-tool-task.js'), 'utf-8');
const RULES = fs.readFileSync(path.join(ROOT, 'docs', 'rules', 'harness-rules.md'), 'utf-8');
const SKILL = fs.readFileSync(path.join(ROOT, 'skills', 'cc', 'SKILL.md'), 'utf-8');

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

console.log('\n== pre-tool-task: TOP 상한 드리프트 ==');

/** The cap the hook enforces. */
const hookCap = () => {
  const m = HOOK.match(/const\s+TOP_CAP\s*=\s*(\d+)/);
  assert.ok(m, 'TOP_CAP 상수를 찾을 수 없다');
  return Number(m[1]);
};

/** The cap §4.1 declares for /cc. Written as "`/cc` **2** · `/cp deep` 2". */
const rulesCap = () => {
  const line = RULES.split('\n').find(l => l.includes('TOP 상한 (명령 1회 기준)'));
  assert.ok(line, 'harness-rules §4.1 의 TOP 상한 줄을 찾을 수 없다');
  const m = line.match(/\/cc`?\s*\*{0,2}(\d+)/);
  assert.ok(m, `상한 줄에서 /cc 숫자를 못 읽었다: ${line}`);
  return Number(m[1]);
};

test('훅의 TOP_CAP 이 harness-rules §4.1 의 /cc 상한과 같다', () => {
  assert.strictEqual(hookCap(), rulesCap());
});

test('/cc SKILL.md 의 TOP 상한 표기도 같은 숫자다', () => {
  const m = SKILL.match(/\*\*TOP 상한:\s*(\d+)\*\*/);
  assert.ok(m, 'SKILL.md 에서 "TOP 상한: N" 을 찾을 수 없다');
  assert.strictEqual(Number(m[1]), hookCap());
});

// The tier is a relative position, not a name that should be duplicated per
// file; if the enum moves, it moves in one place.
test('TOP 티어는 Agent enum 최상위 슬러그 하나로만 적혀 있다', () => {
  assert.match(HOOK, /const\s+TOP_TIER\s*=\s*'[a-z0-9-]+'/);
});

// v3.42: the missing-model warning lost twice in one turn (owner's session,
// 2026-09-15), so it became a refusal. The fix is one argument — refusing costs
// the run nothing, and the cap warning stays advisory because refusing *there*
// would strand a run the user already approved.
test('model 없는 spawn 은 거부한다 (v3.42)', () => {
  assert.match(HOOK, /permissionDecision:\s*'deny'/, '훅이 model 없는 spawn 을 거부하지 않는다');
  assert.match(HOOK, /function modelDenial/);
});

test('TOP 상한 초과는 거부가 아니라 경고다', () => {
  const notice = HOOK.slice(HOOK.indexOf('function modelNotice'), HOOK.indexOf('function main'));
  assert.ok(!/permissionDecision/.test(notice), '상한 경고가 거부로 바뀌어 있다');
});

test('끄는 방법이 있다 (LENS_MODEL_GATE)', () => {
  assert.match(HOOK, /LENS_MODEL_GATE/);
});

// ── v3.48: the real hook, official PreToolUse payloads (subprocess) ──
// E4: 313 Workflow agents in one session all ran on the session model — the
// script's agent() calls never passed the model gate.

const os = require('os');
const { execFileSync } = require('child_process');

const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-pretask-store-'));
const ENV = { ...process.env, LENS_SESSION_STORE: STORE, CLAUDE_HOOK_INPUT: '', CLAUDE_PROJECT_DIR: STORE };
delete ENV.CLAUDE_CODE_SESSION_ID;
delete ENV.LENS_MODEL_GATE;

const runHook = (payload, env = ENV) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'pre-tool-task.js')], {
  input: JSON.stringify(payload), env, cwd: STORE, stdio: ['pipe', 'pipe', 'pipe'],
}).toString().trim() || '{}');
const wf = (sid, toolInput, id = 'toolu_wf') => ({
  session_id: sid, cwd: STORE, hook_event_name: 'PreToolUse', tool_name: 'Workflow', tool_input: toolInput, tool_use_id: id,
});
const spawn = (sid, model, id) => ({
  session_id: sid, cwd: STORE, hook_event_name: 'PreToolUse', tool_name: 'Agent',
  tool_input: { description: `일 ${id}`, prompt: 'x', model, subagent_type: 'general-purpose' }, tool_use_id: id,
});
const decision = out => out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
const reason = out => String((out.hookSpecificOutput && out.hookSpecificOutput.permissionDecisionReason) || '');
const ctx = out => String((out.hookSpecificOutput && out.hookSpecificOutput.additionalContext) || '');
const META = "export const meta = { name: 'probe', description: 'x' }\n";

console.log('\n== pre-tool-task: 실제 훅 호출 (v3.48) ==');

test('Workflow 스크립트의 agent( 에 model 이 없으면 거부하고 위치를 댄다', () => {
  const script = `${META}phase('A')\nconst r = await agent('model 이라는 단어가 프롬프트에만 있다', { label: 'a' })\n`;
  const out = runHook(wf('pt-1', { script }));
  assert.strictEqual(decision(out), 'deny');
  assert.match(reason(out), /3행/);
});

test('모든 agent( 에 model 이 있으면 통과, 현황판에 tool_use_id 와 이름이 남는다', () => {
  const script = `${META}await agent('a', { model: 'sonnet' })\nawait agent("b", {label: 'x', model: 'haiku'})\n`;
  const out = runHook(wf('pt-2', { script }, 'toolu_wf2'));
  assert.notStrictEqual(decision(out), 'deny');
  const board = JSON.parse(fs.readFileSync(path.join(STORE, 'pt-2', 'dashboard.json'), 'utf-8'));
  const e = board.agents.find(a => a.toolUseId === 'toolu_wf2');
  assert.ok(e, 'entry with tool_use_id');
  assert.strictEqual(e.name, 'probe');
  assert.strictEqual(e.tool, 'Workflow');
});

test('따옴표 키 {"model": …} 도 model 로 인정, 프롬프트 문자열 안의 "model": 은 인정하지 않는다', () => {
  const quoted = `${META}await agent('p', {"model":"sonnet"})\nawait agent('q', { 'model': 'haiku' })\n`;
  assert.notStrictEqual(decision(runHook(wf('pt-q1', { script: quoted }))), 'deny');
  const inPrompt = `${META}await agent('JSON 예시 {"model": "x"} 를 설명하라', { label: 'a' })\n`;
  assert.strictEqual(decision(runHook(wf('pt-q2', { script: inPrompt }))), 'deny');
});

test('agent( 61개 → 경고(차단 아님)', () => {
  const script = META + Array.from({ length: 61 }, (_, i) => `await agent('p${i}', { model: 'haiku' })`).join('\n');
  const out = runHook(wf('pt-3', { script }));
  assert.notStrictEqual(decision(out), 'deny');
  assert.match(ctx(out), /61개/);
});

// pipeline()/.map 안의 agent() 는 기본 패턴이다 — 정적 개수가 60 미만이면 경고하지 않는다.
test('반복문 안 agent( 라도 정적 개수가 60 미만이면 경고 없이 통과', () => {
  const script = `${META}await pipeline(ITEMS, it => agent(it.p, { model: 'sonnet' }))\nawait parallel(TASKS.map(t => () => agent(t.prompt, { model: t.model })))\n`;
  const out = runHook(wf('pt-4', { script }));
  assert.notStrictEqual(decision(out), 'deny');
  assert.strictEqual(ctx(out), '');
});

test('옵션을 변수로 넘기면 판단 불가 → 거부 아님', () => {
  const out = runHook(wf('pt-5', { script: `${META}await agent(p, opts)\n` }));
  assert.notStrictEqual(decision(out), 'deny');
});

test('script 없이 이름·scriptPath 로 부르는 저장 워크플로는 건너뛴다', () => {
  assert.notStrictEqual(decision(runHook(wf('pt-6', { name: 'saved-flow' }))), 'deny');
  assert.notStrictEqual(decision(runHook(wf('pt-6', { scriptPath: 'C:/x/flow.js' }, 'toolu_wf6b'))), 'deny');
});

test('LENS_MODEL_GATE=0 이면 Workflow 도 거부하지 않는다', () => {
  const out = runHook(wf('pt-7', { script: `${META}await agent('a')\n` }), { ...ENV, LENS_MODEL_GATE: '0' });
  assert.notStrictEqual(decision(out), 'deny');
});

test('model 없는 Agent spawn 은 여전히 거부한다', () => {
  assert.strictEqual(decision(runHook(spawn('pt-8', undefined, 'toolu_a0'))), 'deny');
});

test('TOP 상한은 이 세션 현황판만 센다 — 다른 세션의 fable 은 세지 않는다', () => {
  runHook(spawn('pt-top-a', 'fable', 't1'));
  runHook(spawn('pt-top-a', 'fable', 't2'));
  assert.ok(!/TOP 티어/.test(ctx(runHook(spawn('pt-top-b', 'fable', 't3')))), '다른 세션의 1번째 fable 에 상한 경고');
  assert.match(ctx(runHook(spawn('pt-top-a', 'fable', 't4'))), /3번째/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

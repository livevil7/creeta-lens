#!/usr/bin/env node
/**
 * Lens - background-work tracking tests (subprocess, official payloads, node assert only).
 *
 * WHY: every background Workflow was written as "done (102ms). All 1 agents
 * complete" (24 of 24, D1) under the name "unnamed-task" (D2); launched agents
 * never resolved, so "13 launched(미확정)" piled up with a 560-char notice 81
 * times (C4); and spawns were matched by description, cross-wiring parallel
 * spawns (D4). Hooks run as the harness runs them: pre → post (or --failed) →
 * SubagentStop, each a subprocess with the payload on stdin.
 *
 * Run: node hooks/post-tool-task.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PRE = path.join(__dirname, 'pre-tool-task.js');
const POST = path.join(__dirname, 'post-tool-task.js');
const STOP = path.join(__dirname, 'subagent-stop.js');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-task-store-'));
// cwd and CLAUDE_PROJECT_DIR point at a scratch folder: a hook that falls back to
// the legacy repo-level path must never write into the real repo.
const ENV = { ...process.env, LENS_SESSION_STORE: STORE, CLAUDE_HOOK_INPUT: '', CLAUDE_PROJECT_DIR: STORE };
delete ENV.CLAUDE_CODE_SESSION_ID;
delete ENV.LENS_MODEL_GATE;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const run = (hook, payload, args = []) => JSON.parse(execFileSync(process.execPath, [hook, ...args], {
  input: JSON.stringify(payload), env: ENV, cwd: STORE, stdio: ['pipe', 'pipe', 'pipe'],
}).toString().trim() || '{}');
const board = sid => JSON.parse(fs.readFileSync(path.join(STORE, sid, 'dashboard.json'), 'utf-8'));
const entry = (sid, toolUseId) => board(sid).agents.find(a => a.toolUseId === toolUseId);
const ctx = out => String((out.hookSpecificOutput && out.hookSpecificOutput.additionalContext) || '');

const base = sid => ({ session_id: sid, transcript_path: '/x/t.jsonl', cwd: STORE, permission_mode: 'default' });
const pre = (sid, id, tool, toolInput) => run(PRE, { ...base(sid), hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, tool_use_id: id });
const post = (sid, id, tool, toolInput, response, args) => run(POST, { ...base(sid), hook_event_name: 'PostToolUse', tool_name: tool, tool_input: toolInput, tool_response: response, tool_use_id: id }, args);

// Real envelopes (ea3dcf2b, 2026-09-21 · this run, 2026-09-22).
const WF_SCRIPT = "export const meta = { name: 'cid-hold-plan-research', description: 'x' }\nawait agent('p', { model: 'sonnet' })\n";
const WF_PROSE = 'Workflow launched in background. Task ID: woq4fil79\nSummary: 조사\nRun ID: wf_f8f6b1e8-48c\n\nYou will be notified when it completes.';
const WF_STRUCT = { status: 'async_launched', taskId: 'woq4fil79', taskType: 'local_workflow', workflowName: 'cid-hold-plan-research', runId: 'wf_f8f6b1e8-48c' };
const AGENT_PROSE = id => `Async agent launched successfully.\nagentId: ${id} (internal ID - do not mention to user.)\nThe agent is working in the background. You will be notified automatically when it completes.\noutput_file: C:\\x\\${id}.output`;
const AGENT_STRUCT = id => ({ status: 'async_launched', isAsync: true, agentId: id, outputFile: `C:\\x\\${id}.output` });
const agentInput = (desc, extra = {}) => ({ description: desc, prompt: 'do it', model: 'sonnet', subagent_type: 'Explore', ...extra });

console.log('\n[Lens] post-tool-task / subagent-stop tests\n');

for (const [label, response] of [['prose', WF_PROSE], ['structured', WF_STRUCT]]) {
  test(`Workflow launch (${label}) → launched, named from meta.name, runId kept`, () => {
    const sid = `wf-${label}`;
    pre(sid, 'tu_wf', 'Workflow', { script: WF_SCRIPT });
    const out = post(sid, 'tu_wf', 'Workflow', { script: WF_SCRIPT }, response);
    const e = entry(sid, 'tu_wf');
    assert.strictEqual(e.status, 'launched');
    assert.strictEqual(e.name, 'cid-hold-plan-research');
    assert.strictEqual(e.runId, 'wf_f8f6b1e8-48c');
    assert.ok(!/All \d+ agents complete/.test(ctx(out)));
    assert.ok(/미확정 1건/.test(ctx(out)), ctx(out));
    assert.ok(!ctx(out).includes('\n'), 'launch notice is one line');
  });
}

test('a Workflow whose result shows no launch (denied/failed) stays launched, not done', () => {
  pre('wf-unknown', 'tu_wfu', 'Workflow', { script: WF_SCRIPT });
  post('wf-unknown', 'tu_wfu', 'Workflow', { script: WF_SCRIPT }, 'Error: something odd');
  assert.strictEqual(entry('wf-unknown', 'tu_wfu').status, 'launched');
});

for (const [label, response] of [['prose', AGENT_PROSE('a48fbee2a5f8fefd5')], ['structured', AGENT_STRUCT('a48fbee2a5f8fefd5')]]) {
  test(`background Agent (${label}) → launched with the harness agentId; SubagentStop → done`, () => {
    const sid = `ag-${label}`;
    pre(sid, 'tu_a1', 'Agent', agentInput('조사'));
    post(sid, 'tu_a1', 'Agent', agentInput('조사'), response);
    assert.strictEqual(entry(sid, 'tu_a1').agentId, 'a48fbee2a5f8fefd5');
    assert.strictEqual(entry(sid, 'tu_a1').status, 'launched');
    const out = run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', stop_hook_active: false, agent_id: 'a48fbee2a5f8fefd5', agent_type: 'Explore', agent_transcript_path: '/x/t/subagents/agent-a48fbee2a5f8fefd5.jsonl', last_assistant_message: 'done', background_tasks: [] });
    assert.deepStrictEqual(out, {});
    assert.strictEqual(entry(sid, 'tu_a1').status, 'done');
  });
}

test('SubagentStop with an unknown id resolves the oldest id-less launch of that type', () => {
  const sid = 'ag-fallback';
  pre(sid, 'tu_f1', 'Agent', agentInput('첫째', { run_in_background: true }));
  post(sid, 'tu_f1', 'Agent', agentInput('첫째', { run_in_background: true }), 'launched'); // no agentId in the text
  pre(sid, 'tu_f2', 'Agent', agentInput('둘째', { run_in_background: true }));
  post(sid, 'tu_f2', 'Agent', agentInput('둘째', { run_in_background: true }), 'launched');
  run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'zzz999', agent_type: 'Explore', agent_transcript_path: '/x/t/subagents/agent-zzz999.jsonl' });
  assert.strictEqual(entry(sid, 'tu_f1').status, 'done');
  assert.strictEqual(entry(sid, 'tu_f2').status, 'launched');
});

test('a resolved agent stopping again (resumed by SendMessage) does not resolve another launch', () => {
  const sid = 'ag-resume';
  pre(sid, 'tu_r1', 'Agent', agentInput('재개될 일'));
  post(sid, 'tu_r1', 'Agent', agentInput('재개될 일'), AGENT_STRUCT('r111'));
  pre(sid, 'tu_r2', 'Agent', agentInput('식별자 없는 일', { run_in_background: true }));
  post(sid, 'tu_r2', 'Agent', agentInput('식별자 없는 일', { run_in_background: true }), 'launched');
  const stop = { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'r111', agent_type: 'Explore' };
  run(STOP, stop);
  assert.strictEqual(entry(sid, 'tu_r1').status, 'done');
  run(STOP, stop);
  assert.strictEqual(entry(sid, 'tu_r2').status, 'launched');
});

test('a fallback-resolved id is remembered — the same agent_id stopping twice leaves other launches alone', () => {
  const sid = 'ag-fallback-twice';
  pre(sid, 'tu_t1', 'Agent', agentInput('첫째', { run_in_background: true }));
  post(sid, 'tu_t1', 'Agent', agentInput('첫째', { run_in_background: true }), 'launched');
  pre(sid, 'tu_t2', 'Agent', agentInput('둘째', { run_in_background: true }));
  post(sid, 'tu_t2', 'Agent', agentInput('둘째', { run_in_background: true }), 'launched');
  const stop = { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'zz77', agent_type: 'Explore' };
  run(STOP, stop);
  assert.strictEqual(entry(sid, 'tu_t1').status, 'done');
  assert.strictEqual(entry(sid, 'tu_t1').agentId, 'zz77');
  run(STOP, stop);
  assert.strictEqual(entry(sid, 'tu_t2').status, 'launched');
});

test('SubagentStop before PostToolUse (early stop) → the later async envelope records done', () => {
  const sid = 'ag-early';
  pre(sid, 'tu_e1', 'Agent', agentInput('빨리 끝남'));
  run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'e555', agent_type: 'Explore' });
  assert.strictEqual(entry(sid, 'tu_e1').status, 'running', 'fixture: the entry is still running when the stop lands');
  post(sid, 'tu_e1', 'Agent', agentInput('빨리 끝남'), AGENT_STRUCT('e555'));
  assert.strictEqual(entry(sid, 'tu_e1').status, 'done');
  assert.ok(!(board(sid).earlyStops || []).some(s => s.agentId === 'e555'), 'the early stop is consumed');
});

test('agent_id with the "agent-" prefix (SubagentStart spelling) resolves the same launch', () => {
  const sid = 'ag-prefix';
  pre(sid, 'tu_px', 'Agent', agentInput('접두사'));
  post(sid, 'tu_px', 'Agent', agentInput('접두사'), AGENT_STRUCT('p999'));
  run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'agent-p999', agent_type: 'Explore' });
  assert.strictEqual(entry(sid, 'tu_px').status, 'done');
});

test('SubagentStop from an internal agent or a Workflow inner agent resolves nothing', () => {
  const sid = 'ag-guard';
  pre(sid, 'tu_g1', 'Agent', agentInput('백그라운드', { run_in_background: true }));
  post(sid, 'tu_g1', 'Agent', agentInput('백그라운드', { run_in_background: true }), 'launched');
  pre(sid, 'tu_gw', 'Workflow', { script: WF_SCRIPT });
  post(sid, 'tu_gw', 'Workflow', { script: WF_SCRIPT }, WF_STRUCT);
  run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'int1', agent_type: '' });
  run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'wfa1', agent_type: 'Explore', agent_transcript_path: '/x/t/subagents/workflows/wf_f8f6b1e8-48c/agent-wfa1.jsonl' });
  assert.strictEqual(entry(sid, 'tu_g1').status, 'launched');
  assert.strictEqual(entry(sid, 'tu_gw').status, 'launched');
});

test('PostToolUseFailure (--failed) → error on the entry with that tool_use_id', () => {
  const sid = 'ag-failed';
  pre(sid, 'tu_x1', 'Agent', agentInput('실패할 일'));
  const out = run(POST, { ...base(sid), hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_input: agentInput('실패할 일'), tool_use_id: 'tu_x1', error: 'boom', is_interrupt: false }, ['--failed']);
  assert.strictEqual(entry(sid, 'tu_x1').status, 'error');
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PostToolUseFailure');
});

test('two parallel spawns with the same description are linked by tool_use_id', () => {
  const sid = 'ag-parallel';
  pre(sid, 'tu_p1', 'Agent', agentInput('같은 설명'));
  pre(sid, 'tu_p2', 'Agent', agentInput('같은 설명'));
  post(sid, 'tu_p1', 'Agent', agentInput('같은 설명', { run_in_background: false }), 'report text');
  assert.strictEqual(entry(sid, 'tu_p1').status, 'done');
  assert.strictEqual(entry(sid, 'tu_p2').status, 'running');
  post(sid, 'tu_p2', 'Agent', agentInput('같은 설명'), AGENT_STRUCT('b222'));
  assert.strictEqual(entry(sid, 'tu_p2').status, 'launched');
  assert.strictEqual(entry(sid, 'tu_p1').status, 'done');
});

test('"All N agents complete" only once nothing is launched; the notice repeats only on change', () => {
  const sid = 'ag-all';
  pre(sid, 'tu_b1', 'Agent', agentInput('백그라운드'));
  post(sid, 'tu_b1', 'Agent', agentInput('백그라운드'), AGENT_STRUCT('c333'));
  pre(sid, 'tu_s1', 'Agent', agentInput('전경1'));
  const mid = post(sid, 'tu_s1', 'Agent', agentInput('전경1', { run_in_background: false }), 'report');
  assert.ok(!/All \d+ agents complete/.test(ctx(mid)), ctx(mid));
  assert.ok(!/미확정/.test(ctx(mid)), 'count unchanged since the launch notice → no repeat');
  run(STOP, { ...base(sid), hook_event_name: 'SubagentStop', agent_id: 'c333', agent_type: 'Explore' });
  pre(sid, 'tu_s2', 'Agent', agentInput('전경2'));
  const end = post(sid, 'tu_s2', 'Agent', agentInput('전경2', { run_in_background: false }), 'report');
  assert.ok(/All 3 agents complete/.test(ctx(end)), ctx(end));
});

test('another session\'s board is never touched', () => {
  pre('iso-a', 'tu_i1', 'Agent', agentInput('A 일'));
  pre('iso-b', 'tu_i1', 'Agent', agentInput('B 일'));
  post('iso-b', 'tu_i1', 'Agent', agentInput('B 일', { run_in_background: false }), 'report');
  assert.strictEqual(entry('iso-a', 'tu_i1').status, 'running');
  assert.strictEqual(entry('iso-b', 'tu_i1').status, 'done');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Lens - post-tool-progress tests (subprocess, official payloads, node assert only).
 *
 * WHY: the report clock was one repo-level file shared by every session and every
 * worker — "19914초 경과" when the real gap was 985 s, 29 reminders landed in 22
 * worker transcripts (C1), a user message never reset it (C2), and a background
 * Workflow never armed it because the Agent branch swallowed it first (D3).
 *
 * Run: node hooks/post-tool-progress.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'post-tool-progress.js');
const PROMPT_HOOK = path.join(__dirname, '..', 'scripts', 'user-prompt-handler.js');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-progress-store-'));

// cwd and CLAUDE_PROJECT_DIR point at a scratch folder: a hook that falls back to
// the legacy repo-level path must never write into the real repo.
const ENV = { ...process.env, LENS_SESSION_STORE: STORE, CLAUDE_HOOK_INPUT: '', CLAUDE_PROJECT_DIR: STORE };
delete ENV.CLAUDE_CODE_SESSION_ID;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const statePath = sid => path.join(STORE, sid, 'progress.json');
const readState = sid => JSON.parse(fs.readFileSync(statePath(sid), 'utf-8'));
const iso = msAgo => new Date(Date.now() - msAgo).toISOString();
function seed(sid, state) {
  fs.mkdirSync(path.join(STORE, sid), { recursive: true });
  fs.writeFileSync(statePath(sid), JSON.stringify(state, null, 2));
}

const runSync = (payload, hook = HOOK) => JSON.parse(execFileSync(process.execPath, [hook], {
  input: JSON.stringify(payload), env: ENV, cwd: STORE, stdio: ['pipe', 'pipe', 'pipe'],
}).toString().trim() || '{}');

const runAsync = payload => new Promise((resolve, reject) => {
  const child = execFile(process.execPath, [HOOK], { env: ENV, cwd: STORE }, (err, stdout) => {
    if (err) return reject(err);
    resolve(JSON.parse(String(stdout).trim() || '{}'));
  });
  child.stdin.end(JSON.stringify(payload));
});

const poll = sid => ({ session_id: sid, hook_event_name: 'PostToolUse', tool_name: 'TaskOutput', tool_input: { task_id: 't1', block: false }, tool_response: 'running', tool_use_id: 'toolu_poll' });
const reminderSec = out => {
  const text = out && out.hookSpecificOutput && out.hookSpecificOutput.additionalContext;
  const m = String(text || '').match(/마지막 접점 이후 (\d+)초/);
  return m ? Number(m[1]) : null;
};

// Real envelopes (ea3dcf2b, 2026-09-21): the same launch arrives as prose or as a structured result.
const WF_PROSE = 'Workflow launched in background. Task ID: woq4fil79\nSummary: 조사\nTranscript dir: C:\\x\\subagents\\workflows\\wf_f8f6b1e8-48c\nRun ID: wf_f8f6b1e8-48c\n\nYou will be notified when it completes. Use /workflows to watch live progress.';
const WF_STRUCT = { status: 'async_launched', taskId: 'woq4fil79', taskType: 'local_workflow', workflowName: 'cid-hold-plan-research', runId: 'wf_f8f6b1e8-48c', summary: '조사' };
const WF_SCRIPT = "export const meta = { name: 'cid-hold-plan-research', description: 'x' }\nawait agent('p', { model: 'sonnet' })\n";

(async () => {
  console.log('\n[Lens] post-tool-progress tests\n');

  await test('two sessions at once — each reminder counts from its own clock (±2s)', async () => {
    seed('sess-a', { armedAt: iso(900000), lastSignalAt: iso(10000), lastContactAt: iso(300000), lastReminderAt: null, reminders: 0 });
    seed('sess-b', { armedAt: iso(900000), lastSignalAt: iso(10000), lastContactAt: iso(150000), lastReminderAt: null, reminders: 0 });
    const [a, b] = await Promise.all([runAsync(poll('sess-a')), runAsync(poll('sess-b'))]);
    assert.ok(Math.abs(reminderSec(a) - 300) <= 2, `A: ${reminderSec(a)}`);
    assert.ok(Math.abs(reminderSec(b) - 150) <= 2, `B: ${reminderSec(b)}`);
    assert.strictEqual(readState('sess-a').reminders, 1);
    assert.strictEqual(readState('sess-b').reminders, 1);
  });

  await test('a subagent call (agent_id) never touches the main clock — 20 calls', async () => {
    seed('sess-c', { armedAt: iso(900000), lastSignalAt: iso(10000), lastContactAt: iso(300000), lastReminderAt: null, reminders: 0 });
    const before = fs.readFileSync(statePath('sess-c'), 'utf-8');
    for (let i = 0; i < 20; i += 1) {
      assert.deepStrictEqual(runSync({ ...poll('sess-c'), agent_id: 'a48fbee2a5f8fefd5', agent_type: 'Explore' }), {});
    }
    assert.strictEqual(fs.readFileSync(statePath('sess-c'), 'utf-8'), before);
  });

  for (const [label, response] of [['prose', WF_PROSE], ['structured', WF_STRUCT]]) {
    await test(`a real Workflow launch (${label}) arms the clock`, async () => {
      const sid = `sess-wf-${label}`;
      runSync({ session_id: sid, hook_event_name: 'PostToolUse', tool_name: 'Workflow', tool_input: { script: WF_SCRIPT }, tool_response: response, tool_use_id: 'toolu_wf' });
      const s = readState(sid);
      assert.ok(s.armedAt, 'armedAt');
      assert.ok(Date.now() - Date.parse(s.lastSignalAt) < 5000, 'lastSignalAt is now');
    });
  }

  await test('a Workflow that did not launch (denied) does not arm', async () => {
    runSync({ session_id: 'sess-wf-denied', tool_name: 'Workflow', tool_input: { script: WF_SCRIPT }, tool_response: 'Permission denied', tool_use_id: 'toolu_x' });
    const s = fs.existsSync(statePath('sess-wf-denied')) ? readState('sess-wf-denied') : {};
    assert.ok(!s.armedAt);
  });

  await test('a foreground Agent does not arm', async () => {
    runSync({ session_id: 'sess-fg', tool_name: 'Agent', tool_input: { description: 'x', model: 'sonnet', run_in_background: false }, tool_response: 'Async agent launched successfully.\nagentId: abc123', tool_use_id: 'toolu_fg' });
    const s = fs.existsSync(statePath('sess-fg')) ? readState('sess-fg') : {};
    assert.ok(!s.armedAt);
  });

  await test('a user message moves the baseline — the next poll is silent, and later counts from it', async () => {
    seed('sess-d', { armedAt: iso(900000), lastSignalAt: iso(5000), lastContactAt: iso(600000), lastReminderAt: null, reminders: 0 });
    const out = runSync({ session_id: 'sess-d', hook_event_name: 'UserPromptSubmit', prompt: '진행 어때?', cwd: STORE }, PROMPT_HOOK);
    assert.deepStrictEqual(out, {});
    assert.ok(Date.now() - Date.parse(readState('sess-d').lastContactAt) < 5000, 'lastContactAt stamped');
    assert.deepStrictEqual(runSync(poll('sess-d')), {}, 'within 120 s of the user message: silent');
    const s = readState('sess-d');
    s.lastContactAt = iso(130000);
    fs.writeFileSync(statePath('sess-d'), JSON.stringify(s));
    assert.ok(Math.abs(reminderSec(runSync(poll('sess-d'))) - 130) <= 2);
  });

  await test('a reminder stamps lastReminderAt and the next 120 s are silent', async () => {
    seed('sess-e', { armedAt: iso(900000), lastSignalAt: iso(5000), lastContactAt: iso(400000), lastReminderAt: null, reminders: 0 });
    assert.ok(reminderSec(runSync(poll('sess-e'))) >= 398);
    const s = readState('sess-e');
    assert.ok(Date.now() - Date.parse(s.lastReminderAt) < 5000);
    assert.ok(Date.parse(s.lastContactAt) < Date.now() - 390000, 'a reminder is not a contact');
    assert.deepStrictEqual(runSync(poll('sess-e')), {});
  });

  await test('no session id → legacy repo-level file (fallback)', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-progress-legacy-'));
    const env = { ...ENV, CLAUDE_PROJECT_DIR: repo };
    execFileSync(process.execPath, [HOOK], {
      env, cwd: repo, input: JSON.stringify({ cwd: repo, tool_name: 'Bash', tool_input: { command: 'x', run_in_background: true } }), stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(JSON.parse(fs.readFileSync(path.join(repo, '.lens', 'progress-report-state.json'), 'utf-8')).armedAt);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();

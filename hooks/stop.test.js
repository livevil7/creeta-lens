#!/usr/bin/env node
/**
 * Lens - Stop hook tests (subprocess, official Stop payload on stdin).
 *
 * WHY: 3.47 blocked every turn that ended while a worker was still running
 * (2a412ea0: 6/6 blocks) and printed its release notice to the user 52 times
 * on 09-21. These tests replay the documented Stop input — `background_tasks`,
 * `stop_hook_active` — against the real hook process and pin the new contract.
 *
 * Run: node hooks/stop.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'stop.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-stop-'));
process.env.LENS_LEDGER_INDEX = path.join(TMP, 'active-ledgers.json');
const ledger = require(path.join(PLUGIN_ROOT, 'lib', 'gate-ledger'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

let counter = 0;
/** A fresh repo + session store + session id per test. */
function fixture() {
  counter += 1;
  const base = path.join(TMP, `case-${counter}`);
  const root = path.join(base, 'repo');
  const storeRoot = path.join(base, 'sessions');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  const sessionId = `sess-${counter}-abc`;
  return { root, storeRoot, sessionId, sessionDir: path.join(storeRoot, sessionId) };
}

function openLedger(fx, gates, scope = 'demo') {
  const made = ledger.createLedger(fx.root, { scope, sessionId: fx.sessionId, gates });
  assert.ok(made.ok, JSON.stringify(made));
  return made.path;
}

const AUTO = [{ id: 'G1', criterion: '테스트가 통과한다', check: 'echo ok', expect: 'ok' }];

function payload(fx, extra = {}) {
  return {
    session_id: fx.sessionId,
    transcript_path: path.join(fx.root, 't.jsonl'),
    cwd: fx.root,
    permission_mode: 'default',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: '끝났습니다.',
    background_tasks: [],
    session_crons: [],
    ...extra,
  };
}

function run(fx, body, env = {}) {
  const childEnv = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    CLAUDE_HOOK_INPUT: '',
    LENS_SESSION_STORE: fx.storeRoot,
    LENS_LEDGER_INDEX: process.env.LENS_LEDGER_INDEX,
    LENS_GATE_ENFORCEMENT: '1',
    ...env,
  };
  delete childEnv.CLAUDE_CODE_SESSION_ID;
  delete childEnv.CLAUDE_PROJECT_DIR;
  const raw = execFileSync(process.execPath, [HOOK], { input: JSON.stringify(body), cwd: fx.root, env: childEnv }).toString().trim();
  return JSON.parse(raw || '{}');
}

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; } };

/** Dashboards the hook may have written: the session store (3.48) or the legacy repo file. */
function dashboards(fx) {
  return [path.join(fx.sessionDir, 'dashboard.json'), path.join(fx.root, '.lens', 'agent-dashboard.json')]
    .map(readJson).filter(Boolean);
}

function seedDashboards(fx) {
  const board = {
    $schema: 'lens-agent-dashboard/1.1.0',
    session: { id: 'x', startedAt: new Date().toISOString(), endedAt: null, status: 'active' },
    agents: [], summary: {}, errors: [], lastUpdatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(fx.sessionDir, { recursive: true });
  fs.mkdirSync(path.join(fx.root, '.lens'), { recursive: true });
  fs.writeFileSync(path.join(fx.sessionDir, 'dashboard.json'), JSON.stringify(board));
  fs.writeFileSync(path.join(fx.root, '.lens', 'agent-dashboard.json'), JSON.stringify(board));
}

const isBlock = out => out.decision === 'block';

console.log('\n[Lens] stop hook tests\n');

test('A1 — 서브에이전트가 도는 중이면 판정 없이 통과: {} · 세션 completed 아님', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  seedDashboards(fx);
  const out = run(fx, payload(fx, {
    background_tasks: [{ id: 'a1', type: 'subagent', status: 'running', description: 'worker 1', agent_type: 'general-purpose' }],
  }));
  assert.deepStrictEqual(out, {});
  for (const d of dashboards(fx)) assert.notStrictEqual(d.session.status, 'completed', '턴은 끝났지만 실행은 안 끝났다');
  const progress = readJson(path.join(fx.sessionDir, 'progress.json'));
  assert.ok(progress && progress.lastContactAt, '시계는 스탬프한다 — 사장님은 이 턴의 글을 받았다');
});

test('A1 — workflow·teammate·cloud session 도 대기로 친다', () => {
  for (const type of ['workflow', 'teammate', 'cloud session']) {
    const fx = fixture();
    openLedger(fx, AUTO);
    assert.deepStrictEqual(run(fx, payload(fx, { background_tasks: [{ id: 'w', type, status: 'running' }] })), {}, type);
  }
});

test('A1 — shell·monitor·MCP task 만 있으면 대기가 아니다: 미충족이면 차단', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  const out = run(fx, payload(fx, {
    background_tasks: [
      { id: 's', type: 'shell', status: 'running', description: 'dev server', command: 'npm run dev' },
      { id: 'm', type: 'monitor', status: 'running', server: 'x', tool: 'y' },
      { id: 'p', type: 'MCP task', status: 'running', server: 'x', tool: 'y' },
    ],
  }));
  assert.ok(isBlock(out), JSON.stringify(out));
});

test('A1 — 끝난·유휴 상태(status idle 등)의 teammate 는 대기가 아니다: 정상 판정', () => {
  for (const status of ['idle', 'completed', 'Killed', 'cancelled']) {
    const fx = fixture();
    openLedger(fx, AUTO);
    const out = run(fx, payload(fx, { background_tasks: [{ id: 't', type: 'teammate', status }] }));
    assert.ok(isBlock(out), `${status}: ${JSON.stringify(out)}`);
  }
});

test('A1 — status 가 running 이거나 없거나 모르는 값이면 종전대로 대기', () => {
  for (const status of ['running', undefined, 'pending_something']) {
    const fx = fixture();
    openLedger(fx, AUTO);
    const task = { id: 'a', type: 'subagent' };
    if (status !== undefined) task.status = status;
    assert.deepStrictEqual(run(fx, payload(fx, { background_tasks: [task] })), {}, String(status));
  }
});

test('A4 — 차단 출력은 decision+reason 만: systemMessage 없음, "이어서 작업합니다" 없음, lens-gate 전체 경로', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  const out = run(fx, payload(fx));
  assert.deepStrictEqual(Object.keys(out).sort(), ['decision', 'reason']);
  assert.ok(!out.reason.includes('이어서 작업합니다'), out.reason);
  // Stop 의 block reason 은 사장님 transcript 에 경고로 보인다(공식 문서) — 첫 줄은 사람 말만.
  const first = out.reason.split('\n')[0];
  for (const word of ['게이트', '원장', 'lens-gate', '/2']) assert.ok(!first.includes(word), `첫 줄에 내부 용어 "${word}": ${first}`);
  assert.strictEqual(first, '아직 확인되지 않은 완료 조건이 1건 있어 마무리하기 전에 확인합니다.');
  const cli = path.join(PLUGIN_ROOT, 'scripts', 'lens-gate.js').split(path.sep).join('/');
  for (const sub of ['status', 'run', 'abandon']) assert.ok(out.reason.includes(`node "${cli}" ${sub} demo`), `${sub}: ${out.reason}`);
  assert.ok(out.reason.includes(fx.root.split(path.sep).join('/')), '다른 레포 원장도 찾도록 --root 를 준다');
});

test('A2 — manual 조건만 미충족이면 통과, 원장은 awaitingUser 1건', () => {
  const fx = fixture();
  openLedger(fx, [{ id: 'M1', criterion: '대표가 화면을 확인한다', kind: 'manual' }]);
  const out = run(fx, payload(fx));
  assert.ok(!isBlock(out), JSON.stringify(out));
  assert.strictEqual(out.systemMessage, undefined);
  assert.strictEqual(ledger.evaluate(ledger.loadLedgers(fx.root)).awaitingUser.length, 1);
});

test('A3·A4 — 메타데이터만 바뀐 원장으로 5회: 차단 2 → 조용히 해제(턴을 잇지 않음) → 침묵 2, systemMessage 0', () => {
  const fx = fixture();
  const file = openLedger(fx, AUTO);
  const outs = [];
  for (let i = 0; i < 5; i += 1) {
    const l = readJson(file);
    l.updatedAt = new Date(Date.now() + i).toISOString();
    l.goal = `메타데이터 ${i}`;
    fs.writeFileSync(file, JSON.stringify(l));
    outs.push(run(fx, payload(fx, { stop_hook_active: i > 0 })));
  }
  assert.deepStrictEqual(outs.map(isBlock), [true, true, false, false, false], JSON.stringify(outs));
  assert.deepStrictEqual(outs[2], {}, `3회째는 조용한 해제(추가 턴 없음): ${JSON.stringify(outs[2])}`);
  assert.deepStrictEqual(outs[3], {});
  assert.deepStrictEqual(outs[4], {});
  assert.strictEqual(outs.filter(o => 'systemMessage' in o).length, 0);
});

test('A3 — stop_hook_active 참 + 같은 해시면 카운터만 +1 (blocks.json)', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  run(fx, payload(fx));
  const first = readJson(path.join(fx.sessionDir, 'blocks.json'));
  run(fx, payload(fx, { stop_hook_active: true }));
  const second = readJson(path.join(fx.sessionDir, 'blocks.json'));
  assert.strictEqual(first.entries.demo.blocks, 1);
  assert.strictEqual(second.entries.demo.blocks, 2);
  assert.strictEqual(second.entries.demo.hash, first.entries.demo.hash);
});

test('A3 — 해제 뒤 진전(미충족 목록 변화)이 있으면 다시 막는다', () => {
  const fx = fixture();
  openLedger(fx, [...AUTO, { id: 'G2', criterion: '둘째', check: 'echo ok', expect: 'ok' }]);
  for (let i = 0; i < 4; i += 1) run(fx, payload(fx, { stop_hook_active: i > 0 }));
  ledger.recordEvidence(fx.root, 'demo', 'G1', { exit: 0, output: 'ok', source: 'lens-gate run' });
  assert.ok(isBlock(run(fx, payload(fx, { stop_hook_active: true }))));
});

test('A7/A8 — 차단이면 세션 완료·시계 스탬프를 하지 않는다', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  seedDashboards(fx);
  const stamp = '2026-09-22T00:00:00.000Z';
  fs.writeFileSync(path.join(fx.sessionDir, 'progress.json'), JSON.stringify({ lastContactAt: stamp }));
  assert.ok(isBlock(run(fx, payload(fx))));
  for (const d of dashboards(fx)) {
    assert.strictEqual(d.session.endedAt, null);
    assert.notStrictEqual(d.session.status, 'completed');
  }
  assert.strictEqual(readJson(path.join(fx.sessionDir, 'progress.json')).lastContactAt, stamp);
});

test('통과면 그때 세션 완료와 시계 스탬프 (위 검사가 헛돌지 않는다는 대조군)', () => {
  const fx = fixture();
  seedDashboards(fx);
  const stamp = '2026-09-22T00:00:00.000Z';
  fs.writeFileSync(path.join(fx.sessionDir, 'progress.json'), JSON.stringify({ lastContactAt: stamp }));
  assert.deepStrictEqual(run(fx, payload(fx)), {});
  assert.ok(dashboards(fx).some(d => d.session.status === 'completed' && d.session.endedAt), '어느 한 곳에는 완료가 찍혀야 한다');
  assert.notStrictEqual(readJson(path.join(fx.sessionDir, 'progress.json')).lastContactAt, stamp);
});

test('우회로 — background_tasks 키가 없고 progress 가 무장돼 있으면 대기로 통과', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  const now = new Date().toISOString();
  fs.mkdirSync(fx.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(fx.sessionDir, 'progress.json'), JSON.stringify({ armedAt: now, lastSignalAt: now }));
  const body = payload(fx);
  delete body.background_tasks;
  assert.deepStrictEqual(run(fx, body), {});
});

test('우회로 — 키가 없어도 무장이 식었으면(180초 초과) 정상 판정', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  const old = new Date(Date.now() - 181000).toISOString();
  fs.mkdirSync(fx.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(fx.sessionDir, 'progress.json'), JSON.stringify({ armedAt: old, lastSignalAt: old }));
  const body = payload(fx);
  delete body.background_tasks;
  assert.ok(isBlock(run(fx, body)));
});

test('빈 background_tasks 배열은 "없음" 이지 "모름" 이 아니다 — 무장된 progress 로 통과시키지 않는다', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  const now = new Date().toISOString();
  fs.mkdirSync(fx.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(fx.sessionDir, 'progress.json'), JSON.stringify({ armedAt: now, lastSignalAt: now }));
  assert.ok(isBlock(run(fx, payload(fx, { background_tasks: [] }))));
});

test('fail-open — 세션 저장소를 쓸 수 없으면(폴더 자리에 파일) 통과', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  const brokenStore = path.join(fx.root, 'not-a-dir');
  fs.writeFileSync(brokenStore, 'x');
  assert.deepStrictEqual(run({ ...fx, storeRoot: brokenStore }, payload(fx)), {});
});

test('fail-open — 깨진 blocks.json·progress.json 이어도 죽지 않고 JSON 을 낸다', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  fs.mkdirSync(fx.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(fx.sessionDir, 'blocks.json'), '{ nope');
  fs.writeFileSync(path.join(fx.sessionDir, 'progress.json'), '[[[');
  const body = payload(fx);
  delete body.background_tasks;
  const out = run(fx, body);
  assert.strictEqual(out.systemMessage, undefined);
  assert.ok(isBlock(out) || Object.keys(out).length === 0, JSON.stringify(out));
});

test('깨진 원장 json — 현재 레포 것만 차단 사유, 색인으로 읽은 다른 레포 것은 막지 않는다', () => {
  const fx = fixture();
  const other = path.join(path.dirname(fx.root), 'other-repo');
  fs.mkdirSync(path.join(other, '.git'), { recursive: true });
  fs.mkdirSync(ledger.gatesDir(other), { recursive: true });
  fs.writeFileSync(path.join(ledger.gatesDir(other), 'broken.json'), '{ not json');
  // 이 테스트만의 색인 — 다른 테스트에 깨진 레포를 흘리지 않는다.
  const index = path.join(path.dirname(fx.root), 'index.json');
  const saved = process.env.LENS_LEDGER_INDEX;
  process.env.LENS_LEDGER_INDEX = index;
  try { ledger.registerRoot(other, 'broken'); } finally { process.env.LENS_LEDGER_INDEX = saved; }
  assert.deepStrictEqual(run(fx, payload(fx), { LENS_LEDGER_INDEX: index }), {}, '다른 레포의 손상 원장이 이 세션을 막았다');
  fs.mkdirSync(ledger.gatesDir(fx.root), { recursive: true });
  fs.writeFileSync(path.join(ledger.gatesDir(fx.root), 'mine.json'), '{ not json');
  assert.ok(isBlock(run(fx, payload(fx), { LENS_LEDGER_INDEX: index })), '현재 레포의 손상 원장은 차단 사유다');
});

test('다른 세션이 연 원장은 이 세션을 막지 않는다', () => {
  const fx = fixture();
  ledger.createLedger(fx.root, { scope: 'other', sessionId: 'someone-else', gates: AUTO });
  assert.deepStrictEqual(run(fx, payload(fx)), {});
});

test('킬스위치 LENS_GATE_ENFORCEMENT=0 이면 통과', () => {
  const fx = fixture();
  openLedger(fx, AUTO);
  assert.deepStrictEqual(run(fx, payload(fx), { LENS_GATE_ENFORCEMENT: '0' }), {});
});

test('원장이 없으면 {} (회귀 0)', () => {
  const fx = fixture();
  assert.deepStrictEqual(run(fx, payload(fx)), {});
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

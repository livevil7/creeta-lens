#!/usr/bin/env node
/**
 * Lens - gate-ledger unit tests (node assert, real temp dirs).
 *
 * What is pinned here is the plan's six success criteria, in order:
 *   G1 no ledger  → nothing outstanding (the no-regression floor)
 *   G2 unmet gate → outstanding, and decideBlock blocks
 *   G3 `met` without evidence (or with "pending") → UNMET, not met
 *   G4 abandoned without a reason → invalid, not complete
 *   G5 three consecutive blocks on unchanged content → auto release
 *   G6 unreadable/broken ledgers surface as work, never as a throw
 *
 * Real directories are used instead of mocking fs because the failure this
 * module guards against is a hook that misreads real disk state at turn
 * boundaries; a mocked fs would test the assumption under suspicion.
 *
 * Run: node lib/gate-ledger.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MAX_BLOCKS,
  abandonGate,
  closeLedger,
  createLedger,
  decideBlock,
  evaluate,
  gateState,
  gatesDir,
  ledgerPath,
  loadLedgers,
  recordEvidence,
  sanitizeScope,
  status,
  summarize,
} = require('./gate-ledger');

let passed = 0;
let failed = 0;

function test(name, fn) {
  let root = null;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-gate-'));
    fn(root);
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err && err.message}`);
  } finally {
    if (root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }
  }
}

const AUTO_MET = {
  id: 'G1',
  criterion: '테스트가 통과한다',
  kind: 'auto',
  check: 'node x.js',
  expect: 'ALL PASS',
  status: 'met',
  evidence: { exit: 0, expectMatched: true, output: 'ALL PASS', cwd: '.', shell: 'bash' },
};

function writeLedger(root, scope, ledger) {
  const dir = gatesDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${scope}.json`), JSON.stringify(ledger, null, 2), 'utf-8');
}

function baseLedger(overrides = {}) {
  return {
    schema: 1,
    scope: 'demo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    gates: [{ id: 'G1', criterion: '무언가 된다', kind: 'auto', check: 'true', expect: 'ok', status: 'unmet', evidence: null }],
    ...overrides,
  };
}

console.log('\ngate-ledger — gateState');

test('기본 상태는 unmet', () => {
  assert.strictEqual(gateState({ id: 'G1', criterion: 'x' }), 'unmet');
});

test('auto: exit 0 + EXPECT 매칭이면 met', () => {
  assert.strictEqual(gateState(AUTO_MET), 'met');
});

test('G3 — met 인데 evidence 가 없으면 unmet-no-evidence', () => {
  assert.strictEqual(gateState({ ...AUTO_MET, evidence: null }), 'unmet-no-evidence');
});

test('G3 — evidence 가 문자열 "pending" 이면 unmet-no-evidence', () => {
  assert.strictEqual(gateState({ ...AUTO_MET, evidence: 'pending' }), 'unmet-no-evidence');
});

test('G3 — exit 이 0 이 아니면 met 주장을 인정하지 않는다', () => {
  assert.strictEqual(
    gateState({ ...AUTO_MET, evidence: { ...AUTO_MET.evidence, exit: 1 } }),
    'unmet-no-evidence');
});

test('G3 — EXPECT 가 매칭되지 않으면 met 주장을 인정하지 않는다', () => {
  assert.strictEqual(
    gateState({ ...AUTO_MET, evidence: { ...AUTO_MET.evidence, expectMatched: false } }),
    'unmet-no-evidence');
});

test('manual: note + confirmedBy 가 있어야 met', () => {
  const gate = { id: 'M1', criterion: '화면이 맞다', kind: 'manual', status: 'met' };
  assert.strictEqual(gateState({ ...gate, evidence: { note: '확인함', confirmedBy: '대표' } }), 'met');
  assert.strictEqual(gateState({ ...gate, evidence: { note: '확인함' } }), 'unmet-no-evidence');
  assert.strictEqual(gateState({ ...gate, evidence: { confirmedBy: '대표' } }), 'unmet-no-evidence');
});

test('G4 — 사유 있는 abandoned 는 abandoned', () => {
  assert.strictEqual(
    gateState({ id: 'G1', criterion: 'x', status: 'abandoned', abandonReason: '외부 API 폐기됨' }),
    'abandoned');
});

test('G4 — 사유 없는 abandoned 는 invalid (완료 아님)', () => {
  assert.strictEqual(gateState({ id: 'G1', criterion: 'x', status: 'abandoned' }), 'invalid');
  assert.strictEqual(gateState({ id: 'G1', criterion: 'x', status: 'abandoned', abandonReason: '   ' }), 'invalid');
});

test('id·criterion 이 없으면 invalid', () => {
  assert.strictEqual(gateState({ criterion: 'x' }), 'invalid');
  assert.strictEqual(gateState({ id: 'G1' }), 'invalid');
  assert.strictEqual(gateState(null), 'invalid');
});

console.log('\ngate-ledger — loadLedgers / evaluate');

test('G1 — .lens/gates 가 없으면 빈 결과 (회귀 0)', (root) => {
  const loaded = loadLedgers(root);
  assert.deepStrictEqual(loaded.ledgers, []);
  assert.deepStrictEqual(loaded.invalid, []);
  const ev = evaluate(loaded);
  assert.strictEqual(ev.outstanding.length, 0);
  assert.strictEqual(ev.active, 0);
});

test('G2 — 미충족 게이트는 outstanding 에 잡힌다', (root) => {
  writeLedger(root, 'demo', baseLedger());
  const ev = evaluate(loadLedgers(root));
  assert.strictEqual(ev.outstanding.length, 1);
  assert.ok(ev.outstanding[0].startsWith('demo:G1'), ev.outstanding[0]);
  assert.strictEqual(ev.active, 1);
});

test('증거 없는 met 는 outstanding 에 [증거 없음] 으로 표시된다', (root) => {
  writeLedger(root, 'demo', baseLedger({ gates: [{ ...AUTO_MET, evidence: null }] }));
  const ev = evaluate(loadLedgers(root));
  assert.strictEqual(ev.outstanding.length, 1);
  assert.ok(ev.outstanding[0].includes('[증거 없음]'), ev.outstanding[0]);
});

test('닫힌 원장은 차단하지 않는다', (root) => {
  writeLedger(root, 'demo', baseLedger({ closedAt: new Date().toISOString() }));
  const ev = evaluate(loadLedgers(root));
  assert.strictEqual(ev.outstanding.length, 0);
  assert.deepStrictEqual(ev.closed, ['demo']);
});

test('R2 — 24시간 지난 원장은 차단하지 않고 stale 로 분류된다', (root) => {
  const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  writeLedger(root, 'demo', baseLedger({ createdAt: old, updatedAt: old }));
  const ev = evaluate(loadLedgers(root));
  assert.strictEqual(ev.outstanding.length, 0);
  assert.deepStrictEqual(ev.stale, ['demo']);
});

test('G6 — 깨진 JSON 은 던지지 않고 PARSE 항목으로 수거된다', (root) => {
  const dir = gatesDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json', 'utf-8');
  const loaded = loadLedgers(root);
  assert.strictEqual(loaded.invalid.length, 1);
  const ev = evaluate(loaded);
  assert.strictEqual(ev.outstanding.length, 1);
  assert.ok(ev.outstanding[0].includes('PARSE'), ev.outstanding[0]);
});

test('gates 배열이 없는 JSON 도 invalid 로 수거된다', (root) => {
  writeLedger(root, 'demo', { schema: 1, scope: 'demo' });
  const loaded = loadLedgers(root);
  assert.strictEqual(loaded.invalid.length, 1);
});

console.log('\ngate-ledger — decideBlock');

test('G2 — 미충족이 있으면 차단한다', () => {
  const d = decideBlock({ outstanding: ['demo:G1'], contentHash: 'h1' }, null, { sessionKey: 's' });
  assert.strictEqual(d.block, true);
  assert.strictEqual(d.state.sessions.s.blocks, 1);
  assert.ok(d.reason.includes('미충족 1건'), d.reason);
  assert.ok(d.reason.includes('진행보고'), '차단 사유에 2분 보고 지시가 있어야 한다');
  assert.ok(d.reason.includes('abandoned'), '차단 사유에 정직한 이탈 경로가 있어야 한다');
});

test('G1 — 미충족이 없으면 차단하지 않고 카운터를 지운다', () => {
  const prev = { schema: 1, sessions: { s: { hash: 'h1', blocks: 2 } } };
  const d = decideBlock({ outstanding: [], contentHash: 'h1' }, prev, { sessionKey: 's' });
  assert.strictEqual(d.block, false);
  assert.strictEqual(d.released, false);
  assert.strictEqual(d.state.sessions.s, undefined);
});

test(`G5 — 같은 내용으로 ${MAX_BLOCKS}회 차단 후 ${MAX_BLOCKS + 1}회째는 자동 해제`, () => {
  let state = null;
  const ev = { outstanding: ['demo:G1'], contentHash: 'h1' };
  for (let i = 1; i <= MAX_BLOCKS; i += 1) {
    const d = decideBlock(ev, state, { sessionKey: 's' });
    assert.strictEqual(d.block, true, `${i}회째는 차단이어야 한다`);
    state = d.state;
  }
  const last = decideBlock(ev, state, { sessionKey: 's' });
  assert.strictEqual(last.block, false, '상한 초과는 해제되어야 한다');
  assert.strictEqual(last.released, true);
  assert.ok(last.systemMessage.includes('자동 해제'), last.systemMessage);
});

test('원장이 바뀌면(진전) 카운터가 리셋된다', () => {
  const first = decideBlock({ outstanding: ['demo:G1'], contentHash: 'h1' }, null, { sessionKey: 's' });
  const second = decideBlock({ outstanding: ['demo:G2'], contentHash: 'h2' }, first.state, { sessionKey: 's' });
  assert.strictEqual(second.state.sessions.s.blocks, 1, '해시가 바뀌면 1부터 다시 센다');
  assert.strictEqual(second.block, true);
});

test('세션이 다르면 카운터를 섞지 않는다', () => {
  const a = decideBlock({ outstanding: ['x'], contentHash: 'h1' }, null, { sessionKey: 'a' });
  const b = decideBlock({ outstanding: ['x'], contentHash: 'h1' }, a.state, { sessionKey: 'b' });
  assert.strictEqual(b.state.sessions.a.blocks, 1);
  assert.strictEqual(b.state.sessions.b.blocks, 1);
});

test('G6 — 깨진 state 를 받아도 던지지 않는다', () => {
  for (const broken of [null, undefined, 'nope', 42, [], { sessions: 'bad' }]) {
    const d = decideBlock({ outstanding: ['x'], contentHash: 'h' }, broken, { sessionKey: 's' });
    assert.strictEqual(d.block, true);
    assert.strictEqual(d.state.sessions.s.blocks, 1);
  }
});

console.log('\ngate-ledger — writers');

test('createLedger 는 전부 unmet 인 원장을 만든다', (root) => {
  const res = createLedger(root, {
    scope: '2026-08-23-demo',
    planDoc: 'docs/tasks/x.md',
    goal: '무언가',
    gates: [
      { id: 'G1', criterion: '테스트 통과', check: 'node t.js', expect: 'ALL PASS' },
      { criterion: '사람이 화면 확인', kind: 'manual' },
    ],
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.gates, 2);
  const ledger = JSON.parse(fs.readFileSync(res.path, 'utf-8'));
  assert.strictEqual(ledger.gates[0].status, 'unmet');
  assert.strictEqual(ledger.gates[1].id, 'G2', 'id 는 자동 부여된다');
  assert.strictEqual(ledger.gates[1].kind, 'manual');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 2);
});

test('빈 scope·빈 gates 는 거부된다', (root) => {
  assert.strictEqual(createLedger(root, { scope: '', gates: [{ criterion: 'x' }] }).ok, false);
  assert.strictEqual(createLedger(root, { scope: 'a', gates: [] }).ok, false);
});

test('recordEvidence — exit 0 + EXPECT 매칭이면 met 이 된다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'node t.js', expect: 'ALL PASS' }] });
  const res = recordEvidence(root, 'demo', 'G1', { exit: 0, output: '... ALL PASS ...' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.state, 'met');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 0);
});

test('G3 — recordEvidence 는 실패한 실행을 met 으로 만들지 못한다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'node t.js', expect: 'ALL PASS' }] });
  const res = recordEvidence(root, 'demo', 'G1', { exit: 1, output: 'ALL PASS' });
  assert.strictEqual(res.state, 'unmet-no-evidence');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath(root, 'demo'), 'utf-8'));
  assert.strictEqual(ledger.gates[0].status, 'unmet', '실패는 met 로 기록되지 않는다');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 1);
});

test('G3 — EXPECT 가 출력에 없으면 met 이 되지 않는다 (판정은 패턴이 한다)', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'node t.js', expect: 'ALL PASS' }] });
  const res = recordEvidence(root, 'demo', 'G1', { exit: 0, output: '아마 통과한 것 같음' });
  assert.strictEqual(res.state, 'unmet-no-evidence');
});

test('G4 — abandonGate 는 빈 사유를 거부한다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'true', expect: 'ok' }] });
  assert.strictEqual(abandonGate(root, 'demo', 'G1', '   ').ok, false);
  assert.strictEqual(abandonGate(root, 'demo', 'G1', '').ok, false);
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 1, '거부된 이탈은 여전히 미충족이다');
});

test('G4 — 사유가 있으면 이탈이 기록되고 차단이 풀린다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'true', expect: 'ok' }] });
  assert.strictEqual(abandonGate(root, 'demo', 'G1', '외부 서비스가 폐기되어 검증 불가').ok, true);
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 0);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath(root, 'demo'), 'utf-8'));
  assert.strictEqual(summarize(ledger).abandoned, 1);
});

test('closeLedger 는 집계를 내고 차단을 해제한다', (root) => {
  createLedger(root, {
    scope: 'demo',
    gates: [
      { id: 'G1', criterion: 'a', check: 'true', expect: 'ok' },
      { id: 'G2', criterion: 'b', check: 'true', expect: 'ok' },
    ],
  });
  recordEvidence(root, 'demo', 'G1', { exit: 0, output: 'ok' });
  abandonGate(root, 'demo', 'G2', '범위 밖으로 판명');
  const res = closeLedger(root, 'demo');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.met, 1);
  assert.strictEqual(res.abandoned, 1);
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 0);
});

test('없는 원장·없는 게이트는 오류를 반환하고 던지지 않는다', (root) => {
  assert.strictEqual(recordEvidence(root, 'nope', 'G1', { exit: 0 }).ok, false);
  assert.strictEqual(abandonGate(root, 'nope', 'G1', '사유').ok, false);
  assert.strictEqual(closeLedger(root, 'nope').ok, false);
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'true', expect: 'ok' }] });
  assert.strictEqual(recordEvidence(root, 'demo', 'ZZ', { exit: 0 }).ok, false);
});

test('scope 는 파일명으로 안전하게 정규화된다', () => {
  assert.strictEqual(sanitizeScope('../../etc/passwd'), 'etc-passwd');
  assert.strictEqual(sanitizeScope('2026-08-23-cc_gate.ledger'), '2026-08-23-cc_gate.ledger');
  assert.strictEqual(sanitizeScope('   '), '');
  // 실제로 지켜야 하는 성질: 어떤 입력도 경로 구분자를 남기지 않는다.
  for (const evil of ['../../etc/passwd', 'a\\..\\b', '/abs/path', '..', '.']) {
    const clean = sanitizeScope(evil);
    assert.ok(!clean.includes('/') && !clean.includes('\\'), `구분자 잔존: ${clean}`);
    assert.ok(!clean.startsWith('.'), `점으로 시작: ${clean}`);
  }
});

test('status() 는 요약을 낸다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'true', expect: 'ok' }] });
  const s = status(root);
  assert.strictEqual(s.ledgers.length, 1);
  assert.strictEqual(s.ledgers[0].unmet, 1);
  assert.strictEqual(s.outstanding.length, 1);
});

console.log(`\n  passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

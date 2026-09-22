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

// v3.39: createLedger registers its repo in a user-level index. Tests must never
// write to the real one (~/.claude/lens/active-ledgers.json).
process.env.LENS_LEDGER_INDEX = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ledger-index-')), 'active-ledgers.json');

const {
  MAX_BLOCKS,
  abandonGate,
  closeLedger,
  createLedger,
  decideBlock,
  evaluate,
  gateState,
  gatesDir,
  indexedRoots,
  ledgerPath,
  loadLedgers,
  recordEvidence,
  reopenLedger,
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

// v3.48: 카운터는 세션 저장소 blocks.json 한 파일(세션 = 파일) 안에서 scope 로 나뉜다.
// 키 = 미충족이 있는 scope, 해시 = 미충족 게이트 id(evaluate().contentHash).
const EV1 = { outstanding: ['demo:G1'], scopes: ['demo'], contentHash: 'h1' };

test('G2 — 미충족이 있으면 차단한다 — 사유는 lens-gate 명령을 준다', () => {
  const d = decideBlock(EV1, null, { cli: '/p/scripts/lens-gate.js' });
  assert.strictEqual(d.block, true);
  assert.strictEqual(d.state.entries.demo.blocks, 1);
  // 첫 줄은 사장님 transcript 에 보인다 — 사람 말 한 줄, 내부 용어·카운터 없음.
  const [first, ...restLines] = d.reason.split('\n');
  assert.strictEqual(first, '아직 확인되지 않은 완료 조건이 1건 있어 마무리하기 전에 확인합니다.');
  for (const word of ['게이트', '원장', 'lens-gate', '/2']) assert.ok(!first.includes(word), `첫 줄에 "${word}"`);
  assert.ok(restLines.join('\n').includes('(1/2)'), '카운터는 둘째 줄부터');
  for (const sub of ['status', 'run', 'abandon']) {
    assert.ok(d.reason.includes(`node "/p/scripts/lens-gate.js" ${sub} demo`), `사유에 ${sub} 명령이 있어야 한다: ${d.reason}`);
  }
  assert.ok(!d.reason.includes('이어서 작업합니다'), d.reason);
});

test('G1 — 미충족이 없으면 차단하지 않고 카운터를 지운다', () => {
  const prev = { schema: 1, entries: { demo: { hash: 'h1', blocks: 2, releasedHash: null } } };
  const d = decideBlock({ outstanding: [], scopes: [], contentHash: '' }, prev);
  assert.strictEqual(d.block, false);
  assert.strictEqual(d.released, false);
  assert.strictEqual(d.state.entries.demo, undefined);
});

test(`G5 — 같은 해시로 ${MAX_BLOCKS}회 차단 → 해제 알림 1회 → 그 뒤 침묵`, () => {
  let state = null;
  for (let i = 1; i <= MAX_BLOCKS; i += 1) {
    const d = decideBlock(EV1, state);
    assert.strictEqual(d.block, true, `${i}회째는 차단이어야 한다`);
    state = d.state;
  }
  const release = decideBlock(EV1, state);
  assert.strictEqual(release.block, false, '상한 초과는 해제되어야 한다');
  assert.strictEqual(release.released, true);
  assert.ok(release.notice && release.notice.includes('더 막지 않는다'), String(release.notice));
  assert.strictEqual(release.state.entries.demo.releasedHash, 'h1');
  for (let i = 0; i < 3; i += 1) {
    const quiet = decideBlock(EV1, release.state);
    assert.strictEqual(quiet.block, false);
    assert.strictEqual(quiet.notice, null, '같은 해시로 해제 알림은 한 번뿐');
  }
});

test('미충족 목록이 바뀌면(진전) 카운터가 1부터 다시 센다 — 해제 뒤에도', () => {
  let state = null;
  for (let i = 0; i <= MAX_BLOCKS; i += 1) state = decideBlock(EV1, state).state;
  const next = decideBlock({ outstanding: ['demo:G2'], scopes: ['demo'], contentHash: 'h2' }, state);
  assert.strictEqual(next.block, true);
  assert.strictEqual(next.state.entries.demo.blocks, 1);
});

test('scope 가 다르면 카운터를 섞지 않는다', () => {
  const a = decideBlock({ outstanding: ['a:G1'], scopes: ['a'], contentHash: 'h1' }, null);
  const b = decideBlock({ outstanding: ['b:G1'], scopes: ['b'], contentHash: 'h9' }, a.state);
  assert.strictEqual(b.state.entries.a.blocks, 1);
  assert.strictEqual(b.state.entries.b.blocks, 1);
});

test('G6 — 깨진 state 를 받아도 던지지 않는다', () => {
  for (const broken of [null, undefined, 'nope', 42, [], { entries: 'bad' }, { sessions: { s: { blocks: 9 } } }]) {
    const d = decideBlock(EV1, broken);
    assert.strictEqual(d.block, true);
    assert.strictEqual(d.state.entries.demo.blocks, 1);
  }
});

console.log('\ngate-ledger — v3.48 evaluate (manual 은 대기, 해시는 미충족 id 만)');

test('A2 — manual 미충족은 outstanding 이 아니라 awaitingUser 로 간다', (root) => {
  writeLedger(root, 'demo', baseLedger({
    gates: [
      { id: 'G1', criterion: 'a', kind: 'auto', check: 'true', expect: 'ok', status: 'unmet' },
      { id: 'M1', criterion: '대표가 화면 확인', kind: 'manual', status: 'unmet' },
    ],
  }));
  const ev = evaluate(loadLedgers(root));
  assert.strictEqual(ev.outstanding.length, 1);
  assert.ok(ev.outstanding[0].startsWith('demo:G1'), ev.outstanding[0]);
  assert.strictEqual(ev.awaitingUser.length, 1);
  assert.ok(ev.awaitingUser[0].startsWith('demo:M1'), ev.awaitingUser[0]);
});

test('A2 — manual 만 남은 원장은 차단하지 않는다', (root) => {
  writeLedger(root, 'demo', baseLedger({ gates: [{ id: 'M1', criterion: '확인', kind: 'manual', status: 'unmet' }] }));
  const ev = evaluate(loadLedgers(root));
  assert.strictEqual(ev.outstanding.length, 0);
  assert.strictEqual(decideBlock(ev, null).block, false);
});

test('A3 — 원장 메타데이터(시각·goal)만 바뀌면 해시가 그대로다', (root) => {
  writeLedger(root, 'demo', baseLedger({ goal: 'a', updatedAt: new Date(Date.now() - 1000).toISOString() }));
  const h1 = evaluate(loadLedgers(root)).contentHash;
  writeLedger(root, 'demo', baseLedger({ goal: 'b', updatedAt: new Date().toISOString() }));
  const h2 = evaluate(loadLedgers(root)).contentHash;
  assert.strictEqual(h1, h2);
  writeLedger(root, 'demo', baseLedger({ gates: [{ id: 'G2', criterion: 'x', status: 'unmet' }] }));
  assert.notStrictEqual(evaluate(loadLedgers(root)).contentHash, h1, '미충족 목록이 바뀌면 해시도 바뀐다');
});

test('G6 — gate-ledger.js 에 NUL·\\x01 원문 바이트가 없다', () => {
  const bytes = fs.readFileSync(path.join(__dirname, 'gate-ledger.js'));
  assert.strictEqual(bytes.includes(0x00), false, 'NUL 바이트');
  assert.strictEqual(bytes.includes(0x01), false, '\\x01 바이트');
});

console.log('\ngate-ledger — v3.48 schema 2 (증거는 lens-gate run 이 남긴 것만)');

test('G1 — createLedger 는 schema 2 원장을 만든다', (root) => {
  const res = createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'true', expect: 'ok' }] });
  assert.strictEqual(JSON.parse(fs.readFileSync(res.path, 'utf-8')).schema, 2);
});

test('G1 — schema 2 원장에 source 없이 exit:0 을 넘기면 met 이 아니다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'node t.js', expect: 'ALL PASS' }] });
  const res = recordEvidence(root, 'demo', 'G1', { exit: 0, output: 'ALL PASS' });
  assert.strictEqual(res.state, 'unmet-no-evidence');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 1);
});

test('G1 — schema 2 원장도 source=lens-gate run 이면 met', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'node t.js', expect: 'ALL PASS' }] });
  const res = recordEvidence(root, 'demo', 'G1', { exit: 0, output: 'ALL PASS', source: 'lens-gate run' });
  assert.strictEqual(res.state, 'met');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 0);
});

test('G1 — schema 1 원장(업그레이드 전)은 종전 판정: source 없이도 met', (root) => {
  writeLedger(root, 'old', baseLedger({ scope: 'old', gates: [{ id: 'G1', criterion: 'x', kind: 'auto', check: 't', expect: 'ok', status: 'unmet' }] }));
  const res = recordEvidence(root, 'old', 'G1', { exit: 0, output: 'ok' });
  assert.strictEqual(res.state, 'met');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 0);
});

test('A6 — reopenLedger: 포기·닫힘을 되돌리고 다시 색인에 올린다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'true', expect: 'ok' }] });
  abandonGate(root, 'demo', 'G1', '탈출용 포기');
  closeLedger(root, 'demo');
  const res = reopenLedger(root, 'demo', 'G1');
  assert.strictEqual(res.ok, true);
  const l = JSON.parse(fs.readFileSync(ledgerPath(root, 'demo'), 'utf-8'));
  assert.strictEqual(l.closedAt, null);
  assert.ok(l.reopenedAt);
  assert.strictEqual(l.gates[0].status, 'unmet');
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 1);
  assert.ok(indexedRoots().includes(path.resolve(root)), '다시 연 원장은 색인에 있어야 훅이 찾는다');
  assert.strictEqual(recordEvidence(root, 'demo', 'G1', { exit: 0, output: 'ok', source: 'lens-gate run' }).state, 'met');
  assert.strictEqual(reopenLedger(root, 'nope').ok, false);
  assert.strictEqual(reopenLedger(root, 'demo', 'ZZ').ok, false);
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
  // v3.48 A2: manual 은 차단 목록이 아니라 사용자 답 대기 목록이다.
  assert.strictEqual(evaluate(loadLedgers(root)).outstanding.length, 1);
  assert.strictEqual(evaluate(loadLedgers(root)).awaitingUser.length, 1);
});

test('빈 scope·빈 gates 는 거부된다', (root) => {
  assert.strictEqual(createLedger(root, { scope: '', gates: [{ criterion: 'x' }] }).ok, false);
  assert.strictEqual(createLedger(root, { scope: 'a', gates: [] }).ok, false);
});

test('recordEvidence — exit 0 + EXPECT 매칭이면 met 이 된다', (root) => {
  createLedger(root, { scope: 'demo', gates: [{ id: 'G1', criterion: 'x', check: 'node t.js', expect: 'ALL PASS' }] });
  const res = recordEvidence(root, 'demo', 'G1', { exit: 0, output: '... ALL PASS ...', source: 'lens-gate run' });
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
  recordEvidence(root, 'demo', 'G1', { exit: 0, output: 'ok', source: 'lens-gate run' });
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

// ── v3.48 lens-gate CLI — 임시 git 레포에서 실제 실행 ─────────

console.log('\nlens-gate CLI (subprocess, 임시 git 레포)');

const { spawnSync } = require('child_process');
const CLI = path.join(__dirname, '..', 'scripts', 'lens-gate.js');

function gitRepo(root) {
  spawnSync('git', ['init', '-q', root]);
  return root;
}

function cli(args, { cwd } = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf-8', timeout: 60000 });
  const line = String(r.stdout || '').trim().split('\n').pop() || '{}';
  let json;
  try { json = JSON.parse(line); } catch { json = { unparsed: r.stdout, stderr: r.stderr }; }
  return { code: r.status, json };
}

function gatesFile(root, gates) {
  const file = path.join(root, 'gates.json');
  fs.writeFileSync(file, JSON.stringify(gates), 'utf-8');
  return file;
}

function readLedger(root, scope) {
  return JSON.parse(fs.readFileSync(ledgerPath(root, scope), 'utf-8'));
}

test('G2 — create 는 실행 불가한 라벨(exit 127)을 원장으로 만들지 않고 그 게이트를 지목한다', (root) => {
  gitRepo(root);
  const file = gatesFile(root, [
    { id: 'G1', criterion: '된다', check: 'echo ok', expect: 'ok' },
    { id: 'G2', criterion: '라이브 확인', check: 'live probe cards first', expect: 'PASS' },
  ]);
  const r = cli(['create', 'demo', '--plan', 'docs/tasks/x.md', '--goal', '목표', '--gates', file, '--root', root]);
  assert.strictEqual(r.code, 1, JSON.stringify(r.json));
  assert.strictEqual(r.json.ok, false);
  assert.strictEqual(r.json.gate, 'G2');
  assert.strictEqual(fs.existsSync(ledgerPath(root, 'demo')), false, '원장이 생기면 안 된다');
});

test('G2 — 실행은 되지만 실패하는 검사는 "미충족" 으로 인정하고 원장을 만든다', (root) => {
  gitRepo(root);
  const file = gatesFile(root, [
    { id: 'G1', criterion: '아직 실패', check: 'echo nope; exit 3', expect: 'PASS' },
    { id: 'M1', criterion: '대표 확인', kind: 'manual' },
  ]);
  const r = cli(['create', 'demo', '--plan', 'x.md', '--goal', '목표', '--gates', file, '--root', root]);
  assert.strictEqual(r.code, 0, JSON.stringify(r.json));
  assert.strictEqual(r.json.ok, true);
  const l = readLedger(root, 'demo');
  assert.strictEqual(l.schema, 2);
  assert.strictEqual(l.gates[0].status, 'unmet', 'create 의 시험 실행은 증거가 아니다');
  const porcelain = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf-8' }).stdout;
  assert.ok(!/\.lens/.test(porcelain), `원장 폴더가 git 변경으로 잡힌다: ${porcelain}`);
});

test('create 는 check·expect 없는 auto 게이트를 거부한다 (영원히 met 이 될 수 없다)', (root) => {
  gitRepo(root);
  const noExpect = cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates',
    gatesFile(root, [{ id: 'G1', criterion: 'x', kind: 'auto', check: 'echo ok' }]), '--root', root]);
  assert.strictEqual(noExpect.code, 1);
  assert.strictEqual(noExpect.json.gate, 'G1');
  const noCheck = cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates',
    gatesFile(root, [{ id: 'G1', criterion: 'x', kind: 'auto', expect: 'ok' }]), '--root', root]);
  assert.strictEqual(noCheck.code, 1);
  assert.strictEqual(fs.existsSync(ledgerPath(root, 'demo')), false);
});

test('G1 — run 이 check 를 직접 실행해 증거를 남긴다(source=lens-gate run) → met', (root) => {
  gitRepo(root);
  fs.mkdirSync(path.join(root, 'sub'));
  const file = gatesFile(root, [
    { id: 'G1', criterion: '된다', check: 'echo "ALL PASS"; pwd', expect: 'ALL PASS', cwd: 'sub' },
    { id: 'G2', criterion: '실패', check: 'echo boom; exit 2', expect: 'ALL PASS' },
  ]);
  assert.strictEqual(cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates', file, '--root', root]).code, 0);
  const r = cli(['run', 'demo', '--root', root]);
  assert.strictEqual(r.code, 0, JSON.stringify(r.json));
  const byId = Object.fromEntries(r.json.results.map(x => [x.id, x]));
  assert.strictEqual(byId.G1.state, 'met');
  assert.strictEqual(byId.G2.state, 'unmet-no-evidence');
  assert.strictEqual(byId.G2.exit, 2);
  const l = readLedger(root, 'demo');
  assert.strictEqual(l.gates[0].evidence.source, 'lens-gate run');
  assert.strictEqual(l.gates[0].evidence.exit, 0);
  assert.ok(/sub/.test(l.gates[0].evidence.output), `cwd 는 gate.cwd: ${l.gates[0].evidence.output}`);
  assert.strictEqual(l.gates[1].status, 'unmet');
  assert.deepStrictEqual(r.json.outstanding.map(s => s.split(' ')[0]), ['demo:G2']);
});

test('run --timeout: 시간 초과는 미충족이고, 검사 프로세스 트리도 끝낸다', (root) => {
  gitRepo(root);
  const marker = path.join(root, 'late.txt').split(path.sep).join('/');
  // 손자 프로세스(node)가 3초 뒤 파일을 쓴다 — 테스트 러너가 검사 밑에서 도는 모양 그대로.
  const slow = `node -e "setTimeout(function(){require('fs').writeFileSync('${marker}','late')},3000)"`;
  const file = gatesFile(root, [{ id: 'G1', criterion: '느림', check: slow, expect: 'late' }]);
  // 느린 check 는 create 의 시험 실행에서도 3초 걸린다 — 끝까지 기다렸다가 marker 를 지운다.
  assert.strictEqual(cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates', file, '--root', root]).code, 0);
  try { fs.unlinkSync(marker); } catch {}
  const t0 = Date.now();
  const r = cli(['run', 'demo', 'G1', '--timeout', '1', '--root', root]);
  assert.ok(Date.now() - t0 < 2800, `타임아웃이 걸려야 한다 (${Date.now() - t0}ms)`);
  assert.strictEqual(r.json.results[0].timedOut, true);
  assert.notStrictEqual(r.json.results[0].state, 'met');
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},3500)']);
  assert.strictEqual(fs.existsSync(marker), false, '시간 초과된 검사의 자식 프로세스가 살아남았다');
});

test('run --timeout: 부모 bash 가 먼저 끝나고 뒤에 띄운 자식이 출력 파이프를 쥐고 있어도 제한 시간에 끝난다', (root) => {
  gitRepo(root);
  // 부모는 곧바로 exit 0 — 뒤에 띄운 node 가 5초 동안 stdout 을 쥐고 있다.
  const bg = `node -e "setTimeout(function(){},5000)" & echo started`;
  const file = gatesFile(root, [{ id: 'G1', criterion: '뒤에 띄운 자식', check: bg, expect: 'never-matches' }]);
  assert.strictEqual(cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates', file, '--root', root]).code, 0);
  const t0 = Date.now();
  const r = cli(['run', 'demo', 'G1', '--timeout', '1', '--root', root]);
  assert.ok(Date.now() - t0 < 3500, `제한 시간 1초가 지켜져야 한다 (${Date.now() - t0}ms)`);
  assert.notStrictEqual(r.json.results[0].state, 'met');
});

test('evidence — manual 은 글로 받은 확인을 기록하면 met, auto 게이트에는 거부', (root) => {
  gitRepo(root);
  const file = gatesFile(root, [
    { id: 'G1', criterion: '된다', check: 'echo ok', expect: 'ok' },
    { id: 'M1', criterion: '대표 확인', kind: 'manual' },
  ]);
  cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates', file, '--root', root]);
  const ok = cli(['evidence', 'demo', 'M1', '--note', '1번으로 진행', '--confirmed-by', '대표', '--root', root]);
  assert.strictEqual(ok.code, 0, JSON.stringify(ok.json));
  assert.strictEqual(ok.json.state, 'met');
  const refused = cli(['evidence', 'demo', 'G1', '--note', 'x', '--confirmed-by', '대표', '--root', root]);
  assert.strictEqual(refused.code, 1);
  assert.ok(/run/.test(refused.json.error), refused.json.error);
});

test('A6·G4 — abandon → reopen → run 이면 마지막 상태 met, reopenedAt 존재', (root) => {
  gitRepo(root);
  cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates',
    gatesFile(root, [{ id: 'G1', criterion: '된다', check: 'echo ok', expect: 'ok' }]), '--root', root]);
  assert.strictEqual(cli(['abandon', 'demo', 'G1', '--reason', '탈출용', '--root', root]).code, 0);
  assert.strictEqual(cli(['abandon', 'demo', 'G1', '--root', root]).code, 1, '사유 없는 포기는 거부');
  assert.strictEqual(cli(['close', 'demo', '--root', root]).code, 0);
  assert.strictEqual(cli(['reopen', 'demo', 'G1', '--root', root]).code, 0);
  const r = cli(['run', 'demo', '--root', root]);
  assert.strictEqual(r.json.results[0].state, 'met');
  const l = readLedger(root, 'demo');
  assert.strictEqual(l.gates[0].status, 'met');
  assert.ok(l.reopenedAt);
  assert.strictEqual(l.closedAt, null);
});

test('status·close — JSON 한 줄, 기본 root 는 cwd 의 git toplevel', (root) => {
  gitRepo(root);
  const sub = path.join(root, 'a', 'b');
  fs.mkdirSync(sub, { recursive: true });
  cli(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates',
    gatesFile(root, [{ id: 'G1', criterion: '된다', check: 'echo ok', expect: 'ok' }, { id: 'M1', criterion: '확인', kind: 'manual' }])], { cwd: sub });
  assert.ok(fs.existsSync(ledgerPath(root, 'demo')), '하위 폴더에서 불러도 레포 루트에 원장이 생긴다');
  const s = cli(['status', 'demo'], { cwd: sub });
  assert.strictEqual(s.code, 0, JSON.stringify(s.json));
  assert.strictEqual(s.json.ledgers.length, 1);
  assert.deepStrictEqual(s.json.ledgers[0].gates.map(g => g.state), ['unmet', 'unmet']);
  assert.strictEqual(s.json.outstanding.length, 1);
  assert.strictEqual(s.json.awaitingUser.length, 1);
  const c = cli(['close', 'demo'], { cwd: sub });
  assert.strictEqual(c.json.ok, true);
  assert.ok(readLedger(root, 'demo').closedAt);
});

test('win32 — CLAUDE_CODE_GIT_BASH_PATH 가 있으면 그 bash 로 검사한다 (WSL bash 오인 방지)', (root) => {
  if (process.platform !== 'win32') return;
  const alt = 'C:/Program Files/Git/usr/bin/bash.exe';
  if (!fs.existsSync(alt)) return;
  gitRepo(root);
  const file = gatesFile(root, [{ id: 'G1', criterion: '된다', check: 'echo ok', expect: 'ok' }]);
  const env = { ...process.env, CLAUDE_CODE_GIT_BASH_PATH: alt };
  delete env.CLAUDE_CODE_SESSION_ID;
  const call = args => spawnSync(process.execPath, [CLI, ...args, '--root', root], { env, encoding: 'utf-8', timeout: 60000 });
  assert.strictEqual(call(['create', 'demo', '--plan', 'x.md', '--goal', 'g', '--gates', file]).status, 0);
  call(['run', 'demo']);
  const ev = readLedger(root, 'demo').gates[0].evidence;
  assert.strictEqual(ev.shell, alt);
  assert.strictEqual(ev.source, 'lens-gate run');
  assert.strictEqual(readLedger(root, 'demo').gates[0].status, 'met');
});

test('잘못된 사용은 exit 1 + JSON 오류 (던지지 않는다)', (root) => {
  gitRepo(root);
  assert.strictEqual(cli(['nope'], { cwd: root }).code, 1);
  assert.strictEqual(cli(['run', 'missing'], { cwd: root }).json.ok, false);
  assert.strictEqual(cli(['create', 'demo', '--gates', path.join(root, 'none.json')], { cwd: root }).code, 1);
});

console.log(`\n  passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

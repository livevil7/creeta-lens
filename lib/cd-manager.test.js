#!/usr/bin/env node
/**
 * Lens - cd-manager unit tests (node assert, real temp dirs).
 *
 * Pins 검증 9: all met → closable · one open → reasons · no ledger → ledger none.
 *
 * Run: node lib/cd-manager.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { inspectTask } = require('./cd-manager');

let passed = 0;
let failed = 0;
function test(name, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-cd-'));
  try {
    fn(root);
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

function plan(root, { boxes = ['[x] A1 했다'], frontmatter = '', verify = '' } = {}) {
  const doc = path.join(root, 'docs', 'tasks', '2026-10-23-demo.md');
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  fs.writeFileSync(doc, [
    '---', 'plan_id: demo', 'status: executing', frontmatter, '---', '# 데모', '',
    '## 🛠 어떻게', '', ...boxes.map(b => `- ${b}`), '',
    '## ✅ 검증', '', '| # | 됐다는 신호 | 확인 방법 | 통과 | 종류 |', '|---|---|---|---|---|',
    '| 1 | 테스트 통과 | `node x` | 종료 0 | auto |', verify, '',
    '## 진행상황', '', '- **마지막 업데이트**: 2026-10-23', '',
  ].join('\n'));
  return doc;
}

function ledger(root, scope, planDoc, gates) {
  const dir = path.join(root, '.lens', 'gates');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${scope}.json`), JSON.stringify({
    schema: 2, scope, planDoc, updatedAt: '2026-10-23T00:00:00Z', closedAt: '2026-10-23T01:00:00Z', gates,
  }));
}

const metManual = id => ({ id, criterion: `${id} 확인`, kind: 'manual', status: 'met', evidence: { note: '봤다', confirmedBy: '대표' } });

test('전부 충족 → closable · ledger met (닫힌 원장도 읽는다)', (root) => {
  const doc = plan(root);
  ledger(root, 'demo', 'docs/tasks/2026-10-23-demo.md', [metManual('G1'), metManual('G2')]);
  const r = inspectTask(doc);
  assert.strictEqual(r.ledger, 'met');
  assert.deepStrictEqual(r.reasons, []);
  assert.strictEqual(r.closable, true);
});

test('미충족 1 → reasons 에 사유 · remaining 에 그 항목', (root) => {
  const doc = plan(root, { boxes: ['[x] A1 했다', '[ ] A2 남았다'] });
  ledger(root, 'demo', 'docs/tasks/2026-10-23-demo.md', [metManual('G1'), { id: 'G2', criterion: '테스트', kind: 'auto', status: 'unmet' }]);
  const r = inspectTask(doc, { root });
  assert.strictEqual(r.closable, false);
  assert.strictEqual(r.ledger, 'unmet');
  assert.ok(r.reasons.includes('체크 미완 1/2'), r.reasons.join(' / '));
  assert.ok(r.reasons.includes('원장 미충족 1'), r.reasons.join(' / '));
  assert.ok(r.remaining.some(x => x.includes('A2 남았다')));
  assert.ok(r.remaining.some(x => x.startsWith('원장 G2 unmet')));
});

test('원장 없음 → ledger none · manual 검증 행은 확인 항목(막지 않음)', (root) => {
  const doc = plan(root, { verify: '| 2 | 운영 반영 | 대표 확인 | 화면 | manual |' });
  ledger(root, 'other', 'docs/tasks/2026-10-01-other.md', [{ id: 'G1', criterion: 'x', status: 'unmet' }]);
  const r = inspectTask(doc);
  assert.strictEqual(r.ledger, 'none');
  assert.strictEqual(r.closable, true);
  assert.ok(r.remaining.some(x => x.startsWith('검증 #2 수동 확인')));
});

test('포기 게이트 → ledger abandoned · 닫을 수 없음', (root) => {
  const doc = plan(root);
  ledger(root, 'demo', 'docs/tasks/2026-10-23-demo.md', [metManual('G1'), { id: 'G2', criterion: 'y', status: 'abandoned', abandonReason: '안 됨' }]);
  const r = inspectTask(doc);
  assert.strictEqual(r.ledger, 'abandoned');
  assert.strictEqual(r.closable, false);
});

test('waiting_on · 실패 표시 행 → reasons · waitingOn', (root) => {
  const doc = plan(root, { frontmatter: 'waiting_on: "대표 확인"', verify: '| 2 | 배포 | x | ❌ 미통과 | auto |' });
  const r = inspectTask(doc);
  assert.strictEqual(r.waitingOn, '대표 확인');
  assert.ok(r.reasons.includes('대기 중(대표 확인)'));
  assert.ok(r.reasons.some(x => x.startsWith('검증 #2 실패')));
  assert.strictEqual(r.closable, false);
});

test('체크박스도 원장도 없음 · 문서 없음 → 닫을 수 없음 (던지지 않는다)', (root) => {
  assert.strictEqual(inspectTask(plan(root, { boxes: [] })).closable, false);
  const missing = inspectTask(path.join(root, 'nope.md'));
  assert.strictEqual(missing.closable, false);
  assert.strictEqual(missing.ledger, 'none');
});

test('부분 승인 — 보류 행만 가리키는 미완 체크는 세지 않는다', (root) => {
  const doc = path.join(root, 'docs', 'tasks', '2026-10-23-demo.md');
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  fs.writeFileSync(doc, [
    '---', 'plan_id: demo', 'status: executing', '---', '# 데모', '',
    '## 📋 작업 인벤토리', '', '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |', '|---|---|---|---|---|',
    '| 1 | 승인된 일 | 요청 | A1 | 포함 |', '| 2 | 미승인 일 | 요청 | A2 | 보류: 대표 부분 승인 대기 |', '',
    '## 🛠 어떻게', '', '- [x] A1 했다 (#1)', '- [ ] A2 안 했다 (#2)', '',
    '## ✅ 검증', '', '| # | 됐다는 신호 | 확인 방법 | 통과 | 종류 |', '|---|---|---|---|---|',
    '| 1 | 승인된 일 됨 (#1) | x | 종료 0 | auto |', '| 2 | 미승인 일 됨 (#2) | x | ❌ 미통과 | auto |', '',
  ].join('\n'));
  ledger(root, 'demo', 'docs/tasks/2026-10-23-demo.md', [metManual('G1')]);
  const r = inspectTask(doc);
  assert.ok(!r.reasons.some(x => x.startsWith('체크 미완')), JSON.stringify(r.reasons));
  assert.ok(!r.reasons.some(x => x.startsWith('검증 #2')), JSON.stringify(r.reasons));
  assert.strictEqual(r.closable, true);
});

test('검증 절 제목이 「✅ Review」여도 실패 행을 읽는다', (root) => {
  const doc = path.join(root, 'docs', 'tasks', '2026-10-23-demo.md');
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  fs.writeFileSync(doc, [
    '---', 'plan_id: demo', 'status: executing', '---', '# 데모', '',
    '## 🛠 어떻게', '', '- [x] A1 했다', '',
    '## ✅ Review', '', '| # | 됐다는 신호 | 확인 방법 | 통과 | 종류 |', '|---|---|---|---|---|',
    '| 1 | 배포 | x | ❌ 미통과 | auto |', '',
  ].join('\n'));
  const r = inspectTask(doc);
  assert.ok(r.reasons.some(x => x.startsWith('검증 #1 실패')), JSON.stringify(r.reasons));
  assert.strictEqual(r.closable, false);
});

test('확인 명령에 FAIL 이 들어 있어도 통과 칸이 ✅ 면 실패가 아니다', (root) => {
  const doc = plan(root, { verify: '| 2 | 거부 문구 | `node t --expect FAIL` | ✅ 종료 0 | auto |' });
  const r = inspectTask(doc);
  assert.ok(!r.reasons.some(x => x.startsWith('검증 #2')), JSON.stringify(r.reasons));
});

console.log(`\n  passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

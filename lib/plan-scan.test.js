#!/usr/bin/env node
/**
 * Lens - plan-scan unit tests (node assert, real temp dirs).
 *
 * Pinned: setPlanStatus touches only the status line and its companions;
 * scanPlans sorts plans into buckets, says where a stalled one stopped, treats
 * an executing plan whose session is gone or idle as stalled at once, keeps old
 * vocabulary readable, and the cache round-trips.
 *
 * Run: node lib/plan-scan.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { setPlanStatus, scanPlans, writeScanCache, readScanCache } = require('./plan-scan');

let passed = 0;
let failed = 0;

function test(name, fn) {
  let root = null;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plan-scan-'));
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

const NOW = Date.parse('2026-10-23T12:00:00Z');

function plan(root, id, fm, body = '', { mtime = NOW } = {}) {
  const dir = path.join(root, 'docs', 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  fs.writeFileSync(file, `---\nplan_id: ${id}\n${fm}\nbranch: feat/x\nbase: master\n---\n\n# ${id} 제목\n\n${body}`);
  fs.utimesSync(file, new Date(mtime), new Date(mtime));
  return file;
}

const ids = list => list.map(x => x.id).sort();

test('setPlanStatus — status 한 줄만 바꾸고 status_at·blocked_reason·waiting_on 을 넣고 지운다', (root) => {
  const file = plan(root, 'a', 'status: approved\napproved_at: 2026-10-23\nrefs: [x]', '본문 status: approved 는 그대로');
  let r = setPlanStatus(file, 'blocked', { reason: 'G2 미충족', waitingOn: '대표 확인' });
  assert.deepStrictEqual(r, { ok: true, from: 'approved', to: 'blocked' });
  let text = fs.readFileSync(file, 'utf-8');
  assert.match(text, /^status: blocked$/m);
  assert.match(text, /^status_at: \d{4}-/m);
  assert.match(text, /^blocked_reason: "G2 미충족"$/m);
  assert.match(text, /^waiting_on: "대표 확인"$/m);
  assert.match(text, /approved_at: 2026-10-23\nrefs: \[x\]/);
  assert.match(text, /본문 status: approved 는 그대로/);
  r = setPlanStatus(file, 'parked');
  text = fs.readFileSync(file, 'utf-8');
  assert.strictEqual(r.from, 'blocked');
  assert.ok(!/blocked_reason/.test(text), 'blocked 가 아니면 사유를 지운다');
  assert.match(text, /^waiting_on: "대표 확인"$/m, 'parked 로 갈 때 waitingOn 을 안 주면 그대로');
  setPlanStatus(file, 'blocked', { waitingOn: '' });
  assert.ok(!/waiting_on/.test(fs.readFileSync(file, 'utf-8')), '빈 문자열이면 지운다');
  assert.strictEqual((fs.readFileSync(file, 'utf-8').match(/^status:/gm) || []).length, 1);
});

test('setPlanStatus — waitingOn 을 안 주면 blocked·parked 는 대기를 보존, 그 밖(executing·done·approved·cancelled)은 지운다', (root) => {
  for (const to of ['blocked', 'parked', 'executing', 'done', 'approved', 'cancelled']) {
    const file = plan(root, `w-${to}`, 'status: blocked\nwaiting_on: "대표 답"');
    setPlanStatus(file, to);
    const keeps = /^waiting_on: "대표 답"$/m.test(fs.readFileSync(file, 'utf-8'));
    assert.strictEqual(keeps, to === 'blocked' || to === 'parked', `${to}: ${keeps}`);
  }
});

test('setPlanStatus — CRLF 유지 · 모르는 상태·없는 문서는 ok:false', (root) => {
  const file = plan(root, 'b', 'status: approved');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace(/\n/g, '\r\n'));
  assert.strictEqual(setPlanStatus(file, 'done').ok, true);
  assert.match(fs.readFileSync(file, 'utf-8'), /^---\r\nplan_id: b\r\nstatus: done\r\nstatus_at: /);
  assert.strictEqual(setPlanStatus(file, 'finished').ok, false);
  assert.strictEqual(setPlanStatus(path.join(root, 'none.md'), 'done').ok, false);
});

test('scanPlans — 분류: blocked·오래된 approved=멈춤 · waiting · parked · done · 옛 어휘 · 판정 불가', (root) => {
  const old = NOW - 5 * 86400000;
  plan(root, 'p-blocked', 'status: blocked\nblocked_reason: "G3 포기"');
  plan(root, 'p-old', 'status: approved', '', { mtime: old });
  plan(root, 'p-fresh', 'status: executing');
  plan(root, 'p-wait', 'status: in_progress\nwaiting_on: "대표 답"', '', { mtime: old });
  plan(root, 'p-legacy', 'status: in-progress', '', { mtime: old });
  plan(root, 'p-parked', 'status: parked', '', { mtime: old });
  plan(root, 'p-done', 'status: completed', '', { mtime: old });
  plan(root, 'p-weird', 'status: someday');
  fs.writeFileSync(path.join(root, 'docs', 'tasks', 'p-old.research.md'), '---\nstatus: blocked\n---\n');
  const r = scanPlans(root, { now: NOW });
  assert.deepStrictEqual(ids(r.stalled), ['p-blocked', 'p-legacy', 'p-old']);
  assert.deepStrictEqual(ids(r.waiting), ['p-wait']);
  assert.deepStrictEqual(ids(r.approved), ['p-fresh']);
  assert.deepStrictEqual(ids(r.parked), ['p-parked']);
  assert.deepStrictEqual(ids(r.done), ['p-done']);
  assert.deepStrictEqual(ids(r.unknown), ['p-weird']);
  assert.strictEqual(r.stalled.find(s => s.id === 'p-blocked').why, 'G3 포기');
  assert.strictEqual(r.waiting[0].why, '대기 중(대표 답)');
  assert.match(r.stalled.find(s => s.id === 'p-old').why, /^5일 갱신 없음$/);
  assert.match(r.firstLine, /^멈춘 계획 3건 — /);
  assert.strictEqual(r.stalled[0].path.startsWith('docs/tasks/'), true);
});

test('scanPlans — blocked 여도 waiting_on 이 있으면 멈춤이 아니라 대기', (root) => {
  plan(root, 'bw', 'status: blocked\nblocked_reason: "G2"\nwaiting_on: "대표 확인"');
  const r = scanPlans(root, { now: NOW });
  assert.deepStrictEqual(ids(r.stalled), []);
  assert.deepStrictEqual(ids(r.waiting), ['bw']);
  assert.strictEqual(r.waiting[0].why, '대기 중(대표 확인)');
});

test('scanPlans — 어디서: 체크 N/M · 재개 포인트 · 원장 미충족 · 없으면 검사 기록 없음', (root) => {
  plan(root, 'w1', 'status: blocked', '- [x] A1\n- [x] A2\n- [ ] A3\n\n## 진행상황\n\n- **재개 포인트**: A3 부터\n');
  plan(root, 'w2', 'status: blocked');
  const gates = path.join(root, '.lens', 'gates');
  fs.mkdirSync(gates, { recursive: true });
  fs.writeFileSync(path.join(gates, 'w1.json'), JSON.stringify({ schema: 2, scope: 'w1', planDoc: 'docs/tasks/w1.md', closedAt: null, gates: [{ id: 'G1', criterion: '된다', kind: 'auto', status: 'unmet' }] }));
  const r = scanPlans(root, { now: NOW });
  assert.strictEqual(r.stalled.find(s => s.id === 'w1').where, '체크 2/3 · 재개 포인트 A3 부터 · 원장 미충족 1');
  assert.strictEqual(r.stalled.find(s => s.id === 'w2').where, '검사 기록 없음');
  assert.strictEqual(scanPlans(root, { now: NOW }).firstLine.split('\n').length, 1);
});

test('scanPlans — sessions: 맡은 세션이 없거나 idle 인 executing 은 날짜와 무관하게 즉시 멈춤', (root) => {
  plan(root, 's-gone', 'status: executing', '## 진행상황\n\n- **세션**: 서버\n');
  plan(root, 's-idle', 'status: executing', '## 진행상황\n\n- **세션**: 수집\n');
  plan(root, 's-busy', 'status: executing', '## 진행상황\n\n- **세션**: 마케팅\n');
  plan(root, 's-ledger', 'status: executing');
  const gates = path.join(root, '.lens', 'gates');
  fs.mkdirSync(gates, { recursive: true });
  fs.writeFileSync(path.join(gates, 's-ledger.json'), JSON.stringify({ schema: 2, scope: 's-ledger', planDoc: 'docs/tasks/s-ledger.md', sessionId: 'abc-123', closedAt: null, gates: [] }));
  const r = scanPlans(root, { now: NOW, sessions: '수집:idle,마케팅:busy,abc-123' });
  assert.deepStrictEqual(ids(r.stalled), ['s-gone', 's-idle']);
  assert.strictEqual(r.stalled.find(s => s.id === 's-gone').why, '맡은 세션 없음');
  assert.strictEqual(r.stalled.find(s => s.id === 's-idle').why, '맡은 세션 idle');
  assert.deepStrictEqual(ids(r.approved), ['s-busy', 's-ledger']);
  assert.deepStrictEqual(ids(scanPlans(root, { now: NOW }).stalled), [], 'sessions 없으면 날짜 기준만');
  assert.deepStrictEqual(ids(scanPlans(root, { now: NOW, sessions: [{ name: '서버', status: 'busy' }, { id: '수집', status: 'busy' }] }).stalled), ['s-busy', 's-ledger']);
  assert.deepStrictEqual(ids(scanPlans(root, { now: NOW, sessions: '' }).stalled), ['s-busy', 's-gone', 's-idle', 's-ledger'], '빈 목록 = 살아 있는 세션 없음 → 전부 즉시 멈춤');
});

test('scanPlans — git:true 일 때만 병합된 가지의 approved 를 「닫을 때」로 · 새 가지(커밋 0)는 아니다', (root) => {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'ignore' });
  git('init', '-q', '-b', 'master');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  const start = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  git('branch', 'feat/x');
  plan(root, 'g1', 'status: approved', `## 진행상황\n\n- **작업 브랜치**: \`feat/x\` — 시작 SHA \`${start.slice(0, 7)}\`.\n`);
  assert.deepStrictEqual(ids(scanPlans(root, { now: NOW, git: true }).approved), ['g1'], '커밋 없는 새 가지');
  git('checkout', '-q', 'feat/x');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'work');
  git('checkout', '-q', 'master');
  git('merge', '-q', '--ff-only', 'feat/x');
  assert.deepStrictEqual(ids(scanPlans(root, { now: NOW }).approved), ['g1'], 'git:false 는 가지를 안 본다');
  const r = scanPlans(root, { now: NOW, git: true });
  assert.deepStrictEqual(ids(r.stalled), ['g1']);
  assert.match(r.stalled[0].why, /^닫을 때/);
});

test('scanPlans — 작업공간 루트는 한 단계 아래 레포까지 · 캐시 쓰기/읽기', (root) => {
  plan(path.join(root, 'repo-a'), 'ws1', 'status: blocked');
  const r = scanPlans(root, { now: NOW });
  assert.deepStrictEqual(ids(r.stalled), ['ws1']);
  assert.strictEqual(r.stalled[0].path, 'repo-a/docs/tasks/ws1.md');
  assert.strictEqual(readScanCache(root), null);
  assert.strictEqual(writeScanCache(root, r), true);
  assert.ok(fs.existsSync(path.join(root, '.lens', 'plan-scan.json')));
  const back = readScanCache(root);
  assert.strictEqual(back.firstLine, r.firstLine);
  assert.strictEqual(back.scannedAt, new Date(NOW).toISOString());
  assert.strictEqual(scanPlans(path.join(root, 'empty'), { now: NOW }).firstLine, '멈춘 계획 0건');
});

console.log(`\n  passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

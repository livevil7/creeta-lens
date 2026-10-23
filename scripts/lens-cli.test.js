#!/usr/bin/env node
/**
 * Lens - lens-cli routing tests (subprocess, real temp dirs).
 *
 * Pinned: `plan scan <dir>` takes a directory (plan() used to read a file
 * before dispatching, so a directory was a usage error), every v3.53 option is
 * parsed, and `cd inspect` / `control` reach their libs.
 *
 * Run: node scripts/lens-cli.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, 'lens-cli.js');
let passed = 0;
let failed = 0;

function test(name, fn) {
  let root = null;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-cli-'));
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

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { ...process.env, ...env }, timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch {}
  return { code: r.status, out: String(r.stdout || ''), json };
}

function plan(root, id, status, extra = '') {
  const dir = path.join(root, 'docs', 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  fs.writeFileSync(file, `---\nplan_id: ${id}\nstatus: ${status}\n---\n\n# ${id}\n\n${extra}`);
  return file;
}

test('plan scan <디렉터리> — 첫 줄 + 멈춘 계획 줄 · 캐시 파일을 쓴다', (root) => {
  plan(root, 'b1', 'blocked');
  const r = cli(['plan', 'scan', root]);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out.split('\n')[0], /^멈춘 계획 1건 — b1/);
  assert.match(r.out, /^- b1 — /m);
  assert.ok(fs.existsSync(path.join(root, '.lens', 'plan-scan.json')));
});

test('plan scan 텍스트 — 멈춤 → 이어갈 계획 → 대기 → 보관 → 완료 후보 순, 0건 묶음은 생략', (root) => {
  plan(root, 'b1', 'blocked');
  plan(root, 'a1', 'approved', '- [ ] 남음\n');
  plan(root, 'a2', 'approved', '- [x] 끝\n');
  plan(root, 'w1', 'executing\nwaiting_on: "대표 답"');
  plan(root, 'd1', 'done');
  const lines = cli(['plan', 'scan', root]).out.trim().split('\n');
  assert.match(lines[0], /^멈춘 계획 1건/);
  assert.deepStrictEqual(lines.slice(1), [
    lines[1],
    '이어갈 계획 1건', '- a1 — docs/tasks/a1.md',
    '대기 1건', '- w1 — docs/tasks/w1.md',
    '완료 후보 2건', '- d1 — docs/tasks/d1.md', '- a2 — docs/tasks/a2.md',
  ]);
  assert.match(lines[1], /^- b1 — /);
  assert.ok(!lines.some(l => l.startsWith('보관')), '0건 묶음은 생략');
});

test('plan scan 텍스트 — 승인 전·판정 불가 계획만 있어도 목록에 남는다', (root) => {
  plan(root, 'p1', 'planned');
  plan(root, 'u1', '뭔가이상한값');
  const lines = cli(['plan', 'scan', root]).out.trim().split('\n');
  assert.match(lines[0], /^멈춘 계획 0건/);
  assert.ok(lines.includes('승인 전 계획 1건') && lines.includes('- p1 — docs/tasks/p1.md'), lines.join(' | '));
  assert.ok(lines.includes('판정 불가 1건') && lines.includes('- u1 — docs/tasks/u1.md'), lines.join(' | '));
});

test('plan scan --json --git --sessions — 옵션이 scanPlans 로 간다', (root) => {
  plan(root, 'e1', 'executing', '## 진행상황\n\n- **세션**: 서버\n');
  const r = cli(['plan', 'scan', root, '--json', '--git', '--sessions', '수집:busy']);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(r.json.stalled[0].why, '맡은 세션 없음');
  assert.strictEqual(r.json.cache, true);
  assert.strictEqual(cli(['plan', 'scan', root, '--json', '--sessions', '서버:busy']).json.stalled.length, 0);
});

test('plan status — --reason · --waiting-on 값 · 빈 값은 지움 · 모르는 상태는 exit 1', (root) => {
  const file = plan(root, 's1', 'approved');
  let r = cli(['plan', 'status', file, 'blocked', '--reason', 'G2 미충족', '--waiting-on', '대표 확인']);
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual([r.json.from, r.json.to], ['approved', 'blocked']);
  let text = fs.readFileSync(file, 'utf-8');
  assert.match(text, /^blocked_reason: "G2 미충족"$/m);
  assert.match(text, /^waiting_on: "대표 확인"$/m);
  r = cli(['plan', 'status', file, 'executing', '--waiting-on', '']);
  text = fs.readFileSync(file, 'utf-8');
  assert.ok(!/waiting_on|blocked_reason/.test(text), text);
  assert.strictEqual(cli(['plan', 'status', file, 'finished']).code, 1);
  assert.strictEqual(cli(['plan', 'status', file]).code, 2);
});

test('plan gate·structure 는 그대로 파일을 읽는다 · 없는 파일은 exit 2', (root) => {
  assert.strictEqual(cli(['plan', 'structure', path.join(root, 'none.md')]).code, 2);
  const file = plan(root, 'g1', 'approved');
  const r = cli(['plan', 'structure', file]);
  assert.ok(r.json && 'valid' in r.json, r.out);
});

test('cd inspect --json → cd-manager.inspectTask', (root) => {
  const file = plan(root, 'c1', 'executing', '- [ ] 남은 일\n');
  const r = cli(['cd', 'inspect', file, '--json']);
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(typeof r.json.closable, 'boolean');
  assert.ok(Array.isArray(r.json.reasons));
  assert.strictEqual(cli(['cd', 'inspect']).code, 2);
});

test('control on|status|heartbeat|off → control-mode (LENS_CONTROL_FILE)', (root) => {
  const env = { LENS_CONTROL_FILE: path.join(root, 'control.json') };
  let r = cli(['control', 'on', '--name', '관제', '--session', 'ctl-1', '--board', 'https://b', '--participants', 'w1,w2', '--scope', 'snapholo'], env);
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(r.json.control.participants, ['w1', 'w2']);
  r = cli(['control', 'status'], env);
  assert.strictEqual(r.json.fresh, true);
  assert.strictEqual(r.json.control.name, '관제');
  assert.strictEqual(cli(['control', 'heartbeat', '--session', 'ctl-1'], env).code, 0);
  assert.strictEqual(cli(['control', 'off', '--session', 'other'], env).code, 1, '소유 관제만 끈다');
  assert.strictEqual(cli(['control', 'off', '--session', 'ctl-1'], env).code, 0);
  assert.strictEqual(cli(['control', 'status'], env).json.control, null);
  assert.strictEqual(cli(['control', 'nope'], env).code, 2);
});

console.log(`\n  passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Lens - post-tool-plan-doc hook tests (subprocess, node assert only).
 *
 * Pins the v3.39 noise fixes measured on 2026-09-14:
 *   - the show record is looked up in the plan's repo, not the workspace;
 *   - an identical message is not injected twice in a row;
 *   - approval hints stop once the plan is approved, but real problems still speak;
 *   - a 조사보고 is not asked for an execution ledger.
 *
 * Run: node hooks/post-tool-plan-doc.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'post-tool-plan-doc.js');
const viewer = require(path.join(PLUGIN_ROOT, 'lib', 'report-viewer'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const PLAN = (fm = '') => `---
plan_id: 2026-09-14-x
created: 2026-09-14
planner_model: fable (세션 자체)
${fm}
---

# 가입 개선

## 🎯 목표
- 가입을 끝까지 마칠 수 있다

## ❓ 왜
중간에 끊긴다

## 📋 작업 인벤토리

| # | 작업 항목 | 출처 | 반영 위치 | 상태 |
|---|---|---|---|---|
| 1 | 폼 검증 | 요청 | 어떻게 | 포함 |

## 🛠 어떻게
- [ ] 폼 검증 붙이기

## ✅ 검증
| # | 신호 |
|---|---|
| 1 | 가입 완료 |

## 🚫 건드리지 않는 것
- 결제 모듈
`;

function setup(body) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-plandoc-'));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'tasks'), { recursive: true });
  const file = path.join(repo, 'docs', 'tasks', '2026-09-14-x.md');
  fs.writeFileSync(file, body);
  return { ws, repo, file };
}

function run({ ws, file }) {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: ws }),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_PROJECT_DIR: ws, CLAUDE_HOOK_INPUT: '' },
  }).toString().trim();
  const j = JSON.parse(out || '{}');
  return (j.hookSpecificOutput && j.hookSpecificOutput.additionalContext) || '';
}

console.log('\n[Lens] post-tool-plan-doc tests\n');

test('a passing plan that was never shown gets the pass count and the show hint', () => {
  const ctx = setup(PLAN());
  const msg = run(ctx);
  assert.match(msg, /게이트 통과/);
  assert.match(msg, /띄워라/);
});

test('the identical message is not injected twice in a row', () => {
  const ctx = setup(PLAN());
  assert.ok(run(ctx));
  assert.strictEqual(run(ctx), '');
});

test('the show record is read from the plan repo, not the workspace', () => {
  const ctx = setup(PLAN());
  viewer.recordShown(ctx.repo, '2026-09-14-x', 'artifact', 'https://claude.ai/code/artifact/abc');
  const msg = run(ctx);
  assert.match(msg, /게이트 통과/);
  assert.ok(!/띄워라/.test(msg), msg);
});

test('an approved plan with nothing wrong is silent', () => {
  const ctx = setup(PLAN('status: approved'));
  assert.strictEqual(run(ctx), '');
});

test('an approved plan still reports a real problem', () => {
  const ctx = setup(PLAN('status: executing') + '\n로그: C:\\Users\\someone\\secret\\run.log\n');
  assert.match(run(ctx), /절대경로/);
});

test('a 조사보고 is not asked for an execution ledger', () => {
  const ctx = setup('---\ncreated: 2026-09-14\nkind: 조사보고\nplanner_model: fable\n---\n\n## 🎯 질문\n- 어느 쪽이 싼가\n\n## 📊 근거\n- a\n\n## 💡 결론\n- b\n');
  const msg = run(ctx);
  assert.match(msg, /조사보고/);
  assert.ok(!/인벤토리\(📋\)가 없거나/.test(msg), msg);
});

test('a non-plan file is ignored', () => {
  const ctx = setup(PLAN());
  const other = path.join(ctx.repo, 'README.md');
  fs.writeFileSync(other, '# x');
  assert.strictEqual(run({ ws: ctx.ws, file: other }), '');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

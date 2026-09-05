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

// The hook is advisory by design: refusing a spawn here would strand a run that
// the user already approved.
test('훅은 경고만 한다 — spawn 을 막지 않는다', () => {
  assert.ok(!/permissionDecision\s*:\s*'deny'/.test(HOOK), '훅이 spawn 을 거부하고 있다');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Lens - coverage ledger unit tests (no external deps, node assert only).
 *
 * The ledger exists because prose ("전량 적어라", 원칙 0) failed twice to stop
 * /cp from dropping work items. These tests pin the invariants that make
 * omission cost something:
 *   1. a missing / empty / unparseable ledger never passes;
 *   2. an item with no status never passes;
 *   3. an *included* item must say where in the plan it landed;
 *   4. an *excluded* item must carry a reason — the bare word "제외" is not one;
 *   5. counting is accurate (total / included / excluded) so the gate can report
 *      "N건 중 M건 반영" instead of a bare pass/fail;
 *   6. column order and language do not change the verdict.
 *
 * Run: node lib/plan-coverage.test.js  → prints results, exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const {
  validatePlanCoverage,
  validatePlanStructure,
  REQUIRED_SECTIONS,
  GRADE_REQUIRED_SECTIONS,
} = require('./plan-manager');

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

/** Build a ledger section from raw row strings. */
const ledger = (...rows) => `
## 📋 작업 인벤토리

| # | 작업 항목 | 출처 | 반영 위치 | 상태 |
|---|---|---|---|---|
${rows.join('\n')}

## 다음 섹션
`;

const GOOD = ledger(
  '| 1 | R2 레거시 제거 | 사용자 요청 | Plan A step3 | 포함 |',
  '| 2 | allowlist 마이그레이션 | Codex 조사 | Plan A step5 | 포함 |',
  '| 3 | 대시보드 캐시 무효화 | Claude 조사 | — | 제외: 별도 task로 분리 |'
);

console.log('\n== coverage ledger ==');

test('happy path — 3 items, 2 included, 1 excluded with reason', () => {
  const r = validatePlanCoverage(GOOD);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.included, 2);
  assert.strictEqual(r.excluded, 1);
});

test('missing section → reject, names the section', () => {
  const r = validatePlanCoverage('# Plan\n\n## 🎯 What\n- 목표\n');
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /인벤토리 섹션이 없다/);
});

test('section present but no table → reject', () => {
  const r = validatePlanCoverage('## 📋 작업 인벤토리\n\n대충 다 했습니다.\n');
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /표가 없다/);
});

test('table with zero data rows → reject', () => {
  const r = validatePlanCoverage(ledger());
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.total, 0);
  assert.match(r.problems.join(' '), /인벤토리가 비었다/);
});

test('empty status → reject', () => {
  const r = validatePlanCoverage(ledger('| 1 | R2 제거 | 사용자 | Plan A step1 |  |'));
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /상태가 비었다/);
});

test('included with empty 반영 위치 → reject (this is the silent-drop case)', () => {
  const r = validatePlanCoverage(ledger('| 1 | R2 제거 | 사용자 | — | 포함 |'));
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.included, 1);
  assert.match(r.problems.join(' '), /반영 위치가 비었다/);
});

test('bare "제외" without reason → reject', () => {
  const r = validatePlanCoverage(ledger('| 1 | 캐시 무효화 | Codex | — | 제외 |'));
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.excluded, 1);
  assert.match(r.problems.join(' '), /제외 사유가 없다/);
});

test('"제외 - 범위 밖" (dash separator) → accepted as a reason', () => {
  const r = validatePlanCoverage(ledger('| 1 | 캐시 무효화 | Codex | — | 제외 - 이번 범위 밖 |'));
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.excluded, 1);
});

test('unrecognized status word → reject with the offending value', () => {
  const r = validatePlanCoverage(ledger('| 1 | R2 제거 | 사용자 | Plan A | 아마도 |'));
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /해석할 수 없다/);
  assert.match(r.problems.join(' '), /아마도/);
});

test('template placeholder rows are skipped, not counted', () => {
  const r = validatePlanCoverage(ledger(
    '| 1 | {작업 항목} | {출처} | {위치} | {상태} |',
    '| 2 | R2 제거 | 사용자 | Plan A step1 | 포함 |'
  ));
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.valid, true);
});

test('English ledger with reordered columns → same verdict', () => {
  const en = `
## 📋 Work Inventory

| Status | # | Item | Where | Source |
|---|---|---|---|---|
| included | 1 | drop R2 legacy | Plan A step3 | user request |
| excluded: split into its own task | 2 | cache busting | — | codex |

## Next
`;
  const r = validatePlanCoverage(en);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.included, 1);
  assert.strictEqual(r.excluded, 1);
});

test('missing a required column → reject before row checks', () => {
  const r = validatePlanCoverage(`
## 📋 작업 인벤토리

| # | 작업 항목 | 상태 |
|---|---|---|
| 1 | R2 제거 | 포함 |
`);
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /필수 칼럼 누락/);
});

test('escaped pipes inside a cell do not split the row', () => {
  const r = validatePlanCoverage(ledger('| 1 | `a \\| b` 파서 | 조사 | Plan A step2 | 포함 |'));
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.valid, true);
});

test('the report is usable as a message — counts survive a failing ledger', () => {
  const r = validatePlanCoverage(ledger(
    '| 1 | a | 사용자 | Plan A step1 | 포함 |',
    '| 2 | b | 조사 | — | 제외 |'
  ));
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.included, 1);
  assert.strictEqual(r.excluded, 1);
});

console.log('\n== structure gate wiring ==');

console.log('\n== grade floor is additive, not subtractive (v3.34) ==');

test('the floor is six sections and carries no ceremony', () => {
  assert.deepStrictEqual(
    REQUIRED_SECTIONS,
    ['Goal', 'Why', 'Inventory', 'Plan A', 'Verification', 'DoNotChange'],
  );
  // These four were the most-missing in /cp's own output. Three left the floor;
  // DoNotChange stayed because the harness cannot know which paths this task
  // must not touch.
  for (const dropped of ['Non-Goals', 'Alternatives', 'OpenQuestions', 'Status']) {
    assert.ok(!REQUIRED_SECTIONS.includes(dropped), `${dropped} must not be in the floor`);
  }
});

test('deep adds the three sections that irreversible work cannot skip', () => {
  assert.deepStrictEqual(GRADE_REQUIRED_SECTIONS.deep, ['Non-Goals', 'Alternatives', 'Risks']);
  const bare = '## 🎯 목표\nx\n';
  const deepMissing = validatePlanStructure(bare, 'deep').missing;
  for (const s of ['Non-Goals', 'Alternatives', 'Risks']) {
    assert.ok(deepMissing.includes(s), `deep should require ${s}`);
  }
});

test('a non-deep grade is not asked for the deep-only sections', () => {
  const bare = '## 🎯 목표\nx\n';
  for (const grade of [undefined, 'standard', 'fast', 'anything-else']) {
    const missing = validatePlanStructure(bare, grade).missing;
    for (const s of ['Non-Goals', 'Alternatives', 'Risks']) {
      assert.ok(!missing.includes(s), `grade=${grade} should not require ${s}`);
    }
  }
});

test('an unknown grade falls back to the floor rather than throwing', () => {
  const r = validatePlanStructure('## 🎯 목표\nx\n', 'no-such-grade');
  assert.strictEqual(typeof r.valid, 'boolean');
  assert.ok(r.missing.includes('DoNotChange'));
});

test('Inventory is a required section at every grade', () => {
  assert.ok(REQUIRED_SECTIONS.includes('Inventory'));
  for (const grade of ['fast', 'standard', 'deep']) {
    const r = validatePlanStructure('## 🎯 목표\nx\n', grade);
    assert.ok(r.missing.includes('Inventory'), `${grade} should require Inventory`);
  }
});

test('a document carrying the ledger satisfies the Inventory section check', () => {
  const r = validatePlanStructure(GOOD, 'standard');
  assert.ok(!r.missing.includes('Inventory'));
});

const withFm = (fmLines, body) => `---\n${fmLines}\n---\n\n# Plan\n${body}`;

test('pre-v3.32 doc without a ledger → warning, not a hard fail', () => {
  const r = validatePlanStructure(withFm('plan_id: 2026-08-14-old\ncreated: 2026-08-14', '## 🎯 목표\nx\n'), 'standard');
  assert.ok(!r.missing.includes('Inventory'), 'legacy doc must not hard-fail on Inventory');
  assert.match(r.warnings.join(' '), /v3\.32 이전 문서/);
});

test('post-v3.32 doc without a ledger → hard fail (no grandfathering forward)', () => {
  const r = validatePlanStructure(withFm('plan_id: 2026-09-01-new\ncreated: 2026-09-01', '## 🎯 목표\nx\n'), 'standard');
  assert.ok(r.missing.includes('Inventory'));
  assert.deepStrictEqual(r.warnings, []);
});

test('legacy date is read from `date:` too (deep-grade frontmatter variant)', () => {
  const r = validatePlanStructure(withFm('planner: cp\ngrade: deep\ndate: 2026-08-08', '## 🎯 목표\nx\n'), 'deep');
  assert.ok(!r.missing.includes('Inventory'));
});

test('doc dated exactly on the cutoff is NOT legacy', () => {
  const r = validatePlanStructure(withFm('created: 2026-08-17', '## 🎯 목표\nx\n'), 'standard');
  assert.ok(r.missing.includes('Inventory'));
});

test('no readable date → treated as current, not exempt', () => {
  const r = validatePlanStructure(withFm('status: planned', '## 🎯 목표\nx\n'), 'standard');
  assert.ok(r.missing.includes('Inventory'));
});

test('no frontmatter at all → treated as current, not exempt', () => {
  const r = validatePlanStructure('# Plan\n\n## 🎯 목표\nx\n', 'standard');
  assert.ok(r.missing.includes('Inventory'));
});

test('grandfathering covers only Inventory — other missing sections still fail', () => {
  const r = validatePlanStructure(withFm('created: 2026-08-14', '## 🎯 목표\nx\n'), 'standard');
  assert.ok(r.missing.includes('Why'), 'legacy exemption must not leak to other sections');
  assert.strictEqual(r.valid, false);
});

test('CRLF documents parse identically to LF (Windows checkouts)', () => {
  const crlf = s => s.replace(/\n/g, '\r\n');
  assert.strictEqual(validatePlanCoverage(crlf(GOOD)).valid, true);
  assert.strictEqual(validatePlanCoverage(crlf(GOOD)).total, 3);
  const legacy = crlf(withFm('plan_id: 2026-08-14-old\ncreated: 2026-08-14', '## 🎯 목표\nx\n'));
  assert.ok(!validatePlanStructure(legacy, 'standard').missing.includes('Inventory'));
});

test('the in-flight repo plans keep executing under /cc entry gate', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'docs', 'tasks');
  const docs = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  assert.ok(docs.length > 0, 'expected in-flight plan docs to test against');
  for (const f of docs) {
    const r = validatePlanStructure(fs.readFileSync(path.join(dir, f), 'utf-8'), 'standard');
    assert.ok(!r.missing.includes('Inventory'), `${f} must not be blocked by the new section`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

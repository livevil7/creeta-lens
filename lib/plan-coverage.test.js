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
  deriveTodoItems,
  generatePlanContent,
  findRelatedDocs,
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

console.log('\n== prior-work discovery (v3.34) ==');

{
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const mkRepo = files => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-related-'));
    for (const [sub, name] of files) {
      const d = path.join(root, 'docs', sub);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, name), '# x\n');
    }
    return root;
  };

  test('a prior document on the same subject is surfaced', () => {
    const root = mkRepo([['history', '2026-01-02-branch-lifecycle-cleanup.md']]);
    const hits = findRelatedDocs(root, '2026-08-22-branch-lifecycle-followup');
    assert.strictEqual(hits.length, 1);
    assert.ok(hits[0].shared.includes('branch') && hits[0].shared.includes('lifecycle'));
  });

  test('ranking is by shared-keyword count, strongest first', () => {
    const root = mkRepo([
      ['history', '2026-01-01-branch-only.md'],
      ['history', '2026-01-02-branch-lifecycle-cleanup.md'],
    ]);
    const hits = findRelatedDocs(root, 'branch lifecycle cleanup');
    assert.ok(hits[0].file.includes('branch-lifecycle-cleanup'), hits.map(h => h.file).join(','));
    assert.ok(hits[0].score > hits[1].score);
  });

  test('history outranks tasks when the overlap is equal', () => {
    const root = mkRepo([
      ['tasks', '2026-01-01-widget-rewrite.md'],
      ['history', '2026-01-02-widget-rewrite.md'],
    ]);
    assert.strictEqual(findRelatedDocs(root, 'widget rewrite')[0].dir, 'history');
  });

  test('the document just written is excluded from its own results', () => {
    const root = mkRepo([['tasks', '2026-08-22-widget-rewrite.md']]);
    const self = path.join(root, 'docs', 'tasks', '2026-08-22-widget-rewrite.md');
    assert.deepStrictEqual(findRelatedDocs(root, '2026-08-22-widget-rewrite', { exclude: self }), []);
  });

  test('dates and stopwords do not create matches', () => {
    // Two unrelated documents that share only a date and the word 작업.
    const root = mkRepo([['history', '2026-08-22-작업-정리.md']]);
    assert.deepStrictEqual(findRelatedDocs(root, '2026-08-22-작업-계획'), []);
  });

  test('a repo with no docs folders returns nothing instead of throwing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-related-empty-'));
    assert.deepStrictEqual(findRelatedDocs(root, 'anything at all'), []);
  });

  test('paths come back with forward slashes so they stay clickable', () => {
    const root = mkRepo([['history', '2026-01-02-branch-lifecycle.md']]);
    const hits = findRelatedDocs(root, 'branch lifecycle');
    assert.ok(!hits[0].file.includes('\\'), hits[0].file);
    assert.ok(hits[0].file.startsWith('docs/history/'));
  });

  test('the limit is respected', () => {
    const root = mkRepo(
      Array.from({ length: 8 }, (_, i) => ['history', `2026-01-0${i + 1}-widget-thing-${i}.md`]),
    );
    assert.strictEqual(findRelatedDocs(root, 'widget thing', { limit: 3 }).length, 3);
  });
}


// ── execution todo derivation (v3.38) ─────────────────────
//
// The failure these pin: /cp produced a three-item todo list for a plan that
// carried fourteen inventory rows, because Phase 4 was prose and nothing
// counted. The derivation must be complete (every included row, every step),
// must refuse to silently return a short list, and must not mistake template
// leftovers or commentary bullets for work.

console.log('\n== execution todo derivation ==');

const PLAN = [
  '## 🎯 What — 목표',
  '- 방문자가 이메일로 가입을 끝까지 마칠 수 있다',
  '- 가입 실패 시 무엇이 잘못됐는지 화면에서 안다',
  '',
  '## 📋 작업 인벤토리',
  '',
  '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
  '|---|---|---|---|---|',
  '| 1 | 가입 폼 검증 | 사용자 요청 | Plan A step1 | 포함 |',
  '| 2 | 인증메일 발송 | Codex 조사 | Plan A step2 | 포함 |',
  '| 3 | 소셜 로그인 | 대화 언급 | — | 제외: 이번 범위 밖 |',
  '',
  '## 🛠 How',
  '',
  '### Plan A — 권장 경로',
  '',
  '#### 왜 이게 1순위인가',
  '기존 컨벤션에 맞는다.',
  '',
  '#### 단계',
  '- [ ] step 1: 폼 검증 추가',
  '- [ ] step 2: 메일 발송 배선',
  '- [ ] step 3: 실패 메시지 노출',
  '',
  '#### 막힐 수 있는 지점 (→ Plan B 트리거)',
  '- SMTP 차단: 발송 실패 → Plan B',
  '',
  '### Plan B — Fallback',
  '',
  '#### 단계',
  '- [ ] 외부 메일 서비스로 우회',
  '',
].join('\n');

test('happy path — 성공기준 2 + 포함 2 + 단계 3 = 7', () => {
  const r = deriveTodoItems(PLAN);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.goals.length, 2);
  assert.strictEqual(r.inventory.length, 2);
  assert.strictEqual(r.steps.length, 3);
  assert.strictEqual(r.total, 7);
});

test('제외 항목은 실행 Todo 에 들어가지 않는다', () => {
  const r = deriveTodoItems(PLAN);
  assert.ok(!r.inventory.some(i => i.includes('소셜')), r.inventory.join(' | '));
});

// Plan B also has a `#### 단계`. Picking the wrong one would register the
// fallback path as the work to do — a silent, plausible-looking wrong list.
test('Plan B 의 단계를 Plan A 로 착각하지 않는다', () => {
  const r = deriveTodoItems(PLAN);
  assert.ok(!r.steps.some(t => t.includes('외부 메일')), r.steps.join(' | '));
  assert.ok(r.steps[0].includes('폼 검증'), r.steps[0]);
});

// `#### 왜 이게 1순위인가` and the Plan B trigger list are prose, not work.
test('Plan A 안의 해설 불릿은 단계로 세지 않는다', () => {
  const r = deriveTodoItems(PLAN);
  assert.strictEqual(r.steps.length, 3);
  assert.ok(!r.steps.some(t => t.includes('SMTP')), r.steps.join(' | '));
});

test('인벤토리가 없으면 파생 실패 — 조용히 짧은 목록을 내지 않는다', () => {
  // Drop the whole section, not just its heading: SECTION_ALIASES.Inventory
  // matches on the 📋 emoji alone, so a renamed heading still finds the table.
  const noInv = PLAN.split('\n')
    .filter(l => !l.startsWith('## 📋') && !l.startsWith('|'))
    .join('\n');
  const r = deriveTodoItems(noInv);
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /Phase 2.45 회귀/);
});

test('성공 기준이 없으면 파생 실패', () => {
  const r = deriveTodoItems(PLAN.replace('## 🎯 What — 목표', '## 서문'));
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /Phase 0 회귀/);
});

test('Plan A 가 없으면 파생 실패', () => {
  const r = deriveTodoItems(PLAN.replace('### Plan A — 권장 경로', '### 나중에'));
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /Phase 1 회귀/);
});

// Older plans put the checklist straight under Plan A with no `#### 단계`.
// Reporting zero steps for those would send a correct plan back to Phase 1.
test('#### 단계 헤딩이 없으면 Plan A 블록 전체에서 체크박스를 줍는다', () => {
  const legacy = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '### Plan A', '- [ ] 하나 하기', '- [ ] 둘 하기', '',
    '### Plan B', '- [ ] 우회', '',
  ].join('\n');
  const r = deriveTodoItems(legacy);
  assert.strictEqual(r.steps.length, 2);
  assert.strictEqual(r.valid, true);
});

// `- [ ] {step 설명}` is an unfilled template line; counting it produces a todo
// item nobody can act on and a count that looks healthy.
test('미치환 {placeholder} 단계는 세지 않는다', () => {
  const r = deriveTodoItems(PLAN.replace('- [ ] step 3: 실패 메시지 노출', '- [ ] {step 3}'));
  assert.strictEqual(r.steps.length, 2);
});

test('CRLF 문서도 동일하게 파생된다 (Windows 체크아웃)', () => {
  const r = deriveTodoItems(PLAN.split('\n').join('\r\n'));
  assert.strictEqual(r.total, 7);
  assert.strictEqual(r.valid, true);
});

// The parser was written against the /cp markdown template (`### Plan A` with
// `#### 단계`) while generatePlanContent() emits `## Plan A` with `### Steps`.
// Every plan Lens generates itself is the second shape, so the new Phase 5.0
// gate would have bounced all of them back to Phase 1 for "having no steps".
// Driving the generator directly is what keeps the two from drifting again.
for (const lang of ['ko', 'en', 'de']) {
  test(`generatePlanContent(${lang}) 가 만든 계획서에서 Plan A 단계를 읽는다`, () => {
    const doc = generatePlanContent({
      id: '2026-09-05-x', title: 'T', language: lang,
      goal: { deliverables: ['목표 하나', '목표 둘'], done: '끝' },
      planA: { rationale: 'r', steps: ['하나', '둘', '셋'], failPoints: ['막힘'] },
      planB: { trigger: 't', rationale: 'r2', steps: ['우회 하나'] },
    });
    const r = deriveTodoItems(doc);
    assert.deepStrictEqual(r.steps, ['하나', '둘', '셋']);
    assert.strictEqual(r.goals.length, 2);
    // Plan B carries a steps heading of its own at the same depth.
    assert.ok(!r.steps.includes('우회 하나'), r.steps.join(' | '));
  });
}

// The /cp template ships `- {사람 언어 목표 1 — 예: …}` in the Goal section. The
// steps path dropped such leftovers and the goals path did not, so a plan that
// was still all template derived a healthy-looking todo count and passed gate 9.
// validatePlanStructure catches leftovers too, but only at Phase 5.0 — after the
// list has already been built.
test('성공 기준의 {자리표시자} 는 Todo 로 파생되지 않는다', () => {
  const r = deriveTodoItems(PLAN.replace('- 가입 실패 시 무엇이 잘못됐는지 화면에서 안다', '- {사람 언어 목표 2}'));
  assert.strictEqual(r.goals.length, 1);
  assert.ok(!r.goals.some(g => g.includes('사람 언어 목표')), r.goals.join(' | '));
});

test('성공 기준이 전부 자리표시자면 파생 실패', () => {
  const r = deriveTodoItems(
    PLAN.replace('- 방문자가 이메일로 가입을 끝까지 마칠 수 있다', '- {목표 1}')
        .replace('- 가입 실패 시 무엇이 잘못됐는지 화면에서 안다', '- {목표 2}'));
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /자리표시자/);
});

test('인벤토리의 {자리표시자} 행도 세지 않는다', () => {
  const r = deriveTodoItems(PLAN.replace('| 1 | 가입 폼 검증 | 사용자 요청 | Plan A step1 | 포함 |', '| 1 | {항목} | 사용자 요청 | Plan A step1 | 포함 |'));
  assert.strictEqual(r.inventory.length, 1);
});

// The hole: a table of nothing but leftovers filters down to zero rows with no
// parse problem, so the "did anything survive?" check was skipped entirely and
// goals+steps alone carried the document to valid:true — while the very same
// leftovers in goals or steps fail outright. Every source must yield real work.
// Follow-on to the sibling-headings fix: joining the blocks before extracting
// let one block's checkboxes out-rank another block's numbered list, so a plan
// mixing the two styles lost a whole step block — silently, at valid:true.
test('단계 블록마다 표기가 달라도(체크박스 + 번호목록) 전부 모은다', () => {
  const mixed = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### Step 1', '- [ ] 체크박스 하나', '',
    '### Step 2', '1. 번호 하나', '2. 번호 둘', '',
  ].join('\n');
  const r = deriveTodoItems(mixed);
  assert.deepStrictEqual(r.steps, ['체크박스 하나', '번호 하나', '번호 둘']);
});

// The nested variant of the same defect: one `### Steps` heading whose children
// use different notations. Extracting per block was not enough — the rule has to
// be local to a list run.
test('한 단계 블록 안에서 하위 제목마다 표기가 달라도 전부 모은다', () => {
  const nested = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### Steps', '',
    '#### Step 1', '- [ ] 체크 하나', '',
    '#### Step 2', '1. 번호 하나', '2. 번호 둘', '',
  ].join('\n');
  const r = deriveTodoItems(nested);
  assert.deepStrictEqual(r.steps, ['체크 하나', '번호 하나', '번호 둘']);
  assert.strictEqual(r.valid, true);
});

// Within one run the checkbox rule still earns its keep: a plain bullet directly
// under a checkbox is that step's explanation, not another step.
test('체크박스 바로 아래 설명 불릿은 단계로 세지 않는다', () => {
  const withNote = PLAN.replace('- [ ] step 2: 메일 발송 배선', '- [ ] step 2: 메일 발송 배선\n  - 이유: SMTP 설정이 이미 있다');
  const r = deriveTodoItems(withNote);
  assert.strictEqual(r.steps.length, 3);
  assert.ok(!r.steps.some(t => t.includes('이유:')), r.steps.join(' | '));
});

// The third variant of the same miss: a blank line between a checklist and a
// numbered list. Runs treated them as one; indentation scope does not.
test('빈 줄로 갈라진 체크리스트 + 번호 목록도 전부 모은다', () => {
  const blanks = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 체크 하나', '', '1. 번호 하나', '2. 번호 둘', '',
  ].join('\n');
  const r = deriveTodoItems(blanks);
  assert.deepStrictEqual(r.steps, ['체크 하나', '번호 하나', '번호 둘']);
});

// …and the boundary that keeps the exclusion honest: same indent is a step,
// deeper indent is the previous step's note. Blank lines do not change that.
test('빈 줄이 있어도 더 들여쓴 불릿은 여전히 설명이다', () => {
  const note = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 체크 하나', '', '  - 이유: 설명이다', '- [ ] 체크 둘', '',
  ].join('\n');
  const r = deriveTodoItems(note);
  assert.deepStrictEqual(r.steps, ['체크 하나', '체크 둘']);
});

// Plan A can carry a checklist directly *and* a headed step block below it.
// Taking only the headed blocks dropped the loose half — silently, at valid:true.
test('Plan A 바로 아래 체크리스트 + 하위 단계 제목이 같이 있으면 둘 다 모은다', () => {
  const both = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '- [ ] 머리말 단계', '',
    '### Step 2', '- [ ] 하위 단계', '',
  ].join('\n');
  const r = deriveTodoItems(both);
  assert.deepStrictEqual(r.steps, ['머리말 단계', '하위 단계']);
});

// …but a framing sentence in that position is not a step. Only checkboxes are
// unambiguous enough to harvest from outside a steps heading.
test('Plan A 머리말의 일반 불릿은 단계로 세지 않는다', () => {
  const framing = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '- 이 경로는 기존 컨벤션을 전제로 한다', '',
    '### 단계', '- [ ] 진짜 단계', '',
  ].join('\n');
  const r = deriveTodoItems(framing);
  assert.deepStrictEqual(r.steps, ['진짜 단계']);
});

// The rule in one document: a checklist under a heading that is not "Steps",
// a checklist and a numbered list under one that is, and a trigger bullet that
// must stay out. Six earlier shapes are pinned above; this is the summary case.
test('Preparation 체크박스 + Steps 목록은 모으고 트리거 불릿은 뺀다', () => {
  const doc = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### Preparation', '- [ ] DB 백업', '',
    '### Steps', '- [ ] 마이그레이션 실행', '1. 스키마 확인', '',
    '### 막힐 수 있는 지점', '- 커넥션 풀 고갈 → Plan B', '',
  ].join('\n');
  const r = deriveTodoItems(doc);
  assert.deepStrictEqual(r.steps, ['DB 백업', '마이그레이션 실행', '스키마 확인']);
  assert.strictEqual(r.valid, true);
});

// A steps section may be subdivided. Tracking "are we in steps?" as a boolean
// walked out of the section at its first child heading and dropped everything
// below it — silently, at valid:true.
test('단계 섹션이 하위 제목으로 나뉘어도 범위를 벗어나지 않는다', () => {
  const nested = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### Steps', '',
    '#### Database', '- [ ] DB 백업', '',
    '#### Application', '1. 앱 배포', '',
    '### 막힐 수 있는 지점', '- 커넥션 풀 고갈 → Plan B', '',
  ].join('\n');
  const r = deriveTodoItems(nested);
  assert.deepStrictEqual(r.steps, ['DB 백업', '앱 배포']);
  // …and leaving the section at a sibling heading still works.
  assert.ok(!r.steps.some(t => t.includes('커넥션')), r.steps.join(' | '));
});

// Both review lanes flagged this independently: a lenient "any bullet in Plan A"
// fallback turned Plan B triggers into execution steps and returned valid:true.
// A plan whose steps cannot be told apart from its prose has no steps, and the
// gate has to say so — a wrong list is worse than a request to mark the list.
test('단계가 비고 트리거 불릿만 있으면 그것을 단계로 승격하지 않는다', () => {
  const empty = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '',
    '### 막힐 수 있는 지점', '- 커넥션 풀 고갈 → Plan B', '',
  ].join('\n');
  const r = deriveTodoItems(empty);
  assert.deepStrictEqual(r.steps, []);
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /Plan A 에 단계가 없다/);
});

// Plan documents are full of ```bash examples. A `# Run the backup` comment
// inside one reads as an h1 to a line-based heading scan, which truncated Plan A
// at the fence and dropped every step below it — silently, at valid:true.
test('코드 펜스 안의 # 주석을 제목으로 읽지 않는다', () => {
  const fenced = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 하나', '',
    '```ash', '# Run the backup', 'pg_dump db > out.sql',
    '- [ ] 예시 안의 가짜 단계', '```', '',
    '- [ ] 둘', '- [ ] 셋', '',
  ].join('\n');
  const r = deriveTodoItems(fenced);
  // The steps after the fence survive…
  assert.deepStrictEqual(r.steps, ['하나', '둘', '셋']);
  // …and a checkbox that is part of a command example is not work.
  assert.ok(!r.steps.some(t => t.includes('가짜')), r.steps.join(' | '));
});

// CommonMark: a closing fence uses the same character and is at least as long as
// the opener. Toggling on any fence line ends a four-backtick block at the first
// three-backtick line inside it, spilling the example back into the document.
test('네 겹 펜스 안의 세 겹 펜스를 종료로 오인하지 않는다', () => {
  const B = String.fromCharCode(96);
  const nested = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 하나', '',
    B.repeat(4) + 'markdown',
    '# 이건 예시 안의 제목이다',
    B.repeat(3) + 'bash', 'echo hi', B.repeat(3),
    B.repeat(4), '',
    '- [ ] 둘', '- [ ] 셋', '',
  ].join('\n');
  const r = deriveTodoItems(nested);
  assert.deepStrictEqual(r.steps, ['하나', '둘', '셋']);
});

// CommonMark closing rule, part two: a closer carries no info string. ```bash
// inside an open block neither opens nor closes — it is a line of the example.
test('열린 블록 안의 ```bash 를 종료로 오인하지 않는다', () => {
  const B = String.fromCharCode(96);
  const doc = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 하나', '',
    B.repeat(3) + 'sh', 'echo a', B.repeat(3) + 'bash', '# 주석', B.repeat(3), '',
    '- [ ] 둘', '',
  ].join('\n');
  assert.deepStrictEqual(deriveTodoItems(doc).steps, ['하나', '둘']);
});

// CommonMark list markers are -, * and +. A parser that took only `-` dropped
// whole steps, and — once the step parser accepted all three — would have
// reported "no success criteria" for a document whose steps parsed fine.
test('-, *, + 세 가지 목록 마커를 모두 읽는다', () => {
  const doc = [
    '## 🎯 What', '+ 목표 하나', '* 목표 둘', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 하나', '* [ ] 둘', '+ [ ] 셋', '',
  ].join('\n');
  const r = deriveTodoItems(doc);
  assert.deepStrictEqual(r.goals, ['목표 하나', '목표 둘']);
  assert.deepStrictEqual(r.steps, ['하나', '둘', '셋']);
  assert.strictEqual(r.valid, true);
});

// CommonMark allows up to three spaces of indent on an ATX heading. Anchoring
// hard at column 0 meant an indented ` ## Plan B` never closed Plan A, so the
// fallback path's conditional steps joined the default execution list.
test('세 칸까지 들여쓴 제목도 제목으로 읽는다 (Plan A 범위가 닫힌다)', () => {
  const doc = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 기본 배포', '',
    ' ## Plan B — Fallback', '',
    ' ### 단계', '- [ ] 대체 배포', '',
  ].join('\n');
  const r = deriveTodoItems(doc);
  assert.deepStrictEqual(r.steps, ['기본 배포']);
  assert.ok(!r.steps.some(t => t.includes('대체')), r.steps.join(' | '));
});

// Ordered task lists (`1. [ ] …`) are valid GFM. Reading them as plain bullets
// meant a numbered Preparation checklist was dropped for sitting outside a steps
// heading — real work missing while the gate reported valid:true.
test('번호 체크박스(1. [ ] …)도 단계로 읽는다', () => {
  const doc = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### Preparation', '1. [ ] DB 백업', '2. [ ] 복원 확인', '',
    '### Steps', '- [ ] 배포', '',
  ].join('\n');
  assert.deepStrictEqual(deriveTodoItems(doc).steps, ['DB 백업', '복원 확인', '배포']);
});

// The /cp template's guidance comments span several lines. Stripping comments
// per line left their insides in the document, so a `##` inside one closed Plan A
// early and swallowed every step below it.
test('여러 줄 HTML 주석 안의 제목을 제목으로 읽지 않는다', () => {
  const doc = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계', '- [ ] 하나', '',
    '<!-- 참고: 아래 형식을 따르되', '## Plan B 로 넘어가지 마라 -->', '',
    '- [ ] 둘', '',
  ].join('\n');
  assert.deepStrictEqual(deriveTodoItems(doc).steps, ['하나', '둘']);
});

// A backtick fence's info string may not contain a backtick, so a sentence that
// opens with inline code is prose — not an open code block swallowing the rest.
test('인라인 코드로 시작하는 설명문을 열린 코드블록으로 오인하지 않는다', () => {
  const B = String.fromCharCode(96);
  const doc = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 단계',
    B.repeat(3) + 'bash' + B.repeat(3) + ' 로 실행한다',
    '- [ ] 하나', '- [ ] 둘', '',
  ].join('\n');
  assert.deepStrictEqual(deriveTodoItems(doc).steps, ['하나', '둘']);
});

test('인벤토리가 자리표시자뿐이면 파생 실패 (목표·단계만으로 통과하지 않는다)', () => {
  const r = deriveTodoItems(
    PLAN.replace('| 1 | 가입 폼 검증 | 사용자 요청 | Plan A step1 | 포함 |', '| 1 | {항목 A} | 사용자 요청 | Plan A step1 | 포함 |')
        .replace('| 2 | 인증메일 발송 | Codex 조사 | Plan A step2 | 포함 |', '| 2 | {항목 B} | Codex 조사 | Plan A step2 | 포함 |')
        .replace('| 3 | 소셜 로그인 | 대화 언급 | — | 제외: 이번 범위 밖 |', '| 3 | {항목 C} | 대화 언급 | — | 제외: 밖 |'));
  assert.strictEqual(r.inventory.length, 0);
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /실행할 항목이 없다/);
});

// A plan is free to split its checklist across sibling headings. Taking only the
// first block dropped the rest and still reported valid:true — an incomplete
// execution list walking through a mandatory gate. (Codex review lane, v3.38.)
test('같은 깊이의 단계 제목이 여러 개면 전부 모은다', () => {
  const split = [
    '## 🎯 What', '- 목표 하나', '',
    '## 📋 작업 인벤토리', '',
    '| # | 작업 항목 | 출처 | 반영 위치 | 상태 |',
    '|---|---|---|---|---|',
    '| 1 | 항목 하나 | 요청 | Plan A | 포함 |', '',
    '## Plan A — 권장 경로', '',
    '### 왜 이게 1순위인가', '근거', '',
    '### Step 1', '- [ ] 하나', '- [ ] 둘', '',
    '### Step 2', '- [ ] 셋', '',
    '### 막힐 수 있는 지점', '- 어딘가 막힌다', '',
    '## Plan B — Fallback', '', '### 단계', '- [ ] 우회', '',
  ].join('\n');
  const r = deriveTodoItems(split);
  assert.deepStrictEqual(r.steps, ['하나', '둘', '셋']);
  assert.ok(!r.steps.includes('우회'), r.steps.join(' | '));
  assert.strictEqual(r.valid, true);
});

test('인벤토리가 전부 제외면 파생 실패 (사유가 다르다)', () => {
  const r = deriveTodoItems(
    PLAN.replace('| 1 | 가입 폼 검증 | 사용자 요청 | Plan A step1 | 포함 |', '| 1 | 가입 폼 검증 | 사용자 요청 | — | 제외: 다음 분기 |')
        .replace('| 2 | 인증메일 발송 | Codex 조사 | Plan A step2 | 포함 |', '| 2 | 인증메일 발송 | Codex 조사 | — | 제외: 다음 분기 |'));
  assert.strictEqual(r.valid, false);
  assert.match(r.problems.join(' '), /전부 제외다/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Lens - /cp 질문 블록(templates/cp-questions.html) 테스트 (node assert only).
 *
 * 이 블록은 /cp 가 계획서 페이지에 그대로 붙이고, 대표가 고른 답은
 * sendToClaude 댓글 한 건으로 세션에 돌아온다. 세션은 그 글을 줄 단위로 읽으므로
 * 지켜야 할 것은 글의 모양이다:
 *   1. 첫 줄 = `[Lens /cp 답변] <plan_id>` — 세션이 다른 댓글과 구별하는 표지;
 *   2. 질문마다 한 줄 `[id] 질문 → 답` — 안 고른 질문도 `(답 없음)` 으로 남는다;
 *   3. 댓글이 거부하는 제어문자를 뺀다(줄바꿈·탭은 남긴다);
 *   4. 예시 JSON 이 파싱되고 승인 질문의 선택지가 계약 카드 8 의 셋이다.
 *
 * Run: node templates/cp-questions.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'cp-questions.html'), 'utf8');
const json = html.match(/<script type="application\/json" id="lens-cp-questions">([\s\S]*?)<\/script>/)[1];
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx = {};
vm.runInNewContext(code, ctx); // document 가 없으니 DOM 부분은 건너뛴다

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const data = {
  plan_id: '2026-09-24-demo',
  questions: [
    { id: 'd1', text: '어느 쪽으로 할까요?', type: 'choice', options: ['A (추천)', 'B'], other: true },
    { id: 'd2', text: '같이 할 것', type: 'multi', options: ['X', 'Y', 'Z'] },
    { id: 'd3', text: '하고 싶은 말', type: 'text' },
    { id: 'approve', text: '진행할까요?', type: 'choice', options: ['지금 실행', '고칠 곳 있음', '계획만 보관'] },
  ],
};

t('첫 줄은 표지 + plan_id', () => {
  const out = ctx.lensCpAnswerText(data, {});
  assert.strictEqual(out.split('\n')[0], '[Lens /cp 답변] 2026-09-24-demo');
});

t('질문마다 한 줄, 안 고른 질문은 (답 없음)', () => {
  const lines = ctx.lensCpAnswerText(data, {}).split('\n');
  assert.strictEqual(lines.length, 1 + data.questions.length);
  assert.strictEqual(lines[1], '[d1] 어느 쪽으로 할까요? → (답 없음)');
});

t('고른 것 · 여러 개 · 적은 말이 한 줄에 모인다', () => {
  const out = ctx.lensCpAnswerText(data, {
    d1: { picked: ['기타 — 직접 적기'], text: 'C 로 해 주세요' },
    d2: { picked: ['X', 'Z'], text: '' },
    d3: { picked: [], text: '빨리' },
    approve: { picked: ['고칠 곳 있음'], text: '3번 빼기' },
  }).split('\n');
  assert.strictEqual(out[1], '[d1] 어느 쪽으로 할까요? → 기타 — 직접 적기 — C 로 해 주세요');
  assert.strictEqual(out[2], '[d2] 같이 할 것 → X, Z');
  assert.strictEqual(out[3], '[d3] 하고 싶은 말 → 빨리');
  assert.strictEqual(out[4], '[approve] 진행할까요? → 고칠 곳 있음 — 3번 빼기');
});

t('제어문자는 빼고 줄바꿈·탭은 남긴다', () => {
  const out = ctx.lensCpAnswerText(data, { d3: { picked: [], text: 'a\u0007b\r\nc\td' } });
  assert.ok(out.includes('[d3] 하고 싶은 말 → ab\nc\td'), out);
  assert.ok(!/[\u0000-\u0008\u000B-\u001F\u007F]/.test(out));
});

t('other:true 는 적는 칸 달린 「기타」를 덧붙인다', () => {
  const opts = ctx.lensCpOptions(data.questions[0]);
  assert.deepStrictEqual(opts.map(o => o.label), ['A (추천)', 'B', '기타 — 직접 적기']);
  assert.strictEqual(opts[2].text, true);
});

t('예시 JSON 이 파싱되고 승인 선택지가 셋이다', () => {
  const ex = JSON.parse(json);
  const approve = ex.questions.find(q => q.id === 'approve');
  assert.deepStrictEqual(ctx.lensCpOptions(approve).map(o => o.label), ['지금 실행', '고칠 곳 있음', '계획만 보관']);
  assert.ok(ex.questions.every(q => /^[A-Za-z0-9_]+$/.test(q.id)));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

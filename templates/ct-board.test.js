#!/usr/bin/env node
/**
 * Lens - /ct 관제판(templates/ct-board.html) 테스트 (node assert only).
 *
 * 관제판은 새 답 DB 를 만들지 않고 /cp 질문 블록을 그대로 실어 답을 sendToClaude 로
 * 받는다. 지켜야 할 것:
 *   1. templates/cp-questions.html 의 블록(<section id="lens-cp-ask"> 부터 끝까지)이 원문 그대로 들어 있다;
 *   2. JSON 두 개가 파싱되고, 모든 실행 script 가 구문 오류 없이 컴파일된다
 *      (10-12 관제판 결정 목록을 손으로 고치다 쉼표가 빠져 결정 칸이 0개로 보인 사고의 재발 방지).
 *
 * Run: node templates/ct-board.test.js  → exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const board = fs.readFileSync(path.join(__dirname, 'ct-board.html'), 'utf8');
const cp = fs.readFileSync(path.join(__dirname, 'cp-questions.html'), 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

t('cp-questions 블록 원문이 그대로 들어 있다', () => {
  const block = cp.slice(cp.indexOf('<section id="lens-cp-ask"')).trim();
  assert.ok(block.length > 1000);
  assert.ok(board.includes(block), 'ct-board.html 의 질문 블록이 cp-questions.html 과 다르다 — 블록을 통째로 다시 붙인다');
});

t('JSON 두 개가 파싱된다', () => {
  for (const id of ['lens-ct-board', 'lens-cp-questions']) {
    const m = board.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
    assert.ok(m, `${id} 없음`);
    const data = JSON.parse(m[1]);
    if (id === 'lens-ct-board') assert.ok(Array.isArray(data.sessions) && Array.isArray(data.deploy));
    else assert.ok(Array.isArray(data.questions) && data.questions.length > 0);
  }
});

t('실행 script 가 전부 구문 오류 없이 컴파일된다', () => {
  const scripts = [...board.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.strictEqual(scripts.length, 2);
  scripts.forEach(code => new vm.Script(code));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

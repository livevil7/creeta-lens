#!/usr/bin/env node
/**
 * Lens - md-render unit tests (node assert only).
 *
 * The renderer shows a plan to the person approving it, so the invariants are:
 *   1. nothing in the document executes — every character is escaped;
 *   2. the structures a plan is made of (tables, nested/task lists, headings,
 *      code) render as that structure, not as raw text;
 *   3. nothing is dropped — unknown shapes fall through as text.
 *
 * Run: node lib/md-render.test.js
 */

'use strict';

const assert = require('assert');
const { render, renderPage, slug } = require('./md-render');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

console.log('\n[Lens] md-render tests\n');

test('script tags and attributes are escaped, never emitted', () => {
  const { html } = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('a javascript: link stays text', () => {
  const { html } = render('[click](javascript:alert(1))');
  assert.ok(!/<a /.test(html), html);
});

test('an ordinary link and a relative doc link are links', () => {
  const { html } = render('[계획](docs/tasks/x.md) · [url](https://example.com/a?b=1&c=2)');
  assert.ok(html.includes('<a href="docs/tasks/x.md">계획</a>'), html);
  assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'), html);
});

test('headings carry anchors; the first h1 is the title', () => {
  const r = render('# 계획 이름\n\n## 🛠 어떻게 — 방법\n');
  assert.strictEqual(r.title, '계획 이름');
  assert.ok(r.html.includes(`<h2 id="${slug('🛠 어떻게 — 방법')}">`), r.html);
});

test('a table renders as a table, and a pipe inside a code span stays in its cell', () => {
  const { html } = render('| # | 항목 | 상태 |\n|---|---|---|\n| 1 | `grep "a|b"` 확인 | 포함 |\n');
  assert.ok(html.includes('<table>'));
  assert.strictEqual((html.match(/<td>/g) || []).length, 3, html);
  assert.ok(html.includes('<code>grep &quot;a|b&quot;</code>'), html);
});

test('nested and task lists keep their shape', () => {
  const { html } = render('- 하나\n  - 하나의 설명\n- [x] 끝난 일\n- [ ] 남은 일\n1. 첫째\n');
  assert.ok(/<ul>\s*<li>하나<\/li>\s*<ul>\s*<li>하나의 설명<\/li>/.test(html), html);
  assert.ok(html.includes('box done'), html);
  assert.ok(html.includes('<ol>'), html);
});

test('fenced code is escaped verbatim and headings inside it are not headings', () => {
  const { html } = render('```bash\n# not a heading\necho "<b>"\n```\n');
  assert.ok(html.includes('<pre><code># not a heading\necho &quot;&lt;b&gt;&quot;</code></pre>'), html);
  assert.ok(!html.includes('<h1'));
});

test('inline code, bold and strike render', () => {
  const { html } = render('**굵게** `code` ~~지움~~');
  assert.ok(html.includes('<strong>굵게</strong>'));
  assert.ok(html.includes('<code>code</code>'));
  assert.ok(html.includes('<del>지움</del>'));
});

test('blockquote and rule render', () => {
  const { html } = render('> 대표 지적\n> 둘째 줄\n\n---\n');
  assert.ok(html.includes('<blockquote>대표 지적<br>둘째 줄</blockquote>'), html);
  assert.ok(html.includes('<hr>'));
});

test('frontmatter folds into badges instead of a wall of YAML', () => {
  const page = renderPage('---\nstatus: approved\nkind: 개선\nbranch: feat/x\nrefs: []\n---\n\n# 제목\n본문\n', { id: 'x', source: 'docs/tasks/x.md' });
  assert.ok(page.includes('<span class="badge"><b>status</b> approved</span>'), page);
  assert.ok(page.includes('<summary>문서 정보</summary>'));
  assert.ok(page.includes('<title>제목</title>'));
  assert.ok(!/<p>status: approved/.test(page));
});

test('CRLF input renders the same as LF', () => {
  const lf = render('## a\n\n| x | y |\n|---|---|\n| 1 | 2 |\n').html;
  const crlf = render('## a\r\n\r\n| x | y |\r\n|---|---|\r\n| 1 | 2 |\r\n').html;
  assert.strictEqual(crlf, lf);
});

test('HTML comments are not shown', () => {
  assert.ok(!render('<!-- 안내\n여러 줄 -->\n본문').html.includes('안내'));
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

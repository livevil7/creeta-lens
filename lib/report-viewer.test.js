#!/usr/bin/env node
/**
 * Lens - report viewer unit tests (no external deps, node assert only).
 *
 * The gate this module feeds decides whether /cp may ask for approval, so the
 * invariants worth pinning are the ones that keep it honest:
 *   1. only the three engine-side methods count as "the user saw it";
 *   2. a plan edited after it was shown goes stale — approving the tab you opened
 *      before is not approving this version;
 *   3. an Artifact URL is a first-class way to pass the gate (remote fallback);
 *   4. v3.42 — Lens itself renders nothing and opens nothing. The browser lane,
 *      the markdown renderer and the OS opener are gone (owner: "보드나 html
 *      이건 안 해도 돼"), so a module that claims to have "shown" something on
 *      its own is a regression.
 *
 * Run: node lib/report-viewer.test.js  → prints results, exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const viewer = require('./report-viewer');
const {
  planIdOf,
  recordArtifact,
  recordShown,
  resolveTarget,
  showState,
  wasShown,
} = viewer;

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

/** A repo with the given plan files; returns its root. */
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-viewer-'));
  fs.mkdirSync(path.join(root, 'docs', 'tasks'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return root;
}

const PLAN = '2026-09-04-example';

console.log('\n[Lens] report-viewer tests\n');

// --- 1. id parsing -----------------------------------------------------------
test('planIdOf: md path → bare id', () => {
  assert.strictEqual(planIdOf('docs/tasks/2026-09-04-example.md'), PLAN);
});

test('planIdOf: html path and bare id both work', () => {
  assert.strictEqual(planIdOf('docs/tasks/2026-09-04-example.html'), PLAN);
  assert.strictEqual(planIdOf(PLAN), PLAN);
});

// --- 2. target resolution ----------------------------------------------------
test('resolveTarget: the markdown wins; a legacy deck is only a fallback', () => {
  const root = makeRepo({
    [`docs/tasks/${PLAN}.md`]: '# plan',
    [`docs/tasks/${PLAN}.html`]: '<h1>plan</h1>',
  });
  assert.ok(resolveTarget(root, PLAN).endsWith('.md'));
  const legacy = makeRepo({ [`docs/tasks/${PLAN}.html`]: '<h1>plan</h1>' });
  assert.ok(resolveTarget(legacy, PLAN).endsWith('.html'));
});

test('resolveTarget: nothing on disk → null', () => {
  const root = makeRepo({});
  assert.strictEqual(resolveTarget(root, PLAN), null);
});

// --- 3. what counts as shown -------------------------------------------------
test('recordShown: a Codex inline visualization passes the gate', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  const res = recordShown(root, PLAN, 'inline', 'C:/codex/visualizations/plan.html');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(wasShown(root, PLAN).method, 'inline');
});

test('recordShown: the md file delivered to the user passes the gate', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  assert.strictEqual(recordShown(root, PLAN, 'sendfile', `docs/tasks/${PLAN}.md`).ok, true);
  assert.strictEqual(wasShown(root, PLAN).method, 'sendfile');
});

test('recordShown: an unknown method or a missing ref is refused', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  assert.strictEqual(recordShown(root, PLAN, 'telepathy', 'x').ok, false);
  assert.strictEqual(recordShown(root, PLAN, 'artifact', '').ok, false);
  assert.strictEqual(recordShown(root, PLAN, 'browser', 'x').ok, false, 'the browser lane is gone (v3.42)');
  assert.strictEqual(wasShown(root, PLAN), null);
});

// --- 4. staleness ------------------------------------------------------------
test('showState: editing the plan after showing it makes the record stale', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan v1' });
  recordShown(root, PLAN, 'artifact', 'https://claude.ai/code/artifact/abc');
  assert.strictEqual(showState(root, PLAN).state, 'shown');
  fs.writeFileSync(path.join(root, 'docs', 'tasks', `${PLAN}.md`), '# plan v2 — modified');
  assert.strictEqual(showState(root, PLAN).state, 'stale');
  assert.strictEqual(wasShown(root, PLAN), null, 'a Modify that is not re-shown must not pass the gate');
  recordShown(root, PLAN, 'artifact', 'https://claude.ai/code/artifact/abc');
  assert.strictEqual(showState(root, PLAN).state, 'shown');
});

test('showState: a CRLF-only change does not make the record stale', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan\nline\n' });
  recordShown(root, PLAN, 'artifact', 'https://x');
  fs.writeFileSync(path.join(root, 'docs', 'tasks', `${PLAN}.md`), '# plan\r\nline\r\n');
  assert.strictEqual(showState(root, PLAN).state, 'shown');
});

test('showState: never shown → unshown', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  assert.strictEqual(showState(root, PLAN).state, 'unshown');
  assert.strictEqual(wasShown(root, PLAN), null);
});

// --- 5. artifact fallback ----------------------------------------------------
test('recordArtifact: a published URL passes the gate', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  const res = recordArtifact(root, PLAN, 'https://claude.ai/public/artifacts/abc');
  assert.strictEqual(res.ok, true);
  const entry = wasShown(root, PLAN);
  assert.ok(entry, 'artifact is how a remote session passes the gate');
  assert.strictEqual(entry.method, 'artifact');
  assert.strictEqual(entry.url, 'https://claude.ai/public/artifacts/abc');
});

test('recordArtifact: no url → refused', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  assert.strictEqual(recordArtifact(root, PLAN, '').ok, false);
  assert.strictEqual(wasShown(root, PLAN), null);
});

// --- 6. v3.42: Lens shows nothing itself -------------------------------------
test('브라우저 레인이 사라졌다 — 렌더도 열기도 하지 않는다', () => {
  for (const gone of ['showReport', 'renderPreview', 'openFile', 'openerFor', 'hasWindowsAssociation', 'isRemoteSession']) {
    assert.strictEqual(viewer[gone], undefined, `${gone} 가 아직 남아 있다`);
  }
  assert.ok(!fs.existsSync(path.join(__dirname, 'md-render.js')), 'md-render.js 가 아직 있다');
  assert.deepStrictEqual([...viewer.SHOWN_METHODS].sort(), ['artifact', 'inline', 'sendfile']);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

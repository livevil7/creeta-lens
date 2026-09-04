#!/usr/bin/env node
/**
 * Lens - report viewer unit tests (no external deps, node assert only).
 *
 * The gate this module feeds decides whether /cp may ask for approval, so the
 * invariants worth pinning are the ones that keep it honest:
 *   1. only browser/artifact count as "the user saw it" — remote and failed do not;
 *   2. a failed opener is recorded as failed, never quietly as success;
 *   3. an SSH / headless session refuses to claim it showed anything;
 *   4. the HTML deck wins over the md when both exist, and md still works alone;
 *   5. a missing document fails before anything is recorded as shown;
 *   6. an Artifact URL is a first-class way to pass the gate (remote fallback).
 *
 * Run: node lib/report-viewer.test.js  → prints results, exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isRemoteSession,
  openerFor,
  planIdOf,
  recordArtifact,
  resolveTarget,
  showReport,
  wasShown,
} = require('./report-viewer');

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

/** Fake spawnSync: records the call, returns the given result. */
function runnerReturning(result) {
  const calls = [];
  const fn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return result; };
  fn.calls = calls;
  return fn;
}

const LOCAL = { PATH: '/usr/bin' }; // no SSH_*, no DISPLAY needed off linux
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

// --- 2. environment judgement ------------------------------------------------
test('isRemoteSession: SSH session is remote', () => {
  assert.strictEqual(isRemoteSession({ SSH_CONNECTION: '10.0.0.1 22' }, 'darwin'), true);
});

test('isRemoteSession: linux without a display is remote', () => {
  assert.strictEqual(isRemoteSession({}, 'linux'), true);
  assert.strictEqual(isRemoteSession({ DISPLAY: ':0' }, 'linux'), false);
});

test('isRemoteSession: plain local windows session is not remote', () => {
  assert.strictEqual(isRemoteSession(LOCAL, 'win32'), false);
});

test('openerFor: one per platform, null for the unknown', () => {
  assert.strictEqual(openerFor('win32').cmd, 'cmd.exe');
  assert.strictEqual(openerFor('darwin').cmd, 'open');
  assert.strictEqual(openerFor('linux').cmd, 'xdg-open');
  assert.strictEqual(openerFor('aix'), null);
});

// --- 3. target resolution ----------------------------------------------------
test('resolveTarget: the rendered deck wins over the markdown', () => {
  const root = makeRepo({
    [`docs/tasks/${PLAN}.md`]: '# plan',
    [`docs/tasks/${PLAN}.html`]: '<h1>plan</h1>',
  });
  assert.ok(resolveTarget(root, PLAN).endsWith('.html'));
});

test('resolveTarget: markdown alone is still a target', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  assert.ok(resolveTarget(root, PLAN).endsWith('.md'));
});

test('resolveTarget: nothing on disk → null', () => {
  const root = makeRepo({});
  assert.strictEqual(resolveTarget(root, PLAN), null);
});

// --- 4. showing --------------------------------------------------------------
test('showReport: a successful open counts as shown', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.html`]: '<h1>plan</h1>' });
  const runner = runnerReturning({ status: 0 });
  const res = showReport(root, `docs/tasks/${PLAN}.md`, { platform: 'win32', env: LOCAL, runner });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.method, 'browser');
  assert.strictEqual(res.file, `docs/tasks/${PLAN}.html`);
  assert.strictEqual(runner.calls.length, 1);
  assert.ok(wasShown(root, PLAN), 'gate must pass after a real open');
});

test('showReport: a missing opener is recorded as failed, not shown', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  const runner = runnerReturning({ error: Object.assign(new Error('spawn xdg-open ENOENT'), { code: 'ENOENT' }) });
  const res = showReport(root, PLAN, { platform: 'linux', env: { DISPLAY: ':0' }, runner });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.method, 'failed');
  assert.strictEqual(wasShown(root, PLAN), null, 'a failed open must not pass the gate');
});

test('showReport: a non-zero exit is a failure', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  const res = showReport(root, PLAN, { platform: 'darwin', env: LOCAL, runner: runnerReturning({ status: 1 }) });
  assert.strictEqual(res.method, 'failed');
  assert.strictEqual(wasShown(root, PLAN), null);
});

test('showReport: an opener that times out still launched the browser', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  const res = showReport(root, PLAN, {
    platform: 'linux', env: { DISPLAY: ':0' },
    runner: runnerReturning({ status: null, signal: 'SIGTERM' }),
  });
  assert.strictEqual(res.ok, true);
  assert.ok(wasShown(root, PLAN));
});

test('showReport: an SSH session never claims it showed anything', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.html`]: '<h1>plan</h1>' });
  const runner = runnerReturning({ status: 0 });
  const res = showReport(root, PLAN, { platform: 'darwin', env: { SSH_CONNECTION: 'x' }, runner });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.method, 'remote');
  assert.strictEqual(runner.calls.length, 0, 'no browser should be launched on the far end of ssh');
  assert.strictEqual(wasShown(root, PLAN), null);
});

test('showReport: no document → missing, and nothing is marked shown', () => {
  const root = makeRepo({});
  const res = showReport(root, PLAN, { platform: 'win32', env: LOCAL, runner: runnerReturning({ status: 0 }) });
  assert.strictEqual(res.method, 'missing');
  assert.strictEqual(wasShown(root, PLAN), null);
});

// --- 5. artifact fallback ----------------------------------------------------
test('recordArtifact: a published URL passes the gate on a remote session', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  showReport(root, PLAN, { platform: 'darwin', env: { SSH_CONNECTION: 'x' }, runner: runnerReturning({ status: 0 }) });
  assert.strictEqual(wasShown(root, PLAN), null);

  const res = recordArtifact(root, PLAN, 'https://claude.ai/public/artifacts/abc');
  assert.strictEqual(res.ok, true);
  const entry = wasShown(root, PLAN);
  assert.ok(entry, 'artifact must satisfy the gate the browser could not');
  assert.strictEqual(entry.method, 'artifact');
  assert.strictEqual(entry.url, 'https://claude.ai/public/artifacts/abc');
});

test('recordArtifact: no url → refused', () => {
  const root = makeRepo({ [`docs/tasks/${PLAN}.md`]: '# plan' });
  assert.strictEqual(recordArtifact(root, PLAN, '').ok, false);
  assert.strictEqual(wasShown(root, PLAN), null);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

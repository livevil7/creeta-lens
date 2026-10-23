#!/usr/bin/env node
/**
 * Lens - control-mode marker tests (node assert only).
 *
 * Pins: the marker refuses questions only in participant sessions; the control
 * session, unrelated sessions, an expired marker and no marker all pass; only the
 * owner re-registers, beats or clears it.
 *
 * Run: node lib/control-mode.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LENS_CONTROL_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ctl-')), 'control.json');
const ctl = require('./control-mode');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fs.rmSync(process.env.LENS_CONTROL_FILE, { force: true }); fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const on = () => ctl.writeControl({ name: '관제', sessionId: 'C1', board: 'https://x', participants: ['W1', 'W2', 'C1'], scope: 'snapholo' });

console.log('\n[Lens] control-mode tests\n');

test('path comes from LENS_CONTROL_FILE', () => {
  assert.strictEqual(ctl.controlPath(), process.env.LENS_CONTROL_FILE);
});

test('on writes the marker; the control session is not its own participant', () => {
  const r = on();
  assert.ok(r.ok, JSON.stringify(r));
  const c = ctl.readControl();
  assert.deepStrictEqual(c.participants, ['W1', 'W2']);
  assert.strictEqual(c.scope, 'snapholo');
});

test('participant is refused with the control name; others pass', () => {
  on();
  assert.match(ctl.askProblem('W1'), /SendMessage\(to 관제\)/);
  assert.match(ctl.askProblem('W1'), /LENS_ASK_GUARD=0/);
  assert.strictEqual(ctl.askProblem('C1'), null);
  assert.strictEqual(ctl.askProblem('X9'), null);
  assert.strictEqual(ctl.askProblem(''), null);
});

test('no marker / broken marker passes', () => {
  assert.strictEqual(ctl.askProblem('W1'), null);
  fs.writeFileSync(process.env.LENS_CONTROL_FILE, '{broken');
  assert.strictEqual(ctl.askProblem('W1'), null);
});

test('a marker older than 12 hours passes; heartbeat makes it fresh again', () => {
  on();
  const later = Date.now() + 13 * 3600 * 1000;
  assert.strictEqual(ctl.askProblem('W1', later), null);
  const c = ctl.readControl();
  c.updatedAt = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  fs.writeFileSync(process.env.LENS_CONTROL_FILE, JSON.stringify(c));
  assert.strictEqual(ctl.askProblem('W1'), null);
  assert.ok(ctl.heartbeat('C1').ok);
  assert.ok(ctl.askProblem('W1'));
});

test('another session cannot take over a fresh marker, beat or clear it', () => {
  on();
  const r = ctl.writeControl({ name: '관제2', sessionId: 'C2' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.owner.name, '관제');
  assert.strictEqual(ctl.heartbeat('C2').ok, false);
  assert.strictEqual(ctl.clearControl('C2').ok, false);
  assert.ok(ctl.readControl());
});

test('the owner re-registers (keeps createdAt) and clears', () => {
  on();
  const first = ctl.readControl().createdAt;
  assert.ok(ctl.writeControl({ name: '관제', sessionId: 'C1', participants: ['W3'] }).ok);
  assert.strictEqual(ctl.readControl().createdAt, first);
  assert.deepStrictEqual(ctl.readControl().participants, ['W3']);
  assert.deepStrictEqual(ctl.clearControl('C1'), { ok: true, cleared: true });
  assert.strictEqual(ctl.readControl(), null);
});

test('an expired marker can be taken over by a new control session', () => {
  on();
  const c = ctl.readControl();
  c.updatedAt = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  fs.writeFileSync(process.env.LENS_CONTROL_FILE, JSON.stringify(c));
  assert.ok(ctl.writeControl({ name: '관제2', sessionId: 'C2' }).ok);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

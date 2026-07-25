#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isLensRepo } = require('./capability-audit');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-capability-'));
try {
  fs.mkdirSync(path.join(root, 'docs', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'docs', 'rules', 'capability-assumptions.json'),
    '{}\n',
    'utf8'
  );
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.codex-plugin', 'plugin.json'),
    '{"name":"lens","version":"3.26.0"}\n',
    'utf8'
  );
  assert.strictEqual(isLensRepo(root), true, 'Codex-only Lens manifest should be recognized');

  fs.writeFileSync(
    path.join(root, '.codex-plugin', 'plugin.json'),
    '{"name":"not-lens"}\n',
    'utf8'
  );
  assert.strictEqual(isLensRepo(root), false, 'unrelated Codex plugin should be rejected');
  console.log('capability-audit.test.js: 2 tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

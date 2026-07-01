#!/usr/bin/env node
/**
 * Lens - install-sync unit tests (no external deps, node assert only).
 *
 * Focus: the safety invariants from the /ci Constitution.
 *   1. foreign plugins NEVER appear in toRemove.
 *   2. lens (self) is protected — never in toRemove nor foreign, even when
 *      it is absent from the manifest.
 *   3. Only excluded ∩ installed lands in toRemove.
 *   4. Manifest editing round-trips (add / remove) atomically.
 *
 * Run: node lib/install-sync.test.js  → prints results, exit 0 iff all pass.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  diff,
  isSelf,
  loadManifest,
  addPlugin,
  removePlugin,
  parseMarketplaceList,
} = require('./install-sync');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ok - ' + name);
}

// Helper to build an installed-state object like readInstalled() returns.
function installedState(pluginIds, marketplaces = []) {
  return {
    plugins: pluginIds.map((id) => ({ id, version: '1.0.0', scope: 'user', installPath: '/x/' + id })),
    marketplaces,
    source: 'test',
  };
}

console.log('install-sync.test.js');

// --- 1. foreign NEVER in toRemove ---------------------------------------
test('foreign plugins are never in toRemove', () => {
  const manifest = {
    marketplaces: {},
    plugins: [{ spec: 'lens@CreetaCorp' }, { spec: 'context7@claude-plugins-official' }],
    deps: {},
    excluded: {},
  };
  // "sentry@foo" is installed but not managed and not excluded → foreign.
  const installed = installedState([
    'lens@CreetaCorp',
    'context7@claude-plugins-official',
    'sentry@foo',
  ]);
  const d = diff(manifest, installed);

  const removeSpecs = d.toRemove.map((r) => r.spec);
  const foreignSpecs = d.foreign.map((f) => f.spec);

  assert.ok(foreignSpecs.includes('sentry@foo'), 'sentry@foo should be foreign');
  assert.ok(!removeSpecs.includes('sentry@foo'), 'foreign MUST NOT be in toRemove');
  assert.strictEqual(d.toRemove.length, 0, 'nothing excluded → toRemove empty');
});

// --- 2. lens self-protection (absent from manifest) ---------------------
test('lens is protected even when absent from manifest', () => {
  const manifest = {
    marketplaces: {},
    // lens is NOT listed in plugins, NOT excluded.
    plugins: [{ spec: 'context7@claude-plugins-official' }],
    deps: {},
    excluded: {},
  };
  const installed = installedState(['lens@CreetaCorp', 'context7@claude-plugins-official']);
  const d = diff(manifest, installed);

  const removeSpecs = d.toRemove.map((r) => r.spec);
  const foreignSpecs = d.foreign.map((f) => f.spec);

  assert.ok(!removeSpecs.includes('lens@CreetaCorp'), 'lens MUST NOT be in toRemove');
  assert.ok(!foreignSpecs.includes('lens@CreetaCorp'), 'lens MUST NOT be in foreign');
});

// --- 2b. lens protected even if someone put it in excluded --------------
test('lens is protected even if manifest.excluded lists it', () => {
  const manifest = {
    marketplaces: {},
    plugins: [],
    deps: {},
    excluded: { 'lens@CreetaCorp': 'oops user tried to exclude self' },
  };
  const installed = installedState(['lens@CreetaCorp']);
  const d = diff(manifest, installed);
  assert.strictEqual(d.toRemove.length, 0, 'lens excluded → still not removed (hard guard)');
  assert.ok(!d.foreign.some((f) => f.spec === 'lens@CreetaCorp'), 'lens never foreign');
});

// --- 2c. isSelf covers id starting with lens ----------------------------
test('isSelf matches lens@CreetaCorp and any lens@* id', () => {
  assert.ok(isSelf('lens@CreetaCorp'));
  assert.ok(isSelf('lens@SomeOtherMarketplace'));
  assert.ok(!isSelf('lenses@foo'));
  assert.ok(!isSelf('context7@claude-plugins-official'));
});

// --- 3. only excluded ∩ installed lands in toRemove ---------------------
test('only excluded AND installed go to toRemove', () => {
  const manifest = {
    marketplaces: {},
    plugins: [{ spec: 'lens@CreetaCorp' }],
    deps: {},
    excluded: {
      'gstack@old': 'no longer used',      // installed → should be removed
      'ghost@nowhere': 'never installed',  // NOT installed → should NOT appear
    },
  };
  const installed = installedState(['lens@CreetaCorp', 'gstack@old']);
  const d = diff(manifest, installed);

  const removeSpecs = d.toRemove.map((r) => r.spec);
  assert.deepStrictEqual(removeSpecs, ['gstack@old'], 'only installed-and-excluded removed');
  assert.strictEqual(d.toRemove[0].reason, 'no longer used', 'reason carried through');
});

// --- 3b. toInstall + ok classification ----------------------------------
test('toInstall = managed-not-installed, ok = managed-and-installed', () => {
  const manifest = {
    marketplaces: { 'claude-video': 'someone/claude-video' },
    plugins: [
      { spec: 'lens@CreetaCorp' },
      { spec: 'watch@claude-video', what: 'video watcher' },
    ],
    deps: {},
    excluded: {},
  };
  // watch not installed; its marketplace also not registered.
  const installed = installedState(['lens@CreetaCorp'], ['CreetaCorp']);
  const d = diff(manifest, installed);

  assert.deepStrictEqual(d.ok.map((o) => o.spec), ['lens@CreetaCorp']);
  assert.strictEqual(d.toInstall.length, 1);
  assert.strictEqual(d.toInstall[0].spec, 'watch@claude-video');
  assert.strictEqual(d.toInstall[0].needsMarketplace, true, 'marketplace unregistered → flagged');
  assert.strictEqual(d.toInstall[0].what, 'video watcher');
});

// --- 4. marketplace list parsing ----------------------------------------
test('parseMarketplaceList extracts names from CLI text', () => {
  const text = [
    'Configured marketplaces:',
    '',
    '  ❯ claude-plugins-official',
    '    Source: Git (https://github.com/anthropics/claude-plugins-official.git)',
    '',
    '  ❯ CreetaCorp',
    '    Source: GitHub (livevil7/creeta-lens)',
  ].join('\n');
  const names = parseMarketplaceList(text);
  assert.ok(names.includes('claude-plugins-official'));
  assert.ok(names.includes('CreetaCorp'));
  assert.ok(!names.some((n) => n.startsWith('Source')), 'source lines are not names');
});

// --- 5. manifest add/remove round-trip (atomic) -------------------------
test('addPlugin / removePlugin round-trip in a temp manifest', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-ci-'));
  const mp = path.join(tmpDir, 'manifest.json');
  try {
    // absent → loadManifest creates the empty template
    const { created } = loadManifest(mp);
    assert.strictEqual(created, true, 'first load creates template');

    addPlugin('foo@bar', 'a test plugin', mp);
    let m = loadManifest(mp).manifest;
    assert.ok(m.plugins.some((p) => p.spec === 'foo@bar'), 'foo@bar added');

    removePlugin('foo@bar', null, mp);
    m = loadManifest(mp).manifest;
    assert.ok(!m.plugins.some((p) => p.spec === 'foo@bar'), 'foo@bar left plugins');
    assert.ok(m.excluded['foo@bar'], 'foo@bar now excluded');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\nAll ${passed} tests passed.`);
process.exit(0);

#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-scanner-'));
const previous = process.env.CLAUDE_PLUGIN_CACHE_DIR;
try {
  const pluginRoot = path.join(cache, 'CreetaCorp', 'lens', '3.26.0');
  const skillRoot = path.join(pluginRoot, 'skills', 'c');
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
    '{"name":"lens","version":"3.26.0"}\n',
    'utf8'
  );
  fs.copyFileSync(
    path.join(__dirname, '..', 'skills', 'c', 'SKILL.md'),
    path.join(skillRoot, 'SKILL.md')
  );

  process.env.CLAUDE_PLUGIN_CACHE_DIR = cache;
  const { scanInstalledSkills } = require('./skill-scanner');
  const skills = scanInstalledSkills();
  assert.strictEqual(skills.length, 1);
  assert.strictEqual(skills[0].name, 'c');
  assert.ok(skills[0].triggers.includes('execute'), 'canonical wrapper must retain triggers');
  assert.ok(skills[0].description.includes('sequential execution'));
  console.log('skill-scanner.test.js: 4 assertions passed');
} finally {
  if (previous === undefined) delete process.env.CLAUDE_PLUGIN_CACHE_DIR;
  else process.env.CLAUDE_PLUGIN_CACHE_DIR = previous;
  fs.rmSync(cache, { recursive: true, force: true });
}

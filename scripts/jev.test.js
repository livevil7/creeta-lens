#!/usr/bin/env node
/**
 * Lens - jev.js tests (node assert only, local mock server — no real Jev call).
 *
 * Pins the two checks SnapHolo's run proved necessary: the confidence threshold
 * and the one-to-one collision check, plus the one-line contract the Leader parses.
 *
 * Run: node scripts/jev.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { judge, NONE } = require('./jev');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); } catch (err) {
    failed += 1; console.log(`  FAIL ${name}`); console.log(`       ${err.message.split('\n')[0]}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-jev-'));
const run = (args, env) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(__dirname, 'jev.js'), ...args], { env: { ...process.env, ...env } },
    (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});
const writeJob = (name, job) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(job)); return f; };

(async () => {
  await test('threshold: below 0.80 goes to a person, above is auto', () => {
    const rows = judge([{ id: 1, choice: 'a', confidence: 0.81 }, { id: 2, choice: 'b', confidence: 0.79 }], 0.8, false);
    assert.deepStrictEqual(rows.map((r) => r.verdict), ['auto', 'review']);
  });

  await test('none of these is its own verdict, even when confident', () => {
    assert.strictEqual(judge([{ id: 1, choice: NONE, confidence: 0.99 }], 0.8, false)[0].verdict, 'none');
  });

  await test('one-to-one: two confident claims on one option both go to a person', () => {
    const rows = judge([
      { id: 1, choice: 'a', confidence: 0.93 }, { id: 2, choice: 'a', confidence: 0.9 },
      { id: 3, choice: 'a', confidence: 0.5 }, { id: 4, choice: 'b', confidence: 0.9 },
    ], 0.8, true);
    assert.deepStrictEqual(rows.map((r) => r.verdict), ['collide', 'collide', 'review', 'auto']);
  });

  await test('without --one-to-one a shared option is fine (classification, not matching)', () => {
    const rows = judge([{ id: 1, choice: 'a', confidence: 0.9 }, { id: 2, choice: 'a', confidence: 0.9 }], 0.8, false);
    assert.deepStrictEqual(rows.map((r) => r.verdict), ['auto', 'auto']);
  });

  await test('more than 255 options is refused before any call (narrow in code first)', async () => {
    const options = Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`o${i}`, `opt ${i}`]));
    const job = writeJob('big.json', { instructions: 'x', options, items: [{ id: 1, state: 's' }] });
    const r = await run(['--job', job, '--out', path.join(tmp, 'o.json')], { JEV_AI_API_KEY: 'k' });
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /narrow/);
  });

  await test('end to end against a mock: DONE line counts, UA and key are sent, errors are rows', async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let buf = '';
      req.on('data', (d) => { buf += d; });
      req.on('end', () => {
        seen.push(req.headers);
        const { state } = JSON.parse(buf);
        if (state === 'bad') { res.writeHead(401); res.end('{}'); return; }
        const [choice, conf] = state.split(':');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answers: { q: { choice, confidence: Number(conf), probabilities: { [choice]: Number(conf) } } }, usage: { input_tokens: 100 } }));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const job = writeJob('e2e.json', {
      instructions: 'pick', options: { a: 'A', b: 'B' },
      items: [{ id: 1, state: 'a:0.95' }, { id: 2, state: 'a:0.9' }, { id: 3, state: 'b:0.6' },
        { id: 4, state: `${NONE}:0.9` }, { id: 5, state: 'bad' }],
    });
    const out = path.join(tmp, 'e2e-out.json');
    const r = await run(['--job', job, '--out', out, '--one-to-one'],
      { JEV_AI_API_KEY: 'test-key', LENS_JEV_URL: `http://127.0.0.1:${server.address().port}/` });
    server.close();
    assert.strictEqual(r.code, 0, r.stderr);
    assert.match(r.stdout, /^JEV DONE items=5 auto=0 review=1 none=1 collide=2 error=1 tokens=400 /);
    assert.strictEqual(seen[0].authorization, 'Bearer test-key');
    assert.strictEqual(seen[0]['user-agent'], 'curl/8.7.1');
    const rows = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepStrictEqual(rows.map((x) => x.verdict), ['collide', 'collide', 'review', 'none', 'error']);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

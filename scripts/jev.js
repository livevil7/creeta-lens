#!/usr/bin/env node
'use strict';
/**
 * Lens - Jev judgement lane (v3.51.0)
 *
 * Jev (jev-ai.pro) is not a writing model. It answers typed questions only —
 * here, one multiple-choice question per item — and returns the pick with a
 * probability for every option. Input tokens are billed, output is free.
 *
 * Why a lane of its own. A /cc or /cp step that has to sort hundreds of items
 * into a fixed option list ("which of these 100 master sets is this?") used to
 * go to a Claude subagent, the one metered engine, and came back as prose with
 * no confidence. SnapHolo measured Jev on exactly that shape (2026-09-24,
 * snapholo/docs/tasks/2026-09-24-jev-ai-evaluation.md): 208 sets in 175 s for
 * $0.29, 44/44 correct above confidence 0.80.
 *
 * The same run is why two checks are built in rather than left to the caller:
 *   - threshold (default 0.80): above it 44/44 were right; below it goes to a person.
 *   - one-to-one collision (--one-to-one): with the true answer removed, Jev still
 *     picked a sibling set at 0.93 in 22 of 24 forced picks. A threshold cannot
 *     catch that; two items claiming one option can. Both go to a person.
 *
 * Usage:
 *   node scripts/jev.js --job JOB.json --out OUT.json [--threshold 0.8] [--one-to-one]
 *                       [--concurrency 8]
 *
 * JOB.json:
 *   { "instructions": "English. What the state is, what to pick.",
 *     "options": { "key": "description", ... },          // 1..254 — narrow first
 *     "items":   [ { "id": "...", "state": "..." }, ... ],
 *     "none": true }                                      // add a "none of these" option (default)
 *
 * Output — OUT.json rows { id, choice, confidence, top3, tokens, verdict } and one line:
 *   JEV DONE items=208 auto=60 review=41 none=98 collide=9 error=0 tokens=966791 elapsed=175s out=OUT.json
 *   JEV UNAVAILABLE reason=no-key                          (caller falls back to the Claude lane)
 * verdict: auto | review | none | collide | error.
 *
 * Key: $JEV_AI_API_KEY, else the nearest livevil-setting/env/solutions/ai.env up
 * from the cwd or this plugin. Exit 0 = ran or unavailable (read the line), 1 = bad usage.
 */

const fs = require('fs');
const path = require('path');

const URL = process.env.LENS_JEV_URL || 'https://jev-ai.pro/api/v1/systemone';
const NONE = 'none_of_these';
const MAX_OPTIONS = 255;

function parseArgs(argv) {
  const out = { threshold: 0.8, oneToOne: false, concurrency: 8 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--job') out.job = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--threshold') out.threshold = Number(argv[++i]);
    else if (a === '--one-to-one') out.oneToOne = true;
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!out.job || !out.out) throw new Error('--job and --out are required');
  if (!(out.threshold >= 0 && out.threshold <= 1)) throw new Error('--threshold must be 0..1');
  if (!(out.concurrency >= 1)) throw new Error('--concurrency must be >= 1');
  return out;
}

function findKey() {
  if (process.env.JEV_AI_API_KEY) return process.env.JEV_AI_API_KEY;
  for (const start of [process.cwd(), __dirname]) {
    for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
      const file = path.join(dir, 'livevil-setting', 'env', 'solutions', 'ai.env');
      if (fs.existsSync(file)) {
        const m = fs.readFileSync(file, 'utf8').match(/^JEV_AI_API_KEY=(.+)$/m);
        if (m) return m[1].trim();
      }
      if (path.dirname(dir) === dir) break;
    }
  }
  return null;
}

function loadJob(file) {
  const job = JSON.parse(fs.readFileSync(file, 'utf8'));
  const options = { ...(job.options || {}) };
  if (job.none !== false) options[NONE] = 'None of these';
  const n = Object.keys(options).length;
  if (!job.instructions) throw new Error('job.instructions is required');
  if (n < 2 || n > MAX_OPTIONS) throw new Error(`options must be 2..${MAX_OPTIONS} including none (got ${n}) — narrow the candidates in code first`);
  if (!Array.isArray(job.items) || !job.items.length) throw new Error('job.items is empty');
  for (const it of job.items) if (it.id == null || !it.state) throw new Error('every item needs id and state');
  return { instructions: job.instructions, options, items: job.items };
}

async function ask(key, job, item) {
  const body = JSON.stringify({
    state: item.state,
    questions: { q: { type: 'choice', instructions: job.instructions, criteria: job.options } },
  });
  let last = 'unknown';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Without a browser-ish User-Agent Cloudflare answers 403 / error 1010 and it reads as a bad key.
      const res = await fetch(URL, {
        method: 'POST', body,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.7.1', Accept: 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) {
        const p = await res.json();
        const a = p.answers.q;
        const top3 = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 3)
          .map(([k, v]) => [Math.round(v * 1000) / 1000, k]);
        return { id: item.id, choice: a.choice, confidence: a.confidence ?? null, top3, tokens: p.usage?.input_tokens ?? 0 };
      }
      last = `http ${res.status}`;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (err) {
      last = String(err.message || err).slice(0, 120);
    }
    await new Promise((r) => setTimeout(r, 1000 + attempt * 2000));
  }
  return { id: item.id, error: last, tokens: 0 };
}

function judge(rows, threshold, oneToOne) {
  const claims = new Map();
  for (const r of rows) {
    if (r.error || r.choice === NONE || (r.confidence ?? 0) < threshold) continue;
    claims.set(r.choice, (claims.get(r.choice) || 0) + 1);
  }
  for (const r of rows) {
    r.verdict = r.error ? 'error'
      : r.choice === NONE ? 'none'
        : (r.confidence ?? 0) < threshold ? 'review'
          : oneToOne && claims.get(r.choice) > 1 ? 'collide'
            : 'auto';
  }
  return rows;
}

async function main() {
  let args; let job;
  try {
    args = parseArgs(process.argv.slice(2));
    job = loadJob(args.job);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const key = findKey();
  if (!key) { console.log('JEV UNAVAILABLE reason=no-key'); return; }

  const started = Date.now();
  const rows = new Array(job.items.length);
  let next = 0;
  const worker = async () => {
    while (next < job.items.length) { const i = next++; rows[i] = await ask(key, job, job.items[i]); }
  };
  await Promise.all(Array.from({ length: Math.min(args.concurrency, job.items.length) }, worker));

  judge(rows, args.threshold, args.oneToOne);
  if (rows.every((r) => r.error)) {
    console.log(`JEV UNAVAILABLE reason=${JSON.stringify(rows[0].error)}`);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(rows, null, 1));
  const c = (v) => rows.filter((r) => r.verdict === v).length;
  const tokens = rows.reduce((s, r) => s + (r.tokens || 0), 0);
  console.log(`JEV DONE items=${rows.length} auto=${c('auto')} review=${c('review')} none=${c('none')} collide=${c('collide')} error=${c('error')} tokens=${tokens} elapsed=${Math.round((Date.now() - started) / 1000)}s out=${args.out}`);
}

if (require.main === module) main();
module.exports = { judge, loadJob, NONE };

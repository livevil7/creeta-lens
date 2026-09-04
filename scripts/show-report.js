#!/usr/bin/env node
'use strict';
/**
 * Lens - show-report (v3.37.0)
 *
 * CLI over lib/report-viewer.js. Opens a plan document on the user's screen and
 * records that it happened, so /cp Phase 5.0 can gate approval on "the user has
 * actually seen this" instead of "a path was printed".
 *
 * Usage:
 *   node scripts/show-report.js <plan-md|plan-id> [--project <root>]
 *   node scripts/show-report.js --check <plan-id>  [--project <root>]
 *   node scripts/show-report.js --artifact <url> <plan-id> [--project <root>]
 *
 * Output: one JSON line on stdout, always. Exit 0 = the user can see it now.
 */

const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const viewer = require(path.join(PLUGIN_ROOT, 'lib', 'report-viewer.js'));

function parseArgs(argv) {
  const out = { project: null, check: false, artifact: null, target: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project' || a === '-p') { out.project = argv[++i] || null; continue; }
    if (a === '--check' || a === '-c') { out.check = true; continue; }
    if (a === '--artifact' || a === '-a') { out.artifact = argv[++i] || null; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (!out.target) out.target = a;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.target) {
    console.log(JSON.stringify({
      ok: false,
      note: 'usage: show-report.js <plan-md|plan-id> [--project <root>] | --check <plan-id> | --artifact <url> <plan-id>',
    }));
    process.exit(1);
  }

  const projectRoot = path.resolve(args.project || process.env.CLAUDE_PROJECT_DIR || process.cwd());

  if (args.check) {
    const planId = viewer.planIdOf(args.target);
    const entry = viewer.wasShown(projectRoot, planId);
    const result = entry
      ? { ok: true, method: entry.method, planId, file: entry.file || null, url: entry.url || null, shownAt: entry.shownAt, note: '표시 게이트 통과' }
      : { ok: false, method: 'unshown', planId, note: '이 계획서는 아직 사용자에게 띄운 적이 없다 — Phase 2.7 로 회귀하라' };
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.artifact) {
    const result = viewer.recordArtifact(projectRoot, args.target, args.artifact);
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }

  const result = viewer.showReport(projectRoot, args.target);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

main();

#!/usr/bin/env node
'use strict';
/**
 * Lens - show-report (v3.37.0, reworked v3.39.0)
 *
 * CLI over lib/report-viewer.js. Records that a plan was put in front of the user
 * — on whatever surface the running engine has — so /cp can gate approval on
 * "the user has seen this version" instead of "a path was printed".
 *
 * Usage:
 *   node scripts/show-report.js <plan-md|plan-id>                 browser lane: render + open (Grok CLI, claude -p)
 *   node scripts/show-report.js --shown artifact <url>  <plan-id>  Claude Code Artifact tool
 *   node scripts/show-report.js --shown inline   <path> <plan-id>  Codex app visualize
 *   node scripts/show-report.js --shown sendfile <path> <plan-id>  a rendered file sent to the user
 *   node scripts/show-report.js --artifact <url> <plan-id>         alias of --shown artifact
 *   node scripts/show-report.js --check <plan-id>                  exit 0 iff shown AND unchanged since
 *   [--project <root>]  — default: the repo the plan path names, else the git repo of the cwd
 *
 * Output: one JSON line on stdout, always. Exit 0 = the user can see the current version.
 */

const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const viewer = require(path.join(PLUGIN_ROOT, 'lib', 'report-viewer.js'));
const { resolveProjectRoot } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils.js'));

function parseArgs(argv) {
  const out = { project: null, check: false, shown: null, target: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project' || a === '-p') { out.project = argv[++i] || null; continue; }
    if (a === '--check' || a === '-c') { out.check = true; continue; }
    if (a === '--artifact' || a === '-a') { out.shown = { method: 'artifact', ref: argv[++i] || null }; continue; }
    if (a === '--shown') { out.shown = { method: argv[++i] || null, ref: argv[++i] || null }; continue; }
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
      note: 'usage: show-report.js <plan-md|plan-id> | --shown <artifact|inline|sendfile> <url|path> <plan-id> | --check <plan-id> [--project <root>]',
    }));
    process.exit(1);
  }

  // The plan path names its repo exactly; a bare id falls back to the shell's
  // repo. CLAUDE_PROJECT_DIR is the workspace in a multi-repo session (v3.39).
  const projectRoot = args.project
    ? path.resolve(args.project)
    : resolveProjectRoot({ filePath: /[\\/]docs[\\/](?:tasks|history)[\\/]/.test(args.target) ? args.target : undefined, cwd: process.cwd() });

  if (args.check) {
    const planId = viewer.planIdOf(args.target);
    const { state, entry } = viewer.showState(projectRoot, planId);
    const result = state === 'shown'
      ? { ok: true, method: entry.method, planId, file: entry.file || null, url: entry.url || entry.ref || null, shownAt: entry.shownAt, note: '표시 게이트 통과' }
      : state === 'stale'
        ? { ok: false, method: 'stale', planId, url: entry.url || entry.ref || null, note: '띄운 뒤 계획서가 바뀌었다 — 바뀐 판을 같은 링크로 다시 띄워라' }
        : { ok: false, method: 'unshown', planId, note: '이 계획서는 아직 사용자에게 띄운 적이 없다 — 승인을 묻기 전에 띄워라' };
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.shown) {
    const result = viewer.recordShown(projectRoot, args.target, args.shown.method, args.shown.ref);
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }

  const result = viewer.showReport(projectRoot, args.target);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

main();

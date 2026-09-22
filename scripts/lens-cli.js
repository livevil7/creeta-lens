#!/usr/bin/env node
'use strict';
/**
 * Lens - lens-cli (v3.48.0)
 *
 * Thin CLI over lib/git-branch.js and lib/plan-manager.js. It replaces the
 * skills' `node -e` one-liners — one session alone (18f26c40) lost 13 of them
 * to stripped backslashes and broken quoting. No judgement lives here: argv in,
 * one lib call, JSON out.
 *
 * Usage:
 *   node scripts/lens-cli.js branch entry     <repo> [planBranch] [--plan <md>]
 *   node scripts/lens-cli.js branch ownership <repo> <branch> <base> <planDoc>
 *   node scripts/lens-cli.js branch merged    <repo> <branch> <base> [--plan <md>] [--pr-merged]
 *   node scripts/lens-cli.js branch base      <repo>
 *   node scripts/lens-cli.js plan structure|coverage|todo|gate <md>
 *
 *   branch merged always fetches first ({fetch: true}), like every skill call did.
 *   --pr-merged = the caller confirmed the PR was merged (gh) → opts.prMerged.
 *   plan gate   = structure + coverage + todo, the /cp Phase 5.0 check.
 *
 * Output: JSON on stdout. Exit: `plan …` → 1 when not valid · `branch …` → 0
 * (read the JSON) · 2 = usage or unreadable file.
 */

const fs = require('fs');
const path = require('path');

// The copy next to this script, never another install (same rule as lib/git-branch.js).
const gb = require(path.join(__dirname, '..', 'lib', 'git-branch.js'));
const pm = require(path.join(__dirname, '..', 'lib', 'plan-manager.js'));

function usage(msg) {
  console.log(JSON.stringify({ error: msg }));
  process.exit(2);
}

function parse(argv) {
  const pos = [];
  const opt = { plan: null, prMerged: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--plan') {
      if (!argv[i + 1]) usage('--plan needs a path');
      opt.plan = path.resolve(argv[++i]);
    } else if (a === '--pr-merged') {
      opt.prMerged = true;
    } else {
      pos.push(a);
    }
  }
  return { pos, opt };
}

function readPlan(md) {
  if (!md) usage('plan document path required');
  let content;
  try { content = fs.readFileSync(md, 'utf-8'); } catch (e) { usage(`cannot read ${md}: ${e.message}`); }
  const fm = pm.parsePlanFrontmatter(md) || {};
  // `grade: "deep"` must mean deep — the quotes are YAML, not part of the value.
  const grade = typeof fm.grade === 'string' ? (fm.grade.replace(/^["']|["']$/g, '') || undefined) : undefined;
  return { content, grade };
}

const out = (obj, pretty) => console.log(pretty ? JSON.stringify(obj, null, 1) : JSON.stringify(obj));

function branch(cmd, pos, opt) {
  const [repo, a, b] = pos;
  if (!repo) usage(`branch ${cmd}: <repo> required`);
  switch (cmd) {
    case 'entry':
      return out(gb.entryDecision(repo, a || null, { planDoc: opt.plan }), true);
    case 'ownership': {
      if (!a || !b || !pos[3]) usage('branch ownership <repo> <branch> <base> <planDoc>');
      return out(gb.verifyOwnership(repo, a, b, readPlan(path.resolve(pos[3])).content), true);
    }
    case 'merged':
      if (!a || !b) usage('branch merged <repo> <branch> <base> [--plan <md>] [--pr-merged]');
      return out(gb.mergedState(repo, a, b, { fetch: true, prMerged: opt.prMerged, planDoc: opt.plan }));
    case 'base': {
      const p = gb.preflight(repo);
      return out({ resolved: gb.resolveBase(repo), base: p.base, issues: p.issues });
    }
    default:
      return usage(`unknown: branch ${cmd || ''}`);
  }
}

function plan(cmd, pos) {
  const { content, grade } = readPlan(pos[0] && path.resolve(pos[0]));
  switch (cmd) {
    case 'structure': {
      const r = pm.validatePlanStructure(content, grade);
      out({ grade: grade || '(기본)', ...r });
      return process.exit(r.valid ? 0 : 1);
    }
    case 'coverage': {
      const r = pm.validatePlanCoverage(content);
      out(r, true);
      return process.exit(r.valid ? 0 : 1);
    }
    case 'todo': {
      const r = pm.deriveTodoItems(content);
      out(r, true);
      return process.exit(r.valid ? 0 : 1);
    }
    case 'gate': {
      const s = pm.validatePlanStructure(content, grade);
      const research = s.kind === '조사보고';
      const v = research ? { valid: true } : pm.validatePlanCoverage(content);
      const t = research ? { valid: true } : pm.deriveTodoItems(content);
      out({
        kind: s.kind,
        structure: s,
        coverage: v,
        todo: {
          valid: t.valid,
          goals: (t.goals || []).length,
          exec: (t.inventory || []).length + (t.steps || []).length,
          problems: t.problems,
          warnings: t.warnings,
        },
      }, true);
      return process.exit(s.valid && v.valid && t.valid ? 0 : 1);
    }
    default:
      return usage(`unknown: plan ${cmd || ''}`);
  }
}

const { pos, opt } = parse(process.argv.slice(2));
const [group, cmd, ...rest] = pos;
if (group === 'branch') branch(cmd, rest, opt);
else if (group === 'plan') plan(cmd, rest);
else usage('usage: lens-cli.js branch entry|ownership|merged|base … | plan structure|coverage|todo|gate <md>');

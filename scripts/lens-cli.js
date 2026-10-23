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
 *   node scripts/lens-cli.js branch merged    <repo> <branch> <base> [--plan <md>] [--pr-merged] [--no-pr]
 *   node scripts/lens-cli.js branch base      <repo>
 *   node scripts/lens-cli.js plan structure|coverage|todo|gate <md>
 *   node scripts/lens-cli.js plan status <md> <executing|done|blocked|parked|cancelled|approved|planned> [--reason x] [--waiting-on x]
 *   node scripts/lens-cli.js plan scan <root> [--git] [--json] [--sessions a,b:idle]
 *   node scripts/lens-cli.js cd inspect <md> [--json]
 *   node scripts/lens-cli.js control on --name x --session id [--board url] [--participants a,b] [--scope s]
 *   node scripts/lens-cli.js control off|heartbeat --session id · control status
 *
 *   branch merged always fetches first ({fetch: true}), like every skill call did.
 *   --pr-merged = the caller confirmed the PR was merged (gh) → opts.prMerged.
 *   --no-pr     = the caller confirmed zero PRs of any state for this head (gh) → opts.noPr.
 *   plan gate   = structure + coverage + todo, the /cp Phase 5.0 check.
 *   plan scan   = stalled-plan scan; always writes <root>/.lens/plan-scan.json,
 *                 the cache session-start reads. Without --json: the first line
 *                 and one line per stalled plan.
 *
 * Output: JSON on stdout. Exit: `plan …` → 1 when not valid · `branch …` → 0
 * (read the JSON) · 2 = usage or unreadable file.
 */

const fs = require('fs');
const path = require('path');

// The copy next to this script, never another install (same rule as lib/git-branch.js).
const gb = require(path.join(__dirname, '..', 'lib', 'git-branch.js'));
const pm = require(path.join(__dirname, '..', 'lib', 'plan-manager.js'));
const scan = require(path.join(__dirname, '..', 'lib', 'plan-scan.js'));

function usage(msg) {
  console.log(JSON.stringify({ error: msg }));
  process.exit(2);
}

// --flag <value> options, by the name they get in `opt`.
const VALUE_FLAGS = {
  '--reason': 'reason', '--waiting-on': 'waitingOn', '--sessions': 'sessions',
  '--name': 'name', '--session': 'session', '--board': 'board', '--participants': 'participants', '--scope': 'scope',
};

function parse(argv) {
  const pos = [];
  const opt = { plan: null, prMerged: false, noPr: false, git: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--plan') {
      if (!argv[i + 1]) usage('--plan needs a path');
      opt.plan = path.resolve(argv[++i]);
    } else if (a === '--pr-merged') {
      opt.prMerged = true;
    } else if (a === '--no-pr') {
      opt.noPr = true;
    } else if (a === '--git') {
      opt.git = true;
    } else if (a === '--json') {
      opt.json = true;
    } else if (VALUE_FLAGS[a]) {
      // An empty value is a value (`--waiting-on ""` clears the field).
      if (argv[i + 1] === undefined) usage(`${a} needs a value`);
      opt[VALUE_FLAGS[a]] = argv[++i];
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
      if (!a || !b) usage('branch merged <repo> <branch> <base> [--plan <md>] [--pr-merged] [--no-pr]');
      return out(gb.mergedState(repo, a, b, { fetch: true, prMerged: opt.prMerged, noPr: opt.noPr, planDoc: opt.plan }));
    case 'base': {
      const p = gb.preflight(repo);
      return out({ resolved: gb.resolveBase(repo), base: p.base, issues: p.issues });
    }
    default:
      return usage(`unknown: branch ${cmd || ''}`);
  }
}

function plan(cmd, pos, opt) {
  // Each command reads its own arguments: `scan` takes a directory, not a file.
  if (cmd === 'status') {
    const [md, status] = pos;
    if (!md || !status) usage('plan status <md> <status> [--reason x] [--waiting-on x]');
    const r = scan.setPlanStatus(path.resolve(md), status, { reason: opt.reason, waitingOn: opt.waitingOn });
    out(r);
    return process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'scan') {
    const root = path.resolve(pos[0] || '.');
    const r = scan.scanPlans(root, { git: opt.git, sessions: opt.sessions === undefined ? null : opt.sessions });
    const cached = scan.writeScanCache(root, r);
    if (opt.json) out({ ...r, cache: cached });
    if (opt.json) return process.exit(0);
    // An approved plan whose every checkbox is ticked is a completion candidate, not work to resume.
    const allTicked = p => { const m = /체크 (\d+)\/(\d+)/.exec(p.where); return Boolean(m && m[1] === m[2]); };
    const groups = [
      ['이어갈 계획', r.approved.filter(p => !allTicked(p))],
      ['대기', r.waiting],
      ['보관', r.parked],
      ['완료 후보', [...r.done, ...r.approved.filter(allTicked)]],
      ['승인 전 계획', r.planned],
      ['판정 불가', r.unknown],
    ];
    const lines = [r.firstLine, ...r.stalled.map(p => `- ${p.id} — ${p.why} · ${p.where} (${p.path})`)];
    for (const [label, list] of groups) {
      if (list.length) lines.push(`${label} ${list.length}건`, ...list.map(p => `- ${p.title || p.id} — ${p.path}`));
    }
    console.log(lines.join('\n'));
    return process.exit(0);
  }
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

function cd(cmd, pos, opt) {
  if (cmd !== 'inspect' || !pos[0]) usage('cd inspect <md> [--json]');
  const r = require(path.join(__dirname, '..', 'lib', 'cd-manager.js')).inspectTask(path.resolve(pos[0]));
  if (opt.json) return out(r, true);
  return console.log(`${r.closable ? '닫을 수 있음' : '닫을 수 없음'} — 원장 ${r.ledger}${r.reasons.length ? ` · ${r.reasons.join(' · ')}` : ''}`);
}

function control(cmd, opt) {
  const cm = require(path.join(__dirname, '..', 'lib', 'control-mode.js'));
  const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  let r;
  switch (cmd) {
    case 'on':
      r = cm.writeControl({ name: opt.name, sessionId: opt.session, board: opt.board, participants: list(opt.participants), scope: opt.scope });
      break;
    case 'off':
      r = cm.clearControl(opt.session);
      break;
    case 'heartbeat':
      r = cm.heartbeat(opt.session);
      break;
    case 'status': {
      const c = cm.readControl();
      r = { ok: true, control: c, fresh: Boolean(c && cm.isFresh(c)), path: cm.controlPath() };
      break;
    }
    default:
      return usage(`unknown: control ${cmd || ''} — on|off|status|heartbeat`);
  }
  out(r);
  return process.exit(r && r.ok === false ? 1 : 0);
}

const { pos, opt } = parse(process.argv.slice(2));
const [group, cmd, ...rest] = pos;
if (group === 'branch') branch(cmd, rest, opt);
else if (group === 'plan') plan(cmd, rest, opt);
else if (group === 'cd') cd(cmd, rest, opt);
else if (group === 'control') control(cmd, opt);
else usage('usage: lens-cli.js branch entry|ownership|merged|base … | plan structure|coverage|todo|gate|status|scan … | cd inspect <md> | control on|off|status|heartbeat');

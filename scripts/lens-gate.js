#!/usr/bin/env node
/**
 * Lens - lens-gate: the only supported way to write a gate ledger (v3.48).
 *
 * WHY: agents recorded evidence by hand-typing `exit:0` into `node -e` one-liners
 * (18f26c40: 6/6 hand-written, 13 quoting/backslash accidents) and edited the
 * ledger JSON with python. Here the checks are RUN by Lens and the result is
 * recorded with `source: "lens-gate run"` — the only evidence a schema 2 ledger
 * accepts for an auto gate.
 *
 *   node lens-gate.js status [scope] [--root <repo>]
 *   node lens-gate.js create <scope> --plan <md> --goal <문장> --gates <json 파일> [--root <repo>]
 *   node lens-gate.js run <scope> [gateId] [--timeout <초>] [--root <repo>]
 *   node lens-gate.js evidence <scope> <gateId> --note <관측> --confirmed-by <누가> [--root <repo>]
 *   node lens-gate.js abandon <scope> <gateId> --reason <사유> [--root <repo>]
 *   node lens-gate.js reopen <scope> [gateId] [--root <repo>]
 *   node lens-gate.js close <scope> [--root <repo>]
 *
 * gates JSON = [{id, criterion, kind?:'auto'|'manual', check?, expect?, cwd?}]
 * Output: one JSON line. Exit 0 = the command did its job (read the states in the
 * JSON), 1 = usage error / refused / unreadable ledger.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ledger = require(path.join(__dirname, '..', 'lib', 'gate-ledger'));

const RUN_TIMEOUT_S = 600;
const PROBE_TIMEOUT_S = 120; // create's one trial run (G2)
const MAX_OUTPUT = 8 * 1024 * 1024;

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      flags[a.slice(2)] = next !== undefined && !next.startsWith('--') ? (i += 1, next) : true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function repoRoot(flags) {
  if (typeof flags.root === 'string') return path.resolve(flags.root);
  try {
    return path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    return process.cwd();
  }
}

let bashCache = null;

/**
 * Git Bash on Windows. A bare `bash` there can resolve to WSL's
 * `System32\bash.exe` (or the WindowsApps stub), which runs checks in another
 * filesystem — so PATH is searched with those excluded.
 */
function bashPath() {
  if (bashCache) return bashCache;
  if (process.platform !== 'win32') return (bashCache = 'bash');
  const candidates = [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:/Program Files/Git/bin/bash.exe'];
  for (const c of candidates) if (c && fs.existsSync(c)) return (bashCache = c);
  try {
    const found = execFileSync('where', ['bash'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      .split(/\r?\n/).map(s => s.trim())
      .find(s => s && !/\\System32\\|WindowsApps/i.test(s));
    if (found) return (bashCache = found);
  } catch {}
  return (bashCache = 'bash');
}

/** Kill the check and everything it started — a timed-out test suite must not keep running. */
function killTree(child) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch {}
  }
}

/** Run one check with bash. Resolves {exit, output, timedOut, ms, error}. Never rejects. */
function runCheck(command, cwd, timeoutS) {
  return new Promise((resolve) => {
    const started = Date.now();
    let output = '';
    let timedOut = false;
    let settled = false;
    const done = (exit, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exit, output, timedOut, ms: Date.now() - started, error: error || null });
    };
    let child;
    try {
      child = spawn(bashPath(), ['-c', command], {
        cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
      });
    } catch (err) {
      return resolve({ exit: null, output: '', timedOut: false, ms: 0, error: err.message });
    }
    const collect = (chunk) => {
      output += chunk;
      if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    // On timeout, settle right here — do not wait for an 'exit' or a pipe close.
    // An MSYS helper (e.g. `sleep`) is outside the Windows process tree, and a
    // child the check backgrounded can outlive its bash parent (whose 'exit' has
    // then already fired) while holding the pipes open.
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      child.stdout.destroy();
      child.stderr.destroy();
      done(null);
    }, timeoutS * 1000);
    child.on('error', err => done(null, err.message));
    child.on('close', code => done(timedOut ? null : code));
  });
}

function readLedger(root, scope) {
  try {
    return JSON.parse(fs.readFileSync(ledger.ledgerPath(root, scope), 'utf-8'));
  } catch (err) {
    return null;
  }
}

function gateCwd(root, gate) {
  return gate && gate.cwd ? path.resolve(root, gate.cwd) : root;
}

const isAuto = gate => String((gate && gate.kind) || (gate && gate.check ? 'auto' : 'manual')).toLowerCase() !== 'manual';

// ── commands ─────────────────────────────────────────────

function status(root, scope) {
  const loaded = ledger.loadLedgers(root);
  if (scope) loaded.ledgers = loaded.ledgers.filter(l => l.scope === ledger.sanitizeScope(scope));
  const ev = ledger.evaluate(loaded);
  return {
    ok: true,
    root,
    ledgers: loaded.ledgers.map(l => ({
      scope: l.scope,
      schema: l.schema || 1,
      closedAt: l.closedAt || null,
      reopenedAt: l.reopenedAt || null,
      ...ledger.summarize(l),
      gates: l.gates.map(g => ({
        id: g && g.id,
        kind: (g && g.kind) || 'auto',
        state: ledger.gateState(g, l.schema),
        criterion: g && g.criterion,
        check: (g && g.check) || null,
        expect: (g && g.expect) || null,
      })),
    })),
    invalid: loaded.invalid,
    outstanding: ev.outstanding,
    awaitingUser: ev.awaitingUser,
    stale: ev.stale,
  };
}

async function create(root, scope, flags) {
  if (!scope) return { ok: false, error: 'scope 가 필요하다' };
  if (typeof flags.gates !== 'string') return { ok: false, error: '--gates <json 파일> 이 필요하다' };
  let gates;
  try {
    gates = JSON.parse(fs.readFileSync(path.resolve(flags.gates), 'utf-8'));
  } catch (err) {
    return { ok: false, error: `gates 파일을 읽을 수 없다: ${err.message}` };
  }
  if (!Array.isArray(gates) || !gates.length) return { ok: false, error: 'gates 는 비지 않은 배열이어야 한다' };

  // G2: an auto gate must be something a machine can actually run and decide.
  const probes = [];
  for (let i = 0; i < gates.length; i += 1) {
    const gate = gates[i] || {};
    const id = gate.id || `G${i + 1}`;
    if (!isAuto(gate)) continue;
    if (typeof gate.check !== 'string' || !gate.check.trim()) {
      return { ok: false, gate: id, error: `auto 게이트 ${id} 에 check 명령이 없다 — 실행할 명령을 적거나 kind:"manual" 로` };
    }
    if (typeof gate.expect !== 'string' || !gate.expect.trim()) {
      return { ok: false, gate: id, error: `auto 게이트 ${id} 에 expect 가 없다 — 성공이면 출력에 나오는 문자열을 적어라(없으면 영원히 met 이 될 수 없다)` };
    }
    const r = await runCheck(gate.check, gateCwd(root, gate), PROBE_TIMEOUT_S);
    if (r.error || r.exit === 126 || r.exit === 127) {
      return {
        ok: false,
        gate: id,
        error: `auto 게이트 ${id} 의 check 를 실행할 수 없다 (${r.error || `exit ${r.exit}`}) — 라벨이 아니라 셸 명령이어야 한다: ${gate.check}`,
        output: r.output.slice(-300),
      };
    }
    // A timeout or a failing exit still proves the command runs — it is simply unmet yet.
    probes.push({ id, exit: r.exit, timedOut: r.timedOut });
  }

  const made = ledger.createLedger(root, {
    scope,
    planDoc: typeof flags.plan === 'string' ? flags.plan : null,
    goal: typeof flags.goal === 'string' ? flags.goal : null,
    gates,
  });
  return made.ok ? { ...made, scope: ledger.sanitizeScope(scope), probes } : made;
}

async function run(root, scope, gateId, flags) {
  const l = scope && readLedger(root, scope);
  if (!l) return { ok: false, error: `원장을 읽을 수 없다: ${scope || '(scope 없음)'}` };
  const timeoutS = Number(flags.timeout) > 0 ? Number(flags.timeout) : RUN_TIMEOUT_S;
  let targets = (l.gates || []).filter(g => g && isAuto(g) && g.status !== 'abandoned');
  if (gateId) {
    const gate = (l.gates || []).find(g => g && g.id === gateId);
    if (!gate) return { ok: false, error: `게이트 ${gateId} 없음` };
    if (!isAuto(gate)) return { ok: false, error: `${gateId} 는 manual 이다 — 사용자 확인은 evidence 로 기록한다` };
    targets = [gate];
  }
  const results = [];
  for (const gate of targets) {
    if (typeof gate.check !== 'string' || !gate.check.trim()) {
      results.push({ id: gate.id, state: 'unmet', error: 'check 없음' });
      continue;
    }
    const cwd = gateCwd(root, gate);
    const r = await runCheck(gate.check, cwd, timeoutS);
    const note = r.timedOut ? `[lens-gate] timeout ${timeoutS}s\n` : r.error ? `[lens-gate] ${r.error}\n` : '';
    const rec = ledger.recordEvidence(root, scope, gate.id, {
      exit: r.exit,
      output: note + r.output,
      cwd,
      shell: bashPath(),
      source: ledger.RUNNER_SOURCE,
    });
    results.push({ id: gate.id, exit: r.exit, timedOut: r.timedOut, ms: r.ms, state: rec.ok ? rec.state : 'error', error: rec.ok ? undefined : rec.error });
  }
  const after = status(root, scope);
  return { ok: true, scope: l.scope, results, outstanding: after.outstanding, awaitingUser: after.awaitingUser };
}

function evidence(root, scope, gateId, flags) {
  const l = scope && readLedger(root, scope);
  if (!l) return { ok: false, error: `원장을 읽을 수 없다: ${scope || '(scope 없음)'}` };
  const gate = (l.gates || []).find(g => g && g.id === gateId);
  if (!gate) return { ok: false, error: `게이트 ${gateId} 없음` };
  if (isAuto(gate)) return { ok: false, error: `${gateId} 는 auto 다 — 증거는 lens-gate run 으로만 남는다` };
  if (typeof flags.note !== 'string' || typeof flags['confirmed-by'] !== 'string') {
    return { ok: false, error: '--note <관측> 과 --confirmed-by <누가> 가 필요하다' };
  }
  return ledger.recordEvidence(root, scope, gateId, { note: flags.note, confirmedBy: flags['confirmed-by'] });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  const root = repoRoot(flags);
  const [scope, gateId] = pos;
  switch (cmd) {
    case 'status': return status(root, scope);
    case 'create': return create(root, scope, flags);
    case 'run': return run(root, scope, gateId, flags);
    case 'evidence': return evidence(root, scope, gateId, flags);
    case 'abandon':
      if (!scope || !gateId) return { ok: false, error: 'abandon <scope> <gateId> --reason <사유>' };
      return ledger.abandonGate(root, scope, gateId, typeof flags.reason === 'string' ? flags.reason : '');
    case 'reopen':
      if (!scope) return { ok: false, error: 'reopen <scope> [gateId]' };
      return ledger.reopenLedger(root, scope, gateId);
    case 'close':
      if (!scope) return { ok: false, error: 'close <scope>' };
      return ledger.closeLedger(root, scope);
    default:
      return { ok: false, error: `알 수 없는 명령: ${cmd || '(없음)'} — status|create|run|evidence|abandon|reopen|close` };
  }
}

main()
  .catch(err => ({ ok: false, error: err && err.message }))
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result && result.ok ? 0 : 1;
  });

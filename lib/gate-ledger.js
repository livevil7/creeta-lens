/**
 * Lens - Gate Ledger (v3.35.0)
 *
 * The resolved runtime state of "what must be true before this work is done".
 *
 * WHY THIS EXISTS
 * ---------------
 * `/cc` already carried every rule unlazy asks for — 핵심원칙 1 (a single unmet
 * SUCCESS_CRITERIA forbids a done report), Phase 6 (no text review, prove it),
 * Phase 2 (top-level todos stay open until QA verifies). All of it was prose the
 * model graded itself against, and the user's measured complaint (2026-08-23) was
 * exactly the failure those rules were supposed to prevent: work drifts, then the
 * turn ends with the goal unmet.
 *
 * `hooks/stop.js` has been registered on the Stop event all along and fires at
 * every turn boundary, but both its success and its failure path wrote `{}` — a
 * meter sitting in the seat of a wall. This module is what lets that hook decide.
 *
 * THE SPLIT (authored vs resolved)
 * --------------------------------
 * The plan document's `✅ Review` table is the AUTHORED source: human-editable,
 * committed, reviewed. This ledger is the RESOLVED runtime state: JSON under
 * `.lens/gates/` (gitignored), written by the run, read by the hook in
 * milliseconds. Same split as plan-manager.js (markdown) ↔ agent-tracker.js
 * (.lens/agent-dashboard.json). A hook must not re-parse markdown every turn.
 *
 * THE ONE RULE THAT MATTERS
 * -------------------------
 * `status: "met"` with missing or pending evidence counts as UNMET — worse than
 * an untouched gate, because it means the agent graded its own work. Evidence for
 * an auto gate is an exit code plus a matched EXPECT pattern; a sentence is not
 * evidence.
 *
 * FAIL-OPEN, ALWAYS
 * -----------------
 * Every function here returns a safe value rather than throwing. A bug in gate
 * logic must never trap a session — an unenforced gate costs one sloppy turn, a
 * trapped session costs the machine.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { ensureLensDir, safeEnsureDir, safeWriteJson } = require('./hook-utils');

/** Schema of the block-counter file (session store `blocks.json`). */
const SCHEMA = 1;

/**
 * Schema of ledgers written by createLedger (v3.48). In a schema 2 ledger an
 * auto gate is met only with evidence the runner itself produced — 18f26c40
 * hand-wrote `exit:0` six times. Schema 1 ledgers keep the old rule so ledgers
 * open at upgrade time do not flip to unmet and re-block.
 */
const LEDGER_SCHEMA = 2;
const RUNNER_SOURCE = 'lens-gate run';

/**
 * Consecutive blocks on the SAME unmet set before the hook gives up.
 *
 * unlazy ships 6. Lens used 3, then 2 (v3.39). v3.48: the counter is keyed by
 * the set of unmet gate ids — no longer by the raw ledger text, whose timestamp
 * rewrites restarted the cap (b0a8c4aa: 8+ block→release cycles in 5 hours with
 * nothing moving). Real progress changes the set and resets it.
 */
const MAX_BLOCKS = 2;

/** A ledger nobody has touched in this long stops blocking (dead-run debris). */
const STALE_HOURS = 24;

const GATES_DIRNAME = path.join('.lens', 'gates');
const BLOCK_STATE_FILE = path.join('.lens', 'gate-block-state.json');

// ── paths ────────────────────────────────────────────────

function gatesDir(projectRoot) {
  return path.join(projectRoot || process.cwd(), GATES_DIRNAME);
}

function blockStatePath(projectRoot) {
  return path.join(projectRoot || process.cwd(), BLOCK_STATE_FILE);
}

// ── user-level index of repos holding open ledgers (v3.39) ──
//
// /cc creates a ledger in the repo it works in (`process.cwd()` of its shell),
// while a workspace session's Stop hook runs with the workspace as cwd — it read
// an empty `.lens/gates` and passed silently. The index lets the hook find every
// repo that currently holds an open ledger.

function indexPath() {
  return process.env.LENS_LEDGER_INDEX || path.join(require('os').homedir(), '.claude', 'lens', 'active-ledgers.json');
}

function readIndex() {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath(), 'utf-8'));
    return Array.isArray(parsed.roots) ? parsed : { roots: [] };
  } catch {
    return { roots: [] };
  }
}

function registerRoot(projectRoot, scope) {
  const root = path.resolve(projectRoot || process.cwd());
  const index = readIndex();
  index.roots = index.roots
    .filter(r => r && !(r.root === root && r.scope === scope))
    .concat([{ root, scope, at: new Date().toISOString() }])
    .slice(-50);
  safeWriteJson(indexPath(), index);
}

function unregisterRoot(projectRoot, scope) {
  const root = path.resolve(projectRoot || process.cwd());
  const index = readIndex();
  const kept = index.roots.filter(r => r && !(r.root === root && r.scope === scope));
  if (kept.length !== index.roots.length) safeWriteJson(indexPath(), { roots: kept });
}

/** Distinct repo roots with a ledger registered in the last STALE_HOURS. */
function indexedRoots(nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const roots = [];
  for (const r of readIndex().roots) {
    const at = Date.parse((r && r.at) || '');
    if (!r || !r.root || Number.isNaN(at) || now - at > STALE_HOURS * 3600 * 1000) continue;
    if (!roots.includes(r.root)) roots.push(r.root);
  }
  return roots;
}

function ledgerPath(projectRoot, scope) {
  return path.join(gatesDir(projectRoot), `${sanitizeScope(scope)}.json`);
}

/**
 * Scope ids become filenames, so they are restricted rather than escaped.
 * Anything outside the allowlist collapses to `-`; an empty result is rejected
 * by the callers.
 */
function sanitizeScope(scope) {
  return String(scope || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    // Leading dots are stripped too: a separator-free `..-..-etc-passwd` cannot
    // traverse, but a ledger filename that opens with `..` is confusing debris.
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

// ── gate state ───────────────────────────────────────────

/**
 * Decide one gate's state.
 *
 * Returns one of:
 *   'met'               — proven; exit 0 + EXPECT matched (auto) or confirmed (manual)
 *   'unmet'             — honestly open
 *   'unmet-no-evidence' — CLAIMED met without proof. Self-grading. Blocks.
 *   'abandoned'         — deliberately dropped WITH a written reason
 *   'invalid'           — malformed. Malformed is an error, never a completion.
 */
function gateState(gate, schema) {
  if (!gate || typeof gate !== 'object') return 'invalid';
  if (!isNonEmptyString(gate.id)) return 'invalid';
  if (!isNonEmptyString(gate.criterion)) return 'invalid';

  const status = String(gate.status || 'unmet').toLowerCase();

  if (status === 'abandoned') {
    // Silently dropping a gate is the failure mode this whole module exists to
    // stop, so an abandonment without a reason is not an exit — it is a defect.
    return isNonEmptyString(gate.abandonReason) ? 'abandoned' : 'invalid';
  }

  if (status !== 'met') return 'unmet';

  const evidence = normalizeEvidence(gate.evidence);
  if (!evidence) return 'unmet-no-evidence';

  const kind = String(gate.kind || 'auto').toLowerCase();

  if (kind === 'manual') {
    // A manual gate cannot be self-passed: someone outside the run has to say so.
    // (Mirrors /cc Phase 6 rule 2 — manual 항목을 자동으로 pass 처리 금지.)
    return isNonEmptyString(evidence.note) && isNonEmptyString(evidence.confirmedBy)
      ? 'met'
      : 'unmet-no-evidence';
  }

  // auto: the command actually ran, exited clean, and its EXPECT pattern matched.
  const exitedClean = evidence.exit === 0;
  const matched = evidence.expectMatched === true;
  // schema 2: and the runner ran it — an exit code handed in by the agent is a claim.
  const ranByRunner = !(Number(schema) >= LEDGER_SCHEMA) || evidence.source === RUNNER_SOURCE;
  return exitedClean && matched && ranByRunner ? 'met' : 'unmet-no-evidence';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * `"pending"` is the template's placeholder and the single most likely thing to
 * be left behind, so it is rejected as hard as a missing field.
 */
function normalizeEvidence(evidence) {
  if (!evidence) return null;
  if (typeof evidence === 'string') return null; // includes "pending"
  if (typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  return evidence;
}

const BLOCKING_STATES = new Set(['unmet', 'unmet-no-evidence', 'invalid']);

// ── loading ──────────────────────────────────────────────

/**
 * Read every ledger under `.lens/gates/`. Never throws.
 *
 * @returns {{ledgers: Array, invalid: Array<{file: string, error: string}>}}
 */
function loadLedgers(projectRoot) {
  const dir = gatesDir(projectRoot);
  const result = { ledgers: [], invalid: [] };

  let entries;
  try {
    if (!fs.existsSync(dir)) return result;
    entries = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json'));
  } catch (err) {
    return result;
  }

  for (const file of entries.sort()) {
    const full = path.join(dir, file);
    try {
      const raw = fs.readFileSync(full, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.gates)) {
        result.invalid.push({ file, error: 'gates 배열이 없다' });
        continue;
      }
      parsed.__file = file;
      parsed.__root = path.resolve(projectRoot || process.cwd());
      parsed.scope = parsed.scope || path.basename(file, '.json');
      result.ledgers.push(parsed);
    } catch (err) {
      result.invalid.push({ file, error: err.message });
    }
  }

  return result;
}

// ── evaluation ───────────────────────────────────────────

/**
 * Reduce loaded ledgers to a blocking decision input.
 *
 * A ledger stops counting when it is closed (Phase 7 wrote `closedAt`) or when
 * nothing has touched it for STALE_HOURS — dead-run debris must not hold a repo
 * hostage forever (risk R2 in the plan).
 *
 * v3.48:
 *  - A manual gate that is still open goes to `awaitingUser`, not `outstanding`.
 *    Only the user can meet it, so blocking the turn on it made the agent end
 *    every question turn blocked (7/40 blocks came right after a question).
 *  - `contentHash` is the hash of the unmet gate ids only (`scope:id`, sorted).
 *    Hashing the raw ledger text made a timestamp rewrite restart the cap.
 *
 * @returns {{outstanding: string[], awaitingUser: string[], scopes: string[], roots: object,
 *            stale: string[], closed: string[], contentHash: string, active: number}}
 */
function evaluate(loaded, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const out = { outstanding: [], awaitingUser: [], scopes: [], roots: {}, stale: [], closed: [], contentHash: '', active: 0 };
  if (!loaded) return out;

  const ids = [];
  const owe = (scope, id, line) => {
    out.outstanding.push(line);
    ids.push(`${scope}:${id}`);
    if (!out.scopes.includes(scope)) out.scopes.push(scope);
  };

  for (const entry of loaded.invalid || []) {
    owe(entry.file, 'PARSE', `${entry.file}:PARSE (${entry.error})`);
  }

  for (const ledger of loaded.ledgers || []) {
    const scope = ledger.scope;

    if (isNonEmptyString(ledger.closedAt)) {
      out.closed.push(scope);
      continue;
    }

    const stampMs = parseTime(ledger.updatedAt || ledger.createdAt);
    if (stampMs !== null && now - stampMs > STALE_HOURS * 3600 * 1000) {
      out.stale.push(scope);
      continue;
    }

    out.active += 1;
    if (ledger.__root) out.roots[scope] = ledger.__root;

    ledger.gates.forEach((gate, index) => {
      const state = gateState(gate, ledger.schema);
      if (!BLOCKING_STATES.has(state)) return;
      const id = isNonEmptyString(gate && gate.id) ? gate.id : `#${index + 1}`;
      const label = truncate(gate && gate.criterion, 70);
      const marker = state === 'unmet-no-evidence' ? ' [증거 없음]' : state === 'invalid' ? ' [형식 오류]' : '';
      const line = `${scope}:${id}${marker}${label ? ` — ${label}` : ''}`;
      if (state !== 'invalid' && String((gate && gate.kind) || 'auto').toLowerCase() === 'manual') {
        out.awaitingUser.push(line);
        return;
      }
      owe(scope, id, line);
    });
  }

  out.contentHash = sha256(ids.sort().join('\u0000')).slice(0, 24);
  return out;
}

function parseTime(value) {
  if (!isNonEmptyString(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function truncate(text, max) {
  if (!isNonEmptyString(text)) return '';
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function tail(text, max) {
  if (!isNonEmptyString(text)) return '';
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `…${clean.slice(-(max - 1))}`;
}

// ── block decision ───────────────────────────────────────

/**
 * Decide whether this Stop should be refused.
 *
 * v3.48: the state is one session's `blocks.json` (the session store keeps one
 * per session), `{schema, entries: {<scope>: {hash, blocks, releasedHash}}}`.
 * The key is the scope(s) still owing work; the hash is evaluate().contentHash —
 * the unmet gate ids only. After MAX_BLOCKS the run is released with ONE notice
 * per hash (`releasedHash`); the same unmet set then passes silently. 3.47
 * repeated its release message every turn — 52 times on 09-21, on the user's
 * screen.
 *
 * @param {object} evaluation  from evaluate()
 * @param {object} state       previous blocks.json contents (may be null/garbage)
 * @param {object} opts        {cli, maxBlocks, nowIso} — cli = lens-gate.js path for the reason
 * @returns {{block: boolean, released: boolean, reason: string|null, notice: string|null, state: object}}
 */
function decideBlock(evaluation, state, opts = {}) {
  const maxBlocks = Number.isFinite(opts.maxBlocks) ? opts.maxBlocks : MAX_BLOCKS;
  const nowIso = opts.nowIso || new Date().toISOString();

  const base = normalizeState(state);
  const outstanding = (evaluation && evaluation.outstanding) || [];
  const pass = { block: false, released: false, reason: null, notice: null, state: base };

  if (!outstanding.length) {
    // Nothing owed. Forget the counters so a later ledger starts from zero.
    base.entries = {};
    return pass;
  }

  const key = ((evaluation && evaluation.scopes) || []).slice().sort().join('+') || 'default';
  const hash = (evaluation && evaluation.contentHash) || '';
  const prev = base.entries[key];
  const entry = prev && prev.hash === hash
    ? { ...prev }
    : { hash, blocks: 0, releasedHash: (prev && prev.releasedHash) || null };
  entry.updatedAt = nowIso;
  base.entries[key] = entry;
  base.entries = trimEntries(base.entries);

  // Already released for exactly this unmet set: say nothing more.
  if (entry.releasedHash === hash) return { ...pass, released: true };

  entry.blocks = (Number(entry.blocks) || 0) + 1;
  if (entry.blocks > maxBlocks) {
    entry.releasedHash = hash;
    return { ...pass, released: true, notice: releaseNotice(outstanding, maxBlocks) };
  }

  return { ...pass, block: true, reason: buildReason(evaluation, entry.blocks, maxBlocks, opts.cli) };
}

const slash = p => String(p).split(path.sep).join('/');

/**
 * What the model reads next: the count, the list, and the exact lens-gate
 * commands — so it runs the checks instead of reverse-engineering the hook or
 * hand-editing the ledger (both observed on 09-18/09-21).
 */
function buildReason(evaluation, blocks, maxBlocks, cli) {
  const outstanding = evaluation.outstanding;
  const shown = outstanding.slice(0, 5);
  const rest = outstanding.length - shown.length;
  const scope = (evaluation.scopes && evaluation.scopes[0]) || '<scope>';
  const root = evaluation.roots && evaluation.roots[scope];
  const tool = `node "${slash(cli || path.join(__dirname, '..', 'scripts', 'lens-gate.js'))}"`;
  const at = root ? ` --root "${slash(root)}"` : '';

  return [
    `완료 조건 ${outstanding.length}건 미확인 (${blocks}/${maxBlocks}) — lens-gate status 로 보고 lens-gate run 으로 검사를 돌리거나 lens-gate abandon 으로 사유를 남겨라.`,
    ...shown.map(item => `  - ${item}`),
    ...(rest > 0 ? [`  - … 외 ${rest}건`] : []),
    '',
    `보기: ${tool} status ${scope}${at}`,
    `검사 실행(전부, 하나만이면 scope 뒤에 id): ${tool} run ${scope}${at}`,
    `불가능한 조건: ${tool} abandon ${scope} <id> --reason "<왜 불가능한지>"${at}`,
    `원장 파일을 손으로 고치지 마라. 같은 미충족 상태로 ${maxBlocks}회 막히면 더 막지 않는다.`,
  ].join('\n');
}

/** Model-facing (Stop additionalContext). Sent once per unmet set. */
function releaseNotice(outstanding, maxBlocks) {
  return `완료 조건 ${outstanding.length}건이 미확인인 채 ${maxBlocks}회 연속 막혔다 — 이 상태로는 더 막지 않는다. `
    + '턴을 끝내도 된다. 보고에는 남은 일을 사람 말로 한 줄만 적는다(원장·게이트 같은 내부 용어 금지). '
    + `남은 조건: ${outstanding.slice(0, 4).join(' · ')}${outstanding.length > 4 ? ` 외 ${outstanding.length - 4}건` : ''}`;
}

function normalizeState(state) {
  const entries = state && typeof state === 'object' && !Array.isArray(state)
    && state.entries && typeof state.entries === 'object' && !Array.isArray(state.entries)
    ? state.entries : {};
  return { schema: SCHEMA, entries: { ...entries } };
}

/** Bound debris from old scopes. */
function trimEntries(entries) {
  const list = Object.entries(entries).sort((a, b) =>
    String(b[1] && b[1].updatedAt).localeCompare(String(a[1] && a[1].updatedAt)));
  return Object.fromEntries(list.slice(0, 64));
}

// ── writers (used by /cc, not by the hook) ───────────────

/**
 * Create (or replace) a ledger for one run.
 *
 * `gates` come from the plan document's ✅ Review table. A row with a runnable
 * command is `kind: "auto"` and carries check/expect; a row that no command can
 * decide is `kind: "manual"`.
 */
function createLedger(projectRoot, { scope, planDoc, goal, sessionId, gates } = {}) {
  const cleanScope = sanitizeScope(scope);
  if (!cleanScope) return { ok: false, error: 'scope 가 비었다' };
  if (!Array.isArray(gates) || !gates.length) return { ok: false, error: 'gates 가 비었다' };

  const now = new Date().toISOString();
  const ledger = {
    schema: LEDGER_SCHEMA,
    scope: cleanScope,
    planDoc: planDoc || null,
    goal: goal || null,
    // The Stop hook only holds a session to its own ledgers. /cc rarely passes
    // this, so the shell's session id is the default (v3.39).
    sessionId: sessionId || process.env.CLAUDE_CODE_SESSION_ID || null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    gates: gates.map((gate, index) => ({
      id: isNonEmptyString(gate.id) ? gate.id : `G${index + 1}`,
      criterion: String(gate.criterion || '').trim(),
      kind: String(gate.kind || (gate.check ? 'auto' : 'manual')).toLowerCase() === 'manual' ? 'manual' : 'auto',
      check: gate.check || null,
      expect: gate.expect || null,
      cwd: gate.cwd || null,
      status: 'unmet',
      evidence: null,
      abandonReason: null,
    })),
  };

  ensureLensDir(projectRoot || process.cwd()); // J3a: keep .lens out of git
  if (!safeEnsureDir(gatesDir(projectRoot))) return { ok: false, error: '.lens/gates 생성 실패' };
  const target = ledgerPath(projectRoot, cleanScope);
  if (!safeWriteJson(target, ledger)) return { ok: false, error: '원장 쓰기 실패' };
  registerRoot(projectRoot, cleanScope);
  return { ok: true, path: target, gates: ledger.gates.length };
}

/**
 * Record the result of running one gate.
 *
 * `expectMatched` is computed here rather than trusted from the caller: the
 * whole point is that the pattern decides, not the agent's reading of the output.
 * `source` is RUNNER_SOURCE only when scripts/lens-gate.js ran the check itself;
 * a schema 2 ledger accepts nothing else for an auto gate (gateState).
 */
function recordEvidence(projectRoot, scope, gateId, { exit, output, cwd, shell, note, confirmedBy, source } = {}) {
  const target = ledgerPath(projectRoot, scope);
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `원장을 읽을 수 없다: ${err.message}` };
  }

  const gate = (ledger.gates || []).find(g => g && g.id === gateId);
  if (!gate) return { ok: false, error: `게이트 ${gateId} 없음` };

  const text = output === undefined || output === null ? '' : String(output);
  const expectMatched = gate.kind === 'manual'
    ? undefined
    : isNonEmptyString(gate.expect) ? text.includes(gate.expect) : false;

  gate.evidence = {
    shell: shell || (process.platform === 'win32' ? 'bash (git-bash)' : 'bash'),
    cwd: cwd || projectRoot || process.cwd(),
    exit: Number.isFinite(exit) ? exit : null,
    expectMatched,
    // The tail, not the head: test runners print their verdict last.
    output: tail(text, 600),
    note: note || null,
    confirmedBy: confirmedBy || null,
    source: source || null,
    at: new Date().toISOString(),
  };
  gate.status = 'met';

  // The gate is only actually met if gateState agrees — recording evidence is
  // not the same as passing, and this keeps a failed run from marking itself met.
  const state = gateState(gate, ledger.schema);
  if (state !== 'met') gate.status = 'unmet';

  ledger.updatedAt = new Date().toISOString();
  if (!safeWriteJson(target, ledger)) return { ok: false, error: '원장 쓰기 실패' };
  return { ok: true, state, gate: gate.id };
}

/** Record an honest abandonment. A blank reason is rejected, not stored. */
function abandonGate(projectRoot, scope, gateId, reason) {
  if (!isNonEmptyString(reason)) return { ok: false, error: 'ABANDON 사유가 비었다' };
  const target = ledgerPath(projectRoot, scope);
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `원장을 읽을 수 없다: ${err.message}` };
  }
  const gate = (ledger.gates || []).find(g => g && g.id === gateId);
  if (!gate) return { ok: false, error: `게이트 ${gateId} 없음` };

  gate.status = 'abandoned';
  gate.abandonReason = String(reason).trim();
  ledger.updatedAt = new Date().toISOString();
  if (!safeWriteJson(target, ledger)) return { ok: false, error: '원장 쓰기 실패' };
  return { ok: true, gate: gate.id };
}

/** Close a ledger at Phase 7 so it stops arming the hook. */
function closeLedger(projectRoot, scope) {
  const target = ledgerPath(projectRoot, scope);
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `원장을 읽을 수 없다: ${err.message}` };
  }
  const summary = summarize(ledger);
  ledger.closedAt = new Date().toISOString();
  ledger.updatedAt = ledger.closedAt;
  if (!safeWriteJson(target, ledger)) return { ok: false, error: '원장 쓰기 실패' };
  unregisterRoot(projectRoot, sanitizeScope(scope));
  return { ok: true, ...summary };
}

/**
 * Reopen a closed ledger, or one gate (v3.48, A6). With no way back, runs
 * escaped by abandoning and closing, and the ledger then said "abandoned 4" even
 * after the checks really passed (18f26c40 09-18). A reopened gate is `unmet`
 * until `lens-gate run` records fresh evidence. The ledger is registered again
 * because closeLedger took it out of the index the Stop hook reads.
 */
function reopenLedger(projectRoot, scope, gateId) {
  const target = ledgerPath(projectRoot, scope);
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `원장을 읽을 수 없다: ${err.message}` };
  }
  const now = new Date().toISOString();
  if (gateId) {
    const gate = (ledger.gates || []).find(g => g && g.id === gateId);
    if (!gate) return { ok: false, error: `게이트 ${gateId} 없음` };
    gate.status = 'unmet';
    gate.abandonReason = null;
    gate.reopenedAt = now;
  }
  ledger.closedAt = null;
  ledger.reopenedAt = now;
  ledger.updatedAt = now;
  if (!safeWriteJson(target, ledger)) return { ok: false, error: '원장 쓰기 실패' };
  registerRoot(projectRoot, sanitizeScope(scope));
  return { ok: true, gate: gateId || null };
}

/** met / unmet / abandoned counts for the Phase 7 report. */
function summarize(ledger) {
  const counts = { met: 0, unmet: 0, abandoned: 0, invalid: 0 };
  for (const gate of (ledger && ledger.gates) || []) {
    const state = gateState(gate, ledger.schema);
    if (state === 'met') counts.met += 1;
    else if (state === 'abandoned') counts.abandoned += 1;
    else if (state === 'invalid') counts.invalid += 1;
    else counts.unmet += 1;
  }
  return counts;
}

/** Read-only status for `/cc` reporting and for humans. */
function status(projectRoot) {
  const loaded = loadLedgers(projectRoot);
  const evaluation = evaluate(loaded);
  return {
    ledgers: loaded.ledgers.map(l => ({ scope: l.scope, closedAt: l.closedAt || null, ...summarize(l) })),
    invalid: loaded.invalid,
    outstanding: evaluation.outstanding,
    stale: evaluation.stale,
    closed: evaluation.closed,
  };
}

module.exports = {
  LEDGER_SCHEMA,
  MAX_BLOCKS,
  RUNNER_SOURCE,
  STALE_HOURS,
  abandonGate,
  blockStatePath,
  closeLedger,
  createLedger,
  decideBlock,
  evaluate,
  gateState,
  gatesDir,
  indexedRoots,
  ledgerPath,
  loadLedgers,
  registerRoot,
  unregisterRoot,
  recordEvidence,
  reopenLedger,
  sanitizeScope,
  status,
  summarize,
};

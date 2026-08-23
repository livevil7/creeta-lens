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

const { safeEnsureDir, safeWriteJson } = require('./hook-utils');

const SCHEMA = 1;

/**
 * Consecutive blocks on the SAME ledger content before the hook gives up and
 * lets the turn end with a warning.
 *
 * unlazy ships 6. Lens uses 3 because a blocked turn delivers NO message to the
 * user, and the user's standing 2-minute progress rule (harness-rules §4.4)
 * makes silence itself a violation. Three turns of silence is the most this may
 * cost. The counter is keyed by content hash, so any real edit to the ledger
 * resets it — the cap only bites when nothing is moving.
 */
const MAX_BLOCKS = 3;

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
function gateState(gate) {
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
  return exitedClean && matched ? 'met' : 'unmet-no-evidence';
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
      parsed.__raw = raw;
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
 * @returns {{outstanding: string[], stale: string[], closed: string[], contentHash: string, active: number}}
 */
function evaluate(loaded, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const out = { outstanding: [], stale: [], closed: [], contentHash: '', active: 0 };
  if (!loaded) return out;

  const hashParts = [];

  for (const entry of loaded.invalid || []) {
    out.outstanding.push(`${entry.file}:PARSE (${entry.error})`);
    hashParts.push(`${entry.file} ${entry.error}`);
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
    hashParts.push(`${scope} ${ledger.__raw || JSON.stringify(ledger.gates)}`);

    ledger.gates.forEach((gate, index) => {
      const state = gateState(gate);
      if (!BLOCKING_STATES.has(state)) return;
      const id = isNonEmptyString(gate && gate.id) ? gate.id : `#${index + 1}`;
      const label = truncate(gate && gate.criterion, 70);
      const marker = state === 'unmet-no-evidence' ? ' [증거 없음]' : state === 'invalid' ? ' [형식 오류]' : '';
      out.outstanding.push(`${scope}:${id}${marker}${label ? ` — ${label}` : ''}`);
    });
  }

  out.contentHash = sha256(hashParts.join('')).slice(0, 24);
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

// ── block decision ───────────────────────────────────────

/**
 * Decide whether this Stop should be refused.
 *
 * The counter lives per session AND per content hash: editing the ledger (real
 * progress, or an honest ABANDON) resets it, so the cap only fires when the run
 * is spinning without moving.
 *
 * @param {object} evaluation  from evaluate()
 * @param {object} state       previous block state file contents (may be null)
 * @param {object} opts        {sessionKey, maxBlocks, nowIso}
 * @returns {{block: boolean, released: boolean, reason: string|null, systemMessage: string|null, state: object}}
 */
function decideBlock(evaluation, state, opts = {}) {
  const sessionKey = isNonEmptyString(opts.sessionKey) ? opts.sessionKey : 'anonymous';
  const maxBlocks = Number.isFinite(opts.maxBlocks) ? opts.maxBlocks : MAX_BLOCKS;
  const nowIso = opts.nowIso || new Date().toISOString();

  const base = normalizeState(state);
  const outstanding = (evaluation && evaluation.outstanding) || [];

  if (!outstanding.length) {
    // Nothing owed. Drop this session's counter so a later, unrelated ledger
    // starts from zero instead of inheriting an old strike count.
    delete base.sessions[sessionKey];
    return { block: false, released: false, reason: null, systemMessage: null, state: base };
  }

  const hash = (evaluation && evaluation.contentHash) || '';
  let entry = base.sessions[sessionKey];
  if (!entry || entry.hash !== hash) entry = { hash, blocks: 0 };
  entry.blocks += 1;
  entry.updatedAt = nowIso;
  base.sessions[sessionKey] = entry;
  base.sessions = trimSessions(base.sessions);

  if (entry.blocks > maxBlocks) {
    return {
      block: false,
      released: true,
      reason: null,
      systemMessage:
        `[Lens] 게이트 ${outstanding.length}건이 미충족인 채 ${maxBlocks}회 연속 차단 — 자동 해제한다. ` +
        `남은 항목: ${outstanding.slice(0, 4).join(' · ')}${outstanding.length > 4 ? ` 외 ${outstanding.length - 4}건` : ''}`,
      state: base,
    };
  }

  return {
    block: true,
    released: false,
    reason: buildReason(outstanding, entry.blocks, maxBlocks),
    systemMessage: null,
    state: base,
  };
}

/**
 * The reason is what the model reads next, so it states the obligation, the
 * user's standing reporting rule, and the only honest way out — in that order.
 */
function buildReason(outstanding, blocks, maxBlocks) {
  const shown = outstanding.slice(0, 5);
  const rest = outstanding.length - shown.length;
  const list = shown.map(item => `  - ${item}`).join('\n');

  return [
    `[Lens 게이트] 미충족 ${outstanding.length}건이 남아 턴을 끝낼 수 없다 (${blocks}/${maxBlocks}).`,
    list + (rest > 0 ? `\n  - … 외 ${rest}건` : ''),
    '',
    '순서대로 하라:',
    '1. 진행보고 한 줄 — 끝난 것/남은 것 N/M 과 부분 산출물. 차단된 턴은 사용자에게 메시지가 가지 않으므로, 다음 턴 본문 첫 줄에 이것을 쓴다.',
    '2. 남은 게이트를 실제로 실행해 증거를 남긴다 — auto 는 명령 exit code + EXPECT 매칭, manual 은 사용자 확인. 증거 없는 met 는 미충족으로 계산된다.',
    '3. 정말 불가능한 게이트만 사유를 적어 포기한다 — 원장의 해당 게이트에 status="abandoned" 와 abandonReason 을 쓴다. 조용히 지우지 마라.',
    '',
    `게이트 원장: .lens/gates/*.json — ${maxBlocks}회 연속 진전이 없으면 경고와 함께 자동 해제된다.`,
  ].join('\n');
}

function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { schema: SCHEMA, sessions: {} };
  }
  if (!state.sessions || typeof state.sessions !== 'object' || Array.isArray(state.sessions)) {
    return { schema: SCHEMA, sessions: {} };
  }
  return { schema: SCHEMA, sessions: { ...state.sessions } };
}

/** Bound debris from abandoned sessions without mixing counters between them. */
function trimSessions(sessions) {
  const entries = Object.entries(sessions).sort((a, b) =>
    String(b[1] && b[1].updatedAt).localeCompare(String(a[1] && a[1].updatedAt)));
  return Object.fromEntries(entries.slice(0, 64));
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
    schema: SCHEMA,
    scope: cleanScope,
    planDoc: planDoc || null,
    goal: goal || null,
    sessionId: sessionId || null,
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

  if (!safeEnsureDir(gatesDir(projectRoot))) return { ok: false, error: '.lens/gates 생성 실패' };
  const target = ledgerPath(projectRoot, cleanScope);
  if (!safeWriteJson(target, ledger)) return { ok: false, error: '원장 쓰기 실패' };
  return { ok: true, path: target, gates: ledger.gates.length };
}

/**
 * Record the result of running one gate.
 *
 * `expectMatched` is computed here rather than trusted from the caller: the
 * whole point is that the pattern decides, not the agent's reading of the output.
 */
function recordEvidence(projectRoot, scope, gateId, { exit, output, cwd, shell, note, confirmedBy } = {}) {
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
    output: truncate(text, 600),
    note: note || null,
    confirmedBy: confirmedBy || null,
    at: new Date().toISOString(),
  };
  gate.status = 'met';

  // The gate is only actually met if gateState agrees — recording evidence is
  // not the same as passing, and this keeps a failed run from marking itself met.
  const state = gateState(gate);
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
  return { ok: true, ...summary };
}

/** met / unmet / abandoned counts for the Phase 7 report. */
function summarize(ledger) {
  const counts = { met: 0, unmet: 0, abandoned: 0, invalid: 0 };
  for (const gate of (ledger && ledger.gates) || []) {
    const state = gateState(gate);
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
  MAX_BLOCKS,
  STALE_HOURS,
  abandonGate,
  blockStatePath,
  closeLedger,
  createLedger,
  decideBlock,
  evaluate,
  gateState,
  gatesDir,
  ledgerPath,
  loadLedgers,
  recordEvidence,
  sanitizeScope,
  status,
  summarize,
};

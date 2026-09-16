'use strict';
/**
 * Lens - Report Viewer (v3.37.0, reworked v3.39.0)
 *
 * Puts a finished plan document in front of the user instead of naming its path.
 *
 * WHY THIS EXISTS
 * ---------------
 * Owner complaint (2026-09-04): "board 및 md파일 뭐 저장은 한대. 근데 저장했으니,
 * 승인해라 이렇게만 보고를 해 … 맨날 계획서 찾는다고 탐색기 찾고 뭐하고 아주
 * 지겨워 죽겠어." Approving a document you have not seen is not approval.
 *
 * v3.39 — WHICH SURFACE SHOWS IT
 * ------------------------------
 * Owner complaint (2026-09-14): the skill forced md + HTML slide decks, so none of
 * the engines could use their own planning artifacts and every plan came out as
 * hard-to-read markdown. The deck pipeline is gone. The plan is shown on the
 * surface the running engine already has, decided by the skill from its tool list:
 *   artifact — Claude Code's Artifact tool (a URL that opens anywhere)
 *   inline   — Codex app `visualize` (rendered inside the conversation)
 *   sendfile — a rendered file delivered next to the conversation
 * All three are performed by the engine and recorded here with `recordShown`.
 *
 * WHAT COUNTS AS SHOWN
 * --------------------
 * Only those three methods, and every one of them is performed by the engine —
 * v3.42 removed the browser lane (owner: "보드나 html 이건 안 해도 돼"), so Lens
 * renders nothing and opens nothing. A record stops counting when the document
 * changes after it was shown (`stale`) — a Modify that is not re-shown means the
 * user is approving the tab they opened before.
 *
 * FAIL-SOFT
 * ---------
 * Every function returns a value rather than throwing. Failing to open a browser
 * must never take down a planning run — it must only fail the "did the user see
 * it" gate, which is a reportable state, not a crash.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { safeReadJson, safeWriteJson } = require('./hook-utils');

const SCHEMA = 1;
const RECORD_REL = path.join('.lens', 'report-shown.json');

/** Methods that actually put the document in front of a human (v3.42: all engine-side). */
const SHOWN_METHODS = new Set(['artifact', 'inline', 'sendfile']);
/** Methods an engine performs itself and reports back through recordShown. */
const RECORDABLE_METHODS = new Set(['artifact', 'inline', 'sendfile']);

/** Keep the record bounded; it is a per-repo scratch file, not history. */
const MAX_ENTRIES = 100;

function recordPath(projectRoot) {
  return path.join(projectRoot || process.cwd(), RECORD_REL);
}

/** `docs/tasks/2026-09-04-x.md`, `2026-09-04-x.html`, or a bare id → the id. */
function planIdOf(target) {
  const base = path.basename(String(target || '').trim());
  return base.replace(/\.(md|html)$/i, '');
}

/**
 * The document to show, absolute path, or null.
 *
 * v3.39: the markdown is the document. A `.html` beside it is a slide deck from
 * before v3.39 and is used only when there is no markdown at all.
 */
function resolveTarget(projectRoot, planId) {
  const root = projectRoot || process.cwd();
  const candidates = [
    path.join(root, 'docs', 'tasks', `${planId}.md`),
    path.join(root, 'docs', 'history', `${planId}.md`),
    path.join(root, 'docs', 'tasks', `${planId}.html`),
    path.join(root, 'docs', 'history', `${planId}.html`),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* unreadable candidate is simply not a candidate */
    }
  }
  return null;
}

/** First 12 hex of the markdown's sha256 (line endings normalized), or null. */
function documentSha(projectRoot, planId) {
  const file = resolveTarget(projectRoot, planId);
  if (!file || !/\.md$/i.test(file)) return null;
  try {
    const text = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

function readRecord(projectRoot) {
  const raw = safeReadJson(recordPath(projectRoot), null);
  if (!raw || typeof raw !== 'object' || typeof raw.shown !== 'object' || !raw.shown) {
    return { schema: SCHEMA, shown: {} };
  }
  return { schema: SCHEMA, shown: raw.shown };
}

function writeRecord(projectRoot, record) {
  const ids = Object.keys(record.shown);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => String(record.shown[a].shownAt || '').localeCompare(String(record.shown[b].shownAt || '')))
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach(id => { delete record.shown[id]; });
  }
  return safeWriteJson(recordPath(projectRoot), record);
}

function markShown(projectRoot, planId, entry) {
  const record = readRecord(projectRoot);
  const sha = documentSha(projectRoot, planId);
  record.shown[planId] = { planId, shownAt: new Date().toISOString(), ...(sha ? { sha } : {}), ...entry };
  writeRecord(projectRoot, record);
  return record.shown[planId];
}

/**
 * shown | stale | unshown, with the record entry.
 *
 * `stale` = shown, but the markdown changed since. Only a record that carries a
 * hash can go stale; records from before v3.39 keep counting as shown.
 */
function showState(projectRoot, planId) {
  const entry = readRecord(projectRoot).shown[planId];
  if (!entry || !SHOWN_METHODS.has(entry.method)) return { state: 'unshown', entry: entry || null };
  if (entry.sha) {
    const now = documentSha(projectRoot, planId);
    if (now && now !== entry.sha) return { state: 'stale', entry };
  }
  return { state: 'shown', entry };
}

/** The entry if the user was actually shown the current version of this plan, else null. */
function wasShown(projectRoot, planId) {
  const s = showState(projectRoot, planId);
  return s.state === 'shown' ? s.entry : null;
}

/**
 * Record a view the engine performed itself — an Artifact URL, a Codex inline
 * visualization path, a delivered file.
 */
function recordShown(projectRoot, planId, method, ref) {
  const root = projectRoot || process.cwd();
  const id = planIdOf(planId);
  if (!RECORDABLE_METHODS.has(method)) {
    return { ok: false, method: method || null, planId: id, note: `기록할 수 있는 방식은 ${[...RECORDABLE_METHODS].join(' · ')} 뿐이다` };
  }
  if (!id || !ref) return { ok: false, method, planId: id, note: 'planId 와 url(또는 경로)이 모두 필요하다' };
  const entry = method === 'artifact' ? { method, url: ref } : { method, ref };
  markShown(root, id, entry);
  return { ok: true, method, planId: id, ...entry, note: `표시 기록을 남겼다 (${method}): ${ref}` };
}

/** Record an Artifact URL as the thing the user was shown (kept for v3.37 callers). */
function recordArtifact(projectRoot, planId, url) {
  const res = recordShown(projectRoot, planId, 'artifact', url);
  return res.ok ? res : { ...res, method: 'failed', url: url || null };
}

module.exports = {
  RECORD_REL,
  RECORDABLE_METHODS,
  SHOWN_METHODS,
  documentSha,
  markShown,
  planIdOf,
  readRecord,
  recordArtifact,
  recordPath,
  recordShown,
  resolveTarget,
  showState,
  wasShown,
};

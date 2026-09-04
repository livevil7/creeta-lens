'use strict';
/**
 * Lens - Report Viewer (v3.37.0)
 *
 * Puts a finished plan document in front of the user instead of naming its path.
 *
 * WHY THIS EXISTS
 * ---------------
 * Owner complaint (2026-09-04): "board 및 md파일 뭐 저장은 한대. 근데 저장했으니,
 * 승인해라 이렇게만 보고를 해 … 맨날 계획서 찾는다고 탐색기 찾고 뭐하고 아주
 * 지겨워 죽겠어." /cp Phase 2.6 already wrote {md, html, board} and Phase 5 asked for
 * approval — with nothing but paths between them. Approving a document you have
 * not seen is not approval, and the cost of finding it fell entirely on the user.
 *
 * The same lesson the coverage ledger taught applies: prose ("산출물 링크는 풀
 * 경로") does not put anything on screen. Opening it does.
 *
 * WHAT COUNTS AS SHOWN
 * --------------------
 * Only `browser` (the file was handed to the OS opener on this machine) and
 * `artifact` (published to a URL the user can open from any device) count. A
 * remote/headless session that could not open anything is recorded honestly as
 * `remote` and does NOT pass the gate — the skill must fall back to an Artifact
 * or say out loud that it failed. Silent failure is what this replaces.
 *
 * FAIL-SOFT
 * ---------
 * Every function returns a value rather than throwing. Failing to open a browser
 * must never take down a planning run — it must only fail the "did the user see
 * it" gate, which is a reportable state, not a crash.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { safeReadJson, safeWriteJson } = require('./hook-utils');

const SCHEMA = 1;
const RECORD_REL = path.join('.lens', 'report-shown.json');

/** Methods that actually put the document in front of a human. */
const SHOWN_METHODS = new Set(['browser', 'artifact']);

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
 * A session that cannot raise a window on the user's screen.
 *
 * SSH is the decisive signal: opening a browser on the far end of an ssh pipe
 * paints a window nobody is looking at (Mac Mini runbooks depend on this being
 * refused, not silently "succeeded"). On Linux, no DISPLAY means the same thing.
 */
function isRemoteSession(env = process.env, platform = process.platform) {
  if (/^(1|true|yes|on)$/i.test(String(env.LENS_FORCE_HEADLESS || ''))) return true;
  if (env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT) return true;
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return true;
  return false;
}

/** OS opener. `null` = this platform has no known way to open a file. */
function openerFor(platform = process.platform) {
  if (platform === 'win32') return { cmd: 'cmd.exe', pre: ['/c', 'start', ''] };
  if (platform === 'darwin') return { cmd: 'open', pre: [] };
  if (platform === 'linux') return { cmd: 'xdg-open', pre: [] };
  return null;
}

/**
 * Best on-disk view of one plan, absolute path, or null.
 *
 * HTML first because it is the rendered deck; the md is the SoT but a browser
 * shows it as raw text. Both beat nothing.
 */
function resolveTarget(projectRoot, planId) {
  const root = projectRoot || process.cwd();
  const candidates = [
    path.join(root, 'docs', 'tasks', `${planId}.html`),
    path.join(root, 'docs', 'history', `${planId}.html`),
    path.join(root, 'docs', 'tasks', `${planId}.md`),
    path.join(root, 'docs', 'history', `${planId}.md`),
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
  record.shown[planId] = { planId, shownAt: new Date().toISOString(), ...entry };
  writeRecord(projectRoot, record);
  return record.shown[planId];
}

/** The entry if the user was actually shown this plan, else null. */
function wasShown(projectRoot, planId) {
  const entry = readRecord(projectRoot).shown[planId];
  if (!entry || !SHOWN_METHODS.has(entry.method)) return null;
  return entry;
}

/**
 * Hand one file to the OS opener.
 *
 * spawnSync, not spawn: an async ENOENT would arrive after this process exits and
 * a missing `xdg-open` would be recorded as a success. The openers themselves
 * return immediately once the browser is launched.
 */
function openFile(file, { platform = process.platform, runner = spawnSync } = {}) {
  const opener = openerFor(platform);
  if (!opener) return { ok: false, error: `지원되지 않는 플랫폼: ${platform}` };
  let res;
  try {
    res = runner(opener.cmd, [...opener.pre, file], { stdio: 'ignore', timeout: 8000, windowsHide: true });
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
  if (res && res.error) {
    const code = res.error.code === 'ENOENT' ? `${opener.cmd} 없음` : res.error.code;
    return { ok: false, error: `${code}: ${res.error.message}` };
  }
  // A timeout means the opener was found and started but did not return — the
  // browser is up. Only a non-zero exit is a real failure.
  if (res && res.status !== 0 && res.signal !== 'SIGTERM') {
    return { ok: false, error: `${opener.cmd} exit=${res.status}` };
  }
  return { ok: true };
}

/**
 * Show one plan and record the outcome.
 *
 * Returns { ok, method, planId, file, note } — `ok` is "the user can see it now".
 */
function showReport(projectRoot, target, opts = {}) {
  const root = projectRoot || process.cwd();
  const planId = planIdOf(target);
  if (!planId) return { ok: false, method: 'missing', planId, file: null, note: '계획서 id 를 못 읽었다' };

  const file = resolveTarget(root, planId);
  if (!file) {
    return {
      ok: false, method: 'missing', planId, file: null,
      note: `docs/tasks/${planId}.{html,md} 가 없다 — Phase 2.5/2.6 이 먼저다`,
    };
  }
  const rel = path.relative(root, file).split(path.sep).join('/');

  if (isRemoteSession(opts.env || process.env, opts.platform || process.platform)) {
    markShown(root, planId, { method: 'remote', file: rel });
    return {
      ok: false, method: 'remote', planId, file: rel,
      note: '원격/헤드리스 세션 — 이 기계의 브라우저를 열어도 사용자는 못 본다. Artifact 로 발행하고 --artifact 로 되먹여라',
    };
  }

  const opened = openFile(file, opts);
  markShown(root, planId, {
    method: opened.ok ? 'browser' : 'failed',
    file: rel,
    ...(opened.ok ? {} : { error: opened.error }),
  });
  return {
    ok: opened.ok,
    method: opened.ok ? 'browser' : 'failed',
    planId,
    file: rel,
    note: opened.ok ? `기본 브라우저로 ${rel} 를 띄웠다` : `띄우기 실패: ${opened.error}`,
  };
}

/** Record an Artifact URL as the thing the user was shown. */
function recordArtifact(projectRoot, planId, url) {
  const root = projectRoot || process.cwd();
  const id = planIdOf(planId);
  if (!id || !url) return { ok: false, method: 'failed', planId: id, url: url || null, note: 'planId 와 url 이 모두 필요하다' };
  markShown(root, id, { method: 'artifact', url });
  return { ok: true, method: 'artifact', planId: id, url, note: `아티팩트 URL 을 표시 기록에 남겼다: ${url}` };
}

module.exports = {
  RECORD_REL,
  SHOWN_METHODS,
  isRemoteSession,
  markShown,
  openFile,
  openerFor,
  planIdOf,
  readRecord,
  recordArtifact,
  recordPath,
  resolveTarget,
  showReport,
  wasShown,
};

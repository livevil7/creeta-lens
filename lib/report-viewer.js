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
 *   browser  — this module renders the md to a readable page and opens it
 *              (`claude -p`, anything with no native surface)
 * The first three are performed by the engine and recorded here with
 * `recordShown`; the last is performed here by `showReport`.
 *
 * WHAT COUNTS AS SHOWN
 * --------------------
 * Only those four methods. A remote/headless session that could not open anything
 * is recorded honestly as `remote` and does NOT pass the gate. And a record stops
 * counting when the document changes after it was shown (`stale`) — a Modify that
 * is not re-shown means the user is approving the tab they opened before.
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
const { spawnSync } = require('child_process');

const { safeReadJson, safeWriteJson } = require('./hook-utils');

const SCHEMA = 1;
const RECORD_REL = path.join('.lens', 'report-shown.json');

/** Methods that actually put the document in front of a human. */
const SHOWN_METHODS = new Set(['browser', 'artifact', 'inline', 'sendfile']);
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
 * Does Windows know what to open this extension with?
 *
 * v3.37.1 — measured on the owner's machine: `.md` has no association here
 * (`assoc .md` → exit 1, no `FileExts\.md\UserChoice` key), and
 * `cmd /c start "" file.md` **returns 0 while nothing opens at all** — no window,
 * no download, no error. Handing that back as `browser` is exactly the silent
 * false success this module exists to prevent, so the extension is checked first
 * and an unassociated one fails loudly.
 */
function hasWindowsAssociation(ext, runner = spawnSync) {
  const opts = { encoding: 'utf8', timeout: 8000, windowsHide: true };
  try {
    const assoc = runner('cmd.exe', ['/c', 'assoc', ext], opts);
    if (assoc && !assoc.error && assoc.status === 0 && String(assoc.stdout || '').trim()) return true;
  } catch { /* fall through to the per-user key */ }
  try {
    const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${ext}\\UserChoice`;
    const reg = runner('reg.exe', ['query', key, '/v', 'ProgId'], opts);
    return !!(reg && !reg.error && reg.status === 0);
  } catch {
    return false;
  }
}

/** Minimal HTML escape for the raw-markdown fallback page. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A browser-openable, rendered view of a plan (v3.39: rendered, not `<pre>`).
 *
 * lib/md-render.js turns the markdown into headings, tables and lists. If the
 * renderer ever throws, the page falls back to the verbatim text — a document
 * shown badly beats a document not shown.
 */
function renderPreview(projectRoot, mdFile) {
  const root = projectRoot || process.cwd();
  const id = planIdOf(mdFile);
  const out = path.join(root, '.lens', 'preview', `${id}.html`);
  const rel = path.relative(root, mdFile).split(path.sep).join('/');
  const source = fs.readFileSync(mdFile, 'utf-8');
  let html;
  try {
    html = require('./md-render').renderPage(source, { id, source: rel });
  } catch {
    html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(id)}</title>
<style>body{margin:0;font:14px/1.7 ui-monospace,Consolas,monospace}pre{margin:0;padding:24px;white-space:pre-wrap;word-break:break-word;max-width:100ch}</style>
</head><body><pre>${escapeHtml(source)}</pre></body></html>`;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf-8');
  return out;
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
 * Hand one file to the OS opener.
 *
 * spawnSync, not spawn: an async ENOENT would arrive after this process exits and
 * a missing `xdg-open` would be recorded as a success. The openers themselves
 * return immediately once the browser is launched.
 */
function openFile(file, { platform = process.platform, runner = spawnSync } = {}) {
  const opener = openerFor(platform);
  if (!opener) return { ok: false, error: `지원되지 않는 플랫폼: ${platform}` };
  const ext = path.extname(file).toLowerCase();
  if (platform === 'win32' && !hasWindowsAssociation(ext, runner)) {
    return { ok: false, error: `${ext} 연결 프로그램이 없다 — start 는 0 을 내지만 아무것도 열리지 않는다` };
  }
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
 * Browser lane: render the plan and open it, then record the outcome.
 *
 * Returns { ok, method, planId, file, viewer, note } — `ok` is "the user can see it now".
 */
function showReport(projectRoot, target, opts = {}) {
  const root = projectRoot || process.cwd();
  const planId = planIdOf(target);
  if (!planId) return { ok: false, method: 'missing', planId, file: null, note: '계획서 id 를 못 읽었다' };

  const file = resolveTarget(root, planId);
  if (!file) {
    return {
      ok: false, method: 'missing', planId, file: null,
      note: `docs/tasks/${planId}.md 가 없다 — 계획서를 먼저 저장한다`,
    };
  }
  const rel = path.relative(root, file).split(path.sep).join('/');

  if (isRemoteSession(opts.env || process.env, opts.platform || process.platform)) {
    markShown(root, planId, { method: 'remote', file: rel });
    return {
      ok: false, method: 'remote', planId, file: rel,
      note: '원격/헤드리스 세션 — 이 기계의 브라우저를 열어도 사용자는 못 본다. Artifact 로 발행하고 --shown artifact <URL> 로 기록하라',
    };
  }

  // Handing the raw .md to the OS is not a way to show it — on Windows it can
  // open nothing at all while reporting success (v3.37.1) — so render it first.
  let viewer = file;
  if (path.extname(file).toLowerCase() === '.md') {
    try {
      viewer = renderPreview(root, file);
    } catch {
      viewer = file; // preview is a courtesy; let openFile report the real outcome
    }
  }
  const viewerRel = path.relative(root, viewer).split(path.sep).join('/');

  const opened = openFile(viewer, opts);
  markShown(root, planId, {
    method: opened.ok ? 'browser' : 'failed',
    file: rel,
    ...(viewer === file ? {} : { viewer: viewerRel }),
    ...(opened.ok ? {} : { error: opened.error }),
  });
  return {
    ok: opened.ok,
    method: opened.ok ? 'browser' : 'failed',
    planId,
    file: rel,
    viewer: viewerRel,
    note: opened.ok
      ? `기본 브라우저로 ${viewerRel} 를 띄웠다`
      : `띄우기 실패: ${opened.error}`,
  };
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
  hasWindowsAssociation,
  renderPreview,
  isRemoteSession,
  markShown,
  openFile,
  openerFor,
  planIdOf,
  readRecord,
  recordArtifact,
  recordPath,
  recordShown,
  resolveTarget,
  showReport,
  showState,
  wasShown,
};

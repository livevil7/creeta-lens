/**
 * Lens - plan-scan (v3.53)
 *
 * The plan document's own status line is the one record of where a plan is.
 * /cc used to write `done` at the very end and nothing else, so a run that died
 * half-way left `approved`/`executing` forever and nobody saw it (SJ-ROG: 7
 * approved · 2 executing, 1 done). This module writes that line at start/stop
 * and finds the plans that stalled.
 *
 *   setPlanStatus(docPath, status, {reason, waitingOn})  → {ok, from, to}
 *   scanPlans(root, {days, git, sessions, now})          → {firstLine, stalled, …}
 *   writeScanCache(root, result) / readScanCache(root)   → <root>/.lens/plan-scan.json
 *
 * Old documents are read, never rewritten: an unknown status is `unknown`, not
 * stalled (a false alarm teaches people to ignore the line).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ensureLensDir, safeReadJson, safeWriteJson } = require('./hook-utils');

const STATUSES = ['executing', 'done', 'blocked', 'parked', 'cancelled', 'approved', 'planned'];
const CACHE_FILE = 'plan-scan.json';
const DAY_MS = 86400000;

// Old vocabulary still on disk → the one set scan reasons about.
const NORMAL = {
  planned: 'planned', draft: 'planned',
  approved: 'approved',
  executing: 'executing', in_progress: 'executing', 'in-progress': 'executing',
  blocked: 'blocked', failed: 'blocked',
  done: 'done', completed: 'done',
  parked: 'parked',
  cancelled: 'cancelled',
};

const FM_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;
const unquote = v => String(v == null ? '' : v).trim().replace(/^["']|["']$/g, '');

function readFrontmatter(content) {
  const m = content.match(FM_RE);
  if (!m) return null;
  const fields = {};
  for (const line of m[2].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0 && !/^\s/.test(line)) fields[line.slice(0, i).trim()] = unquote(line.slice(i + 1));
  }
  return fields;
}

/** Rewrite only `status:` and its three companions; every other line stays verbatim. */
function setPlanStatus(docPath, status, { reason, waitingOn } = {}) {
  if (!STATUSES.includes(status)) return { ok: false, error: `알 수 없는 상태: ${status} — ${STATUSES.join('|')}` };
  let content;
  try { content = fs.readFileSync(docPath, 'utf-8'); } catch (err) { return { ok: false, error: `계획서를 읽을 수 없다: ${err.message}` }; }
  const m = content.match(FM_RE);
  if (!m) return { ok: false, error: 'frontmatter 없음' };
  const eol = m[1].endsWith('\r\n') ? '\r\n' : '\n';
  const lines = m[2].split(/\r?\n/);
  const at = lines.findIndex(l => /^status:/.test(l));
  const from = at >= 0 ? unquote(lines[at].slice(7)) : null;
  const oldWaiting = (lines.find(l => /^waiting_on:/.test(l)) || '').slice(11).trim();
  const add = [`status: ${status}`, `status_at: ${new Date().toISOString()}`];
  if (status === 'blocked' && reason) add.push(`blocked_reason: ${JSON.stringify(String(reason))}`);
  // Unspecified: a wait survives only a pause (blocked/parked); moving on ends it.
  if (waitingOn === undefined) { if (oldWaiting && (status === 'blocked' || status === 'parked')) add.push(`waiting_on: ${oldWaiting}`); }
  else if (waitingOn) add.push(`waiting_on: ${JSON.stringify(String(waitingOn))}`);
  const kept = [];
  for (const l of lines) {
    if (/^status:/.test(l)) kept.push(...add);
    else if (!/^(status_at|blocked_reason|waiting_on):/.test(l)) kept.push(l);
  }
  if (at < 0) kept.push(...add);
  const next = m[1] + kept.join(eol) + m[3] + content.slice(m[0].length);
  try { fs.writeFileSync(docPath, next, 'utf-8'); } catch (err) { return { ok: false, error: `쓰기 실패: ${err.message}` }; }
  return { ok: true, from, to: status };
}

// ── scan ─────────────────────────────────────────────────

function planFiles(root) {
  const dirs = [path.join(root, 'docs', 'tasks')];
  // A workspace root (several repos side by side) is scanned one level down.
  try {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.startsWith('.')) dirs.push(path.join(root, d.name, 'docs', 'tasks'));
    }
  } catch {}
  const files = [];
  for (const dir of dirs) {
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) if (n.endsWith('.md') && !n.endsWith('.research.md')) files.push(path.join(dir, n));
  }
  return files;
}

/** The `## 진행상황` bullet `- **<label>**: value`, or ''. */
function progressField(content, label) {
  const sec = content.split(/\r?\n## 진행상황/)[1];
  if (!sec) return '';
  const m = sec.match(new RegExp(`^- \\*\\*${label}\\*\\*:\\s*(.+)$`, 'm'));
  return m ? m[1].replace(/\*\*/g, '').trim() : '';
}

function gitOk(cwd, args) {
  try {
    execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore', timeout: 5000, windowsHide: true });
    return true;
  } catch { return false; }
}

function gitOut(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true }).trim();
  } catch { return ''; }
}

/**
 * true only when the branch still exists, got commits since its start SHA, and
 * those are inside base. A fresh branch with no commits is an ancestor of base
 * too — that is "just started", not "merged".
 */
function branchMerged(repoDir, branch, base, startSha) {
  if (!branch || !base) return false;
  const tip = gitOut(repoDir, ['rev-parse', '--verify', '--quiet', branch]) || gitOut(repoDir, ['rev-parse', '--verify', '--quiet', `origin/${branch}`]);
  const into = [`origin/${base}`, base].find(r => gitOut(repoDir, ['rev-parse', '--verify', '--quiet', r]));
  if (!tip || !into || (startSha && tip.startsWith(startSha))) return false;
  return gitOk(repoDir, ['merge-base', '--is-ancestor', tip, into]);
}

/** `a,b` or `a:idle,b:busy` (CLI) or [{name|id, status}] → Map(key → status). */
function sessionMap(sessions) {
  const list = typeof sessions === 'string' ? sessions.split(',') : sessions;
  const map = new Map();
  for (const s of list || []) {
    if (typeof s === 'string') {
      const [k, st] = s.trim().split(':');
      if (k) map.set(k, (st || 'busy').trim());
    } else if (s) {
      for (const k of [s.name, s.id]) if (k) map.set(String(k), String(s.status || 'busy'));
    }
  }
  return map;
}

function loadOpenLedgers(root) {
  try {
    const { loadLedgers, summarize } = require('./gate-ledger');
    return loadLedgers(root).ledgers.filter(l => !l.closedAt).map(l => ({
      doc: l.planDoc ? path.resolve(root, l.planDoc) : null, sessionId: l.sessionId || null, unmet: summarize(l).unmet,
    }));
  } catch { return []; }
}

const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

function scanPlans(root, { days = 3, git = false, sessions = null, now = Date.now() } = {}) {
  root = path.resolve(root);
  const result = { root, scannedAt: new Date(now).toISOString(), firstLine: '', stalled: [], waiting: [], parked: [], approved: [], done: [], unknown: [], planned: [], cancelled: [] };
  const live = sessions != null ? sessionMap(sessions) : null; // '' = no live session at all, still a check
  const ledgerCache = new Map();
  const ledgersFor = (repoDir) => {
    if (!ledgerCache.has(repoDir)) ledgerCache.set(repoDir, loadOpenLedgers(repoDir));
    return ledgerCache.get(repoDir);
  };

  for (const file of planFiles(root)) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const fm = readFrontmatter(content);
    if (!fm) continue;
    const repoDir = path.resolve(path.dirname(file), '..', '..');
    const status = NORMAL[(fm.status || '').toLowerCase()] || 'unknown';
    const item = {
      id: fm.plan_id || path.basename(file, '.md'),
      title: ((content.match(/^# (.+)$/m) || [])[1] || '').trim(),
      path: path.relative(root, file).split(path.sep).join('/'),
      status,
      where: '',
      why: '',
    };

    if (status === 'blocked' || status === 'approved' || status === 'executing') {
      const boxes = content.match(/^\s*- \[[ xX]\]/gm) || [];
      const ticked = boxes.filter(b => /\[[xX]\]/.test(b)).length;
      const ledger = ledgersFor(repoDir).find(l => l.doc === path.resolve(file));
      const resume = progressField(content, '재개 포인트');
      const parts = [];
      if (boxes.length) parts.push(`체크 ${ticked}/${boxes.length}`);
      if (resume) parts.push(`재개 포인트 ${short(resume)}`);
      if (ledger && ledger.unmet) parts.push(`원장 미충족 ${ledger.unmet}`);
      item.where = parts.join(' · ') || '검사 기록 없음';

      let why = '';
      // A named wait is a legitimate pause even when blocked (`blocked --waiting-on`).
      if (fm.waiting_on) { item.why = `대기 중(${fm.waiting_on})`; result.waiting.push(item); continue; }
      if (status === 'blocked') why = fm.blocked_reason || '멈춤(blocked)';
      else {
        const owners = [progressField(content, '세션'), ledger && ledger.sessionId].filter(Boolean);
        if (live && status === 'executing') {
          const st = owners.map(o => live.get(o)).find(Boolean);
          if (!st) why = '맡은 세션 없음';
          else if (st === 'idle') why = '맡은 세션 idle';
        }
        if (!why && git && branchMerged(repoDir, fm.branch, fm.base, (progressField(content, '작업 브랜치').match(/시작 SHA `([0-9a-f]{7,40})`/) || [])[1])) why = '닫을 때 — 가지 병합됨';
        if (!why) {
          const stamps = [fs.statSync(file).mtimeMs, Date.parse(fm.status_at), Date.parse((progressField(content, '마지막 업데이트').match(/\d{4}-\d{2}-\d{2}/) || [])[0])].filter(Number.isFinite);
          const idleDays = Math.floor((now - Math.max(...stamps)) / DAY_MS);
          if (idleDays >= days) why = `${idleDays}일 갱신 없음`;
        }
      }
      item.why = why;
      (why ? result.stalled : result.approved).push(item);
      continue;
    }
    result[status].push(item);
  }

  const n = result.stalled.length;
  result.firstLine = n
    ? `멈춘 계획 ${n}건 — ${result.stalled.map(s => `${s.id}(${s.why} · ${s.where})`).join(' / ')}`
    : '멈춘 계획 0건';
  return result;
}

function writeScanCache(root, result) {
  if (!ensureLensDir(path.resolve(root))) return false;
  return safeWriteJson(path.join(path.resolve(root), '.lens', CACHE_FILE), result);
}

function readScanCache(root) {
  const r = safeReadJson(path.join(path.resolve(root), '.lens', CACHE_FILE), null);
  return r && typeof r === 'object' && Array.isArray(r.stalled) ? r : null;
}

module.exports = { STATUSES, setPlanStatus, scanPlans, writeScanCache, readScanCache };

#!/usr/bin/env node
/**
 * Lens - Board Builder (schema v3)
 * Scans docs/{tasks,history,rules}/ for .md + .html, pairs them by basename,
 * and builds docs/board_<repo>.html — a single board indexing all three folders.
 *
 * md = SoT. The board inlines md text (rendered via textContent in the template, so
 * it works offline over file://, which cannot read folders or call out). A doc with
 * both md + html is shown via its html (slide deck); an md-only doc shows the raw md
 * plus a "convert to html" button (which copies `/cp html <path>` for Claude to run).
 *
 * Stale: if a doc's html records <meta name="lens:source-hash"> and the current md
 * hash differs, the card is flagged `stale` (html is out of date vs its md).
 *
 * In Review: a task doc whose frontmatter `branch` matches the headRefName of an
 * open PR is a 4th column — the real (code-world) state, not just the folder it
 * sits in. PR data comes from `gh pr list` (read-only), pinned with `--repo` to
 * the GitHub repo this project's `origin` URL resolves to, is cached in
 * .lens/pr-cache.json under that same repo id, and every failure path degrades to
 * the plain 3 columns with the reason printed on the board (never a silent "no PRs").
 *
 * Non-destructive: writes board_<repo>.html only. Legacy docs/board.html and
 * docs/reports/ are never modified or deleted.
 *
 * Usage:  node lib/board-builder.js [projectRoot]
 * Cross-platform: Windows (Git Bash) + macOS + Linux.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FOLDERS = ['tasks', 'history', 'rules'];
const MD_INLINE_CAP = 40 * 1024; // 40KB — larger md is truncated with an "open original" hint

// `gh pr list` here measures 0.6s warm / 1.1s cold, so 4s is ~4x headroom while
// keeping the worst-case board build interactive. The cache means the network is
// touched at most once per TTL; PR state moves at human speed (minutes), and a
// single /cp session rebuilds the board several times (plan → html → done).
const GH_TIMEOUT_MS = 4000;
const PR_CACHE_TTL_MS = 10 * 60 * 1000;
// `gh pr list` defaults to 30 and silently drops the rest — scripts/prune_branches.py
// already works around this the same way. 200 covers this repo's actual PR volume
// (2 open as of writing) with wide headroom; if a fetch ever returns exactly this
// many, that's a signal there may be more, and the board says so instead of
// quietly showing a short list as if it were complete.
const GH_PR_LIMIT = 200;

// The board is handed a projectRoot and nothing else — there is no `--remote` flag
// to carry a choice, so the remote has to be a convention, and `origin` is the one
// this codebase has already committed to: lib/git-branch.js resolves base, merge
// state and preflight entirely against `origin/*`, and scripts/prune_branches.py
// proxies its own PR lookup through origin when no remote is named. The In Review
// column joins task frontmatter `branch` to PR heads produced by that same tooling,
// so scoping the query to any other remote would answer a different question than
// the branches it is displaying.
const PR_REMOTE = 'origin';

function resolveRepo(projectRoot) {
  // Prefer the git remote name, fall back to the project directory name.
  try {
    const cfg = fs.readFileSync(path.join(projectRoot, '.git', 'config'), 'utf-8');
    const m = cfg.match(/url\s*=\s*(.+)/);
    if (m) {
      const seg = m[1].trim().replace(/\.git$/, '').split(/[\/:]/).filter(Boolean).pop();
      if (seg) return seg;
    }
  } catch { /* no git config — fall through */ }
  return path.basename(projectRoot);
}

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function mdHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

// Minimal read of one frontmatter scalar. Deliberately not plan-manager's parser:
// the board must keep working on docs written before frontmatter existed, and it
// must not fail a whole build on an unparseable YAML block.
function frontmatterValue(md, key) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!m) return null;
  const v = m[1].trim().replace(/^["']|["']$/g, '').trim();
  return v && v !== 'null' && v !== '~' ? v : null;
}

function titleFromMd(md, fallback) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function titleFromHtml(html, fallback) {
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (t) return t[1].replace(/\s*[·|]\s*(보고서|report)\s*$/i, '').trim();
  const h1 = html.match(/class="h-title"[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);
  return fallback;
}

function buildDoc(folder, base, dir) {
  const mdFile = path.join(dir, base + '.md');
  const htmlFile = path.join(dir, base + '.html');
  const hasMd = fs.existsSync(mdFile);
  const hasHtml = fs.existsSync(htmlFile);

  const dateM = base.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateM ? dateM[1] : '';

  let mdInline = '';
  let truncated = false;
  let title = base;
  let curHash = null;
  let branch = null;

  if (hasMd) {
    const raw = fs.readFileSync(mdFile);
    curHash = mdHash(raw);
    let md = raw.toString('utf-8');
    title = titleFromMd(md, base);
    branch = frontmatterValue(md, 'branch');
    if (md.length > MD_INLINE_CAP) {
      md = md.slice(0, MD_INLINE_CAP);
      truncated = true;
    }
    mdInline = md;
  }

  let stale = false;
  if (hasHtml) {
    const html = fs.readFileSync(htmlFile, 'utf-8');
    if (!hasMd) title = titleFromHtml(html, base);
    if (hasMd && curHash) {
      const recorded = extractMeta(html, 'lens:source-hash');
      if (recorded) stale = recorded !== curHash;
    }
  }

  return {
    id: base,
    folder,
    title,
    date,
    hasMd,
    hasHtml,
    mdPath: hasMd ? `${folder}/${base}.md` : null,
    htmlPath: hasHtml ? `${folder}/${base}.html` : null,
    mdInline,
    truncated,
    stale,
    branch,
  };
}

function scanFolder(folder, projectRoot) {
  const dir = path.join(projectRoot, 'docs', folder);
  if (!fs.existsSync(dir)) return [];
  const bases = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_') || f.startsWith('.')) continue;
    if (f.endsWith('.md')) bases.add(f.slice(0, -3));
    else if (f.endsWith('.html') && !f.endsWith('.example.html')) bases.add(f.slice(0, -5));
  }
  return [...bases]
    .map(b => buildDoc(folder, b, dir))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
}

// ── open PRs (read-only, cached, always degradable) ─────────────────────────

function ghFailReason(err) {
  if (err.code === 'ENOENT') return 'gh not found';
  if (err.killed || err.signal || err.code === 'ETIMEDOUT') return `gh timed out (${GH_TIMEOUT_MS / 1000}s)`;
  const line = ((err.stderr || '').toString().trim().split(/\r?\n/)[0]
    || (err.message || '').split(/\r?\n/)[0] || 'unknown error').slice(0, 120);
  return /auth|login|token/i.test(line) ? `gh not authenticated (${line})` : `gh failed: ${line}`;
}

// The GitHub OWNER/REPO that `remote`'s URL points at, or why it could not be told.
// gh has no "use this git remote" flag — `gh pr list --help` (2.96.0) offers only
// the inherited `-R/--repo [HOST/]OWNER/REPO` — so the identifier is read out of the
// remote URL. Left unpinned, gh picks its own base repo (`gh repo set-default`,
// multi-remote resolution) and can return *another* repo's open PRs as a success:
// head names that happen to collide would drag unrelated task cards into In Review,
// and no failure guard on the gh call would ever see it. Mirror of
// scripts/prune_branches.py _remote_github_repo() — the two must not diverge.
function githubRepoId(projectRoot, remote) {
  let url;
  try {
    url = execFileSync('git', ['remote', 'get-url', remote],
      { cwd: projectRoot, timeout: GH_TIMEOUT_MS, encoding: 'utf-8', windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return { id: null, reason: `no '${remote}' remote (git remote get-url ${remote} failed)` };
  }
  if (!url) return { id: null, reason: `remote '${remote}' has an empty URL` };
  // Scheme form (https://, ssh://, git://, optional user@ and port), else scp form
  // (git@host:path). The scp branch's (?!\/\/) keeps an unknown scheme's "://" from
  // being read as a host; anything still unparsed fails closed below.
  const m = url.match(/^(?:git\+)?(?:https?|ssh|git):\/\/(?:[^/@]+@)?([^/:]+)(?::\d+)?\/(.*)$/)
    || url.match(/^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.*)$/);
  if (!m) return { id: null, reason: `remote '${remote}' URL has no readable host (${url})` };
  const host = m[1].toLowerCase();
  // Non-GitHub hosts (private git servers, local path remotes) are unresolvable too:
  // gh is the only PR lookup this tool knows, so there is no repo to ask about.
  if (host !== 'github.com' && host !== 'ssh.github.com') {
    return { id: null, reason: `remote '${remote}' is not a github.com repo (${url})` };
  }
  const parts = m[2].replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts.length === 2 && parts[1].endsWith('.git')) parts[1] = parts[1].slice(0, -'.git'.length);
  if (parts.length !== 2 || !parts.every(Boolean)) {
    return { id: null, reason: `remote '${remote}' URL has no OWNER/REPO (${url})` };
  }
  return { id: parts.join('/'), reason: null };
}

// Returns { ok, repo, prs, fetchedAt, offline, reason }. ok:false means "we don't
// know", which the board must say out loud — it is not the same as "no open PRs".
function loadOpenPRs(projectRoot) {
  // Resolve the target repo first: it is both the query's scope and the cache key.
  // Unresolvable means we cannot name whose PRs we would be showing, so the cache is
  // not read either — this path must not be able to serve a stale foreign answer.
  const target = githubRepoId(projectRoot, PR_REMOTE);
  if (!target.id) return { ok: false, prs: [], reason: target.reason, unresolved: true };

  const cachePath = path.join(projectRoot, '.lens', 'pr-cache.json');
  let cache = null;
  try {
    const c = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    // `repo` is part of the key, not decoration: an entry written for a different
    // repo — or by a build from before the query was pinned, which carries no repo
    // field at all — is a miss, so a wrong answer cannot outlive its own TTL.
    if (c && Array.isArray(c.prs) && c.fetchedAt && c.repo === target.id) cache = c;
  } catch { /* no/broken cache — refetch */ }

  if (cache && Date.now() - Date.parse(cache.fetchedAt) < PR_CACHE_TTL_MS) {
    return { ok: true, repo: target.id, prs: cache.prs, fetchedAt: cache.fetchedAt, offline: false, truncated: !!cache.truncated };
  }

  try {
    const out = execFileSync('gh',
      ['pr', 'list', '--repo', target.id, '--json', 'number,title,headRefName,url', '--state', 'open', '--limit', String(GH_PR_LIMIT)],
      { cwd: projectRoot, timeout: GH_TIMEOUT_MS, encoding: 'utf-8', windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'] });
    const prs = JSON.parse(out);
    if (!Array.isArray(prs)) throw new Error('unexpected gh output');
    const truncated = prs.length === GH_PR_LIMIT;
    const fetchedAt = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({ repo: target.id, fetchedAt, prs, truncated }, null, 2), 'utf-8');
    } catch { /* cache is an optimization, never a build blocker */ }
    return { ok: true, repo: target.id, prs, fetchedAt, offline: false, truncated };
  } catch (err) {
    const reason = ghFailReason(err);
    // Expired cache + dead network: render what we last knew, dated.
    if (cache) return { ok: true, repo: target.id, prs: cache.prs, fetchedAt: cache.fetchedAt, offline: true, reason, truncated: !!cache.truncated };
    return { ok: false, prs: [], reason };
  }
}

// Moves task docs whose frontmatter `branch` is the head of an open PR into a
// `review` group. Docs without `branch` (every doc predating this feature) stay
// exactly where they were.
function splitReview(groups, prs) {
  const byBranch = new Map();
  for (const pr of prs) if (pr && pr.headRefName) byBranch.set(pr.headRefName, pr);
  const review = [];
  groups.tasks = (groups.tasks || []).filter(d => {
    const pr = d.branch ? byBranch.get(d.branch) : null;
    if (!pr) return true;
    review.push({ ...d, pr: { number: pr.number, url: pr.url } });
    return false;
  });
  groups.review = review;
  return review.length;
}

// ── board template augmentation ─────────────────────────────────────────────
// The In Review column is added here, not in board.template.html: the template
// is shared by every repo and must still render 3 columns when `gh` is missing.
// Every patch is anchored on an exact template literal and applied all-or-nothing
// — a template that drifted gets the plain 3-column board, never half a column.

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reviewPatches(eol) {
  const css = [
    '<style>',
    '/* ════ In Review column ════ */',
    '.board { grid-template-columns: repeat(4, minmax(0, 1fr)); }',
    '.column[data-column="review"] .pip { background: var(--stale); }',
    '.column[data-column="review"] .col-head { background: var(--stale-soft); }',
    '.column[data-column="review"] .col-head .label { color: var(--stale); }',
    '.badge.pr { background: var(--accent-soft); color: var(--accent); text-decoration: none; }',
    '.badge.pr:hover { text-decoration: underline; }',
    '@media (max-width: 980px) { .board { grid-template-columns: 1fr; } }',
    '</style>',
    '',
  ].join(eol);
  const section = [
    '  <section class="column" data-column="review">',
    '    <div class="col-head">',
    '      <div class="label"><span class="pip"></span>In Review</div>',
    '      <div class="count" data-count="review">0</div>',
    '    </div>',
    '    <div class="cards" data-col="review"></div>',
    '  </section>',
    '',
  ].join(eol);
  const historyCol = '  <section class="column" data-column="history">';
  const labels = 'const GROUP_LABELS = { tasks: "Tasks", history: "History", rules: "Rules" };';
  const order = 'const GROUP_ORDER = ["tasks", "history", "rules"];';
  const staleBadge = '    if (doc.stale) meta.appendChild(el("span", { class: "badge stale", text: "stale" }));';
  const prBadge = '    if (doc.pr) meta.appendChild(el("a", { class: "badge pr", href: doc.pr.url, '
    + 'target: "_blank", rel: "noopener", text: "PR #" + doc.pr.number, '
    + 'onclick: (e) => e.stopPropagation() }));';
  return [
    ['</head>', css + '</head>'],
    [historyCol, section + historyCol],
    [labels, 'const GROUP_LABELS = { tasks: "Tasks", review: "In Review", history: "History", rules: "Rules" };'],
    [order, 'const GROUP_ORDER = ["tasks", "review", "history", "rules"];'],
    [staleBadge, staleBadge + eol + prBadge],
  ];
}

function applyPatches(html, patches) {
  for (const [anchor] of patches) if (!html.includes(anchor)) return null;
  let out = html;
  for (const [anchor, replacement] of patches) out = out.replace(anchor, () => replacement);
  return out;
}

// A one-line status in the top bar. Silent failure is the bug being avoided here:
// "PR 00 open" and "we could not ask" must never look the same.
function prNotePatch(text, eol) {
  const anchor = '  <div class="stats" id="stats"></div>';
  return [[anchor, `  <div class="stats" id="pr-note">${escapeHtml(text)}</div>${eol}${anchor}`]];
}

function prNoteText(pr, reviewOn) {
  const at = pr.fetchedAt ? pr.fetchedAt.replace('T', ' ').slice(0, 16) + 'Z' : '?';
  const truncNote = pr.truncated ? ` · limit ${GH_PR_LIMIT} reached — more may exist` : '';
  // "we don't know which repo to ask about" is a different failure from "we asked
  // and got no answer", and the fix differs too (set an origin vs. install/auth gh),
  // so the two never share a wording.
  if (!pr.ok) {
    return pr.unresolved
      ? `PR repo unresolved — ${pr.reason} · 3 columns`
      : `PR lookup unavailable — ${pr.reason} · 3 columns`;
  }
  // The repo is named on the board: which repo was asked is the thing that used to
  // be silently wrong, so it is stated rather than assumed.
  if (!reviewOn) return `PR ${pr.prs.length} open · ${pr.repo} · board template lacks In Review anchors · 3 columns${truncNote}`;
  if (pr.offline) return `PR ${pr.prs.length} open · ${pr.repo} · cached ${at} · ${pr.reason}${truncNote}`;
  return `PR ${pr.prs.length} open · ${pr.repo} · checked ${at}${truncNote}`;
}

function main() {
  const projectRoot = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const docsDir = path.join(projectRoot, 'docs');
  if (!fs.existsSync(docsDir)) {
    console.error(`[lens] no ${path.relative(projectRoot, docsDir)} — nothing to build`);
    process.exit(1);
  }

  const repo = resolveRepo(projectRoot);
  const groups = {};
  for (const folder of FOLDERS) groups[folder] = scanFolder(folder, projectRoot);

  const lensRoot = path.resolve(__dirname, '..');

  // Deploy _shared.css to docs/ once (slide-deck html in docs/<folder>/ references ../_shared.css).
  const sharedDest = path.join(docsDir, '_shared.css');
  if (!fs.existsSync(sharedDest)) {
    const sharedSrc = path.join(lensRoot, 'templates', 'report-shared.css');
    if (fs.existsSync(sharedSrc)) {
      fs.copyFileSync(sharedSrc, sharedDest);
      console.log('[lens] deployed docs/_shared.css');
    }
  }

  const tplPath = path.join(lensRoot, 'templates', 'board.template.html');
  let tpl = fs.readFileSync(tplPath, 'utf-8');
  const eol = tpl.includes('\r\n') ? '\r\n' : '\n';

  // Patch the template first, split the docs second: if an anchor ever goes
  // missing, docs must stay in the columns the template can actually render.
  const pr = loadOpenPRs(projectRoot);
  let reviewCount = null;
  if (pr.ok) {
    const patched = applyPatches(tpl, reviewPatches(eol));
    if (patched) {
      tpl = patched;
      reviewCount = splitReview(groups, pr.prs);
    }
  }
  const note = prNoteText(pr, reviewCount !== null);
  tpl = applyPatches(tpl, prNotePatch(note, eol)) || tpl;

  const payload = JSON.stringify({
    schemaVersion: 3,
    repo,
    generatedAt: new Date().toISOString(),
    groups,
  }).replace(/<\//g, '<\\/'); // never let inlined md break out of <script>

  // Function replacement: payload is inserted literally (avoids $&, $`, $', $$ being
  // interpreted as replacement patterns when md content contains them).
  const out = tpl.replace('{{BOARD_DATA}}', () => payload);
  const boardPath = path.join(docsDir, `board_${repo}.html`);
  fs.writeFileSync(boardPath, out, 'utf-8');

  const rendered = reviewCount === null ? FOLDERS : ['tasks', 'review', 'history', 'rules'];
  const counts = rendered.map(f => `${f}=${groups[f].length}`).join(' ');
  const staleCount = rendered.reduce((n, f) => n + groups[f].filter(d => d.stale).length, 0);
  const total = rendered.reduce((n, f) => n + groups[f].length, 0);
  console.log(`[lens] board_${repo}.html: ${total} docs (${counts}` +
    (staleCount ? `, ${staleCount} stale` : '') + ')');
  console.log(`[lens] ${note}`);
}

if (require.main === module) main();

module.exports = { buildDoc, scanFolder, resolveRepo };

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
 * Non-destructive: writes board_<repo>.html only. Legacy docs/board.html and
 * docs/reports/ are never modified or deleted.
 *
 * Usage:  node lib/board-builder.js [projectRoot]
 * Cross-platform: Windows (Git Bash) + macOS + Linux.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FOLDERS = ['tasks', 'history', 'rules'];
const MD_INLINE_CAP = 40 * 1024; // 40KB — larger md is truncated with an "open original" hint

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

  if (hasMd) {
    const raw = fs.readFileSync(mdFile);
    curHash = mdHash(raw);
    let md = raw.toString('utf-8');
    title = titleFromMd(md, base);
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
  const tpl = fs.readFileSync(tplPath, 'utf-8');

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

  const counts = FOLDERS.map(f => `${f}=${groups[f].length}`).join(' ');
  const staleCount = FOLDERS.reduce((n, f) => n + groups[f].filter(d => d.stale).length, 0);
  const total = FOLDERS.reduce((n, f) => n + groups[f].length, 0);
  console.log(`[lens] board_${repo}.html: ${total} docs (${counts}` +
    (staleCount ? `, ${staleCount} stale` : '') + ')');
}

if (require.main === module) main();

module.exports = { buildDoc, scanFolder, resolveRepo };

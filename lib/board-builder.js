#!/usr/bin/env node
/**
 * Lens - Board Builder
 * Scans docs/reports/*.html, extracts card metadata, and builds docs/board.html
 * (a Trello-style index with slide-over iframe panel).
 *
 * md = SoT, HTML = derived view. Each report HTML may carry:
 *   <meta name="lens:source"      content="docs/tasks/{id}.md">
 *   <meta name="lens:source-hash" content="{sha256[:12]}">
 * If the source md's current hash differs, the card is flagged `stale`.
 *
 * Usage:  node lib/board-builder.js [projectRoot]
 * Cross-platform: Windows (Git Bash) + macOS.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function buildCard(reportsDir, file, projectRoot) {
  const html = fs.readFileSync(path.join(reportsDir, file), 'utf-8');
  const id = file.replace(/\.html$/, '');
  const dateM = id.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateM ? dateM[1] : '';

  // Title: <title> minus " · 보고서" suffix, fallback to h1.h-title
  let title = id;
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleM) {
    title = titleM[1].replace(/\s*[·|]\s*(보고서|report)\s*$/i, '').trim();
  } else {
    const h1 = html.match(/class="h-title"[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = stripTags(h1[1]);
  }

  const source = extractMeta(html, 'lens:source');
  const srcHash = extractMeta(html, 'lens:source-hash');

  // Category: prefer source path, fallback to cover badge text
  let category = 'task';
  if (source && /history/i.test(source)) category = 'history';
  else if (/class="badge"[^>]*>\s*Done/i.test(html)) category = 'history';

  // Summary: cover .lede text
  let summary = '';
  const ledeM = html.match(/class="lede"[^>]*>([\s\S]*?)<\/p>/i);
  if (ledeM) summary = stripTags(ledeM[1]).slice(0, 200);

  const column = category === 'history' ? 'done' : 'todo';

  // Stale detection: compare current source md hash vs recorded
  let stale = false;
  if (source && srcHash) {
    const srcPath = path.join(projectRoot, source);
    if (fs.existsSync(srcPath)) {
      const cur = crypto.createHash('sha256')
        .update(fs.readFileSync(srcPath)).digest('hex').slice(0, 12);
      stale = cur !== srcHash;
    }
  }

  return {
    id, title, date, category, column,
    hasReport: true,
    stale,
    summary,
    metrics: {
      totalChecks: 0, doneChecks: 0,
      progress: category === 'history' ? 100 : 0,
      fileCount: 0, decisionCount: 0, riskCount: 0,
    },
  };
}

function main() {
  const projectRoot = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const reportsDir = path.join(projectRoot, 'docs', 'reports');
  if (!fs.existsSync(reportsDir)) {
    console.error(`[lens] no ${path.relative(projectRoot, reportsDir)} — nothing to build`);
    process.exit(1);
  }

  const files = fs.readdirSync(reportsDir).filter(f =>
    f.endsWith('.html') &&
    !f.startsWith('_') &&
    !f.endsWith('.example.html') &&
    f !== 'board.html'
  );

  const cards = files
    .map(f => buildCard(reportsDir, f, projectRoot))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const lensRoot = path.resolve(__dirname, '..');

  // Deploy _shared.css once (preserve user customization if it already exists).
  const sharedDest = path.join(reportsDir, '_shared.css');
  if (!fs.existsSync(sharedDest)) {
    const sharedSrc = path.join(lensRoot, 'templates', 'report-shared.css');
    if (fs.existsSync(sharedSrc)) {
      fs.copyFileSync(sharedSrc, sharedDest);
      console.log('[lens] deployed docs/reports/_shared.css');
    }
  }

  const tplPath = path.join(lensRoot, 'templates', 'board.template.html');
  const tpl = fs.readFileSync(tplPath, 'utf-8');

  // Serialize one card per line for git-diff friendliness.
  const head = `{"schemaVersion":2,"generatedAt":${JSON.stringify(new Date().toISOString())},"cards":[`;
  const lines = cards.map(c => JSON.stringify(c)).join(',\n');
  const payload = (head + '\n' + lines + '\n]}').replace(/<\//g, '<\\/');

  const out = tpl.replace('{{BOARD_DATA}}', payload);
  const boardPath = path.join(projectRoot, 'docs', 'board.html');
  fs.writeFileSync(boardPath, out, 'utf-8');

  const staleCount = cards.filter(c => c.stale).length;
  const byCol = cards.reduce((a, c) => { a[c.column] = (a[c.column] || 0) + 1; return a; }, {});
  console.log(`[lens] board.html: ${cards.length} cards ` +
    `(todo=${byCol.todo || 0} doing=${byCol.doing || 0} done=${byCol.done || 0}` +
    (staleCount ? `, ${staleCount} stale` : '') + ')');
}

if (require.main === module) main();

module.exports = { buildCard };

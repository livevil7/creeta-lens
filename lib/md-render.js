'use strict';
/**
 * Lens - minimal markdown → HTML renderer (v3.39). No dependencies.
 *
 * Why. The browser lane (`claude -p`, any session without a native
 * artifact surface) used to open the plan as `<pre>` of the raw markdown — the
 * owner's "보기 어려운 md" (2026-09-14). A plan is tables, nested lists and
 * headings; a person approving it needs to see those as tables, lists and
 * headings.
 *
 * Scope, deliberately small: frontmatter (folded into badges), headings with
 * anchors, paragraphs, nested and task lists, tables (pipes inside code spans
 * stay in their cell), fenced code, blockquotes, rules, inline code / bold /
 * italic / strike / links. Every character is escaped before any markup is
 * added; a link with a script-capable scheme is left as text. Anything this does
 * not understand falls through as a paragraph — never dropped.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = s => String(s).replace(/[&<>"]/g, c => ESC[c]);

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function formatText(text) {
  let s = esc(text);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, href) =>
    (/^\s*(?:javascript|data|vbscript):/i.test(href.replace(/&amp;/g, '&')) ? all : `<a href="${href}">${label}</a>`));
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  s = s.replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
  return s;
}

function inline(text) {
  let out = '';
  let last = 0;
  const re = /(`+)([\s\S]*?[^`])\1(?!`)/g;
  let m;
  while ((m = re.exec(text))) {
    out += formatText(text.slice(last, m.index));
    out += `<code>${esc(m[2].trim())}</code>`;
    last = re.lastIndex;
  }
  return out + formatText(text.slice(last));
}

/** Table cells; a `|` inside a code span or escaped as `\|` stays in its cell. */
function splitCells(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  let tick = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (ch === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      if (tick === 0) tick = n; else if (tick === n) tick = 0;
      cur += s.slice(i, i + n);
      i += n - 1;
      continue;
    }
    if (ch === '|' && tick === 0) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells.map(c => c.replace(/\\\|/g, '|'));
}

const isSeparator = line => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/**
 * @param {string} md
 * @returns {{html: string, frontmatter: string|null, title: string|null}}
 */
function render(md) {
  let src = String(md).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  let frontmatter = null;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    frontmatter = fm[1];
    src = src.slice(fm[0].length);
  }

  const lines = src.split('\n');
  const out = [];
  const lists = [];
  let para = [];
  let title = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeLists = () => {
    while (lists.length) out.push(`</${lists.pop().tag}>`);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      flushPara();
      closeLists();
      const closer = new RegExp(`^\\s*${fence[1][0] === '`' ? '`' : '~'}{${fence[1].length},}\\s*$`);
      const body = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      closeLists();
      i++;
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flushPara();
      closeLists();
      const level = heading[1].length;
      if (level === 1 && title === null) title = heading[2];
      out.push(`<h${level} id="${esc(slug(heading[2]))}">${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara();
      closeLists();
      out.push('<hr>');
      i++;
      continue;
    }

    if (/^\s*\|/.test(line) && isSeparator(lines[i + 1] || '')) {
      flushPara();
      closeLists();
      const head = splitCells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitCells(lines[i++]));
      const width = Math.max(head.length, ...rows.map(r => r.length));
      const cells = (row, tag) => Array.from({ length: width }, (_, k) => `<${tag}>${inline(row[k] || '')}</${tag}>`).join('');
      out.push(`<div class="table"><table><thead><tr>${cells(head, 'th')}</tr></thead><tbody>`
        + rows.map(r => `<tr>${cells(r, 'td')}</tr>`).join('')
        + '</tbody></table></div>');
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushPara();
      closeLists();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${body.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      const indent = item[1].replace(/\t/g, '    ').length;
      const tag = /\d/.test(item[2]) ? 'ol' : 'ul';
      while (lists.length && indent < lists[lists.length - 1].indent) out.push(`</${lists.pop().tag}>`);
      const top = lists[lists.length - 1];
      if (!top || indent > top.indent) {
        out.push(`<${tag}>`);
        lists.push({ indent, tag });
      } else if (top.tag !== tag) {
        out.push(`</${lists.pop().tag}>`, `<${tag}>`);
        lists.push({ indent, tag });
      }
      let text = item[3];
      let box = '';
      const checkbox = text.match(/^\[([ xX])\]\s*(.*)$/);
      if (checkbox) {
        box = checkbox[1].trim() ? '<span class="box done" aria-label="완료">✓</span>' : '<span class="box" aria-label="미완료"></span>';
        text = checkbox[2];
      }
      out.push(`<li>${box}${inline(text)}</li>`);
      i++;
      continue;
    }

    // A wrapped continuation of the list item above it.
    if (lists.length && /^\s{2,}\S/.test(line) && /<\/li>$/.test(out[out.length - 1] || '')) {
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
      i++;
      continue;
    }

    closeLists();
    para.push(line.trim());
    i++;
  }
  flushPara();
  closeLists();
  return { html: out.join('\n'), frontmatter, title };
}

const BADGE_KEYS = ['status', 'kind', 'grade', 'branch', 'base', 'planner_model', 'created'];

function frontmatterBlock(frontmatter) {
  if (!frontmatter) return '';
  const fields = {};
  for (const l of frontmatter.split('\n')) {
    const m = l.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (m) fields[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  const badges = BADGE_KEYS
    .filter(k => fields[k] && fields[k] !== 'null')
    .map(k => `<span class="badge"><b>${esc(k)}</b> ${esc(fields[k])}</span>`)
    .join('');
  return `<div class="badges">${badges}</div>`
    + `<details class="fm"><summary>문서 정보</summary><pre>${esc(frontmatter)}</pre></details>`;
}

const STYLE = `
:root { color-scheme: light dark; --bg:#f7f8f6; --fg:#1d221e; --dim:#5d665f; --line:#d9ded7; --soft:#eef1ec; --accent:#0f6b66; }
@media (prefers-color-scheme: dark) { :root { --bg:#151917; --fg:#e5e9e3; --dim:#98a39a; --line:#2d3530; --soft:#1f2522; --accent:#5bb9b2; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.7 "Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif; padding: 32px clamp(16px,5vw,48px) 80px; }
main { max-width: 900px; margin: 0 auto; }
h1,h2,h3,h4 { line-height:1.3; text-wrap:balance; margin: 1.6em 0 .5em; }
h1 { font-size: 28px; margin-top: .4em; } h2 { font-size: 21px; border-top:1px solid var(--line); padding-top: 1em; } h3 { font-size: 17px; }
p, li { max-width: 72ch; }
a { color: var(--accent); }
code { font: .9em "Cascadia Code","D2Coding",Consolas,monospace; background:var(--soft); padding: 1px 5px; border-radius: 3px; }
pre { background:var(--soft); padding: 14px 16px; border-radius: 6px; overflow-x:auto; }
pre code { background:none; padding:0; }
blockquote { margin: 1em 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--accent); color: var(--dim); }
.table { overflow-x:auto; margin: 1em 0; }
table { border-collapse: collapse; font-size: 14px; min-width: 60%; }
th, td { border-bottom: 1px solid var(--line); padding: 7px 10px; text-align:left; vertical-align: top; }
th { font-size: 12.5px; color: var(--dim); }
ul, ol { padding-left: 22px; }
.box { display:inline-block; width:13px; height:13px; border:1.5px solid var(--dim); border-radius:3px; margin-right:6px; vertical-align:-1px; font-size:10px; line-height:10px; text-align:center; }
.box.done { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.src { color: var(--dim); font-size: 12.5px; margin: 0 0 8px; }
.badges { display:flex; flex-wrap:wrap; gap:6px; margin: 0 0 6px; }
.badge { font-size:12px; background:var(--soft); border:1px solid var(--line); border-radius: 999px; padding: 1px 9px; }
.badge b { color: var(--dim); font-weight:500; }
details.fm summary { color: var(--dim); font-size: 12.5px; cursor: pointer; }
hr { border:0; border-top:1px solid var(--line); margin: 2em 0; }
`;

/** A standalone page for one markdown document. */
function renderPage(md, { id = '', source = '' } = {}) {
  const r = render(md);
  const title = r.title ? r.title.replace(/[`*_]/g, '') : id;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style></head><body><main>
${source ? `<p class="src">원문: ${esc(source)}</p>` : ''}
${frontmatterBlock(r.frontmatter)}
${r.html}
</main></body></html>`;
}

module.exports = { esc, inline, render, renderPage, slug, splitCells };

/**
 * Lens - PreToolUse Hook (matcher: AskUserQuestion)
 * Refuses a question dialog that arrives with nothing written to the user first.
 *
 * Why (owner, 2026-09-14): "지금도 승인 받기 전에 그냥 질문만 하면 되? 계획서를 보고도
 * 하지 않고 그냥 질문부터 띄우는거야?" — twice in one turn the approval dialog
 * opened straight after tool calls, with no report in front of it. In the VS Code
 * focus view the dialog then IS the message: a set of options with no account of
 * what was found, what each option does, or where the plan is.
 *
 * The rule already existed as prose (memory `feedback_report_before_asking_approval`,
 * /cp Phase 5.1). Prose is what the owner watched fail; a refused tool call with a
 * reason is not skippable.
 *
 * Rule: since the last tool result or user message, the assistant must have
 * written text of at least MIN_CHARS non-space characters. Otherwise deny, and
 * say what to write. Fail-open on any read problem — a broken transcript must
 * never trap a session.
 *
 * Kill switch: LENS_ASK_GUARD=0
 *
 * Input (stdin): { tool_name, tool_input, transcript_path, ... }
 * Output: {} | { hookSpecificOutput: { hookEventName, permissionDecision: 'deny', permissionDecisionReason } }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('pre-tool-ask');

const MIN_CHARS = 40;
const TAIL_BYTES = 768 * 1024;

/** The last TAIL_BYTES of the transcript as parsed JSONL entries (oldest first). */
function readTail(file) {
  const stat = fs.statSync(file);
  const size = Math.min(stat.size, TAIL_BYTES);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, stat.size - size);
    const lines = buf.toString('utf-8').split('\n');
    if (stat.size > size) lines.shift(); // first line is probably cut
    return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}

/** Visible text the assistant wrote since the last tool result or user message. */
function recentAssistantText(entries) {
  let text = '';
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.type === 'user') break; // a tool_result or a prompt — the report window ends here
    if (e.type !== 'assistant') continue;
    const content = e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') text = block.text + text;
    }
  }
  return text;
}

function main() {
  const input = readJsonInput();
  if ((input && input.tool_name) !== 'AskUserQuestion') return writeJson({});
  if (/^(0|false|off|no)$/i.test(String(process.env.LENS_ASK_GUARD || ''))) return writeJson({});

  let written = null;
  try {
    const file = input.transcript_path;
    if (!file || !fs.existsSync(file)) return writeJson({});
    written = recentAssistantText(readTail(file));
  } catch {
    return writeJson({}); // fail-open
  }

  if (written.replace(/\s+/g, '').length >= MIN_CHARS) return writeJson({});

  writeJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        '[Lens] 질문창보다 보고가 먼저다 — 이 질문 앞에 사용자에게 보인 글이 없다. '
        + '먼저 한 메시지로 쓴다: 무엇을 발견·결정했나 · 계획서 링크(있으면) · 선택지마다 무엇이 일어나나 · 추천과 이유. '
        + '사용자가 던진 질문이 있으면 그 답도 여기서. 그 다음에 AskUserQuestion 을 다시 부른다.',
    },
  });
}

main();

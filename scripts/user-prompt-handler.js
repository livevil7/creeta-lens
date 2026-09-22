/**
 * Lens - UserPromptSubmit Hook
 *
 * Single job (v3.48): a user message is a contact — stamp `lastContactAt` in the
 * session's progress clock (lib/session-store.js), so the 2-minute reminder in
 * hooks/post-tool-progress.js counts from what the user actually last saw (C2).
 *
 * The v3.29 slash-command OVERRIDE is gone. It read `input.userMessage` while the
 * event sends `prompt`, so it never fired (0 OVERRIDE lines in the transcripts);
 * fixed, its "Do NOT call AskUserQuestion" would have blocked the question dialog
 * again. Claude Code already runs slash commands itself.
 *
 * Output: always {} — nothing is shown to the user or injected.
 */

const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const {
  installFailSoftHandlers,
  readJsonInput,
  resolveProjectRoot,
  safeReadJson,
  safeWriteJson,
  writeJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));

installFailSoftHandlers('user-prompt-handler');

function main() {
  try {
    const input = readJsonInput() || {};
    store.bind(input);
    // A subagent's prompt is not the user talking.
    if (!store.isSubagentCall(input) && typeof input.prompt === 'string') stampContact(input);
  } catch { /* fail-open */ }
  writeJson({});
  process.exit(0);
}

function stampContact(input) {
  const nowIso = new Date().toISOString();
  const stamp = state => ({ ...(state && typeof state === 'object' ? state : {}), lastContactAt: nowIso });
  if (store.filePath('progress')) {
    store.update('progress', stamp, null);
    return;
  }
  // No session id: the legacy repo-level clock, only if one is already running.
  const root = resolveProjectRoot({ cwd: typeof input.cwd === 'string' ? input.cwd : undefined });
  const legacy = path.join(root, '.lens', 'progress-report-state.json');
  const state = safeReadJson(legacy, null);
  if (state) safeWriteJson(legacy, stamp(state));
}

main();

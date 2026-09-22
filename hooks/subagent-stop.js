/**
 * Lens - SubagentStop Hook (no matcher)
 *
 * Resolves a background launch on this session's dashboard: `launched` → `done`
 * when its subagent finishes. Until 3.47 nothing observed that end, so launches
 * stayed `launched` for good — 13 of them from three sessions in one board, and a
 * 560-char notice repeated 81 times (C4).
 *
 * Key: the input's `agent_id`, which is the async envelope's `agentId` (measured
 * 2026-09-22 — see completeAgentByHarnessId in lib/agent-tracker.js). A Workflow's
 * inner agents (transcripts under `subagents/workflows/`) never resolve the
 * Workflow entry.
 *
 * Input (stdin): { session_id, agent_id, agent_type, agent_transcript_path, … }
 * Output (stdout): {} always — never blocks a subagent from stopping.
 */

const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('subagent-stop');

const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));
const { completeAgentByHarnessId } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    const input = readJsonInput() || {};
    store.bind(input);
    const agentId = typeof input.agent_id === 'string' ? input.agent_id.trim() : '';
    // Without a session there is no board of this session to resolve on.
    if (agentId && store.filePath('dashboard')) {
      completeAgentByHarnessId(agentId, 'done', {
        agentType: typeof input.agent_type === 'string' ? input.agent_type : null,
        fromWorkflow: /[\\/]workflows[\\/]/.test(String(input.agent_transcript_path || '')),
      });
    }
  } catch { /* fail-open */ }
  writeJson({});
  process.exit(0);
}

main();

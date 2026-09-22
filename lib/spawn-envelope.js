/**
 * Lens - Spawn Envelope (v3.48.0)
 *
 * One classifier for "did this spawn tool call start background work?", shared
 * by hooks/post-tool-task.js (dashboard) and hooks/post-tool-progress.js (report
 * clock). Until 3.47 each hook carried its own copy and they drifted: the
 * progress hook knew the Workflow envelope, the task hook did not, so every
 * background Workflow was written to the dashboard as "done (102ms). All 1
 * agents complete" (24 of 24 launches, 2026-09-18/21). And the progress hook put
 * Workflow in its Agent branch first, so its own Workflow branch was unreachable.
 *
 * Envelopes (measured, see the 3.47 comments this replaces):
 *   Agent    — prose "Async agent launched …" + `agentId:`/`output_file:`, or the
 *              structured `{status:'async_launched', agentId, outputFile}`.
 *   Workflow — prose "Workflow launched in background. Task ID: … Run ID: wf_…",
 *              or the structured `{status:'async_launched', taskId, runId}`.
 * Both require a marker AND an identifier: prose that merely quotes the phrase
 * has no identifier and must not arm anything.
 */

'use strict';

const AGENT_MARKER_RE = /Async agent launched|working in the background|"status"\s*:\s*"async_launched"/i;
const AGENT_ID_RE = /\bagentId:\s*\S|\boutput_file:\s*\S|"(?:agentId|outputFile|output_file)"\s*:\s*"\S/i;
const WORKFLOW_MARKER_RE = /Workflow launched in background|"status"\s*:\s*"async_launched"/i;
const WORKFLOW_ID_RE = /\b(?:Task|Run) ID:\s*\S|"(?:taskId|runId)"\s*:\s*"\S/i;

const SPAWN_TOOLS = new Set(['Task', 'Agent', 'Workflow']);

/**
 * Flatten a tool response into searchable text. A content-block array is joined
 * on its `.text` rather than JSON-encoded: encoding turns newlines into `\n`,
 * which puts a word character before `agentId:` and breaks the `\b` above.
 */
function responseText(input) {
  const raw = input && (input.tool_response ?? input.tool_output ?? input.tool_result ?? input.response);
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const flat = raw.map(b => (typeof b === 'string' ? b : (b && b.text) || '')).join('\n');
    if (flat.trim()) return flat;
  }
  try { return JSON.stringify(raw); } catch { return ''; }
}

function isAgentLaunchEnvelope(text) {
  return !!text && AGENT_MARKER_RE.test(text) && AGENT_ID_RE.test(text);
}

function isWorkflowLaunchEnvelope(text) {
  return !!text && WORKFLOW_MARKER_RE.test(text) && WORKFLOW_ID_RE.test(text);
}

function pick(text, ...patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/** A Workflow's display name: the explicit `name`, else the script's meta.name. */
function workflowName(toolInput) {
  if (!toolInput) return null;
  if (typeof toolInput.name === 'string' && toolInput.name.trim()) return toolInput.name.trim();
  const script = typeof toolInput.script === 'string' ? toolInput.script : '';
  const m = script.match(/meta\s*=\s*\{[\s\S]*?\bname\s*:\s*['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

/**
 * Classify one spawn tool call from its PostToolUse input.
 *
 * @returns {{kind: 'agent-async'|'workflow-async'|'foreground'|'unknown'|'none',
 *            agentId: string|null, runId: string|null, taskId: string|null, name: string|null}}
 *   'none'    — not a spawn tool
 *   'unknown' — a Workflow call whose result shows neither a launch nor a finished run
 *               (a denied or failed launch). Callers must not record it as done.
 */
function classify(input) {
  const toolName = input && input.tool_name;
  const toolInput = (input && input.tool_input) || {};
  const text = responseText(input);
  const base = { kind: 'none', agentId: null, runId: null, taskId: null, name: null };
  if (!SPAWN_TOOLS.has(toolName)) return base;

  if (toolName === 'Workflow') {
    const name = workflowName(toolInput);
    if (isWorkflowLaunchEnvelope(text)) {
      return {
        ...base,
        kind: 'workflow-async',
        runId: pick(text, /\bRun ID:\s*(wf_[\w-]+)/i, /"runId"\s*:\s*"([^"]+)"/i),
        taskId: pick(text, /\bTask ID:\s*([\w-]+)/i, /"taskId"\s*:\s*"([^"]+)"/i),
        name,
      };
    }
    return { ...base, kind: toolInput.run_in_background === false ? 'foreground' : 'unknown', name };
  }

  const name = (typeof toolInput.description === 'string' && toolInput.description.trim()) || null;
  const agentId = pick(text, /\bagentId:\s*([\w-]+)/i, /"agentId"\s*:\s*"([^"]+)"/i);
  if (toolInput.run_in_background === true) return { ...base, kind: 'agent-async', agentId, name };
  // Declared foreground wins over any text: a finished agent's report can quote
  // the launch sentence while discussing background work.
  if (toolInput.run_in_background === false) return { ...base, kind: 'foreground', name };
  if (isAgentLaunchEnvelope(text)) return { ...base, kind: 'agent-async', agentId, name };
  return { ...base, kind: 'foreground', name };
}

module.exports = {
  SPAWN_TOOLS,
  classify,
  isAgentLaunchEnvelope,
  isWorkflowLaunchEnvelope,
  responseText,
  workflowName,
};

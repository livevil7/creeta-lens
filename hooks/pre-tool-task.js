/**
 * Lens - PreToolUse Hook (matcher: Task)
 * Tracks when a sub-agent (Task tool) starts execution.
 *
 * Triggered: Before each Task tool invocation
 * Writes: .lens/agent-dashboard.json
 *
 * Input (stdin): { tool_name, tool_input: { description, ... } }
 * Output (stdout): { decision, hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('pre-tool-task');

// Load agent tracker
const { registerAgent } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    // Read tool input from stdin
    const input = readJsonInput();
    const toolInput = input?.tool_input || {};
    const description = toolInput.description || toolInput.prompt || toolInput.task ||
      toolInput.message || toolInput.task_name || '';

    // Register the agent in dashboard.
    // v3.25: record the spawn model so TOP-tier usage is auditable. An omitted
    // model means the agent inherited the session model, which the hook cannot
    // observe — skills must therefore always specify one explicitly.
    const agent = registerAgent(description, {
      model: toolInput.model || null,
      agentType: toolInput.subagent_type || toolInput.task_name || null,
    });

    // Output: allow the tool to proceed + report tracking info
    const response = {
      // Do not block tool execution
      decision: undefined,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        matcher: 'Task',
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
        model: agent.model,
        agentType: agent.agentType,
        trackedAt: agent.startedAt,
      },
    };

    writeJson(response);
    process.exit(0);
  } catch (err) {
    // Never block tool execution on tracker errors
    writeJson({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        matcher: 'Task',
        error: err.message,
      },
    });
    process.exit(0);
  }
}

main();

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

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');

// Load agent tracker
const { registerAgent } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

function main() {
  try {
    // Read tool input from stdin
    const input = readStdin();
    const toolInput = input?.tool_input || {};
    const description = toolInput.description || toolInput.prompt || toolInput.task || '';

    // Register the agent in dashboard
    const agent = registerAgent(description);

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
        trackedAt: agent.startedAt,
      },
    };

    console.log(JSON.stringify(response));
    process.exit(0);
  } catch (err) {
    // Never block tool execution on tracker errors
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        matcher: 'Task',
        error: err.message,
      },
    }));
    process.exit(0);
  }
}

/**
 * Read JSON input from stdin (cross-platform).
 */
function readStdin() {
  try {
    const data = fs.readFileSync(0, 'utf-8');
    if (data) return JSON.parse(data);
  } catch {
    // stdin not available or not JSON
  }

  // Fallback: check argv
  if (process.argv[2]) {
    try {
      return JSON.parse(process.argv[2]);
    } catch {}
  }

  return {};
}

main();

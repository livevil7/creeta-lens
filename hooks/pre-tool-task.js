/**
 * Lens - PreToolUse Hook (matcher: Task|Agent|Workflow)
 * Tracks when a sub-agent starts execution.
 *
 * The spawn tool is named `Agent` in this harness; `Task` is its legacy alias and
 * still matches (the envelope comes back stamped `PostToolUse:Agent`). `Workflow`
 * is matched too: it launches async and returns immediately, so without an entry
 * an in-flight workflow is invisible to the launched-guard — the dashboard read
 * "0 agents" through a run that had 22 of them (실측). One entry per workflow is
 * the honest record; its internal agent() calls never surface as tool calls here.
 *
 * Triggered: Before each spawn tool invocation
 * Writes: .lens/agent-dashboard.json
 *
 * Input (stdin): { tool_name, tool_input: { description, ... } }
 * Output (stdout): { decision, hookSpecificOutput }
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const { installFailSoftHandlers, readJsonInput, writeJson } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));
installFailSoftHandlers('pre-tool-task');

// Load agent tracker
const { registerAgent, loadDashboard } = require(path.join(PLUGIN_ROOT, 'lib', 'agent-tracker'));

// Top tier of the Agent tool's model enum. /cc caps it at 3 per run, but the cap
// lived only in SKILL.md prose and the audit measured what that was worth: the
// ladder collapsed toward the EXPENSIVE end (opus 55.6% of 162 spawns, haiku
// 0.6%), and the two runs that broke the cap did so by 4-6x. The tracker already
// recorded every model; nobody ever read the record back. This is that read.
const TOP_TIER = 'fable';
const TOP_CAP = 3;

/** Count TOP-tier spawns already on the board, including trimmed-away ones. */
function topTierUsed() {
  try {
    const d = loadDashboard();
    return (d.agents || []).filter(a => a.model === TOP_TIER).length + (d.topTierTotal || 0);
  } catch {
    return 0; // fail-soft: a broken board must not block a spawn
  }
}

/** Advisory only — never blocks. A refusal here would strand a legitimate run. */
function modelNotice(model) {
  if (!model) {
    return `[Lens] 이 spawn 에 model 이 지정되지 않았다 — 세션 모델이 그대로 상속되고 계측에서 사라진다. `
      + `난이도로 배정하라: 정형 반복=sonnet / 사고과정=opus / 비가역·보안·아키텍처=${TOP_TIER}.`;
  }
  if (model !== TOP_TIER) return null;
  // registerAgent() has already put this spawn on the board, so the count
  // includes it — adding one here would report the 3rd spawn as the 4th.
  const used = topTierUsed();
  if (used <= TOP_CAP) return null;
  return `[Lens] TOP 티어(${TOP_TIER}) ${used}번째 spawn — 1회 실행 상한 ${TOP_CAP} 초과. `
    + `실측상 사다리는 싼 쪽이 아니라 비싼 쪽으로 무너진다(opus 55.6% · haiku 0.6%). `
    + `이 서브태스크가 정말 비가역·보안·아키텍처 핵심인지 다시 보고, 아니면 opus 로 내려라. `
    + `계속 필요하면 사유와 함께 사용자에게 확인하라.`;
}

function main() {
  try {
    // Read tool input from stdin
    const input = readJsonInput();
    const toolInput = input?.tool_input || {};
    // `name` is Workflow's label for a predefined run; without it a workflow
    // entry lands nameless and the dashboard row reads as noise.
    const description = toolInput.description || toolInput.prompt || toolInput.task || toolInput.name || '';

    // Register the agent in dashboard.
    // v3.25: record the spawn model so TOP-tier usage is auditable. An omitted
    // model means the agent inherited the session model, which the hook cannot
    // observe — skills must therefore always specify one explicitly.
    const agent = registerAgent(description, {
      model: toolInput.model || null,
      agentType: toolInput.subagent_type || null,
    });

    // Output: allow the tool to proceed + report tracking info
    const notice = modelNotice(toolInput.model);
    const response = {
      // Do not block tool execution
      decision: undefined,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        matcher: 'Task|Agent|Workflow',
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
        model: agent.model,
        agentType: agent.agentType,
        trackedAt: agent.startedAt,
        ...(notice ? { additionalContext: notice } : {}),
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

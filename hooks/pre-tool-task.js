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
 * Writes: the session dashboard (lib/agent-tracker.js), with the call's
 *         tool_use_id so PostToolUse / PostToolUseFailure find this entry (v3.48).
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
const store = require(path.join(PLUGIN_ROOT, 'lib', 'session-store'));
const { workflowName } = require(path.join(PLUGIN_ROOT, 'lib', 'spawn-envelope'));

// Top tier of the Agent tool's model enum. /cc caps it per run, but the cap
// lived only in SKILL.md prose and the audit measured what that was worth: the
// ladder collapsed toward the EXPENSIVE end (opus 55.6% of 162 spawns, haiku
// 0.6%), and the two runs that broke the cap did so by 4-6x. The tracker already
// recorded every model; nobody ever read the record back. This is that read.
//
// v3.38: 3 → 2, in step with docs/rules/harness-rules.md §4.1. The number must
// move here and there together — a cap loosened only in prose is the failure
// this hook exists to catch, and a cap tightened only in prose is the same bug
// wearing the other hat. hooks/pre-tool-task.test.js pins the two to each other.
const TOP_TIER = 'fable';
const TOP_CAP = 2;

/** Count TOP-tier spawns already on this session's board, including trimmed-away ones. */
function topTierUsed() {
  try {
    const d = loadDashboard();
    return (d.agents || []).filter(a => a.model === TOP_TIER).length + (d.topTierTotal || 0);
  } catch {
    return 0; // fail-soft: a broken board must not block a spawn
  }
}

/**
 * A spawn with no model is refused (v3.42).
 *
 * The warning shipped in v3.25 and was measured in the owner's own session on
 * 2026-09-15: the hook said "model 이 지정되지 않았다" twice in one turn and the
 * model spawned twice anyway ("두 번 다 무시했습니다"). An advisory that loses
 * twice in the same turn is not a rule, and the cost is exactly what v3.25 set
 * out to stop — the session model (usually the top tier) spreads to every spawn
 * and the tracker records `null`.
 *
 * The fix is one argument, so refusing costs the run nothing.
 */
function modelDenial(model) {
  if (model) return null;
  return `[Lens] 이 spawn 에 model 이 없다 — 붙이고 다시 불러라. 세션 모델이 그대로 상속되면 계측에서 사라지고 (${TOP_TIER} 세션이면 전 워커가 ${TOP_TIER} 가 된다). `
    + `난이도로 배정한다: 정형 반복=haiku · 조회·수집=sonnet · 사고과정=opus · 비가역·보안·아키텍처·계획서=${TOP_TIER}. `
    + `끄려면 LENS_MODEL_GATE=0.`;
}

// ── Workflow scripts (v3.48, E4) ─────────────────────────
//
// A Workflow's agent() calls never pass through this hook, so the model gate
// above never saw them: 313 workflow agents in one session all ran on the
// session model (claude-opus-5), 136 for a single question. The script is in
// the tool input, so it is read statically. Only when it is there — a saved
// workflow called by `name`/`scriptPath` carries no script and is not refused.

const WORKFLOW_AGENT_CAP = 60;

/** Blank out string, template and comment bodies, keeping every index and newline. */
function maskCode(src) {
  const out = src.split('');
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { closed = true; break; }
        if (c !== '`' && src[j] === '\n') break;
        j += 1;
      }
      if (!closed) return null; // unreadable (e.g. a quote inside a regex literal) → no verdict
      blank(i + 1, j);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** Index just past the bracket that closes the one at `open`, or -1. */
function closeOf(masked, open) {
  let depth = 0;
  for (let k = open; k < masked.length; k += 1) {
    const c = masked[k];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return k + 1;
    }
  }
  return -1;
}

/** Spans whose body runs repeatedly: for/while bodies, .map/.forEach/.flatMap callbacks, pipeline() stages. */
function loopSpans(masked) {
  const spans = [];
  for (const m of masked.matchAll(/(^|[^\w$.])(?:for|while)\s*\(/g)) {
    const head = masked.indexOf('(', m.index + m[1].length);
    const headEnd = closeOf(masked, head);
    if (headEnd < 0) continue;
    const body = masked.slice(headEnd).search(/\S/);
    const at = body < 0 ? -1 : headEnd + body;
    if (at < 0) continue;
    const end = masked[at] === '{' ? closeOf(masked, at) : masked.indexOf(';', at);
    spans.push([headEnd, end < 0 ? masked.length : end]);
  }
  for (const m of masked.matchAll(/\.(?:map|forEach|flatMap)\s*\(|(?:^|[^\w$.])pipeline\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const end = closeOf(masked, open);
    spans.push([open, end < 0 ? masked.length : end]);
  }
  return spans;
}

/** Split call arguments at top-level commas. */
function topLevelArgs(args) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let k = 0; k < args.length; k += 1) {
    const c = args[k];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) { parts.push(args.slice(from, k)); from = k + 1; }
  }
  parts.push(args.slice(from));
  return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * Static read of a Workflow script's agent() calls.
 * @returns {{missing: number[], unsure: number[], total: number, looped: number}|null}
 *   missing — lines whose call certainly has no model (options absent, or an object
 *             literal without `model`) → refuse. unsure — options passed by variable
 *             or spread → warn only. null → the script could not be read → no verdict.
 */
function scanWorkflowScript(script) {
  const masked = maskCode(String(script));
  if (masked === null) return null;
  const lineOf = idx => script.slice(0, idx).split('\n').length;
  const loops = loopSpans(masked);
  const result = { missing: [], unsure: [], total: 0, looped: 0 };
  for (const m of masked.matchAll(/(^|[^\w$.])agent\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const end = closeOf(masked, open);
    result.total += 1;
    if (loops.some(([a, b]) => open > a && open < b)) result.looped += 1;
    if (end < 0) { result.unsure.push(lineOf(open)); continue; }
    const args = masked.slice(open + 1, end - 1);
    if (/\bmodel\b/.test(args)) continue;
    const parts = topLevelArgs(args);
    const opts = parts.length >= 2 ? parts[parts.length - 1] : (parts[0] && parts[0].startsWith('{') ? parts[0] : null);
    if (/\.\.\./.test(args) || (opts !== null && !opts.startsWith('{'))) result.unsure.push(lineOf(open));
    else result.missing.push(lineOf(open));
  }
  return result;
}

function workflowDenial(scan) {
  if (!scan || scan.missing.length === 0) return null;
  return `[Lens] Workflow 스크립트의 agent() 호출에 model 이 없다 — ${scan.missing.map(n => `${n}행`).join(', ')}. `
    + `각 호출의 옵션에 model 을 붙여 다시 불러라(없으면 세션 모델이 전원에게 상속된다 — 실측 313개 전부 opus). `
    + `난이도로 배정한다: 정형 반복=haiku · 조회·수집=sonnet · 사고과정=opus. 끄려면 LENS_MODEL_GATE=0.`;
}

function workflowNotice(scan) {
  if (!scan) return null;
  const notes = [];
  if (scan.total > WORKFLOW_AGENT_CAP) notes.push(`agent() ${scan.total}개 — 상한 ${WORKFLOW_AGENT_CAP} 초과`);
  else if (scan.looped > 0) notes.push(`반복문 안 agent() ${scan.looped}곳 — 총 수를 셀 수 없다`);
  if (scan.unsure.length) notes.push(`model 을 확인할 수 없는 호출 ${scan.unsure.map(n => `${n}행`).join(', ')}`);
  if (!notes.length) return null;
  return `[Lens] Workflow 확인: ${notes.join(' · ')}. 총 agent 수가 ${WORKFLOW_AGENT_CAP} 을 넘지 않는지(후보×렌즈 팬아웃이 세션 한도를 태운다), 모든 호출에 model 이 있는지 확인하라.`;
}

/** Advisory only — a refusal on the cap would strand a run the user approved. */
function modelNotice(model) {
  if (!model || model !== TOP_TIER) return null;
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
    store.bind(input);
    const toolInput = input?.tool_input || {};
    const isWorkflow = input?.tool_name === 'Workflow';
    // A Workflow is named by `name` or its script's meta.name (D2: it used to land
    // as "unnamed-task" and the dashboard row read as noise).
    const description = toolInput.description || toolInput.prompt || toolInput.task
      || (isWorkflow ? workflowName(toolInput) : toolInput.name) || '';

    // Refuse before registering: a spawn that never runs must not sit on the board.
    // Workflow has no per-call model — its script sets one per agent(), so the
    // script is what gets checked (E4).
    const gateOff = /^(0|false|off|no)$/i.test(String(process.env.LENS_MODEL_GATE || ''));
    const scan = isWorkflow && !gateOff && typeof toolInput.script === 'string' ? scanWorkflowScript(toolInput.script) : null;
    const denial = gateOff ? null : (isWorkflow ? workflowDenial(scan) : modelDenial(toolInput.model));
    if (denial) {
      writeJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denial,
        },
      });
      process.exit(0);
    }

    // Register the agent in dashboard.
    // v3.25: record the spawn model so TOP-tier usage is auditable. An omitted
    // model means the agent inherited the session model, which the hook cannot
    // observe — skills must therefore always specify one explicitly.
    const agent = registerAgent(description, {
      model: toolInput.model || null,
      agentType: toolInput.subagent_type || null,
      toolUseId: input?.tool_use_id || null,
      tool: input?.tool_name || null,
    });

    // Output: allow the tool to proceed + report tracking info
    const notice = isWorkflow ? workflowNotice(scan) : modelNotice(toolInput.model);
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

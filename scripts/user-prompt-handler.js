/**
 * Lens - UserPromptSubmit Hook
 *
 * Single job (v3.29): when the user explicitly types a slash command, force the
 * Skill tool to fire immediately instead of the model paraphrasing the request
 * or asking for confirmation first.
 *
 * Everything else this hook used to do was removed in v3.29 as duplicated
 * native capability:
 *   - keyword-based skill suggestion  → native Skills auto-discovery routes semantically
 *   - external plugin-registry search → KNOWN_PLUGINS had been empty since v3.13
 * Both were also unreachable in practice: `autoRecommend: false` (default since
 * v3.13) returned early on line 1, which silently disabled the slash-command
 * override below along with them. That bug is fixed by removing the branch.
 */

const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const {
  installFailSoftHandlers,
  readJsonInput,
  writeJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));

installFailSoftHandlers('user-prompt-handler');

function main() {
  try {
    const input = getInput();
    const message = input && input.userMessage;

    if (!message || !isExplicitSlashCommand(message)) {
      writeJson({ systemMessage: '' });
      process.exit(0);
    }

    const parts = message.split(/\s+/);
    const skillName = parts[0].substring(1);
    const args = parts.slice(1).join(' ');
    const clippedArgs = args.substring(0, 200);
    const displayedArgs = JSON.stringify(args.substring(0, 100));
    const toolArgs = JSON.stringify(clippedArgs);

    writeJson({
      systemMessage: `OVERRIDE - HIGHEST PRIORITY: The user explicitly invoked the /${skillName} skill command${args ? ` with args: ${displayedArgs}` : ''}. You MUST execute this skill immediately using the Skill tool with skill="${skillName}"${args ? ` and args=${toolArgs}` : ''}. Do NOT call AskUserQuestion. Do NOT ask for confirmation. Do NOT show any other prompt. Just invoke the Skill tool NOW.`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        matchType: 'explicit-command',
        skill: skillName,
      },
    });
    process.exit(0);
  } catch {
    writeJson({ systemMessage: '' });
    process.exit(0);
  }
}

function getInput() {
  if (process.env.CLAUDE_USER_MESSAGE) {
    return { userMessage: process.env.CLAUDE_USER_MESSAGE };
  }
  return readJsonInput();
}

function isExplicitSlashCommand(message) {
  const command = String(message || '').trimStart().split(/\s+/)[0] || '';
  if (!command.startsWith('/')) return false;
  const skillName = command.slice(1);
  return /^[A-Za-z][A-Za-z0-9_-]*(?::[A-Za-z][A-Za-z0-9_-]*)?$/.test(skillName);
}

main();

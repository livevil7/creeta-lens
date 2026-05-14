/**
 * Lens - UserPromptSubmit Hook
 * Analyzes user input and suggests matching skills.
 */

const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const {
  installFailSoftHandlers,
  readJsonInput,
  safeReadJson,
  writeJson,
} = require(path.join(PLUGIN_ROOT, 'lib', 'hook-utils'));

installFailSoftHandlers('user-prompt-handler');

const config = safeReadJson(path.join(PLUGIN_ROOT, 'lens.config.json'), {}) || {};

if (config.autoRecommend === false) {
  writeJson({ systemMessage: '' });
  process.exit(0);
}

const { matchKeywords } = require(path.join(PLUGIN_ROOT, 'lib', 'keyword-matcher'));
const { searchRegistry } = require(path.join(PLUGIN_ROOT, 'lib', 'plugin-registry'));

function main() {
  try {
    const input = getInput();
    if (!input || !input.userMessage) {
      writeJson({ systemMessage: '' });
      process.exit(0);
    }

    const message = input.userMessage;

    if (isExplicitSlashCommand(message)) {
      const parts = message.split(/\s+/);
      const skillName = parts[0].substring(1);
      const args = parts.slice(1).join(' ');
      const clippedArgs = args.substring(0, 200);
      const displayedArgs = JSON.stringify(args.substring(0, 100));
      const toolArgs = JSON.stringify(clippedArgs);
      writeJson({
        systemMessage: `OVERRIDE - HIGHEST PRIORITY: The user explicitly invoked the /${skillName} skill command${args ? ` with args: ${displayedArgs}` : ''}. You MUST execute this skill immediately using the Skill tool with skill="${skillName}"${args ? ` and args=${toolArgs}` : ''}. Do NOT call AskUserQuestion. Do NOT ask for confirmation. Do NOT show any other prompt. Just invoke the Skill tool NOW.`,
      });
      process.exit(0);
    }

    if (message.length < 5) {
      writeJson({ systemMessage: '' });
      process.exit(0);
    }

    const customMap = config.customKeywords || null;
    const matches = matchKeywords(message, null, customMap);
    const minScore = config.minMatchScore || 5;

    if (matches.length > 0 && matches[0].score >= minScore) {
      const suggestions = matches.slice(0, 2).map((m) => `/${m.skill}`).join(', ');
      writeJson({
        systemMessage: `Lens detected skill match: ${suggestions} may help with this request. Suggest it naturally if appropriate.`,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          matchType: 'installed',
          matchedSkills: matches.slice(0, 2),
          userMessage: message.substring(0, 50),
        },
      });
      process.exit(0);
    }

    const registryMatches = searchRegistry(message);
    if (registryMatches.length > 0) {
      const pluginNames = registryMatches.map((r) => r.name).join(', ');
      writeJson({
        systemMessage: `Lens: No installed skill matches, but external plugins may help: ${pluginNames}. Suggest them if the user uses /c.`,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          matchType: 'registry',
          suggestedPlugins: registryMatches.map((r) => ({
            name: r.name,
            domain: r.domain,
            description: r.description,
            installCmd: r.installCmd,
          })),
          userMessage: message.substring(0, 50),
        },
      });
      process.exit(0);
    }

    writeJson({ systemMessage: '' });
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

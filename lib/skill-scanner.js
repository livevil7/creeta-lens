/**
 * Creet - Skill Scanner Module
 * Scans installed Claude Code plugins and extracts skill metadata.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGINS_CACHE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cache');

/**
 * Scan all installed plugins and extract skill information.
 * @returns {Array<{name: string, plugin: string, description: string, triggers: string[]}>}
 */
function scanInstalledSkills() {
  const skills = [];

  if (!fs.existsSync(PLUGINS_CACHE_DIR)) {
    return skills;
  }

  // Structure: cache/{org}/{plugin}/{version}/skills/{skill-name}/SKILL.md
  const orgs = safeReadDir(PLUGINS_CACHE_DIR);

  for (const org of orgs) {
    const orgPath = path.join(PLUGINS_CACHE_DIR, org);
    if (!isDir(orgPath)) continue;

    const plugins = safeReadDir(orgPath);
    for (const plugin of plugins) {
      const pluginPath = path.join(orgPath, plugin);
      if (!isDir(pluginPath)) continue;

      const versions = safeReadDir(pluginPath);
      if (versions.length === 0) continue;

      // Use the latest version (last in sorted order)
      const latestVersion = versions.sort().pop();
      const versionPath = path.join(pluginPath, latestVersion);

      // Read plugin manifest
      const pluginName = readPluginName(versionPath) || plugin;

      // Scan skills directory
      const skillsDir = path.join(versionPath, 'skills');
      if (!fs.existsSync(skillsDir)) continue;

      const skillDirs = safeReadDir(skillsDir);
      for (const skillDir of skillDirs) {
        const skillPath = path.join(skillsDir, skillDir, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;

        const skillData = parseSkillFile(skillPath, pluginName);
        if (skillData) {
          skills.push(skillData);
        }
      }
    }
  }

  return skills;
}

/**
 * Parse a SKILL.md file and extract metadata.
 */
function parseSkillFile(filePath, pluginName) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Try YAML frontmatter format first
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      return parseFrontmatter(fmMatch[1], pluginName);
    }

    // Try table format (| name | description | license |)
    const tableRows = content.match(/^\|.*\|$/gm);
    if (tableRows && tableRows.length >= 3) {
      // Skip header (row 0) and separator (row 1), parse data row (row 2+)
      for (const row of tableRows.slice(2)) {
        // Skip separator rows (|------|-----|)
        if (/^\|[\s-|]+\|$/.test(row)) continue;
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 2 && !/^-+$/.test(cells[0])) {
          return {
            name: cells[0],
            plugin: pluginName,
            description: cells[1].substring(0, 80),
            triggers: extractTriggers(content),
            domain: detectDomain(cells[1])
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse YAML frontmatter (simplified, no external deps).
 */
function parseFrontmatter(yaml, pluginName) {
  const name = yamlValue(yaml, 'name');
  const desc = yamlValue(yaml, 'description');
  if (!name) return null;

  return {
    name,
    plugin: pluginName,
    description: (desc || '').substring(0, 80),
    triggers: extractTriggers(desc || ''),
    domain: detectDomain(desc || '')
  };
}

/**
 * Extract a simple YAML value (single line or multi-line).
 */
function yamlValue(yaml, key) {
  // Normalize line endings
  const normalized = yaml.replace(/\r\n/g, '\n');

  // Multi-line block scalar (description: | or description: >)
  const multiMatch = normalized.match(new RegExp(`^${key}:\\s*[|>]\\s*\\n((?:[ \\t]+[^\\n]*\\n?)*)`, 'm'));
  if (multiMatch) {
    return multiMatch[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ');
  }

  // Single-line value
  const match = normalized.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (match) {
    const val = match[1].trim().replace(/^["']|["']$/g, '');
    // Skip if value is just a YAML indicator
    if (val === '|' || val === '>') return null;
    return val;
  }

  return null;
}

/**
 * Extract trigger keywords from description text.
 */
function extractTriggers(text) {
  const triggerMatch = text.match(/Triggers?:\s*(.+?)(?:\n\n|\n[A-Z]|$)/s);
  if (!triggerMatch) return [];

  return triggerMatch[1]
    .split(/[,\n]/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && t.length < 30);
}

/**
 * Auto-detect domain from description.
 */
function detectDomain(desc) {
  const lower = desc.toLowerCase();
  // Order matters: more specific patterns first
  const domainMap = [
    [/sentry|error track|monitoring|logging|metric|tracing/i, 'Monitoring'],
    [/security|vulnerability|owasp|xss|csrf/i, 'Security'],
    [/deploy|ci\/cd|infrastructure|kubernetes|docker/i, 'DevOps'],
    [/mobile|react native|flutter|expo|ios|android/i, 'Mobile'],
    [/desktop|electron|tauri/i, 'Desktop'],
    [/auth|login|signup|jwt|oauth|social login/i, 'Auth'],
    [/database|db |table|crud|query|data model|storage|upload|file.*stor/i, 'Backend'],
    [/backend|api(?!\s*key)|baas|server|bkend/i, 'Backend'],
    [/frontend|ui |component|react|next\.js|design system|css|layout/i, 'Frontend'],
    [/git |commit|branch|pull request|merge|pr review/i, 'Git'],
    [/test|qa |quality|code.?review|analyz|audit/i, 'Quality'],
    [/learn|guide|beginner|tutorial|education|onboarding|quickstart/i, 'Learning'],
    [/pdca|plan|design|pipeline|phase|workflow|development.*pipeline/i, 'Workflow'],
    [/cookbook|template|recipe|troubleshoot/i, 'Guide'],
  ];

  for (const [pattern, domain] of domainMap) {
    if (pattern.test(lower)) return domain;
  }
  return 'General';
}

/**
 * Read plugin name from manifest.
 */
function readPluginName(versionPath) {
  const paths = [
    path.join(versionPath, '.claude-plugin', 'plugin.json'),
    path.join(versionPath, 'plugin.json'),
  ];

  for (const p of paths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return data.name || null;
    } catch {
      continue;
    }
  }
  return null;
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  } catch {
    return [];
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Format skills as a markdown table.
 */
function formatSkillTable(skills) {
  if (skills.length === 0) return 'No plugins detected.';

  const plugins = [...new Set(skills.map(s => s.plugin))];
  let table = `| # | Skill | Plugin | Domain | Description |\n`;
  table += `|---|-------|--------|--------|-------------|\n`;

  skills.forEach((s, i) => {
    table += `| ${i + 1} | /${s.name} | ${s.plugin} | ${s.domain} | ${s.description.substring(0, 50)} |\n`;
  });

  table += `\nTotal: ${skills.length} skills from ${plugins.length} plugins`;
  return table;
}

module.exports = { scanInstalledSkills, formatSkillTable, detectDomain };

/**
 * Lens - Plugin Registry Module
 * Curated list of known Claude Code plugins for discovery when no installed skill matches.
 */

const KNOWN_PLUGINS = [
  // Multi-Agent Orchestration
  {
    name: 'design-council',
    source: 'lens/skills/design-council',
    domain: 'Design',
    description: '설치된 디자인 스킬 에이전트들을 병렬 소환해 협의 후 최적 설계안 도출',
    keywords: ['design council', 'multi-agent design', 'council', 'design debate', '디자인 협의회',
      '에이전트 토론', '설계 협의', '다중 에이전트 디자인', '디자인 토론', '협의',
      'frontend design', 'ui council', 'design team'],
    installCmd: '(pattern example in README — not a built-in skill. See "Building Custom Skills" section)',
  },

  // Documentation
  {
    name: 'superpowers',
    source: 'travisvn/claude-code-superpowers',
    domain: 'Productivity',
    description: 'Brainstorm, write-plan, execute-plan, structured workflows',
    keywords: ['brainstorm', 'plan', 'execute', 'workflow', 'ideation',
      '브레인스토밍', '기획', '아이디어', 'ブレスト', '企画', '头脑风暴', '策划'],
    installCmd: 'claude plugin install travisvn/claude-code-superpowers',
  },

];

/**
 * Search registry for plugins matching a query.
 * @param {string} query - User's request
 * @returns {Array<{name, source, domain, description, installCmd, score}>}
 */
function searchRegistry(query) {
  const lowerQuery = query.toLowerCase();
  const results = [];

  for (const plugin of KNOWN_PLUGINS) {
    let score = 0;
    for (const keyword of plugin.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    // Also check domain and description
    if (lowerQuery.includes(plugin.domain.toLowerCase())) {
      score += 5;
    }
    if (score > 0) {
      results.push({ ...plugin, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Format search results for display.
 */
function formatRegistryResults(results) {
  if (results.length === 0) return null;

  let output = '## Lens — Plugin Discovery\n\n';
  output += 'No installed skill matches, but these plugins might help:\n\n';
  output += '| Plugin | Domain | Description | Install |\n';
  output += '|--------|--------|-------------|--------|\n';

  for (const r of results) {
    output += `| ${r.name} | ${r.domain} | ${r.description} | \`${r.installCmd}\` |\n`;
  }

  return output;
}

module.exports = { searchRegistry, formatRegistryResults, KNOWN_PLUGINS };

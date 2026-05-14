/**
 * Lens - Plugin Registry Module
 * Curated plugin suggestions used when no installed skill matches.
 */

const KNOWN_PLUGINS = [
  {
    name: 'design-council',
    source: {
      type: 'internal-pattern',
      id: 'lens/design-council',
    },
    domain: 'Design',
    description: 'Pattern example for running multiple design-review agents and synthesizing tradeoffs.',
    keywords: [
      'design council',
      'multi-agent design',
      'council',
      'design debate',
      'frontend design',
      'ui council',
      'design team',
    ],
    installCmd: 'Pattern example in README. See "Building Custom Skills with Lens".',
  },
  {
    name: 'superpowers',
    source: {
      type: 'github',
      repo: 'travisvn/claude-code-superpowers',
    },
    domain: 'Productivity',
    description: 'Brainstorm, write-plan, execute-plan, and structured workflow helpers.',
    keywords: ['brainstorm', 'plan', 'execute', 'workflow', 'ideation'],
    installCmd: 'claude plugin install travisvn/claude-code-superpowers',
  },
];

function searchRegistry(query) {
  const lowerQuery = (query || '').toLowerCase();
  const results = [];

  for (const plugin of KNOWN_PLUGINS) {
    let score = 0;
    for (const keyword of plugin.keywords || []) {
      const normalized = String(keyword).toLowerCase();
      if (normalized && lowerQuery.includes(normalized)) {
        score += normalized.length;
      }
    }
    if (lowerQuery.includes(plugin.domain.toLowerCase())) {
      score += 5;
    }
    if (score > 0) {
      results.push({ ...plugin, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

function formatPluginSource(source) {
  if (!source) return '';
  if (typeof source === 'string') return source;
  if (source.type === 'github') return source.repo || '';
  if (source.type === 'marketplace') return source.marketplace || '';
  if (source.type === 'internal-pattern') return source.id || 'internal';
  return source.id || source.repo || source.marketplace || '';
}

function formatRegistryResults(results) {
  if (results.length === 0) return null;

  let output = '## Lens - Plugin Discovery\n\n';
  output += 'No installed skill matches, but these plugins might help:\n\n';
  output += '| Plugin | Domain | Description | Install |\n';
  output += '|--------|--------|-------------|--------|\n';

  for (const r of results) {
    output += `| ${r.name} | ${r.domain} | ${r.description} | \`${r.installCmd}\` |\n`;
  }

  return output;
}

module.exports = {
  searchRegistry,
  formatRegistryResults,
  formatPluginSource,
  KNOWN_PLUGINS,
};
